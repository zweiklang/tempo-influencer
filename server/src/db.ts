import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type {
  SelectedProject,
  BillingRateOverride,
  TeamMemberCache,
  WorklogAuditInsert,
} from './types/db';

// initDb is called from index.ts; actual initialization happens at module load time
export function initDb(): void {
  // No-op: SQLite DB is initialized when this module is first imported.
  // This function exists for explicit call-site documentation in index.ts.
}

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tempo-influencer.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run all migration files in order
const migrationsDir = path.resolve(__dirname, 'migrations');
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  db.exec(sql);
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ---- Selected Project ----

export function getSelectedProject(): SelectedProject | null {
  const row = db
    .prepare('SELECT project_id, project_name, tempo_id FROM selected_project WHERE id = 1')
    .get() as SelectedProject | undefined;
  return row ?? null;
}

export function setSelectedProject(p: SelectedProject): void {
  db.prepare(
    `INSERT INTO selected_project (id, project_id, project_name, tempo_id)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id   = excluded.project_id,
       project_name = excluded.project_name,
       tempo_id     = excluded.tempo_id`
  ).run(p.project_id, p.project_name, p.tempo_id ?? null);
}

// ---- Billing Rate Overrides ----

export function getBillingRateOverride(projectId: string, accountId: string): number | null {
  const row = db
    .prepare(
      'SELECT billing_rate FROM billing_rate_overrides WHERE project_id = ? AND account_id = ?'
    )
    .get(projectId, accountId) as { billing_rate: number } | undefined;
  return row?.billing_rate ?? null;
}

export function setBillingRateOverride(
  projectId: string,
  accountId: string,
  rate: number
): void {
  db.prepare(
    `INSERT INTO billing_rate_overrides (project_id, account_id, billing_rate, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, account_id) DO UPDATE SET
       billing_rate = excluded.billing_rate,
       updated_at   = excluded.updated_at`
  ).run(projectId, accountId, rate);
}

export function getAllBillingRateOverrides(projectId: string): BillingRateOverride[] {
  return db
    .prepare('SELECT * FROM billing_rate_overrides WHERE project_id = ?')
    .all(projectId) as BillingRateOverride[];
}

// Alias to match spec naming convention
export const upsertBillingRateOverride = setBillingRateOverride;

// ---- Team Member Cache ----

export function upsertTeamMemberCache(member: TeamMemberCache): void {
  db.prepare(
    `INSERT INTO team_member_cache
       (account_id, display_name, email, role_id, role_name, team_id, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET
       display_name = excluded.display_name,
       email        = excluded.email,
       role_id      = excluded.role_id,
       role_name    = excluded.role_name,
       team_id      = excluded.team_id,
       cached_at    = excluded.cached_at`
  ).run(
    member.account_id,
    member.display_name,
    member.email ?? null,
    member.role_id ?? null,
    member.role_name ?? null,
    member.team_id ?? null
  );
}

export function getTeamMemberCache(accountId: string): TeamMemberCache | null {
  const row = db
    .prepare('SELECT * FROM team_member_cache WHERE account_id = ?')
    .get(accountId) as TeamMemberCache | undefined;
  return row ?? null;
}

// Returns all cached team member account IDs (used to filter worklogs to project team)
export function getCachedTeamMemberIds(): Set<string> {
  const rows = db
    .prepare('SELECT account_id FROM team_member_cache')
    .all() as { account_id: string }[];
  return new Set(rows.map((r) => r.account_id));
}

// Returns the team_id from the first cached team member (used as worklog filter)
export function getCachedTeamId(): number | null {
  const row = db
    .prepare('SELECT team_id FROM team_member_cache WHERE team_id IS NOT NULL LIMIT 1')
    .get() as { team_id: string } | undefined;
  return row?.team_id ? Number(row.team_id) : null;
}

// ---- Role Descriptions ----

export function getRoleDescription(roleId: number): string {
  const row = db
    .prepare('SELECT description FROM role_descriptions WHERE role_id = ?')
    .get(roleId) as { description: string } | undefined;
  return row?.description ?? '';
}

export function setRoleDescriptions(descriptions: Record<number, string>): void {
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO role_descriptions (role_id, description) VALUES (?, ?)'
  );
  const transaction = db.transaction((entries: [number, string][]) => {
    for (const [roleId, description] of entries) {
      upsert.run(roleId, description);
    }
  });
  transaction(Object.entries(descriptions).map(([k, v]) => [Number(k), v]));
}

// ---- Worklog Audit ----

export function insertWorklogAudit(entry: WorklogAuditInsert): void {
  db.prepare(
    `INSERT INTO worklog_audit
       (tempo_worklog_id, account_id, issue_id, start_date, hours, operation, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.tempo_worklog_id ?? null,
    entry.account_id,
    entry.issue_id,
    entry.start_date,
    entry.hours,
    entry.operation,
    entry.status,
    entry.error_message ?? null
  );
}
