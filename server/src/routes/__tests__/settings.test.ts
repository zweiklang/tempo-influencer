import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getSelectedProject: vi.fn(),
  setSelectedProject: vi.fn(),
}));

vi.mock('../../services/crypto', () => ({
  encrypt: vi.fn((s: string) => s + '-enc'),
  decrypt: vi.fn((s: string) => s.replace('-enc', '')),
}));

vi.mock('../../services/tempoClient', () => ({
  createTempoClient: vi.fn(),
}));

vi.mock('../../services/jiraClient', () => ({
  createJiraClient: vi.fn(),
}));

vi.mock('../../services/geminiClient', () => ({
  getAvailableModels: vi.fn(),
}));

vi.mock('../helpers', () => ({
  tryCatch: (fn: Parameters<typeof express.Router>[0]) => fn,
}));

import { getSetting, getSelectedProject, setSetting, setSelectedProject } from '../../db';
import { createTempoClient } from '../../services/tempoClient';
import { createJiraClient } from '../../services/jiraClient';
import { getAvailableModels } from '../../services/geminiClient';
import settingsRouter from '../settings';

const mockGetSetting = vi.mocked(getSetting);
const mockGetSelectedProject = vi.mocked(getSelectedProject);
const mockCreateTempoClient = vi.mocked(createTempoClient);
const mockCreateJiraClient = vi.mocked(createJiraClient);
const mockGetAvailableModels = vi.mocked(getAvailableModels);
const mockSetSetting = vi.mocked(setSetting);
const mockSetSelectedProject = vi.mocked(setSelectedProject);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', settingsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSetting.mockReturnValue(null);
});

describe('GET /credentials', () => {
  it('returns configured=false when no credentials stored', async () => {
    const res = await request(makeApp()).get('/credentials');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('returns configured=true and decrypted values when all set', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        jira_url: 'https://test.atlassian.net-enc',
        jira_email: 'user@test.com-enc',
        jira_token: 'token-enc',
        tempo_token: 'tempo-enc',
        token_saved_at: '2025-01-01T00:00:00.000Z',
      };
      return map[key] ?? null;
    });

    const res = await request(makeApp()).get('/credentials');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.jiraUrl).toBe('https://test.atlassian.net');
  });
});

describe('PUT /credentials', () => {
  it('returns 400 on invalid body', async () => {
    const res = await request(makeApp()).put('/credentials').send({ jiraUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when Jira connection fails', async () => {
    mockCreateJiraClient.mockReturnValue({ validateConnection: vi.fn().mockResolvedValue(false) } as unknown as ReturnType<typeof createJiraClient>);
    const res = await request(makeApp()).put('/credentials').send({
      jiraUrl: 'https://test.atlassian.net',
      jiraEmail: 'user@test.com',
      jiraToken: 'token',
      tempoToken: 'tempo',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Jira/);
  });

  it('saves credentials when both connections succeed', async () => {
    mockCreateJiraClient.mockReturnValue({ validateConnection: vi.fn().mockResolvedValue(true) } as unknown as ReturnType<typeof createJiraClient>);
    mockCreateTempoClient.mockReturnValue({ getTeams: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof createTempoClient>);
    const res = await request(makeApp()).put('/credentials').send({
      jiraUrl: 'https://test.atlassian.net',
      jiraEmail: 'user@test.com',
      jiraToken: 'token',
      tempoToken: 'tempo',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSetSetting).toHaveBeenCalledWith('jira_url', expect.any(String));
  });
});

describe('GET /project', () => {
  it('returns null when no project selected', async () => {
    mockGetSelectedProject.mockReturnValue(null);
    const res = await request(makeApp()).get('/project');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns project in camelCase', async () => {
    mockGetSelectedProject.mockReturnValue({ project_id: 'p1', project_name: 'Proj', tempo_id: 't1' });
    const res = await request(makeApp()).get('/project');
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe('p1');
    expect(res.body.projectName).toBe('Proj');
  });
});

describe('PUT /project', () => {
  it('returns 400 on missing required fields', async () => {
    const res = await request(makeApp()).put('/project').send({});
    expect(res.status).toBe(400);
  });

  it('sets selected project and returns success', async () => {
    const res = await request(makeApp()).put('/project').send({
      projectId: 'p1',
      projectName: 'My Project',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSetSelectedProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p1' }));
  });
});

describe('GET /gemini', () => {
  it('returns configured=false when no key stored', async () => {
    const res = await request(makeApp()).get('/gemini');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });
});

describe('GET /gemini/models', () => {
  it('returns 401 when key not configured', async () => {
    const res = await request(makeApp()).get('/gemini/models');
    expect(res.status).toBe(401);
  });

  it('returns sorted model list', async () => {
    mockGetSetting.mockReturnValue('key-enc');
    mockGetAvailableModels.mockResolvedValue([
      { id: 'gemini-2.0-flash', displayName: 'Z Flash' },
      { id: 'gemini-1.5-pro', displayName: 'A Pro' },
    ]);
    const res = await request(makeApp()).get('/gemini/models');
    expect(res.status).toBe(200);
    expect(res.body[0].displayName).toBe('A Pro');
  });
});
