import { Router } from 'express';
import { getSetting, getSelectedProject } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { resolveRatesForMembers } from '../services/billingRates';
import { getTeamMemberCache } from '../db';
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

    const worklogs = await tempoClient.getWorklogs({
      projectId: project.project_id,
      from,
      to,
    });

    // Resolve billing rates for all unique authors
    const uniqueMembers = Array.from(
      new Map(worklogs.map((wl) => [wl.author.accountId, wl.author.accountId])).values()
    ).map((accountId) => {
      const cached = getTeamMemberCache(accountId);
      return { accountId, roleId: cached?.role_id ?? null };
    });

    const ratesMap = await resolveRatesForMembers(project.project_id, uniqueMembers, tempoClient);

    const enriched = worklogs.map((wl) => {
      const resolved = ratesMap.get(wl.author.accountId) ?? { rate: 0, source: 'none' as const };
      const hours = wl.timeSpentSeconds / 3600;
      return {
        ...wl,
        rate: resolved.rate,
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

    const worklogs = await tempoClient.getWorklogs({
      projectId: project.project_id,
      from,
      to,
    });

    const uniqueMembers = Array.from(
      new Map(worklogs.map((wl) => [wl.author.accountId, wl.author.accountId])).values()
    ).map((accountId) => {
      const cached = getTeamMemberCache(accountId);
      return { accountId, roleId: cached?.role_id ?? null };
    });

    const ratesMap = await resolveRatesForMembers(project.project_id, uniqueMembers, tempoClient);

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
