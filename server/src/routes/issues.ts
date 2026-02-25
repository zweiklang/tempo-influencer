import { Router } from 'express';
import { getSetting, getSelectedProject } from '../db';
import { decrypt } from '../services/crypto';
import { createJiraClient } from '../services/jiraClient';
import type { RequestHandler } from 'express';

const router = Router();

function tryCatch(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// GET /open — open Jira issues for selected project
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

    const project = getSelectedProject();
    if (!project) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const jiraClient = createJiraClient(
      decrypt(jiraUrlEnc),
      decrypt(jiraEmailEnc),
      decrypt(jiraTokenEnc)
    );

    const jql = `project = "${project.project_id}" AND statusCategory != Done ORDER BY updated DESC`;
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
