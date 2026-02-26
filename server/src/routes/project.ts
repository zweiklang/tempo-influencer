import { Router } from 'express';
import { getSetting, getSelectedProject, getTeamMemberCache } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { createJiraClient } from '../services/jiraClient';
import { resolveRatesForMembers } from '../services/billingRates';
import type { RequestHandler } from 'express';
import type { TempoWorklog } from '../types/tempo';
import type { TempoClient } from '../services/tempoClient';
import type { JiraClient } from '../services/jiraClient';
import type { SelectedProject } from '../types/db';

const router = Router();

function tryCatch(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function getTempoClient() {
  const tempoTokenEnc = getSetting('tempo_token');
  if (!tempoTokenEnc) return null;
  return createTempoClient(decrypt(tempoTokenEnc));
}

function getJiraClient() {
  const urlEnc = getSetting('jira_url');
  const emailEnc = getSetting('jira_email');
  const tokenEnc = getSetting('jira_token');
  if (!urlEnc || !emailEnc || !tokenEnc) return null;
  return createJiraClient(decrypt(urlEnc), decrypt(emailEnc), decrypt(tokenEnc));
}


async function fetchScopedWorklogs(
  project: SelectedProject,
  tempoClient: TempoClient,
  jiraClient: JiraClient | null,
  from: string,
  to: string,
): Promise<TempoWorklog[]> {
  let scopeIssueIds: Set<number> | null = null;
  if (project.tempo_id && jiraClient) {
    try {
      const projectDetail = await tempoClient.getProject(project.tempo_id);
      const scope = projectDetail.scope?.source;
      if (scope?.type && scope?.reference) {
        scopeIssueIds = await jiraClient.getIssueIdsByScope(scope.type, scope.reference);
      }
    } catch {
      // fall through — no scope filtering if API fails
    }
  }

  const allWorklogs = await tempoClient.getWorklogs({ from, to });

  if (scopeIssueIds && scopeIssueIds.size > 0) {
    return allWorklogs.filter((wl) => wl.issue?.id != null && scopeIssueIds!.has(wl.issue.id));
  }
  return allWorklogs;
}

// GET /budget
router.get(
  '/budget',
  tryCatch(async (_req, res) => {
    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const project = getSelectedProject();
    if (!project?.tempo_id) {
      res.status(400).json({ error: 'No project selected or project has no Tempo ID' });
      return;
    }

    const budget = await tempoClient.getProjectBudget(project.tempo_id);
    res.json(budget);
  })
);

// GET /worklogs?from=&to=
router.get(
  '/worklogs',
  tryCatch(async (req, res) => {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required' });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const project = getSelectedProject();
    if (!project) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    // Fetch project defaultBillingRate for rate cascade
    let projectDefaultRate: number | null = null;
    if (project.tempo_id) {
      try {
        const detail = await tempoClient.getProject(project.tempo_id);
        projectDefaultRate = detail.defaultBillingRate?.value || null;
      } catch {
        // fall through
      }
    }

    const jiraClient = getJiraClient();
    const worklogs = await fetchScopedWorklogs(project, tempoClient, jiraClient, from, to);

    // Resolve display names for members not in team cache
    const jiraUserMap = new Map<string, string>();
    if (jiraClient) {
      const uncachedIds = [...new Set(worklogs.map((wl) => wl.author.accountId))]
        .filter((id) => !getTeamMemberCache(id));
      for (let i = 0; i < uncachedIds.length; i += 50) {
        const chunk = uncachedIds.slice(i, i + 50);
        try {
          const users = await jiraClient.getUsersByAccountIds(chunk);
          for (const u of users) jiraUserMap.set(u.accountId, u.displayName);
        } catch {
          // fall through — accountId fallback still applies
        }
      }
    }

    // Resolve billing rates for all unique authors
    const uniqueMembers = Array.from(
      new Map(worklogs.map((wl) => [wl.author.accountId, wl.author.accountId])).values()
    ).map((accountId) => {
      const cached = getTeamMemberCache(accountId);
      return { accountId, roleId: cached?.role_id ?? null };
    });

    const ratesMap = await resolveRatesForMembers(project.project_id, uniqueMembers, tempoClient, projectDefaultRate);

    // Batch-fetch issue keys from Jira (Tempo only returns numeric issue IDs)
    const uniqueIssueIds = [...new Set(worklogs.map((wl) => wl.issue?.id).filter((id): id is number => id != null))];
    const issueMap = jiraClient ? await jiraClient.getIssuesByIds(uniqueIssueIds) : new Map<number, { key: string; summary: string }>();

    const enriched = worklogs.map((wl) => {
      const resolved = ratesMap.get(wl.author.accountId) ?? { rate: 0, source: 'none' as const };
      const cached = getTeamMemberCache(wl.author.accountId);
      const issueInfo = wl.issue?.id != null ? issueMap.get(wl.issue.id) : undefined;
      const hours = wl.timeSpentSeconds / 3600;
      return {
        accountId: wl.author.accountId,
        displayName: cached?.display_name ?? jiraUserMap.get(wl.author.accountId) ?? wl.author.accountId,
        role: cached?.role_name ?? undefined,
        issueKey: issueInfo?.key,
        issueSummary: issueInfo?.summary,
        startDate: wl.startDate,
        hours,
        billingRate: resolved.rate,
        rateSource: resolved.source,
        revenue: hours * resolved.rate,
      };
    });

    res.json(enriched);
  })
);

// GET /revenue?from=&to=
router.get(
  '/revenue',
  tryCatch(async (req, res) => {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required' });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const project = getSelectedProject();
    if (!project) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    // Fetch project defaultBillingRate for rate cascade
    let projectDefaultRate: number | null = null;
    if (project.tempo_id) {
      try {
        const detail = await tempoClient.getProject(project.tempo_id);
        projectDefaultRate = detail.defaultBillingRate?.value || null;
      } catch {
        // fall through
      }
    }

    const jiraClient = getJiraClient();
    const worklogs = await fetchScopedWorklogs(project, tempoClient, jiraClient, from, to);

    const uniqueMembers = Array.from(
      new Map(worklogs.map((wl) => [wl.author.accountId, wl.author.accountId])).values()
    ).map((accountId) => {
      const cached = getTeamMemberCache(accountId);
      return { accountId, roleId: cached?.role_id ?? null };
    });

    const ratesMap = await resolveRatesForMembers(project.project_id, uniqueMembers, tempoClient, projectDefaultRate);

    let totalHours = 0;
    let totalRevenue = 0;

    for (const wl of worklogs) {
      const hours = wl.timeSpentSeconds / 3600;
      const resolved = ratesMap.get(wl.author.accountId) ?? { rate: 0, source: 'none' as const };
      totalHours += hours;
      totalRevenue += hours * resolved.rate;
    }

    res.json({ totalHours, totalRevenue });
  })
);

export default router;
