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

export const NODE_STYLES: Record<GraphNodeType, NodeStyle> = {
  person: { color: '#af8bd6', shape: 'ellipse' },
  service_account: { color: '#77c98d', shape: 'parallelogram' },
  group: { color: '#b86367', shape: 'box' },
  builtin_group: { color: '#8bc1d6', shape: 'hexagon' },
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
export function truncateLabel(text: string, max = 24): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

interface Ranking {
  ranks: Map<string, number>;
  ignored: Set<number>;
}

/**
 * Walk group -> member edges depth-first, ignoring back edges that would make
 * the ranking cyclic. Returns the ignored edge indexes as well as the ranks.
 */
function rankNodes(data: GraphData): Ranking {
  const bySpn = new Map(data.nodes.map((node) => [node.spn, node]));
  const adjacency = new Map<string, { to: string; edge: number }[]>();
  const incoming = new Map<string, number>();

  for (const node of data.nodes) {
    adjacency.set(node.spn, []);
    incoming.set(node.spn, 0);
  }

  data.edges.forEach((edge, index) => {
    if (!bySpn.has(edge.from) || !bySpn.has(edge.to)) return;
    adjacency.get(edge.from)?.push({ to: edge.to, edge: index });
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  });

  const ignored = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>();
  for (const node of data.nodes) state.set(node.spn, 0);

  const visit = (spn: string): void => {
    state.set(spn, 1);
    for (const { to, edge } of adjacency.get(spn) ?? []) {
      const next = state.get(to);
      if (next === 1) {
        ignored.add(edge);
      } else if (next === 0) {
        visit(to);
      }
    }
    state.set(spn, 2);
  };

  for (const node of data.nodes) {
    if ((incoming.get(node.spn) ?? 0) === 0 && state.get(node.spn) === 0) {
      visit(node.spn);
    }
  }
  for (const node of data.nodes) {
    if (state.get(node.spn) === 0) visit(node.spn);
  }

  const rankOf = new Map<string, number>();
  const rank = (spn: string): number => {
    const cached = rankOf.get(spn);
    if (cached !== undefined) return cached;
    let value = 0;
    for (const [parent, edges] of adjacency) {
      for (const edge of edges) {
        if (edge.to === spn && !ignored.has(edge.edge)) {
          value = Math.max(value, rank(parent) + 1);
        }
      }
    }
    rankOf.set(spn, value);
    return value;
  };

  const ranks = new Map<string, number>();
  for (const node of data.nodes) ranks.set(node.spn, rank(node.spn));
  return { ranks, ignored };
}

/** Rank of every node by SPN. Cycles are broken (see the spec). */
export function computeRanks(data: GraphData): Map<string, number> {
  return rankNodes(data).ranks;
}

export function layoutGraph(data: GraphData): GraphLayout {
  const { ranks, ignored } = rankNodes(data);
  const layers = new Map<number, GraphNode[]>();
  for (const node of data.nodes) {
    const rank = ranks.get(node.spn) ?? 0;
    const layer = layers.get(rank);
    if (layer) layer.push(node);
    else layers.set(rank, [node]);
  }

  const placed = new Map<string, PlacedNode>();
  const nodes: PlacedNode[] = [];
  for (const node of data.nodes) {
    const rank = ranks.get(node.spn) ?? 0;
    const index = layers.get(rank)?.indexOf(node) ?? 0;
    const x = MARGIN + index * (NODE_WIDTH + H_GAP);
    const y = MARGIN + rank * (NODE_HEIGHT + V_GAP);
    const placedNode: PlacedNode = {
      node,
      rank,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
    placed.set(node.spn, placedNode);
    nodes.push(placedNode);
  }

  const edges: PlacedEdge[] = [];
  data.edges.forEach((edge, index) => {
    if (edge.from === edge.to) return;
    const group = placed.get(edge.from);
    const member = placed.get(edge.to);
    if (!group || !member) return;
    const reversed = ignored.has(index);
    const first = reversed
      ? { x: member.x + NODE_WIDTH / 2, y: member.y + NODE_HEIGHT }
      : { x: member.x + NODE_WIDTH / 2, y: member.y };
    const last = reversed
      ? { x: group.x + NODE_WIDTH / 2, y: group.y }
      : { x: group.x + NODE_WIDTH / 2, y: group.y + NODE_HEIGHT };
    edges.push({
      from: edge.from,
      to: edge.to,
      points: [first, last],
      reversed,
    });
  });

  const layerCount = layers.size;
  const widest = Math.max(
    0,
    ...[...layers.values()].map((layer) => layer.length)
  );
  const width =
    widest === 0
      ? 2 * MARGIN
      : 2 * MARGIN + widest * NODE_WIDTH + (widest - 1) * H_GAP;
  const height =
    layerCount === 0
      ? 2 * MARGIN
      : 2 * MARGIN + layerCount * NODE_HEIGHT + (layerCount - 1) * V_GAP;

  return { nodes, edges, width, height };
}
