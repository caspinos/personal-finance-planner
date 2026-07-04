# Feature Map

Tracks what has actually been built in this repository versus what is still
planned, mapped against the roadmap in
[project-assumptions-and-plan.md](project-assumptions-and-plan.md). Update this
file whenever a feature is started, finished, or re-scoped.

Status legend: ✅ done · 🚧 in progress / partial · ⬜ not started

## 0. Project setup & tooling

- ✅ Angular v22 app scaffolded (standalone components, signals, Vitest)
- ✅ Supabase project (local CLI stack + linked remote project)
- ✅ GitHub repository with CI (install, build, test)
- ✅ Project documentation in English (`docs/project-assumptions-and-plan.md`);
  original Polish draft kept only for historical reference
- ✅ `AGENTS.md` documents project context, Angular/TypeScript conventions
- ✅ spartan/ui component library installed (Brain + Helm), base components
  (`button`, `input`, `label`, `field`, `card`, `alert`, `spinner`, `separator`)
- ⬜ PWA setup (manifest, service worker)

## 1. Identity & household foundations (Stage 1)

- ✅ `households` / `household_members` tables with `owner` / `editor` /
  `viewer` role enum
- ✅ RLS enabled on both tables, with explicit `GRANT`s to `authenticated`
  (Supabase does not auto-expose new tables)
- ✅ Trigger auto-assigns the creator as `owner`; households SELECT policy
  fixed for `INSERT ... RETURNING` timing (see
  `supabase/migrations/20260704140000_fix_households_select_policy.sql`)
- ✅ Supabase Auth wired up: `AuthService` (signal-based session/user),
  `authGuard`
- ✅ Login page, Register page (email/password, reactive forms + spartan/ui)
- ✅ `HouseholdService` (load households, track/persist current household),
  `householdGuard`
- ✅ Create-household page (first-run flow when a user has no household yet)
- ✅ Authenticated app shell (header with user email + sign out) and a
  placeholder dashboard route
- ⬜ Inviting other users to a household / managing member roles from the UI
  (schema supports it; no UI or invite flow yet)
- ⬜ Switching between multiple households in the UI (service supports
  tracking a "current household", but only one can currently be created per
  user in practice, and there's no household switcher UI)
- ⬜ Audit log for membership/role changes

## 2. Household budget (envelopes) — Stage 2

All ⬜ not started:

- ⬜ `envelopes` table (name, household, ordering, etc.)
- ⬜ `budget_transactions` (expenses, income/top-ups) as immutable events
- ⬜ `envelope_transfers` between envelopes
- ⬜ Monthly budget view with cumulative balances (including carried-over
  negative balances)
- ⬜ Recurring transactions
- ⬜ Budget UI (envelope list, add/edit envelope, record expense/top-up,
  transfer funds)

## 3. Net worth & investments — Stage 3

All ⬜ not started:

- ⬜ `assets` / `asset_accounts` (bank, investment, funds, stocks/ETFs/bonds,
  currencies, precious metals, real estate, vehicles, other, liabilities)
- ⬜ `asset_transactions` (deposits/withdrawals, buys/sells)
- ⬜ `asset_valuations` (manual valuation snapshots, distinguishing
  contribution vs. market/FX movement)
- ⬜ Asset classification (type, liquidity, owner, currency, institution,
  category)
- ⬜ Net worth summary UI

## 4. Multi-currency & rates — Stage 3/4

All ⬜ not started:

- ⬜ `exchange_rates` table + historical rate storage
- ⬜ `commodity_prices` (e.g. gold) + `price_source`
- ⬜ Manual rate entry/correction UI
- ⬜ Base-currency conversion used across budget and net worth views
- ⬜ Automatic rate fetching (post-MVP per the plan)

## 5. Reports & analytics — Stage 4

All ⬜ not started:

- ⬜ Dashboard with real indicators (currently a static placeholder)
- ⬜ Monthly summaries, expense charts, net worth charts
- ⬜ Breakdown by category / envelope / user / period
- ⬜ Month-over-month comparisons

## 6. Backup & export — Stage 4/5

All ⬜ not started:

- ⬜ User/household data export
- ⬜ System-level database backup/restore
- ⬜ Import from backup file

## 7. Non-functional

- ✅ RLS-based multi-tenancy isolation for households/household_members
- ✅ CI runs build + unit tests on every push
- ⬜ Accessibility audit (AXE) pass over implemented screens
- ⬜ E2E test coverage (only a minimal unit test exists today)
- ⬜ Audit log for key operations (`AuditLog` table from the domain model)
