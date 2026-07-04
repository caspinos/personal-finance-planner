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
- ✅ Authenticated app shell (header with user email, nav links, and sign out)
  and a dashboard with a link into the budget
- ⬜ Inviting other users to a household / managing member roles from the UI
  (schema supports it; no UI or invite flow yet)
- ⬜ Switching between multiple households in the UI (service supports
  tracking a "current household", but only one can currently be created per
  user in practice, and there's no household switcher UI)
- ⬜ Audit log for membership/role changes
- ⬜ Ability to disable public self-registration and invite users instead
  (e.g. admin/owner-issued email invites with a token/link to accept); today
  anyone can sign up via the public Register page

## 2. Household budget (envelopes) — Stage 2

- ✅ `envelopes` table (name, household, archived flag) with RLS
  (`owner`/`editor` write, all members read)
- ✅ `budget_transactions` (expense/income events) and `envelope_transfers`
  as immutable events, with RLS + grants
- ✅ `get_envelope_balances(household_id, as_of)` SQL function derives
  cumulative balances dynamically (no stored running totals), so
  surpluses/deficits naturally carry over between months
- ✅ `BudgetService` (Angular): load envelopes, load balances, create
  envelope, record transaction, transfer between envelopes
- ✅ Budget UI: envelope list with per-month balances, month switcher,
  "New envelope", "Record transaction" (expense/income toggle), "Transfer"
  forms — all built with spartan/ui (`select`, `toggle-group`, `field`, etc.)
- ✅ End-to-end verified in-browser: create envelopes, record a transaction,
  transfer between envelopes, balances carry over to the next month
- ✅ Editing/deleting individual transactions or transfers from the UI
  (available from the per-envelope activity history)
- ⬜ Archiving/unarchiving envelopes from the UI (`setEnvelopeArchived`
  exists on the service; no UI control yet)
- ⬜ Recurring transactions
- ✅ Per-envelope transaction history view with monthly filtering, edit links,
  and delete actions for transactions/transfers

## 3. Net worth & investments — Stage 3

- ✅ `asset_accounts` table (bank, investment, cash, real estate, vehicle,
  precious metals, currency, other asset, liability types; liquidity class;
  institution/category/owner metadata; archived flag) with RLS
  (`owner`/`editor` write, all members read)
- ✅ `asset_valuations` — manual dated valuation snapshots per account
  (`value`, `contribution_amount` to distinguish contribution vs.
  market/FX movement, optional note), immutable event-style rows with RLS
- ✅ `get_net_worth_summary(household_id, as_of)` SQL function derives each
  account's latest valuation as of a date and signs liabilities negative
  (no stored running totals)
- ✅ `NetWorthService` (Angular): load accounts, load summary, create
  account, record valuation
- ✅ Net worth UI: total net worth card, per-account cards with latest
  valuation, "New account" and "Add valuation" forms, wired into routing
  and shell/dashboard navigation — all built with spartan/ui
- ⬜ Asset classification is captured in the schema/forms but not yet
  surfaced as filters/grouping in the summary UI
- ✅ Editing/deleting individual valuations and archiving/unarchiving
  accounts from the UI (per-account history page with valuation list,
  edit/delete actions, and an archive toggle)
- ⬜ `asset_transactions` for buy/sell events on investment holdings
  (currently only whole-account manual valuations, no per-holding detail)
- ✅ End-to-end (Playwright) coverage for the net worth flow: account
  creation, recording/editing/deleting valuations, liability sign handling,
  and account archiving/unarchiving (`e2e/net-worth.spec.ts`)


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
- ✅ E2E test coverage for the budget flow (Playwright): register/login,
  household creation, envelope creation, expense/income transactions,
  envelope transfers, and month-to-month balance carryover
  (`e2e/budget.spec.ts`, run with `npm run e2e`; requires
  `npx supabase start` first). Not yet wired into CI (needs a Docker-capable
  runner for the local Supabase stack).
- ✅ E2E test coverage for the net worth flow (Playwright): account
  creation, recording/editing/deleting valuations, liability sign handling,
  and account archiving/unarchiving (`e2e/net-worth.spec.ts`, same
  requirements as above).
- ⬜ Accessibility audit (AXE) pass over implemented screens
- ⬜ Audit log for key operations (`AuditLog` table from the domain model)
