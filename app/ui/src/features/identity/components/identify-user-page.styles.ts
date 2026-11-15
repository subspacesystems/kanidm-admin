import { css } from 'lit';

export const identifyUserPageStyles = css`
  :host {
    display: block;
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
  .own-id {
    margin-bottom: 8px;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--theme-color-text-muted);
  }
  form {
    display: block;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 16px;
  }
  .caption {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--theme-color-text-secondary);
  }
  .own-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 40px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--theme-color-text-primary);
  }
  .countdown {
    margin: 8px 0 0;
    font-size: 14px;
    color: var(--theme-color-text-secondary);
  }
  .countdown.expired {
    color: var(--theme-color-error);
  }
  .confirm {
    margin: 24px 0 0;
    font-size: 14px;
    color: var(--theme-color-text-primary);
  }
  .result {
    margin: 16px 0 0;
    padding: 12px;
    border-radius: 6px;
    font-size: 14px;
    background: var(--theme-color-background);
    color: var(--theme-color-text-primary);
  }
  .result.alert {
    border-left: 3px solid var(--theme-color-error);
  }
  .result.status {
    border-left: 3px solid var(--theme-color-success);
  }
`;
