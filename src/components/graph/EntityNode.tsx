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
  Building,
  ShieldAlert,
} from 'lucide-react';

// ==========================================
// CANONICAL ENTITY NODE FOR REASONCHAIN
// Clean, readable, enterprise investigation cards
// Strict visual hierarchy: Focus, Risk, Semantic Types
// ==========================================

export type EntityNodeData = {
  label: string;
  entityType:
    | 'Supplier'
    | 'Company'
    | 'Person'
    | 'Contract'
    | 'Sanction'
    | 'ExternalCompany'
    | 'external_company'
    | 'Country'
    | 'Account'
    | 'Transaction'
    | 'Director'
    | 'Device'
    | 'Rule'
    | string;
  details?: string;
  status?: string;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  isActive?: boolean;
  isFocal?: boolean;
  isDimmed?: boolean;
  isHighlightedPath?: boolean;
  is_synthetic?: boolean;
  confidence?: number;
  source_system?: string;
  important_identifier?: string;
  stepNumber?: number;
  hopDistance?: number;
  properties?: Record<string, any>;
};

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

const NODE_CONFIG: Record<string, {
  border: string;
  bg: string;
  badge: string;
  badgeText: string;
  dot: string;
  glow: string;
  iconBg: string;
  iconColor: string;
  icon: any;
}> = {
  Company: {
    border: 'border-blue-500/40 hover:border-blue-400',
    bg: 'bg-[#040a18]/95',
    badge: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
    badgeText: 'Company',
    dot: 'bg-blue-400',
    glow: '0 0 25px rgba(59,130,246,0.3)',
    iconBg: 'bg-blue-500/15 border-blue-500/30',
    iconColor: 'text-blue-400',
    icon: Layers,
  },
  Person: {
    border: 'border-purple-500/40 hover:border-purple-400',
    bg: 'bg-[#0f071a]/95',
    badge: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
    badgeText: 'Director',
    dot: 'bg-purple-400',
    glow: '0 0 25px rgba(168,85,247,0.3)',
    iconBg: 'bg-purple-500/15 border-purple-500/30',
    iconColor: 'text-purple-400',
    icon: Users,
  },
  Director: {
    border: 'border-purple-500/40 hover:border-purple-400',
    bg: 'bg-[#0f071a]/95',
    badge: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
    badgeText: 'Director',
    dot: 'bg-purple-400',
    glow: '0 0 25px rgba(168,85,247,0.3)',
    iconBg: 'bg-purple-500/15 border-purple-500/30',
    iconColor: 'text-purple-400',
    icon: Users,
  },
  Supplier: {
    border: 'border-amber-500/40 hover:border-amber-400',
    bg: 'bg-[#120c04]/95',
    badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    badgeText: 'Supplier',
    dot: 'bg-amber-400',
    glow: '0 0 25px rgba(245,158,11,0.3)',
    iconBg: 'bg-amber-500/15 border-amber-500/30',
    iconColor: 'text-amber-400',
    icon: Building2,
  },
  Contract: {
    border: 'border-emerald-500/40 hover:border-emerald-400',
    bg: 'bg-[#031109]/95',
    badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    badgeText: 'Contract',
    dot: 'bg-emerald-400',
    glow: '0 0 25px rgba(16,185,129,0.3)',
    iconBg: 'bg-emerald-500/15 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    icon: FileText,
  },
  ExternalCompany: {
    border: 'border-indigo-500/40 hover:border-indigo-400',
    bg: 'bg-[#06081c]/95',
    badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    badgeText: 'External Co',
    dot: 'bg-indigo-400',
    glow: '0 0 25px rgba(99,102,241,0.3)',
    iconBg: 'bg-indigo-500/15 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    icon: Building,
  },
  external_company: {
    border: 'border-indigo-500/40 hover:border-indigo-400',
    bg: 'bg-[#06081c]/95',
    badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    badgeText: 'External Co',
    dot: 'bg-indigo-400',
    glow: '0 0 25px rgba(99,102,241,0.3)',
    iconBg: 'bg-indigo-500/15 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    icon: Building,
  },
  Sanction: {
    border: 'border-red-500/50 hover:border-red-400',
    bg: 'bg-[#180407]/95',
    badge: 'bg-red-500/20 border-red-500/40 text-red-300',
    badgeText: 'Sanction',
    dot: 'bg-red-400',
    glow: '0 0 28px rgba(239,68,68,0.35)',
    iconBg: 'bg-red-500/20 border-red-500/40',
    iconColor: 'text-red-400',
    icon: AlertTriangle,
  },
  Country: {
    border: 'border-teal-500/40 hover:border-teal-400',
    bg: 'bg-[#020e0e]/95',
    badge: 'bg-teal-500/15 border-teal-500/30 text-teal-300',
    badgeText: 'Country',
    dot: 'bg-teal-400',
    glow: '0 0 25px rgba(20,184,166,0.3)',
    iconBg: 'bg-teal-500/15 border-teal-500/30',
    iconColor: 'text-teal-400',
    icon: Globe,
  },
  Account: {
    border: 'border-indigo-500/40 hover:border-indigo-400',
    bg: 'bg-[#060517]/95',
    badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    badgeText: 'Account',
    dot: 'bg-indigo-400',
    glow: '0 0 25px rgba(99,102,241,0.3)',
    iconBg: 'bg-indigo-500/15 border-indigo-500/30',
    iconColor: 'text-indigo-400',
    icon: Wallet,
  },
  Transaction: {
    border: 'border-emerald-500/40 hover:border-emerald-400',
    bg: 'bg-[#020e09]/95',
    badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    badgeText: 'Transaction',
    dot: 'bg-emerald-400',
    glow: '0 0 25px rgba(16,185,129,0.3)',
    iconBg: 'bg-emerald-500/15 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    icon: ArrowLeftRight,
  },
  Device: {
    border: 'border-sky-500/40 hover:border-sky-400',
    bg: 'bg-[#030b17]/95',
    badge: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
    badgeText: 'Device',
    dot: 'bg-sky-400',
    glow: '0 0 25px rgba(14,165,233,0.3)',
    iconBg: 'bg-sky-500/15 border-sky-500/30',
    iconColor: 'text-sky-400',
    icon: Cpu,
  },
  Rule: {
    border: 'border-violet-500/40 hover:border-violet-400',
    bg: 'bg-[#0d041a]/95',
    badge: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
    badgeText: 'Rule',
    dot: 'bg-violet-400',
    glow: '0 0 25px rgba(139,92,246,0.3)',
    iconBg: 'bg-violet-500/15 border-violet-500/30',
    iconColor: 'text-violet-400',
    icon: ShieldCheck,
  },
};

