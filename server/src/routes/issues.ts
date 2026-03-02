import { Router } from 'express';
import { z } from 'zod';
import { getSetting, getSelectedProject, getRoleDescription } from '../db';
import { decrypt } from '../services/crypto';
import { suggestRoles } from '../services/geminiClient';
import { buildScopeJQL } from '../services/jiraClient';
import { tryCatch, getTempoClient, getJiraClient } from './helpers';

const router = Router();

// GET /open — open Jira issues scoped to the selected Tempo financial project
router.get(
  '/open',
  tryCatch(async (_req, res) => {
    const jiraClient = getJiraClient();
    if (!jiraClient) {
      res.status(401).json({ error: 'Jira credentials not configured' });
      return;
    }

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo token not configured' });
      return;
    }

    const project = getSelectedProject();
    if (!project || !project.tempo_id) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }
    const projectDetail = await tempoClient.getProject(project.tempo_id);
    const source = projectDetail.scope?.source;

    if (!source) {
      res.status(400).json({ error: 'Could not determine project scope' });
      return;
    }
    const scopeJQL = buildScopeJQL(source.type, source.reference);

    const jql = `${scopeJQL} AND statusCategory != Done ORDER BY updated DESC`;
    const issues = await jiraClient.searchIssues(jql);

    res.json(
      issues.map((i) => ({
        id: i.id,
        key: i.key,
        summary: i.fields.summary,
        statusCategory: i.fields.status?.statusCategory?.name ?? null,
        issueType: i.fields.issuetype?.name ?? null,
        labels: i.fields.labels ?? [],
        parentSummary: i.fields.parent?.fields?.summary ?? null,
      }))
    );
  })
);

// POST /suggest-roles — ask Gemini to assign roles to issues
const SuggestRolesBody = z.object({
  issues: z.array(z.object({
    id: z.number().int(),
    key: z.string(),
    summary: z.string(),
    labels: z.array(z.string()).optional(),
    parentSummary: z.string().nullable().optional(),
  })),
  roleIds: z.array(z.number().int()),
});

router.post(
  '/suggest-roles',
  tryCatch(async (req, res) => {
    const parsed = SuggestRolesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { issues, roleIds } = parsed.data;

    const geminiTokenEnc = getSetting('gemini_token');
    if (!geminiTokenEnc) {
      res.status(401).json({ error: 'Gemini API key not configured' });
      return;
    }
    const geminiApiKey = decrypt(geminiTokenEnc);
    const geminiModel = getSetting('gemini_model') ?? 'gemini-2.0-flash';

    const tempoClient = getTempoClient();
    if (!tempoClient) {
      res.status(401).json({ error: 'Tempo token not configured' });
      return;
    }
    const allRoles = await tempoClient.getRoles();

    const roles = allRoles
      .filter((r) => roleIds.includes(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: getRoleDescription(r.id),
      }));

    const suggestions = await suggestRoles(
      issues.map((i) => ({
        id: i.id,
        key: i.key,
        summary: i.summary,
        labels: i.labels,
        parentSummary: i.parentSummary ?? undefined,
      })),
      roles,
      geminiApiKey,
      geminiModel
    );

    res.json({ suggestions });
  })
);

export default router;
