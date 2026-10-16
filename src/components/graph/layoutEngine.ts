import type { Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { EntityNodeType, EntityNodeData } from './EntityNode';

// ==========================================
// ENTERPRISE GRAPH LAYOUT ENGINE
// Multi-strategy layout algorithms for ReasonChain:
// 1. Radial / Sector Layout (Entity-Centric Investigation)
// 2. Hierarchical / DAG Layout (Ownership & Control Chains)
// 3. Multi-Hop Path Tracing (Causal Explanations)
// 4. Clustered Macro Overview (Community Grouping)
// ==========================================

export interface RawApiNode {
  id: string;
  label: string;
  entity_type?: string;
  type?: string;
  display_name?: string;
  important_identifier?: string;
  confidence?: number;
  is_synthetic?: boolean;
  source_system?: string;
  status?: string;
  risk?: string;
  properties?: Record<string, any>;
}

export interface RawApiEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  relationship_type?: string;
  display_label?: string;
  confidence?: number;
  is_synthetic?: boolean;
  properties?: Record<string, any>;
}

export interface GraphQualityMetrics {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  componentCount: number;
  maxHopDepth: number;
  recommendedLayout: 'radial' | 'hierarchical' | 'overview';
}

// Compute graph quality metrics to automatically guide layout
export function calculateGraphQuality(
  nodes: RawApiNode[],
  edges: RawApiEdge[]
): GraphQualityMetrics {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

  let recommendedLayout: 'radial' | 'hierarchical' | 'overview' = 'radial';
  if (nodeCount > 40) {
    recommendedLayout = 'overview';
  } else if (edgeCount > 0 && edgeCount < 15) {
    recommendedLayout = 'hierarchical';
  }

  return {
    nodeCount,
    edgeCount,
    avgDegree: Math.round(avgDegree * 10) / 10,
    componentCount: 1,
    maxHopDepth: 3,
    recommendedLayout,
  };
}

// Helper to construct a React Flow EntityNode
function createNode(
  raw: RawApiNode,
  x: number,
  y: number,
  isFocal: boolean = false,
  extra: Partial<EntityNodeData> = {}
): EntityNodeType {
  const props = raw.properties || {};
  const entityType = raw.entity_type || raw.type || 'Company';

  return {
    id: raw.id,
    type: 'entity',
    position: { x, y },
    data: {
      label: raw.display_name || raw.label || raw.id,
      entityType,
      important_identifier: raw.important_identifier || props.cin || props.din || props.contract_number,
      details: props.status || props.country || props.industry || entityType,
      status: raw.status || props.status || props.company_status || 'Active',
      risk: raw.risk || props.risk_level || (entityType === 'Sanction' ? 'CRITICAL' : 'LOW'),
      confidence: raw.confidence !== undefined ? raw.confidence : props.entity_confidence,
      is_synthetic: Boolean(raw.is_synthetic || props.mock_record || props.is_synthetic),
      source_system: raw.source_system || (props.cin ? 'firebase' : 'relational'),
      isActive: false,
      isFocal,
      properties: props,
      ...extra,
    },
  };
}

// Edge styling map based on semantic relationship types
const EDGE_COLORS: Record<string, string> = {
  SUPPLIES: '#06b6d4',
  HAS_DIRECTOR: '#a855f7',
  DIRECTOR_OF: '#a855f7',
  OWNS: '#3b82f6',
  HAS_CONTRACT: '#10b981',
  SANCTIONED_BY: '#ef4444',
  LOCATED_IN: '#14b8a6',
  REGISTERED_IN: '#14b8a6',
  TRANSACTS_WITH: '#10b981',
};

