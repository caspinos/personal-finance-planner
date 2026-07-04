# Expense, Budget & Net Worth Tracking App — Assumptions, Requirements & Plan

> This is the canonical, English version of the project documentation. The original Polish draft is kept at [zalozenia-i-plan.md](zalozenia-i-plan.md) for historical reference only and will not be updated further.

## 1. Project Goal

The goal of the project is to build a web application for:

- tracking expenses,
- managing a household budget using an envelope-based model,
- tracking net worth and investments,
- analyzing financial data,
- sharing data between users within a household.

The application will initially be developed for private use, with the possibility of later extending it to a partner, friends, or a broader group of users.

---

## 2. Key Decisions

### 2.1. Domain Priorities

Household budgeting and net worth tracking are **equally important** and should be treated as two peer areas of the system.

### 2.2. Data Model

The primary data storage model will be **event-based**:

- financial operations are recorded as events/transactions,
- current state and periodic views are computed dynamically,
- snapshots or materialized data may be introduced later for performance optimization,
- e.g. yearly or monthly snapshots as a computation cache are acceptable.

### 2.3. Scope of Use

Initially the application will be used by a single user, but the architecture must support:

- multiple users,
- shared data,
- a household model,
- further extensibility.

### 2.4. Mode of Operation

Initially the application works **online only**. Offline support is not required in the first version.

### 2.5. Multi-Currency Support

Multi-currency support is required from the start. The system should support:

- multiple transaction currencies,
- a base currency for analysis,
- exchange rate conversions,
- exchange rate history.

### 2.6. Technology Stack

Chosen technology stack:

- **Frontend:** Angular + TypeScript
- **Backend / Database / Auth / Storage:** Supabase
- **Code repository:** GitHub
- **Application form:** Web app, prepared for PWA

### 2.7. Development Strategy

The project will be developed using:

- vibe-coding / AI-assisted development,
- under the supervision of a developer/architect,
- with an emphasis on simplicity of deployment, maintenance, and further development.

---

## 3. Main Functional Requirements

### 3.1. Users and Access

The system must support:

- login for multiple users,
- assigning users to a household,
- sharing budget and net worth data,
- roles and permissions.

#### Initial Roles

- **owner** – full management of the household and data,
- **editor** – editing financial data,
- **viewer** – read-only access.

#### Architectural Assumption

Initially the interface can be limited to a single household, but the data model must support the possibility of having multiple households in the future.

#### Future Feature: Invite-Only Access

Currently anyone can self-register via the public registration page. As a
future enhancement:

- allow an administrator/owner to disable public self-registration,
- add a user invite flow (e.g. invite by email, with a token/link to accept),
  so new users and household members can only join via an invitation once
  self-registration is disabled.

---

### 3.2. Household Budget

Functional inspiration: **GoodBudget**.

#### Requirements

- budget managed in monthly periods,
- users can define budget envelopes,
- users can allocate funds to envelopes,
- users can record expenses and assign them to envelopes,
- users can record envelope top-ups,
- users can view the budget state for a selected month,
- users can move funds between envelopes,
- users can define recurring expenses.

#### Business Rules

- envelope balances are cumulative,
- surpluses carry over to the next month,
- negative balances are allowed,
- negative balances also carry over to the next month.

---

### 3.3. Net Worth and Investment Tracking

#### Asset Scope

The system should support at least:

- bank accounts,
- investment accounts,
- funds,
- stocks / ETFs / bonds,
- currencies,
- precious metals,
- real estate,
- vehicles,
- other assets,
- liabilities.

#### Requirements

- ability to track asset values monthly,
- ability to track both account-level and instrument-level detail,
- distinguishing value changes resulting from:
  - deposits/withdrawals,
  - purchases/sales,
  - exchange rate changes,
  - market price changes,
  - manual valuation updates.

#### Classification

The system should allow classifying assets by, among others:

- asset type,
- liquidity class,
- owner,
- currency,
- institution,
- investment category.

---

### 3.4. Rates and Conversions

#### Requirements

- storing currency exchange rates,
- storing prices of selected assets (e.g. gold),
- ability to manually add/correct rates,
- ability to perform historical calculations.

#### Assumption

Integrations with external data sources may be added later. Initially, a data model with manual/semi-automatic handling is sufficient.

---

### 3.5. Analytics and Reports

#### Requirements

- dashboard with key indicators,
- monthly summaries,
- expense charts,
- net worth charts,
- analysis by category, envelope, user, period,
- month-to-month comparisons.

#### LLM and Data Analysis

Initially, no LLM will be implemented inside the application. However, data and APIs should be designed so that in the future the following is possible:

- access for an external agent to the data,
- a secure export or query layer for AI analysis.

---

### 3.6. Backup and Export

