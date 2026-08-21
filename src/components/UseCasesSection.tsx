import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ShieldAlert,
  GitBranch,
  UserX,
  ClipboardCheck,
  FileText,
  Network
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ==========================================
// USE CASES SECTION
// "Built for questions simple search cannot
//  answer."
// Six enterprise investigation module cards
// with mini relationship traces inside.
// ==========================================

/* ---------- Mini graph components --------- */

function SupplierRiskGraph() {
  return (
    <svg viewBox="0 0 220 56" className="w-full h-14 mt-3" xmlns="http://www.w3.org/2000/svg">
      {/* Connections */}
      <line x1="38" y1="28" x2="87" y2="28" stroke="#10b981" strokeWidth="1.2" opacity="0.5" />
      <line x1="133" y1="28" x2="182" y2="28" stroke="#ef4444" strokeWidth="1.2" opacity="0.5" strokeDasharray="3 2" />
      {/* Traveling dot on first edge */}
      <circle r="2" fill="#10b981" opacity="0.7">
        <animateMotion dur="2s" repeatCount="indefinite" path="M 38 28 L 87 28" />
      </circle>
      {/* Node 1 - Supplier */}
      <rect x="8" y="16" width="30" height="24" rx="3" fill="#06151f" stroke="#0e1c2e" strokeWidth="1" />
      <text x="23" y="31" fontSize="7" fill="#64748b" textAnchor="middle" fontFamily="monospace">SUP</text>
      {/* Node 2 - Company */}
      <rect x="90" y="16" width="40" height="24" rx="3" fill="#06151f" stroke="#10b981" strokeWidth="1" opacity="0.6" />
      <text x="110" y="31" fontSize="7" fill="#10b981" textAnchor="middle" fontFamily="monospace">CORP</text>
      {/* Node 3 - Sanctions (risk) */}
      <rect x="185" y="16" width="28" height="24" rx="3" fill="#0f0406" stroke="#ef4444" strokeWidth="1" opacity="0.6" />
      <text x="199" y="31" fontSize="7" fill="#ef4444" textAnchor="middle" fontFamily="monospace">⚠</text>
      {/* Labels */}
      <text x="63" y="50" fontSize="6" fill="#334155" textAnchor="middle" fontFamily="monospace">supplies</text>
      <text x="158" y="50" fontSize="6" fill="#7f1d1d" textAnchor="middle" fontFamily="monospace">listed</text>
    </svg>
  );
}

function OwnershipGraph() {
  return (
    <svg viewBox="0 0 220 72" className="w-full h-[72px] mt-3" xmlns="http://www.w3.org/2000/svg">
      {/* Connections */}
      <line x1="110" y1="18" x2="55" y2="42" stroke="#06b6d4" strokeWidth="1" opacity="0.4" />
      <line x1="110" y1="18" x2="165" y2="42" stroke="#06b6d4" strokeWidth="1" opacity="0.4" />
      <line x1="165" y1="42" x2="165" y2="62" stroke="#f59e0b" strokeWidth="1" opacity="0.4" strokeDasharray="3 2" />
      <line x1="55" y1="42" x2="55" y2="62" stroke="#06b6d4" strokeWidth="1" opacity="0.3" />
      {/* Traveling dot */}
      <circle r="1.5" fill="#06b6d4" opacity="0.6">
        <animateMotion dur="2.5s" repeatCount="indefinite" path="M 110 18 L 165 42 L 165 62" />
      </circle>
      {/* Parent entity */}
      <circle cx="110" cy="14" r="7" fill="#06151f" stroke="#06b6d4" strokeWidth="1" opacity="0.7" />
      <text x="110" y="17" fontSize="5.5" fill="#06b6d4" textAnchor="middle" fontFamily="monospace">H</text>
      {/* Child 1 */}
      <circle cx="55" cy="42" r="6" fill="#06151f" stroke="#0e1c2e" strokeWidth="1" />
      <text x="55" y="45" fontSize="5" fill="#64748b" textAnchor="middle" fontFamily="monospace">S1</text>
      {/* Child 2 */}
      <circle cx="165" cy="42" r="6" fill="#06151f" stroke="#f59e0b" strokeWidth="1" opacity="0.7" />
      <text x="165" y="45" fontSize="5" fill="#f59e0b" textAnchor="middle" fontFamily="monospace">S2</text>
      {/* Grandchild — discovered */}
      <circle cx="165" cy="64" r="5" fill="#0f0c04" stroke="#f59e0b" strokeWidth="1" opacity="0.5" />
      <text x="165" y="67" fontSize="4.5" fill="#f59e0b" textAnchor="middle" fontFamily="monospace">?</text>
      <circle cx="55" cy="64" r="5" fill="#06151f" stroke="#0e1c2e" strokeWidth="1" />
      <text x="55" y="67" fontSize="4.5" fill="#64748b" textAnchor="middle" fontFamily="monospace">S3</text>
      {/* Labels */}
      <text x="78" y="26" fontSize="5" fill="#334155" fontFamily="monospace">owns</text>
      <text x="140" y="26" fontSize="5" fill="#334155" fontFamily="monospace">owns</text>
      <text x="178" y="55" fontSize="5" fill="#92400e" fontFamily="monospace">beneficial?</text>
    </svg>
  );
}