// Helper to build React Flow styled edges
export function buildEdges(
  apiEdges: RawApiEdge[],
  nodeIds: Set<string>,
  options: {
    highlightedPathIds?: Set<string>;
    dimUnrelated?: boolean;
    stepPrefix?: boolean;
    showAllLabels?: boolean;
  } = {}
): Edge[] {
  return apiEdges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, idx) => {
      const relType = e.relationship_type || e.label || 'RELATIONSHIP';
      const isSynth = Boolean(e.is_synthetic || e.properties?.mock_record || e.properties?.is_synthetic);
      const isPath = options.highlightedPathIds?.has(e.id);
      const isDimmed = options.dimUnrelated && !isPath;

      let displayLabel = e.display_label || e.label || relType.replace(/_/g, ' ');
      if (isSynth) {
        displayLabel = `${displayLabel} [SYNTHETIC]`;
      }
      if (options.stepPrefix) {
        displayLabel = `Step #${idx + 1}: ${displayLabel}`;
      }

      const baseColor = isSynth ? '#fbbf24' : (EDGE_COLORS[relType] || '#38bdf8');
      const strokeColor = isPath ? '#06b6d4' : baseColor;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'default',
        animated: isPath,
        label: displayLabel,
        labelStyle: {
          fill: isPath ? '#38bdf8' : isSynth ? '#fbbf24' : '#cbd5e1',
          fontSize: 8.5,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: '0.04em',
        },
        labelBgStyle: {
          fill: '#020617',
          fillOpacity: 0.95,
          stroke: isPath ? '#06b6d4' : isSynth ? '#b45309' : '#1e293b',
          strokeWidth: 1,
          rx: 5,
          ry: 5,
        },
        labelBgPadding: [7, 3] as [number, number],
        style: {
          stroke: strokeColor,
          strokeWidth: isPath ? 2.8 : isSynth ? 1.8 : 2,
          strokeDasharray: isSynth ? '5,4' : undefined,
          strokeOpacity: isDimmed ? 0.15 : 0.9,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 12,
          height: 12,
        },
        data: {
          ...e,
          relationship_type: relType,
          display_label: displayLabel,
          is_synthetic: isSynth,
        },
      };
    });
}

