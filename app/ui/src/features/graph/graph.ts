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

// TODO(graph-data-export): implement; see docs/specs/graph-data-export.md.
export function buildGraph(
  _input: GraphInput,
  _types?: GraphNodeType[]
): GraphData {
  throw new Error('not implemented');
}

export function toGraphviz(_data: GraphData): string {
  throw new Error('not implemented');
}

export function toMermaid(_data: GraphData, _elk?: boolean): string {
  throw new Error('not implemented');
}

export function renderGraph(_data: GraphData, _format: GraphFormat): string {
  throw new Error('not implemented');
}
