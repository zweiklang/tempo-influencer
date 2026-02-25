import { Router } from 'express';
import { z } from 'zod';
import { getSetting, getSelectedProject, upsertTeamMemberCache, getAllBillingRateOverrides, setBillingRateOverride } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { createJiraClient } from '../services/jiraClient';
import type { RequestHandler } from 'express';

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
  const jiraUrlEnc = getSetting('jira_url');
  const jiraEmailEnc = getSetting('jira_email');
  const jiraTokenEnc = getSetting('jira_token');
  if (!jiraUrlEnc || !jiraEmailEnc || !jiraTokenEnc) return null;
  return createJiraClient(decrypt(jiraUrlEnc), decrypt(jiraEmailEnc), decrypt(jiraTokenEnc));
}

// GET /teams
router.get(
  '/teams',
  tryCatch(async (_req, res) => {
    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const teams = await tempoClient.getTeams();
    res.json(teams);
  })
);

// GET /teams/:teamId/members
router.get(
  '/teams/:teamId/members',
  tryCatch(async (req, res) => {
    const { teamId } = req.params;

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const rawMembers = await tempoClient.getTeamMembers(teamId);

    // Fetch display names from Jira
    const displayNameMap = new Map<string, string>();
    const jiraClient = getJiraClient();
    if (jiraClient) {
      try {
        const accountIds = rawMembers.map((m) => m.member.accountId);
        const jiraUsers = await jiraClient.getUsersByAccountIds(accountIds);
        jiraUsers.forEach((u) => displayNameMap.set(u.accountId, u.displayName));
      } catch {
        // Fall back to accountId as display name
      }
    }

    // Transform to flat shape expected by the client
    const members = rawMembers.map((m) => ({
      accountId: m.member.accountId,
      displayName: displayNameMap.get(m.member.accountId) ?? m.member.accountId,
      roleId: m.memberships?.active?.role?.id ?? null,
      roleName: m.memberships?.active?.role?.name?.trim() ?? null,
      membershipId: m.memberships?.active?.id ?? null,
    }));

    // Upsert into cache
    for (const m of members) {
      upsertTeamMemberCache({
        account_id: m.accountId,
        display_name: m.displayName,
        email: null,
        role_id: m.roleId,
        role_name: m.roleName,
        team_id: teamId,
        cached_at: new Date().toISOString(),
      });
    }

    res.json(members);
  })
);

// GET /roles
router.get(
  '/roles',
  tryCatch(async (_req, res) => {
    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const roles = await tempoClient.getRoles();
    res.json(roles);
  })
);

// POST /roles
const CreateRoleBody = z.object({
  name: z.string().min(1),
});

router.post(
  '/roles',
  tryCatch(async (req, res) => {
    const parsed = CreateRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const role = await tempoClient.createRole(parsed.data.name);
    res.status(201).json(role);
  })
);

// PUT /team-memberships
const TeamMembershipBody = z.object({
  teamId: z.string().min(1),
  accountId: z.string().min(1),
  roleId: z.number().int(),
  commitmentPercent: z.number().min(0).max(100),
  from: z.string().min(1),
});

router.put(
  '/team-memberships',
  tryCatch(async (req, res) => {
    const parsed = TeamMembershipBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const result = await tempoClient.assignTeamMembership(parsed.data);
    res.json(result);
  })
);

// GET /billing-rates — global rates + overrides merged for selected project
router.get(
  '/billing-rates',
  tryCatch(async (_req, res) => {
    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const project = getSelectedProject();
    const projectId = project?.project_id ?? '';

    const [globalRates, overrides] = await Promise.all([
      tempoClient.getGlobalRates(),
      Promise.resolve(projectId ? getAllBillingRateOverrides(projectId) : []),
    ]);

    res.json({ globalRates, overrides });
  })
);

// PUT /billing-rates/override
const BillingRateOverrideBody = z.object({
  accountId: z.string().min(1),
  billingRate: z.number().min(0),
});

router.put(
  '/billing-rates/override',
  tryCatch(async (req, res) => {
    const parsed = BillingRateOverrideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const project = getSelectedProject();
    if (!project) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    setBillingRateOverride(project.project_id, parsed.data.accountId, parsed.data.billingRate);
    res.json({ success: true });
  })
);

export default router;
