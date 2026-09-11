# Improvement & Fix Backlog (agent work list)

Analysis of the current codebase (branch `claude/busy-sagan-yanoig`, base
commit `4eca571`) producing a list of fixes and improvements that can be picked
up independently by other coding agents.

How to use this file:

- Each item has an **ID**, a **priority** (P0 = bug / data-integrity or
  security, P1 = important, P2 = nice-to-have, P3 = later / after the
  roadmap items above it), an **effort** estimate
  (S / M / L), the **files** involved, the **problem**, and a **proposed
  change** plus **acceptance criteria**. Items are written so that an agent can
  take one without reading the others.
- Items are grouped by area. Within an area they are roughly ordered by
  priority.
- Verification status: 🔍 = confirmed by reading the code / running a check,
  ❓ = suspected, needs confirmation by the agent picking it up.
- When an item lands, tick it and link the PR; keep `docs/feature-map.md`
  in sync per `AGENTS.md`.

This file is built incrementally; sections below are appended as areas are
reviewed.

---

## Areas reviewed so far

- [x] Tooling / CI / repo hygiene (A)
- [x] Database schema, RLS, SQL functions (B)
- [x] Core services (C)
- [x] Feature UI (D)
- [x] Tests (E)
- [x] Docs (F) + product gaps (G)

---

## A. Tooling, CI, repo hygiene

### A1. No linter / formatter check in CI (P1, S) 🔍
- **Files:** `package.json`, `.github/workflows/ci.yml`, `.prettierrc`
- **Problem:** Prettier is a dev dependency but nothing runs it; there is no
  ESLint (`angular-eslint`) at all. `AGENTS.md` lists many conventions (no
  `ngClass`, no `@HostListener`, signals, etc.) that are unenforced.
- **Proposed change:** add `angular-eslint` (`ng add angular-eslint`), a
  `lint` and `format:check` script, and run both in the `build-and-test` CI job.
  Fix or explicitly disable the rules that fire on the existing code in the
  same PR. Consider `eslint-plugin-rxjs`/`@angular-eslint/template` a11y rules
  (`template/alt-text`, `template/label-has-associated-control`, ...) since
  `AGENTS.md` requires AXE/WCAG AA.
- **Acceptance:** `npm run lint` and `npm run format:check` exist, pass on
  `main`, and are executed by CI.

### A2. Node version drift between `.nvmrc`, `engines` and CI (P2, S) 🔍
- **Files:** `.nvmrc` (24.18.0), `package.json` `engines` (`>=22.22.3 <23 ||
  >=24.15.0`), `.github/workflows/ci.yml` (`node-version: '22'`).
- **Problem:** Developers get Node 24 via nvm, CI tests on 22. `.gitignore`
  also lacks a trailing newline (last line `.wrangler`).
- **Proposed change:** make CI read `.nvmrc` (`node-version-file: .nvmrc`) or
  pin all three to the same major; add the newline.
- **Acceptance:** one source of truth for the Node version.

### A3. `index.html` is not localized / branded (P2, S) 🔍
- **Files:** `src/index.html`, `src/app/core/i18n/language.service.ts`
- **Problem:** `<html lang="en">` is hard-coded while the default language is
  `pl`; the title is `PersonalFinancePlanner`; there is no `<meta
  name="description">`, no theme-color, no apple-touch icons.
- **Proposed change:** set `document.documentElement.lang` from
  `LanguageService` on language change; use a translated `<title>` via
  `Title` service + route `title` (see also D-items on routes); add basic meta.
- **Acceptance:** `lang` attribute follows the active language (AXE
  `html-has-lang` / `valid-lang`), page titles are translated per route.

### A4. PWA not set up although it is a stated goal (P2, M) 🔍
- **Files:** `angular.json`, `public/`, `src/index.html`
- **Problem:** Roadmap/feature map list "PWA setup (manifest, service worker)"
  as ⬜. No `manifest.webmanifest`, no `@angular/service-worker`.
- **Proposed change:** `ng add @angular/service-worker`, add a manifest and
  icons, register the SW only in production. Keep `wrangler.jsonc` SPA
  fallback in mind (the `ngsw.json` and `manifest` must be served as assets).
- **Acceptance:** Lighthouse "installable" passes on the production build.

### A5. Local Supabase auth redirect origin does not match the app (P2, S) 🔍
- **Files:** `supabase/config.toml`
- **Problem:** `[auth] site_url = "http://127.0.0.1:3000"` while the app runs
  on `http://localhost:4200`; any auth email link (confirmation, password
  reset) generated locally points to the wrong origin. (The local
  `minimum_password_length = 6` already matches the Register page's
  `Validators.minLength(6)`; verify the production project's password policy
  separately.)
- **Proposed change:** in `supabase/config.toml` `[auth]` set
  `site_url = "http://localhost:4200"` and
  `additional_redirect_urls = ["http://localhost:4200", "http://127.0.0.1:4200"]`
  (the second key is a TOML array).
- **Acceptance:** local password-reset flow (once implemented, see C-items)
  lands on the app.

### A6. Stored language is read from `localStorage` at bootstrap without validation (P2, S) 🔍
- **Files:** `src/app/app.config.ts` (`readStoredLanguage`)
- **Problem:** Any string in `pfp.lang` becomes `defaultLang`; a corrupted
  value (`"xx"`) makes Transloco request `/i18n/xx.json` (404) and fall back
  on every key. `localStorage` access is not guarded (throws in some privacy
  modes).
- **Proposed change:** validate against `availableLangs`, wrap in try/catch,
  share the key constant with `LanguageService` instead of duplicating it.
- **Acceptance:** unit test: invalid stored value falls back to `pl`.

### A7. Unit-test coverage is almost nonexistent (P1, M) 🔍
- **Files:** `src/**/*.spec.ts` (only `app.spec.ts` and
  `net-worth-timeline.spec.ts` exist)
- **Problem:** Apart from `timelineCellValue` (covered by
  `net-worth-timeline.spec.ts`), the business logic in `BudgetService`,
  `NetWorthService`, `RatesService`, `HouseholdService`, form components and
  pure helpers is only covered by Playwright e2e, which needs Docker +
  Supabase and is slow. Pure functions (amortization slices, month math,
  balance grouping) are cheap to unit-test.
