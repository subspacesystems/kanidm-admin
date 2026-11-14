# schema-classes: schema classes browser

## Goal
`kanidm schema class list` shows the classes in Kanidm's schema; the console has none. Add a read-only class list and a
detail view next to the attribute types page from `schema-attributes` (merged first: reuse its `features/schema/`,
`SchemaService`, System page card and layout). No redesign.

## How Kanidm does it
- `GET /v1/schema/classtype` returns a JSON array of `{"attrs": {...}}`; `GET /v1/schema/classtype/{name}` returns one
  such entry (or `null`). Every value is an array of strings. **A class names itself with `classname`, not `name`.** Also
  present: `description`, and the lists `systemmay`, `systemmust`, `systemsupplements`, `systemexcludes` (each absent when
  empty), plus `uuid`, `class` and others to ignore. Read-only, no step-up, `/v1/` already passes the proxy: **no proxy
  change.**

## Behaviour
- **Types**: add `SchemaClass { name; description; systemmay: string[]; systemmust: string[]; systemsupplements: string[];
  systemexcludes: string[] }` to `features/schema/types/schema.types.ts`. Missing values become `''` / `[]`; list values
  are sorted.
- **Service**: in `SchemaService` add `classList(): Promise<SchemaClass[]>` (`/api/kanidm/v1/schema/classtype`, mapped,
  sorted by name) and `classGet(name): Promise<SchemaClass | null>` (`.../classtype/${encodeURIComponent(name)}`; `null`
  body gives `null`). Share one entry-to-`SchemaClass` mapper.
- **Page**: one element `schema-classes-page` (`@customElement`, `@localized()`) in
  `features/schema/components/schema-classes-page.ts`, with an optional `name` property. Without `name` it is the list:
  `admin-layout`, `page-head` `<h1>${msg('Schema classes')}</h1>`, a "Back to System" link as on the attributes page,
  and a `ui-card` with a `data-table`, `.searchable=${true}`, `.searchPlaceholder=${msg('Filter classes...')}`. Columns:
  `Name` (mono span), `Description`, `May`, `Must`, `Supplements`, `Excludes` (headers `msg('May')` etc.; each of the last
  four shows the comma-joined names, truncated is fine). Empty message `msg('No classes found.')`. A `row-click` calls
  `navigate('/admin/system/classes/' + encodeURIComponent(name))`.
- **Detail** (when `name` is set): `<h1>` is the class name, a "Back to classes" link (`msg('Back to classes')`,
  `/admin/system/classes`), the description, then four sections, each an `<h2>` (`msg('May')`, `msg('Must')`,
  `msg('Supplements')`, `msg('Excludes')`) with a short one-line explanation under it and a list of names. In `May` and
  `Must` each name is an `<a href="/admin/system/attributes?filter=NAME">` (NAME encoded) that the SPA router handles
  (`navigate()` in a click handler, `href` kept for the link role). In `Supplements` and `Excludes` each name is a link
  to `/admin/system/classes/NAME` the same way (those lists hold class names). An empty list shows `msg('None')`. Unknown
  class (`null`): `msg('Class not found.')`. Load errors toast `msg('Failed to load schema classes')`.
- **Attributes page filter**: the attributes page reads a `filter` query parameter on load and starts with that text in
  its filter box and the table filtered. Add an `initialSearch` property to `DataTable` (`shared/components/data-table.ts`)
  that seeds `searchTerm` (lower-cased) and shows in the input; change nothing else there. Check how the page can read
  the query string (see `router.service.ts`; `window.location.search` is fine if nothing better exists).
- **Routes**: in `app/ui/src/app-component.ts` add `/admin/system/classes` and `/admin/system/classes/:name` (render
  `<schema-classes-page .name=${name}>`; the first without `name`), both `enter: guardSection('system')`, and import the
  page via the `features/schema` barrel as the attributes page is.
- **Link**: on `SystemPage`, in the Schema card from `schema-attributes`, add a second link
  `<a href="/admin/system/classes">` text `msg('Schema classes')` with a one-line description
  `msg('Browse the classes defined in Kanidm\'s schema.')`, handled like the first link. Nothing else changes.
- Every new string uses `msg()` and goes into all three XLIFF files through `bun i18n:extract` from `app/ui`
  (translations `state="needs-review-translation"`); commit the regenerated `generated/locales/*.ts`. Reuse existing ids
  ("Name", "Description", "Back to System"). A merge conflict in the XLIFF/locale files is expected: keep both sides.
- No new dependencies, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/tests/proxy_schema_classes/mod.rs` (`proxy_env_schema_classes`): as `idm_admin`, the proxied list is 200 with more
  than 10 entries, each with a `classname`; `person` excludes `service_account`; the by-name GET returns `person`.
  Declared on main in `app/src/proxy/mod.rs`. Passes without an app change.
- `app/ui/tests/schema-classes.e2e.ts`: from the System page's "Schema classes" link: heading, six column headers,
  rows `person` and `group`, the filter box, a row click opens `/admin/system/classes/person` with the four section
  headings and `service_account`; the `mail` link goes to the attributes page with "Filter attributes..." holding `mail`.
  Runs with `bun run test:e2e`.
- `bunx --bun tsc --noEmit`, lint, build and `bun test` stay green; Rust tests stay green.

## Where to look
- `SchemaService` (`ts-outline app/ui/src/features/schema/services/schema.service.ts`) and the attribute mapper;
  `schema-attributes-page` in `features/schema/components/` for layout, back link and toast pattern
- `SystemPage` (`ts-show SystemPage.render`) in `app/ui/src/features/system/components/system-page.ts`
- `DataTable` (`searchTerm`, `handleSearch`, `row-click`) in `app/ui/src/shared/components/data-table.ts`
- `PersonListPage` for `row-click` + `navigate`; `navigate` in `app/ui/src/shared/services/router.service.ts`
- Routes: the `/admin/system` entries in `app/ui/src/app-component.ts`
- The tests: `outline app/tests/proxy_schema_classes/mod.rs`, `ts-outline app/ui/tests/schema-classes.e2e.ts`
