import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  WifiOff,
  Search,
  ShieldCheck,
  FlaskConical,
  CheckCircle2,
  Expand,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EntityNode } from './EntityNode';
import type { EntityNodeType } from './EntityNode';

// ==========================================
// CANONICAL KNOWLEDGE GRAPH EXPLORER
// Human-friendly, query-driven graph experience
// with deep auditability and provenance drawers.
// ==========================================

const API_BASE = 'http://localhost:8000/api/graph';

// Layout algorithm for clean, clustered visual hierarchy
function layoutNodes(
  apiNodes: Array<{
    id: string;
    label: string;
    entity_type?: string;
    type?: string;
    display_name?: string;
    important_identifier?: string;
    confidence?: number;
    is_synthetic?: boolean;
    source_system?: string;
    properties?: Record<string, any>;
  }>
): EntityNodeType[] {
  const typeGroups: Record<string, typeof apiNodes> = {};
  for (const n of apiNodes) {
    const t = n.entity_type || n.type || 'Company';
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t].push(n);
  }

  const typeOrder = ['Company', 'Supplier', 'Person', 'Director', 'Contract', 'Sanction', 'Country'];
  const sortedTypes = Object.keys(typeGroups).sort(
    (a, b) => (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) - (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b))
  );

  const rfNodes: EntityNodeType[] = [];
  const colWidth = 270;
  const rowHeight = 100;
  const startX = 60;
  const startY = 60;
  const typeGap = 80;

  let globalCol = 0;
  for (const type of sortedTypes) {
    const group = typeGroups[type];
    const baseX = startX + globalCol * (colWidth + typeGap);

    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      const props = n.properties || {};
      const entityType = n.entity_type || n.type || 'Company';
      const isSynth = Boolean(n.is_synthetic || props.mock_record || props.is_synthetic);

      rfNodes.push({
        id: n.id,
        type: 'entity',
        position: {
          x: baseX + (Math.sin(i * 1.5) * 20),
          y: startY + i * rowHeight,
        },
        data: {
          label: n.display_name || n.label || n.id,
          entityType,
          important_identifier: n.important_identifier || props.cin || props.din || props.contract_number,
          details: props.status || props.country || props.industry || entityType,
          status: props.status || props.company_status,
          risk: props.risk_level,
          confidence: n.confidence !== undefined ? n.confidence : props.entity_confidence,
          is_synthetic: isSynth,
          source_system: (n as any).source_system || (props.cin || props.authorized_capital ? 'firebase' : 'relational'),
          isActive: false,
          properties: props,
        },
      });
    }
    globalCol++;
  }

  return rfNodes;
}

