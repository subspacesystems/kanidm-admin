# graph-view-svg: relationship graph as an SVG diagram

## Goal
`graph-data-export` (merged first) added the System page "Relationship graph" with the Graphviz/Mermaid text. Add a
diagram on the same page: a hand-written SVG in a Lit component, with a switch between diagram and text. The type filter
keeps applying to both. No new dependency, no redesign of the page.

## Layout module (pure, `app/ui/src/features/graph/layout.ts`, skeleton on main: fill it in)
No imports beyond the existing type import (it runs under `bun test`). Constants, `NODE_STYLES` (colours and shapes), the
result types and three stub functions are already there.
- **Edges** in `GraphData` run group -> member. The diagram draws them member -> group (arrowhead on the group), and
  groups sit above their members.
- `NODE_STYLES`: colours as the Graphviz export uses (group `#b86367`, builtin group `#8bc1d6`, service account `#77c98d`,
  person `#af8bd6`); shapes so no type needs colour to be told apart: group `box`, builtin group `hexagon`, service
  account `parallelogram`, person `ellipse`.
- `truncateLabel(text, max = 24)`: unchanged if `text.length <= max`, else the first `max - 1` characters plus `…`.
- `computeRanks(data)`: a map from SPN to rank. Cycle breaking: walk depth-first over the group -> member edges, starting
  at nodes that are in no group (no incoming edge) in node order, then at any node still unvisited in node order; an edge
  to a node still on the current path (including a group in itself) is ignored for ranking. Then rank = 0 for a node with
  no remaining incoming edge, else 1 + the largest rank among the groups that contain it (longest path). Isolated nodes
  are rank 0.
- `layoutGraph(data)`: one `PlacedNode` per node. `y = MARGIN + rank * (NODE_HEIGHT + V_GAP)`; inside a rank nodes keep
  `data.nodes` order, left to right, `x = MARGIN + i * (NODE_WIDTH + H_GAP)`. `width`/`height` fit the widest layer and
  all layers plus `MARGIN` on each side (an empty graph is `2 * MARGIN` square). One `PlacedEdge` per input edge except
  self edges (group in itself: dropped). Normal edge (member below group): `points` = `[member top centre, group bottom
  centre]`, `reversed: false`. An edge that was ignored for ranking has its member above its group: `reversed: true` and
  `points` = `[member bottom centre, group top centre]`. `from` is the group SPN, `to` the member SPN as in `GraphEdge`.
  Deterministic; no randomness.

## Component `graph-diagram`
New `features/graph/components/graph-diagram.ts` (+ `.styles.ts`), `@customElement('graph-diagram')`, `@localized()`,
property `data: GraphData`. It calls `layoutGraph(this.data)` (memoise on `data`) and renders:
- A scrollable wrapper (`overflow: auto`, a max height such as 70vh) holding one `<svg>` sized `layout.width` x
  `layout.height` (`viewBox` the same, `role="img"` with an `aria-label` of `msg('Relationship graph diagram')`). No
  pan/zoom.
- `<defs>` with one arrowhead `<marker id="graph-arrow">` (a small filled triangle, `orient="auto"`), and per edge a
  `<path class="edge" data-from=SPN data-to=SPN marker-end="url(#graph-arrow)">` through `points` (a straight line, or a
  gentle cubic curve if you like), stroke in a neutral theme colour. Reversed edges may be dashed.
- Per node a `<g class="node" data-spn data-type tabindex="0" role="link" aria-label=SPN>` with the shape filled by
  `NODE_STYLES[type].color` (ellipse, parallelogram, rectangle or hexagon, drawn inside its `width` x `height` box), a
  `<text>` with `truncateLabel(spn)` centred, and a `<title>` child with the full SPN. Text must stay readable on every
  fill (use dark text on these light fills). Nodes have `cursor: pointer` and a visible focus outline.