// ==========================================
// 1. RADIAL / SECTOR LAYOUT
// Entity-centric investigation around root entity
// Bounded by hopDepth (1 to 3 hops)
// ==========================================
export function layoutRadial(
  rootId: string,
  apiNodes: RawApiNode[],
  apiEdges: RawApiEdge[],
  hopDepth: number = 2
): { nodes: EntityNodeType[]; edges: Edge[] } {
  const nodeMap = new Map<string, RawApiNode>();
  for (const n of apiNodes) nodeMap.set(n.id, n);

  const rootRaw = nodeMap.get(rootId);
  if (!rootRaw) return { nodes: [], edges: [] };

  // BFS traversal up to hopDepth
  const hops = new Map<string, number>();
  hops.set(rootId, 0);

  const queue = [rootId];
  const includedEdgeIds = new Set<string>();
  const includedEdges: RawApiEdge[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currHop = hops.get(curr)!;
    if (currHop >= hopDepth) continue;

    for (const e of apiEdges) {
      if (e.source === curr || e.target === curr) {
        const neighbor = e.source === curr ? e.target : e.source;
        if (nodeMap.has(neighbor)) {
          if (!hops.has(neighbor)) {
            hops.set(neighbor, currHop + 1);
            queue.push(neighbor);
          }
          if (!includedEdgeIds.has(e.id)) {
            includedEdgeIds.add(e.id);
            includedEdges.push(e);
          }
        }
      }
    }
  }

  const rfNodes: EntityNodeType[] = [];

  // Root node at (0, 0)
  rfNodes.push(createNode(rootRaw, 0, 0, true, { hopDistance: 0 }));

  // Separate nodes by hop depth
  const hop1Nodes: RawApiNode[] = [];
  const hop2Nodes: RawApiNode[] = [];
  const hop3Nodes: RawApiNode[] = [];

  hops.forEach((h, id) => {
    if (id === rootId) return;
    const raw = nodeMap.get(id);
    if (!raw) return;
    if (h === 1) hop1Nodes.push(raw);
    else if (h === 2) hop2Nodes.push(raw);
    else if (h === 3) hop3Nodes.push(raw);
  });

  // Hop 1 nodes placed in directional sectors by role:
  // West (Suppliers), East (Directors), South (Contracts), North (Sanctions/Risks)
  const suppliers = hop1Nodes.filter(n => (n.entity_type || n.type) === 'Supplier');
  const directors = hop1Nodes.filter(n => (n.entity_type || n.type) === 'Person' || (n.entity_type || n.type) === 'Director');
  const contracts = hop1Nodes.filter(n => (n.entity_type || n.type) === 'Contract');
  const others = hop1Nodes.filter(n => !suppliers.includes(n) && !directors.includes(n) && !contracts.includes(n));

  suppliers.forEach((n, i) => {
    const yOffset = (i - (suppliers.length - 1) / 2) * 115;
    rfNodes.push(createNode(n, -340, yOffset, false, { hopDistance: 1 }));
  });

  directors.forEach((n, i) => {
    const yOffset = (i - (directors.length - 1) / 2) * 115;
    rfNodes.push(createNode(n, 340, yOffset, false, { hopDistance: 1 }));
  });

  contracts.forEach((n, i) => {
    const xOffset = (i - (contracts.length - 1) / 2) * 240;
    rfNodes.push(createNode(n, xOffset, 180, false, { hopDistance: 1 }));
  });

  others.forEach((n, i) => {
    const xOffset = (i - (others.length - 1) / 2) * 250;
    rfNodes.push(createNode(n, xOffset, -180, false, { hopDistance: 1 }));
  });

  // Hop 2 nodes placed on outer orbit
  const R2 = 560;
  hop2Nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / (hop2Nodes.length || 1) - Math.PI / 2;
    const x = Math.round(R2 * Math.cos(angle)) - 110;
    const y = Math.round(R2 * Math.sin(angle)) - 45;
    rfNodes.push(createNode(n, x, y, false, { hopDistance: 2 }));
  });

  // Hop 3 nodes placed on outermost orbit
  const R3 = 780;
  hop3Nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / (hop3Nodes.length || 1) - Math.PI / 2;
    const x = Math.round(R3 * Math.cos(angle)) - 110;
    const y = Math.round(R3 * Math.sin(angle)) - 45;
    rfNodes.push(createNode(n, x, y, false, { hopDistance: 3 }));
  });

  const nodeIds = new Set(rfNodes.map(n => n.id));
  const rfEdges = buildEdges(includedEdges, nodeIds);

  return { nodes: rfNodes, edges: rfEdges };
}

// ==========================================
// 2. HIERARCHICAL / DAG LAYOUT
// Multi-hop ownership, control, and reasoning flow
// ==========================================
export function layoutHierarchical(
  rootId: string,
  apiNodes: RawApiNode[],
  apiEdges: RawApiEdge[],
  hopDepth: number = 3
): { nodes: EntityNodeType[]; edges: Edge[] } {
  const nodeMap = new Map<string, RawApiNode>();
  for (const n of apiNodes) nodeMap.set(n.id, n);

  const rootRaw = nodeMap.get(rootId);
  if (!rootRaw) return { nodes: [], edges: [] };

  const levels = new Map<string, number>();
  levels.set(rootId, 0);

  const queue = [rootId];
  const includedEdges: RawApiEdge[] = [];
  const includedEdgeIds = new Set<string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLevel = levels.get(curr)!;
    if (currLevel >= hopDepth) continue;

    for (const e of apiEdges) {
      if (e.source === curr || e.target === curr) {
        const neighbor = e.source === curr ? e.target : e.source;
        if (nodeMap.has(neighbor)) {
          if (!levels.has(neighbor)) {
            levels.set(neighbor, currLevel + 1);
            queue.push(neighbor);
          }
          if (!includedEdgeIds.has(e.id)) {
            includedEdgeIds.add(e.id);
            includedEdges.push(e);
          }
        }
      }
    }
  }

  // Bucket nodes by level
  const levelBuckets = new Map<number, string[]>();
  levels.forEach((lvl, id) => {
    if (!levelBuckets.has(lvl)) levelBuckets.set(lvl, []);
    levelBuckets.get(lvl)!.push(id);
  });

  const rfNodes: EntityNodeType[] = [];
  const X_COL_GAP = 360;
  const Y_ROW_GAP = 135;

  levelBuckets.forEach((ids, lvl) => {
    const totalInLvl = ids.length;
    ids.forEach((id, rowIdx) => {
      const raw = nodeMap.get(id)!;
      const x = lvl * X_COL_GAP;
      const y = (rowIdx - (totalInLvl - 1) / 2) * Y_ROW_GAP;

      const rfNode = createNode(raw, x, y, id === rootId, { stepNumber: lvl });
      rfNodes.push(rfNode);
    });
  });

  const nodeIds = new Set(rfNodes.map(n => n.id));
  const rfEdges = buildEdges(includedEdges, nodeIds, { stepPrefix: true });

  return { nodes: rfNodes, edges: rfEdges };
}

