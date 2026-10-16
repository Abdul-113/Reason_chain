import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  ChevronDown,
  ShieldCheck,
  Database,
  GitBranch,
  Search as SearchIcon,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Activity,
  ExternalLink,
  Cpu,
  Network,
  Layers,
  FileCheck,
  BookOpen,
  PieChart,
  LogOut,
  ArrowRight,
  Plus,
  LayoutDashboard,
  Server,
  Sparkles
} from 'lucide-react';

import KnowledgeGraphPanel from './graph/KnowledgeGraphPanel';
import Neo4jGraphViewer from './graph/Neo4jGraphViewer';
import InvestigateView from './InvestigateView';
import ProofsView from './ProofsView';
import DataSourcesView from './DataSourcesView';
import EntitiesView from './EntitiesView';
import RulesView from './RulesView';
import AnalyticsView from './AnalyticsView';
import AuditLogView from './AuditLogView';
import KnowledgeGraphBuilder from './KnowledgeGraphBuilder';

import {
  mockInvestigations,
  mockDataSources,
  mockAuditLogs
} from '../data/mockData';

interface DashboardViewProps {
  onLogout?: () => void;
  activeNavTab?: string;
  setActiveNavTab?: (tab: string) => void;
}

// ==========================================
// COUNT UP HOOK
// ==========================================
function useCountUp(target: number, duration = 1800, startDelay = 200) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [target, duration, startDelay]);

  return count;
}

