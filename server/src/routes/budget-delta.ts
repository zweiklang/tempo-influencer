import { Router } from 'express';
import { z } from 'zod';
import { getSetting, getSelectedProject, insertWorklogAudit } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { calculateHours } from '../services/hourCalculator';
import { distributeWorklogs } from '../services/worklogDistributor';
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

function snapToHalf(value: number): number {
  return Math.round(value / 0.5) * 0.5;
}

// POST /calculate
const RoleSchema = z.object({
  roleId: z.union([z.string(), z.number()]),
  roleName: z.string(),
  billingRate: z.number().min(0),
  memberCount: z.number().int().min(0),
});

const CalculateBody = z.object({
  targetRevenue: z.number(),
  currentRevenue: z.number(),
  roles: z.array(RoleSchema),
  from: z.string().optional(),
  to: z.string().optional(),
});

router.post(
  '/calculate',
  tryCatch(async (req, res) => {
    const parsed = CalculateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const result = calculateHours(parsed.data);
    res.json({
      breakdown: result.roles.map(r => ({ ...r, roleId: Number(r.roleId) })),
      totalDeltaRevenue: result.totalDeltaRevenue,
      achievedRevenue: result.achievedRevenue,
    });
  })
);

// POST /distribute — issue-centric model with complexity weighting
const IssueConfigSchema = z.object({
  issueId: z.number(),
  issueKey: z.string(),
  issueName: z.string(),
  roleIds: z.array(z.number()),
  complexity: z.number().min(1).max(10),
});

const RoleConfigSchema = z.object({
  roleId: z.number(),
  roleName: z.string(),
  billingRate: z.number(),
  accountIds: z.array(z.string()),
});

const HourBreakdownSchema = z.object({
  roleId: z.number(),
  hoursPerMember: z.number(),
  totalHours: z.number(),
});

const DistributeBody = z.object({
  issueConfigs: z.array(IssueConfigSchema),
  roleConfigs: z.array(RoleConfigSchema),
  hourBreakdown: z.array(HourBreakdownSchema),
  memberNames: z.record(z.string()),
  from: z.string().min(1),
  to: z.string().min(1),
  seed: z.number().optional(),
});

router.post(
  '/distribute',
  tryCatch(async (req, res) => {
    const parsed = DistributeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
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

    const { issueConfigs, roleConfigs, hourBreakdown, memberNames, from, to, seed } = parsed.data;

    // Build flat assignments + track roleId per (accountId, issueId)
    const assignments: Array<{ accountId: string; issueId: number; totalHours: number }> = [];
    const roleIdMap = new Map<string, number>(); // "accountId:issueId" → roleId

    for (const roleConfig of roleConfigs) {
      const { roleId, accountIds } = roleConfig;
      const breakdown = hourBreakdown.find(h => h.roleId === roleId);
      if (!breakdown || breakdown.totalHours === 0) continue;

      const roleIssues = issueConfigs.filter(ic => ic.roleIds.includes(roleId));
      if (roleIssues.length === 0) continue;

      const totalWeight = roleIssues.reduce((sum, ic) => sum + ic.complexity, 0);

      for (const issue of roleIssues) {
        const issueRoleHours = breakdown.totalHours * (issue.complexity / totalWeight);
        const memberCount = accountIds.length || 1;
        const perMemberHours = snapToHalf(issueRoleHours / memberCount);
        if (perMemberHours === 0) continue;

        for (const accountId of accountIds) {
          assignments.push({ accountId, issueId: issue.issueId, totalHours: perMemberHours });
          roleIdMap.set(`${accountId}:${issue.issueId}`, roleId);
        }
      }
    }

    // Fetch existing worklogs for the period (best-effort — ignore errors)
    let existingWorklogs: Awaited<ReturnType<typeof tempoClient.getWorklogs>> = [];
    try {
      existingWorklogs = await tempoClient.getWorklogs({
        projectId: project.project_id,
        from,
        to,
      });
    } catch {
      // Fall back to empty — distributor will assume full daily capacity
    }

    const { schedule: rawSchedule } = distributeWorklogs({ assignments, from, to, existingWorklogs, seed });

    // Enrich schedule entries
    const issueConfigMap = new Map(issueConfigs.map(ic => [ic.issueId, ic]));
    const schedule = rawSchedule.map(entry => ({
      accountId: entry.accountId,
      displayName: memberNames[entry.accountId] ?? entry.accountId,
      issueId: entry.issueId as number,
      issueKey: issueConfigMap.get(entry.issueId as number)?.issueKey ?? '',
      issueName: issueConfigMap.get(entry.issueId as number)?.issueName ?? '',
      roleId: roleIdMap.get(`${entry.accountId}:${entry.issueId}`) ?? 0,
      startDate: entry.date,
      hours: entry.hours,
      overflow: entry.overflow,
    }));

    res.json({ schedule });
  })
);

// POST /submit-worklog (single entry)
const SubmitWorklogBody = z.object({
  accountId: z.string().min(1),
  issueId: z.union([z.string(), z.number()]),
  startDate: z.string().min(1),
  hours: z.number().min(0),
});

router.post(
  '/submit-worklog',
  tryCatch(async (req, res) => {
    const parsed = SubmitWorklogBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const { accountId, issueId, startDate, hours } = parsed.data;
    const timeSpentSeconds = Math.round(hours * 3600);

    const wl = await tempoClient.createWorklog({
      issueId,
      authorAccountId: accountId,
      startDate,
      startTime: '09:00:00',
      timeSpentSeconds,
      billableSeconds: timeSpentSeconds,
    });

    insertWorklogAudit({
      tempo_worklog_id: wl.tempoWorklogId,
      account_id: accountId,
      issue_id: String(issueId),
      start_date: startDate,
      hours,
      operation: 'create',
      status: 'success',
    });

    res.json({ success: true, tempoWorklogId: wl.tempoWorklogId });
  })
);

// POST /submit (bulk — kept for backward compatibility)
const SubmitEntrySchema = z.object({
  accountId: z.string().min(1),
  issueId: z.union([z.string(), z.number()]),
  date: z.string().min(1),
  hours: z.number().min(0),
});

const SubmitBody = z.object({
  schedule: z.array(SubmitEntrySchema),
});

router.post(
  '/submit',
  tryCatch(async (req, res) => {
    const parsed = SubmitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const results = [];

    for (const entry of parsed.data.schedule) {
      try {
        const timeSpentSeconds = Math.round(entry.hours * 3600);
        const wl = await tempoClient.createWorklog({
          issueId: entry.issueId,
          authorAccountId: entry.accountId,
          startDate: entry.date,
          startTime: '09:00:00',
          timeSpentSeconds,
          billableSeconds: timeSpentSeconds,
        });

        insertWorklogAudit({
          tempo_worklog_id: wl.tempoWorklogId,
          account_id: entry.accountId,
          issue_id: String(entry.issueId),
          start_date: entry.date,
          hours: entry.hours,
          operation: 'create',
          status: 'success',
        });

        results.push({ ...entry, success: true, tempoWorklogId: wl.tempoWorklogId });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        insertWorklogAudit({
          account_id: entry.accountId,
          issue_id: String(entry.issueId),
          start_date: entry.date,
          hours: entry.hours,
          operation: 'create',
          status: 'error',
          error_message: errorMessage,
        });

        results.push({ ...entry, success: false, error: errorMessage });
      }
    }

    res.json({ results });
  })
);

export default router;