// ==========================================
// 3. TRACE CONNECTION / SHORTEST PATH LAYOUT
// High-emphasis path highlighting with dimming
// ==========================================
export function layoutPathTrace(
  sourceId: string,
  targetId: string,
  apiNodes: RawApiNode[],
  apiEdges: RawApiEdge[]
): {
  nodes: EntityNodeType[];
  edges: Edge[];
  pathFound: boolean;
  pathEntities: string[];
} {
  const nodeMap = new Map<string, RawApiNode>();
  for (const n of apiNodes) nodeMap.set(n.id, n);

  // Build adjacency
  const adj = new Map<string, Array<{ neighbor: string; edge: RawApiEdge }>>();
  for (const n of apiNodes) adj.set(n.id, []);

  for (const e of apiEdges) {
    adj.get(e.source)?.push({ neighbor: e.target, edge: e });
    adj.get(e.target)?.push({ neighbor: e.source, edge: e });
  }

  // BFS shortest path
  const prev = new Map<string, { prevNode: string; edge: RawApiEdge }>();
  const visited = new Set<string>();
  const queue = [sourceId];
  visited.add(sourceId);

  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === targetId) {
      found = true;
      break;
    }
    const edgesOut = adj.get(curr) || [];
    for (const { neighbor, edge } of edgesOut) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        prev.set(neighbor, { prevNode: curr, edge });
        queue.push(neighbor);
      }
    }
  }

  // Reconstruct path
  const pathNodes: string[] = [];
  const pathEdgeIds = new Set<string>();

  if (found) {
    let curr = targetId;
    pathNodes.unshift(curr);
    while (curr !== sourceId) {
      const step = prev.get(curr)!;
      pathEdgeIds.add(step.edge.id);
      curr = step.prevNode;
      pathNodes.unshift(curr);
    }
  } else {
    pathNodes.push(sourceId, targetId);
  }

  const rfNodes: EntityNodeType[] = [];
  const X_GAP = 360;

  pathNodes.forEach((id, stepIdx) => {
    const raw = nodeMap.get(id);
    if (!raw) return;
    const x = stepIdx * X_GAP;
    const y = 0;

    const rfNode = createNode(raw, x, y, id === sourceId, {
      stepNumber: stepIdx,
      isHighlightedPath: true,
    });
    rfNodes.push(rfNode);
  });

  const nodeIds = new Set(rfNodes.map(n => n.id));
  const relevantEdges = apiEdges.filter(e => pathEdgeIds.has(e.id));
  const rfEdges = buildEdges(relevantEdges, nodeIds, {
    highlightedPathIds: pathEdgeIds,
    stepPrefix: true,
  });

  return {
    nodes: rfNodes,
    edges: rfEdges,
    pathFound: found,
    pathEntities: pathNodes.map(id => nodeMap.get(id)?.display_name || id),
  };
}

