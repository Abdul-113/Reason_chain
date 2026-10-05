import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import {
  Building2,
  Users,
  AlertTriangle,
  Layers,
  FileText,
  Globe,
  Wallet,
  ArrowLeftRight,
  Cpu,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';

// ==========================================
// CANONICAL ENTITY NODE FOR REACT FLOW
// Clean, spacious, human-friendly node card
// ==========================================

export type EntityNodeData = {
  label: string;
  entityType:
    | 'Supplier'
    | 'Company'
    | 'Person'
    | 'Contract'
    | 'Sanction'
    | 'Country'
    | 'Account'
    | 'Transaction'
    | 'Director'
    | 'Device'
    | 'Rule'
    | string;
  details?: string;
  status?: string;
  risk?: string;
  isActive?: boolean;
  is_synthetic?: boolean;
  confidence?: number;
  source_system?: string;
  important_identifier?: string;
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
    border: 'border-cyan-500/30',
    accent: 'border-l-cyan-400',
    bg: 'bg-[#030914]',
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
    glow: '0 0 20px rgba(6,182,212,0.18)',
    iconBg: 'bg-cyan-500/10 border-cyan-500/30',
    iconColor: 'text-cyan-400',
    icon: Building2,
  },
  Company: {
    border: 'border-blue-500/30',
    accent: 'border-l-blue-400',
    bg: 'bg-[#030712]',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
    glow: '0 0 20px rgba(59,130,246,0.18)',
    iconBg: 'bg-blue-500/10 border-blue-500/30',
    iconColor: 'text-blue-400',
    icon: Layers,
  },
  Person: {
    border: 'border-amber-500/30',
    accent: 'border-l-amber-400',
    bg: 'bg-[#0a0702]',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    glow: '0 0 20px rgba(245,158,11,0.18)',
    iconBg: 'bg-amber-500/10 border-amber-500/30',
    iconColor: 'text-amber-400',
    icon: Users,
  },
  Director: {
    border: 'border-amber-500/30',
    accent: 'border-l-amber-400',
    bg: 'bg-[#0a0702]',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    glow: '0 0 20px rgba(245,158,11,0.18)',
    iconBg: 'bg-amber-500/10 border-amber-500/30',
    iconColor: 'text-amber-400',
    icon: Users,
  },
  Contract: {
    border: 'border-purple-500/30',
    accent: 'border-l-purple-400',
    bg: 'bg-[#090312]',
    badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400',
    glow: '0 0 20px rgba(168,85,247,0.18)',
    iconBg: 'bg-purple-500/10 border-purple-500/30',
    iconColor: 'text-purple-400',
    icon: FileText,
  },
  Sanction: {
    border: 'border-red-500/40',
    accent: 'border-l-red-500',
    bg: 'bg-[#0d0204]',
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
    glow: '0 0 24px rgba(239,68,68,0.22)',
    iconBg: 'bg-red-500/10 border-red-500/30',
    iconColor: 'text-red-400',
    icon: AlertTriangle,
  },
  Country: {
    border: 'border-teal-500/30',
    accent: 'border-l-teal-400',
    bg: 'bg-[#020b0b]',
    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    dot: 'bg-teal-400',
    glow: '0 0 20px rgba(20,184,166,0.18)',
    iconBg: 'bg-teal-500/10 border-teal-500/30',
    iconColor: 'text-teal-400',
    icon: Globe,
  },
  Account: {
    border: 'border-indigo-500/30',
    accent: 'border-l-indigo-400',
    bg: 'bg-[#050414]',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
    glow: '0 0 20px rgba(99,102,241,0.18)',
    iconBg: 'bg-indigo-500/10 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    icon: Wallet,
  },
  Transaction: {
    border: 'border-emerald-500/30',
    accent: 'border-l-emerald-400',
    bg: 'bg-[#020c08]',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
    glow: '0 0 20px rgba(16,185,129,0.18)',
    iconBg: 'bg-emerald-500/10 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    icon: ArrowLeftRight,
  },
  Device: {
    border: 'border-sky-500/30',
    accent: 'border-l-sky-400',
    bg: 'bg-[#030a14]',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400',
    glow: '0 0 20px rgba(14,165,233,0.18)',
    iconBg: 'bg-sky-500/10 border-sky-500/30',
    iconColor: 'text-sky-400',
    icon: Cpu,
  },
  Rule: {
    border: 'border-violet-500/30',
    accent: 'border-l-violet-400',
    bg: 'bg-[#090312]',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    dot: 'bg-violet-400',
    glow: '0 0 20px rgba(139,92,246,0.18)',
    iconBg: 'bg-violet-500/10 border-violet-500/30',
    iconColor: 'text-violet-400',
    icon: ShieldCheck,
  },
};

