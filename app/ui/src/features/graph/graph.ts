// Relationship graph: pure data model and text exporters. Mirrors the
// `kanidm graph` command: nodes are persons, service accounts and groups,
// edges run from a group to each of its `member` values (SPNs).

import type { KanidmEntry } from '../../shared/types/kanidm';

export type GraphNodeType =
  | 'person'
  | 'service_account'
  | 'group'
  | 'builtin_group';

export const GRAPH_NODE_TYPES: GraphNodeType[] = [
  'person',
  'service_account',
  'group',
  'builtin_group',
];

export type GraphFormat = 'graphviz' | 'mermaid' | 'mermaid-elk';

export interface GraphNode {
  spn: string;
  uuid: string;
  type: GraphNodeType;
}

/** `from` is a group's SPN, `to` one of its members' SPNs. */
export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The entries of the three list routes. */
export interface GraphInput {
  persons: KanidmEntry[];
  serviceAccounts: KanidmEntry[];
  groups: KanidmEntry[];
}

function firstValue(entry: KanidmEntry, attr: string): string | undefined {
  return entry.attrs[attr]?.[0];
}

function values(entry: KanidmEntry, attr: string): string[] {
  return entry.attrs[attr] ?? [];
}

function nodeType(
  entry: KanidmEntry,
  fallback: 'person' | 'service_account' | 'group'
): GraphNodeType {
  if (fallback !== 'group') return fallback;
  const uuid = firstValue(entry, 'uuid') ?? '';
  return uuid.startsWith('00000000-0000-0000-0000-')
    ? 'builtin_group'
    : 'group';
}

interface TypedEntry {
  entry: KanidmEntry;
  fallback: 'person' | 'service_account' | 'group';
}

const GRAPHVIZ_STYLES: Record<GraphNodeType, { color: string; shape: string }> =
  {
    group: { color: '#b86367', shape: 'box' },
    builtin_group: { color: '#8bc1d6', shape: 'component' },
    service_account: { color: '#77c98d', shape: 'parallelogram' },
    person: { color: '#af8bd6', shape: 'ellipse' },
  };

const MERMAID_CLASS_DEFS = [
  '  classDef groupClass fill:#f9f,stroke:#333,stroke-width:4px,stroke-dasharray: 5 5',
  '  classDef builtInGroupClass fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5',
  '  classDef serviceAccountClass fill:#f9f,stroke:#333,stroke-width:4px',
  '  classDef personClass fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff',
];

const MERMAID_CLASSES: Record<GraphNodeType, string> = {
  group: 'groupClass',
  builtin_group: 'builtInGroupClass',
  service_account: 'serviceAccountClass',
  person: 'personClass',
};

function mermaidId(spn: string): string {
  return spn.replace(/@/g, '_');
}

export function buildGraph(
  input: GraphInput,
  types?: GraphNodeType[]
): GraphData {
  const allowed = new Set<GraphNodeType>(types ?? GRAPH_NODE_TYPES);
  const sources: TypedEntry[] = [
    ...input.persons.map((entry) => ({ entry, fallback: 'person' as const })),
    ...input.serviceAccounts.map((entry) => ({
      entry,
      fallback: 'service_account' as const,
    })),
    ...input.groups.map((entry) => ({ entry, fallback: 'group' as const })),
  ];

  const bySpn = new Map<string, KanidmEntry>();
  const groups: { spn: string; entry: KanidmEntry }[] = [];
  const nodes: GraphNode[] = [];

  for (const { entry, fallback } of sources) {
    const spn = firstValue(entry, 'spn');
    const uuid = firstValue(entry, 'uuid');
    if (!spn || !uuid) continue;
    const type = nodeType(entry, fallback);
    if (!allowed.has(type)) continue;
    nodes.push({ spn, uuid, type });
    bySpn.set(spn, entry);
    if (fallback === 'group') groups.push({ spn, entry });
  }

  const edges: GraphEdge[] = [];
  for (const { spn, entry } of groups) {
    for (const member of values(entry, 'member')) {
      if (bySpn.has(member)) {
        edges.push({ from: spn, to: member });
      }
    }
  }

  return { nodes, edges };
}

export function toGraphviz(data: GraphData): string {
  const lines = ['digraph {', '  rankdir="RL"'];
  for (const edge of data.edges) {
    lines.push(`  "${edge.from}" -> "${edge.to}"`);
  }
  for (const node of data.nodes) {
    const style = GRAPHVIZ_STYLES[node.type];
    lines.push(
      `  "${node.spn}" [color = "${style.color}", shape = ${style.shape}]`
    );
  }
  lines.push('}');
  return lines.join('\n');
}

export function toMermaid(data: GraphData, elk = false): string {
  const lines: string[] = [];
  if (elk) {
    lines.push('%%{init: {"flowchart": {"defaultRenderer": "elk"}} }%%');
  }
  lines.push('graph RL');
  for (const edge of data.edges) {
    const from = mermaidId(edge.from);
    const to = mermaidId(edge.to);
    lines.push(`  ${from}["${edge.from}"] --> ${to}["${edge.to}"]`);
  }
  lines.push(...MERMAID_CLASS_DEFS);
  for (const node of data.nodes) {
    const id = mermaidId(node.spn);
    lines.push(`  ${id}["${node.spn}"]`);
    lines.push(`  class ${id} ${MERMAID_CLASSES[node.type]}`);
  }
  return lines.join('\n');
}

export function renderGraph(data: GraphData, format: GraphFormat): string {
  switch (format) {
    case 'graphviz':
      return toGraphviz(data);
    case 'mermaid':
      return toMermaid(data);
    case 'mermaid-elk':
      return toMermaid(data, true);
  }
}
