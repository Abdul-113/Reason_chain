import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  Play,
  Pause,
  RefreshCw,
  Maximize2,
  Filter,
  Crosshair,
  X,
  Minus,
  Plus,
  Database,
  GitBranch,
  Search,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { EntityNode } from './EntityNode';
import type { EntityNodeType } from './EntityNode';
import { AnimatedEdge } from './AnimatedEdge';
import type { AnimatedEdgeType } from './AnimatedEdge';

// ==========================================
// KNOWLEDGE GRAPH PANEL
// The main interactive graph visualization.
// Includes: React Flow viewport, controls,
// status panel, statistics, legend, and
// node detail panel.
// ==========================================

// Node detail info for click panel
interface NodeDetail {
  label: string;
  type: string;
  status: string;
  source: string;
  relationships: number;
  risk: string;
}

const NODE_DETAILS: Record<string, NodeDetail> = {
  'n-1': { label: 'ABC Industrial Supplies', type: 'Supplier', status: 'Active', source: 'ERP Database', relationships: 14, risk: 'High' },
  'n-2': { label: 'Acme Manufacturing', type: 'Company', status: 'Subsidiary', source: 'Corporate Registry', relationships: 8, risk: 'Medium' },
  'n-3': { label: 'Rahul Mehta', type: 'Person', status: 'Managing Director', source: 'SEC Filings', relationships: 3, risk: 'Medium' },
  'n-4': { label: 'Orion Trading', type: 'Company', status: 'Shell Entity', source: 'Offshore Registry', relationships: 6, risk: 'High' },
  'n-5': { label: 'Sanctions List', type: 'Sanctioned Entity', status: 'Listed', source: 'OFAC Database', relationships: 112, risk: 'Critical' }
};

