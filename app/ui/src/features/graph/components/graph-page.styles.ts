import { css } from 'lit';

export const graphPageStyles = css`
  :host {
    display: block;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--theme-color-text-secondary);
    text-decoration: none;
    border-radius: var(--theme-radius-sm);
    transition: color var(--theme-duration-fast) var(--theme-ease);
  }
  .back:focus-visible {
    outline: none;
    box-shadow: var(--theme-focus-ring);
  }
  .back:hover {
    color: var(--theme-color-text-primary);
  }
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--theme-color-text-primary);
  }
  ui-card {
    display: block;
    margin-bottom: 16px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .view-switch {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--theme-color-text-primary);
  }
  .view-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  .view-option input {
    margin: 0;
    accent-color: var(--theme-color-primary);
  }

  .type-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--theme-color-text-primary);
    cursor: pointer;
    user-select: none;
  }
  .type-filter input {
    margin: 0;
    accent-color: var(--theme-color-primary);
  }
  .format-filter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    font-size: 13px;
    color: var(--theme-color-text-primary);
  }
  .format-filter select {
    padding: 6px 8px;
    font: inherit;
    color: var(--theme-color-text-primary);
    background: var(--theme-color-surface);
    border: 1px solid var(--theme-color-border);
    border-radius: var(--theme-radius-md);
    transition: border-color var(--theme-duration) var(--theme-ease);
  }
  .format-filter select:focus-visible {
    outline: none;
    border-color: var(--theme-color-primary);
    box-shadow: var(--theme-focus-ring);
  }
  .output-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .meta {
    margin: 0;
    font-size: 13px;
    color: var(--theme-color-text-muted);
  }
  .graph-output {
    margin: 0;
    padding: 12px;
    overflow: auto;
    font-family: var(--theme-font-mono, ui-monospace, monospace);
    font-size: 13px;
    color: var(--theme-color-text-primary);
    background: var(--theme-color-surface-sunken);
    border: 1px solid var(--theme-color-border);
    border-radius: var(--theme-radius-md);
    white-space: pre;
  }
  .muted {
    margin: 0;
    font-size: 13px;
    color: var(--theme-color-text-muted);
  }
`;
