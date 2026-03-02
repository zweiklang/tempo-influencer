import { Router } from 'express';
import { getSelectedProject, getTeamMemberCache } from '../db';
import { resolveRatesForMembers } from '../services/billingRates';
import { tryCatch, getTempoClient, getJiraClient } from './helpers';
import { SECONDS_PER_HOUR } from '../lib/math';
import type { TempoWorklog } from '../types/tempo';
import type { TempoClient } from '../services/tempoClient';
import type { JiraClient } from '../services/jiraClient';
import type { SelectedProject } from '../types/db';

const router = Router();

type RatesMap = Map<string, { rate: number; source: string }>;

interface EnrichedPipelineResult {
  worklogs: TempoWorklog[];
  ratesMap: RatesMap;
  jiraUserMap: Map<string, string>;
  issueMap: Map<number, { key: string; summary: string }>;
  jiraClient: JiraClient | null;
}

async function runEnrichedPipeline(
  project: SelectedProject,
  tempoClient: TempoClient,
  from: string,
  to: string,
  { onProgress }: { onProgress?: (stage: string, message: string, progress: number) => void } = {},
): Promise<EnrichedPipelineResult> {
  let projectDefaultRate: number | null = null;
  if (project.tempo_id) {
    try {
      const detail = await tempoClient.getProject(project.tempo_id);
      projectDefaultRate = detail.defaultBillingRate?.value || null;
    } catch (err) {
      console.warn('Failed to fetch project default billing rate:', err);
    }
  }

  const jiraClient = getJiraClient();

  onProgress?.('worklogs', 'Fetching worklogs from Tempo...', 45);
  const worklogs = await fetchScopedWorklogs(project, tempoClient, jiraClient, from, to);

  onProgress?.('members', 'Resolving team members...', 60);
  const jiraUserMap = await buildJiraUserMap(worklogs, jiraClient);

  onProgress?.('rates', 'Resolving billing rates...', 75);
  const uniqueMembers = Array.from(
    new Map(worklogs.map((wl) => [wl.author.accountId, wl.author.accountId])).values()
  ).map((accountId) => {
    const cached = getTeamMemberCache(accountId);
    return { accountId, roleId: cached?.role_id ?? null };
  });
  const ratesMap = await resolveRatesForMembers(project.project_id, uniqueMembers, tempoClient, projectDefaultRate);

  onProgress?.('issues', 'Fetching issue details from Jira...', 90);
  const uniqueIssueIds = [...new Set(worklogs.map((wl) => wl.issue?.id).filter((id): id is number => id != null))];
  const issueMap = jiraClient
    ? await jiraClient.getIssuesByIds(uniqueIssueIds)
    : new Map<number, { key: string; summary: string }>();

  return { worklogs, ratesMap, jiraUserMap, issueMap, jiraClient };
}

function enrichWorklogs(
  worklogs: TempoWorklog[],
  ratesMap: RatesMap,
  jiraUserMap: Map<string, string>,
  issueMap: Map<number, { key: string; summary: string }>
) {
  return worklogs.map((wl) => {
    const resolved = ratesMap.get(wl.author.accountId) ?? { rate: 0, source: 'none' as const };
    const cached = getTeamMemberCache(wl.author.accountId);
    const issueInfo = wl.issue?.id != null ? issueMap.get(wl.issue.id) : undefined;
    const hours = wl.timeSpentSeconds / SECONDS_PER_HOUR;
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
}

async function buildJiraUserMap(
  worklogs: TempoWorklog[],
  jiraClient: JiraClient | null
): Promise<Map<string, string>> {
  const jiraUserMap = new Map<string, string>();
  if (!jiraClient) return jiraUserMap;
  const uncachedIds = [...new Set(worklogs.map((wl) => wl.author.accountId))]
    .filter((id) => !getTeamMemberCache(id));
  for (let i = 0; i < uncachedIds.length; i += 50) {
    const chunk = uncachedIds.slice(i, i + 50);
    try {
      const users = await jiraClient.getUsersByAccountIds(chunk);
      for (const u of users) jiraUserMap.set(u.accountId, u.displayName);
    } catch (err) {
      console.warn('Failed to fetch Jira users for chunk, falling back to accountId:', err);
    }
  }
  return jiraUserMap;
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
    } catch (err) {
      console.warn('Failed to fetch project scope, skipping scope filter:', err);
    }
  }

  const allWorklogs = await tempoClient.getWorklogs({ from, to });

  if (scopeIssueIds && scopeIssueIds.size > 0) {
    return allWorklogs.filter((wl) => wl.issue?.id != null && scopeIssueIds.has(wl.issue.id));
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

// GET /worklogs/stream?from=&to=  (SSE)
// Cannot use tryCatch helper: SSE requires headers to be flushed before async work begins,
// after which any error must be surfaced as an SSE event rather than an HTTP status change.
// Errors after flushHeaders are handled inside run() via emit({ stage: 'error', ... }).
router.get('/worklogs/stream', (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');

  if (!from || !to) {
    res.status(400).json({ error: 'from and to query params required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function emit(payload: object) {
    res.write('data: ' + JSON.stringify(payload) + '\n\n');
  }

  async function run() {
    try {
      emit({ stage: 'setup', message: 'Checking project configuration...', progress: 10 });

      const tempoClient = getTempoClient();
      if (!tempoClient) {
        emit({ stage: 'error', message: 'Tempo credentials not configured' });
        res.end();
        return;
      }

      const project = getSelectedProject();
      if (!project) {
        emit({ stage: 'error', message: 'No project selected' });
        res.end();
        return;
      }

      emit({ stage: 'scope', message: 'Determining project scope...', progress: 25 });

      const { worklogs, ratesMap, jiraUserMap, issueMap } = await runEnrichedPipeline(
        project, tempoClient, from, to,
        { onProgress: (stage, message, progress) => emit({ stage, message, progress }) },
      );

      const enriched = enrichWorklogs(worklogs, ratesMap, jiraUserMap, issueMap);

      emit({ stage: 'complete', data: enriched, progress: 100 });
      res.end();
    } catch (err: unknown) {
      emit({ stage: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      res.end();
    }
  }

  run();
});

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

    const { worklogs, ratesMap, jiraUserMap, issueMap } = await runEnrichedPipeline(project, tempoClient, from, to);
    const enriched = enrichWorklogs(worklogs, ratesMap, jiraUserMap, issueMap);
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

    const { worklogs, ratesMap } = await runEnrichedPipeline(project, tempoClient, from, to);

    let totalHours = 0;
    let totalRevenue = 0;

    for (const wl of worklogs) {
      const hours = wl.timeSpentSeconds / SECONDS_PER_HOUR;
      const resolved = ratesMap.get(wl.author.accountId) ?? { rate: 0, source: 'none' as const };
      totalHours += hours;
      totalRevenue += hours * resolved.rate;
    }

    res.json({ totalHours, totalRevenue });
  })
);

export default router;