// Counter hook for statistics count-up
function useCountUp(target: number, duration = 1800, startDelay = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setCount(Math.floor(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [target, duration, startDelay]);

  return count;
}

function KnowledgeGraphInner({
  activeStep,
  setActiveStep,
  isPlaying,
  setIsPlaying
}: {
  activeStep: number;
  setActiveStep: (s: number | ((p: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);

  // Node types & edge types
  const nodeTypes = useMemo(() => ({ entity: EntityNode }), []);
  const edgeTypes = useMemo(() => ({ animated: AnimatedEdge }), []);

  // Build nodes based on active step
  const buildNodes = useCallback((step: number): EntityNodeType[] => [
    {
      id: 'n-1',
      type: 'entity',
      position: { x: 30, y: 50 },
      data: { label: 'ABC Industrial Supplies', entityType: 'supplier', details: 'Active · ERP Vendor', status: 'verified', isActive: step >= 0 }
    },
    {
      id: 'n-2',
      type: 'entity',
      position: { x: 290, y: 50 },
      data: { label: 'Acme Manufacturing', entityType: 'company', details: 'Subsidiary Corp', status: 'verified', isActive: step >= 1 }
    },
    {
      id: 'n-3',
      type: 'entity',
      position: { x: 550, y: 50 },
      data: { label: 'Rahul Mehta', entityType: 'person', details: 'Managing Director', status: 'warning', isActive: step >= 2 }
    },
    {
      id: 'n-4',
      type: 'entity',
      position: { x: 470, y: 260 },
      data: { label: 'Orion Trading', entityType: 'company', details: 'Shell Entity · Offshore', status: 'risk', isActive: step >= 3 }
    },
    {
      id: 'n-5',
      type: 'entity',
      position: { x: 200, y: 260 },
      data: { label: 'Sanctions List', entityType: 'sanctioned', details: 'OFAC · EU · UN', status: 'sanctioned', isActive: step >= 4 }
    }
  ], []);

  const buildEdges = useCallback((step: number): AnimatedEdgeType[] => [
    {
      id: 'e-1', source: 'n-1', target: 'n-2', type: 'animated',
      data: { label: 'SUPPLIES TO', status: 'verified', isActive: step >= 1 }
    },
    {
      id: 'e-2', source: 'n-2', target: 'n-3', type: 'animated',
      data: { label: 'DIRECTOR OF', status: 'verified', isActive: step >= 2 }
    },
    {
      id: 'e-3', source: 'n-3', target: 'n-4', type: 'animated',
      sourceHandle: 'bottom', targetHandle: 'top',
      data: { label: 'DIRECTOR OF', status: 'warning', isActive: step >= 3 }
    },
    {
      id: 'e-4', source: 'n-4', target: 'n-5', type: 'animated',
      data: { label: 'LISTED ON', status: 'risk', isActive: step >= 4 }
    }
  ], []);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>(buildNodes(activeStep));
  const [edges, setEdges, onEdgesChange] = useEdgesState<AnimatedEdgeType>(buildEdges(activeStep));

  useEffect(() => {
    setNodes(buildNodes(activeStep));
    setEdges(buildEdges(activeStep));
  }, [activeStep, buildNodes, buildEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: unknown, node: EntityNodeType) => {
    setIsPlaying(false);
    const detail = NODE_DETAILS[node.id];
    if (detail) setSelectedNode(detail);
  }, [setIsPlaying]);

  const handleReset = useCallback(() => {
    setActiveStep(0);
    setSelectedNode(null);
    setIsPlaying(true);
    fitView({ duration: 600 });
  }, [setActiveStep, setIsPlaying, fitView]);

  // Count-up statistics
  const entities = useCountUp(24892, 2000, 3000);
  const relations = useCountUp(81204, 2200, 3100);
  const investigations = useCountUp(1248, 1800, 3200);
  const highRisk = useCountUp(37, 1200, 3300);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full flex flex-col border border-[#0e1c2e] bg-[#040810]/70 rounded-lg relative overflow-hidden min-h-[540px]"
      style={{ boxShadow: 'inset 0 0 40px rgba(6,182,212,0.02)' }}
    >
      {/* Subtle corner glow */}
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-[radial-gradient(circle,rgba(6,182,212,0.04),transparent_70%)] pointer-events-none" />

      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#0e1c2e]">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-[0.15em] font-mono">
              Live Knowledge Graph
            </h3>
            <p className="text-[9px] text-slate-500 mt-0.5">Real-time relationship resolution</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#091b35]/50 border border-cyan-500/15 text-[9px] font-mono text-cyan-400">
            <Activity className="w-3 h-3" />
            ⌁ Live Data Flow
          </span>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-7 h-7 rounded border flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                : 'bg-[#0e1c2e]/50 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isPlaying
              ? <Pause className="w-3 h-3" />
              : <Play className="w-3 h-3" />
            }
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="relative flex-1 w-full h-[450px] min-h-[400px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultViewport={{ x: 20, y: 30, zoom: 0.85 }}
          minZoom={0.3}
          maxZoom={1.8}
          panOnScroll={false}
          zoomOnScroll={false}
          preventScrolling={true}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#0f2136" gap={24} size={1} />
        </ReactFlow>

        {/* LEGEND OVERLAY — top left */}
        <div className="absolute top-3 left-3 bg-[#040810]/92 border border-[#0e1c2e] px-3 py-2 rounded flex items-center gap-4 text-[8px] font-mono z-10 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-emerald-500 rounded-full" />
            <span className="text-slate-400 uppercase tracking-wider">Verified Path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-red-500 rounded-full" />
            <span className="text-slate-400 uppercase tracking-wider">High-Risk Path</span>
          </div>
        </div>

        {/* NODE DETAIL PANEL — top left, below legend */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-12 left-3 bg-[#040810]/95 border border-[#0e1c2e] p-3.5 rounded w-[195px] font-mono text-[9px] z-10 space-y-2 backdrop-blur-sm"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            >
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-1.5">
                <span className="text-cyan-400 font-bold uppercase text-[8px] tracking-wider truncate pr-2">
                  {selectedNode.label}
                </span>
                <button onClick={() => setSelectedNode(null)} className="text-slate-600 hover:text-slate-300 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1.5 text-slate-300">
                <div className="flex justify-between"><span className="text-slate-500">Type</span><span>{selectedNode.type}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Status</span><span>{selectedNode.status}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Source</span><span>{selectedNode.source}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Relationships</span><span>{selectedNode.relationships}</span></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk</span>
                  <span className={
                    selectedNode.risk === 'Critical' || selectedNode.risk === 'High'
                      ? 'text-red-400 font-bold'
                      : selectedNode.risk === 'Medium'
                        ? 'text-amber-400 font-bold'
                        : 'text-emerald-400'
                  }>
                    {selectedNode.risk}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PATH STATUS PANEL — bottom left */}
        <div className="absolute bottom-3 left-3 border border-[#0e1c2e] bg-[#040810]/92 rounded p-3 w-[160px] font-mono text-[9px] z-10 space-y-2.5 backdrop-blur-sm">
          <div>
            <span className="text-slate-500 text-[7.5px] uppercase tracking-wider block mb-1">Path Status</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ✓ Verified Path
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[7.5px] uppercase tracking-wider block mb-1">Risk Level</span>
            <span className="text-red-400 font-bold">High Risk</span>
            <div className="flex gap-[2px] h-[3px] mt-1">
              <div className="flex-1 bg-red-500 rounded-sm" />
              <div className="flex-1 bg-red-500 rounded-sm" />
              <div className="flex-1 bg-red-500 rounded-sm" />
              <div className="flex-1 bg-red-500/15 rounded-sm" />
              <div className="flex-1 bg-red-500/15 rounded-sm" />
            </div>
          </div>

          <div>
            <span className="text-slate-500 text-[7.5px] uppercase tracking-wider block mb-1">Confidence Score</span>
            <span className="text-cyan-400 font-bold">92%</span>
            <div className="h-[3px] bg-slate-800/80 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: '92%' }} />
            </div>
          </div>

          <div>
            <span className="text-slate-500 text-[7.5px] uppercase tracking-wider block mb-0.5">Last Updated</span>
            <span className="text-slate-400">10 sec ago</span>
          </div>
        </div>

        {/* GRAPH CONTROLS — right side toolbar */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
          <button
            onClick={() => fitView({ duration: 500 })}
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title="Focus"
          >
            <Crosshair className="w-3 h-3" />
          </button>
          <button
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title="Relationships"
          >
            <GitBranch className="w-3 h-3" />
          </button>
          <button
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title="Filter"
          >
            <Filter className="w-3 h-3" />
          </button>
          <button
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        {/* ZOOM CONTROLS — bottom right */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
          <button
            onClick={() => zoomIn({ duration: 300 })}
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors text-xs font-bold"
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="px-1 py-0.5 text-[7.5px] font-mono text-slate-600 text-center bg-[#040810] border border-[#0e1c2e] rounded-sm">
            100%
          </div>
          <button
            onClick={() => zoomOut({ duration: 300 })}
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors text-xs font-bold"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={handleReset}
            className="w-7 h-7 rounded border border-[#0e1c2e] bg-[#040810]/90 hover:bg-[#0a1a30] text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title="Reset"
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* STATISTICS STRIP */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3.5 border-t border-[#0e1c2e] font-mono">
        <div className="border border-[#0e1c2e]/60 bg-[#020408]/50 rounded px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Database className="w-3 h-3 text-slate-600" />
            <span className="text-[7.5px] text-slate-500 uppercase tracking-wider">Entities</span>
          </div>
          <span className="text-[14px] font-bold text-slate-200 block">{entities.toLocaleString()}</span>
          <span className="text-[7px] text-emerald-500 font-semibold block mt-0.5">+256 today</span>
        </div>
        <div className="border border-[#0e1c2e]/60 bg-[#020408]/50 rounded px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <GitBranch className="w-3 h-3 text-slate-600" />
            <span className="text-[7.5px] text-slate-500 uppercase tracking-wider">Relations</span>
          </div>
          <span className="text-[14px] font-bold text-slate-200 block">{relations.toLocaleString()}</span>
          <span className="text-[7px] text-emerald-500 font-semibold block mt-0.5">+1,102 today</span>
        </div>
        <div className="border border-[#0e1c2e]/60 bg-[#020408]/50 rounded px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Search className="w-3 h-3 text-slate-600" />
            <span className="text-[7.5px] text-slate-500 uppercase tracking-wider">Investigations</span>
          </div>
          <span className="text-[14px] font-bold text-slate-200 block">{investigations.toLocaleString()}</span>
          <span className="text-[7px] text-emerald-500 font-semibold block mt-0.5">+18 today</span>
        </div>
        <div className="border border-red-500/15 bg-[#020408]/50 rounded px-2.5 py-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3 text-slate-600" />
            <span className="text-[7.5px] text-slate-500 uppercase tracking-wider">High Risk</span>
          </div>
          <span className="text-[14px] font-bold text-red-400 block">{highRisk}</span>
          <span className="text-[7px] text-red-400 font-semibold block mt-0.5">+3 today</span>
        </div>
      </div>
    </motion.div>
  );
}

// Wrapper to provide ReactFlowProvider
export default function KnowledgeGraphPanel(props: {
  activeStep: number;
  setActiveStep: (s: number | ((p: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
}) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
