# Tempo Influencer

A locally-run web app for managing Tempo/Jira project budgets and worklogs. Connect your Jira instance and a Tempo financial project, review logged hours with billing rates, and use Budget Delta mode to calculate and post worklogs that hit a target revenue.

## Features

- **Settings** — Store Jira and Tempo API credentials encrypted at rest (AES-256-GCM, SQLite)
- **Worklogs** — View all hours logged against a project in a selected date range, grouped by team member and issue, with billing rates and revenue
- **Team** — Inspect team members, their roles, and billing rate overrides
- **Budget Delta** — 5-step wizard: set a revenue target, pick participating roles, assign issues, preview the hour distribution, and post worklogs that spread work evenly across business days while respecting the 8 h/day cap

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite, Tailwind CSS, shadcn/ui (Radix), TanStack Query, Zustand |
| Backend | Express + TypeScript (`tsx`), better-sqlite3, Zod |
| Auth storage | AES-256-GCM encrypted SQLite |

## Prerequisites

- Node.js ≥ 18 (tested on Node 25; requires better-sqlite3 ≥ 12.6.2)
- A Jira Cloud instance with API token
- A Tempo Cloud account with API token

## Setup

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

On first run, open Settings and enter your Jira URL, Jira email, Jira API token, and Tempo API token. Then select the Tempo financial project you want to work with.

## Production build

```bash
npm run build
npm start
```

## Project structure

```
client/src/
  pages/          # SettingsPage, WorklogsPage, TeamPage, BudgetDeltaPage
  components/ui/  # shadcn/ui components

server/src/
  routes/         # settings, project, team, issues, budget-delta
  services/       # tempoClient, jiraClient, crypto, billingRates,
                  # hourCalculator, worklogDistributor
```
