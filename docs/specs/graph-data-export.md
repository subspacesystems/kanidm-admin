# graph-data-export: relationship graph data and Graphviz/Mermaid export

## Goal
`kanidm graph` searches every person, service account and group and prints the group `member` edges as Graphviz or
Mermaid text, optionally for some object types only. The console has nothing like it. Add a page under the System
section that loads the same entries, builds typed nodes and edges with a pure function, and shows the text export with
a type filter. First half of the M3 graph; the SVG diagram is the next task (`graph-view-svg`), so keep the data model
reusable. No new dependency.

## How Kanidm does it (behaviour, in our words)
- Entries come from three existing list routes, all read-only (no step-up), all forwarded by the proxy (**no proxy
  change**): `GET /v1/person`, `GET /v1/service_account`, `GET /v1/group`, each `[{"attrs": {...}}]` with array values.
  We need `spn`, `uuid` and, on groups, `member` (a list of SPNs).
- Object type: from the list it came from, except groups whose uuid starts `00000000-0000-0000-0000-`, which are
  **builtin groups**.
- A node needs an `spn` and a `uuid`; entries missing either are skipped.
- An edge goes from a group to each of its `member` SPNs, but only when that SPN is a node that survived the filter.

## Pure module (already on main as a skeleton, fill it in)
`app/ui/src/features/graph/graph.ts` has the types and four stub functions that throw. Implement them; no imports
beyond the type import already there (it must run under `bun test`):
- `buildGraph(input, types?)`: nodes in the order persons, service accounts, groups (input order inside each); edges in
  node order, then `member` order. `types` undefined = all four types; an empty array = no nodes, no edges. Duplicate
  members are not deduplicated.
- `toGraphviz(data)`: lines joined with `\n`, no trailing newline: `digraph {`, `  rankdir="RL"`, one
  `  "FROM" -> "TO"` per edge, then per node `  "SPN" [color = "C", shape = S]`, then `}`. Style per type: group
  `#b86367` `box`; builtin group `#8bc1d6` `component`; service account `#77c98d` `parallelogram`; person `#af8bd6`
  `ellipse`.
- `toMermaid(data, elk = false)`: `graph RL`; per edge `  ID_FROM["FROM"] --> ID_TO["TO"]` where the id is the SPN with
  `@` replaced by `_`; the four `classDef` lines; then per node `  ID["SPN"]` and `  class ID CLASS`. Exact text is
  pinned by the tests (they follow the CLI). With `elk`, the first line is
  `%%{init: {"flowchart": {"defaultRenderer": "elk"}} }%%`.
- `renderGraph(data, format)`: `'graphviz'`, `'mermaid'` or `'mermaid-elk'`.

## Service
`GraphService` singleton in `features/graph/services/graph.service.ts` (same shape as `SchemaService`: `getInstance`,
exported `graphService`). `load(): Promise<GraphInput>` fetches the three routes with `apiFetch` in parallel
(`/api/kanidm/v1/person`, `/api/kanidm/v1/service_account`, `/api/kanidm/v1/group`) and returns the raw entry arrays.
Barrel `features/graph/index.ts` like `features/schema/index.ts` (export the service and the pure module's items,
side-effect import the page).

## Page
- Element `graph-page` (`@customElement`, `@localized()`) in `features/graph/components/graph-page.ts` (+ `.styles.ts`),
  laid out like `schema-attributes-page`: `admin-layout`, the "Back to System" link, a `page-head` with
  `<h1>${msg('Relationship graph')}</h1>`, then a `ui-card`.
- Controls: four checkboxes, labelled `Person`, `Service account`, `Group`, `Built-in group` (all checked at first),
  and a select labelled `Format` with options `Graphviz`, `Mermaid`, `Mermaid (ELK)` (Graphviz first). Use native
  `<input type="checkbox">` / `<select>` with `<label>`s (the e2e finds them by role and label); follow the existing
  form styles in other pages.
- Output: `<pre class="graph-output">` with `renderGraph(buildGraph(input, checkedTypes), format)`, recomputed on each
  change without reloading; plus a button/`ui-copy-field` to copy the text (a toast via the existing `copied` event
  pattern; reuse `ui-copy-field` if it shows multi-line text well, otherwise a `ui-button` calling
  `navigator.clipboard.writeText`). Show a one-line count, e.g. `msg(str`${n} nodes, ${m} edges`)`.
- Load in `connectedCallback`; failure toast `msg('Failed to load the relationship graph')` (the `toastError` pattern).
  While loading, show what other pages show (skeleton or nothing).
- **Route**: `/admin/system/graph` in `app/ui/src/app-component.ts`, `enter: guardSection('system')`, next to the
  schema routes; import via `@/features/graph`.
- **Link**: on `SystemPage` add a `ui-card` after the Schema card: `<h2>${msg('Graph')}</h2>`, a one-line description
  (`msg('Draw how persons, service accounts and groups relate through group membership.')`) and
  `<a class="card-link" href="/admin/system/graph">` with text `msg('Relationship graph')`, built like the schema links.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/` ru, es, zh-Hans) through
  `bun i18n:extract` from `app/ui`; translations get `state="needs-review-translation"`. Reuse existing ids ("Group",
  "Person", "Back to System", ...) rather than duplicating. Commit the regenerated `generated/locales/*.ts`. Other UI
  tasks append to the same files: on a merge conflict keep both sides. Find new ids with grep; don't read XLIFF whole.
- No new dependencies, no refactors, no reformatting.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/ui/tests/graph.test.ts` (`bun test`): `buildGraph` typing, ordering, filtering, skipped entries; exact Graphviz
  and Mermaid text, the ELK line, `renderGraph`.
- `app/ui/tests/graph-data-export.e2e.ts`: as `idm_admin`, creates a person and a group with that member through the
  API; the System page's "Relationship graph" link opens `/admin/system/graph`; `pre.graph-output` shows `digraph {` and
  the group -> person edge; unchecking Person removes the person; the Format select switches to Mermaid and
  Mermaid (ELK); all four checkboxes exist.
- `app/tests/proxy_graph_data/mod.rs` (`proxy_env_graph_data`): the three list routes carry `spn` and `uuid`, a group
  with a person and a service account as members lists their SPNs in `member`, built-in `idm_admins` has a
  `00000000-0000-0000-0000-` uuid. Declared on main in `app/src/proxy/mod.rs`; passes without an app change.
- `bunx --bun tsc --noEmit`, lint, build, `bun test` and Rust tests stay green.

## Where to look
- Skeleton and types: `app/ui/src/features/graph/graph.ts` (`ts-outline` it); `KanidmEntry`, `attrFirst`, `attrList` in
  `app/ui/src/shared/types/kanidm.ts`
- `SchemaService` (`ts-show SchemaService`) in `features/schema/services/schema.service.ts`; `features/schema/index.ts`
- `SchemaAttributesPage` (`ts-outline app/ui/src/features/schema/components/schema-attributes-page.ts`, incl. `toastError`
  and its styles file) for the page layout
- `SystemPage.render` in `app/ui/src/features/system/components/system-page.ts` (the Schema card and `card-link`)
- Routes: the `/admin/system/attributes` entry in `app/ui/src/app-component.ts`
- `ui-copy-field` in `app/ui/src/shared/components/ui-copy-field.ts`
- The tests: `ts-outline app/ui/tests/graph.test.ts`, `outline app/tests/proxy_graph_data/mod.rs`
