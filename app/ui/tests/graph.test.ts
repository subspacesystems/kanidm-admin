import { describe, expect, test } from 'bun:test';
import {
  buildGraph,
  renderGraph,
  toGraphviz,
  toMermaid,
  type GraphInput,
} from '../src/features/graph/graph.ts';

const entry = (attrs: Record<string, string[]>) => ({ attrs });

const input: GraphInput = {
  persons: [
    entry({ spn: ['alice@example.com'], uuid: ['11111111-0000-0000-0000-000000000001'] }),
  ],
  serviceAccounts: [
    entry({ spn: ['svc@example.com'], uuid: ['22222222-0000-0000-0000-000000000002'] }),
  ],
  groups: [
    entry({
      spn: ['team@example.com'],
      uuid: ['33333333-0000-0000-0000-000000000003'],
      member: ['alice@example.com', 'svc@example.com', 'gone@example.com'],
    }),
    entry({
      spn: ['idm_admins@example.com'],
      uuid: ['00000000-0000-0000-0000-000000000019'],
      member: ['team@example.com'],
    }),
    // No spn or no uuid: skipped.
    entry({ uuid: ['44444444-0000-0000-0000-000000000004'] }),
    entry({ spn: ['nouuid@example.com'] }),
  ],
};

describe('buildGraph', () => {
  test('types nodes, in order persons, service accounts, groups', () => {
    const { nodes } = buildGraph(input);
    expect(nodes).toEqual([
      { spn: 'alice@example.com', uuid: '11111111-0000-0000-0000-000000000001', type: 'person' },
      { spn: 'svc@example.com', uuid: '22222222-0000-0000-0000-000000000002', type: 'service_account' },
      { spn: 'team@example.com', uuid: '33333333-0000-0000-0000-000000000003', type: 'group' },
      { spn: 'idm_admins@example.com', uuid: '00000000-0000-0000-0000-000000000019', type: 'builtin_group' },
    ]);
  });

  test('edges run group -> member and skip members that are not nodes', () => {
    const { edges } = buildGraph(input);
    expect(edges).toEqual([
      { from: 'team@example.com', to: 'alice@example.com' },
      { from: 'team@example.com', to: 'svc@example.com' },
      { from: 'idm_admins@example.com', to: 'team@example.com' },
    ]);
  });

  test('a type filter drops nodes and the edges touching them', () => {
    const data = buildGraph(input, ['person', 'group']);
    expect(data.nodes.map((n) => n.spn)).toEqual([
      'alice@example.com',
      'team@example.com',
    ]);
    expect(data.edges).toEqual([
      { from: 'team@example.com', to: 'alice@example.com' },
    ]);
  });

  test('no filter means all types; an empty filter means none', () => {
    expect(buildGraph(input, undefined).nodes).toHaveLength(4);
    expect(buildGraph(input, [])).toEqual({ nodes: [], edges: [] });
  });
});

const small = buildGraph(input, ['person', 'group']);

describe('exporters', () => {
  test('graphviz: edges first, then one styled line per node', () => {
    expect(toGraphviz(small)).toBe(
      [
        'digraph {',
        '  rankdir="RL"',
        '  "team@example.com" -> "alice@example.com"',
        '  "alice@example.com" [color = "#af8bd6", shape = ellipse]',
        '  "team@example.com" [color = "#b86367", shape = box]',
        '}',
      ].join('\n')
    );
  });

  test('graphviz styles service accounts and built-in groups', () => {
    const text = toGraphviz(buildGraph(input));
    expect(text).toContain('"svc@example.com" [color = "#77c98d", shape = parallelogram]');
    expect(text).toContain('"idm_admins@example.com" [color = "#8bc1d6", shape = component]');
  });

  test('mermaid: ids replace @ with _, classes per node', () => {
    expect(toMermaid(small)).toBe(
      [
        'graph RL',
        '  team_example.com["team@example.com"] --> alice_example.com["alice@example.com"]',
        '  classDef groupClass fill:#f9f,stroke:#333,stroke-width:4px,stroke-dasharray: 5 5',
        '  classDef builtInGroupClass fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5',
        '  classDef serviceAccountClass fill:#f9f,stroke:#333,stroke-width:4px',
        '  classDef personClass fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff',
        '  alice_example.com["alice@example.com"]',
        '  class alice_example.com personClass',
        '  team_example.com["team@example.com"]',
        '  class team_example.com groupClass',
      ].join('\n')
    );
  });

  test('mermaid with elk adds the init line first', () => {
    const lines = toMermaid(small, true).split('\n');
    expect(lines[0]).toBe(
      '%%{init: {"flowchart": {"defaultRenderer": "elk"}} }%%'
    );
    expect(lines[1]).toBe('graph RL');
    expect(toMermaid(small, false).split('\n')[0]).toBe('graph RL');
  });

  test('renderGraph picks the exporter by format', () => {
    expect(renderGraph(small, 'graphviz')).toBe(toGraphviz(small));
    expect(renderGraph(small, 'mermaid')).toBe(toMermaid(small));
    expect(renderGraph(small, 'mermaid-elk')).toBe(toMermaid(small, true));
  });

  test('an empty graph still renders a valid document', () => {
    const empty = { nodes: [], edges: [] };
    expect(toGraphviz(empty)).toBe('digraph {\n  rankdir="RL"\n}');
    expect(toMermaid(empty).startsWith('graph RL')).toBe(true);
  });
});
