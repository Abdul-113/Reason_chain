import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  RefreshCw,
  Maximize2,
  X,
  Minus,
  Plus,
  Search,
  Focus,
  AlertTriangle,
  ArrowRight,
  Loader2,
  GitFork,
  Compass,
  RotateCcw,
  MapPin,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EntityNode } from './EntityNode';
import type { EntityNodeType } from './EntityNode';
import {
  layoutRadial,
  layoutHierarchical,
  layoutPathTrace,
  layoutOverview,
} from './layoutEngine';
import type { RawApiNode, RawApiEdge } from './layoutEngine';

// ==========================================
// CANONICAL KNOWLEDGE GRAPH EXPLORER
// Complete Enterprise Intelligence Workspace
// ==========================================

const API_BASE = 'http://localhost:8000/api/graph';

// Curated Launchpad Enterprise Targets
const CURATED_TARGETS = [
  {
    id: 'company:U74999MH2019PTC334643',
    name: '1ST RATE PHARMA PRIVATE LIMITED',
    type: 'Company',
    tag: 'Corporate Network',
    desc: 'Active pharmaceutical entity with verified directors, suppliers & contracts.',
    risk: 'MEDIUM',
    color: 'border-blue-500/40 hover:border-blue-400 bg-blue-500/5',
    badgeColor: 'text-blue-400 bg-blue-500/10',
  },
  {
    id: 'company:U74120MH2016PTC272216',
    name: '3M MEDIA WORKS PRIVATE LIMITED',
    type: 'Company',
    tag: 'Regulatory Watchlist Chain',
    desc: 'Multi-hop connection linking corporate directors to external sanctioned entity.',
    risk: 'CRITICAL',
    color: 'border-red-500/40 hover:border-red-400 bg-red-500/5',
    badgeColor: 'text-red-400 bg-red-500/10',
  },
  {
    id: 'company:U51909MH2012PTC230026',
    name: '3A INNOVATIVE TECHNOLOGIES',
    type: 'Company',
    tag: 'Supply Chain Chain',
    desc: 'Industrial technology firm with connected suppliers and logistics claims.',
    risk: 'LOW',
    color: 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/5',
    badgeColor: 'text-cyan-400 bg-cyan-500/10',
  },
  {
    id: 'company:U55204MH2020PTC352558',
    name: '2QUARTERS HOSPITALITY PRIVATE LIMITED',
    type: 'Company',
    tag: 'Vendor Network',
    desc: 'Commercial hospitality enterprise with directorship and procurement contracts.',
    risk: 'LOW',
    color: 'border-amber-500/40 hover:border-amber-400 bg-amber-500/5',
    badgeColor: 'text-amber-400 bg-amber-500/10',
  },
];

export interface Neo4jGraphViewerProps {
  initialSource?: string;
}

