// Relationship graph: builds nodes and member edges from the person,
// service account and group lists and exports them as Graphviz or
// Mermaid text. Read-only, so no step-up. Reached from the System page.

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import { localized } from '@/features/localization';
import { notificationService } from '@/features/notifications';
import { ApiError } from '@/shared/services/http-client';
import '@/shared/components/admin-layout';
import '@/shared/components/ui-button';
import '@/shared/components/ui-card';
import '@/shared/components/ui-icon';
import {
  GRAPH_NODE_TYPES,
  buildGraph,
  renderGraph,
  type GraphData,
  type GraphFormat,
  type GraphInput,
  type GraphNodeType,
} from '../graph';
import { graphService } from '../services/graph.service';
import './graph-diagram';
import { graphPageStyles } from './graph-page.styles';

@customElement('graph-page')
@localized()
export class GraphPage extends LitElement {
  @state() private input: GraphInput = {
    persons: [],
    serviceAccounts: [],
    groups: [],
  };
  @state() private types: GraphNodeType[] = [...GRAPH_NODE_TYPES];
  @state() private format: GraphFormat = 'graphviz';
  @state() private view: 'text' | 'diagram' = 'text';
  @state() private loading = true;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      this.input = await graphService.load();
    } catch (error) {
      this.toastError(error, msg('Failed to load the relationship graph'));
    } finally {
      this.loading = false;
    }
  }

  private toastError(error: unknown, fallback: string): void {
    const message = error instanceof ApiError ? error.message : fallback;
    notificationService.error(message);
  }

  private toggleType(type: GraphNodeType, checked: boolean): void {
    if (checked) {
      this.types = GRAPH_NODE_TYPES.filter(
        (candidate) => candidate === type || this.types.includes(candidate)
      );
    } else {
      this.types = this.types.filter((candidate) => candidate !== type);
    }
  }

  private get data(): GraphData {
    return buildGraph(this.input, this.types);
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(renderGraph(this.data, this.format));
      notificationService.success(msg('Copied to clipboard.'));
    } catch {
      notificationService.error(msg('Failed to copy to clipboard.'));
    }
  }

  render() {
    const data = this.data;
    return html`
      <admin-layout>
        <a class="back" href="/admin/system">
          <ui-icon name="chevron-right" size="14"></ui-icon>
          ${msg('Back to System')}
        </a>
        <div class="page-head">
          <h1>${msg('Relationship graph')}</h1>
        </div>

        <ui-card>
          <div class="controls">
            <label class="type-filter">
              <input
                type="checkbox"
                .checked=${this.types.includes('person')}
                @change=${(e: Event) =>
                  this.toggleType(
                    'person',
                    (e.target as HTMLInputElement).checked
                  )}
              />
              ${msg('Person')}
            </label>
            <label class="type-filter">
              <input
                type="checkbox"
                .checked=${this.types.includes('service_account')}
                @change=${(e: Event) =>
                  this.toggleType(
                    'service_account',
                    (e.target as HTMLInputElement).checked
                  )}
              />
              ${msg('Service account')}
            </label>
            <label class="type-filter">
              <input
                type="checkbox"
                .checked=${this.types.includes('group')}
                @change=${(e: Event) =>
                  this.toggleType(
                    'group',
                    (e.target as HTMLInputElement).checked
                  )}
              />
              ${msg('Group')}
            </label>
            <label class="type-filter">
              <input
                type="checkbox"
                .checked=${this.types.includes('builtin_group')}
                @change=${(e: Event) =>
                  this.toggleType(
                    'builtin_group',
                    (e.target as HTMLInputElement).checked
                  )}
              />
              ${msg('Built-in group')}
            </label>
            ${this.view === 'text'
              ? html`<label class="format-filter">
                  ${msg('Format')}
                  <select
                    .value=${this.format}
                    @change=${(e: Event) =>
                      (this.format = (e.target as HTMLSelectElement)
                        .value as GraphFormat)}
                  >
                    <option value="graphviz">${msg('Graphviz')}</option>
                    <option value="mermaid">${msg('Mermaid')}</option>
                    <option value="mermaid-elk">${msg('Mermaid (ELK)')}</option>
                  </select>
                </label>`
              : ''}
          </div>

          ${this.loading
            ? html`<p class="muted">${msg('Loading...')}</p>`
            : html`
                <div class="view-switch" role="group">
                  <label class="view-option">
                    <input
                      type="radio"
                      name="graph-view"
                      value="diagram"
                      .checked=${this.view === 'diagram'}
                      @change=${() => (this.view = 'diagram')}
                    />
                    ${msg('Diagram')}
                  </label>
                  <label class="view-option">
                    <input
                      type="radio"
                      name="graph-view"
                      value="text"
                      .checked=${this.view === 'text'}
                      @change=${() => (this.view = 'text')}
                    />
                    ${msg('Text')}
                  </label>
                </div>
                <div class="output-head">
                  <p class="meta">
                    ${msg(
                      str`${data.nodes.length} nodes, ${data.edges.length} edges`
                    )}
                  </p>
                  ${this.view === 'text'
                    ? html`<ui-button icon="copy" @click=${this.copy}>
                        ${msg('Copy')}
                      </ui-button>`
                    : ''}
                </div>
                ${this.view === 'text'
                  ? html`<pre class="graph-output">
${renderGraph(data, this.format)}</pre
                    >`
                  : html`<graph-diagram .data=${data}></graph-diagram>`}
              `}
        </ui-card>
      </admin-layout>
    `;
  }

  static styles = graphPageStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'graph-page': GraphPage;
  }
}
