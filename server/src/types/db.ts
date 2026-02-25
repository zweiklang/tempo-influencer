export interface SelectedProject {
  project_id: string;
  project_name: string;
  tempo_id?: string | null;
}

export interface BillingRateOverride {
  id: number;
  project_id: string;
  account_id: string;
  billing_rate: number;
  updated_at: string;
}

export interface TeamMemberCache {
  account_id: string;
  display_name: string;
  email?: string | null;
  role_id?: number | null;
  role_name?: string | null;
  team_id?: string | null;
  cached_at: string;
}

export interface WorklogAuditInsert {
  tempo_worklog_id?: number | null;
  account_id: string;
  issue_id: string;
  start_date: string;
  hours: number;
  operation: string;
  status: string;
  error_message?: string | null;
}

// Alias to match spec naming
export type WorklogAuditEntry = WorklogAuditInsert;
