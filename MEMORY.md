# Project Memory: tempo-influencer

## Project Context
Working directory: `/Users/marc.wegmann/CodingProjects/pmo/tempo-influencer`

## Research: Tempo API Capabilities
See `tempo-api-research.md` for full details. Key findings:

- Worklogs: pull by team (`teamId`) or member (`accountId`) via `GET /4/worklogs`
- Create worklogs for any employee via `POST /4/worklogs` with `authorAccountId`
- Custom team roles (Service Designer, PM, etc.): `POST /4/roles` + assign via `POST /4/team-memberships`
- Billing rates: global/role-level via API confirmed; per-member per-project overrides likely UI-only