function ConflictGraph() {
  return (
    <svg viewBox="0 0 220 56" className="w-full h-14 mt-3" xmlns="http://www.w3.org/2000/svg">
      {/* Group A connections */}
      <line x1="35" y1="18" x2="65" y2="38" stroke="#0e1c2e" strokeWidth="1" />
      <line x1="35" y1="38" x2="65" y2="38" stroke="#0e1c2e" strokeWidth="1" />
      {/* Group B connections */}
      <line x1="155" y1="18" x2="185" y2="38" stroke="#0e1c2e" strokeWidth="1" />
      <line x1="155" y1="38" x2="185" y2="38" stroke="#0e1c2e" strokeWidth="1" />
      {/* Hidden connection — amber dashed */}
      <line x1="68" y1="38" x2="152" y2="38" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6" />
      {/* Traveling alert dot */}
      <circle r="2" fill="#f59e0b" opacity="0.7">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M 68 38 L 152 38" />
      </circle>
      {/* Group A nodes */}
      <circle cx="35" cy="16" r="5.5" fill="#06151f" stroke="#06b6d4" strokeWidth="0.8" opacity="0.5" />
      <circle cx="35" cy="38" r="5.5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="65" cy="38" r="6" fill="#06151f" stroke="#06b6d4" strokeWidth="1" opacity="0.7" />
      <text x="65" y="41" fontSize="5" fill="#06b6d4" textAnchor="middle" fontFamily="monospace">P1</text>
      {/* Group B nodes */}
      <circle cx="185" cy="16" r="5.5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" opacity="0.5" />
      <circle cx="185" cy="38" r="5.5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="155" cy="38" r="6" fill="#06151f" stroke="#f59e0b" strokeWidth="1" opacity="0.7" />
      <text x="155" y="41" fontSize="5" fill="#f59e0b" textAnchor="middle" fontFamily="monospace">P2</text>
      {/* Label */}
      <text x="110" y="32" fontSize="5.5" fill="#92400e" textAnchor="middle" fontFamily="monospace">hidden link</text>
    </svg>
  );
}

function NetworkGraph() {
  return (
    <svg viewBox="0 0 220 56" className="w-full h-14 mt-3" xmlns="http://www.w3.org/2000/svg">
      {/* Connections */}
      <line x1="110" y1="16" x2="55" y2="28" stroke="#06b6d4" strokeWidth="0.8" opacity="0.35" />
      <line x1="110" y1="16" x2="160" y2="22" stroke="#06b6d4" strokeWidth="0.8" opacity="0.35" />
      <line x1="110" y1="16" x2="90" y2="44" stroke="#06b6d4" strokeWidth="0.8" opacity="0.35" />
      <line x1="110" y1="16" x2="140" y2="42" stroke="#06b6d4" strokeWidth="0.8" opacity="0.35" />
      <line x1="55" y1="28" x2="40" y2="46" stroke="#0e1c2e" strokeWidth="0.8" />
      <line x1="55" y1="28" x2="90" y2="44" stroke="#0e1c2e" strokeWidth="0.8" />
      <line x1="160" y1="22" x2="140" y2="42" stroke="#0e1c2e" strokeWidth="0.8" />
      <line x1="160" y1="22" x2="190" y2="40" stroke="#0e1c2e" strokeWidth="0.8" />
      {/* Traveling dots */}
      <circle r="1.5" fill="#06b6d4" opacity="0.6">
        <animateMotion dur="3s" repeatCount="indefinite" path="M 110 16 L 55 28 L 40 46" />
      </circle>
      <circle r="1.5" fill="#06b6d4" opacity="0.5">
        <animateMotion dur="3.5s" repeatCount="indefinite" begin="1s" path="M 110 16 L 160 22 L 190 40" />
      </circle>
      {/* Hub */}
      <circle cx="110" cy="16" r="7" fill="#06151f" stroke="#06b6d4" strokeWidth="1" opacity="0.8" />
      <text x="110" y="19" fontSize="5.5" fill="#06b6d4" textAnchor="middle" fontFamily="monospace">HQ</text>
      {/* Outer nodes */}
      <circle cx="55" cy="28" r="5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="160" cy="22" r="5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="90" cy="44" r="4.5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="140" cy="42" r="4.5" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="40" cy="46" r="4" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
      <circle cx="190" cy="40" r="4" fill="#06151f" stroke="#0e1c2e" strokeWidth="0.8" />
    </svg>
  );
}

