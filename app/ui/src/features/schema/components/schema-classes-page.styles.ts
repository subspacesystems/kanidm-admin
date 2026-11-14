import { css } from 'lit';

export const schemaClassesPageStyles = css`
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
  .description {
    margin: 0 0 16px;
    font-size: 14px;
    color: var(--theme-color-text-secondary);
  }
  .section {
    margin-bottom: 20px;
  }
  .section:last-child {
    margin-bottom: 0;
  }
  .section h2 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-color-text-primary);
  }
  .section .muted {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--theme-color-text-muted);
  }
  .entity-list {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
  }
  .entity-list li {
    margin-bottom: 2px;
  }
  .entity-list a {
    color: var(--theme-color-primary);
    text-decoration: none;
  }
  .entity-list a:hover {
    text-decoration: underline;
  }
  .mono {
    font-family: var(--theme-font-mono, monospace);
    font-size: 13px;
  }
`;
