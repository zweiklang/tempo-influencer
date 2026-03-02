import { getSetting } from '../db';
import { decrypt } from '../services/crypto';
import { createTempoClient } from '../services/tempoClient';
import { createJiraClient } from '../services/jiraClient';
import type { Request, Response, RequestHandler } from 'express';

export function tryCatch(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function getTempoClient() {
  const tempoTokenEnc = getSetting('tempo_token');
  if (!tempoTokenEnc) return null;
  return createTempoClient(decrypt(tempoTokenEnc));
}

export function getJiraClient() {
  const jiraUrlEnc = getSetting('jira_url');
  const jiraEmailEnc = getSetting('jira_email');
  const jiraTokenEnc = getSetting('jira_token');
  if (!jiraUrlEnc || !jiraEmailEnc || !jiraTokenEnc) return null;
  return createJiraClient(decrypt(jiraUrlEnc), decrypt(jiraEmailEnc), decrypt(jiraTokenEnc));
}

export function getGeminiApiKey(): string | null {
  const enc = getSetting('gemini_token');
  if (!enc) return null;
  return decrypt(enc);
}
