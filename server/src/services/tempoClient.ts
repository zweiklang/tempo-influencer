import axios, { AxiosInstance } from 'axios';
import type {
  TempoWorklog,
  TempoWorklogs,
  TempoTeam,
  TempoTeamMember,
  TempoRole,
  TempoGlobalRate,
  TempoFinancialProject,
  TempoProjectDetail,
  CreateWorklogBody,
  TeamMembershipBody,
} from '../types/tempo';

const TEMPO_BASE_URL = 'https://api.tempo.io/4/';

async function paginate<T>(
  fetcher: (offset: number) => Promise<{ results: T[]; metadata: { next?: string; count: number; limit: number } }>
): Promise<T[]> {
  const allResults: T[] = [];
  let offset = 0;
  const limit = 5000;

  while (true) {
    const page = await fetcher(offset);
    allResults.push(...page.results);

    if (
      page.results.length === 0 ||
      page.results.length < page.metadata.limit ||
      !page.metadata.next
    ) {
      break;
    }

    offset += page.metadata.limit;
  }

  return allResults;
}

export function createTempoClient(token: string) {
  const client: AxiosInstance = axios.create({
    baseURL: TEMPO_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    async getWorklogs(params: {
      projectId?: string | number;
      teamId?: number;
      accountId?: string;
      from: string;
      to: string;
    }): Promise<TempoWorklog[]> {
      return paginate<TempoWorklog>(async (offset) => {
        const queryParams: Record<string, string | number> = {
          from: params.from,
          to: params.to,
          limit: 5000,
          offset,
        };
        if (params.projectId) queryParams.projectId = params.projectId;
        if (params.teamId) queryParams.teamId = params.teamId;
        if (params.accountId) queryParams.accountId = params.accountId;

        const res = await client.get<TempoWorklogs>('worklogs', { params: queryParams });
        return res.data;
      });
    },

    async createWorklog(body: CreateWorklogBody): Promise<TempoWorklog> {
      const res = await client.post<TempoWorklog>('worklogs', body);
      return res.data;
    },

    async updateWorklog(id: number, body: CreateWorklogBody): Promise<TempoWorklog> {
      const res = await client.put<TempoWorklog>(`worklogs/${id}`, body);
      return res.data;
    },

    async getTeams(): Promise<TempoTeam[]> {
      const res = await client.get<{ results: TempoTeam[]; metadata: { count: number; limit: number; next?: string } }>('teams', {
        params: { limit: 5000 },
      });
      return res.data.results;
    },

    async getTeamMembers(teamId: string): Promise<TempoTeamMember[]> {
      return paginate<TempoTeamMember>(async (offset) => {
        const res = await client.get<{ results: TempoTeamMember[]; metadata: { count: number; limit: number; next?: string } }>(
          `teams/${teamId}/members`,
          { params: { limit: 5000, offset } }
        );
        return res.data;
      });
    },

    async getRoles(): Promise<TempoRole[]> {
      const res = await client.get<{ results: TempoRole[]; metadata: { count: number; limit: number; next?: string } }>('roles', {
        params: { limit: 5000 },
      });
      return res.data.results;
    },

    async createRole(name: string): Promise<TempoRole> {
      const res = await client.post<TempoRole>('roles', { name });
      return res.data;
    },

    async assignTeamMembership(body: TeamMembershipBody): Promise<unknown> {
      const res = await client.post('team-memberships', body);
      return res.data;
    },

    async getGlobalRates(): Promise<TempoGlobalRate[]> {
      const res = await client.get<{ results: TempoGlobalRate[]; metadata: { count: number; limit: number; next?: string } }>(
        'global-configuration/billing-rates',
        { params: { limit: 5000 } }
      );
      return res.data.results;
    },

    async getFinancialProjects(): Promise<TempoFinancialProject[]> {
      return paginate<TempoFinancialProject>(async (offset) => {
        const res = await client.get<{ results: TempoFinancialProject[]; metadata: { count: number; limit: number; next?: string } }>(
          'projects',
          { params: { limit: 5000, offset } }
        );
        return res.data;
      });
    },

    async getProject(projectId: string): Promise<TempoProjectDetail> {
      const res = await client.get<TempoProjectDetail>(`projects/${projectId}`);
      return res.data;
    },

    async getProjectBudget(projectId: string): Promise<unknown> {
      const res = await client.get(`projects/${projectId}/budget`);
      return res.data;
    },
  };
}

export type TempoClient = ReturnType<typeof createTempoClient>;
