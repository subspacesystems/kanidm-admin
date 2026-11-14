// Schema attribute type view models. Wire shape mirrors the Kanidm
// v1 entry (attrs: name -> string[]); only the fields the page shows
// are projected.

import type { KanidmEntry } from '@/shared/types/kanidm';
import { attrFirst } from '@/shared/types/kanidm';

/** One attribute type from Kanidm's schema. */
export interface SchemaAttribute {
  name: string;
  syntax: string;
  multivalue: boolean;
  unique: boolean;
  description: string;
}

/**
 * True when the first value is the string "true" (case-insensitive) or
 * the boolean true. Kanidm serializes booleans as the strings "true" /
 * "false".
 */
function flagTrue(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === undefined) {
    return false;
  }
  return value.toLowerCase() === 'true';
}

/** Map a v1 schema entry to the attribute row. */
export function toSchemaAttribute(entry: KanidmEntry): SchemaAttribute {
  const attrs = entry.attrs;
  return {
    name: attrFirst(entry, 'name') ?? '',
    syntax: attrFirst(entry, 'syntax') ?? '',
    multivalue: flagTrue(attrs['multivalue']?.[0]),
    unique: flagTrue(attrs['unique']?.[0]),
    description: attrFirst(entry, 'description') ?? '',
  };
}
