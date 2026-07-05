
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## Project Context

This is **Personal Finance Planner** — a web app for tracking expenses, envelope-style household budgeting, and net worth/investment tracking, with data sharing across household members.

- **Frontend:** Angular (standalone components, signals) + TypeScript
- **Backend:** Supabase (Postgres, Auth, Storage, RLS-based authorization)
- **Data model:** event-sourced — financial transactions are recorded as immutable events; current/periodic states are derived dynamically (snapshots/materialized views may be introduced later for performance)
- **Multi-tenancy:** every domain record belongs to a `household`; access is controlled via `household_members` roles (`owner`, `editor`, `viewer`) enforced through Postgres RLS
- **Multi-currency:** required from the start — transactional currencies, a base currency for analysis, and historical exchange rates
- **Core domains:** budget envelopes (income allocation, expenses, transfers, recurring transactions) and assets/net worth (accounts, holdings, valuations, liabilities)
- Full project background, domain model, and roadmap: see [docs/project-assumptions-and-plan.md](docs/project-assumptions-and-plan.md) (canonical, English) — [docs/zalozenia-i-plan.md](docs/zalozenia-i-plan.md) is the original Polish draft, kept temporarily for reference only.
- Current implementation status (what's done vs. still to build): see [docs/feature-map.md](docs/feature-map.md) — keep it up to date as features land.

### Documentation Language

- All project documentation (in `docs/` and elsewhere) MUST be written in **English** going forward.
- Code comments, commit messages, and identifiers must also be in English.

## Development, Testing & Deployment Workflow

This is a **personal/household project**, run by a single developer — optimize for a simple, low-maintenance, free-tier-friendly workflow over enterprise-grade process. There is no dedicated staging environment; local Supabase + the `main` branch's Cloudflare preview deployment fill that role (see [Branches](#branches-main-vs-prod) below).

### Local development

- Backend: `supabase start` runs the local Postgres/Auth/Storage stack (requires Docker). The dev frontend config (`src/environments/environment.development.ts`) points at it (`http://127.0.0.1:54321`).
- Frontend: `npm start` (`ng serve`) serves at `http://localhost:4200`.
- Schema changes: add a new file under `supabase/migrations/` (`supabase migration new <name>`), then `supabase db reset` to replay all migrations locally before testing against them.

### Testing

- Unit tests: `npm test` (Vitest) — runs in CI (`.github/workflows/ci.yml`) on every push/PR to `main`.
- E2E tests: `npm run e2e` (Playwright, in `e2e/`) — runs against the local dev server and local Supabase stack. Not yet wired into CI; run manually before merging changes to user-facing flows.
- Manual testing: every branch/PR gets an automatic Cloudflare preview deployment (frontend only — Supabase branching/per-PR preview databases is a paid feature and is **not** enabled here). Verify schema/RLS changes locally against `supabase start` before merging.

### Branches: `main` vs `prod`

- **`main`** — feature branches/PRs merge here. Cloudflare auto-deploys `main` to a **preview** URL (not production); Supabase does **not** apply its migrations here.
- **`prod`** — the actual production branch. It starts equal to `main` and is only updated by a deliberate promotion (merge/fast-forward `main` → `prod`) once changes have been verified on the `main` preview. Cloudflare's production branch and Supabase's GitHub-integration production branch are both configured to watch `prod`, not `main`.
- This exists because there's no automated e2e coverage in CI and no per-PR preview database — `prod` is the manual gate that replaces those safety nets for a single-developer project.
- To release: after confirming things work on the `main` preview deployment, promote with a PR (or fast-forward merge) from `main` into `prod`. That single action deploys the frontend to production **and** applies any pending migrations to the production database.

### Deployment (triggered by promoting `main` → `prod`)

- **Frontend:** Cloudflare (Workers with static assets, see `wrangler.jsonc`) is connected to this GitHub repo; its production branch is `prod`.
- **Backend:** Supabase's GitHub integration auto-applies new files in `supabase/migrations/` to the production database when `prod` is updated. Do **not** run `supabase db push` manually against the linked production project — the GitHub integration is the only path migrations should take to prod, so every schema change goes through a reviewed promotion to `prod`.
- Production Supabase project ref: `bliwvaoxxydeampcjqvq` (linked via `supabase link`).

### Secrets

- `src/environments/environment.ts` (production) commits the real `supabaseUrl` and the **publishable** (anon) key — safe to commit, since access is enforced entirely by Postgres RLS policies.
- **Never** commit the `service_role`/secret Supabase key anywhere, and never print it to logs/output.
- Cloudflare's build Node.js version is pinned via `.nvmrc` / `engines` in `package.json` — the Angular CLI requires a newer Node than Cloudflare's default build image provides.

## UI Library: spartan/ui

The app uses [spartan/ui](https://www.spartan.ng) for UI components. It has a two-layer architecture:

- **Brain** (`@spartan-ng/brain/<name>`) — unstyled, accessible primitives installed from npm. Never edit it.
- **Helm** (`@spartan-ng/helm/<name>`) — Tailwind-styled components, **copied into this repo** by the CLI so we own and can customize them.

Project-specific config (see `components.json`):

- Components path: `src/app/ui` (Helm code lives here, not `libs/ui` — this is a plain Angular CLI app, not an Nx monorepo)
- Import alias: `@spartan-ng/helm`
- Theme style: `nova`
- Already installed: `button`, `input`, `label`, `field`, `card`, `alert`, `spinner`, `separator`, `utils`

### Conventions

- **Prefer existing spartan components over hand-written markup.** Build forms, dialogs, and layout from Helm + Brain pieces (e.g. `hlmBtn`, `hlmInput`, `hlmField`, `hlmCard*`) instead of raw `<div>`/`<input>` styling.
- **Use built-in `variant`/`size` inputs** instead of overriding classes (e.g. `<button hlmBtn variant="destructive" size="sm">`).
- **Use semantic color tokens only** (`bg-primary`, `text-muted-foreground`, `border-border`, etc.), never raw Tailwind palette colors like `bg-blue-500`.
- **Layout spacing:** use `gap-*` with flex/grid, not `space-x-*`/`space-y-*`. Use `size-*` when width equals height.
- **Forms:** wrap each control in `hlmField` (label, control, description, error) rather than plain `<div>`s; see `hlmFieldSet`/`hlmFieldLegend` for grouped controls.
- **Adding a new component:** `ng g @spartan-ng/cli:ui --name=<component>` (see `availableComponents` via `ng g @spartan-ng/cli:info --json`). Do not hand-roll a component that already exists in the catalog.
- **After upgrading `@spartan-ng/*` packages:** run `ng g @spartan-ng/cli:healthcheck --autoFix`.
- Full guidance (styling, forms, composition, icons, Brain vs. Helm, CLI reference) lives in the local `spartan` skill at `.agents/skills/spartan/`.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
