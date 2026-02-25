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
      const res = await client.get<{ issues: JiraIssue[] }>('search', {
        params: {
          jql,
          maxResults: 200,
          fields: 'summary,status,assignee',
        },
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
  };
}

export type JiraClient = ReturnType<typeof createJiraClient>;
