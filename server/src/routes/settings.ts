import { Router } from 'express';
import { z } from 'zod';
import { getSetting, setSetting, getSelectedProject, setSelectedProject } from '../db';
import { encrypt, decrypt } from '../services/crypto';
import { createJiraClient } from '../services/jiraClient';
import { createTempoClient } from '../services/tempoClient';
import type { RequestHandler } from 'express';

const router = Router();

// Helper to wrap async handlers
function tryCatch(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// GET /credentials — return credential status + safe pre-fill values
router.get(
  '/credentials',
  tryCatch(async (_req, res) => {
    const jiraUrlEnc = getSetting('jira_url');
    const jiraEmailEnc = getSetting('jira_email');
    const jiraToken = getSetting('jira_token');
    const tempoToken = getSetting('tempo_token');
    const tokenSavedAt = getSetting('token_saved_at');

    const configured = !!(jiraUrlEnc && jiraEmailEnc && jiraToken && tempoToken);

    res.json({
      configured,
      jiraUrl: jiraUrlEnc ? decrypt(jiraUrlEnc) : undefined,
      jiraEmail: jiraEmailEnc ? decrypt(jiraEmailEnc) : undefined,
      jiraTokenSavedAt: tokenSavedAt ?? undefined,
      tempoTokenSavedAt: tokenSavedAt ?? undefined,
    });
  })
);

const CredentialsBody = z.object({
  jiraUrl: z.string().url(),
  jiraEmail: z.string().email(),
  jiraToken: z.string().min(1),
  tempoToken: z.string().min(1),
});

// PUT /credentials — validate and store credentials
router.put(
  '/credentials',
  tryCatch(async (req, res) => {
    const parsed = CredentialsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { jiraUrl, jiraEmail, jiraToken, tempoToken } = parsed.data;

    // Test Jira connection
    const jiraClient = createJiraClient(jiraUrl, jiraEmail, jiraToken);
    const jiraOk = await jiraClient.validateConnection();
    if (!jiraOk) {
      res.status(400).json({ error: 'Jira connection failed. Check URL, email and token.' });
      return;
    }

    // Test Tempo connection
    try {
      const tempoClient = createTempoClient(tempoToken);
      await tempoClient.getTeams();
    } catch {
      res.status(400).json({ error: 'Tempo connection failed. Check token.' });
      return;
    }

    // Encrypt and store
    setSetting('jira_url', encrypt(jiraUrl));
    setSetting('jira_email', encrypt(jiraEmail));
    setSetting('jira_token', encrypt(jiraToken));
    setSetting('tempo_token', encrypt(tempoToken));
    setSetting('token_saved_at', new Date().toISOString());

    res.json({ success: true });
  })
);

// GET /project — return selected project (camelCase for frontend)
router.get(
  '/project',
  tryCatch(async (_req, res) => {
    const project = getSelectedProject();
    if (!project) { res.json(null); return; }
    res.json({
      projectId: project.project_id,
      projectName: project.project_name,
      tempoId: project.tempo_id,
    });
  })
);

const ProjectBody = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  tempoId: z.string().optional(),
});

// PUT /project — set selected project
router.put(
  '/project',
  tryCatch(async (req, res) => {
    const parsed = ProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { projectId, projectName, tempoId } = parsed.data;
    setSelectedProject({ project_id: projectId, project_name: projectName, tempo_id: tempoId });
    res.json({ success: true });
  })
);

// GET /projects — list all Tempo financial projects
router.get(
  '/projects',
  tryCatch(async (_req, res) => {
    const tempoTokenEnc = getSetting('tempo_token');
    if (!tempoTokenEnc) {
      res.status(401).json({ error: 'Tempo credentials not configured' });
      return;
    }

    const tempoClient = createTempoClient(decrypt(tempoTokenEnc));
    const projects = await tempoClient.getFinancialProjects();
    res.json(projects.map((p) => ({ id: p.id, name: p.name, status: p.status })));
  })
);

export default router;