- **Proposed change:** extract pure helpers out of services/components into
  `*.utils.ts` files and add Vitest specs; add a Supabase client mock for
  service-level tests (see each area's items for concrete targets).
- **Acceptance:** each core service has a spec; CI runs them in
  `build-and-test`.

## B. Database schema, RLS, SQL functions

### B1. Foreign-key / query columns have no indexes (P1, S) 🔍
- **Files:** new migration under `supabase/migrations/`
- **Problem:** No migration creates an index other than PK/unique. Every
  derived-state function filters on `household_id`, `envelope_id`,
  `asset_account_id`, `asset_holding_id`, `occurred_on`, and
  `household_members(user_id)` (used by `is_household_member` on *every* RLS
  check). As data grows, `get_envelope_balances` (correlated subqueries on
  `envelope_transfers`) and `get_net_worth_summary` (lateral + correlated
  `max(valued_on)`) become seq scans.
- **Proposed change:** add btree indexes:
  `household_members(user_id)`, `envelopes(household_id)`,
  `budget_transactions(household_id, envelope_id, occurred_on)`,
  `budget_transactions(household_id, amortized_start_on) where amortized_months is not null`,
  `envelope_transfers(from_envelope_id, occurred_on)`,
  `envelope_transfers(to_envelope_id, occurred_on)`,
  `recurring_envelope_rules(household_id, active, next_run_on)`,
  `asset_accounts(household_id)`, `asset_holdings(asset_account_id)`,
  `asset_transactions(asset_holding_id, occurred_on)`,
  `exchange_rates(household_id, currency, rate_date desc)` (unique already
  covers this order - verify), `household_invites(household_id)`,
  `household_invites(lower(email)) where accepted_at is null and revoked_at is null`.
- **Acceptance:** `EXPLAIN (ANALYZE, BUFFERS)` of the four RPCs on a
  representative large seeded dataset (thousands of transactions/valuations)
  shows lower cost and execution time than before, with the new indexes used
  where the planner finds them cheaper (a small dataset may legitimately keep
  seq scans); migration applies cleanly with `npx supabase db reset`.

### B2. Generated recurring transactions are not linked to their rule (P1, M) 🔍
- **Files:** `supabase/migrations/20260705020000_recurring_envelope_rules.sql`,
  `20260705030000_budget_transaction_name_required.sql`
  (`process_due_recurring_rules`), `src/app/core/budget/budget.service.ts`
- **Problem:** `process_due_recurring_rules` inserts plain
  `budget_transactions` rows with no reference to the rule. Consequences: a
  generated row is indistinguishable from a manual one in history; deleting a
  rule cannot clean up its generated rows; pausing a rule for several months
  and resuming it backfills every missed month at once (see B3) with no way
  to tell which rows came from the rule; and there is no idempotency key, so
  any future second trigger path (pg_cron, B3) would need one. The current
  function itself is safe against concurrent callers (`FOR UPDATE` serialises
  them) and against partial failure (one transaction).
- **Proposed change:** add `recurring_rule_id uuid references
  recurring_envelope_rules(id) on delete restrict` and a unique index
  `(recurring_rule_id, occurred_on)`; insert `on conflict do nothing`. Surface
  the origin in the history views (badge "recurring"). When a rule is deleted,
  either delete its generated rows first (user's choice: "delete future/all
  generated") or soft-delete the rule (`deleted_at`) so provenance survives.
- **Acceptance:** re-running the RPC never duplicates; history shows the rule
  origin; e2e for delete-rule behaviour.

### B3. Recurring-rule processing is triggered client-side by any member (P2, M) 🔍
- **Files:** same as B2, `BudgetService` (call site of the RPC)
- **Problem:** Rules only fire when someone opens the budget; a household not
  opened for months backfills at once, and the RPC is `security definer`
  callable by viewers. `last_run_on` records the processing date, not the last
  occurrence date, which is misleading in the UI.
- **Proposed change:** (a) schedule via `pg_cron` (Supabase supports it) or a
  Supabase Edge Function cron as the primary trigger, keep the client call as
  a fallback; (b) rename/clarify `last_run_on` semantics (store last generated
  `occurred_on`); (c) optionally cap backfill (e.g. do not generate more than N
  months and warn).
- **Acceptance:** documented trigger strategy in `docs/feature-map.md`;
  transactions appear without opening the app.

### B4. `households.base_currency` and other currency columns are unconstrained text (P2, S) 🔍
- **Files:** migrations for `households`, `budget_transactions`,
  `asset_accounts`, `asset_valuations`, `asset_holdings`, `exchange_rates`,
  `commodity_prices`
- **Problem:** Any string is accepted (`"pln"`, `"zł"`, empty). Rate lookup is
  an exact-match on `currency`, so a lowercase code silently yields "no rate".
- **Proposed change:** add `check (currency ~ '^[A-Z]{3}$')` (and the same for
  `base_currency`), normalise with `upper(btrim())` in the UI before saving,
  and add a shared `ISO_CURRENCIES` list for selects.
- **Acceptance:** inserting `'pln'` fails; UI selects only offer valid codes.

### B5. Valuation currency can differ from the account currency (P2, S) 🔍
- **Files:** `asset_valuations.currency`, `get_net_worth_summary`
  (`coalesce(latest.currency, aa.currency)`)
- **Problem:** Two sources of truth. The UI (verify) copies the account
  currency into the valuation, but nothing prevents drift, and changing an
  account's currency does not touch historical valuations (which may be
  intended - document it either way).
- **Proposed change:** either drop `asset_valuations.currency` (derive from the
  account) or add a trigger enforcing equality, and state the rule in
  `docs/project-assumptions-and-plan.md`.
- **Acceptance:** rule documented and enforced.

### B6. Holding "market value" uses the last *transaction* price, not a market price (P1, M) 🔍
- **Files:** `get_holding_positions` (`latest` CTE in
  `20260705010000_multi_currency_rates.sql`)
- **Problem:** `latest_price` is the price of the most recent buy/sell. A
  holding bought once two years ago shows an "unrealized gain" of 0 forever.
  There is no per-holding price snapshot table; `commodity_prices` exists but
  is not used by any calculation.
- **Proposed change:** add `asset_holding_prices (holding_id, priced_on,
  price, currency, source)` (event rows, RLS like `asset_valuations`), use the
  latest price on/before `p_as_of` in `get_holding_positions` and fall back to
  the last transaction price; expose a "Record price" action in the holding
  history UI. Consider linking `commodity_prices` to `precious_metals`
  accounts the same way.
- **Acceptance:** market value changes when a price is recorded; e2e covers
  price recording.

### B7. Sell transactions can exceed the held quantity (P2, S) 🔍
- **Files:** `asset_transactions` checks, `holding-transaction-form.ts`
- **Problem:** Nothing prevents selling more than owned as of the sell date,
  producing negative quantities and nonsensical gains.
- **Proposed change:** validate in the form against the position as of the
  transaction date (use `get_holding_positions(as_of = date)`), and add a
  DB-level trigger for defence in depth (or document as accepted).
- **Acceptance:** form error "cannot sell more than X units held on that date".

### B8. Realized gains are not derived (P2, M) 🔍
- **Files:** `get_holding_positions`
- **Problem:** Only unrealized gain is computed; sells' realized P&L (sale
  proceeds minus average cost minus fees) is dropped, so a fully sold holding
  shows nothing.