export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const config = NODE_TYPE_CONFIG[data.entityType] || NODE_TYPE_CONFIG['Company'];
  const Icon = config.icon;
  const isHighlighted = data.isActive;

  const isSynthetic = Boolean(
    data.is_synthetic ||
    data.properties?.mock_record ||
    data.properties?.is_synthetic
  );

  const confidencePct = data.confidence !== undefined
    ? Math.round(data.confidence * 100)
    : data.properties?.entity_confidence !== undefined
      ? Math.round(data.properties.entity_confidence * 100)
      : 100;

  const subtitle =
    data.important_identifier ||
    data.details ||
    data.properties?.cin ||
    data.properties?.din ||
    data.properties?.registration_number ||
    data.properties?.status ||
    data.properties?.country ||
    data.entityType;

  return (
    <div
      className={`
        rounded-lg border border-l-[3px] ${config.border} ${config.accent} ${config.bg}
        min-w-[210px] max-w-[240px] p-3 select-none cursor-pointer
        transition-all duration-200 shadow-sm
        ${isHighlighted
          ? 'ring-2 ring-cyan-400/90 scale-[1.03] shadow-xl'
          : 'hover:border-slate-500/60 hover:scale-[1.01]'
        }
      `}
      style={{ boxShadow: isHighlighted ? config.glow : undefined }}
      title={data.label}
    >
      {/* Universal Handles on 4 sides */}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-left-[4px]" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-right-[4px]" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-bottom-[4px]" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-top-[4px]" />

      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[8px] font-mono font-bold uppercase tracking-[0.1em] px-1.5 py-[2px] rounded border ${config.badge} truncate`}>
            {data.entityType}
          </span>
          {data.source_system === 'firebase' ? (
            <span className="text-[7.5px] font-mono font-bold uppercase px-1 py-[1.5px] rounded border bg-amber-500/10 text-amber-300 border-amber-500/30 shrink-0">
              FB RTDB
            </span>
          ) : data.source_system === 'relational' || data.source_system === 'postgres' ? (
            <span className="text-[7.5px] font-mono font-bold uppercase px-1 py-[1.5px] rounded border bg-purple-500/10 text-purple-300 border-purple-500/30 shrink-0">
              PG
            </span>
          ) : null}
          {isSynthetic && (
            <span className="flex items-center gap-0.5 text-[8px] font-mono font-bold uppercase px-1.5 py-[2px] rounded border bg-amber-500/15 text-amber-300 border-amber-500/40 shrink-0">
              <FlaskConical className="w-2.5 h-2.5" />
              TEST
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[8px] font-mono text-slate-400 font-semibold">
            {confidencePct}%
          </span>
          <span className={`w-[5px] h-[5px] rounded-full ${config.dot} ${isHighlighted ? 'animate-pulse' : ''}`} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-start gap-2.5">
        <div className={`p-1.5 rounded-md border ${config.iconBg} ${config.iconColor} shrink-0 mt-0.5`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[11px] font-semibold text-slate-100 leading-snug truncate font-sans">
            {data.label}
          </h4>
          <p className="text-[9px] font-mono text-slate-400 mt-0.5 truncate tracking-tight">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
