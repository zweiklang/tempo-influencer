import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({
  getSetting: vi.fn(),
  getSelectedProject: vi.fn(),
  getRoleDescription: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/crypto', () => ({
  decrypt: vi.fn((s: string) => s + '-decrypted'),
}));

vi.mock('../../services/geminiClient', () => ({
  suggestRoles: vi.fn(),
}));

vi.mock('../helpers', () => ({
  tryCatch: (fn: Parameters<typeof express.Router>[0]) => fn,
  getTempoClient: vi.fn(),
  getJiraClient: vi.fn(),
}));

import { getSetting, getSelectedProject } from '../../db';
import { suggestRoles } from '../../services/geminiClient';
import { getTempoClient, getJiraClient } from '../helpers';
import issuesRouter from '../issues';

const mockGetSetting = vi.mocked(getSetting);
const mockGetSelectedProject = vi.mocked(getSelectedProject);
const mockSuggestRoles = vi.mocked(suggestRoles);
const mockGetTempoClient = vi.mocked(getTempoClient);
const mockGetJiraClient = vi.mocked(getJiraClient);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', issuesRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /open', () => {
  it('returns 401 when Jira credentials not configured', async () => {
    mockGetJiraClient.mockReturnValue(null);
    const res = await request(makeApp()).get('/open');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Jira credentials/);
  });

  it('returns 401 when Tempo token not configured', async () => {
    mockGetJiraClient.mockReturnValue({ searchIssues: vi.fn() } as unknown as ReturnType<typeof getJiraClient>);
    mockGetTempoClient.mockReturnValue(null);
    const res = await request(makeApp()).get('/open');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Tempo/);
  });

  it('returns 400 when no project selected', async () => {
    mockGetJiraClient.mockReturnValue({ searchIssues: vi.fn() } as unknown as ReturnType<typeof getJiraClient>);
    mockGetTempoClient.mockReturnValue({ getProject: vi.fn(), getRoles: vi.fn() } as unknown as ReturnType<typeof getTempoClient>);
    mockGetSelectedProject.mockReturnValue(null);
    const res = await request(makeApp()).get('/open');
    expect(res.status).toBe(400);
  });

  it('returns mapped issues for project scope type', async () => {
    const mockGetProject = vi.fn().mockResolvedValue({
      scope: { source: { type: 'project', reference: 'PROJ-1' } },
    });
    const mockSearchIssues = vi.fn().mockResolvedValue([
      { id: 1, key: 'PROJ-1', fields: { summary: 'Test issue', status: null, issuetype: null, labels: [], parent: null } },
    ]);
    mockGetJiraClient.mockReturnValue({ searchIssues: mockSearchIssues } as unknown as ReturnType<typeof getJiraClient>);
    mockGetTempoClient.mockReturnValue({ getProject: mockGetProject, getRoles: vi.fn() } as unknown as ReturnType<typeof getTempoClient>);
    mockGetSelectedProject.mockReturnValue({ tempo_id: 'tempo-1', project_id: 'p1', project_name: 'P1', jira_project_key: null, tempoId: null });

    const res = await request(makeApp()).get('/open');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].key).toBe('PROJ-1');
  });
});

describe('POST /suggest-roles', () => {
  it('returns 400 on invalid body', async () => {
    mockGetSetting.mockReturnValue('enc-token');
    const res = await request(makeApp()).post('/suggest-roles').send({ issues: 'not-array' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when Gemini key not configured', async () => {
    mockGetSetting.mockReturnValue(null);
    const res = await request(makeApp()).post('/suggest-roles').send({ issues: [], roleIds: [] });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Gemini/);
  });

  it('returns 401 when Tempo not configured', async () => {
    mockGetSetting.mockReturnValue('enc-token');
    mockGetTempoClient.mockReturnValue(null);
    const res = await request(makeApp()).post('/suggest-roles').send({ issues: [], roleIds: [] });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Tempo/);
  });

  it('returns suggestions from Gemini', async () => {
    mockGetSetting.mockReturnValue('enc-token');
    mockGetTempoClient.mockReturnValue({
      getRoles: vi.fn().mockResolvedValue([{ id: 1, name: 'Frontend Dev' }]),
    } as unknown as ReturnType<typeof getTempoClient>);
    mockSuggestRoles.mockResolvedValue([{ issueId: 10, roleIds: [1] }]);

    const res = await request(makeApp()).post('/suggest-roles').send({
      issues: [{ id: 10, key: 'PROJ-10', summary: 'Build login' }],
      roleIds: [1],
    });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([{ issueId: 10, roleIds: [1] }]);
  });
});
