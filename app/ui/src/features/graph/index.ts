// Graph feature public surface.
export { graphService } from './services/graph.service.ts';
export * from './graph.ts';

// Side-effect import: registering the custom elements when the feature
// is imported.
import './components/graph-page.ts';
