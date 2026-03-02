import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
  const mockCreate = vi.fn();
  return { default: { create: mockCreate } };
});

import { createTempoClient } from '../tempoClient';

const mockAxios = vi.mocked(axios);

function makeClient(responses: object[]) {
  let call = 0;
  const get = vi.fn().mockImplementation(() => Promise.resolve({ data: responses[call++] }));
  const post = vi.fn().mockResolvedValue({ data: {} });
  const put = vi.fn().mockResolvedValue({ data: {} });
  (mockAxios.create as ReturnType<typeof vi.fn>).mockReturnValue({ get, post, put });
  return { client: createTempoClient('test-token'), get, post, put };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTempoClient', () => {
  describe('getWorklogs (pagination)', () => {
    it('returns results from a single page', async () => {
      const { client, get } = makeClient([
        { results: [{ tempoWorklogId: 1 }, { tempoWorklogId: 2 }], metadata: { count: 2, limit: 5000, offset: 0 } },
      ]);
      const worklogs = await client.getWorklogs({ from: '2025-01-01', to: '2025-01-31' });
      expect(worklogs).toHaveLength(2);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('paginates until empty results are returned', async () => {
      const { client, get } = makeClient([
        { results: Array(5000).fill({ tempoWorklogId: 1 }), metadata: { count: 10000, limit: 5000, offset: 0, next: 'next-url' } },
        { results: Array(100).fill({ tempoWorklogId: 2 }), metadata: { count: 10000, limit: 5000, offset: 5000 } },
      ]);
      const worklogs = await client.getWorklogs({ from: '2025-01-01', to: '2025-01-31' });
      expect(worklogs).toHaveLength(5100);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('stops when results fewer than limit (no next)', async () => {
      const { client, get } = makeClient([
        { results: [{ tempoWorklogId: 1 }], metadata: { count: 1, limit: 5000, offset: 0 } },
      ]);
      const worklogs = await client.getWorklogs({ from: '2025-01-01', to: '2025-01-31' });
      expect(worklogs).toHaveLength(1);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('includes projectId filter when provided', async () => {
      const { client, get } = makeClient([
        { results: [], metadata: { count: 0, limit: 5000, offset: 0 } },
      ]);
      await client.getWorklogs({ from: '2025-01-01', to: '2025-01-31', projectId: 'abc' });
      expect(get).toHaveBeenCalledWith('worklogs', expect.objectContaining({
        params: expect.objectContaining({ projectId: 'abc' }),
      }));
    });
  });

  describe('createWorklog', () => {
    it('posts to worklogs endpoint', async () => {
      const { client, post } = makeClient([]);
      const body = { issueId: 1, authorAccountId: 'user1', startDate: '2025-01-01', timeSpentSeconds: 3600 };
      await client.createWorklog(body);
      expect(post).toHaveBeenCalledWith('worklogs', body);
    });
  });

  describe('updateWorklog', () => {
    it('puts to specific worklog endpoint', async () => {
      const { client, put } = makeClient([]);
      const body = { issueId: 1, authorAccountId: 'user1', startDate: '2025-01-01', timeSpentSeconds: 3600 };
      await client.updateWorklog(42, body);
      expect(put).toHaveBeenCalledWith('worklogs/42', body);
    });
  });
});