// ==========================================
// 4. CLUSTERED COMMUNITY MACRO OVERVIEW
// Groups corporate clusters neatly without overlapping hairball
// ==========================================
export function layoutOverview(
  apiNodes: RawApiNode[],
  apiEdges: RawApiEdge[],
  activeFilter: string = 'All'
): { nodes: EntityNodeType[]; edges: Edge[] } {
  let visibleApiNodes = apiNodes;
  if (activeFilter !== 'All') {
    visibleApiNodes = apiNodes.filter(n => {
      const t = n.entity_type || n.type || 'Company';
      if (activeFilter === 'Companies') return t === 'Company';
      if (activeFilter === 'Directors') return t === 'Person' || t === 'Director';
      if (activeFilter === 'Suppliers') return t === 'Supplier';
      if (activeFilter === 'Contracts') return t === 'Contract';
      if (activeFilter === 'Sanctions') return t === 'Sanction';
      return t === activeFilter;
    });
  }

  const visibleMap = new Map<string, RawApiNode>();
  for (const n of visibleApiNodes) visibleMap.set(n.id, n);

  const adj = new Map<string, Set<string>>();
  for (const n of visibleApiNodes) adj.set(n.id, new Set());

  const validEdges = apiEdges.filter(
    e => visibleMap.has(e.source) && visibleMap.has(e.target)
  );

  for (const e of validEdges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  // Connected components
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const n of visibleApiNodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    visited.add(n.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      const neighbors = adj.get(curr) || new Set();
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(comp);
  }

  const connectedClusters = components.filter(c => c.length > 1);
  const standaloneIds = components.filter(c => c.length === 1).map(c => c[0]);

  const rfNodes: EntityNodeType[] = [];
  const CLUSTER_COLS = 2;
  const CLUSTER_W = 740;
  const CLUSTER_H = 340;

  connectedClusters.forEach((comp, idx) => {
    const col = idx % CLUSTER_COLS;
    const row = Math.floor(idx / CLUSTER_COLS);
    const cx = col * CLUSTER_W + 320;
    const cy = row * CLUSTER_H + 160;

    let hubId = comp.find(id => (visibleMap.get(id)?.entity_type || visibleMap.get(id)?.type) === 'Company') || comp[0];
    const hubRaw = visibleMap.get(hubId)!;
    rfNodes.push(createNode(hubRaw, cx - 110, cy - 45, true));

    const satellites = comp.filter(id => id !== hubId);
    let l = 0, r = 0, b = 0;

    satellites.forEach(satId => {
      const raw = visibleMap.get(satId)!;
      const t = raw.entity_type || raw.type;
      let sx = cx, sy = cy;

      if (t === 'Supplier') {
        sx = cx - 330;
        sy = cy - 50 + l * 105;
        l++;
      } else if (t === 'Person' || t === 'Director') {
        sx = cx + 150;
        sy = cy - 50 + r * 105;
        r++;
      } else if (t === 'Contract') {
        sx = cx - 80 + b * 240;
        sy = cy + 105;
        b++;
      } else {
        sx = cx + (r > l ? -330 : 150);
        sy = cy + 100;
      }
      rfNodes.push(createNode(raw, sx, sy, false));
    });
  });

  // Standalone catalog entities row below
  if (standaloneIds.length > 0) {
    const totalRows = Math.ceil(connectedClusters.length / CLUSTER_COLS);
    const startY = totalRows * CLUSTER_H + 50;
    standaloneIds.slice(0, 16).forEach((id, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const raw = visibleMap.get(id)!;
      rfNodes.push(createNode(raw, col * 245, startY + row * 110, false));
    });
  }

  const nodeIds = new Set(rfNodes.map(n => n.id));
  const rfEdges = buildEdges(validEdges, nodeIds);

  return { nodes: rfNodes, edges: rfEdges };
}
