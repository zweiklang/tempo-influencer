import axios, { AxiosInstance } from 'axios';
import type { JiraProject, JiraIssue, JiraUser } from '../types/jira';

export function createJiraClient(baseUrl: string, email: string, token: string) {
  const credentials = Buffer.from(`${email}:${token}`).toString('base64');

  const client: AxiosInstance = axios.create({
    baseURL: `${baseUrl.replace(/\/$/, '')}/rest/api/3/`,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  return {
    async searchProjects(query: string): Promise<JiraProject[]> {
      const res = await client.get<{ values: JiraProject[] }>('project/search', {
        params: { query, maxResults: 50 },
      });
      return res.data.values;
    },

    async searchIssues(jql: string): Promise<JiraIssue[]> {
      const res = await client.post<{ issues: JiraIssue[] }>('search/jql', {
        jql,
        maxResults: 200,
        fields: ['summary', 'status', 'assignee'],
      });
      return res.data.issues;
    },

    async validateConnection(): Promise<boolean> {
      try {
        await client.get<JiraUser>('myself');
        return true;
      } catch {
        return false;
      }
    },

    async testConnection(): Promise<{ accountId: string; displayName: string }> {
      const res = await client.get<JiraUser>('myself');
      return {
        accountId: res.data.accountId,
        displayName: res.data.displayName,
      };
    },

    async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
      const res = await client.get<JiraIssue>(`issue/${issueIdOrKey}`, {
        params: { fields: 'summary,status,assignee,issuetype' },
      });
      return res.data;
    },

    async getIssuesByIds(ids: number[]): Promise<Map<number, { key: string; summary: string }>> {
      if (ids.length === 0) return new Map();
      const result = new Map<number, { key: string; summary: string }>();
      // Jira search supports up to 200 results; chunk if needed
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const jql = `id in (${chunk.join(',')})`;
        try {
          const res = await client.post<{ issues: JiraIssue[] }>('search/jql', {
            jql,
            maxResults: chunkSize,
            fields: ['summary'],
          });
          for (const issue of res.data.issues) {
            result.set(Number(issue.id), { key: issue.key, summary: issue.fields.summary });
          }
        } catch {
          // skip on error
        }
      }
      return result;
    },

    async getProjectByKey(key: string): Promise<JiraProject | null> {
      try {
        const res = await client.get<JiraProject>(`project/${key}`);
        return res.data;
      } catch {
        return null;
      }
    },

    async getUsersByAccountIds(accountIds: string[]): Promise<JiraUser[]> {
      if (accountIds.length === 0) return [];
      const params = new URLSearchParams();
      accountIds.forEach((id) => params.append('accountId', id));
      params.set('maxResults', '50');
      const res = await client.get<{ values: JiraUser[] }>(`user/bulk?${params.toString()}`);
      return res.data.values;
    },

    async getIssueIdsByScope(scopeType: string, reference: string): Promise<Set<number>> {
      let jql: string;
      switch (scopeType) {
        case 'filter':  jql = `filter = ${reference}`; break;
        case 'project': jql = `project = "${reference}"`; break;
        case 'epic':    jql = `parent = "${reference}" OR "Epic Link" = "${reference}"`; break;
        default:        jql = reference; // 'jql' type: use reference directly
      }
      const ids = new Set<number>();
      let nextPageToken: string | undefined;
      while (true) {
        const body: Record<string, unknown> = { jql, maxResults: 200 };
        if (nextPageToken) body.nextPageToken = nextPageToken;
        const res = await client.post<{ issues: { id: string }[]; nextPageToken?: string }>('search/jql', body);
        for (const issue of res.data.issues) ids.add(Number(issue.id));
        nextPageToken = res.data.nextPageToken;
        if (!nextPageToken || res.data.issues.length < 200) break;
      }
      return ids;
    },
  };
}

export type JiraClient = ReturnType<typeof createJiraClient>;
