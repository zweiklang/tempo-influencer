-- Key-value store for credentials (values are AES-256-GCM encrypted)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Single selected project
CREATE TABLE IF NOT EXISTS selected_project (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  project_id   TEXT NOT NULL,
  project_name TEXT NOT NULL,
  tempo_id     TEXT
);

-- Per-member billing rate overrides
CREATE TABLE IF NOT EXISTS billing_rate_overrides (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  billing_rate REAL NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, account_id)
);

-- Team member cache
CREATE TABLE IF NOT EXISTS team_member_cache (
  account_id   TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email        TEXT,
  role_id      INTEGER,
  role_name    TEXT,
  team_id      TEXT,
  cached_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log of worklog write operations
CREATE TABLE IF NOT EXISTS worklog_audit (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tempo_worklog_id INTEGER,
  account_id       TEXT NOT NULL,
  issue_id         TEXT NOT NULL,
  start_date       TEXT NOT NULL,
  hours            REAL NOT NULL,
  operation        TEXT NOT NULL,
  status           TEXT NOT NULL,
  error_message    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
