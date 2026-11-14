// Schema attribute types browser: a read-only, filterable list of the
// attribute types defined in Kanidm's schema (name, syntax, multivalue,
// unique, description). Reached from the System page; no writes, so no
// step-up.

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { localized } from '@/features/localization';
import { notificationService } from '@/features/notifications';
import { ApiError } from '@/shared/services/http-client';
import '@/shared/components/admin-layout';
import '@/shared/components/data-table';
import '@/shared/components/ui-card';
import '@/shared/components/ui-icon';
import type { TableColumn } from '@/shared/components/data-table';
import type { SchemaAttribute } from '../types/schema.types';
import { schemaService } from '../services/schema.service';
import { schemaAttributesPageStyles } from './schema-attributes-page.styles';

@customElement('schema-attributes-page')
@localized()
export class SchemaAttributesPage extends LitElement {
  @state() private attributes: SchemaAttribute[] = [];
  @state() private loading = true;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      this.attributes = await schemaService.attributeList();
    } catch (error) {
      this.toastError(error, msg('Failed to load schema attributes'));
    } finally {
      this.loading = false;
    }
  }

  private toastError(error: unknown, fallback: string): void {
    const message = error instanceof ApiError ? error.message : fallback;
    notificationService.error(message);
  }

  private get columns(): TableColumn[] {
    return [
      {
        key: 'name',
        header: msg('Name'),
        render: (row) => html`<span class="mono">${String(row.name)}</span>`,
      },
      { key: 'syntax', header: msg('Syntax') },
      {
        key: 'multivalue',
        header: msg('Multivalue'),
        render: (row) =>
          row.multivalue ? html`${msg('Yes')}` : html`${msg('No')}`,
      },
      {
        key: 'unique',
        header: msg('Unique'),
        render: (row) => (row.unique ? html`${msg('Yes')}` : html`${msg('No')}`),
      },
      { key: 'description', header: msg('Description') },
    ];
  }

  render() {
    return html`
      <admin-layout>
        <a class="back" href="/admin/system">
          <ui-icon name="chevron-right" size="14"></ui-icon>
          ${msg('Back to System')}
        </a>
        <div class="page-head">
          <h1>${msg('Schema attributes')}</h1>
        </div>

        <ui-card>
          <data-table
            .columns=${this.columns}
            .rows=${this.attributes}
            .loading=${this.loading}
            .searchable=${true}
            .searchPlaceholder=${msg('Filter attributes...')}
            .emptyMessage=${msg('No attribute types found.')}
          ></data-table>
        </ui-card>
      </admin-layout>
    `;
  }

  static styles = schemaAttributesPageStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'schema-attributes-page': SchemaAttributesPage;
  }
}