- **Proposed change:** add `realized_gain` and `sold_proceeds` to the function
  (weighted-average method, consistent with the accepted simplification) and
  display them in holding history.
- **Acceptance:** unit test with a buy/sell sequence matches a hand
  calculation.

### B9. RLS: no "last owner" protection (P1, S) 🔍
- **Files:** `household_members` policies, `HouseholdService` /
  `household-members.ts`
- **Problem:** An owner can demote themselves to viewer or remove themselves,
  leaving a household with no owner (nobody can manage members, delete, or
  update base currency). `accept_household_invite` `on conflict ... set role`
  can also demote an existing owner if an invite for their e-mail is accepted.
- **Proposed change:** a trigger on `household_members` (`before update or
  delete`) raising when the row is the last `owner`, with an explicit
  exception for the household-delete cascade (skip the check when the parent
  `households` row no longer exists, i.e. `not exists (select 1 from
  households where id = old.household_id)`, which is the case inside an
  `on delete cascade`); make `accept_household_invite` never lower an existing
  role (or skip the conflict). Reflect in UI (disable the action for the last
  owner).
- **Acceptance:** SQL test / e2e: demoting the last owner fails with a clear
  message.

### B10. No `updated_at` / audit trail on domain tables (P2, M) 🔍
- **Files:** all domain tables
- **Problem:** Roadmap requires "auditing of key operations" and an `AuditLog`
  entity. Today rows have only `created_at`/`created_by`; edits and deletions
  leave no trace, and there is no `updated_at` to sort by or detect conflicts.
- **Proposed change:** add `updated_at` + `updated_by` with a generic
  `set_updated_at()` trigger, and a household-scoped `audit_log` table filled
  by row-level triggers on the financial tables (old/new JSON, actor, action).
  Read-only page for owners is a follow-up.
- **Acceptance:** editing a transaction writes an audit row; owners can query
  it via RLS.

### B11. Functions are executable by `anon`/`public` (P2, S) ❓
- **Files:** all `create function` statements
- **Problem:** Postgres grants `EXECUTE` on new functions to `PUBLIC` by
  default; the migrations only add `grant ... to authenticated`. Invoker
  functions leak nothing (RLS) but `security definer` helpers
  (`get_household_members`, `process_due_recurring_rules`,
  `accept_household_invite`) are callable unauthenticated and rely solely on
  `auth.uid()` being null. Confirm with `\df+` / Supabase advisor.
- **Proposed change:** `revoke execute on function ... from public, anon` for
  every function in a new migration; set `alter default privileges ... revoke
  execute on functions from public` for the schema.
- **Acceptance:** Supabase security advisor shows no "function exposed to
  anon" findings.

