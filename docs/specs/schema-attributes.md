# schema-attributes: schema attribute types browser

## Goal
`kanidm schema attribute list` shows the attribute types in Kanidm's schema; the console has no schema view. Add a
read-only page listing them (name, syntax, multivalue, unique, description) with a filter box, reached from the System
page. First of the M2 read-only views; keep it small, and fit the existing pages: no redesign.

## How Kanidm does it
- `GET /v1/schema/attributetype` returns a JSON array of entries, each `{"attrs": {...}}` where every value is an array
  of strings: `name`, `description`, `syntax` (e.g. `UTF8STRING_INSENSITIVE`), `multivalue` and `unique` (the strings
  `"true"` / `"false"`), plus `class`, `uuid` and others the page ignores. Read-only: no step-up. The proxy forwards all of
  `/v1/` (`app/src/proxy/allowlist.rs`): **no proxy change.**

## Behaviour
- **Types**: `SchemaAttribute { name; syntax; multivalue: boolean; unique: boolean; description }` in a new
  `app/ui/src/features/schema/types/schema.types.ts`. Missing values become `''` / `false`. Treat `multivalue`/`unique` as
  true when the first value is `"true"` (case-insensitive) or boolean `true`.
- **Service**: `SchemaService` singleton in `features/schema/services/schema.service.ts`, same shape as `SystemService`
  (`getInstance`, exported `schemaService`). `attributeList(): Promise<SchemaAttribute[]>` calls `apiFetch` on
  `/api/kanidm/v1/schema/attributetype`, maps the entries, sorts by name. Barrel `features/schema/index.ts` like
  `features/system/index.ts` (export the service, side-effect import the page).
- **Page**: element `schema-attributes-page` (`@customElement`, `@localized()`) in
  `features/schema/components/schema-attributes-page.ts` (+ `.styles.ts` if it needs any), laid out like
  `PersonListPage`: `admin-layout`, a `page-head` with `<h1>${msg('Schema attributes')}</h1>`, then a `ui-card` holding a
  `data-table` with `.searchable=${true}` and `.searchPlaceholder=${msg('Filter attributes...')}`. Columns: `Name` (mono
  span, as `SystemPage.valueColumn`), `Syntax`, `Multivalue`, `Unique` (`msg('Yes')` / `msg('No')`), `Description`.
  Empty message `msg('No attribute types found.')`. Load in `connectedCallback`; failure toasts
  `msg('Failed to load schema attributes')` (use the `toastError` pattern). Show a "back to System" link above the card
  (`msg('Back to System')`, an `<a href="/admin/system">` handled like other in-app links: check how detail pages go
  back, e.g. `navigate()`).
- **Route**: in `app/ui/src/app-component.ts` add `/admin/system/attributes` rendering the page, `enter: guardSection('system')`
  (same access as System; no new nav section), and import the page.
- **Link**: on `SystemPage` add a `ui-card` after the Account policy card: `<h2>${msg('Schema')}</h2>`, a one-line
  description `msg('Browse the attribute types defined in Kanidm\'s schema.')` and an `<a href="/admin/system/attributes">`
  with text `msg('Schema attributes')` (the e2e finds it as a link by that name; make sure the SPA router intercepts it, or
  use `navigate()` in a click handler with `href` kept for the role). Nothing else on that page changes.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; add translations with `state="needs-review-translation"`. Find the new ids with
  grep; do not read the XLIFF files whole. Commit the regenerated `generated/locales/*.ts` too. Existing strings
  ("Name", "Description", "Yes", "No", "Back ...") keep their ids: reuse, don't duplicate. Other UI tasks append to the same
  files, so a merge conflict there is expected: keep both sides.
- No new dependencies, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_schema_attributes/mod.rs` (`proxy_env_schema_attributes`): as `idm_admin`, the proxied
  `GET /v1/schema/attributetype` is 200 with more than 20 entries, each with a name and syntax; `name` is single-valued
  and unique. Declared on main in `app/src/proxy/mod.rs`. Passes without an app change.
- `app/ui/tests/schema-attributes.e2e.ts`: signed in as `idm_admin`, the System page's "Schema attributes" link opens
  `/admin/system/attributes`; the heading, the five column headers and the rows `name` and `displayname` show; typing
  `displayname` in the "Filter attributes..." box leaves `displayname` and hides `name`. Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `SystemPage` (`ts-show SystemPage.render`, `SystemPage.valueColumn`, `SystemPage.toastError`) in
  `app/ui/src/features/system/components/system-page.ts`; `SystemService` in `.../services/system.service.ts`
- `PersonListPage` (`ts-outline app/ui/src/features/persons/components/person-list-page.ts`) for the list layout and
  `data-table` usage; `TableColumn` and `searchPlaceholder` in `app/ui/src/shared/components/data-table.ts`
- Routes: `app/ui/src/app-component.ts` (the `/admin/system` entry); `navigate` in
  `app/ui/src/shared/services/router.service.ts`
- `apiFetch` in `app/ui/src/shared/services/http-client.ts`
- The tests: `outline app/tests/proxy_schema_attributes/mod.rs`, `ts-outline app/ui/tests/schema-attributes.e2e.ts`
