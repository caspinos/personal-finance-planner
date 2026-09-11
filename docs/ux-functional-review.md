# UX and Functionality Review — Personal Finance Planner

Review date: 2026-09-11
Scope: application source code (Angular + Supabase), migrations, e2e tests, documentation.
Method: static code analysis (the app was not run in a browser — see "Caveats").

Priority legend:
- **P1** — seriously hampers everyday use or leads to incorrect data
- **P2** — significant inconvenience, worth fixing in the next iterations
- **P3** — minor / polish

---

## Summary — the 10 most important findings

1. **The dashboard is empty** — the first screen shows no numbers at all; none of the indicators from the plan (MVP item 11).
2. **Recording an expense takes too long** — two clicks to reach the form on desktop (three on mobile, where the hamburger menu is an extra step), no "save and add another", no "Cancel" button, and editing returns the user to the wrong place.
3. **Envelope cards show only the cumulative balance** — no "spent X of Y this month", no envelope targets/limits, no total across envelopes.
4. **Asset accounts and holdings cannot be edited or deleted** — a typo means creating a second account, with history split across the two.
5. **A holding's market value is the price of its last transaction** — unrealized gain only reflects differences between transaction prices, never market movement; commodity prices are stored but never used; holdings do not feed the account valuation.
6. **The net worth total mixes currencies** when a rate is missing, instead of skipping the account or flagging the total as incomplete.
7. **Roles are not enforced in the UI** — a `viewer` sees save buttons and gets a raw RLS error after submitting a form.
8. **No password reset and no household switcher** (both cheap to add: Supabase Auth and `selectHousehold` already exist).
9. **Numbers and dates are formatted in English in the Polish UI** — no `registerLocaleData(pl)`.
10. **No search/filters in history and no data export** (MVP item 12).

Details and the remaining notes (17 × P1, 58 × P2, 25 × P3 in total) are in the sections below; the missing-feature list with a proposed order is in section 7.

---

## 1. Navigation and application shell (shell, dashboard, routing)

Sources: `src/app/layout/shell/shell.ts`, `src/app/features/dashboard/dashboard.ts`, `src/app/app.routes.ts`

### What works well
- Simple, flat navigation (5 items), a mobile version with a hamburger menu, a PL/EN language switcher, the signed-in user's e-mail and sign-out in the header.
- All routes are lazy-loaded; `authGuard` + `householdGuard` lead a new user straight to household creation.