### B12. `get_envelope_balances` ignores `budget_transactions.currency` (P2, S) 🔍
- **Files:** `get_envelope_balances`, `budget_transactions.currency`
- **Problem:** The column exists (default `PLN`) but the sum mixes all
  currencies and the base conversion assumes PLN ("product decision: budget is
  PLN-only"). Either the column is dead, or the function is wrong.
- **Proposed change:** decide: (a) drop the column and any UI for it (the
  simplest option and consistent with the current "PLN-only" decision), or
  (b) real multi-currency budgeting: give `envelope_transfers` a currency
  too, and in `get_envelope_balances` convert every row into the base
  currency through the PLN pivot as of its own date
  (`amount * get_exchange_rate(h, row.currency, occurred_on)
  / get_exchange_rate(h, base_currency, occurred_on)`), returning `null`
  when any row of an envelope has no rate. Define first which date the
  rate is taken from (transaction date vs. `p_as_of`) and what a
  transfer between envelopes in different currencies means.
  Document the decision in `docs/project-assumptions-and-plan.md`.
- **Acceptance:** no dead column, or per-transaction conversion covered by an
  e2e.

### B13. `contribution_amount` is stored but never used analytically, and its sign convention is undocumented (P2, M) 🔍
- **Files:** `20260911180000_signed_valuation_values.sql`, `valuation-form.ts`,
  `bulk-valuation-form.ts`, `account-history.ts`, `net-worth-timeline.ts`
- **Problem:** `value` became signed, but `contribution_amount` was not
  touched and nothing derives "market/FX movement = delta - contributions"
  from it: the timeline shows totals and month-over-month change only, and the
  account history merely prints the raw number. For a liability, is a
  repayment a positive or a negative contribution? Nothing says.
- **Proposed change:** document the convention with a `comment on column`
  (suggested: positive = money put in / repaid, negative = withdrawn / drawn
  down, from the household's point of view), align the two forms' helper text,
  and add a "contributions vs. market movement" split to the timeline (per
  account and total) - this is the main reason the column exists.
- **Acceptance:** repaying 100 on a -1000 loan shows +100 contribution and 0
  market movement in the timeline; unit test on the derivation helper.

### B14. Invites: no delete policy, no cleanup of expired rows, and e-mail matching only (P2, S) 🔍
- **Files:** `20260705000000_household_invites.sql`
- **Problem:** `grant select, insert, update` only - revoked/expired invites
  accumulate forever; an owner cannot hard-delete a mistaken invite. Tokens are
  UUIDv4 (fine) but the accept link carries the token in the URL, which ends up
  in browser history and server logs - acceptable for now, note it.
- **Proposed change:** owner delete policy + a periodic cleanup (pg_cron)
  of rows expired > 30 days; optionally hash the token at rest.
- **Acceptance:** owners can delete; cleanup job documented.

### B15. Envelopes have no uniqueness on `(household_id, name)` (P2, S) 🔍
- **Files:** `envelopes`, `asset_accounts`, `asset_holdings`
- **Problem:** Duplicate names are allowed, which makes the transaction-form
  suggestions and selects ambiguous.
- **Proposed change:** unique index on `(household_id, lower(name))` for
  `envelopes` and `asset_accounts`, and on `(asset_account_id, lower(name))`
  for `asset_holdings` (the same instrument may legitimately be held in two
  accounts), where not archived (or unconditional), with a friendly error in
  the forms.
- **Acceptance:** creating a duplicate shows a translated validation error.


## C. Core services (`src/app/core`)

### C1. Supabase client is untyped - every query result is `any` (P1, M) 🔍
- **Files:** `src/app/core/supabase.service.ts`, all services
- **Problem:** `createClient(url, key)` without a `Database` generic, so
  `.from('x').select()` returns `any`, `rpc()` rows are cast by hand
  (`mapSummaryRows` in `NetWorthService`), and a renamed column (e.g.
  `description` -> `name`, `signed_value` removal) is only caught at runtime
  or by e2e. Interfaces such as `Envelope`, `AssetValuation` are maintained
  manually and can drift from the schema.
- **Proposed change:** generate `src/app/core/database.types.ts` with
  `npx supabase gen types typescript --local > ...`, use
  `createClient<Database>`, derive the row interfaces from
  `Database['public']['Tables'][...]['Row']` / `Functions[...]['Returns']`,
  and add an npm script + CI step that fails when the generated file is
  stale.
- **Acceptance:** `tsc` catches a query against a non-existent column; no
  `as Record<string, unknown>` casts remain in services.

### C2. Household/auth state is not reset on sign-out or account switch (P1, S) 🔍
- **Files:** `src/app/core/household/household.service.ts`,
  `src/app/core/auth/auth.service.ts`, `src/app/layout/shell/shell.ts`,
  `BudgetService`, `NetWorthService`, `RatesService`
- **Problem:** `HouseholdService.loaded` stays `true` and `households`,
  `members`, `invites` keep the previous user's data after `signOut()`.
  `householdGuard` skips reloading when `loaded()` is true, so logging in as a
  different user in the same tab keeps the previous user's "current
  household" (and its id in `localStorage`), leading to empty lists / RLS
  errors instead of the create-household flow. The same applies to the cached
  envelopes/accounts/rates signals in the other services.
- **Proposed change:** in `AuthService.onAuthStateChange` emit a
  `SIGNED_OUT`/user-changed event; each stateful service subscribes (or an
  `effect()` on `auth.user()?.id`) and resets its signals; clear
  `pfp.currentHouseholdId` when the stored id is not among the loaded
  households.
- **Acceptance:** e2e: sign out, sign in as another user in the same tab,
  land on the correct household or the create flow; unit test for the reset.

### C3. Duplicated helpers across services (`toDateOnly`, `requireHouseholdId`, `requireUserId`) (P2, S) 🔍
- **Files:** `budget.service.ts`, `net-worth.service.ts`, `rates.service.ts`,
  `frankfurter.service.ts`, `household.service.ts`
- **Problem:** `toDateOnly` is copy-pasted 4 times; the two `require*` guards
  4 times (`HouseholdService`, `BudgetService`, `NetWorthService`,
  `RatesService`); error strings are English literals not going through
  Transloco.
- **Proposed change:** `src/app/core/util/date.ts` (`toDateOnly`,
  `startOfMonth`, `addMonths`, `parseDateOnly`) with unit tests; a small
  `HouseholdContext` helper (or base class) exposing `requireHouseholdId()`;
  throw typed errors (`class NoHouseholdError`) and translate in the UI.
- **Acceptance:** one implementation each, covered by Vitest.

### C4. `NetWorthService.totalNetWorth` silently mixes currencies when a rate is missing (P1, S) 🔍
- **Files:** `src/app/core/net-worth/net-worth.service.ts` (`totalNetWorth`)
- **Problem:** `row.value_in_base ?? row.value` adds the raw foreign-currency
  amount into the base-currency total whenever no rate exists - exactly the
  "wrong number" the feature map says is avoided. `hasUnconvertedRows` exists
  but the number shown is still wrong.
- **Proposed change:** make `totalNetWorth` `null` (or an object
  `{ value, incomplete: true }`) when any row is unconverted, and render
  "incomplete - N accounts without a rate" instead of a figure; same rule for
  per-group subtotals in `net-worth.ts`.
- **Acceptance:** e2e (`multi-currency.spec.ts`) asserts that the total is
  not shown as a number when a rate is missing.

### C5. Timeline fires one RPC per month (P1, M) 🔍
- **Files:** `NetWorthService.loadTimeline`, `net-worth-timeline.ts`,
  `get_net_worth_summary`
- **Problem:** The timeline window is 12 months (`WINDOW_SIZE = 12`) and
  issues 12 parallel `rpc` calls per window, each running the full summary
  with correlated subqueries and rate lookups; the bulk valuation form calls
  the same path for its "previous value" column.
- **Proposed change:** add `get_net_worth_timeline(p_household_id, p_from,
  p_to)` returning `(month, account_id, value, value_in_base, ...)` in one
  set-returning query (generate_series over months + lateral latest
  valuation), and call it once; keep the client-side derivation of
  contribution vs. market movement.
- **Acceptance:** one network call for the timeline; existing timeline unit
  tests still pass.

### C6. Editing a recurring rule can make it fire twice in the same month (P1, S) 🔍
- **Files:** `BudgetService.updateRecurringRule`, `nextOccurrence`
- **Problem:** `updateRecurringRule` recomputes `next_run_on =
  nextOccurrence(dayOfMonth, today)`. If a rule with `day_of_month = 10`
  already ran on the 10th (so `next_run_on` is next month) and the user
  changes the day to 20 on the 12th, `next_run_on` becomes the 20th of the
  current month and the rule fires again this month.
- **Proposed change:** compute the new `next_run_on` relative to
  `last_run_on`/the current `next_run_on` month (never earlier than the month
  after the last generated occurrence), or leave `next_run_on` untouched when
  only amount/name change. Add unit tests for `nextOccurrence`.
- **Acceptance:** unit test reproducing the scenario passes; e2e edit-rule
  case.

### C7. No way to edit or delete accounts, holdings, or households from the services (P1, M) 🔍
- **Files:** `NetWorthService` (no `updateAccount`, `deleteAccount`,
  `updateHolding`, `setHoldingArchived`, `deleteHolding`), `HouseholdService`
  (no `renameHousehold`, `deleteHousehold`, `leaveHousehold`)
- **Problem:** A typo in an account name, a wrong type/currency, or a wrongly
  created holding cannot be fixed; RLS already allows editors to update and
  owners to delete these rows.
- **Proposed change:** add the service methods and the corresponding
  edit/delete UI (reuse `account-form.ts` in edit mode as the valuation and
  holding-transaction forms already do). Deleting an account should be
  guarded ("this removes N valuations") and probably require archiving first.
- **Acceptance:** e2e covers rename account, change currency, archive/delete
  holding, rename household.

### C8. Bulk valuation save is not atomic (P2, S) 🔍
- **Files:** `NetWorthService.recordValuations`
- **Problem:** One select + one insert + N updates; a failure midway leaves a
  partially saved snapshot without telling the user which rows landed.
- **Proposed change:** move it into an RPC `record_valuations(p_household_id,
  p_valued_on, p_entries jsonb)` doing `insert ... on conflict (asset_account_id,
  valued_on) do update` in one transaction (preserving `created_by` on update
  by not touching it).
- **Acceptance:** either all rows are saved or none; e2e bulk test still
  passes.

### C9. `setEnvelopeArchived` / `setAccountArchived` are not scoped to the household (P2, S) 🔍
- **Files:** `BudgetService.setEnvelopeArchived`,
  `NetWorthService.setAccountArchived`
- **Problem:** Every other mutation filters on `household_id` as a
  belt-and-braces check; these two only filter on `id`. RLS still protects,
  but the inconsistency invites copy-paste mistakes.
- **Proposed change:** add `.eq('household_id', householdId)`.

### C10. Auth is minimal: no password reset, no e-mail verification handling, no OAuth (P1, M) 🔍
- **Files:** `AuthService`, `login.ts`, `register.ts`, `supabase/config.toml`
- **Problem:** `AuthService` exposes only sign-in/up/out. There is no "forgot
  password" flow, no handling of `signUp` returning no session when e-mail
  confirmation is enabled in production (the Register page must tell the user
  to check their inbox), no `PASSWORD_RECOVERY` event handling, and no
  "change password / change e-mail" page.
- **Proposed change:** add `resetPasswordForEmail`, an `/auth/reset` route
  that handles the recovery event and lets the user set a new password, and a
  profile/settings page. Verify the production project's "Confirm email"
  setting and make Register handle both cases.
- **Acceptance:** e2e for reset (local stack, use the Inbucket/Mailpit URL to
  grab the link) and for the "check your inbox" state.

### C11. `FrankfurterService` edge cases (P2, S) 🔍
- **Files:** `src/app/core/rates/frankfurter.service.ts`
- **Problem:** A future date or a date before 1999 produces a raw HTTP error
  surfaced as-is; there is no caching, so opening the rates form repeatedly
  re-fetches; `frankfurter` returns the rate for the previous business day on
  weekends but the stored `rate_date` remains the requested date (may be
  intended - document it). Only one currency per request; a "fetch all my
  currencies for today" action would need N calls (`symbols` supports
  multiple, base must then be PLN and the value inverted).
- **Proposed change:** clamp/validate the date, translate errors, store the
  response `date` as `rate_date` (or in `note`), and add a "Fetch today's
  rates for all currencies in use" action using one request with
  `base=PLN&symbols=...` and `1/rate`.
- **Acceptance:** unit tests with an `HttpTestingController`.

### C12. Language / household id read from `localStorage` at construction without guards (P2, S) 🔍
- **Files:** `household.service.ts` (`currentHouseholdIdSignal` initializer),
  `language.service.ts`, `app.config.ts`
- **Problem:** Direct `localStorage` access throws in some environments
  (Safari private mode with storage disabled, tests without jsdom storage)
  and is untestable. See also A6.
- **Proposed change:** a tiny `StorageService` with try/catch and typed keys
  used by all three call sites.
- **Acceptance:** unit test with a throwing `localStorage` stub proves the
  services still construct with defaults; no direct `localStorage` access
  outside the storage service.


## D. Feature UI (`src/app/features`, `src/app/layout`)

### D1. Seven call sites in six forms parse the date input with `new Date('YYYY-MM-DD')` (UTC) - off-by-one-day bug (P0, S) 🔍
- **Files:** `budget/transfer-form/transfer-form.ts:207`,
  `budget/bulk-funding-form/bulk-funding-form.ts:364`,
  `net-worth/valuation-form/valuation-form.ts:231`,
  `net-worth/holding-transaction-form/holding-transaction-form.ts:219`,
  `rates/exchange-rate-form/exchange-rate-form.ts:196,219`,
  `rates/commodity-price-form/commodity-price-form.ts:191`
- **Problem:** `new Date('2026-03-01')` is UTC midnight; `toDateOnly()` then
  reads local components, so in any zone west of UTC the stored date is the
  previous day (a transfer dated the 1st lands in the previous month and
  changes that month's balances). `transaction-form.ts` and
  `bulk-valuation-form.ts` already carry a local-parse helper for exactly this
  reason - the fix was not propagated.
- **Proposed change:** one shared `parseDateInput()` in
  `src/app/core/util/date.ts` (see C3) used by every form; delete the local
  copies; unit test with `TZ=America/New_York`.
- **Acceptance:** Vitest run with `TZ=America/Los_Angeles` proves the stored
  string equals the typed string; e2e unaffected.

### D2. Editing a valuation of an archived account saves an empty currency (P0, S) 🔍
- **Files:** `net-worth/valuation-form/valuation-form.ts` (`accounts =
  activeAccounts`, `currency = selectedAccount()?.currency ?? ''`)
- **Problem:** The account select only lists active accounts, so when a
  valuation belonging to an archived account is edited (reachable from its
  history page), `selectedAccount()` is `undefined`, the select shows nothing,
  and `currency` is submitted as `''`. `get_net_worth_summary` then uses that
  empty currency for the row and rate lookup fails silently.
- **Proposed change:** in edit mode include the valuation's account even if
  archived (or load `accounts` unfiltered and disable the select); fall back
  to the stored valuation currency; consider B5 (drop the column).
- **Acceptance:** e2e: archive an account, edit one of its valuations, the
  currency is preserved.

### D3. Date pipe / number pipe ignore the active language (P1, S) 🔍
- **Files:** every component using `| date` / `| number`, `app.config.ts`,
  `language.service.ts`
- **Problem:** No `LOCALE_ID` provider, no `registerLocaleData(localePl)`. All
  `date: 'mediumDate'` outputs render as `Sep 11, 2026` and numbers as
  `1,234.56` in the Polish UI. Only the hand-written
  `toLocaleDateString(localeTag)` month labels follow the language.
- **Proposed change:** register `pl` locale data, provide `LOCALE_ID` from the
  stored language at bootstrap, and either reload on language change or pass
  `language.localeTag()` explicitly to the pipes (`| date:'mediumDate':undefined:locale`).
  Prefer a small `LocalizedDatePipe`/`MoneyPipe` wrapping `Intl` with the
  active locale + currency so formatting is consistent (`1 234,56 zł`).
- **Acceptance:** switching to PL renders Polish month names and `,` decimals
  in history lists; e2e checks one formatted date per language.

### D4. Currency amounts are formatted by hand with hard-coded `PLN` (P1, S) 🔍
- **Files:** `budget.ts`, `envelope-history.ts`, `history.ts`, `rates.ts`,
  `net-worth*.ts` (13 `PLN` literals in features), `budget.service.ts`
  (`currency: 'PLN'` on transfers)
- **Problem:** `{{ x | number:'1.2-2' }} PLN` is repeated everywhere; the
  envelope-history balance card omits the currency entirely; if the budget
  ever supports another currency every template changes.
- **Proposed change:** a `MoneyPipe` (`amount | money:currency`) using
  `Intl.NumberFormat(locale, { style: 'currency', currency })`; read the
  budget currency from one constant/setting.
- **Acceptance:** no bare `PLN` literal in templates.

### D5. `extractMessage()` is copy-pasted in 23 components and shows raw backend errors (P1, S) 🔍
- **Files:** all feature components, `login.ts`, `register.ts`
- **Problem:** Identical private helper ×23 with a hard-coded English fallback
  `'Something went wrong.'`; Supabase/PostgREST messages (`Invalid login
  credentials`, `duplicate key value violates unique constraint
  "exchange_rates_unique_currency_date"`, `new row violates row-level security
  policy`) are shown verbatim to Polish users.
- **Proposed change:** `src/app/core/errors/error-message.service.ts` mapping
  known `AuthError.code` / Postgres `code` (`23505` unique, `42501` RLS,
  `23514` check) to translation keys with a translated generic fallback;
  optionally a toast (`ng g @spartan-ng/cli:ui --name=sonner`) instead of
  per-page alert blocks.
- **Acceptance:** one implementation; unit tests for the mapping; the
  duplicate-rate error is shown as a friendly translated message.

### D6. Destructive actions use `window.confirm` (P1, S) 🔍
- **Files:** `budget.ts`, `history.ts`, `envelope-history.ts`,
  `account-history.ts`, `holding-history.ts`, `rates.ts` (×2),
  `household-members.ts`
- **Problem:** Native dialogs are unstyled, untranslatable in title, block
  the event loop, and contradict the `AGENTS.md` rule to use spartan
  components; the message interpolates raw enum values (`kind: 'transaction'`).
- **Proposed change:** install `alert-dialog` from spartan (`ng g
  @spartan-ng/cli:ui --name=alert-dialog`), add a `ConfirmService`/component
  returning a promise, replace all 8 call sites; translate the `kind` label.
  Update e2e helpers that rely on `page.once('dialog')`.
- **Acceptance:** no `window.confirm` in `src/`; e2e green.

### D7. Role-aware UI is inconsistent - viewers see actions they cannot perform (P1, M) 🔍
- **Files:** `budget.ts`, `transaction-form.ts`, `net-worth.ts`,
  `account-history.ts`, `holding-history.ts`, `history.ts`,
  `envelope-history.ts`, `household.service.ts`
- **Problem:** Only `rates.ts`, `envelope-history.ts` (delete link) and
  `household-members.ts` check `currentRole()`. A viewer sees "Record
  transaction", "New account", "Delete", opens the forms and gets an RLS error
  after submitting. `currentRole` is also derived from `loadMembers()` (an RPC
  returning all members' e-mails) which each page has to call.
- **Proposed change:** load the caller's own membership row (or return
  `role` from `loadHouseholds` by joining `household_members`) once in
  `HouseholdService`; expose `canEdit`/`isOwner` computed signals; hide or
  disable mutation entry points for viewers; add a `roleGuard` on the `/new`
  and `/edit` routes.
- **Acceptance:** e2e as a viewer: no mutation buttons, direct navigation to a
  form redirects with a message.

### D8. Month/window navigation state is not in the URL (P2, S) 🔍
- **Files:** `budget.ts`, `history.ts`, `envelope-history.ts`,
  `net-worth-timeline.ts`
- **Problem:** The selected month lives in a signal; refresh, back button, or
  a link from a form ("Save changes" returns to the current month) loses it.
  Month-navigation logic (`startOfMonth`, `endOfMonth`, prev/next) is
  duplicated in four components.
- **Proposed change:** `?month=YYYY-MM` query param (via `withComponentInputBinding`
  + `input()`), shared `MonthSwitcher` component with translated aria-labels.
- **Acceptance:** deep link `/budget?month=2026-03` opens March; after editing
  a transaction the user returns to the month they came from.

### D9. Hard-coded English `aria-label`s and untranslated strings in templates (P2, S) 🔍
- **Files:** `shell.ts` (`Language`, `Menu`), `budget.ts`, `history.ts`,
  `envelope-history.ts` (`Previous month`/`Next month`),
  `net-worth-timeline.ts` (`Previous 12 months`), `budget.service.ts`
  (`'Unknown envelope'`), `create-household.ts` (reuses
  `envelopeForm.nameError`)
- **Proposed change:** `[attr.aria-label]="'x' | transloco"`; move service
  strings to the UI layer; add a dedicated `household.create.nameError` key.
- **Acceptance:** `grep -rn 'aria-label="' src/app` finds only bound
  attributes.

### D10. Accessibility gaps against the stated AXE/WCAG AA requirement (P1, M) 🔍
- **Files:** all forms using `hlm-select` / `hlm-toggle-group` with a bare
  `<label hlmFieldLabel>` (no `for`/`aria-labelledby`), `bulk-funding-form.ts`
  (checkbox and amount inputs without accessible names), `shell.ts` (no
  `routerLinkActive`/`aria-current`, no skip link, nav duplicated for mobile
  without `aria-controls`), `budget.ts` cards (`<h2>` per envelope inside a
  page without `<h1>`), timeline table (`<th>` without `scope`).
- **Proposed change:** run `@axe-core/playwright` on every page in e2e
  (one `checkA11y(page)` helper), fix findings: associate labels
  (`hlmFieldLabel` + `id`/`aria-labelledby` on the select trigger), add
  `aria-label` to grid inputs, `routerLinkActive` with `ariaCurrentWhenActive`,
  heading hierarchy, focus management after route change.
- **Acceptance:** axe reports zero serious/critical violations across the
  e2e pages; CI enforces it.

### D11. Form UX consistency (P2, M) 🔍
- **Files:** all `*-form.ts`
- **Problem:** Forms render inside the shell with `min-h-svh` centering, so
  each form page scrolls past the header; most forms have no Cancel/Back
  link (`envelope-delete` and `bulk-valuation-form` are the exceptions);
  numeric fields start at `0` instead of empty
  (`amount: [0]`), so the user must clear the field; after saving from an
  envelope's history the app navigates to `/budget` (context lost); no
  `autofocus`; `hlm-select` placeholder duplicates the label.
- **Proposed change:** shared `FormPage` layout (title, description, actions
  row with Cancel returning to `history.back()` or a `returnTo` query param),
  `null` initial values with `Validators.required`, focus the first field on
  load.
- **Acceptance:** every form has Cancel; no form page requires scrolling past
  an empty viewport on desktop.

### D12. Bulk funding saves rows one request at a time (P2, S) 🔍
- **Files:** `budget/bulk-funding-form/bulk-funding-form.ts`,
  `BudgetService.recordTransaction`/`createRecurringRule`
- **Problem:** N sequential inserts with a "partially saved" note on failure;
  also uses `[disabled]` with `formControlName` (Angular warns) and
  `new Date()` UTC parse (D1).
- **Proposed change:** `recordTransactions(input[])` doing one
  `.insert([...])` (atomic in PostgREST), same for rules; use
  `control.disable()`.
- **Acceptance:** one network request; no console warning.

### D13. Frankfurter sync fails on days that already have a rate and ignores currencies without rates (P2, S) 🔍
- **Files:** `rates.ts` (`syncRatesFromFrankfurter`), `rates.service.ts`
- **Problem:** `createExchangeRate` inserts, so a second sync the same day
  hits `exchange_rates_unique_currency_date` and every currency is reported as
  failed. Only currencies that already have at least one rate are synced; a
  new EUR account with no rate yet is not covered even though it is the case
  the user needs most.
- **Proposed change:** `upsertExchangeRate` (`onConflict:
  'household_id,currency,rate_date'`); derive the currency list from
  `asset_accounts` + `asset_holdings` + existing rates (minus PLN); one
  request with `base=PLN&symbols=A,B,C` and invert (see C11).
- **Acceptance:** syncing twice in a day succeeds; a new foreign-currency
  account gets a rate after sync.

### D14. Shell: no household switcher, no active-link state, no dark-mode toggle (P2, M) 🔍
- **Files:** `layout/shell/shell.ts`, `styles.scss` (`:root.dark` is defined
  but never applied), `household.service.ts` (`selectHousehold` exists)
- **Proposed change:** (a) household `hlm-select` in the header when the user
  belongs to more than one household, resetting cached service state on
  change (see C2); (b) `routerLinkActive="bg-accent"` + `aria-current`;
  (c) theme toggle persisting to `localStorage` and honouring
  `prefers-color-scheme`; (d) deduplicate desktop/mobile nav into one
  `@for` over a `NAV_ITEMS` constant.
- **Acceptance:** feature map item "household switcher" becomes ✅; e2e for
  switching.

### D15. Router hygiene: no 404 route, no titles, no guest guard (P2, S) 🔍
- **Files:** `app.routes.ts`, `app.config.ts`
- **Problem:** Unknown URLs throw `NG04002` to the console and render nothing;
  routes have no `title` (tab always shows `PersonalFinancePlanner`); a
  logged-in user can open `/login` and `/register`.
- **Proposed change:** `{ path: '**', component: NotFound }`, translated
  `title` via a custom `TitleStrategy` using Transloco, `guestGuard`
  redirecting authenticated users to `/`, `withInMemoryScrolling({
  scrollPositionRestoration: 'top' })`, `withComponentInputBinding()`.
- **Acceptance:** `/does-not-exist` shows a translated 404 page with a link
  home; tab titles are translated.

### D16. Budget page lacks a monthly overview (P2, M) 🔍
- **Files:** `budget.ts`, `get_envelope_balances`, new RPC
- **Problem:** Cards show only the cumulative balance. There is no "this
  month: funded X, spent Y, net Z", no total across envelopes, no
  unallocated-income concept, and rule dates are printed raw (`2026-10-10`).
- **Proposed change:** `get_envelope_month_activity(household, month)`
  returning per-envelope income/expense/transfer sums for the month; a summary
  card at the top (total balance, funded, spent, amortized charges due);
  per-card "spent this month" line; localized dates.
- **Acceptance:** e2e asserts the summary after recording an income and an
  expense.

### D17. Dashboard is a placeholder (P1, L) 🔍
- **Files:** `features/dashboard/dashboard.ts`, feature map section 5
- **Proposed change:** first real dashboard: total net worth (base currency,
  incomplete-rate warning), 12-month net worth sparkline (reuse timeline
  data via C5), this month's budget summary (D16), envelopes in deficit,
  upcoming recurring rules (next 30 days), rates older than N days. Charts
  via a small dependency (e.g. `chart.js` UMD or inline SVG) - keep the
  bundle budget (initial is already 577 kB of the 600 kB warning) in mind.
- **Acceptance:** feature map 5 "Dashboard with real indicators" ✅; e2e
  smoke test.

### D18. Reports and charts (P2, L) 🔍
- **Files:** new `features/reports`
- **Problem:** Roadmap stage 4 (monthly summaries, expense charts, breakdown by
  envelope/period, month-over-month) is entirely absent.
- **Proposed change:** after D16/D17: a reports page with month range picker,
  expenses by envelope (bar/pie), income vs. expense over time, net worth by
  type over time (stacked), all computed by SQL RPCs to keep the "derived,
  never stored" principle. Consider `@angular/cdk` table for sortable tables.
- **Acceptance:** feature map section 5 rows become ✅; each chart has an
  accessible table fallback; e2e smoke test per report.

### D19. Data export (P1, M) 🔍
- **Files:** new `features/settings/export`, new RPC or client-side
- **Problem:** MVP item 12 "user/household data export" is missing.
- **Proposed change:** "Export household data" button producing a JSON (all
  tables for the household, RLS-filtered) and CSV per table, generated
  client-side from paginated selects, downloaded via Blob; document the format
  for future import.
- **Acceptance:** e2e downloads the file and checks it contains the created
  envelope.

### D20. Bundle size is close to the warning budget (P2, S) 🔍
- **Files:** `angular.json` budgets, `app.config.ts`
- **Problem:** Production initial bundle is 576.81 kB vs. a 600 kB warning
  (`main` 523 kB). `@supabase/supabase-js`, Transloco and `@angular/cdk`
  are all eager. (`@angular/cdk` is pinned to 21.0.0; its peer range
  `^21 || ^22` is compatible with Angular 22, so aligning it is optional
  housekeeping unless the stats show a duplicated dependency.)
- **Proposed change:** `npx ng build --stats-json` + bundle analyzer; lazy
  load the Supabase client until after the auth route resolves if feasible;
  align `@angular/cdk` to `^22`; raise the budget deliberately if justified.
- **Acceptance:** production build stays under the warning budget after the
  dashboard (D17) lands, or the budget is raised with a written rationale in
  `angular.json`.

## E. Tests

### E1. Unit tests: extract and test pure logic (P1, M) 🔍 (see A7)
- **Targets:** `resolveAmortization`, `nextOccurrence` (C6 scenario),
  `timelineCellValue` (exists), `parseDateInput`/`toDateOnly` under
  different `TZ`, `latestRateByCurrency`, `groupedRows` subtotal with missing
  rates (C4), `HouseholdService.currentHousehold` fallback + reset (C2),
  `ErrorMessageService` mapping (D5).
- **Acceptance:** `npx ng test` covers `src/app/core/**` with > 70 % line
  coverage; add `--coverage` to CI.

### E2. E2E gaps (P1, M) 🔍
- **Files:** `e2e/*.spec.ts`
- **Missing scenarios:** recurring rules (create, auto-generated transaction
  appears, pause, edit-day double-fire regression for C6), bulk funding (once
  and monthly), global history page (edit/delete from it), net worth timeline
  (archived account cut-off), Frankfurter sync (mock via `page.route`),
  login error message, sign-out then sign-in as another user (C2), viewer
  role restrictions (D7), language switch (PL labels), household base
  currency change re-converting budget balances, envelope rename, duplicate
  valuation date on the single form.
- **Also:** tests share one Supabase instance and never clean up users
  (fine locally, but add a `supabase db reset` step or a teardown for CI
  reruns); `retries: 2` on CI can hide flaky selectors - keep but report.

### E3. Database tests (P2, M) ❓
- **Files:** new `supabase/tests/*.sql` (pgTAP) or Vitest + `postgres`
- **Problem:** RLS policies and SQL functions have no direct tests; the only
  guard is e2e through the UI. Regressions such as `signed_value` removal or
  `p_include_archived` are easy to miss.
- **Proposed change:** pgTAP suite run by `supabase test db` in CI covering:
  member/non-member visibility per table, editor vs. viewer writes, last-owner
  guard (B9), `get_envelope_balances` with amortization + transfers,
  `get_holding_positions` buy/sell math, `process_due_recurring_rules`
  idempotency (B2), `delete_envelope_with_transfer` collapse of transfers.
- **Acceptance:** `supabase test db` runs in CI and fails on a deliberately
  broken policy.

### E4. CI improvements (P2, S) 🔍
- Cache Playwright browsers and the Supabase Docker images; run unit tests
  with coverage; run lint/format (A1); upload the trace on failure (already
  done for the report); add `concurrency` cancel-in-progress; consider a
  `supabase db lint` / migration dry-run job so a broken migration fails
  before merge (the AGENTS.md deploy note about app/db skew makes this
  valuable).
- **Acceptance:** CI wall time for the e2e job drops measurably on a cache
  hit; a PR with a syntactically broken migration fails before merge.

## F. Documentation

### F1. `docs/feature-map.md` is stale (P1, S) 🔍
- "⬜ Recurring transactions" under section 2 although recurring rules,
  bulk funding and processing are implemented (`TODO.md` marks them done).
- Section 7 says e2e is "Not yet wired into CI", but `ci.yml` has an `e2e`
  job with the Supabase stack.
- Section 3 describes bulk valuation saving as "a single upsert", but
  `NetWorthService.recordValuations` does a select, one bulk insert and one
  update per existing row (not atomic) - see C8; the map should describe
  the real behaviour until C8 lands.
- Section 4 "⬜ Automatic rate fetching" is partially done (Frankfurter
  fetch + sync).
- Global history page, net worth timeline, Polish translation/language
  switch, amortized expenses in history, name suggestions are not listed.
- **Proposed change:** update statuses and add the missing rows; add a
  "Known gaps" pointer to this backlog.
- **Acceptance:** every ✅/🚧/⬜ row matches the code on `main`; a
  reviewer can find each shipped feature in the map.

### F2. `README.md` / `AGENTS.md` drift (P2, S) 🔍
- README says "rate storage/conversion UI is still on the roadmap" and
  "household invites ... not yet built" - both exist. AGENTS.md lists the
  installed spartan components as `button, input, label, field, card, alert,
  spinner, separator, utils` but `select`, `toggle` and `toggle-group` are
  also installed. AGENTS.md (line 14) and
  `docs/project-assumptions-and-plan.md` (line 3) both link to
  `docs/zalozenia-i-plan.md`, which no longer exists in the repo.
- **Proposed change:** refresh README, AGENTS.md and the plan document's
  header; document the Node version policy (A2), how to run e2e locally
  including the `pfp.lang` trick, and the date/timezone rule (D1).
- **Acceptance:** no dead relative links in `docs/`, README or AGENTS.md
  (a link checker in CI is optional); component list matches
  `src/app/ui/`.

### F3. Decision log for domain rules (P2, S) 🔍
- Domain rules are scattered across `docs/feature-map.md` entries, migration
  headers and code comments: valuation sign convention, budget is PLN-only,
  PLN as rate pivot, average-cost (not FIFO) holdings, amortization
  invariants, recurring-rule day clamp (1-28), contribution sign (B13, not
  documented anywhere yet). Collect them in `docs/domain-rules.md` so agents
  do not re-derive or contradict them, and link it from AGENTS.md.
- **Acceptance:** each rule above has one canonical paragraph in
  `docs/domain-rules.md`; feature-map entries link to it instead of
  restating it.

## G. Larger product gaps (from the roadmap, not yet started)

These are summary rows, not ready-to-pick tasks: an agent taking one should
first split it into detailed items (with acceptance criteria) in the section
it belongs to.

| Item | Priority | Effort | Notes |
| --- | --- | --- | --- |
| G1. Audit log (`audit_log` table + owner-only view) | P2 | M | see B10 |
| G2. Backup/restore + import from export file | P2 | L | depends on D19 format |
| G3. Invite-only registration | P2 | M | Simply setting `enable_signup=false` would break the current invite flow, which lets a brand-new user register before accepting (`/invite/accept` is auth-guarded). Needs either a Supabase Auth "before user created" hook that rejects sign-ups whose e-mail has no pending `household_invites` row, or admin-side provisioning (`auth.admin.inviteUserByEmail` from an edge function) that creates the account with the invite; then hide the public Register link |
| G4. Leave household / rename / delete household UI | P2 | S | see C7 |
| G5. Holding price snapshots / commodity prices used in valuation | P1 | M | see B6 |
| G6. Envelope goals / targets and per-envelope monthly budget amount | P2 | M | GoodBudget parity: "planned X per month", progress bar |
| G7. Transaction categories/tags beyond envelope, and search/filter in history | P2 | M | |
| G8. Attachments (receipts) via Supabase Storage | P3 | M | storage bucket + RLS |
| G9. Multi-currency budget transactions | P3 | L | decision B12 first |
| G10. Offline/PWA | P2 | M | see A4 |

## Suggested execution order for agents

1. **P0 bugs, independent, small:** D1, D2.
2. **Correctness / data integrity, small:** C4 (+ timeline), C6, C2, C9, B9,
   D13, B12 (decision), B4.
3. **Foundations that unblock many items:** C1 (typed client), C3 + D5 + D4 +
   D3 (shared utils, error mapping, money/date formatting), A1 (lint), D7
   (role signals), B1 (indexes).
4. **UX consistency:** D6, D8, D9, D10, D11, D14, D15, D16.
5. **Performance / model:** C5 + B6 + B8 + B13, B2 + B3, C8, D12.
6. **Features:** D17 dashboard, D19 export, D18 reports, G-items.
7. **Docs & tests continuously:** F1-F3, E1-E4 alongside each change.

Items in the same numbered group touch different files and can run in
parallel; within a group prefer the order listed.