// ==========================================
// ANIMATED DONUT CHART COMPONENT
// ==========================================
function RiskDonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  let cumulativePercent = 0;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
        {data.map((item, i) => {
          const percent = item.value / total;
          const strokeDasharray = `${percent * 283} 283`;
          const strokeDashoffset = -cumulativePercent * 283;
          cumulativePercent += percent;

          return (
            <motion.circle
              key={item.label}
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              stroke={item.color}
              strokeWidth="10"
              strokeDasharray={strokeDasharray}
              initial={{ strokeDashoffset: 283 }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, delay: i * 0.2, ease: "easeOut" }}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none font-mono">
        <span className="text-xl font-bold text-slate-100">{total}</span>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Entities</span>
      </div>
    </div>
  );
}

// ==========================================
// SPARKLINE CHART COMPONENT
// ==========================================
function SparklineChart({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 110;
  const height = 28;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      />
    </svg>
  );
}

// ==========================================
// MAIN REASONCHAIN WORKSPACE / OVERVIEW
// ==========================================
export default function DashboardView({ onLogout, activeNavTab: externalTab, setActiveNavTab: setExternalTab }: DashboardViewProps) {
  const [internalTab, setInternalTab] = useState('Overview');
  const activeTab = externalTab || internalTab;
  const setActiveTab = setExternalTab || setInternalTab;
  const [graphInitialSource, setGraphInitialSource] = useState<string>('all');

  const [selectedInvestigation, setSelectedInvestigation] = useState<any | null>(null);

  // Live Intelligence graph animation state
  const [graphStep, setGraphStep] = useState(0);
  const [isGraphPlaying, setIsGraphPlaying] = useState(true);

  // Animated KPI numbers
  const entitiesCount = useCountUp(24892);
  const relationsCount = useCountUp(81204);
  const investigationsCount = useCountUp(1248);
  const highRiskCount = useCountUp(37);

  // Overview Live Activity Feed (System-wide non-investigation summary events)
  const overviewLiveEvents = [
    { time: '10:42:15', text: 'Nova Holdings ownership relationship updated', color: 'text-cyan-400' },
    { time: '10:39:10', text: 'Supplier risk score changed (ABC Industrial)', color: 'text-amber-400' },
    { time: '10:36:04', text: 'New corporate registry entity resolved (Vertex Global)', color: 'text-emerald-400' },
    { time: '10:31:00', text: 'Rule AML-04 triggered for high risk path', color: 'text-red-400' },
    { time: '10:27:18', text: 'Data source synchronization completed (PostgreSQL ERP)', color: 'text-purple-400' }
  ];

  const riskDistribution = [
    { label: 'High', value: 37, color: '#ef4444' },
    { label: 'Medium', value: 56, color: '#f59e0b' },
    { label: 'Low', value: 152, color: '#10b981' },
    { label: 'Info', value: 213, color: '#06b6d4' }
  ];

  const trendingRisks = [
    { title: 'Sanction Exposure', value: '+14%', count: 37, data: [12, 18, 15, 22, 28, 37], color: '#ef4444' },
    { title: 'Shell Companies', value: '+8%', count: 56, data: [40, 42, 45, 48, 52, 56], color: '#f59e0b' },
    { title: 'Ownership Conflicts', value: '-3%', count: 89, data: [98, 95, 92, 90, 89, 89], color: '#06b6d4' },
    { title: 'High-Risk Suppliers', value: '+5%', count: 124, data: [110, 112, 115, 118, 120, 124], color: '#10b981' }
  ];

  const sidebarLinks = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'KG Builder', icon: Sparkles },
    { name: 'Knowledge Graph', icon: Network },
    { name: 'Data Sources', icon: Server },
    { name: 'Investigate', icon: Cpu },
    { name: 'Entities', icon: Layers },
    { name: 'Proofs', icon: FileCheck },
    { name: 'Rules', icon: ShieldCheck },
    { name: 'Analytics', icon: PieChart },
    { name: 'Audit Log', icon: BookOpen }
  ];

  return (
    <div className="flex min-h-screen bg-[#050a0f] text-slate-100 font-sans">
      
      {/* AUTHENTICATED SIDEBAR */}
      <aside className="w-64 bg-[#03070f] border-r border-[#0e1c2e] flex flex-col justify-between shrink-0 sticky top-0 h-screen z-30">
        <div>
          {/* Logo & Workspace Brand */}
          <div className="p-5 border-b border-[#0e1c2e] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-cyan-500/30 bg-[#08152b] flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                <span className="font-mono text-xs font-black text-cyan-400">RC</span>
              </div>
              <div>
                <div className="font-sans text-xs font-bold text-slate-100 uppercase tracking-widest">ReasonChain</div>
                <div className="text-[9px] font-mono text-cyan-400">ENTERPRISE OS</div>
              </div>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="px-4 py-3 border-b border-[#0e1c2e] bg-[#02050a]/60">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">Active Workspace</div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-200">
              <span className="font-bold truncate">Acme Manufacturing</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 font-mono text-xs">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.name;
              return (
                <button
                  key={link.name}
                  onClick={() => setActiveTab(link.name)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-all ${
                    isActive
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-[#081528]/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span>{link.name}</span>
                  </div>
                  {link.name === 'Investigate' && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                  {link.name === 'Proofs' && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">3</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-[#0e1c2e] bg-[#02050a] flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white text-xs">
              AR
            </div>
            <div>
              <div className="text-slate-200 font-semibold leading-none">Alex Morgan</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Lead Investigator</div>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* MAIN WORKSPACE CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOP WORKSPACE HEADER */}
        <header className="sticky top-0 z-20 bg-[#050a0f]/90 backdrop-blur-md border-b border-[#0e1c2e] px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold font-mono text-slate-200 uppercase tracking-wider">{activeTab}</h2>
            <span className="text-slate-600 font-mono">/</span>
            <span className="text-xs font-mono text-slate-500">Command Center</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Global Search */}
            <div className="relative w-80 hidden md:block">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search entities, directors, or queries..."
                className="w-full bg-[#03070f] border border-[#0e1c2e] focus:border-cyan-500/50 rounded-md pl-8 pr-4 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-600 border border-slate-800 rounded px-1">⌘K</span>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              All systems operational
            </div>

            <button className="p-2 rounded bg-[#03070f] border border-[#0e1c2e] text-slate-400 hover:text-slate-200 transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400" />
            </button>
          </div>
        </header>

        {/* FEATURE SEPARATION: SWITCH CONTENT BASED ON ACTIVE SIDEBAR TAB */}
        <main className={`flex-1 ${activeTab === 'Knowledge Graph' ? 'p-4 flex flex-col min-h-0 overflow-hidden' : 'p-8 space-y-8'}`}>
          {activeTab === 'KG Builder' ? (
            <KnowledgeGraphBuilder
              onNavigateToExplorer={() => setActiveTab('Knowledge Graph')}
              onNavigateToDataSources={() => setActiveTab('Data Sources')}
            />
          ) : activeTab === 'Investigate' ? (
            <InvestigateView
              onNavigateToGraph={() => setActiveTab('Knowledge Graph')}
              onNavigateToProofs={() => setActiveTab('Proofs')}
            />
          ) : activeTab === 'Data Sources' ? (
            <DataSourcesView
              onNavigateToGraph={(source) => {
                if (source) setGraphInitialSource(source);
                setActiveTab('Knowledge Graph');
              }}
              onNavigateToBuilder={() => setActiveTab('KG Builder')}
            />
          ) : activeTab === 'Entities' ? (
            <EntitiesView />
          ) : activeTab === 'Proofs' ? (
            <ProofsView />
          ) : activeTab === 'Rules' ? (
            <RulesView />
          ) : activeTab === 'Analytics' ? (
            <AnalyticsView />
          ) : activeTab === 'Audit Log' ? (
            <AuditLogView />
          ) : activeTab === 'Knowledge Graph' ? (
            <Neo4jGraphViewer initialSource={graphInitialSource} />
          ) : (
            /* OVERVIEW TAB: HIGH-LEVEL ENTERPRISE COMMAND CENTER */
            <>
              {/* TOP WELCOME BAR */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#0e1c2e] pb-6">
                <div>
                  <h1 className="text-2xl font-bold font-sans text-slate-100">Good morning, Alex</h1>
                  <p className="text-xs text-slate-400 font-mono mt-1">Enterprise reasoning overview and live relationship activity command center.</p>
                </div>
                <button
                  onClick={() => setActiveTab('Investigate')}
                  className="px-5 py-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start Investigation</span>
                </button>
              </div>

              {/* 1. OVERALL KPIS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-mono mb-2">
                    <span className="uppercase tracking-wider">Entities</span>
                    <Database className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{entitiesCount.toLocaleString()}</div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +256 added this week
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-mono mb-2">
                    <span className="uppercase tracking-wider">Relationships</span>
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{relationsCount.toLocaleString()}</div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +1,102 verified links
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-mono mb-2">
                    <span className="uppercase tracking-wider">Investigations</span>
                    <SearchIcon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{investigationsCount.toLocaleString()}</div>
                  <div className="text-[10px] font-mono text-cyan-400 mt-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> 18 active today
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="p-4 rounded-lg bg-[#040810]/80 border border-red-500/20 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-mono mb-2">
                    <span className="uppercase tracking-wider text-red-400/80">High Risk Entities</span>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-red-400">{highRiskCount}</div>
                  <div className="text-[10px] font-mono text-red-400/80 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Requires immediate action
                  </div>
                </motion.div>
              </div>

              {/* 2. MAIN CONTENT ROW: LIVE INTELLIGENCE GRAPH (LEFT) & RECENT INVESTIGATIONS (RIGHT) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* LEFT / LARGE: LIVE INTELLIGENCE */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="lg:col-span-7 bg-[#040810]/80 border border-[#0e1c2e] rounded-lg p-5 flex flex-col justify-between relative overflow-hidden min-h-[460px]"
                >
                  <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3 mb-3">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="font-bold text-slate-100 uppercase tracking-widest">LIVE INTELLIGENCE</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400 text-[10px]">Relationship Activity</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
                      <span>24,892 Entities</span>
                      <span>81,204 Links</span>
                      <span className="text-red-400 font-bold">37 High Risk</span>
                    </div>
                  </div>

                  <div className="flex-1 rounded border border-[#0e1c2e] bg-[#02050a] relative overflow-hidden min-h-[260px] my-2">
                    <KnowledgeGraphPanel
                      activeStep={graphStep}
                      setActiveStep={setGraphStep}
                      isPlaying={isGraphPlaying}
                      setIsPlaying={setIsGraphPlaying}
                    />
                  </div>

                  <div className="mt-2 space-y-1.5 font-mono text-[10px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-cyan-400" /> Recent Relationship Events
                    </div>
                    {overviewLiveEvents.map((log, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded bg-[#02050a] border border-[#0e1c2e]/60">
                        <span className="text-slate-600 shrink-0">{log.time}</span>
                        <span className={`font-semibold truncate ${log.color}`}>{log.text}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* RIGHT / SMALL: RECENT INVESTIGATIONS */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="lg:col-span-5 bg-[#040810]/80 border border-[#0e1c2e] rounded-lg p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3 mb-4 font-mono">
                      <div>
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Recent Investigations</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Active multi-hop queries</p>
                      </div>
                      <button 
                        onClick={() => setActiveTab('Investigate')}
                        className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        View All <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-2.5 font-mono text-xs">
                      {mockInvestigations.map((inv) => (
                        <div
                          key={inv.id}
                          onClick={() => setSelectedInvestigation(inv)}
                          className="p-3 rounded bg-[#02050a] border border-[#0e1c2e] hover:border-cyan-500/40 cursor-pointer transition-all space-y-1.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors text-xs">{inv.title}</span>
                            <span className={`text-[9px] font-bold ${
                              inv.risk === 'Critical' || inv.risk === 'High' ? 'text-red-400' : 'text-amber-400'
                            }`}>
                              {inv.risk}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{inv.id}</span>
                            <span className="text-emerald-400">{inv.confidence}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#0e1c2e] mt-4 font-mono">
                    <button
                      onClick={() => setActiveTab('Investigate')}
                      className="w-full py-2 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>New Query Investigation</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>

              </div>

              {/* 3. BOTTOM ROW: RISK DISTRIBUTION & DATA SOURCE HEALTH */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]"
                >
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Risk Distribution</h3>
                  <div className="flex items-center justify-between gap-2">
                    <RiskDonutChart data={riskDistribution} />
                    <div className="space-y-1.5 flex-1 text-xs">
                      {riskDistribution.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
                            <span className="text-slate-400">{item.label}</span>
                          </div>
                          <span className="font-bold text-slate-200">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">System Events</h3>
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  </div>
                  <div className="space-y-2 text-xs">
                    {mockAuditLogs.slice(0, 3).map((log) => (
                      <div key={log.id} className="p-2 rounded bg-[#02050a] border border-[#0e1c2e]/50 space-y-0.5">
                        <div className="text-slate-200 font-semibold text-[11px]">{log.action}</div>
                        <div className="text-[9px] text-slate-500">{log.object}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.7 }}
                  className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]"
                >
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Data Source Health</h3>
                  <div className="space-y-2 text-xs">
                    {mockDataSources.slice(0, 3).map((ds) => (
                      <div key={ds.id} className="p-2 rounded bg-[#02050a] border border-[#0e1c2e]/50 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-200 font-semibold text-[11px]">{ds.name}</span>
                          <span className="text-[9px] font-bold text-emerald-400">{ds.status}</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500">
                          <span>{ds.recordCount.toLocaleString()} records</span>
                          <span>{ds.lastSync}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* TRENDING SPARKLINE STRIP */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="pt-2 font-mono"
              >
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trending Risk Categories</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {trendingRisks.map((trend) => (
                    <div key={trend.title} className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">{trend.title}</div>
                        <div className="text-xl font-bold text-slate-100 mt-1">{trend.count}</div>
                        <div className={`text-[10px] mt-0.5 ${trend.value.startsWith('+') ? 'text-red-400' : 'text-emerald-400'}`}>
                          {trend.value} this month
                        </div>
                      </div>
                      <SparklineChart data={trend.data} color={trend.color} />
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </main>
      </div>

      {/* INVESTIGATION DETAIL MODAL OVERLAY */}
      <AnimatePresence>
        {selectedInvestigation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#050d1a] border border-cyan-500/30 rounded-lg max-w-xl w-full p-6 space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setSelectedInvestigation(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
              >
                [ESC]
              </button>

              <div className="flex items-center gap-2 text-cyan-400 text-xs">
                <SearchIcon className="w-4 h-4" />
                <span>{selectedInvestigation.id}</span>
              </div>

              <h2 className="text-lg font-bold font-sans text-slate-100">{selectedInvestigation.title}</h2>

              <div className="grid grid-cols-2 gap-4 p-4 rounded bg-[#02050a] border border-[#0e1c2e] text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Question</span>
                  <span className="text-slate-200 font-semibold">{selectedInvestigation.question}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Status</span>
                  <span className="text-emerald-400 font-semibold">{selectedInvestigation.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Risk Level</span>
                  <span className="text-red-400 font-bold">{selectedInvestigation.risk}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Confidence</span>
                  <span className="text-cyan-400 font-semibold">{selectedInvestigation.confidence}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setSelectedInvestigation(null)}
                  className="px-4 py-2 rounded text-xs text-slate-400 border border-[#0e1c2e]"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setSelectedInvestigation(null);
                    setActiveTab('Investigate');
                  }}
                  className="px-4 py-2 rounded text-xs font-bold bg-cyan-500 text-slate-950 flex items-center gap-1.5"
                >
                  Open Full Investigation <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
