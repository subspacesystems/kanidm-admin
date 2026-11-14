// Schema classes browser: a read-only, filterable list of the classes
// defined in Kanidm's schema and a detail view for one class. Reached
// from the System page; no writes, so no step-up.

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import type { PropertyValues, TemplateResult } from 'lit';
import { localized } from '@/features/localization';
import { notificationService } from '@/features/notifications';
import { ApiError } from '@/shared/services/http-client';
import { navigate } from '@/shared/services/router.service';
import '@/shared/components/admin-layout';
import '@/shared/components/data-table';
import '@/shared/components/ui-card';
import '@/shared/components/ui-icon';
import type { TableColumn } from '@/shared/components/data-table';
import type { SchemaClass } from '../types/schema.types';
import { schemaService } from '../services/schema.service';
import { schemaClassesPageStyles } from './schema-classes-page.styles';

@customElement('schema-classes-page')
@localized()
export class SchemaClassesPage extends LitElement {
  @property() name = '';

  @state() private rows: SchemaClass[] = [];
  @state() private current: SchemaClass | null = null;
  @state() private loading = true;

  private loadedFor: string | null = null;
  private requestId = 0;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (
      changed.has('name') &&
      this.loadedFor !== null &&
      this.loadedFor !== this.name
    ) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    const name = this.name;
    const request = ++this.requestId;
    this.loadedFor = name;
    this.loading = true;
    try {
      if (name) {
        const current = await schemaService.classGet(name);
        if (request !== this.requestId) {
          return;
        }
        this.current = current;
      } else {
        const rows = await schemaService.classList();
        if (request !== this.requestId) {
          return;
        }
        this.rows = rows;
      }
    } catch (error) {
      if (request !== this.requestId) {
        return;
      }
      this.toastError(error, msg('Failed to load schema classes'));
    } finally {
      if (request === this.requestId) {
        this.loading = false;
      }
    }
  }

  private toastError(error: unknown, fallback: string): void {
    const message = error instanceof ApiError ? error.message : fallback;
    notificationService.error(message);
  }

  private listText(row: Record<string, unknown>, key: string): string {
    const values = row[key];
    return Array.isArray(values) ? values.join(', ') : '';
  }

  private get columns(): TableColumn[] {
    return [
      {
        key: 'name',
        header: msg('Name'),
        render: (row) => html`<span class="mono">${String(row.name)}</span>`,
      },
      { key: 'description', header: msg('Description') },
      {
        key: 'systemmay',
        header: msg('May'),
        render: (row) => this.listText(row, 'systemmay'),
      },
      {
        key: 'systemmust',
        header: msg('Must'),
        render: (row) => this.listText(row, 'systemmust'),
      },
      {
        key: 'systemsupplements',
        header: msg('Supplements'),
        render: (row) => this.listText(row, 'systemsupplements'),
      },
      {
        key: 'systemexcludes',
        header: msg('Excludes'),
        render: (row) => this.listText(row, 'systemexcludes'),
      },
    ];
  }

  private renderLinkList(
    items: string[],
    kind: 'attributes' | 'classes'
  ): TemplateResult {
    if (items.length === 0) {
      return html`<p class="muted">${msg('None')}</p>`;
    }
    return html`
      <ul class="entity-list">
        ${items.map((item) => {
          const path =
            kind === 'attributes'
              ? `/admin/system/attributes?filter=${encodeURIComponent(item)}`
              : `/admin/system/classes/${encodeURIComponent(item)}`;
          return html`
            <li>
              <a
                href=${path}
                @click=${(e: Event) => {
                  e.preventDefault();
                  navigate(path);
                }}
                >${item}</a
              >
            </li>
          `;
        })}
      </ul>
    `;
  }

  private renderSection(
    title: string,
    explanation: string,
    items: string[],
    kind: 'attributes' | 'classes'
  ) {
    return html`
      <section class="section">
        <h2>${title}</h2>
        <p class="muted">${explanation}</p>
        ${this.renderLinkList(items, kind)}
      </section>
    `;
  }

  private renderDetail() {
    return html`
      <a
        class="back"
        href="/admin/system/classes"
        @click=${(e: Event) => {
          e.preventDefault();
          navigate('/admin/system/classes');
        }}
      >
        <ui-icon name="chevron-right" size="14"></ui-icon>
        ${msg('Back to classes')}
      </a>
      <div class="page-head">
        <h1>${this.name}</h1>
      </div>

      ${this.loading
        ? nothing
        : this.current === null
          ? html`<ui-card>
              <p class="muted">${msg('Class not found.')}</p>
            </ui-card>`
          : html`
              <ui-card>
                <p class="description">${this.current.description}</p>
                ${this.renderSection(
                  msg('May'),
                  msg('Attributes a class may have.'),
                  this.current.systemmay,
                  'attributes'
                )}
                ${this.renderSection(
                  msg('Must'),
                  msg('Attributes every entry of this class must have.'),
                  this.current.systemmust,
                  'attributes'
                )}
                ${this.renderSection(
                  msg('Supplements'),
                  msg('Classes added to every entry of this class.'),
                  this.current.systemsupplements,
                  'classes'
                )}
                ${this.renderSection(
                  msg('Excludes'),
                  msg('Classes that cannot coexist with this class.'),
                  this.current.systemexcludes,
                  'classes'
                )}
              </ui-card>
            `}
    `;
  }

  private renderList() {
    return html`
      <a class="back" href="/admin/system">
        <ui-icon name="chevron-right" size="14"></ui-icon>
        ${msg('Back to System')}
      </a>
      <div class="page-head">
        <h1>${msg('Schema classes')}</h1>
      </div>

      <ui-card>
        <data-table
          .columns=${this.columns}
          .rows=${this.rows}
          .loading=${this.loading}
          .searchable=${true}
          .pageSize=${200}
          .searchPlaceholder=${msg('Filter classes...')}
          .emptyMessage=${msg('No classes found.')}
          @row-click=${(e: CustomEvent<{ row: SchemaClass }>) => {
            if (e.detail.row.name) {
              navigate(
                `/admin/system/classes/${encodeURIComponent(e.detail.row.name)}`
              );
            }
          }}
        ></data-table>
      </ui-card>
    `;
  }

  render() {
    return html`
      <admin-layout>
        ${this.name ? this.renderDetail() : this.renderList()}
      </admin-layout>
    `;
  }

  static styles = schemaClassesPageStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'schema-classes-page': SchemaClassesPage;
  }
}
