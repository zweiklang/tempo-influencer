# Tempo API Research Findings

Research date: 2026-02-25
Source: https://apidocs.tempo.io/

---

## 1. Pulling Logged Hours (Worklogs)

**Endpoint:** `GET https://api.tempo.io/4/worklogs`

Key filter parameters:
| Parameter | Description |
|-----------|-------------|
| `teamId` | Filter by team |
| `accountId` | Filter by specific user/employee |
| `projectId` | Filter by Jira project |
| `issueId` | Filter by Jira issue |
| `from` / `to` | Date range (required) |
| `limit` / `offset` | Pagination (max 5,000 per call) |

---

## 2. Creating and Updating Worklog Entries

### Create: `POST /4/worklogs`
| Field | Notes |
|-------|-------|
| `issueId` | Jira issue ID (v4 uses ID, not key) |
| `timeSpentSeconds` | Total time in seconds |
| `billableSeconds` | Billable time (can differ) |
| `startDate` | Date of work |
| `startTime` | Start time |
| `authorAccountId` | Atlassian account ID — log on behalf of any employee |
| `attributes` | Optional custom work attributes |

### Update: `PUT /4/worklogs/{id}`
Same fields as POST. Use the Tempo worklog ID.

### Jira native API (avoid when using Tempo)
`PUT /rest/api/3/issue/{issueIdOrKey}/worklog/{id}` exists but can cause desync with Tempo's worklog store. Stick to Tempo API.

---

## 3. Team Roles (Service Designer, Project Manager, etc.)

Custom team roles (not permission roles).

### Create a role: `POST /4/roles`
```json
{ "name": "Service Designer" }
```

### Assign role to team member: `POST /4/team-memberships`
```json
{
  "teamId": 24,
  "accountId": "557058:...",
  "roleId": 6,
  "commitmentPercent": 100,
  "from": "2024-01-01"
}
```

In Financial Manager, roles drive rates: each role has an assigned cost/billing rate applied automatically when members log hours.

---

## 4. Billing Rates & Cost Rates

### Confirmed API endpoints:
| Endpoint | Description |
|----------|-------------|
| `GET/POST/PUT/DELETE /4/billing-rates-table` | Manage global billing rate tables |
| `GET /4/global-rates` | Read global rates (per role, company-wide) |
| `GET /4/projects/{id}/cost` | Read project cost data (read-only) |
| `GET /4/projects/{id}/budget` | Read project budget |

### Per-project, per-member rate overrides (Flexible Rates)
**Status: Likely UI-only in Financial Manager**

- UI supports per-member overrides with effective dates
- No API example or documented endpoint found for this
- All help docs for flexible rates show UI-only workflows
- Financial Manager API docs page (apidocs.tempo.io/cost-tracker/) redirects — unclear what's available

### Recommended API approach for rates:
Set rates at the role level (global rates per role) → assign members to roles via `POST /4/team-memberships` → Financial Manager applies role rate automatically.

---

## Authentication
- OAuth 2.0 (Bearer token)
- Machine-to-machine tokens expire after 60 days — build renewal into any integration

## Key URLs
- API base: `https://api.tempo.io/4/`
- Docs: https://apidocs.tempo.io/
- Financial Manager help: https://help.tempo.io/financialmanager/latest/