/* ---------- Compliance data rows ---------- */

function ComplianceRows() {
  const rows = [
    { rule: 'AML-04', entity: 'Supplier ABC', status: 'pass', color: '#10b981' },
    { rule: 'SEC-OWN', entity: 'Orion Trading', status: 'flag', color: '#f59e0b' },
    { rule: 'GDPR-7', entity: 'Data Corp EU', status: 'pass', color: '#10b981' },
  ];
  return (
    <div className="mt-3 space-y-[5px] font-mono text-[8px]">
      {rows.map((r) => (
        <div key={r.rule} className="flex items-center gap-2 px-2 py-[3px] rounded bg-[#030810]/60 border border-[#0e1c2e]/50">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
          <span className="text-slate-500 w-[46px] shrink-0">{r.rule}</span>
          <span className="text-slate-400 flex-1 truncate">{r.entity}</span>
          <span
            className="uppercase tracking-wider font-bold text-[7px]"
            style={{ color: r.color }}
          >
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Contract link rows ---------- */

function ContractRows() {
  const links = [
    { type: 'COMPANY', name: 'Acme Manufacturing', icon: '◆' },
    { type: 'SIGNATORY', name: 'Rahul Mehta', icon: '◇' },
    { type: 'OBLIGATION', name: 'Annual Audit §4.2', icon: '▸' },
  ];
  return (
    <div className="mt-3 space-y-[5px] font-mono text-[8px]">
      {links.map((l) => (
        <div key={l.name} className="flex items-center gap-2 px-2 py-[3px] rounded bg-[#030810]/60 border border-[#0e1c2e]/50">
          <span className="text-cyan-500/50 text-[7px]">{l.icon}</span>
          <span className="text-slate-600 w-[58px] shrink-0 uppercase tracking-wider text-[7px]">{l.type}</span>
          <span className="text-slate-400 flex-1 truncate">{l.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Card data ---------- */

interface UseCase {
  icon: LucideIcon;
  tag: string;
  title: string;
  description: string;
  accent: 'red' | 'cyan' | 'amber' | 'emerald' | 'blue';
  visual: 'supplier-risk' | 'ownership' | 'conflict' | 'compliance' | 'contract' | 'network';
}

const USE_CASES: UseCase[] = [
  {
    icon: ShieldAlert,
    tag: 'Risk Intelligence',
    title: 'Supplier Risk',
    description: 'Identify suppliers connected to risky or sanctioned entities.',
    accent: 'red',
    visual: 'supplier-risk'
  },
  {
    icon: GitBranch,
    tag: 'Structural Analysis',
    title: 'Ownership Analysis',
    description: 'Discover complex ownership structures and beneficial relationships.',
    accent: 'cyan',
    visual: 'ownership'
  },
  {
    icon: UserX,
    tag: 'Relationship Detection',
    title: 'Conflict of Interest',
    description: 'Find hidden relationships between people and organizations.',
    accent: 'amber',
    visual: 'conflict'
  },
  {
    icon: ClipboardCheck,
    tag: 'Regulatory Tracking',
    title: 'Compliance Monitoring',
    description: 'Track important regulatory and corporate relationships.',
    accent: 'emerald',
    visual: 'compliance'
  },
  {
    icon: FileText,
    tag: 'Document Analysis',
    title: 'Contract Intelligence',
    description: 'Connect contracts with companies, people and obligations.',
    accent: 'blue',
    visual: 'contract'
  },
  {
    icon: Network,
    tag: 'Network Mapping',
    title: 'Corporate Network',
    description: 'Explore complex organizational relationships.',
    accent: 'cyan',
    visual: 'network'
  }
];

const ACCENT_MAP: Record<UseCase['accent'], {
  topBorder: string;
  tagBg: string;
  tagBorder: string;
  tagText: string;
  iconBg: string;
  iconBorder: string;
  iconText: string;
}> = {
  red: {
    topBorder: 'before:bg-red-500/40',
    tagBg: 'bg-red-500/6',
    tagBorder: 'border-red-500/15',
    tagText: 'text-red-400',
    iconBg: 'bg-red-500/6',
    iconBorder: 'border-red-500/15',
    iconText: 'text-red-400'
  },
  cyan: {
    topBorder: 'before:bg-cyan-500/40',
    tagBg: 'bg-cyan-500/6',
    tagBorder: 'border-cyan-500/15',
    tagText: 'text-cyan-400',
    iconBg: 'bg-cyan-500/6',
    iconBorder: 'border-cyan-500/15',
    iconText: 'text-cyan-400'
  },
  amber: {
    topBorder: 'before:bg-amber-500/40',
    tagBg: 'bg-amber-500/6',
    tagBorder: 'border-amber-500/15',
    tagText: 'text-amber-400',
    iconBg: 'bg-amber-500/6',
    iconBorder: 'border-amber-500/15',
    iconText: 'text-amber-400'
  },
  emerald: {
    topBorder: 'before:bg-emerald-500/40',
    tagBg: 'bg-emerald-500/6',
    tagBorder: 'border-emerald-500/15',
    tagText: 'text-emerald-400',
    iconBg: 'bg-emerald-500/6',
    iconBorder: 'border-emerald-500/15',
    iconText: 'text-emerald-400'
  },
  blue: {
    topBorder: 'before:bg-blue-500/40',
    tagBg: 'bg-blue-500/6',
    tagBorder: 'border-blue-500/15',
    tagText: 'text-blue-400',
    iconBg: 'bg-blue-500/6',
    iconBorder: 'border-blue-500/15',
    iconText: 'text-blue-400'
  }
};

/* ---------- Visual renderer ---------- */

function CardVisual({ type }: { type: UseCase['visual'] }) {
  switch (type) {
    case 'supplier-risk': return <SupplierRiskGraph />;
    case 'ownership': return <OwnershipGraph />;
    case 'conflict': return <ConflictGraph />;
    case 'compliance': return <ComplianceRows />;
    case 'contract': return <ContractRows />;
    case 'network': return <NetworkGraph />;
  }
}

/* ---------- Main section ---------- */

export default function UseCasesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-60px' });

  return (
    <section
      ref={sectionRef}
      id="use-cases"
      className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8 py-20 lg:py-28"
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-14 lg:mb-18"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#091929]/60 border border-cyan-500/15 mb-6">
          <span className="w-[5px] h-[5px] rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono text-cyan-400 tracking-[0.15em] uppercase font-bold">
            Use Cases
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold tracking-tight text-slate-100 leading-[1.15] max-w-2xl mx-auto">
          Built for questions simple search{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            cannot answer.
          </span>
        </h2>
        <p className="text-[14px] text-slate-500 mt-4 max-w-lg mx-auto leading-relaxed">
          ReasonChain is designed for complex enterprise investigations that require multi-hop reasoning across connected entities.
        </p>
      </motion.div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {USE_CASES.map((uc, i) => {
          const a = ACCENT_MAP[uc.accent];
          return (
            <motion.div
              key={uc.title}
              initial={{ opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.1, ease: 'easeOut' }}
              className={`
                group relative
                rounded-md border border-[#0e1c2e] bg-[#040810]/70
                p-5 flex flex-col
                transition-all duration-300
                hover:border-[#162a46] hover:-translate-y-[2px]
                before:absolute before:top-0 before:left-4 before:right-4
                before:h-px before:rounded-full ${a.topBorder}
              `}
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.015)' }}
            >
              {/* Header row: icon + tag */}
              <div className="flex items-center justify-between mb-4">
                <div className={`w-9 h-9 rounded-md border ${a.iconBorder} ${a.iconBg} flex items-center justify-center`}>
                  <uc.icon className={`w-[16px] h-[16px] ${a.iconText}`} strokeWidth={1.6} />
                </div>
                <span className={`text-[8px] font-mono font-bold uppercase tracking-[0.12em] px-2 py-[3px] rounded border ${a.tagBg} ${a.tagBorder} ${a.tagText}`}>
                  {uc.tag}
                </span>
              </div>

              {/* Title + Description */}
              <h3 className="text-[15px] font-bold text-slate-200 mb-1.5 group-hover:text-slate-100 transition-colors">
                {uc.title}
              </h3>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                {uc.description}
              </p>

              {/* Mini visual / graph */}
              <div className="mt-auto pt-2 border-t border-[#0e1c2e]/40" style={{ marginTop: 'auto' }}>
                <CardVisual type={uc.visual} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
