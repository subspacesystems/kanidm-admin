// Schema feature public surface.
export { schemaService } from './services/schema.service.ts';
export type { SchemaAttribute } from './types/schema.types.ts';

// Side-effect import: registering the custom element when the feature
// is imported.
import './components/schema-attributes-page.ts';
