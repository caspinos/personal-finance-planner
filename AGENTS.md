
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

### Documentation Language

- All project documentation (in `docs/` and elsewhere) MUST be written in **English** going forward.
- Code comments, commit messages, and identifiers must also be in English.

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
