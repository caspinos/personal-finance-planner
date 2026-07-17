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
- ✅ Inviting other users to a household and managing member roles from the
  UI: a `household_invites` table (email + role + token, owner-only via RLS)
  plus `accept_household_invite`/`get_household_members` SQL functions
  (`supabase/migrations/20260705000000_household_invites.sql`). Household
  members page (`/household/members`) lets owners generate a shareable
  accept link per invite (no outbound email sending -- there's no SMTP setup
  for production yet, so the owner shares the link through whatever channel
  they like), change member roles, remove members, and revoke pending
  invites; non-owners see a read-only member list. `authGuard` now carries a
  `returnUrl` through login/register so an invite link works for logged-out
  or brand-new users. Covered by `e2e/household.spec.ts`.
- ⬜ Switching between multiple households in the UI (service supports
  tracking a "current household", and a user can now belong to more than one
  via invites, but there's still no household switcher UI -- joining a
  second household while already belonging to one has no way to select it)
- ⬜ Audit log for membership/role changes
- ⬜ Disabling public self-registration (anyone can still sign up via the
  public Register page in addition to using an invite link)

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
- ✅ Archiving/unarchiving envelopes from the UI (toggle on the per-envelope
  history page, same pattern as net worth account archiving; archived
  envelopes are hidden from the active budget list)
- ✅ Deleting an envelope from the UI: the user picks another envelope to move
  all of the deleted envelope's operations (transactions, transfers, recurring
  rules) into, then it is removed. Done atomically via the
  `delete_envelope_with_transfer(household_id, envelope_id, target_envelope_id)`
  SQL function so history is preserved (transfers between the two envelopes
  collapse and are dropped)
- ⬜ Recurring transactions
- ✅ Per-envelope transaction history view with monthly filtering, edit links,
  and delete actions for transactions/transfers
- ✅ Amortized (spread-over-time) expenses: a large, irregular payment (e.g. a
  yearly insurance premium) is recorded once but charges the envelope budget in
  equal monthly slices instead of a single lump. The payment stays in history,
  flagged and budget-neutral; the derived slices consume the budget.
  `get_amortized_charges(household_id, from, to)` generates the slices on the
  fly (never stored) and `get_envelope_balances` excludes the lump and subtracts
  the slices due so far — so editing the header (amount, months, date) always
  re-derives a consistent state

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
- ✅ Asset classification (type, liquidity, category) surfaced in the net
  worth summary UI: accounts are grouped by type with per-group subtotals,
  and a liquidity filter narrows the view
  (`get_net_worth_summary` now returns `liquidity`/`category`)
- ✅ Editing/deleting individual valuations and archiving/unarchiving
  accounts from the UI (per-account history page with valuation list,
  edit/delete actions, and an archive toggle)
- ✅ `asset_transactions` for buy/sell events on investment accounts, via a
  new `asset_holdings` (per-instrument, e.g. a stock/ETF/fund) +
  `asset_transactions` (buy/sell events) schema, additive to whole-account
  manual valuations. `get_holding_positions(household_id, as_of)` derives
  quantity, weighted-average cost, latest price, market value, and
  unrealized gain per holding (no stored running totals; average cost is a
  simple weighted average of buys, not FIFO/lot-based — an accepted
  simplification for now). UI: a "Holdings" section on the investment
  account's history page (`New holding`, per-holding position summary), a
  dedicated holding history page listing all buy/sell transactions with
  edit/delete, and forms to record/edit transactions
- ✅ End-to-end (Playwright) coverage for the net worth flow: account
  creation, recording/editing/deleting valuations, liability sign handling,
  account archiving/unarchiving, and holding buy/sell transactions with
  position calculations (`e2e/net-worth.spec.ts`)


## 4. Multi-currency & rates — Stage 3/4

- ✅ `households.base_currency` (default `PLN`, owner-editable) plus
  household-scoped `exchange_rates` (`currency`, `rate_to_pln`, `rate_date`,
  `source`, `note`) and `commodity_prices` (`commodity`, `price`, `currency`,
  `price_date`, `source`, `note`) tables with RLS
  (`supabase/migrations/20260705010000_multi_currency_rates.sql`). Rates are
  always stored relative to PLN as a fixed pivot, so converting between any
  two currencies hops through PLN; a `get_exchange_rate(household, currency,
  as_of)` SQL helper returns the latest applicable rate (or `null` if none
  exists for that date)
- ✅ Manual rate entry/correction UI: a "Rates" page (`/rates`) with a
  base-currency setting, and add/edit/delete forms for exchange rates and
  commodity prices, following the existing account/valuation form
  conventions (`RatesService`, `Rates`, `ExchangeRateForm`,
  `CommodityPriceForm`)
- ✅ Base-currency conversion used across budget and net worth views:
  `get_net_worth_summary` and `get_holding_positions` now also return
  `value_in_base`/`signed_value_in_base` and `market_value_in_base`/
  `unrealized_gain_in_base`; `get_envelope_balances` returns
  `balance_in_base`. The net worth total/per-account/per-group figures and
  the budget envelope balances display a converted secondary amount (or a
  "no exchange rate" warning instead of a wrong number) when a currency
  differs from the household's base currency. This also fixed a
  pre-existing bug where `NetWorthService.totalNetWorth` summed
  `signed_value` across accounts regardless of currency
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
- ✅ E2E test coverage for household invites (Playwright): inviting a member
  with a role, accepting via the generated link as a brand-new user, owner
  role changes/removal, and revoking a pending invite (`e2e/household.spec.ts`,
  same requirements as above).
- ✅ E2E test coverage for multi-currency/rates (Playwright): default base
  currency, exchange rate and commodity price CRUD, base-currency conversion
  of net worth totals in both directions, and the missing-rate warning
  (`e2e/multi-currency.spec.ts`, same requirements as above).
- ⬜ Accessibility audit (AXE) pass over implemented screens
- ⬜ Audit log for key operations (`AuditLog` table from the domain model)
