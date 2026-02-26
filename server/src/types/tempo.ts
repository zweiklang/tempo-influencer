export interface TempoWorklogAuthor {
  accountId: string;
  displayName: string;
}

export interface TempoWorklogIssue {
  id: number;
  key: string;
  summary?: string;
}

export interface TempoWorklog {
  tempoWorklogId: number;
  issueId?: number;
  author: TempoWorklogAuthor;
  timeSpentSeconds: number;
  billableSeconds: number;
  startDate: string;
  startTime?: string;
  issue: TempoWorklogIssue;
  description?: string;
}

export interface TempoMetadata {
  count: number;
  offset: number;
  limit: number;
  next?: string;
}

export interface TempoWorklogs {
  results: TempoWorklog[];
  metadata: TempoMetadata;
}

export interface TempoTeamLead {
  accountId: string;
  displayName?: string;
}

export interface TempoTeam {
  id: string;
  name: string;
  summary?: string;
  lead?: TempoTeamLead;
}

export interface TempoTeamMemberActiveMembership {
  id: number;
  commitmentPercent: number;
  from: string | null;
  to: string | null;
  role: { id: number; name: string };
}

export interface TempoTeamMember {
  member: { accountId: string };
  memberships: {
    active: TempoTeamMemberActiveMembership;
  };
}

export interface TempoRole {
  id: number;
  name: string;
  default?: boolean;
}

export interface TempoGlobalRateAccount {
  id: string;
  type: string;
}

export interface TempoGlobalRate {
  id: number;
  account: TempoGlobalRateAccount;
  rate: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
}

export interface TempoBillingRate {
  id: number;
  rate: number;
  currency?: string;
}

export interface TempoProject {
  id: string;
  name: string;
  key: string;
}

export interface TempoFinancialProject {
  id: string;
  name: string;
  status: string;
}

export interface CreateWorklogBody {
  issueId: number | string;
  authorAccountId: string;
  startDate: string;
  startTime?: string;
  timeSpentSeconds: number;
  billableSeconds?: number;
  description?: string;
}

export interface TeamMembershipBody {
  teamId: string;
  accountId: string;
  roleId: number;
  commitmentPercent: number;
  from: string;
}

export interface TempoProjectScopeSource {
  reference: string;
  title?: string;
  type: string;
  url?: string;
}

export interface TempoProjectDetail {
  id: string;
  name: string;
  status: string;
  scope?: {
    source: TempoProjectScopeSource;
  };
}
