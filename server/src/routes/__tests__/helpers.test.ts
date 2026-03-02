import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db and crypto before importing helpers
vi.mock('../../db', () => ({
  getSetting: vi.fn(),
}));
vi.mock('../../services/crypto', () => ({
  decrypt: vi.fn((s: string) => `decrypted:${s}`),
}));
vi.mock('../../services/tempoClient', () => ({
  createTempoClient: vi.fn((token: string) => ({ token, type: 'tempo' })),
}));
vi.mock('../../services/jiraClient', () => ({
  createJiraClient: vi.fn((url: string, email: string, token: string) => ({
    url, email, token, type: 'jira',
  })),
}));

import { getSetting } from '../../db';
import { tryCatch, getTempoClient, getJiraClient } from '../helpers';

const mockGetSetting = vi.mocked(getSetting);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tryCatch', () => {
  it('calls the wrapped function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const handler = tryCatch(fn);
    const req = {} as never;
    const res = {} as never;
    const next = vi.fn();
    await handler(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res);
  });

  it('forwards errors to next', async () => {
    const err = new Error('oops');
    const fn = vi.fn().mockRejectedValue(err);
    const handler = tryCatch(fn);
    const next = vi.fn();
    await handler({} as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('getTempoClient', () => {
  it('returns null when tempo_token not configured', () => {
    mockGetSetting.mockReturnValue(null);
    expect(getTempoClient()).toBeNull();
  });

  it('returns a client when token is configured', () => {
    mockGetSetting.mockReturnValue('enc-token');
    const client = getTempoClient();
    expect(client).not.toBeNull();
  });
});

describe('getJiraClient', () => {
  it('returns null when any credential is missing', () => {
    mockGetSetting.mockReturnValue(null);
    expect(getJiraClient()).toBeNull();
  });

  it('returns null when only some credentials are set', () => {
    mockGetSetting.mockImplementation((key: string) =>
      key === 'jira_url' ? 'enc-url' : null
    );
    expect(getJiraClient()).toBeNull();
  });

  it('returns a client when all credentials are configured', () => {
    mockGetSetting.mockImplementation(() => 'enc-value');
    const client = getJiraClient();
    expect(client).not.toBeNull();
  });
});