- Click, and Enter or Space on a focused node, call `navigate()` (see `router.service.ts`) to the detail page by uuid:
  person `/admin/persons/UUID`, service account `/admin/service-accounts/UUID`, group and builtin group
  `/admin/groups/UUID` (UUID `encodeURIComponent`-ed; the detail pages accept a name or a uuid).
- A small legend under the diagram: one entry per type that is present, with a mini shape in its colour and the type
  name (`Person`, `Service account`, `Group`, `Built-in group`: reuse the existing ids from the page's checkboxes).
- An empty `data.nodes` shows `msg('No objects to draw.')` instead of the SVG.

## Page changes (`graph-page`)
- Add a view switch above the output: two native radios in one group, labelled `Diagram` and `Text`
  (`msg('Diagram')`, `msg('Text')`). **Text is the default** (so `graph-data-export`'s e2e keeps passing unchanged).
- Text view: exactly what exists now (`pre.graph-output`, Format select, copy control). Diagram view: `<graph-diagram
  .data=${graph}>` in place of those, with the Format select and copy control hidden. The type checkboxes and the
  `N nodes, M edges` line show in both. Only the selected view is in the DOM (the e2e counts `pre.graph-output` and
  `graph-diagram`). Compute `buildGraph(input, checkedTypes)` once per change and hand the same result to both.
- Import the diagram from the page file; export `graph-diagram` side-effect-wise through `features/graph/index.ts` if the
  barrel imports components, and export the layout module's items from the barrel too.
- Every new string uses `msg()` and goes into all three XLIFF files (`app/ui/xliff/`) through `bun i18n:extract` from
  `app/ui`; translations `state="needs-review-translation"`; commit the regenerated `generated/locales/*.ts`. Reuse
  existing ids. XLIFF/locale merge conflicts with other tasks are expected: keep both sides. Don't read XLIFF whole.
- No new dependencies, no refactors, no reformatting of code you don't otherwise touch.

## Acceptance (tests are in the spec commit; do not edit them)
- `app/ui/tests/graph-layout.test.ts` (`bun test`): `truncateLabel`, `computeRanks` (nesting, longest path, isolated,
  cycle, self edge), `layoutGraph` (positions, spacing, non-overlap, canvas size, edge endpoints, reversed edge, self
  edge, determinism), `NODE_STYLES`.
- `app/ui/tests/graph-view-svg.e2e.ts`: as `idm_admin`, builds outer group > inner group > person through the API; on the
  graph page Text is the default; switching to Diagram removes `pre.graph-output` and shows `graph-diagram svg` with
  `g.node` elements (`data-spn`, `data-type`) for the three objects and a builtin group, `path.edge` elements for both
  memberships with a `marker-end`, the nodes stacked outer < inner < person, a `<title>` with the full SPN; unchecking
  Person removes its node and edge; clicking the person and the inner group opens `/admin/persons/UUID` and
  `/admin/groups/UUID`; switching back to Text shows the export.
- `bunx --bun tsc --noEmit`, lint, build, `bun test` and e2e stay green (including `graph-data-export.e2e.ts`).

## Where to look
- `app/ui/src/features/graph/layout.ts` (skeleton, constants, types) and `graph.ts` (`GraphData`, `GraphNode`,
  `GraphNodeType`, `renderGraph`, `buildGraph`); `ts-outline` them
- `GraphPage` in `app/ui/src/features/graph/components/graph-page.ts` (from `graph-data-export`): `ts-outline` it, then
  `ts-show GraphPage.render`
- `navigate` in `app/ui/src/shared/services/router.service.ts`; `PersonListPage` and `GroupListPage` for how rows
  navigate
- A small Lit component with its own styles file, e.g. `ts-outline app/ui/src/features/schema/components/schema-classes-page.ts`
- Routes `/admin/persons/:id`, `/admin/groups/:id`, `/admin/service-accounts/:id` in `app/ui/src/app-component.ts`
- The tests: `ts-outline app/ui/tests/graph-layout.test.ts`, `ts-outline app/ui/tests/graph-view-svg.e2e.ts`
