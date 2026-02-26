import { Router } from 'express';
import { getSetting, getSelectedProject } from '../db';
import { decrypt } from '../services/crypto';
import { createJiraClient } from '../services/jiraClient';
import { createTempoClient } from '../services/tempoClient';
import type { RequestHandler } from 'express';

const router = Router();

function tryCatch(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// GET /open — open Jira issues scoped to the selected Tempo financial project
router.get(
  '/open',
  tryCatch(async (_req, res) => {
    const jiraUrlEnc = getSetting('jira_url');
    const jiraEmailEnc = getSetting('jira_email');
    const jiraTokenEnc = getSetting('jira_token');

    if (!jiraUrlEnc || !jiraEmailEnc || !jiraTokenEnc) {
      res.status(401).json({ error: 'Jira credentials not configured' });
      return;
    }

    const tempoTokenEnc = getSetting('tempo_token');
    if (!tempoTokenEnc) {
      res.status(401).json({ error: 'Tempo token not configured' });
      return;
    }

    const project = getSelectedProject();
    if (!project || !project.tempo_id) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const jiraClient = createJiraClient(
      decrypt(jiraUrlEnc),
      decrypt(jiraEmailEnc),
      decrypt(jiraTokenEnc)
    );

    const tempoClient = createTempoClient(decrypt(tempoTokenEnc));
    const projectDetail = await tempoClient.getProject(project.tempo_id);
    const source = projectDetail.scope?.source;

    let scopeJQL: string;
    if (!source) {
      res.status(400).json({ error: 'Could not determine project scope' });
      return;
    } else if (source.type === 'filter') {
      scopeJQL = `filter = ${source.reference}`;
    } else if (source.type === 'project') {
      scopeJQL = `project = "${source.reference}"`;
    } else if (source.type === 'epic') {
      scopeJQL = `parent = "${source.reference}" OR "Epic Link" = "${source.reference}"`;
    } else {
      // 'jql' or any other type — use reference directly
      scopeJQL = source.reference;
    }

    const jql = `${scopeJQL} AND statusCategory != Done ORDER BY updated DESC`;
    const issues = await jiraClient.searchIssues(jql);

    res.json(
      issues.map((i) => ({
        id: i.id,
        key: i.key,
        summary: i.fields.summary,
      }))
    );
  })
);

export default router;
