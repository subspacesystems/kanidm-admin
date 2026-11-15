import { describe, expect, test } from 'bun:test';
import type { GraphData, GraphNodeType } from '../src/features/graph/graph.ts';
import {
  H_GAP,
  MARGIN,
  NODE_HEIGHT,
  NODE_STYLES,
  NODE_WIDTH,
  V_GAP,
  computeRanks,
  layoutGraph,
  truncateLabel,
} from '../src/features/graph/layout.ts';

const node = (spn: string, type: GraphNodeType = 'group') => ({
  spn,
  uuid: `uuid-${spn}`,
  type,
});

// Edges run group -> member, as in GraphData.
const edge = (from: string, to: string) => ({ from, to });

// top contains mid, mid contains alice; top also contains svc directly.
const nested: GraphData = {
  nodes: [
    node('alice', 'person'),
    node('svc', 'service_account'),
    node('mid'),
    node('top'),
  ],
  edges: [edge('top', 'mid'), edge('top', 'svc'), edge('mid', 'alice')],
};

describe('truncateLabel', () => {
  test('short text is unchanged', () => {
    expect(truncateLabel('abc', 10)).toBe('abc');
    expect(truncateLabel('0123456789', 10)).toBe('0123456789');
  });
  test('long text is cut to max characters ending in an ellipsis', () => {
    expect(truncateLabel('0123456789ab', 10)).toBe('012345678…');
    expect(truncateLabel('0123456789ab', 10)).toHaveLength(10);
  });
  test('has a default limit that keeps ordinary SPNs whole', () => {
    expect(truncateLabel('alice@example.com')).toBe('alice@example.com');
    expect(truncateLabel('x'.repeat(200)).length).toBeLessThan(60);
  });
});

describe('computeRanks', () => {
  test('groups in no other group are rank 0; members go below their deepest group', () => {
    const ranks = computeRanks(nested);
    expect(ranks.get('top')).toBe(0);
    expect(ranks.get('mid')).toBe(1);
    expect(ranks.get('svc')).toBe(1);
    expect(ranks.get('alice')).toBe(2);
  });

  test('uses the longest path when a node is reachable by several', () => {
    const data: GraphData = {
      nodes: [node('a'), node('b'), node('p', 'person')],
      edges: [edge('a', 'b'), edge('a', 'p'), edge('b', 'p')],
    };
    expect(computeRanks(data).get('p')).toBe(2);
  });

  test('isolated nodes are rank 0', () => {
    const data: GraphData = { nodes: [node('lone', 'person')], edges: [] };
    expect(computeRanks(data).get('lone')).toBe(0);
  });

  test('a cycle terminates and gives every node a rank', () => {
    const data: GraphData = {
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    };
    const ranks = computeRanks(data);
    expect([...ranks.keys()].sort()).toEqual(['a', 'b', 'c']);
    for (const r of ranks.values()) expect(Number.isInteger(r)).toBe(true);
    // The cycle is broken at its first back edge: ranks are 0, 1, 2 in some order.
    expect([...ranks.values()].sort()).toEqual([0, 1, 2]);
  });

  test('a group that contains itself does not loop', () => {
    const data: GraphData = {
      nodes: [node('a'), node('p', 'person')],
      edges: [edge('a', 'a'), edge('a', 'p')],
    };
    const ranks = computeRanks(data);
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('p')).toBe(1);
  });
});

