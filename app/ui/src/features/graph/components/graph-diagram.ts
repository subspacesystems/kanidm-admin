// Relationship graph: hand-written SVG diagram of the same nodes and
// membership edges the text exporters describe. Nodes link to their detail
// pages; the type filter applies before the data reaches this component.

import { LitElement, html, svg, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { localized } from '@/features/localization';
import { navigate } from '@/shared/services/router.service';
import {
  GRAPH_NODE_TYPES,
  type GraphData,
  type GraphNode,
  type GraphNodeType,
} from '../graph';
import {
  NODE_STYLES,
  layoutGraph,
  truncateLabel,
  type GraphLayout,
  type NodeShape,
  type PlacedNode,
} from '../layout';
import { graphDiagramStyles } from './graph-diagram.styles';

@customElement('graph-diagram')
@localized()
export class GraphDiagram extends LitElement {
  @property({ attribute: false }) data: GraphData = { nodes: [], edges: [] };

  private cachedData?: GraphData;
  private cachedLayout?: GraphLayout;

  private get layout(): GraphLayout {
    if (this.cachedData !== this.data || !this.cachedLayout) {
      this.cachedData = this.data;
      this.cachedLayout = layoutGraph(this.data);
    }
    return this.cachedLayout;
  }

  private typeLabel(type: GraphNodeType): string {
    switch (type) {
      case 'service_account':
        return msg('Service account');
      case 'group':
        return msg('Group');
      case 'builtin_group':
        return msg('Built-in group');
      case 'person':
      default:
        return msg('Person');
    }
  }

  private open(node: GraphNode): void {
    const base =
      node.type === 'person'
        ? '/admin/persons'
        : node.type === 'service_account'
          ? '/admin/service-accounts'
          : '/admin/groups';
    navigate(`${base}/${encodeURIComponent(node.uuid)}`);
  }

  private onKeydown(event: KeyboardEvent, node: GraphNode): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open(node);
    }
  }

  private shape(
    shape: NodeShape,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    className = 'shape'
  ): TemplateResult {
    switch (shape) {
      case 'ellipse':
        return svg`<ellipse
          class=${className}
          cx=${x + width / 2}
          cy=${y + height / 2}
          rx=${width / 2}
          ry=${height / 2}
          fill=${color}
        ></ellipse>`;
      case 'parallelogram': {
        const offset = Math.min(18, width * 0.15);
        return svg`<polygon
          class=${className}
          points="${x + offset},${y} ${x + width},${y} ${x + width - offset},${y + height} ${x},${y + height}"
          fill=${color}
        ></polygon>`;
      }
      case 'hexagon': {
        const cut = Math.min(16, height / 2);
        return svg`<polygon
          class=${className}
          points="${x + cut},${y} ${x + width - cut},${y} ${x + width},${y + height / 2} ${x + width - cut},${y + height} ${x + cut},${y + height} ${x},${y + height / 2}"
          fill=${color}
        ></polygon>`;
      }
      case 'box':
      default:
        return svg`<rect
          class=${className}
          x=${x}
          y=${y}
          width=${width}
          height=${height}
          rx="6"
          fill=${color}
        ></rect>`;
    }
  }

  private node(placed: PlacedNode): TemplateResult {
    const style = NODE_STYLES[placed.node.type];
    return svg`
      <g
        class="node"
        data-spn=${placed.node.spn}
        data-type=${placed.node.type}
        tabindex="0"
        role="link"
        aria-label=${placed.node.spn}
        @click=${() => this.open(placed.node)}
        @keydown=${(event: KeyboardEvent) => this.onKeydown(event, placed.node)}
      >
        ${this.shape(
          style.shape,
          placed.x,
          placed.y,
          placed.width,
          placed.height,
          style.color
        )}
        <text x=${placed.x + placed.width / 2} y=${placed.y + placed.height / 2}
          >${truncateLabel(placed.node.spn)}</text
        >
        <title>${placed.node.spn}</title>
      </g>
    `;
  }

  private legend(data: GraphData): TemplateResult {
    const present = GRAPH_NODE_TYPES.filter((type) =>
      data.nodes.some((node) => node.type === type)
    );
    return html`
      <div class="legend">
        ${present.map((type) => {
          const style = NODE_STYLES[type];
          return html`
            <span class="legend-item">
              <svg
                class="legend-mark"
                width="18"
                height="12"
                viewBox="0 0 18 12"
                aria-hidden="true"
              >
                ${this.shape(
                  style.shape,
                  0,
                  0,
                  18,
                  12,
                  style.color,
                  'legend-fill'
                )}
              </svg>
              ${this.typeLabel(type)}
            </span>
          `;
        })}
      </div>
    `;
  }

  render() {
    const data = this.data;
    if (data.nodes.length === 0) {
      return html`<p class="empty">${msg('No objects to draw.')}</p>`;
    }
    const layout = this.layout;
    return html`
      <div class="diagram-scroll">
        <svg
          width=${layout.width}
          height=${layout.height}
          viewBox="0 0 ${layout.width} ${layout.height}"
          role="img"
          aria-label=${msg('Relationship graph diagram')}
        >
          <defs>
            <marker
              id="graph-arrow"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path class="arrow-head" d="M 0 0 L 10 4 L 0 8 z"></path>
            </marker>
          </defs>
          ${layout.edges.map((edge) => {
            const [first, last] = edge.points;
            return svg`<path
              class="edge ${edge.reversed ? 'reversed' : ''}"
              data-from=${edge.from}
              data-to=${edge.to}
              marker-end="url(#graph-arrow)"
              d="M ${first.x} ${first.y} L ${last.x} ${last.y}"
            ></path>`;
          })}
          ${layout.nodes.map((placed) => this.node(placed))}
        </svg>
      </div>
      ${this.legend(data)}
    `;
  }

  static styles = graphDiagramStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'graph-diagram': GraphDiagram;
  }
}
