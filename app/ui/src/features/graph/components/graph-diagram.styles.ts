import { css } from 'lit';

export const graphDiagramStyles = css`
  :host {
    display: block;
  }
  .diagram-scroll {
    overflow: auto;
    max-height: 70vh;
    border: 1px solid var(--theme-color-border);
    border-radius: var(--theme-radius-md);
    background: var(--theme-color-surface);
  }
  svg {
    display: block;
  }
  .edge {
    fill: none;
    stroke: var(--theme-color-text-muted);
    stroke-width: 1.5;
  }
  .edge.reversed {
    stroke-dasharray: 5 4;
  }
  .arrow-head {
    fill: var(--theme-color-text-muted);
  }
  .node {
    cursor: pointer;
  }
  .node:focus {
    outline: none;
  }
  .node:focus-visible {
    outline: 2px solid var(--theme-color-primary);
    outline-offset: 2px;
  }
  .node:focus-visible .shape {
    stroke: var(--theme-color-primary);
    stroke-width: 3;
  }
  .shape {
    stroke: rgba(0, 0, 0, 0.25);
    stroke-width: 1;
  }
  .node text {
    fill: #1f2937;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 10px;
    font-size: 12px;
    color: var(--theme-color-text-secondary);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend-mark {
    display: block;
    flex: none;
  }
  .empty {
    margin: 0;
    font-size: 13px;
    color: var(--theme-color-text-muted);
  }
`;
