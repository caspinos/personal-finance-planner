# Personal Finance Planner

[![CI](https://github.com/caspinos/personal-finance-planner/actions/workflows/ci.yml/badge.svg)](https://github.com/caspinos/personal-finance-planner/actions/workflows/ci.yml)

A web app for household finances: envelope-style budgeting and net worth /
investment tracking, with data shared across household members.

Built with Angular (standalone components, signals) on top of Supabase
(Postgres, Auth, Row-Level Security). Financial data is modeled around event-based
records — transactions are recorded as individual dated operations and net-worth
accounts get dated valuation snapshots — and balances and positions are derived
dynamically from that history rather than stored, so derived values stay
consistent by construction.

## Features

- **Household budget (envelopes)** — allocate income into envelopes, record
  expenses/income, transfer between envelopes, and see balances carry over
  month to month.
- **Net worth & investments** — track accounts (bank, investment, cash, real
  estate, vehicles, precious metals, other assets, liabilities), record dated
  valuations, and manage per-instrument holdings (buy/sell transactions) with
  derived positions (quantity, average cost, unrealized gain).
- **Multi-tenant households** — every record belongs to a household; access
  is controlled by `owner` / `editor` / `viewer` roles enforced through
  Postgres RLS policies, not application code.
- **Multi-currency by design** — the data model supports transactional
  currencies, a base currency, and historical exchange rates (rate
  storage/conversion UI is still on the roadmap — see below).

For a detailed breakdown of what's implemented vs. planned, see
[docs/feature-map.md](docs/feature-map.md). For the full domain model and
roadmap, see [docs/project-assumptions-and-plan.md](docs/project-assumptions-and-plan.md).

## Tech stack

- **Frontend:** Angular 22 (standalone components, signals, Signal Forms),
  [spartan/ui](https://www.spartan.ng) (Tailwind-based component library)
- **Backend:** [Supabase](https://supabase.com) — Postgres, Auth, Row-Level
  Security
- **Testing:** Vitest (unit), Playwright (end-to-end)
- **Tooling:** Angular CLI, Prettier

## Getting started

### Prerequisites

- Node.js 22+
- npm
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
  and Docker (for running the local Supabase stack)

### Setup

```bash
npm install
npx supabase start
```

`npx supabase start` prints local API URL/keys; the defaults already checked
into [src/environments/environment.development.ts](src/environments/environment.development.ts)
match the standard local Supabase CLI setup, so no changes are usually
needed for local development. Apply the database schema with:

```bash
npx supabase db reset
```

### Development server

```bash
npm start
```

Open `http://localhost:4200/`. The app reloads automatically on source
changes.

### Building

```bash
npm run build
```

Build artifacts are written to `dist/`.

### Tests

Unit tests (Vitest):

```bash
npm test
```

End-to-end tests (Playwright, requires the local Supabase stack from
`npx supabase start`):

```bash
npm run e2e
```

## Project structure

```
src/app/
  core/       # singleton services (auth, supabase client, domain services)
  features/   # routed feature areas (auth, household, budget, net-worth, dashboard)
  layout/     # app shell (header, nav)
  ui/         # spartan/ui (Helm) components, owned and customizable
supabase/
  migrations/ # SQL schema + RLS policies
docs/         # domain model, roadmap, feature status
e2e/          # Playwright end-to-end tests
```

## Documentation

- [docs/project-assumptions-and-plan.md](docs/project-assumptions-and-plan.md) —
  project background, domain model, and roadmap (canonical)
- [docs/feature-map.md](docs/feature-map.md) — current implementation status
- [AGENTS.md](AGENTS.md) — coding conventions for this repo (Angular/TypeScript
  style, spartan/ui usage, project context) — also read by AI coding agents

## Status

This is a personal, work-in-progress project (pre-MVP). Core budgeting and
net worth/investment tracking work end-to-end; multi-currency conversion,
reporting/analytics, household invites, and data export are not yet built.

## License

[MIT](LICENSE)
