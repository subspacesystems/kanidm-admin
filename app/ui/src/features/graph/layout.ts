// Relationship graph: layered layout for the SVG diagram. Pure (no DOM, no
// imports beyond the graph types) so it runs under `bun test`.

import type { GraphData, GraphNode, GraphNodeType } from './graph';

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 36;
/** Horizontal gap between neighbours in one layer. */
export const H_GAP = 24;
/** Vertical gap between layers. */
export const V_GAP = 60;
export const MARGIN = 16;

export type NodeShape = 'ellipse' | 'parallelogram' | 'box' | 'hexagon';

export interface NodeStyle {
  color: string;
  shape: NodeShape;
}

// TODO(graph-view-svg): fill in; see docs/specs/graph-view-svg.md.
export const NODE_STYLES: Record<GraphNodeType, NodeStyle> = {
  person: { color: '', shape: 'ellipse' },
  service_account: { color: '', shape: 'ellipse' },
  group: { color: '', shape: 'ellipse' },
  builtin_group: { color: '', shape: 'ellipse' },
};

export interface PlacedNode {
  node: GraphNode;
  /** 0 = a group that is in no other group; members sit one rank below. */
  rank: number;
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlacedEdge {
  /** The group's SPN. */
  from: string;
  /** The member's SPN. */
  to: string;
  /** Drawn member -> group: `points[0]` is on the member, the last on the group. */
  points: Point[];
  /** True for an edge that closes a cycle (it points down the diagram). */
  reversed: boolean;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/** `text` unchanged when it fits in `max` characters, else its first `max - 1` plus `…`. */
export function truncateLabel(_text: string, _max?: number): string {
  void _text;
  void _max;
  throw new Error('not implemented');
}

/** Rank of every node by SPN. Cycles are broken (see the spec). */
export function computeRanks(_data: GraphData): Map<string, number> {
  void _data;
  throw new Error('not implemented');
}

export function layoutGraph(_data: GraphData): GraphLayout {
  void _data;
  throw new Error('not implemented');
}