### Ergonomic problems
- **P1 — The dashboard is a placeholder.** The landing page after sign-in is a welcome card with two buttons. The user sees not a single number (envelope balances, this month's spending, net worth, upcoming recurring rules). Every visit needs an extra click and the first screen carries no information.
- **P2 — No active-item indication in the menu.** The links in `shell.ts` do not use `routerLinkActive`; the user cannot tell which section they are in (especially on sub-pages such as `/budget/history`).
- **P2 — No household indicator/switcher.** The current household's name appears only inside two pages (the dashboard heading and the members page subtitle), never persistently in the application shell. A user belonging to several households (possible via invites) has no way to switch context — confirmed as not done in `docs/feature-map.md`. Risk of entering operations into the wrong household without noticing.
- **P2 — No global "quick add expense" button.** The most frequent action (recording an expense) requires Dashboard → Budget → "Record transaction". On a phone: hamburger → Budget → scroll → button. A persistent action button (FAB / header item) available on every screen is good practice.
- **P3 — The language selector is a native `<select>`** with hand-written styling, inconsistent with the rest (spartan). Labels are "PL/EN" instead of "Polski/English". `aria-label="Language"` and `aria-label="Menu"` are not translated.
- **P3 — No breadcrumbs/page titles.** `document.title` is not set per route (no `title:` in the route definitions) — every browser tab has the same name and browser history is useless.
- **P3 — No `**` (404) route.** A wrong address shows an empty shell instead of a message and a link to the dashboard.
- **P3 — No dark mode.** The `:root.dark` palette is defined in `styles.scss`, but nothing enables it (no toggle and no reaction to `prefers-color-scheme`).

## 2. Envelope budget

Sources: `src/app/features/budget/**`, `src/app/core/budget/budget.service.ts`

### What works well
- The event-based model (transactions + transfers, balance computed in SQL) — balances carry over between months automatically.
- Amortized (spread-over-time) expenses with a monthly-slice preview in the form — a feature rarely found in simple tools, well thought out (editing the header re-derives the slices).
- Transaction-name suggestions with automatic envelope selection — a big help for repeat expenses.
- Bulk envelope funding (`bulk-funding-form`) with a "quick amount" and select all / clear all.
- Envelope deletion with history transfer (atomic in SQL) — safe.
- Recurring rules with pause/resume.

### Ergonomic problems — main budget screen (`budget.ts`)
- **P1 — Envelope cards show only the cumulative balance.** Key monthly information is missing: how much came in, how much was spent this month, what share of the funding has been used (progress bar). Without it there is no way to judge "how am I doing this month" — each envelope's history has to be opened separately.
- **P1 — No total / summary at the top of the budget screen.** There is no total across all envelopes, no monthly spend and income, no count of envelopes in the red. A user with 10+ envelopes has no overview.
- **P1 — No "unallocated" / "to be assigned" concept.** In the envelope method (YNAB, Goodbudget) income first lands in a pool and is then split into envelopes. Here "income" is entered directly into an envelope (type `income` in `budget_transactions`), so nothing checks whether the sum of top-ups exceeds the household's real income. There is also no place for income that has not yet been split.
- **P2 — Overloaded action bar.** Six buttons in one row (History, Transfer, Record transaction, Fund envelopes, New envelope, New recurring rule), three of them in the same `secondary` variant. On a narrow screen they wrap onto 2–3 rows. Recommendation: one primary button (Record expense), the rest in a "More" menu / a budget settings section.
- **P2 — Month switcher without "Today" / month picker.** Returning to the current month after browsing a few months back requires clicking the arrow repeatedly. There is no `<input type="month">` and no jump to an arbitrary month. The same component is copied in 3 places (`budget.ts`, `history.ts`, `envelope-history.ts`) — worth extracting a shared `MonthSwitcher`.
- **P2 — The selected month is not in the URL.** After opening an envelope's history and returning, the view resets to the current month; a page refresh also loses the context. The month should be a query parameter (`?month=2026-08`).
- **P2 — Envelopes are ordered only by creation date.** No manual ordering (drag & drop / sort order), no grouping (e.g. "Fixed", "Variable", "Savings"), no sorting by balance. With more envelopes the list becomes chaotic.
- **P2 — Recurring rules run when the budget page is opened** (`processDueRecurringRules()` in `loadAll()`). If nobody opens the Budget tab for a few days, top-ups/charges are recorded late (the date is verified in SQL — see migrations). The user gets no feedback that "3 rules have just been posted". Better: `pg_cron`/edge function + a toast after execution. Note that `process_due_recurring_rules` cannot be reused as-is by a scheduler: it checks `is_household_member`, which relies on `auth.uid()`, so a `pg_cron`/service-role call without a user JWT would be rejected — a scheduler-specific variant (or an internal function iterating over all households without the membership check) is needed.
- **P2 — Recurring rules are displayed at the bottom of the main budget page** as a full list with Edit/Pause/Delete buttons. This is configuration, not daily work — it takes up space below the envelopes. A better place: a separate sub-page/tab "Rules" or a collapsible section.
- **P2 — "PLN" is hard-coded in templates** (`{{ ... }} PLN`), even though `budget_transactions` has a `currency` column and the household has a `base_currency`. If someone sets the base currency to EUR, the budget is still in PLN (with the "≈ in base currency" value showing a conversion). Confusing for a non-Polish user and inconsistent with the project's multi-currency assumption.
- **P3 — Deletion confirmed via `window.confirm`** (rules, transactions, transfers) instead of a spartan dialog; cannot be styled, looks foreign next to the rest of the UI, blocks the whole tab.
- **P3 — `aria-label="Previous month"` / `"Next month"` are not translated.**
- **P3 — The empty state (no envelopes)** is text only; the card itself has no contextual "Create your first envelope" button (the user has to find "New envelope" in the action bar above) and there are no starter templates (e.g. Food, Housing, Transport, Entertainment, Savings).

### Ergonomic problems — forms (transaction, transfer, envelope, rule)
- **P1 — Forms have no "Cancel"/"Back" button.** The only way out is the browser's back button or the menu. Affects `transaction-form`, `transfer-form`, `envelope-form`, `recurring-rule-form`, `bulk-funding-form`. (Exception: `envelope-delete` has "Cancel".)
- **P1 — No fast repeated entry.** After saving a transaction the app always returns to `/budget`. Entering 10 receipts = 10 × (button → form → save → return). Needed: "Save and add another" (keeping date and envelope) or a form in a dialog/side panel above the list.
- **P1 — After editing from "History of all operations" the user lands on the envelope's history**, not where they came from (`navigateByUrl('/budget/envelopes/${id}')`). No `returnUrl`. Same after editing from an envelope's history in another month — it returns to the current month.
- **P2 — Field order in the transaction form is sub-optimal.** "Name" (which auto-selects the envelope based on history) is the last field. The natural flow: Name → (auto) Envelope → Amount → Date. The amount field defaults to `0` — the user has to delete it before typing; better an empty field with a `0.00` placeholder.
- **P2 — The "Expense/Income" type is a toggle group outside the reactive form** — fine, but in the transfer form and elsewhere select validation appears only after `submit`; the "missing envelope" message is not linked to the control via `aria-describedby`.
- **P2 — Forms are vertically centred in a `min-h-svh` container** *inside* the shell, which already has a header. Result: the page is taller than the viewport (header + 100svh), a needless scrollbar appears, and on desktop the form "floats" in the middle of an empty screen far from the menu. The container should be a normal block at the top of the page (like the lists).
- **P2 — Name suggestions use a native `<datalist>`.** Its presentation and accessibility are browser-dependent (the dropdown looks and behaves differently in Chrome, Firefox and iOS Safari, and appears only after typing in some of them), it does not show the envelope/amount next to the suggestion, and the cap of the 200 most recent rows without per-envelope deduplication is arbitrary. Better: a custom combobox (spartan `command`/`combobox`) with the last amount and envelope in the suggestion.
- **P2 — No categories/tags and no note on a transaction.** There is only `name`. You cannot record e.g. "Biedronka — barbecue shopping" with a tag, or attach a receipt. Per-category reports (plan Stage 4) have nothing to work on, because category = envelope.
- **P2 — No indication of who recorded an operation** (`created_by` is in the database, not shown) — when sharing with household members this matters ("who spent 300 zł from Entertainment?").
- **P2 — Recurring rules are monthly only (day 1–28).** No weekly, quarterly, yearly (insurance, tax), no end date and no start date (starts from the "next occurrence"). No preview "X rules totalling Y will run this month".
- **P2 — Bulk funding does not remember previous amounts.** Amounts have to be typed from scratch every month; no "repeat last month's funding" and no default amount per envelope (envelope target/limit).
- **P2 — Bulk funding saves entries sequentially, non-atomically** (a `recordTransaction` loop in `bulk-funding-form`). On an error midway some envelopes are funded and some are not; the message only reports the number saved. It should go through a single RPC/transaction (the same applies to `recordValuations` in net worth, which also issues several requests and can partially save).
- **P3 — Inconsistent date parsing:** `transaction-form` uses the safe `fromDateInputValue`, while `transfer-form` and `bulk-funding-form` use `new Date(occurredOn)` (UTC). In negative-offset time zones the date shifts by a day. Harmless in Poland, but a time bomb for multi-currency / household members abroad.
- **P3 — Amount inputs are `type="number"`** without `inputmode="decimal"` and without handling a decimal comma on a Polish keyboard (on Android the numeric keyboard sometimes lacks a dot). Consider a custom amount field accepting "12,50".

### Ergonomic problems — history (`history.ts`, `envelope-history.ts`)
- **P1 — No search and no filters** (by name, envelope, type, amount range). The global history is a single-month list only; finding "when did I last pay the car insurance" means clicking month by month.
- **P2 — No summaries in history:** total income, spending and month balance above the list; no grouping by day.
- **P2 — The global history does not show amortization slices** (`loadAllEvents` does not fetch `get_amortized_charges`), so the sum of the listed items does not match the change in envelope balances.
- **P2 — The list consists of bordered cards with two buttons on every row** (Edit, Delete). With 100 operations a month this is visually heavy and long; a table/compact list with actions in a context menu or on hover would be more readable. No pagination/virtualization.
- **P2 — The delete-confirmation message receives the raw `kind`** (`transaction`/`transfer`) as a parameter — confirmed in the translation files: a Polish user reads "Usunąć tę operację (transaction)?".
- **P3 — No export (CSV)** of the operation list.

## 3. Net worth and investments

Sources: `src/app/features/net-worth/**`, `src/app/core/net-worth/net-worth.service.ts`, migrations `*net_worth*`, `*asset_holdings*`, `*signed_valuation_values*`

### What works well
- The bulk valuation form (`bulk-valuation-form`) — a table with the previous value, prefill for an already-valued date, existing rows corrected rather than duplicated on save, race protection when changing the date. The best-designed screen in the app.
- The 12-month timeline (`net-worth-timeline`) with a total and month-over-month change, thoughtful handling of archived accounts.
- Accounts grouped by type with subtotals, a liquidity filter, and on the per-account card a "missing rate" warning instead of a wrong converted number (the aggregates do not share this property — see the P1 below).
- Value sign consistent with its contribution to net worth (liabilities negative), an overpaid-liability warning without blocking.

### Ergonomic problems — main screen (`net-worth.ts`)
- **P1 — No Assets / Liabilities / Net split.** There is only a single "net worth" number. The standard view is three indicators (total assets, total liabilities, net) plus the change since the previous month — without it the timeline has to be consulted.
- **P1 — The total and group subtotals mix currencies when a rate is missing.** `totalNetWorth` and `group.subtotal` compute `value_in_base ?? value` — a USD account without a rate is added to the PLN total at face value. There is a textual warning, but the number itself is wrong. Better: skip such an account in the total and show "total incomplete", or withhold the total.
- **P2 — No "as of date" picker.** `asOf` is always today; there is no way to see the state at the end of last year without reading the timeline.
- **P2 — No chart.** The timeline is a table of numbers only; a net worth line chart and a stacked bar per asset type are a basic need (plan Stage 4).
- **P2 — No indication of "stale" valuations.** The card shows the valuation date but does not highlight accounts not valued for >30/60 days; there is no "needs update" list.
- **P2 — No structure/allocation.** No percentage share of each group in net worth, no split by liquidity or owner (the `owner_name` field exists but is neither shown nor filterable).
- **P2 — Archived accounts are invisible** on the main list and there is no "show archived" toggle — the only way to reach them is the timeline (if the account had a value in the window) or a direct URL.
- **P3 — Per-account cards repeat the envelope card layout**; with 15+ accounts the list is long. A table view (name, type, currency, value, valuation date, change) would be more readable — like the bulk valuation form.

### Ergonomic problems — account, valuations
- **P1 — An account cannot be edited.** `NetWorthService` has no `updateAccount`, and `account-form` handles creation only. A typo in the name, a change of institution, category, liquidity or type requires creating a second account; the old one and its valuations remain, so the history is split across two accounts and has to be tidied by hand. There is no account deletion either (even for an empty one).
- **P2 — The account currency is a free 3-letter text field** with no list/ISO validation ("ZLO" is accepted). Recommendation: a select with common currencies plus the option to type a custom one.
- **P2 — "Category" and "Owner" are free text** with no suggestions from existing values, which leads to drift ("Me", "me", "Dariusz").
- **P2 — The single-valuation form requires typing the full value.** No "change by amount" mode (+500 / −200) and no previous value shown next to the field (the bulk form has it, this one does not).
- **P2 — The "contribution" field is unexplained in the form** — the user does not know why to fill it in or how it affects reports (currently it is used nowhere in the UI except being displayed in history). The collected data brings no value until there is a "growth from contributions vs. from the market" report.
- **P2 — The valuation history does not show the change between valuations** (delta, %), it is a raw list.
- **P3 — After saving a valuation from the main screen the user lands on the account history**, not where they came from (the same `returnUrl` problem as in the budget).

### Ergonomic problems — holdings (investment instruments)
- **P1 — A holding's market value = the price of its last transaction.** `get_holding_positions` takes `latest_price` from the most recent buy/sell; a current market price cannot be entered without a fake transaction. As a result "unrealized gain" reflects only the difference between the last transaction price and the average cost of earlier buys — never actual market movement — so the indicator is stale and misleading. Needed: an instrument price table (date, price) — analogous to `commodity_prices` — and an "update prices" form similar to the bulk valuations.
- **P1 — Holdings do not feed the account valuation.** The documentation says holdings are "additive" to the manual account valuation. In practice the user records an ETF purchase and separately has to update the brokerage account's value by hand, otherwise net worth does not move. Suggestion: an option "account value = sum of holdings + cash" or a "record valuation from positions" button.
- **P2 — A holding cannot be edited, archived or deleted** (no service methods and no UI); a typo in the ticker stays forever.
- **P2 — A sale does not compute realized gain** and there is no history of realized gains (relevant for tax, PIT-38).
- **P2 — Holdings are available only for `investment` accounts**; `precious_metals` (ounces of gold) or `currency` (foreign cash) accounts cannot have quantity positions, even though a `commodity_prices` table exists.
- **P3 — The total value of holdings is not shown** on the account page (only per position), nor compared with the manual account valuation.

## 4. Exchange rates and commodity prices

Sources: `src/app/features/rates/**`, `src/app/core/rates/**`, migration `20260705010000_multi_currency_rates.sql`

### What works well
- Fetching rates from frankfurter.dev with one button; rates stored with date and source.
- The household base currency editable by the owner; for a single account a missing rate yields `null` plus a warning rather than a wrong converted value (the net worth aggregates still fall back to the raw value — see section 3).
- Permissions (owner/editor/viewer) correctly reflected in this page's UI.

### Problems
- **P1 — Commodity prices are a dead feature.** The `commodity_prices` table is not used by any SQL function or any view except its own list. The user enters a gold price and nothing follows (a "precious metals" account still needs a manual valuation in PLN). Either wire it into valuations (quantity × price) or hide the section so it does not raise false expectations.
- **P2 — Sync covers only currencies that already have a manual rate** (`trackedCurrencies` derived from existing rates). A new user with a EUR account will not see the sync button until they enter the first rate by hand. The list of currencies to sync should come from the currencies of accounts/holdings/transactions.
- **P2 — A second "Sync" click on the same day fails** (uniqueness on `household_id, currency, rate_date` + `insert` instead of `upsert`), and the message only says "failed to fetch rates for: EUR, USD", which is misleading.
- **P2 — No automatic, scheduled rate fetching** (plan: post-MVP). Without it base-currency values drift between manual syncs, and the timeline uses the "latest rate as of the day" — with infrequent syncs historical months are converted at an old rate. Solution: `pg_cron` + an edge function fetching daily rates for the household's currencies, plus a history backfill when a new currency is added.
- **P2 — The rate list is a flat list of all entries** (every currency × every date). After a few months of daily syncs it will have hundreds of items. It should show one card per currency (current rate, date, source) with an expandable history and possibly a mini chart.
- **P2 — Everything is "to PLN", even when the base currency is EUR.** The entry "1 EUR = 4.30 PLN" next to "base currency: EUR" is incomprehensible to the user; the UI should translate to "1 USD = 0.92 EUR" (the PLN pivot can stay in the database).
- **P3 — The base currency and the rate currency are text fields** with no ISO list; a non-existent code can be saved, and frankfurter then returns an error.
- **P3 — "Rates" is a separate item in the main menu.** For most household members it is configuration used occasionally; better under "Household settings" together with the base currency, members and (in future) export.

## 5. Household, sign-in, onboarding

Sources: `src/app/features/auth/**`, `src/app/features/household/**`, `src/app/core/auth/**`, `src/app/core/household/**`

### What works well
- Invites by link with a role, `returnUrl` through sign-in/registration, link copying, invite revocation, role changes.
- Guards lead a new user straight to household creation.

### Problems
- **P1 — Role permissions are not reflected in the UI of the budget and net worth write flows.** Only three screens gate actions by role (the rates page, the household members page and the envelope delete entry point). A `viewer` sees all the "Record transaction", "New envelope", "Add valuation" buttons, fills in the form and only after saving gets a raw Postgres RLS error ("new row violates row-level security policy"). `currentRole()` is only computed after `loadMembers()`, which only 3 screens call. The role should be loaded once at start-up (e.g. in `householdGuard`) and used to hide/disable write actions.
- **P1 — No password reset** ("Forgot password") and no password/e-mail change after signing in. For an app with real financial data this is blocking — a forgotten password = loss of access.
- **P2 — No household switcher** (see section 1). `selectHousehold` exists in the service; only the UI is missing. A person invited to a second household is switched into it on acceptance and has no way back to their own.
- **P2 — The household cannot be renamed**, deleted or left. Ownership can only be handed over indirectly (an owner promotes another member to `owner` through the role selector, and then that person demotes or removes the first one); there is no one-step "transfer ownership" or "leave household" flow. The UI hides role/removal controls for the signed-in member, so an owner cannot demote or remove themselves, but I did not verify whether SQL guards against a household ending up with no owner through other paths.
- **P2 — Members are identified by e-mail only.** No display name/avatar; the operation history does not show who entered what (`created_by` unused in the UI).
- **P2 — Public registration is open** (noted in the feature map as to-do). For a household tool with a public production address this is a risk (spam accounts). Consider registration only via an invite link or an allow-list of e-mails.
- **P2 — The sign-in/registration screens have no language switcher.** On a first visit (no `pfp.lang` stored yet) they fall back to Polish, and there is no way to change the language before signing in; a returning user keeps whatever they previously selected; `<html lang="en">` is fixed and does not follow the language (screen readers read Polish text with an English voice).
- **P2 — The password field has no "show password" toggle** and no requirements hint (the 6-character minimum is only learned from the error message).
- **P3 — After registration with e-mail confirmation enabled** the user sees only a "check your inbox" message with no "resend confirmation" action (the sign-in link with `returnUrl` is present in the card footer).
- **P3 — Invites are not e-mailed** (no SMTP) — documented. At least a "Share" button (Web Share API) on the phone would help.
- **P3 — Onboarding ends at the household name.** After creation the user lands on an empty dashboard and has to discover on their own that envelopes must be created. A wizard (name → base currency → starter envelope set → first funding) would shorten time to first value.

## 6. UI consistency, accessibility, i18n, user-visible technical quality

### Number and date formatting
- **P1 — Angular's Polish locale is not registered.** There is no `registerLocaleData(localePl)` and no `LOCALE_ID` in `app.config.ts`/`main.ts`. Every `| number` and `| date` renders in English regardless of the chosen language: "1,234.56 PLN" instead of "1 234,56 zł", "Sep 11, 2026" instead of "11 wrz 2026". Only the month headings (`toLocaleDateString` with `localeTag`) are Polish — the effect is inconsistent on a single screen. Fix: either register the locale at bootstrap (`LOCALE_ID` from the stored language, with a reload/re-bootstrap on language change, since `LOCALE_ID` is a plain injected string and does not react to the Transloco signal), or custom reactive pipes based on `Intl` with `language.localeTag()`.
- **P2 — No currency pipe.** Amounts are assembled by hand as `{{ x | number }} {{ currency }}` in ~20 places; no `Intl.NumberFormat(..., { style: 'currency' })` formatting, no tabular alignment (`tabular-nums` only in tables), differing precision (`1.2-2`, `1.0-0`, `1.2-4`, `1.0-6`) with no rationale visible to the user.
- **P3 — Negative amounts are highlighted with colour (`text-destructive`) on top of the minus sign** rendered by `DecimalPipe`, so the sign is not conveyed by colour alone. The colour is a redundant cue and fine as such; for consistency consider the same treatment (sign + colour) in every list, including rows where the sign is deliberately dropped (amortized payments shown budget-neutral), with a label instead.

### Consistency of patterns
- **P2 — Three different page layouts:** lists (full width, heading + cards), forms (centred `min-h-svh` in a narrow card), bulk valuations (full width with "Back"). Forms look like sign-in screens even though they are inside the app.
- **P2 — Duplicated code in every component:** `toDateInputValue`, `startOfMonth`, `endOfMonth`, `extractMessage`, the month switcher, `LIQUIDITY_CLASSES`, `ACCOUNT_TYPES`. Not a direct user problem, but it raises the risk of inconsistency (already visible: different date parsing).
- **P2 — No global notifications (toast).** After saving there is no "Transaction saved" confirmation; after a list-loading error the message appears only where an `hlmAlert` happens to be. Success is signalled solely by the redirect.
- **P2 — Supabase error messages are shown verbatim** (`error.message`), e.g. "duplicate key value violates unique constraint …", "JSON object requested, multiple (or no) rows returned". They should be mapped to understandable (and translated) texts.
- **P3 — `window.confirm` in 8 places** instead of `hlm-alert-dialog` (available in the spartan catalogue).
- **P3 — No skeleton loading states**; instead a "Loading…" text, so the layout "jumps" after loading.

### Accessibility
- **P2 — Untranslated `aria-label`s** ("Previous month", "Next month", "Language", "Menu", "Previous 12 months").
- **P2 — Errors on the signal-driven spartan selects are not linked to the control.** Reactive `hlmInput` controls are wired automatically (`BrnFieldControlDescribedBy` plus the error ID registered by `hlm-field-error`), but the selects (envelope, account, type) are managed by signals outside the `FormGroup`, so they never get an `invalid`/`aria-invalid` state and their `forceShow` error is a purely visual message that appears only after submit.
- **P2 — Focus after navigation** is not moved to the page heading; after navigating to a form a screen reader stays on the menu button.
- **P3 — The `‹`/`›` buttons (HTML entities)** as the only content — works with aria-label, but lucide icons would be more readable and consistent with the hamburger.
- An AXE audit has not been performed (feature map). To be done with the app running.

### i18n
- `en.json`/`pl.json` have an identical set of 485 keys, no missing translations — good.
- **P2 — The `{{kind}}` parameter in the delete confirmation** receives the raw value `transaction`/`transfer`, so a Polish user reads "Usunąć tę operację (transaction)?".
- **P3 — Account type and liquidity names are translated, but the free-text "category" and "owner" are not** — as expected, but worth noting in the form.
- **P3 — The tab title "PersonalFinancePlanner"** (CamelCase) and no `<meta name="description">`.

### Mobile / PWA
- The responsive layout is correct (1/2/3-column grid, hamburger), but:
- **P2 — No PWA** (manifest, icon, service worker) — plan post-MVP. Browsers still allow adding the site to the home screen, but without a manifest there is no install prompt, no standalone window, no proper icon/splash and no offline shell — and the phone is the main scenario for entering expenses on the go.
- **P2 — No offline mode / write queue** — in a shop without coverage the save fails and the user has to remember to re-enter it.
- **P3 — Tall cards with footer buttons** require a lot of scrolling on a phone; a compact list (one line = envelope + balance) would work better on a small screen.

## 7. Missing features — proposals

Grouped as: (A) features whose absence hurts most today, (B) features that significantly raise usefulness, (C) further ideas. Parentheses reference the plan (`docs/project-assumptions-and-plan.md`) where a feature is already foreseen.

### A. First priority (they close the MVP from the plan)
1. **A dashboard with real indicators** (MVP item 11): balance of all envelopes, this month's spending and income vs. the previous month, the 3–5 envelopes closest to zero / in the red, net worth + month-over-month change, a list of accounts with stale valuations, recurring rules due this week, the last 5 operations, an "add expense" shortcut.
2. **Quick expense entry** from every screen (dialog/side panel or a persistent button), with "save and add another", default date = last used, envelope from the name suggestion. Consider a keyboard shortcut (`n`).
3. **Data export** (MVP item 12): CSV/XLSX per table (transactions, transfers, valuations, holdings, rates) and a full JSON export of the household; simplest as an SQL function returning JSON + download in the browser.
4. **Editing and deleting asset accounts and holdings** (see section 3).
5. **Password reset and change** (Supabase Auth has it ready: `resetPasswordForEmail`, `updateUser`).
6. **Household indicator and switcher** in the header + renaming the household.
7. **Role enforcement in the UI** — hiding/disabling write actions for `viewer`, role loaded at start-up.
8. **Polish number and date localization** (`registerLocaleData`) and a shared amount-with-currency pipe.

### B. Significantly raise usefulness
9. **Envelope targets/limits (monthly budget per envelope).** A planned monthly amount per envelope; the envelope card shows "spent 430 / 600 zł" with a progress bar, and bulk funding gets a "fund according to plan" button. One of the most missed things compared with GoodBudget (the plan's inspiration). Needs only a `monthly_target` column in `envelopes`.
10. **A "to be assigned" pool (unallocated income).** Household income lands in a pool and funding envelopes = a transfer from the pool; a sum of top-ups > income is visible immediately. Doable without a schema change as a special system envelope "Unassigned" + a view.
11. **History search and filters** (text, envelope, type, date range, amount, author) + income/spend totals above the list + export of the result. A date range instead of a fixed month.
12. **Reports and charts** (plan 3.5): spending per envelope in the month (bars/donut), 12-month spending trend, income vs. spending, net worth over time (line), asset allocation (donut per type/liquidity), net worth growth from contributions vs. from the market (`contribution_amount` finally used).
13. **Instrument prices (holdings) and commodity prices wired into valuations**: a `holding_prices` table, a bulk "update prices" form, automatic ETF/stock price import (e.g. stooq/yahoo) as post-MVP; investment account value derived from positions.
14. **Realized gain** on sale (FIFO or average) + an annual statement for PIT-38.
15. **Automatic exchange rates** (`pg_cron` + a frankfurter edge function), history backfill for a new currency, upsert instead of insert.
16. **Recurring rules: frequency** (weekly, every N months, yearly), start/end date, preview of upcoming runs, server-side execution (`pg_cron`) instead of on page load + a "posted" notification.
17. **Envelope sorting and grouping** (manual order, groups "Fixed / Variable / Goals", envelope icon/colour), card/list view choice.
18. **Note, tags and attachment (receipt) on a transaction**; categories independent of envelopes for reporting (e.g. envelope "Home", category "Utilities").
19. **Source account of an expense** — linking a budget transaction to an asset account (bank/cash/card), which allows reconciling the bank balance with the envelope state (today budget and net worth are two independent worlds).
20. **Transaction import from a bank CSV** (column mapping, deduplication, envelope suggestion based on name history) — the biggest shortcut in daily use.
21. **PWA + offline mode with a write queue** (plan post-MVP), a home-screen shortcut on the phone.
22. **Toasts and dialogs** (spartan `sonner`/`alert-dialog`), mapping Supabase errors to messages, `returnUrl` after editing.
23. **Change log (audit log)** — plan post-MVP; when sharing with household members "who changed the amount and when" matters. Minimal version: `updated_by/updated_at` on tables + a "recent changes" view.

### C. Further ideas
24. Savings goals with a date and forecast ("saving 500 zł/month you will reach 20,000 zł in March 2028").
25. End-of-month cash-flow forecast (envelope balances − upcoming rules).
26. Notifications (e-mail/push) about an envelope in the red, a valuation to update, a rule to confirm.
27. A phone "share target" (Web Share Target, to send a receipt photo to the app).
28. An API layer / export for LLM analysis (plan 3.5) — e.g. a read-only SQL view + a key per household.
29. Splitting an expense between envelopes and shared expenses/refunds between household members.
30. Year archive: an annual summary (how much was spent per envelope in 2025 vs. 2024).

### Suggested implementation order (my recommendation)
1. Number/date localization + forms (cancel, returnUrl, save and add another, field order) — small changes, big effect.
2. Dashboard with indicators + envelope targets + progress bar on cards.
3. Editing accounts/holdings, password reset, roles in the UI, household switcher.
4. History filters/search + CSV export.
5. Holding and commodity prices wired into valuations; automatic rates.
6. Charts and reports.
7. PWA/offline, CSV import.

## Caveats

- The review was done solely from the code (Angular templates, services, SQL migrations, e2e tests). The app **was not run in a browser** in this session — no Supabase stack (Docker) was available. Conclusions about appearance (e.g. the `min-h-svh` form height, action-bar wrapping) are inferred from CSS classes, not observed; they are worth confirming visually.
- Not every RLS policy was verified for edge cases (e.g. protecting the last owner) — where I write "SQL may enforce this", it is an assumption.
- An accessibility audit (AXE) and a screen-reader test require the running app — the remarks in section 6 come from markup analysis.
- The judgement of "what hurts most" is my interpretation based on typical household-budget usage scenarios (daily expense entry, monthly envelope funding and valuation updates); the real priorities depend on how the household actually uses the tool.
