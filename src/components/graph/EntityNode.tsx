import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { Building2, Users, AlertTriangle, Layers, FileText, Globe } from 'lucide-react';

// ==========================================
// CUSTOM ENTITY NODE FOR REACT FLOW
// Real Neo4j entity node cards styled by node type
// ==========================================

export type EntityNodeData = {
  label: string;
  entityType: 'Supplier' | 'Company' | 'Person' | 'Contract' | 'Sanction' | 'Country' | string;
  details?: string;
  status?: string;
  risk?: string;
  isActive?: boolean;
  properties?: Record<string, any>;
};

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

const NODE_TYPE_CONFIG: Record<string, {
  border: string;
  accent: string;
  bg: string;
  badge: string;
  dot: string;
  glow: string;
  iconBg: string;
  iconColor: string;
  icon: any;
}> = {
  Supplier: {
    border: 'border-cyan-500/40',
    accent: 'border-l-cyan-400',
    bg: 'bg-[#040c1a]',
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
    glow: '0 0 20px rgba(6,182,212,0.15)',
    iconBg: 'bg-cyan-500/10 border-cyan-500/30',
    iconColor: 'text-cyan-400',
    icon: Building2,
  },
  Company: {
    border: 'border-blue-500/40',
    accent: 'border-l-blue-400',
    bg: 'bg-[#040815]',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
    glow: '0 0 20px rgba(59,130,246,0.15)',
    iconBg: 'bg-blue-500/10 border-blue-500/30',
    iconColor: 'text-blue-400',
    icon: Layers,
  },
  Person: {
    border: 'border-amber-500/40',
    accent: 'border-l-amber-400',
    bg: 'bg-[#0f0c04]',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    glow: '0 0 20px rgba(245,158,11,0.15)',
    iconBg: 'bg-amber-500/10 border-amber-500/30',
    iconColor: 'text-amber-400',
    icon: Users,
  },
  Contract: {
    border: 'border-purple-500/40',
    accent: 'border-l-purple-400',
    bg: 'bg-[#0d0415]',
    badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400',
    glow: '0 0 20px rgba(168,85,247,0.15)',
    iconBg: 'bg-purple-500/10 border-purple-500/30',
    iconColor: 'text-purple-400',
    icon: FileText,
  },
  Sanction: {
    border: 'border-red-500/50',
    accent: 'border-l-red-500',
    bg: 'bg-[#0f0406]',
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
    glow: '0 0 24px rgba(239,68,68,0.2)',
    iconBg: 'bg-red-500/10 border-red-500/30',
    iconColor: 'text-red-400',
    icon: AlertTriangle,
  },
  Country: {
    border: 'border-teal-500/40',
    accent: 'border-l-teal-400',
    bg: 'bg-[#040f0f]',
    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    dot: 'bg-teal-400',
    glow: '0 0 20px rgba(20,184,166,0.15)',
    iconBg: 'bg-teal-500/10 border-teal-500/30',
    iconColor: 'text-teal-400',
    icon: Globe,
  },
};

export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const config = NODE_TYPE_CONFIG[data.entityType] || NODE_TYPE_CONFIG['Company'];
  const Icon = config.icon;
  const isHighlighted = data.isActive;

  const detailText = data.details || data.properties?.status || data.properties?.industry || data.properties?.country || data.entityType;

  return (
    <div
      className={`
        rounded-md border border-l-2 ${config.border} ${config.accent} ${config.bg}
        min-w-[190px] max-w-[210px] p-3 select-none
        transition-all duration-300
        ${isHighlighted
          ? 'ring-2 ring-cyan-400/80 scale-[1.03] shadow-lg'
          : 'hover:ring-1 hover:ring-slate-600/50'
        }
      `}
      style={{ boxShadow: isHighlighted ? config.glow : 'none' }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0 !-left-[4px]" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0 !-right-[4px]" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-slate-500 !w-1.5 !h-1.5 !border-0 !-bottom-[4px]" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-slate-500 !w-1.5 !h-1.5 !border-0 !-top-[4px]" />

      {/* Header: type badge + status dot */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[8px] font-mono font-bold uppercase tracking-[0.12em] px-1.5 py-[2px] rounded border ${config.badge}`}>
          {data.entityType}
        </span>
        <span className={`w-[6px] h-[6px] rounded-full ${config.dot} ${isHighlighted ? 'animate-pulse' : ''}`} />
      </div>

      {/* Body: icon + text */}
      <div className="flex items-start gap-2.5">
        <div className={`p-1.5 rounded border ${config.iconBg} ${config.iconColor} shrink-0`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[11px] font-bold text-slate-100 leading-tight truncate font-sans">
            {data.label}
          </h4>
          <p className="text-[9px] font-mono text-slate-400 mt-1 leading-none truncate">
            {detailText}
          </p>
        </div>
      </div>
    </div>
  );
}