#### Requirements

The system should support two levels of data protection:

#### User/Household Export

- export of all user data to a file,
- ability to perform more granular exports.

#### System Backup

- backup of the entire database,
- ability to restore data.

#### Import

Initially, import will mainly support:

- import from a backup file.

---

## 4. Non-Functional Requirements

### 4.1. Security

The system processes financial data, so it must ensure:

- strong user authorization,
- data-level authorization,
- data isolation between households,
- encrypted data transmission,
- secure secrets management,
- auditing of key operations.

### 4.2. Maintainability

- simple deployment,
- simple developer onboarding,
- clear architecture,
- modular code structure,
- readiness for further development.

### 4.3. Costs

- low entry cost,
- possibly free or very cheap to start,
- ability to smoothly upgrade to a higher plan in the future.

### 4.4. Responsiveness

- application comfortable on desktop and mobile,
- eventual support for PWA.

---

## 5. Architectural Decisions

### 5.1. Stack

Chosen:

- Angular as the frontend,
- Supabase as:
  - authentication,
  - PostgreSQL,
  - storage,
  - a security layer based on RLS,
- GitHub as the code repository,
- TypeScript as the main project language.

### 5.2. Data Approach

Preferred approach:

- transactional/event-based recording,
- dynamic state computation,
- possibility of later introducing:
  - snapshots,
  - materialized views,
  - computation caches.

### 5.3. Security

The security model should be based on:

- `users`
- `households`
- `household_members`
- roles
- RLS at the table level

Every domain record should be linked to a `household_id`.

---

## 6. Preliminary Domain Model

### Identity and Access

- User
- Household
- HouseholdMember
- Role

### Budget

- Envelope
- BudgetTransaction
- EnvelopeTransfer
- RecurringTransaction

### Net Worth

- Asset
- AssetAccount
- AssetHolding
- AssetTransaction
- AssetValuation

### Rates

- ExchangeRate
- CommodityPrice
- PriceSource

### System

- AuditLog
- ExportJob
- ImportJob
- BackupMetadata

---

## 7. MVP Scope

### MVP – First Priority

1. user login,
2. creating and using a single household,
3. basic roles,
4. managing budget envelopes,
5. adding expenses and top-ups,
6. monthly budget view,
7. transfers between envelopes,
8. basic asset tracking,
9. manual asset valuations,
10. multi-currency support,
11. basic dashboards,
12. user/household data export.

### Post-MVP

1. recurring expenses,
2. backup import,
3. automatic rates and valuations,
4. more advanced analytics,
5. installable PWA,
6. change auditing,
7. broader backup/restore capability,
8. AI/LLM integrations.

---

## 8. Risks

### Domain Risks

- high complexity of financial logic,
- combining envelope budgeting and net worth tracking in one system,
- correctly modeling multi-currency support.

### Technical Risks

- jumping too quickly to an overly complex architecture,
- excessive load from dynamic calculations as data grows,
- errors in RLS security policies.

### Product Risks

- scope creep before delivering the MVP,
- attempting to implement too many modules at once,
- adding external integrations too early.

---

## 9. Implementation Plan

### Stage 0 – Preparation

- create the GitHub repository,
- configure the Supabase project,
- configure the Angular project,
- configure local environments,
- prepare basic CI,
- describe architecture and conventions.

### Stage 1 – Foundations

- auth,
- user and household model,
- roles and membership,
- basic application shell,
- basic RLS.

### Stage 2 – Budget

- envelope entities,
- budget transactions,
- monthly view,
- balance accumulation,
- transfers between envelopes.

### Stage 3 – Net Worth

- assets and accounts,
- asset transactions,
- manual valuations,
- currency conversions,
- basic net worth summaries.

### Stage 4 – Reports

- dashboard,
- charts,
- periodic summaries,
- basic exports.

### Stage 5 – Extensions

- recurring transactions,
- backup import,
- automatic rates,
- PWA,
- AI/LLM access.

---

## 10. Design Principles

- correct domain model first, UI convenience second,
- data security first, automation second,
- avoid over-complicating the MVP,
- design for future scale, but implement minimally,
- separate domain logic from the presentation and integration layers,
- every important record should have an audit trail,
- user data export must not depend on a single UI view.

---

## 11. Open Decisions for Later

- exact model of investment instruments,
- level of detail for asset valuations,
- strategy for automatic rate fetching,
- form of full database backup,
- level of change auditing,
- final scope of AI features.

---

## 12. Starting Recommendation

The project starts as:

- an Angular application,
- with a backend and database in Supabase,
- with a SQL-first architecture,
- with a data model based on events,
- with multi-currency support from the start,
- with security based on household + roles + RLS,
- with an MVP focused equally on budget and net worth.
