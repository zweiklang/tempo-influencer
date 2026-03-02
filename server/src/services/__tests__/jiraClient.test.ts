import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
  const mockCreate = vi.fn();
  return { default: { create: mockCreate } };
});

import { createJiraClient } from '../jiraClient';

const mockAxios = vi.mocked(axios);

function makeClient(getImpl?: ReturnType<typeof vi.fn>, postImpl?: ReturnType<typeof vi.fn>) {
  const get = getImpl ?? vi.fn().mockResolvedValue({ data: {} });
  const post = postImpl ?? vi.fn().mockResolvedValue({ data: {} });
  (mockAxios.create as ReturnType<typeof vi.fn>).mockReturnValue({ get, post });
  return { client: createJiraClient('https://test.atlassian.net', 'user@test.com', 'token'), get, post };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createJiraClient', () => {
  describe('searchProjects', () => {
    it('calls project/search with query params', async () => {
      const get = vi.fn().mockResolvedValue({ data: { values: [{ id: '1', key: 'PROJ', name: 'Project' }] } });
      const { client } = makeClient(get);
      const result = await client.searchProjects('test');
      expect(get).toHaveBeenCalledWith('project/search', expect.objectContaining({ params: { query: 'test', maxResults: 50 } }));
      expect(result).toHaveLength(1);
    });
  });

  describe('searchIssues', () => {
    it('posts JQL to search/jql endpoint', async () => {
      const post = vi.fn().mockResolvedValue({ data: { issues: [] } });
      const { client } = makeClient(undefined, post);
      await client.searchIssues('project = TEST');
      expect(post).toHaveBeenCalledWith('search/jql', expect.objectContaining({ jql: 'project = TEST' }));
    });
  });

  describe('testConnection', () => {
    it('returns accountId and displayName from /myself', async () => {
      const get = vi.fn().mockResolvedValue({ data: { accountId: 'acc-1', displayName: 'Alice' } });
      const { client } = makeClient(get);
      const result = await client.testConnection();
      expect(result).toEqual({ accountId: 'acc-1', displayName: 'Alice' });
    });
  });
});
