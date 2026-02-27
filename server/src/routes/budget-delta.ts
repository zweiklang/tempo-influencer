import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { getSetting, getSelectedProject, insertWorklogAudit } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { createJiraClient } from '../services/jiraClient';
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

function getJiraClient() {
  const jiraUrlEnc = getSetting('jira_url');
  const jiraEmailEnc = getSetting('jira_email');
  const jiraTokenEnc = getSetting('jira_token');
  if (!jiraUrlEnc || !jiraEmailEnc || !jiraTokenEnc) return null;
  return createJiraClient(decrypt(jiraUrlEnc), decrypt(jiraEmailEnc), decrypt(jiraTokenEnc));
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
  targetRevenue: z.number().optional(),
  currentRevenue: z.number().optional(),
  roleHourLimits: z.array(z.object({
    roleId: z.number(),
    maxHours: z.number().positive(),
  })).optional(),
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

    const { issueConfigs, roleConfigs, hourBreakdown: passedBreakdown, memberNames, from, to, seed, targetRevenue, currentRevenue, roleHourLimits } = parsed.data;

    // Determine which roles actually have issues assigned
    const assignedRoleIds = new Set(issueConfigs.flatMap(ic => ic.roleIds));
    const activeRoleConfigs = roleConfigs.filter(r => assignedRoleIds.has(r.roleId));

    // If target/current revenue are provided, recalculate hours using only active roles
    // so the distribution aims to cover the full delta with whatever roles are in play.
    let effectiveBreakdown: Array<{ roleId: number; hoursPerMember: number; totalHours: number }>;
    if (targetRevenue != null && currentRevenue != null && activeRoleConfigs.length > 0) {
      const result = calculateHours({
        targetRevenue,
        currentRevenue,
        roles: activeRoleConfigs.map(r => ({
          roleId: r.roleId,
          roleName: r.roleName,
          billingRate: r.billingRate,
          memberCount: r.accountIds.length || 1,
        })),
      });
      effectiveBreakdown = result.roles.map(r => ({
        roleId: Number(r.roleId),
        hoursPerMember: r.hoursPerMember,
        totalHours: r.totalHours,
      }));
    } else {
      effectiveBreakdown = passedBreakdown.filter(h => assignedRoleIds.has(h.roleId));
    }

    // Apply per-role hour caps and redistribute lost revenue to uncapped roles
    if (roleHourLimits && roleHourLimits.length > 0) {
      const bindingLimits = roleHourLimits.filter(l => {
        const h = effectiveBreakdown.find(b => b.roleId === l.roleId);
        return h && h.totalHours > l.maxHours;
      });

      if (bindingLimits.length > 0) {
        const cappedRoleIds = new Set(bindingLimits.map(l => l.roleId));
        let lostRevenue = 0;

        effectiveBreakdown = effectiveBreakdown.map(h => {
          const limit = bindingLimits.find(l => l.roleId === h.roleId);
          if (!limit) return h;
          const rc = roleConfigs.find(r => r.roleId === h.roleId);
          const billingRate = rc?.billingRate ?? 0;
          const memberCount = rc?.accountIds.length || 1;
          lostRevenue += (h.totalHours - limit.maxHours) * billingRate;
          return {
            ...h,
            totalHours: limit.maxHours,
            hoursPerMember: snapToHalf(limit.maxHours / memberCount),
          };
        });

        // Redistribute lost revenue proportionally to uncapped active roles
        const uncappedRoles = activeRoleConfigs.filter(r => !cappedRoleIds.has(r.roleId));
        if (lostRevenue > 0 && uncappedRoles.length > 0) {
          const extra = calculateHours({
            targetRevenue: lostRevenue,
            currentRevenue: 0,
            roles: uncappedRoles.map(r => ({
              roleId: r.roleId,
              roleName: r.roleName,
              billingRate: r.billingRate,
              memberCount: r.accountIds.length || 1,
            })),
          });
          effectiveBreakdown = effectiveBreakdown.map(h => {
            if (cappedRoleIds.has(h.roleId)) return h;
            const extraRole = extra.roles.find(r => Number(r.roleId) === h.roleId);
            if (!extraRole || extraRole.totalHours === 0) return h;
            const memberCount = roleConfigs.find(r => r.roleId === h.roleId)?.accountIds.length || 1;
            const newTotal = h.totalHours + extraRole.totalHours;
            return {
              ...h,
              totalHours: newTotal,
              hoursPerMember: snapToHalf(newTotal / memberCount),
            };
          });
        }
      }
    }

    // Build flat assignments + track roleId per (accountId, issueId)
    const assignments: Array<{ accountId: string; issueId: number; totalHours: number }> = [];
    const roleIdMap = new Map<string, number>(); // "accountId:issueId" → roleId

    for (const roleConfig of roleConfigs) {
      const { roleId, accountIds } = roleConfig;
      const breakdown = effectiveBreakdown.find(h => h.roleId === roleId);
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

    // Fetch existing worklogs for the period, scoped to the distributed issues only.
    // Using projectId here is wrong — project.project_id is a Tempo financial UUID, not a
    // numeric Jira project ID, so Tempo ignores it and returns ALL worklogs for all users,
    // filling the capacity map with unrelated project work.
    let existingWorklogs: Awaited<ReturnType<typeof tempoClient.getWorklogs>> = [];
    try {
      const assignedIssueIds = new Set(issueConfigs.map(ic => Number(ic.issueId)));
      const allWorklogs = await tempoClient.getWorklogs({ from, to });
      existingWorklogs = allWorklogs.filter(
        wl => wl.issue?.id != null && assignedIssueIds.has(wl.issue.id)
      );
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

    try {
      const wl = await tempoClient.createWorklog({
        issueId,
        authorAccountId: accountId,
        startDate,
        startTime: '09:00:00',
        timeSpentSeconds,
        billableSeconds: timeSpentSeconds,
      });

      insertWorklogAudit({ tempo_worklog_id: wl.tempoWorklogId, account_id: accountId, issue_id: String(issueId), start_date: startDate, hours, operation: 'create', status: 'success' });
      res.json({ success: true, tempoWorklogId: wl.tempoWorklogId, via: 'tempo' });

    } catch (tempoErr: unknown) {
      const isForbidden = axios.isAxiosError(tempoErr) && tempoErr.response?.status === 403;

      if (isForbidden) {
        console.warn(`[Tempo 403] accountId=${accountId} issueId=${issueId}`, JSON.stringify(axios.isAxiosError(tempoErr) ? tempoErr.response?.data : null));
      }

      if (!isForbidden) {
        const errorMessage = tempoErr instanceof Error ? tempoErr.message : String(tempoErr);
        insertWorklogAudit({ account_id: accountId, issue_id: String(issueId), start_date: startDate, hours, operation: 'create', status: 'error', error_message: errorMessage });
        throw tempoErr; // let tryCatch handle it
      }

      // 403 from Tempo — try Jira fallback
      const jiraClient = getJiraClient();
      if (!jiraClient) {
        res.status(403).json({ error: 'Tempo returned 403 and Jira credentials are not configured' });
        return;
      }

      try {
        await jiraClient.createWorklog(issueId, timeSpentSeconds, startDate, accountId);
        insertWorklogAudit({ account_id: accountId, issue_id: String(issueId), start_date: startDate, hours, operation: 'create', status: 'success', error_message: 'created via Jira fallback (Tempo 403)' });
        res.json({ success: true, via: 'jira' });

      } catch (jiraErr: unknown) {
        const errorMessage = `Tempo 403; Jira fallback also failed: ${jiraErr instanceof Error ? jiraErr.message : String(jiraErr)}`;
        insertWorklogAudit({ account_id: accountId, issue_id: String(issueId), start_date: startDate, hours, operation: 'create', status: 'error', error_message: errorMessage });
        res.status(502).json({ error: errorMessage });
      }
    }
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
