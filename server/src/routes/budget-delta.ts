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
    res.json(result);
  })
);

// POST /distribute
const AssignmentSchema = z.object({
  accountId: z.string().min(1),
  issueId: z.union([z.string(), z.number()]),
  totalHours: z.number().min(0),
});

const DistributeBody = z.object({
  assignments: z.array(AssignmentSchema),
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

    const { assignments, from, to, seed } = parsed.data;

    // Fetch existing worklogs for the date range
    const existingWorklogs = await tempoClient.getWorklogs({
      projectId: project.project_id,
      from,
      to,
    });

    const result = distributeWorklogs({ assignments, from, to, existingWorklogs, seed });
    res.json(result);
  })
);

// POST /submit
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

        results.push({
          ...entry,
          success: true,
          tempoWorklogId: wl.tempoWorklogId,
        });
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

        results.push({
          ...entry,
          success: false,
          error: errorMessage,
        });
      }
    }

    res.json({ results });
  })
);

export default router;