// Convert API edges to styled React Flow edges
function layoutEdges(
  apiEdges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    relationship_type?: string;
    display_label?: string;
    confidence?: number;
    is_synthetic?: boolean;
    properties?: Record<string, any>;
  }>,
  nodeIds: Set<string>
): Edge[] {
  const EDGE_COLORS: Record<string, string> = {
    SUPPLIES: '#06b6d4',
    HAS_DIRECTOR: '#f59e0b',
    DIRECTOR_OF: '#f59e0b',
    OWNS: '#a78bfa',
    HAS_CONTRACT: '#8b5cf6',
    SANCTIONED_BY: '#ef4444',
    LOCATED_IN: '#14b8a6',
    REGISTERED_IN: '#14b8a6',
    REGISTERED_IN_STATE: '#2dd4bf',
    TRANSACTS_WITH: '#10b981',
  };

  return apiEdges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => {
      const relType = e.relationship_type || e.label || 'RELATIONSHIP';
      const displayLabel = e.display_label || e.label || relType.replace('_', ' ');
      const isSynth = Boolean(e.is_synthetic || e.properties?.mock_record);
      const color = isSynth ? '#f59e0b' : (EDGE_COLORS[relType] || '#38bdf8');

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: false,
        label: displayLabel,
        labelStyle: { fill: isSynth ? '#fbbf24' : '#cbd5e1', fontSize: 8.5, fontFamily: 'monospace', fontWeight: 700 },
        labelBgStyle: {
          fill: '#020617',
          fillOpacity: 0.95,
          stroke: isSynth ? '#b45309' : '#1e293b',
          strokeWidth: 1,
          rx: 4,
          ry: 4
        },
        labelBgPadding: [6, 3] as [number, number],
        style: {
          stroke: color,
          strokeWidth: 1.6,
          strokeDasharray: isSynth ? '4,4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: color,
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

function Neo4jGraphInner({ initialSource = 'all' }: { initialSource?: string }) {
  const { fitView, zoomIn, zoomOut, setCenter } = useReactFlow();

  // State: API and Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphMeta, setGraphMeta] = useState<{ totalNodes: number; totalEdges: number; source: string }>({
    totalNodes: 0,
    totalEdges: 0,
    source: 'neo4j',
  });

  // State: Graph Nodes & Edges
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // State: Selection & Detail Drawers
  const [, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityDetail, setSelectedEntityDetail] = useState<any | null>(null);
  const [selectedEdgeDetail, setSelectedEdgeDetail] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<'identity' | 'resolution' | 'sources' | 'temporal' | 'confidence'>('identity');

  // State: Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>(initialSource);

  useEffect(() => {
    if (initialSource) {
      setSelectedSourceFilter(initialSource);
    }
  }, [initialSource]);

  const [minConfidenceFilter, setMinConfidenceFilter] = useState<number>(0.0);
  const [includeSynthetic, setIncludeSynthetic] = useState<boolean>(true);
  const [stats, setStats] = useState<any | null>(null);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [reconciliation, setReconciliation] = useState<any | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const nodeTypes = useMemo(() => ({ entity: EntityNode }), []);

  // Fetch projected graph from backend
  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', '80');
      if (selectedTypeFilter !== 'All') params.set('entity_type', selectedTypeFilter);
      if (selectedSourceFilter !== 'all') params.set('source', selectedSourceFilter);
      if (minConfidenceFilter > 0) params.set('min_confidence', minConfidenceFilter.toString());
      params.set('include_synthetic', includeSynthetic.toString());

      const res = await fetch(`${API_BASE}?${params.toString()}`);
      if (!res.ok) throw new Error(`API returned status ${res.status}`);
      const data = await res.json();

      const apiNodes = data.nodes || [];
      const apiEdges = data.edges || [];

      setGraphMeta({
        totalNodes: data.total_nodes || apiNodes.length,
        totalEdges: data.total_edges || apiEdges.length,
        source: data.source || 'neo4j',
      });

      const rfNodes = layoutNodes(apiNodes);
      const nodeIds = new Set(rfNodes.map(n => n.id));
      const rfEdges = layoutEdges(apiEdges, nodeIds);

      setNodes(rfNodes);
      setEdges(rfEdges);

      setTimeout(() => fitView({ duration: 600, padding: 0.2 }), 200);
    } catch (err: any) {
      setError(err.message || 'Unable to load Knowledge Graph');
    } finally {
      setLoading(false);
    }
  }, [fitView, selectedTypeFilter, selectedSourceFilter, minConfidenceFilter, includeSynthetic, setNodes, setEdges]);

  // Load stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.warn('Failed to fetch stats', err);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
    fetchStats();
  }, [fetchGraph, fetchStats]);

  // Handle Search Input
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (e) {
        console.warn('Search query error', e);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus entity from search or click
  const focusEntity = useCallback(
    async (canonicalId: string) => {
      setSelectedEntityId(canonicalId);
      setSelectedEdgeDetail(null);
      setSearchResults([]);
      setSearchQuery('');

      // Fetch deep entity details
      try {
        const res = await fetch(`${API_BASE}/entity/${encodeURIComponent(canonicalId)}`);
        if (res.ok) {
          const detail = await res.json();
          setSelectedEntityDetail(detail);
        }
      } catch (err) {
        console.warn('Failed to fetch entity details', err);
      }

      // Check if node is already on canvas
      const targetNode = nodes.find(n => n.id === canonicalId);
      if (targetNode) {
        setNodes(prev =>
          prev.map(n => ({
            ...n,
            data: { ...n.data, isActive: n.id === canonicalId },
          }))
        );
        setCenter(targetNode.position.x + 100, targetNode.position.y + 45, { zoom: 1.2, duration: 600 });
      } else {
        // Node not visible, expand neighborhood to bring it onto canvas
        expandNeighborhood(canonicalId);
      }
    },
    [nodes, setNodes, setCenter]
  );

  // Expand neighborhood for selected entity
  const expandNeighborhood = useCallback(
    async (canonicalId: string) => {
      try {
        const res = await fetch(`${API_BASE}/neighborhood/${encodeURIComponent(canonicalId)}?hops=1&limit=25`);
        if (res.ok) {
          const data = await res.json();
          const newApiNodes = data.nodes || [];
          const newApiEdges = data.edges || [];

          setNodes(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const freshNodes = layoutNodes(newApiNodes.filter((n: any) => !existingIds.has(n.id)));
            return [...prev, ...freshNodes].map(n => ({
              ...n,
              data: { ...n.data, isActive: n.id === canonicalId },
            }));
          });

          setEdges(prev => {
            const existingEdgeIds = new Set(prev.map(e => e.id));
            const freshEdges = newApiEdges.filter((e: any) => !existingEdgeIds.has(e.id));
            const allNodeIds = new Set([...nodes.map(n => n.id), ...newApiNodes.map((n: any) => n.id)]);
            return [...prev, ...layoutEdges(freshEdges, allNodeIds)];
          });

          setTimeout(() => fitView({ duration: 600, padding: 0.2 }), 200);
        }
      } catch (err) {
        console.warn('Neighborhood expansion failed', err);
      }
    },
    [nodes, setNodes, setEdges, fitView]
  );

  // Handle Node Click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: EntityNodeType) => {
      focusEntity(node.id);
    },
    [focusEntity]
  );

  // Handle Edge Click
  const handleEdgeClick = useCallback(
    async (_: React.MouseEvent, edge: Edge) => {
      setSelectedEntityDetail(null);
      setSelectedEntityId(null);

      try {
        const res = await fetch(`${API_BASE}/relationship/${encodeURIComponent(edge.id)}`);
        if (res.ok) {
          const detail = await res.json();
          setSelectedEdgeDetail(detail);
        } else {
          setSelectedEdgeDetail({
            relationship_id: edge.id,
            relationship_type: (edge.data as any)?.relationship_type || edge.label,
            display_label: edge.label,
            source_entity: { id: edge.source },
            target_entity: { id: edge.target },
            confidence: { relationship_confidence: (edge.data as any)?.confidence || 1.0 },
            evidence_count: 1,
            sources: [{ source_system: 'knowledge_graph' }],
            temporal: { status: 'Current' },
            is_synthetic: (edge.data as any)?.is_synthetic || false,
            properties: (edge.data as any)?.properties || {},
          });
        }
      } catch (err) {
        console.warn('Failed to load edge detail', err);
      }
    },
    []
  );

  // Close Drawers
  const handleCloseDetail = useCallback(() => {
    setSelectedEntityDetail(null);
    setSelectedEdgeDetail(null);
    setSelectedEntityId(null);
    setNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, isActive: false } })));
  }, [setNodes]);

  // Run On-Demand Materialization
  const handleMaterialize = useCallback(async () => {
    setIsMaterializing(true);
    try {
      const res = await fetch(`${API_BASE}/materialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebase_limit: 100, include_synthetic: true }),
      });
      if (res.ok) {
        await fetchGraph();
        await fetchStats();
      }
    } catch (e) {
      console.warn('Materialize failed', e);
    } finally {
      setIsMaterializing(false);
    }
  }, [fetchGraph, fetchStats]);

  // Run Reconciliation Audit
  const handleReconcile = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/reconciliation`);
      if (res.ok) {
        const data = await res.json();
        setReconciliation(data);
        setShowStatsModal(true);
      }
    } catch (e) {
      console.warn('Reconciliation failed', e);
    }
  }, []);

  return (
    <div className="space-y-3 font-sans">
      {/* 1. TOP NAV & CONTROLS HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#030712] border border-[#0e1c2e] p-3 rounded-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Canonical Knowledge Graph Explorer
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold uppercase tracking-wider">
              {graphMeta.source === 'neo4j' ? 'Neo4j AuraDB' : 'Synchronized Cache'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Research-grade canonical model with human-friendly visual projection
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded bg-[#070e1c] border border-[#0e1c2e]">
            <span className="text-cyan-400 font-bold">{stats?.total_entities || graphMeta.totalNodes}</span>
            <span className="text-slate-500">Entities</span>
            <span className="text-slate-700">|</span>
            <span className="text-cyan-400 font-bold">{stats?.total_relationships || graphMeta.totalEdges}</span>
            <span className="text-slate-500">Rels</span>
            {stats?.synthetic_relationship_count ? (
              <>
                <span className="text-slate-700">|</span>
                <span className="text-amber-400 font-bold">{stats.synthetic_relationship_count}</span>
                <span className="text-amber-500/80">Synthetic</span>
              </>
            ) : null}
          </div>

          <button
            onClick={handleReconcile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#081528] hover:bg-[#0c1e38] border border-[#0e1c2e] text-slate-300 text-xs font-mono font-medium transition-colors"
            title="Audit graph integrity"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Audit
          </button>

          <button
            onClick={handleMaterialize}
            disabled={isMaterializing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
            title="Materialize real Firebase companies"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isMaterializing ? 'animate-spin text-cyan-400' : ''}`} />
            {isMaterializing ? 'Materializing...' : 'Materialize'}
          </button>
        </div>
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#030712] border border-[#0e1c2e] px-3 py-2 rounded-lg text-xs">
        {/* Search Bar with Autocomplete Dropdown */}
        <div className="relative flex-1 max-w-md">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Company, Person, CIN, DIN, Contract..."
              className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono outline-none transition-colors"
            />
            {isSearching && (
              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin absolute right-8 pointer-events-none" />
            )}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-[#040810] border border-[#0e1c2e] rounded-md shadow-2xl z-30 max-h-64 overflow-y-auto font-mono text-xs divide-y divide-[#0e1c2e]"
              >
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => focusEntity(item.id)}
                    className="w-full text-left p-2.5 hover:bg-[#071324] flex items-center justify-between transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                          {item.display_name || item.label}
                        </span>
                        {item.is_synthetic && (
                          <span className="text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded">
                            TEST
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {item.important_identifier ? `${item.important_identifier} · ` : ''}
                        {item.status || item.entity_type}
                      </div>
                    </div>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#0e1c2e] text-slate-400 shrink-0">
                      {item.entity_type}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {[
              { key: 'all', label: '⊕ All Sources' },
              { key: 'firebase', label: '🔥 Firebase' },
              { key: 'relational', label: '🐘 PostgreSQL' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedSourceFilter(key)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                  selectedSourceFilter === key
                    ? key === 'firebase'
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200 font-bold'
                      : key === 'relational'
                      ? 'bg-purple-500/20 border border-purple-500/50 text-purple-200 font-bold'
                      : 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-[#050c18] border border-[#0e1c2e] text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* Entity Type Chips */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {['All', 'Company', 'Person', 'Supplier', 'Contract', 'Sanction'].map(t => (
              <button
                key={t}
                onClick={() => setSelectedTypeFilter(t)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                  selectedTypeFilter === t
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-[#050c18] border border-[#0e1c2e] text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* Confidence Filter */}
          <select
            value={minConfidenceFilter}
            onChange={e => setMinConfidenceFilter(parseFloat(e.target.value))}
            className="bg-[#050c18] border border-[#0e1c2e] text-slate-300 text-[11px] font-mono rounded px-2 py-1 outline-none"
            title="Filter by minimum confidence"
          >
            <option value="0">All Conf</option>
            <option value="0.7">≥ 70% Conf</option>
            <option value="0.85">≥ 85% Conf</option>
            <option value="0.95">≥ 95% Conf</option>
          </select>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* Synthetic Toggle */}
          <button
            onClick={() => setIncludeSynthetic(!includeSynthetic)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono transition-all border ${
              includeSynthetic
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold'
                : 'bg-[#050c18] border-[#0e1c2e] text-slate-500'
            }`}
            title="Toggle synthetic / test relationships"
          >
            <FlaskConical className="w-3 h-3" />
            <span>Test Data</span>
          </button>
        </div>
      </div>

      {/* 3. GRAPH CANVAS VIEWPORT */}
      <div className="relative w-full h-[620px] border border-[#0e1c2e] rounded-lg bg-[#020408] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-2 border-[#0e1c2e] border-t-cyan-500 animate-spin" />
              <Database className="w-5 h-5 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center font-mono">
              <p className="text-sm text-slate-200 font-bold">Projecting Knowledge Graph...</p>
              <p className="text-xs text-slate-500 mt-1">Retrieving canonical entities & relationships</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <WifiOff className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm font-mono text-red-400">{error}</p>
            <button
              onClick={fetchGraph}
              className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handleCloseDetail}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#0a192f" gap={24} size={1} />
          </ReactFlow>
        )}

        {/* TOP-RIGHT CONTROLS */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            onClick={() => zoomIn({ duration: 300 })}
            className="w-8 h-8 rounded bg-[#040810]/95 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoomOut({ duration: 300 })}
            className="w-8 h-8 rounded bg-[#040810]/95 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => fitView({ duration: 600, padding: 0.2 })}
            className="w-8 h-8 rounded bg-[#040810]/95 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={fetchGraph}
            className="w-8 h-8 rounded bg-[#040810]/95 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Refresh Graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* BOTTOM-LEFT COMPACT LEGEND */}
        <div className="absolute bottom-3 left-3 bg-[#040810]/92 border border-[#0e1c2e] px-3 py-2 rounded-md z-10 backdrop-blur-md font-mono text-[9px]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-blue-500 rounded-full" />
              <span className="text-slate-300">Company</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-cyan-400 rounded-full" />
              <span className="text-slate-300">Supplier</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-amber-400 rounded-full" />
              <span className="text-slate-300">Person</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-purple-400 rounded-full" />
              <span className="text-slate-300">Contract</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-red-400 rounded-full" />
              <span className="text-slate-300">Sanction</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-teal-400 rounded-full" />
              <span className="text-slate-300">Country</span>
            </span>
          </div>
        </div>

        {/* 4. ENTITY DETAILS DRAWER */}
        <AnimatePresence>
          {selectedEntityDetail && (
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 right-0 bottom-0 w-[340px] bg-[#020611]/98 border-l border-[#0e1c2e] p-4 z-20 backdrop-blur-xl font-mono text-xs flex flex-col shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#0e1c2e]">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      {selectedEntityDetail.entity_type}
                    </span>
                    {selectedEntityDetail.is_synthetic && (
                      <span className="flex items-center gap-1 text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <FlaskConical className="w-2.5 h-2.5" />
                        TEST EVIDENCE
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 truncate font-sans leading-tight">
                    {selectedEntityDetail.display_name}
                  </h3>
                </div>
                <button
                  onClick={handleCloseDetail}
                  className="p-1 text-slate-500 hover:text-slate-200 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center border-b border-[#0e1c2e] pt-2 pb-1 gap-1 text-[10px] overflow-x-auto">
                {(['identity', 'resolution', 'sources', 'temporal', 'confidence'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`px-2 py-1 rounded uppercase tracking-wider transition-colors ${
                      detailTab === tab
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content Container */}
              <div className="flex-1 overflow-y-auto py-3 space-y-3 text-[11px] pr-1">
                {detailTab === 'identity' && (
                  <div className="space-y-2">
                    <div className="p-2 rounded bg-[#040a16] border border-[#0e1c2e]">
                      <span className="text-slate-500 text-[9px] uppercase block mb-0.5">Canonical ID</span>
                      <span className="text-slate-200 select-all break-all">{selectedEntityDetail.canonical_id}</span>
                    </div>

                    {Object.entries(selectedEntityDetail.identifiers || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1 border-b border-[#0e1c2e]/60">
                        <span className="text-slate-400 uppercase text-[10px]">{k}</span>
                        <span className="text-cyan-300 font-semibold">{String(v)}</span>
                      </div>
                    ))}

                    {selectedEntityDetail.status && (
                      <div className="flex justify-between py-1 border-b border-[#0e1c2e]/60">
                        <span className="text-slate-400 uppercase text-[10px]">Status</span>
                        <span className="text-emerald-400">{selectedEntityDetail.status}</span>
                      </div>
                    )}

                    {selectedEntityDetail.properties?.industry && (
                      <div className="flex justify-between py-1 border-b border-[#0e1c2e]/60">
                        <span className="text-slate-400 uppercase text-[10px]">Industry</span>
                        <span className="text-slate-200">{selectedEntityDetail.properties.industry}</span>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'resolution' && (
                  <div className="space-y-2">
                    <div className="p-2 rounded bg-[#040a16] border border-[#0e1c2e]">
                      <span className="text-slate-500 text-[9px] uppercase block mb-0.5">Resolution Decision</span>
                      <span className="text-emerald-400 font-bold">{selectedEntityDetail.resolution?.status || 'RESOLVED'}</span>
                      <div className="mt-1 flex justify-between text-[10px]">
                        <span className="text-slate-400">Match Origin:</span>
                        <span className="text-cyan-300">{selectedEntityDetail.resolution?.match_origin || 'PRIMARY_KEY'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'sources' && (
                  <div className="space-y-2">
                    {(selectedEntityDetail.sources || []).map((src: any, idx: number) => (
                      <div key={idx} className="p-2 rounded bg-[#040a16] border border-[#0e1c2e] space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400 uppercase">System:</span>
                          <span className="text-cyan-300 font-bold">{src.source_system}</span>
                        </div>
                        {src.source_path && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">Path:</span>
                            <span className="text-slate-200 truncate max-w-[160px]">{src.source_path}</span>
                          </div>
                        )}
                        {src.source_record_id && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">Record ID:</span>
                            <span className="text-slate-200">{src.source_record_id}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">Reliability:</span>
                          <span className="text-emerald-400 font-semibold">{src.reliability ? `${Math.round(src.reliability * 100)}%` : '100%'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'temporal' && (
                  <div className="space-y-2">
                    <div className="p-2 rounded bg-[#040a16] border border-[#0e1c2e] space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 uppercase">Validity Status:</span>
                        <span className="text-cyan-400 font-bold">{selectedEntityDetail.temporal?.status || 'Current'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Valid From:</span>
                        <span className="text-slate-200">{selectedEntityDetail.temporal?.valid_from || 'None recorded'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Valid To:</span>
                        <span className="text-slate-200">{selectedEntityDetail.temporal?.valid_to || 'Open-ended'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'confidence' && (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded bg-[#040a16] border border-[#0e1c2e] space-y-2">
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">Entity Identity Confidence:</span>
                          <span className="text-cyan-300 font-bold">
                            {Math.round((selectedEntityDetail.confidence?.entity_confidence || 1.0) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-cyan-400 h-full"
                            style={{ width: `${(selectedEntityDetail.confidence?.entity_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">Mapping Confidence:</span>
                          <span className="text-blue-300 font-bold">
                            {Math.round((selectedEntityDetail.confidence?.mapping_confidence || 1.0) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-400 h-full"
                            style={{ width: `${(selectedEntityDetail.confidence?.mapping_confidence || 1.0) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Connected Relationships Section */}
                {selectedEntityDetail.connected_edges?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[#0e1c2e]">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-2 font-bold">
                      Connected Relationships ({selectedEntityDetail.connected_edges.length})
                    </span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedEntityDetail.connected_edges.map((edge: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => focusEntity(edge.direction === 'OUTGOING' ? edge.target_id : edge.source_id)}
                          className="w-full text-left p-1.5 rounded bg-[#040a16] hover:bg-[#071326] border border-[#0e1c2e] text-[10px] flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span className="text-cyan-400 font-bold shrink-0">{edge.display_label}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-slate-300 truncate">{edge.direction === 'OUTGOING' ? edge.target_name : edge.source_name}</span>
                          </div>
                          {edge.is_synthetic && (
                            <span className="text-[7px] text-amber-400 border border-amber-500/40 px-1 rounded shrink-0">
                              TEST
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Expand Neighborhood Action */}
              <div className="pt-3 border-t border-[#0e1c2e] mt-auto">
                <button
                  onClick={() => expandNeighborhood(selectedEntityDetail.canonical_id)}
                  className="w-full py-2 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Expand className="w-3.5 h-3.5" />
                  Expand Neighborhood
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. RELATIONSHIP DETAILS DRAWER */}
        <AnimatePresence>
          {selectedEdgeDetail && (
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 right-0 bottom-0 w-[340px] bg-[#020611]/98 border-l border-[#0e1c2e] p-4 z-20 backdrop-blur-xl font-mono text-xs flex flex-col shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#0e1c2e]">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      RELATIONSHIP
                    </span>
                    {selectedEdgeDetail.is_synthetic && (
                      <span className="flex items-center gap-1 text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <FlaskConical className="w-2.5 h-2.5" />
                        SYNTHETIC EVIDENCE
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans">
                    {selectedEdgeDetail.display_label}
                  </h3>
                </div>
                <button
                  onClick={handleCloseDetail}
                  className="p-1 text-slate-500 hover:text-slate-200 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Edge Details Body */}
              <div className="flex-1 overflow-y-auto py-3 space-y-3 text-[11px]">
                {/* Connected Endpoints */}
                <div className="p-2.5 rounded bg-[#040a16] border border-[#0e1c2e] space-y-2">
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block mb-0.5">Origin Entity</span>
                    <button
                      onClick={() => focusEntity(selectedEdgeDetail.source_entity?.id)}
                      className="text-cyan-300 hover:underline font-bold text-left block truncate w-full"
                    >
                      {selectedEdgeDetail.source_entity?.name || selectedEdgeDetail.source_entity?.id}
                    </button>
                  </div>
                  <div className="text-slate-600 text-center">↓</div>
                  <div>
                    <span className="text-slate-500 text-[9px] uppercase block mb-0.5">Destination Entity</span>
                    <button
                      onClick={() => focusEntity(selectedEdgeDetail.target_entity?.id)}
                      className="text-cyan-300 hover:underline font-bold text-left block truncate w-full"
                    >
                      {selectedEdgeDetail.target_entity?.name || selectedEdgeDetail.target_entity?.id}
                    </button>
                  </div>
                </div>

                {/* Relationship Confidence */}
                <div className="p-2.5 rounded bg-[#040a16] border border-[#0e1c2e] space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Confidence Score:</span>
                    <span className="text-emerald-400 font-bold">
                      {Math.round((selectedEdgeDetail.confidence?.relationship_confidence || 1.0) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Validity:</span>
                    <span className="text-slate-200">{selectedEdgeDetail.temporal?.status || 'Current'}</span>
                  </div>
                </div>

                {/* Evidence & Provenance */}
                <div className="p-2.5 rounded bg-[#040a16] border border-[#0e1c2e] space-y-1">
                  <span className="text-slate-500 text-[9px] uppercase block mb-1 font-bold">Provenance Evidence</span>
                  {(selectedEdgeDetail.sources || []).map((src: any, i: number) => (
                    <div key={i} className="text-[10px] space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Source:</span>
                        <span className="text-slate-200">{src.source_system}</span>
                      </div>
                      {src.source_path && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Location:</span>
                          <span className="text-slate-300 truncate max-w-[170px]">{src.source_path}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 6. RECONCILIATION & AUDIT MODAL */}
        <AnimatePresence>
          {showStatsModal && reconciliation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-40"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-[#030814] border border-[#0e1c2e] rounded-xl p-5 max-w-lg w-full font-mono text-xs shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-100 font-sans">
                      Knowledge Graph Reconciliation Audit
                    </h3>
                  </div>
                  <button onClick={() => setShowStatsModal(false)} className="text-slate-500 hover:text-slate-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="p-2.5 rounded bg-[#040b1a] border border-[#0e1c2e]">
                    <span className="text-slate-400 text-[10px] block">Canonical Entities</span>
                    <span className="text-base font-bold text-cyan-300">{reconciliation.canonical_entity_count}</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#040b1a] border border-[#0e1c2e]">
                    <span className="text-slate-400 text-[10px] block">Canonical Relationships</span>
                    <span className="text-base font-bold text-cyan-300">{reconciliation.canonical_relationship_count}</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#040b1a] border border-[#0e1c2e]">
                    <span className="text-slate-400 text-[10px] block">Orphaned Relationships</span>
                    <span className="text-base font-bold text-emerald-400">{reconciliation.orphaned_relationships}</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#040b1a] border border-[#0e1c2e]">
                    <span className="text-slate-400 text-[10px] block">Duplicate Canonical IDs</span>
                    <span className="text-base font-bold text-emerald-400">{reconciliation.duplicate_canonical_ids}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#02050c] border border-[#0e1c2e] space-y-1">
                  <span className="text-slate-500 text-[9px] uppercase font-bold block mb-1">Integrity Details</span>
                  {(reconciliation.details || []).slice(0, 4).map((d: string, i: number) => (
                    <p key={i} className="text-[10px] text-slate-300">
                      • {d}
                    </p>
                  ))}
                </div>

                <button
                  onClick={() => setShowStatsModal(false)}
                  className="w-full py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs transition-colors"
                >
                  Close Audit Report
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export interface Neo4jGraphViewerProps {
  initialSource?: string;
}

export default function Neo4jGraphViewer({ initialSource = 'all' }: Neo4jGraphViewerProps = {}) {
  return (
    <ReactFlowProvider>
      <Neo4jGraphInner initialSource={initialSource} />
    </ReactFlowProvider>
  );
}
