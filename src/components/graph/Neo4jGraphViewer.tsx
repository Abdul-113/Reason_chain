import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  RefreshCw,
  Maximize2,
  X,
  Minus,
  Plus,
  Database,
  GitBranch,
  Server,
  WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EntityNode } from './EntityNode';
import type { EntityNodeType } from './EntityNode';

// ==========================================
// NEO4J KNOWLEDGE GRAPH VIEWER
// Fetches real graph data from GET /api/graph
// and renders it using React Flow.
// ==========================================

const API_BASE = 'http://localhost:8000/api/graph';

// Force-directed layout positioning algorithm
function layoutNodes(
  apiNodes: Array<{ id: string; label: string; type: string; properties?: Record<string, any> }>,
): EntityNodeType[] {
  // Group nodes by type for clustered layout
  const typeGroups: Record<string, typeof apiNodes> = {};
  for (const n of apiNodes) {
    const t = n.type || 'Other';
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t].push(n);
  }

  const typeOrder = ['Company', 'Supplier', 'Person', 'Contract', 'Sanction', 'Country'];
  const sortedTypes = Object.keys(typeGroups).sort(
    (a, b) => (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) - (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b))
  );

  const rfNodes: EntityNodeType[] = [];
  const colWidth = 280;
  const rowHeight = 90;
  const startX = 40;
  const startY = 40;
  const typeGap = 60;

  let globalCol = 0;
  for (const type of sortedTypes) {
    const group = typeGroups[type];
    const baseX = startX + globalCol * (colWidth + typeGap);

    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      rfNodes.push({
        id: n.id,
        type: 'entity',
        position: {
          x: baseX + (Math.random() * 30 - 15),
          y: startY + i * rowHeight + (Math.random() * 20 - 10),
        },
        data: {
          label: n.label || n.id,
          entityType: n.type || 'Company',
          details: n.properties?.status || n.properties?.industry || n.properties?.country || n.type,
          status: n.properties?.status,
          risk: n.properties?.risk_level,
          isActive: false,
          properties: n.properties || {},
        },
      });
    }
    globalCol++;
  }

  return rfNodes;
}

// Convert API edges to React Flow edges with relationship labels
function layoutEdges(
  apiEdges: Array<{ id: string; source: string; target: string; label: string; properties?: Record<string, any> }>,
  nodeIds: Set<string>
) {
  // Relationship type → color mapping
  const EDGE_COLORS: Record<string, string> = {
    SUPPLIES: '#06b6d4',
    HAS_DIRECTOR: '#f59e0b',
    DIRECTOR_OF: '#f59e0b',
    OWNS: '#a78bfa',
    HAS_CONTRACT: '#8b5cf6',
    SANCTIONED_BY: '#ef4444',
    LOCATED_IN: '#14b8a6',
  };

  return apiEdges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: false,
      label: e.label,
      labelStyle: { fill: '#94a3b8', fontSize: 9, fontFamily: 'monospace', fontWeight: 700 },
      labelBgStyle: { fill: '#040810', fillOpacity: 0.92, stroke: '#0e1c2e', strokeWidth: 1, rx: 3, ry: 3 },
      labelBgPadding: [6, 3] as [number, number],
      style: {
        stroke: EDGE_COLORS[e.label] || '#1e3a5f',
        strokeWidth: 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: EDGE_COLORS[e.label] || '#1e3a5f',
        width: 14,
        height: 14,
      },
    }));
}

// Node Detail Panel Data
interface NodeDetail {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
  connectedEdges: Array<{ label: string; target: string; targetLabel: string }>;
}

