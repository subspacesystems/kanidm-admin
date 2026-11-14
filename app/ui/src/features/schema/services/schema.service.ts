// Schema service — read-only attribute type list through the backend
// proxy (/api/kanidm/*). Mirrors the vendored kanidm client's schema
// endpoint; no writes, so no withStepUp.

import { apiFetch } from '@/shared/services/http-client';
import type { KanidmEntry } from '@/shared/types/kanidm';
import type { SchemaAttribute } from '../types/schema.types';
import { toSchemaAttribute } from '../types/schema.types';

const BASE = '/api/kanidm/v1/schema/attributetype';

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
}

export const schemaService = SchemaService.getInstance();
