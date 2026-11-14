// Schema service — read-only attribute type list through the backend
// proxy (/api/kanidm/*). Mirrors the vendored kanidm client's schema
// endpoint; no writes, so no withStepUp.

import { apiFetch } from '@/shared/services/http-client';
import type { KanidmEntry } from '@/shared/types/kanidm';
import type { SchemaAttribute, SchemaClass } from '../types/schema.types';
import { toSchemaAttribute, toSchemaClass } from '../types/schema.types';

const BASE = '/api/kanidm/v1/schema/attributetype';
const CLASS_BASE = '/api/kanidm/v1/schema/classtype';

class SchemaService {
  private static instance: SchemaService;

  private constructor() {}

  static getInstance(): SchemaService {
    if (!SchemaService.instance) {
      SchemaService.instance = new SchemaService();
    }
    return SchemaService.instance;
  }

  /**
   * Attribute type list (vendor schema_attribute_list:
   * GET /v1/schema/attributetype -> [{ attrs: {...} }]). Entries are
   * mapped to the page row model and sorted by name.
   */
  async attributeList(): Promise<SchemaAttribute[]> {
    const entries = await apiFetch<KanidmEntry[]>(BASE);
    return entries
      .map((entry) => toSchemaAttribute(entry))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Class type list (vendor idm_schema_classtype_list:
   * GET /v1/schema/classtype -> [{ attrs: {...} }]). Mapped to the page
   * row model and sorted by name.
   */
  async classList(): Promise<SchemaClass[]> {
    const entries = await apiFetch<KanidmEntry[]>(CLASS_BASE);
    return entries
      .map((entry) => toSchemaClass(entry))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** One class by name (vendor idm_schema_classtype_get). */
  async classGet(name: string): Promise<SchemaClass | null> {
    const entry = await apiFetch<KanidmEntry | null>(
      `${CLASS_BASE}/${encodeURIComponent(name)}`
    );
    return entry === null ? null : toSchemaClass(entry);
  }
}

export const schemaService = SchemaService.getInstance();