describe('layoutGraph', () => {
  test('an empty graph has a margin-sized canvas', () => {
    const layout = layoutGraph({ nodes: [], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(2 * MARGIN);
    expect(layout.height).toBe(2 * MARGIN);
  });

  test('places one node per input node, keeping their data', () => {
    const layout = layoutGraph(nested);
    expect(layout.nodes).toHaveLength(4);
    const alice = layout.nodes.find((n) => n.node.spn === 'alice');
    expect(alice?.node.type).toBe('person');
    expect(alice?.width).toBe(NODE_WIDTH);
    expect(alice?.height).toBe(NODE_HEIGHT);
  });

  test('y follows the rank, layers are V_GAP apart', () => {
    const layout = layoutGraph(nested);
    for (const placed of layout.nodes) {
      expect(placed.y).toBe(MARGIN + placed.rank * (NODE_HEIGHT + V_GAP));
    }
    expect(layout.nodes.find((n) => n.node.spn === 'top')?.rank).toBe(0);
    expect(layout.nodes.find((n) => n.node.spn === 'alice')?.rank).toBe(2);
  });

  test('within a layer nodes keep input order, left to right, H_GAP apart', () => {
    const data: GraphData = {
      nodes: [node('g'), node('p1', 'person'), node('p2', 'person'), node('p3', 'person')],
      edges: [edge('g', 'p1'), edge('g', 'p2'), edge('g', 'p3')],
    };
    const row = layoutGraph(data).nodes.filter((n) => n.rank === 1);
    expect(row.map((n) => n.node.spn)).toEqual(['p1', 'p2', 'p3']);
    expect(row[0].x).toBe(MARGIN);
    expect(row[1].x).toBe(MARGIN + NODE_WIDTH + H_GAP);
    expect(row[2].x).toBe(MARGIN + 2 * (NODE_WIDTH + H_GAP));
  });

  test('no two nodes overlap and all lie inside the canvas', () => {
    const layout = layoutGraph(nested);
    for (const a of layout.nodes) {
      expect(a.x).toBeGreaterThanOrEqual(MARGIN);
      expect(a.y).toBeGreaterThanOrEqual(MARGIN);
      expect(a.x + a.width + MARGIN).toBeLessThanOrEqual(layout.width);
      expect(a.y + a.height + MARGIN).toBeLessThanOrEqual(layout.height);
      for (const b of layout.nodes) {
        if (a === b) continue;
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  test('canvas size fits the widest layer and all layers', () => {
    const layout = layoutGraph(nested); // layers of 1, 2 (mid, svc), 1
    expect(layout.width).toBe(2 * MARGIN + 2 * NODE_WIDTH + H_GAP);
    expect(layout.height).toBe(2 * MARGIN + 3 * NODE_HEIGHT + 2 * V_GAP);
  });

  test('an edge runs from the member up to the group', () => {
    const layout = layoutGraph(nested);
    expect(layout.edges).toHaveLength(3);
    const e = layout.edges.find((x) => x.from === 'mid' && x.to === 'alice');
    expect(e?.reversed).toBe(false);
    const mid = layout.nodes.find((n) => n.node.spn === 'mid');
    const alice = layout.nodes.find((n) => n.node.spn === 'alice');
    if (!e || !mid || !alice) throw new Error('missing node or edge');
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    // Starts at the member's top centre, ends at the group's bottom centre.
    expect(first).toEqual({ x: alice.x + NODE_WIDTH / 2, y: alice.y });
    expect(last).toEqual({ x: mid.x + NODE_WIDTH / 2, y: mid.y + NODE_HEIGHT });
  });

  test('a cycle lays out: the edge closing it is marked reversed and runs the other way', () => {
    const data: GraphData = {
      nodes: [node('a'), node('b')],
      edges: [edge('a', 'b'), edge('b', 'a')],
    };
    const layout = layoutGraph(data);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges.filter((e) => e.reversed)).toHaveLength(1);
    const back = layout.edges.find((e) => e.reversed);
    if (!back) throw new Error('no reversed edge');
    // Reversed edge: group `b`... is the lower node, member `a` the upper one.
    const group = layout.nodes.find((n) => n.node.spn === back.from);
    const member = layout.nodes.find((n) => n.node.spn === back.to);
    if (!group || !member) throw new Error('missing node');
    expect(member.y).toBeLessThan(group.y);
    expect(back.points[0]).toEqual({
      x: member.x + NODE_WIDTH / 2,
      y: member.y + NODE_HEIGHT,
    });
    expect(back.points[back.points.length - 1]).toEqual({
      x: group.x + NODE_WIDTH / 2,
      y: group.y,
    });
  });

  test('a group that contains itself draws no edge for it', () => {
    const data: GraphData = {
      nodes: [node('a')],
      edges: [edge('a', 'a')],
    };
    expect(layoutGraph(data).edges).toEqual([]);
  });

  test('is deterministic', () => {
    expect(layoutGraph(nested)).toEqual(layoutGraph(nested));
  });
});

describe('NODE_STYLES', () => {
  test('every type has its own colour and its own shape', () => {
    const types: GraphNodeType[] = ['person', 'service_account', 'group', 'builtin_group'];
    const colors = new Set(types.map((t) => NODE_STYLES[t].color));
    const shapes = new Set(types.map((t) => NODE_STYLES[t].shape));
    expect(colors.size).toBe(4);
    expect(shapes.size).toBe(4);
    for (const t of types) expect(NODE_STYLES[t].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('the colours match the Graphviz export', () => {
    expect(NODE_STYLES.group.color).toBe('#b86367');
    expect(NODE_STYLES.builtin_group.color).toBe('#8bc1d6');
    expect(NODE_STYLES.service_account.color).toBe('#77c98d');
    expect(NODE_STYLES.person.color).toBe('#af8bd6');
  });
});