function Neo4jGraphInner({ initialSource = 'all' }: Neo4jGraphViewerProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Graph Data Cache
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawNodes, setRawNodes] = useState<RawApiNode[]>([]);
  const [rawEdges, setRawEdges] = useState<RawApiEdge[]>([]);

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Focus & Investigation State
  const [focusEntityId, setFocusEntityId] = useState<string | null>(
    'company:U74999MH2019PTC334643'
  );
  const [hopDepth, setHopDepth] = useState<number>(2);
  const [layoutMode, setLayoutMode] = useState<'radial' | 'hierarchical' | 'overview' | 'path'>('radial');

  // Trace Path Modal State
  const [traceSourceId, setTraceSourceId] = useState<string | null>(null);
  const [traceTargetId, setTraceTargetId] = useState<string | null>(null);
  const [showTraceModal, setShowTraceModal] = useState<boolean>(false);
  const [activeTraceResult, setActiveTraceResult] = useState<{ pathFound: boolean; pathEntities: string[] } | null>(null);

  // Filters State
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('All');
  const [activeRiskFilter, setActiveRiskFilter] = useState<string>('All');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'synthetic'>('all');
  const [activeSourceFilter] = useState<string>(initialSource);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inspector Drawers State
  const [selectedEntityDetail, setSelectedEntityDetail] = useState<any | null>(null);
  const [selectedEdgeDetail, setSelectedEdgeDetail] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // UI Toggles
  const [showMinimap, setShowMinimap] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const nodeTypes = useMemo(() => ({ entity: EntityNode }), []);

  // Fetch full graph from backend
  const loadGraphData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const graphUrl = activeSourceFilter && activeSourceFilter !== 'all'
        ? `${API_BASE}?limit=120&source=${encodeURIComponent(activeSourceFilter)}`
        : `${API_BASE}?limit=120`;

      const graphRes = await fetch(graphUrl);

      if (!graphRes.ok) throw new Error(`API returned status ${graphRes.status}`);
      const graphData = await graphRes.json();

      const apiNodes: RawApiNode[] = graphData.nodes || [];
      const apiEdges: RawApiEdge[] = graphData.edges || [];

      setRawNodes(apiNodes);
      setRawEdges(apiEdges);
    } catch (err: any) {
      setError(err.message || 'Unable to load Knowledge Graph');
    } finally {
      setLoading(false);
    }
  }, [activeSourceFilter]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Compute Layout whenever focus, mode, hop depth, or filters change
  useEffect(() => {
    if (rawNodes.length === 0) return;

    // Apply client-side filters
    let filteredNodes = rawNodes;
    if (activeTypeFilter !== 'All') {
      filteredNodes = filteredNodes.filter(n => {
        const t = n.entity_type || n.type || 'Company';
        if (activeTypeFilter === 'Companies') return t === 'Company';
        if (activeTypeFilter === 'Directors') return t === 'Person' || t === 'Director';
        if (activeTypeFilter === 'Suppliers') return t === 'Supplier';
        if (activeTypeFilter === 'Contracts') return t === 'Contract';
        if (activeTypeFilter === 'Sanctions') return t === 'Sanction';
        return t === activeTypeFilter;
      });
    }

    if (activeRiskFilter !== 'All') {
      filteredNodes = filteredNodes.filter(n => {
        const r = (n.risk || n.properties?.risk_level || 'LOW').toUpperCase();
        return r === activeRiskFilter.toUpperCase();
      });
    }

    let filteredEdges = rawEdges;
    if (verificationFilter === 'verified') {
      filteredEdges = filteredEdges.filter(e => !e.is_synthetic && !e.properties?.is_synthetic && !e.properties?.mock_record);
    } else if (verificationFilter === 'synthetic') {
      filteredEdges = filteredEdges.filter(e => e.is_synthetic || e.properties?.is_synthetic || e.properties?.mock_record);
    }

    // Mode-specific layout calculation
    if (layoutMode === 'path' && traceSourceId && traceTargetId) {
      const trace = layoutPathTrace(traceSourceId, traceTargetId, rawNodes, rawEdges);
      setNodes(trace.nodes);
      setEdges(trace.edges);
      setActiveTraceResult({ pathFound: trace.pathFound, pathEntities: trace.pathEntities });
      setTimeout(() => fitView({ duration: 550, padding: 0.28 }), 100);
    } else if (layoutMode === 'radial' && focusEntityId) {
      const radial = layoutRadial(focusEntityId, filteredNodes, filteredEdges, hopDepth);
      setNodes(radial.nodes);
      setEdges(radial.edges);
      setActiveTraceResult(null);
      setTimeout(() => fitView({ duration: 550, padding: 0.28 }), 100);
    } else if (layoutMode === 'hierarchical' && focusEntityId) {
      const hier = layoutHierarchical(focusEntityId, filteredNodes, filteredEdges, hopDepth);
      setNodes(hier.nodes);
      setEdges(hier.edges);
      setActiveTraceResult(null);
      setTimeout(() => fitView({ duration: 550, padding: 0.25 }), 100);
    } else if (layoutMode === 'overview') {
      const overview = layoutOverview(filteredNodes, filteredEdges, activeTypeFilter);
      setNodes(overview.nodes);
      setEdges(overview.edges);
      setActiveTraceResult(null);
      setTimeout(() => fitView({ duration: 550, padding: 0.15 }), 100);
    }
  }, [
    rawNodes,
    rawEdges,
    layoutMode,
    focusEntityId,
    hopDepth,
    traceSourceId,
    traceTargetId,
    activeTypeFilter,
    activeRiskFilter,
    verificationFilter,
    fitView,
    setNodes,
    setEdges,
  ]);

  // Search Autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (e) {
        console.warn('Search query error', e);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Inspect entity details
  const inspectEntity = useCallback(async (canonicalId: string) => {
    setDrawerLoading(true);
    setSelectedEdgeDetail(null);
    try {
      const res = await fetch(`${API_BASE}/entity/${encodeURIComponent(canonicalId)}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedEntityDetail(detail);
      }
    } catch (err) {
      console.warn('Failed to load entity details', err);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  // Inspect edge details
  const inspectEdge = useCallback(async (edge: Edge) => {
    setSelectedEntityDetail(null);
    try {
      const res = await fetch(`${API_BASE}/relationship/${encodeURIComponent(edge.id)}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedEdgeDetail(detail);
      } else {
        setSelectedEdgeDetail({
          relationship_id: edge.id,
          display_label: edge.label,
          relationship_type: (edge.data as any)?.relationship_type,
          source_entity: { id: edge.source },
          target_entity: { id: edge.target },
          is_synthetic: (edge.data as any)?.is_synthetic,
          confidence: { relationship_confidence: 0.95 },
          sources: [{ source_system: 'PostgreSQL Neon' }],
        });
      }
    } catch (e) {
      console.warn('Edge details failed', e);
    }
  }, []);

  // Focus and investigate target
  const handleSetFocus = useCallback((canonicalId: string) => {
    setFocusEntityId(canonicalId);
    if (layoutMode === 'overview' || layoutMode === 'path') {
      setLayoutMode('radial');
    }
    setSearchQuery('');
    setSearchResults([]);
    inspectEntity(canonicalId);
  }, [inspectEntity, layoutMode]);

  // Expand 1-Hop connections from backend
  const handleExpandConnections = useCallback(async (canonicalId: string) => {
    setIsExpanding(true);
    try {
      const res = await fetch(`${API_BASE}/neighborhood/${encodeURIComponent(canonicalId)}?hops=1&limit=30`);
      if (res.ok) {
        const data = await res.json();
        const newNodes: RawApiNode[] = data.nodes || [];
        const newEdges: RawApiEdge[] = data.edges || [];

        setRawNodes(prev => {
          const ids = new Set(prev.map(n => n.id));
          const additions = newNodes.filter(n => !ids.has(n.id));
          return [...prev, ...additions];
        });

        setRawEdges(prev => {
          const edgeIds = new Set(prev.map(e => e.id));
          const additions = newEdges.filter(e => !edgeIds.has(e.id));
          return [...prev, ...additions];
        });
      }
    } catch (err) {
      console.warn('Expand failed', err);
    } finally {
      setIsExpanding(false);
    }
  }, []);

  // Start Path Trace Flow
  const handleInitiateTrace = useCallback((sourceId: string, targetId: string) => {
    setTraceSourceId(sourceId);
    setTraceTargetId(targetId);
    setLayoutMode('path');
    setShowTraceModal(false);
  }, []);

  // Handle Node Click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: EntityNodeType) => {
      inspectEntity(node.id);
      setNodes(prev =>
        prev.map(n => ({
          ...n,
          data: { ...n.data, isActive: n.id === node.id },
        }))
      );
    },
    [inspectEntity, setNodes]
  );

  // Handle Edge Click
  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      inspectEdge(edge);
    },
    [inspectEdge]
  );

  const focusEntityName = useMemo(() => {
    if (!focusEntityId) return null;
    const n = rawNodes.find(item => item.id === focusEntityId);
    return n?.display_name || n?.label || focusEntityId;
  }, [focusEntityId, rawNodes]);

  return (
    <div className="flex flex-col h-full w-full font-sans space-y-2.5">
      {/* 1. TOP INVESTIGATION TOOLBAR */}
      <div className="bg-[#030712] border border-[#0e1c2e] px-4 py-2.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-md shrink-0">
        {/* Left: Layout Strategy & Hop Depth */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Strategy Selector */}
          <div className="flex items-center gap-1 bg-[#02050a] border border-[#0e1c2e] p-1 rounded-lg">
            <button
              onClick={() => {
                setLayoutMode('radial');
                if (!focusEntityId && rawNodes[0]) setFocusEntityId(rawNodes[0].id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                layoutMode === 'radial'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Radial Investigation View (Focus entity centered, 1-3 hop concentric rings)"
            >
              <Focus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Radial Focus</span>
            </button>

            <button
              onClick={() => {
                setLayoutMode('hierarchical');
                if (!focusEntityId && rawNodes[0]) setFocusEntityId(rawNodes[0].id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                layoutMode === 'hierarchical'
                  ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Hierarchical DAG Layout (Multi-hop ownership and control chains)"
            >
              <GitFork className="w-3.5 h-3.5 text-purple-400" />
              <span>Hierarchical</span>
            </button>

            <button
              onClick={() => setLayoutMode('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                layoutMode === 'overview'
                  ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Overview View (Grouped macro corporate clusters)"
            >
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span>Overview</span>
            </button>
          </div>

          {/* Hop Depth Selector (Only in Focus modes) */}
          {layoutMode !== 'overview' && (
            <div className="flex items-center gap-1 bg-[#02050a] border border-[#0e1c2e] p-1 rounded-lg font-mono text-xs">
              <span className="text-slate-500 px-1 text-[10px] uppercase font-bold">Hops:</span>
              {[1, 2, 3].map(depth => (
                <button
                  key={depth}
                  onClick={() => setHopDepth(depth)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                    hopDepth === depth
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Expand graph up to ${depth} hop${depth > 1 ? 's' : ''}`}
                >
                  {depth} Hop{depth > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          )}

          {/* Trace Connection Action */}
          <button
            onClick={() => setShowTraceModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all ${
              layoutMode === 'path'
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                : 'bg-[#02050a] border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10'
            }`}
            title="Calculate and highlight shortest connection path between two entities"
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Trace Connection</span>
          </button>
        </div>

        {/* Center: Search with Autocomplete */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search company, CIN, director DIN..."
            className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono outline-none transition-colors"
          />
          {isSearching && (
            <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin absolute right-7 top-1/2 -translate-y-1/2 pointer-events-none" />
          )}
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Search Dropdown */}
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-[#040810] border border-[#0e1c2e] rounded-lg shadow-2xl z-40 max-h-60 overflow-y-auto font-mono text-xs divide-y divide-[#0e1c2e]"
              >
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSetFocus(item.id)}
                    className="w-full text-left p-2.5 hover:bg-cyan-500/10 flex items-center justify-between transition-colors group"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                        {item.display_name || item.label}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {item.important_identifier ? `${item.important_identifier} · ` : ''}
                        {item.status || item.entity_type}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.properties?.risk_level === 'CRITICAL' && (
                        <span className="text-[8px] bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded font-bold">
                          CRITICAL
                        </span>
                      )}
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#0e1c2e] text-slate-400">
                        {item.entity_type}
                      </span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Filters & Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Entity Type Filter */}
          <select
            value={activeTypeFilter}
            onChange={e => setActiveTypeFilter(e.target.value)}
            className="bg-[#02050a] border border-[#0e1c2e] text-slate-300 text-[11px] font-mono rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500"
            title="Filter by Entity Type"
          >
            <option value="All">All Types</option>
            <option value="Companies">Companies</option>
            <option value="Directors">Directors</option>
            <option value="Suppliers">Suppliers</option>
            <option value="Contracts">Contracts</option>
            <option value="Sanctions">Sanctions</option>
          </select>

          {/* Risk Level Filter */}
          <select
            value={activeRiskFilter}
            onChange={e => setActiveRiskFilter(e.target.value)}
            className="bg-[#02050a] border border-[#0e1c2e] text-slate-300 text-[11px] font-mono rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500"
            title="Filter by Risk Level"
          >
            <option value="All">All Risks</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Verification Claims Filter */}
          <select
            value={verificationFilter}
            onChange={e => setVerificationFilter(e.target.value as any)}
            className="bg-[#02050a] border border-[#0e1c2e] text-slate-300 text-[11px] font-mono rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500"
            title="Filter by Claim Verification Status"
          >
            <option value="all">All Claims</option>
            <option value="verified">Verified Only</option>
            <option value="synthetic">Include Synthetic</option>
          </select>

          {/* Reset to Launchpad */}
          <button
            onClick={() => {
              setFocusEntityId(null);
              setSelectedEntityDetail(null);
              setSelectedEdgeDetail(null);
              setLayoutMode('radial');
            }}
            className="p-1.5 rounded-lg bg-[#02050a] border border-[#0e1c2e] text-slate-400 hover:text-slate-200 transition-colors"
            title="Reset Graph to Launchpad"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. MAIN GRAPH CANVAS VIEWPORT */}
      <div className="relative flex-1 w-full min-h-[580px] border border-[#0e1c2e] rounded-xl bg-[#020408] overflow-hidden shadow-inner">
        {/* Floating Explain Path Banner when in Path Trace mode */}
        <AnimatePresence>
          {layoutMode === 'path' && activeTraceResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-[#030914]/98 border border-cyan-500/50 px-4 py-2 rounded-full backdrop-blur-md shadow-2xl font-mono text-xs max-w-[85vw] overflow-x-auto"
            >
              <div className="flex items-center gap-2 shrink-0">
                <GitFork className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-slate-400 text-[11px]">Causal Path:</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-200 text-[11px] overflow-hidden text-ellipsis whitespace-nowrap">
                {activeTraceResult.pathEntities.map((entName, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-cyan-400">→</span>}
                    <span className="font-bold text-slate-100">{entName}</span>
                  </React.Fragment>
                ))}
              </div>
              <button
                onClick={() => {
                  setLayoutMode('radial');
                  setActiveTraceResult(null);
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline shrink-0 ml-2"
              >
                Exit Path <X className="w-3.5 h-3.5 inline ml-0.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Focus Indicator (Radial & Hierarchical modes) */}
        <AnimatePresence>
          {layoutMode !== 'overview' && layoutMode !== 'path' && focusEntityName && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-[#030914]/95 border border-cyan-500/40 px-4 py-2 rounded-full backdrop-blur-md shadow-2xl font-mono text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-400 text-[11px]">Focus Entity:</span>
                <span className="font-bold text-slate-100 max-w-[280px] truncate">{focusEntityName}</span>
              </div>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => setLayoutMode('overview')}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
              >
                Show Overview
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State / Investigation Launchpad when no focus entity is selected */}
        {!focusEntityId && layoutMode !== 'overview' ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-8 z-10 relative font-mono">
            <div className="max-w-xl w-full text-center space-y-6">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <Focus className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 font-sans tracking-tight">
                  Start Enterprise Investigation
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 font-mono leading-relaxed">
                  ReasonChain avoids dumping a chaotic wall of cards. Select an enterprise entity below or search by CIN/DIN to inspect its verified corporate network.
                </p>
              </div>

              {/* Quick Launch Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {CURATED_TARGETS.map(target => (
                  <button
                    key={target.id}
                    onClick={() => handleSetFocus(target.id)}
                    className={`p-3.5 rounded-xl border ${target.color} transition-all space-y-1.5 group text-left`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${target.badgeColor}`}>
                        {target.tag}
                      </span>
                      {target.risk === 'CRITICAL' && (
                        <span className="text-[8.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                          CRITICAL RISK
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="font-sans font-bold text-xs text-slate-100 group-hover:text-cyan-200 transition-colors line-clamp-1">
                      {target.name}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono line-clamp-2">
                      {target.desc}
                    </p>
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setLayoutMode('overview')}
                  className="text-xs text-slate-400 hover:text-cyan-300 font-mono underline transition-colors"
                >
                  Or explore full macro cluster overview →
                </button>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3 font-mono">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
            <p className="text-xs text-slate-400">Loading Knowledge Graph...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3 font-mono">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={loadGraphData}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
            >
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
            onPaneClick={() => {
              setSelectedEntityDetail(null);
              setSelectedEdgeDetail(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.15}
            maxZoom={2.4}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#081426" gap={26} size={1} />

            {/* React Flow MiniMap */}
            {showMinimap && (
              <MiniMap
                nodeColor={node => {
                  const t = (node.data as any)?.entityType;
                  if (t === 'Company') return '#3b82f6';
                  if (t === 'Person' || t === 'Director') return '#a855f7';
                  if (t === 'Supplier') return '#f59e0b';
                  if (t === 'Contract') return '#10b981';
                  if (t === 'Sanction') return '#ef4444';
                  return '#06b6d4';
                }}
                nodeStrokeColor="#020617"
                maskColor="rgba(2, 6, 23, 0.75)"
                className="!bg-[#030914] !border !border-[#0e1c2e] !rounded-xl !bottom-3 !right-3 shadow-2xl"
                style={{ width: 150, height: 100 }}
              />
            )}
          </ReactFlow>
        )}

        {/* Top-Right Quick Navigation & Control Strip */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10 font-mono">
          <button
            onClick={() => zoomIn({ duration: 250 })}
            className="w-8 h-8 rounded-lg bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => zoomOut({ duration: 250 })}
            className="w-8 h-8 rounded-lg bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => fitView({ duration: 500, padding: 0.22 })}
            className="w-8 h-8 rounded-lg bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Fit to Content"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className={`w-8 h-8 rounded-lg border text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md ${
              showMinimap ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-[#040810]/90 border-[#0e1c2e]'
            }`}
            title="Toggle Minimap"
          >
            <MapPin className="w-4 h-4" />
          </button>
          <button
            onClick={loadGraphData}
            className="w-8 h-8 rounded-lg bg-[#040810]/90 border border-[#0e1c2e] text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors shadow-md"
            title="Refresh Knowledge Graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom-Left Collapsible Legend */}
        {showLegend && (
          <div className="absolute bottom-3 left-3 bg-[#030712]/92 border border-[#0e1c2e] px-3.5 py-2 rounded-xl z-10 backdrop-blur-md font-mono text-[10px] shadow-lg">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span className="text-slate-300">Company</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                <span className="text-slate-300">Director</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-slate-300">Supplier</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Contract</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-slate-300">Sanction</span>
              </span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-cyan-400" />
                <span className="text-slate-400">Verified</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-amber-400" />
                <span className="text-amber-400">Synthetic</span>
              </span>
              <button
                onClick={() => setShowLegend(false)}
                className="text-slate-500 hover:text-slate-300 ml-1"
                title="Hide Legend"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        {!showLegend && (
          <button
            onClick={() => setShowLegend(true)}
            className="absolute bottom-3 left-3 bg-[#030712]/92 border border-[#0e1c2e] p-2 rounded-lg text-slate-400 hover:text-white z-10 font-mono text-[10px]"
            title="Show Legend"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 3. ENTITY INSPECTOR DRAWER (RIGHT PANEL) */}
        <AnimatePresence>
          {selectedEntityDetail && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.18 }}
              className="absolute top-0 right-0 bottom-0 w-[360px] bg-[#02050c]/98 border-l border-[#0e1c2e] p-5 z-30 backdrop-blur-2xl font-mono text-xs flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#0e1c2e]">
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {selectedEntityDetail.entity_type}
                    </span>
                    {selectedEntityDetail.properties?.risk_level === 'CRITICAL' ? (
                      <span className="text-[9px] text-red-400 font-bold bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded">
                        ● CRITICAL RISK
                      </span>
                    ) : selectedEntityDetail.status && (
                      <span className="text-[9px] text-emerald-400 font-semibold">
                        ● {selectedEntityDetail.status}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans leading-snug line-clamp-2">
                    {selectedEntityDetail.display_name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEntityDetail(null)}
                  className="p-1 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-[#071326] transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons: Set as Focus & Trace Connection */}
              <div className="py-3 border-b border-[#0e1c2e] grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSetFocus(selectedEntityDetail.canonical_id)}
                  className="py-2 px-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <Focus className="w-3.5 h-3.5" />
                  Set as Focus
                </button>
                <button
                  onClick={() => {
                    setTraceSourceId(selectedEntityDetail.canonical_id);
                    setShowTraceModal(true);
                  }}
                  className="py-2 px-2.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  Trace Path
                </button>
              </div>

              {/* Scrollable Body */}
              {drawerLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 font-mono text-xs gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Loading entity details...</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 text-[11px]">
                  {/* Why Flagged / Risk Reason Card (if Critical or High risk) */}
                  {(selectedEntityDetail.properties?.risk_level === 'CRITICAL' || selectedEntityDetail.entity_type === 'Sanction') && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                        <span>WHY IS THIS ENTITY FLAGGED?</span>
                      </div>
                      <p className="text-[10px] text-red-300/90 leading-relaxed">
                        • Direct or indirect directorship link to sanctioned entity.
                        <br />
                        • Multi-hop compliance risk detected across external corporate links.
                      </p>
                    </div>
                  )}

                  {/* Core Identifiers */}
                  <div className="p-3 rounded-lg bg-[#040916] border border-[#0e1c2e] space-y-2">
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                      Core Identifiers
                    </span>
                    <div className="space-y-1.5">
                      {selectedEntityDetail.canonical_id && (
                        <div>
                          <span className="text-slate-500 text-[9px] block">CANONICAL ID</span>
                          <span className="text-slate-300 select-all break-all">{selectedEntityDetail.canonical_id}</span>
                        </div>
                      )}
                      {Object.entries(selectedEntityDetail.identifiers || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center py-0.5 border-t border-[#0e1c2e]/60">
                          <span className="text-slate-400 uppercase text-[10px]">{k}</span>
                          <span className="text-cyan-300 font-semibold">{String(v)}</span>
                        </div>
                      ))}
                      {selectedEntityDetail.properties?.industry && (
                        <div className="flex justify-between items-center py-0.5 border-t border-[#0e1c2e]/60">
                          <span className="text-slate-400 uppercase text-[10px]">Industry</span>
                          <span className="text-slate-200">{selectedEntityDetail.properties.industry}</span>
                        </div>
                      )}
                      {selectedEntityDetail.properties?.registration_date && (
                        <div className="flex justify-between items-center py-0.5 border-t border-[#0e1c2e]/60">
                          <span className="text-slate-400 uppercase text-[10px]">Reg. Date</span>
                          <span className="text-slate-200">{selectedEntityDetail.properties.registration_date}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connected Relationships with Expansion Action */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                        Connected Entities ({selectedEntityDetail.connected_edges?.length || 0})
                      </span>
                      <button
                        onClick={() => handleExpandConnections(selectedEntityDetail.canonical_id)}
                        disabled={isExpanding}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Expand
                      </button>
                    </div>

                    {selectedEntityDetail.connected_edges?.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {selectedEntityDetail.connected_edges.map((edge: any, i: number) => {
                          const targetId = edge.direction === 'OUTGOING' ? edge.target_id : edge.source_id;
                          const targetName = edge.direction === 'OUTGOING' ? edge.target_name : edge.source_name;
                          return (
                            <button
                              key={i}
                              onClick={() => handleSetFocus(targetId)}
                              className="w-full text-left p-2 rounded-lg bg-[#040916] hover:bg-cyan-500/10 border border-[#0e1c2e] hover:border-cyan-500/30 text-[11px] flex items-center justify-between transition-colors group"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-1">
                                <span className="text-cyan-400 font-bold shrink-0 text-[10px]">
                                  {edge.display_label}
                                </span>
                                <span className="text-slate-600">→</span>
                                <span className="text-slate-200 group-hover:text-cyan-200 truncate">
                                  {targetName}
                                </span>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-[#040916] border border-[#0e1c2e] text-slate-500 text-center">
                        No relationships recorded for this entity
                      </div>
                    )}
                  </div>

                  {/* Provenance & Source Database */}
                  <div className="p-3 rounded-lg bg-[#040916] border border-[#0e1c2e] space-y-2">
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                      Provenance & Verification
                    </span>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Primary Database:</span>
                      <span className="text-slate-200 font-semibold uppercase">
                        {selectedEntityDetail.sources?.[0]?.source_system === 'firebase'
                          ? 'Firebase Realtime DB'
                          : selectedEntityDetail.sources?.[0]?.source_system === 'relational' || selectedEntityDetail.sources?.[0]?.source_system === 'postgres'
                          ? 'PostgreSQL Neon'
                          : 'Neo4j Canonical Store'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="text-emerald-400 font-bold">100% Verified</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Resolution Decision:</span>
                      <span className="text-cyan-300 font-semibold">
                        {selectedEntityDetail.resolution?.status || 'RESOLVED (PRIMARY_KEY)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 4. RELATIONSHIP / EDGE INSPECTOR DRAWER */}
        <AnimatePresence>
          {selectedEdgeDetail && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.18 }}
              className="absolute top-0 right-0 bottom-0 w-[360px] bg-[#02050c]/98 border-l border-[#0e1c2e] p-5 z-30 backdrop-blur-2xl font-mono text-xs flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#0e1c2e]">
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 block mb-1">
                    RELATIONSHIP CLAIM
                  </span>
                  <h3 className="text-sm font-bold text-slate-100 font-sans">
                    {selectedEdgeDetail.display_label}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEdgeDetail(null)}
                  className="p-1 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-[#071326] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Edge Details Body */}
              <div className="flex-1 overflow-y-auto py-3 space-y-4 text-[11px]">
                {/* Synthetic Warning if Synthetic */}
                {selectedEdgeDetail.is_synthetic && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>NON-AUTHORITATIVE TEST CLAIM</span>
                    </div>
                    <p className="text-[10px] text-amber-400/90 leading-relaxed">
                      This relationship was loaded from the isolated relationship claims schema for multi-database graph demonstration.
                    </p>
                  </div>
                )}

                {/* Connection Endpoints */}
                <div className="p-3 rounded-lg bg-[#040916] border border-[#0e1c2e] space-y-2.5">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                    Relationship Endpoints
                  </span>
                  <div>
                    <span className="text-slate-500 text-[9px] block">ORIGIN ENTITY</span>
                    <button
                      onClick={() => handleSetFocus(selectedEdgeDetail.source_entity?.id)}
                      className="text-cyan-300 hover:underline font-bold text-left block truncate w-full"
                    >
                      {selectedEdgeDetail.source_entity?.name || selectedEdgeDetail.source_entity?.id}
                    </button>
                  </div>
                  <div className="text-slate-600 text-center font-mono">↓ {selectedEdgeDetail.display_label} ↓</div>
                  <div>
                    <span className="text-slate-500 text-[9px] block">TARGET ENTITY</span>
                    <button
                      onClick={() => handleSetFocus(selectedEdgeDetail.target_entity?.id)}
                      className="text-cyan-300 hover:underline font-bold text-left block truncate w-full"
                    >
                      {selectedEdgeDetail.target_entity?.name || selectedEdgeDetail.target_entity?.id}
                    </button>
                  </div>
                </div>

                {/* Verification & Source DB */}
                <div className="p-3 rounded-lg bg-[#040916] border border-[#0e1c2e] space-y-2">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">
                    Evidence & Provenance
                  </span>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Source Database:</span>
                    <span className="text-slate-200 font-semibold">PostgreSQL Neon</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Confidence Score:</span>
                    <span className="text-emerald-400 font-bold">
                      {Math.round((selectedEdgeDetail.confidence?.relationship_confidence || 0.95) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Temporal Status:</span>
                    <span className="text-slate-200">Current</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. TRACE CONNECTION MODAL */}
        <AnimatePresence>
          {showTraceModal && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#030914] border border-cyan-500/40 rounded-xl max-w-md w-full p-6 space-y-4 font-mono shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
                  <div className="flex items-center gap-2">
                    <GitFork className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-sm font-bold text-slate-100 font-sans">
                      Trace Connection Path
                    </h3>
                  </div>
                  <button onClick={() => setShowTraceModal(false)} className="text-slate-500 hover:text-slate-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 block mb-1">
                      Origin Entity:
                    </label>
                    <select
                      value={traceSourceId || focusEntityId || ''}
                      onChange={e => setTraceSourceId(e.target.value)}
                      className="w-full bg-[#02050a] border border-[#0e1c2e] text-slate-200 rounded-lg p-2 text-xs outline-none"
                    >
                      {rawNodes.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.display_name || n.label} ({n.entity_type || n.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-400 block mb-1">
                      Target Entity to Connect With:
                    </label>
                    <select
                      value={traceTargetId || ''}
                      onChange={e => setTraceTargetId(e.target.value)}
                      className="w-full bg-[#02050a] border border-[#0e1c2e] text-slate-200 rounded-lg p-2 text-xs outline-none"
                    >
                      <option value="">Select target entity...</option>
                      {rawNodes.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.display_name || n.label} ({n.entity_type || n.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setShowTraceModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#0e1c2e] text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const src = traceSourceId || focusEntityId || rawNodes[0]?.id;
                      const tgt = traceTargetId || rawNodes[1]?.id;
                      if (src && tgt) handleInitiateTrace(src, tgt);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Calculate Path</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Neo4jGraphViewer({ initialSource = 'all' }: Neo4jGraphViewerProps = {}) {
  return (
    <ReactFlowProvider>
      <Neo4jGraphInner initialSource={initialSource} />
    </ReactFlowProvider>
  );
}
