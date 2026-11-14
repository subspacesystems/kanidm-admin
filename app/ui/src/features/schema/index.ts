// Schema feature public surface.
export { schemaService } from './services/schema.service.ts';
export type { SchemaAttribute, SchemaClass } from './types/schema.types.ts';

// Side-effect import: registering the custom elements when the feature
// is imported.
import './components/schema-attributes-page.ts';
import './components/schema-classes-page.ts';