function Neo4jGraphInner() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // API state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphMeta, setGraphMeta] = useState<{ totalNodes: number; totalEdges: number; source: string }>({
    totalNodes: 0,
    totalEdges: 0,
    source: '',
  });

  // Graph state
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);

  // Raw API data reference for lookups
  const [apiData, setApiData] = useState<{
    nodes: Array<{ id: string; label: string; type: string; properties?: Record<string, any> }>;
    edges: Array<{ id: string; source: string; target: string; label: string; properties?: Record<string, any> }>;
  }>({ nodes: [], edges: [] });

  const nodeTypes = useMemo(() => ({ entity: EntityNode }), []);

  // Fetch graph from backend
  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);

    try {
      const res = await fetch(API_BASE);
      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }
      const data = await res.json();

      if (!data.nodes || data.nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        setGraphMeta({ totalNodes: 0, totalEdges: 0, source: data.source || '' });
        setApiData({ nodes: [], edges: [] });
        setLoading(false);
        return;
      }

      setApiData({ nodes: data.nodes, edges: data.edges || [] });
      setGraphMeta({
        totalNodes: data.total_nodes || data.nodes.length,
        totalEdges: data.total_edges || (data.edges || []).length,
        source: data.source || 'neo4j',
      });

      const rfNodes = layoutNodes(data.nodes);
      const nodeIds = new Set(rfNodes.map(n => n.id));
      const rfEdges = layoutEdges(data.edges || [], nodeIds);

      setNodes(rfNodes);
      setEdges(rfEdges);

      // Fit view after render
      setTimeout(() => fitView({ duration: 600, padding: 0.15 }), 200);
    } catch (err: any) {
      setError(err.message || 'Unable to load Knowledge Graph');
    } finally {
      setLoading(false);
    }
  }, [fitView, setNodes, setEdges]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Handle node click → show detail panel
  const handleNodeClick = useCallback(
    (_: unknown, node: EntityNodeType) => {

      // Find connected edges
      const connected = apiData.edges
        .filter(e => e.source === node.id || e.target === node.id)
        .map(e => {
          const isSource = e.source === node.id;
          const otherId = isSource ? e.target : e.source;
          const otherNode = apiData.nodes.find(n => n.id === otherId);
          return {
            label: e.label,
            target: otherId,
            targetLabel: otherNode?.label || otherId,
          };
        });

      setSelectedNode({
        id: node.id,
        label: node.data.label,
        type: node.data.entityType,
        properties: node.data.properties || {},
        connectedEdges: connected,
      });

      // Highlight the clicked node
      setNodes(prev =>
        prev.map(n => ({
          ...n,
          data: { ...n.data, isActive: n.id === node.id },
        }))
      );
    },
    [apiData, setNodes]
  );

  // Reset view
  const handleReset = useCallback(() => {
    setSelectedNode(null);
    setNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, isActive: false } })));
    fitView({ duration: 600, padding: 0.15 });
  }, [fitView, setNodes]);

  // ==========================================
  // LOADING STATE
  // ==========================================
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-[#0e1c2e] border-t-cyan-500 animate-spin" />
          <Database className="w-6 h-6 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center font-mono">
          <p className="text-sm text-slate-200 font-bold">Loading Knowledge Graph...</p>
          <p className="text-xs text-slate-500 mt-1">Querying Neo4j AuraDB for entity relationships</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // ERROR STATE
  // ==========================================
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <WifiOff className="w-7 h-7 text-red-400" />
        </div>
        <div className="text-center font-mono">
          <p className="text-sm text-slate-200 font-bold">Unable to load Knowledge Graph</p>
          <p className="text-xs text-red-400/80 mt-1 max-w-sm">{error}</p>
        </div>
        <button
          onClick={fetchGraph}
          className="px-5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // ==========================================
  // EMPTY STATE
  // ==========================================
  if (graphMeta.totalNodes === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#081528] border border-[#0e1c2e] flex items-center justify-center">
          <Database className="w-7 h-7 text-slate-500" />
        </div>
        <div className="text-center font-mono">
          <p className="text-sm text-slate-200 font-bold">Knowledge Graph is empty</p>
          <p className="text-xs text-slate-500 mt-1">Connect a data source and build your graph to begin.</p>
        </div>
        <button className="px-5 py-2 rounded-md border border-cyan-500/40 bg-[#081528] text-cyan-300 font-mono font-bold text-xs uppercase tracking-wider transition-all hover:bg-cyan-500/10 flex items-center gap-2">
          <Server className="w-3.5 h-3.5" />
          <span>Go to Data Sources</span>
        </button>
      </div>
    );
  }

  // ==========================================
  // GRAPH RENDER
  // ==========================================
  return (
    <div className="space-y-4">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
        <div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Enterprise Knowledge Graph Explorer</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Source: {graphMeta.source === 'neo4j' ? 'Neo4j AuraDB' : 'Relational Mapped Dataset'}
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <Database className="w-3.5 h-3.5" />
            {graphMeta.totalNodes.toLocaleString()} ENTITIES
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5 text-cyan-400">
            <GitBranch className="w-3.5 h-3.5" />
            {graphMeta.totalEdges.toLocaleString()} RELATIONSHIPS
          </span>
        </div>
      </div>

      {/* GRAPH CANVAS + PANELS */}
      <div className="relative w-full h-[600px] border border-[#0e1c2e] rounded-lg bg-[#02050a] overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handleReset}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#0f2136" gap={24} size={1} />
        </ReactFlow>

        {/* GRAPH CONTROLS — top right */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            onClick={() => zoomIn({ duration: 300 })}
            className="w-8 h-8 rounded bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoomOut({ duration: 300 })}
            className="w-8 h-8 rounded bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => fitView({ duration: 600, padding: 0.15 })}
            className="w-8 h-8 rounded bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={fetchGraph}
            className="w-8 h-8 rounded bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
            title="Reload graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* LEGEND — bottom left */}
        <div className="absolute bottom-3 left-3 bg-[#040810]/92 border border-[#0e1c2e] px-3 py-2 rounded z-10 backdrop-blur-sm font-mono text-[8px]">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-cyan-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Supplier</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-blue-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Company</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-amber-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Person</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-purple-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Contract</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-red-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Sanction</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-teal-500 rounded-full" />
              <span className="text-slate-400 uppercase tracking-wider">Country</span>
            </div>
          </div>
        </div>

        {/* NODE DETAIL PANEL — right side */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-3 right-14 w-[260px] bg-[#040810]/95 border border-[#0e1c2e] rounded-lg p-4 z-20 backdrop-blur-md font-mono text-xs"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2 mb-3">
                <span className="text-cyan-400 font-bold uppercase text-[10px] tracking-wider truncate pr-2">
                  {selectedNode.label}
                </span>
                <button onClick={handleReset} className="text-slate-500 hover:text-slate-200 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Properties */}
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-200 font-bold">{selectedNode.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ID</span>
                  <span className="text-slate-300">{selectedNode.id}</span>
                </div>

                {selectedNode.properties.status && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="text-slate-200">{selectedNode.properties.status}</span>
                  </div>
                )}
                {selectedNode.properties.country && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Country</span>
                    <span className="text-slate-200">{selectedNode.properties.country}</span>
                  </div>
                )}
                {selectedNode.properties.risk_level && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Risk</span>
                    <span className={
                      selectedNode.properties.risk_level === 'High' || selectedNode.properties.risk_level === 'Critical'
                        ? 'text-red-400 font-bold'
                        : selectedNode.properties.risk_level === 'Medium'
                          ? 'text-amber-400 font-bold'
                          : 'text-emerald-400'
                    }>
                      {selectedNode.properties.risk_level}
                    </span>
                  </div>
                )}
                {selectedNode.properties.industry && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Industry</span>
                    <span className="text-slate-200">{selectedNode.properties.industry}</span>
                  </div>
                )}
                {selectedNode.properties.source && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Source</span>
                    <span className="text-slate-200">{selectedNode.properties.source}</span>
                  </div>
                )}
              </div>

              {/* Connected Relationships */}
              {selectedNode.connectedEdges.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#0e1c2e]">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-2">
                    Relationships ({selectedNode.connectedEdges.length})
                  </span>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {selectedNode.connectedEdges.map((edge, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-1.5 rounded bg-[#02050a] border border-[#0e1c2e] text-[10px]"
                      >
                        <span className="text-cyan-400 font-bold shrink-0">{edge.label}</span>
                        <span className="text-slate-600">→</span>
                        <span className="text-slate-300 truncate">{edge.targetLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Wrapper providing ReactFlowProvider
export default function Neo4jGraphViewer() {
  return (
    <ReactFlowProvider>
      <Neo4jGraphInner />
    </ReactFlowProvider>
  );
}