export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const normType = data.entityType === 'external_company' ? 'ExternalCompany' : data.entityType;
  const config = NODE_CONFIG[normType] || NODE_CONFIG['Company'];
  const Icon = config.icon;
  const isSelected = Boolean(data.isActive);
  const isFocal = Boolean(data.isFocal);
  const isDimmed = Boolean(data.isDimmed);
  const isHighlightedPath = Boolean(data.isHighlightedPath);

  // Risk parsing
  const riskRaw = (data.risk || data.properties?.risk_level || (normType === 'Sanction' ? 'CRITICAL' : 'LOW')).toUpperCase();
  const isCriticalRisk = riskRaw === 'CRITICAL';
  const isHighRisk = riskRaw === 'HIGH';
  const isMediumRisk = riskRaw === 'MEDIUM';

  const identifier =
    data.important_identifier ||
    data.properties?.cin ||
    data.properties?.din ||
    data.properties?.contract_number ||
    data.properties?.pan ||
    data.details ||
    (data.properties?.status ? `Status: ${data.properties.status}` : null);

  const confidencePct = data.confidence !== undefined
    ? Math.round(data.confidence * 100)
    : data.properties?.entity_confidence !== undefined
      ? Math.round(data.properties.entity_confidence * 100)
      : 95;

  return (
    <div
      className={`
        relative rounded-xl border ${config.border} ${config.bg}
        w-[224px] p-3 select-none cursor-pointer backdrop-blur-md
        transition-all duration-200 shadow-lg group
        ${isDimmed ? 'opacity-25 filter blur-[0.3px]' : 'opacity-100'}
        ${isHighlightedPath ? 'ring-2 ring-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)] z-30 scale-[1.04]' : ''}
        ${isFocal ? 'ring-2 ring-cyan-400 scale-[1.05] shadow-[0_0_30px_rgba(6,182,212,0.35)] z-30' : ''}
        ${isSelected && !isFocal ? 'ring-2 ring-blue-400 scale-[1.03] shadow-blue-500/20 shadow-2xl z-20' : ''}
        ${!isFocal && !isSelected ? 'hover:scale-[1.02] hover:shadow-xl' : ''}
        ${isCriticalRisk ? 'border-red-500/80' : ''}
      `}
      style={{
        boxShadow: isFocal ? '0 0 30px rgba(6,182,212,0.35)' : isSelected ? config.glow : undefined,
      }}
      title={`${data.label} (${config.badgeText})`}
    >
      {/* Universal Handles on all 4 sides */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-left-[4px] !opacity-40 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-right-[4px] !opacity-40 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-bottom-[4px] !opacity-40 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-slate-400 !w-1.5 !h-1.5 !border-0 !-top-[4px] !opacity-40 group-hover:!opacity-100 transition-opacity"
      />

      {/* Top Header: Entity Type Badge + Focus Indicator / Risk Badge */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.badge}`}>
            {config.badgeText}
          </span>
          {isFocal && (
            <span className="text-[8.5px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950">
              FOCUS
            </span>
          )}
        </div>

        {/* Risk / Step Indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {data.stepNumber !== undefined ? (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              Hop #{data.stepNumber}
            </span>
          ) : isCriticalRisk ? (
            <span className="flex items-center gap-1 text-[8.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
              <ShieldAlert className="w-2.5 h-2.5 text-red-400" />
              CRITICAL
            </span>
          ) : isHighRisk ? (
            <span className="text-[8.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40">
              HIGH
            </span>
          ) : isMediumRisk ? (
            <span className="text-[8.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              MED
            </span>
          ) : (
            <span className="text-[9px] font-mono text-slate-500 font-semibold">
              {confidencePct}%
            </span>
          )}
          <span className={`w-2 h-2 rounded-full ${isCriticalRisk ? 'bg-red-400 animate-pulse' : config.dot} ${isSelected ? 'animate-pulse' : ''}`} />
        </div>
      </div>

      {/* Middle Row: Icon & Entity Name */}
      <div className="flex items-start gap-2.5">
        <div className={`p-2 rounded-lg border ${config.iconBg} ${config.iconColor} shrink-0 mt-0.5`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[12px] font-semibold text-slate-100 leading-snug line-clamp-2 font-sans">
            {data.label}
          </h4>
          {identifier && (
            <p className="text-[10px] font-mono text-slate-400 mt-1 truncate tracking-tight">
              {identifier}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
