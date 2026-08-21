import { BarChart2 } from 'lucide-react';
import { mockAnalytics } from '../data/mockData';

export default function AnalyticsView() {
  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 mb-1">
            <BarChart2 className="w-3.5 h-3.5" /> SYSTEM TRENDS & AGGREGATED ANALYTICS
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Enterprise Reasoning Performance & Trends</h1>
          <p className="text-xs text-slate-400">System-level analytics on investigation volume, risk trends, rule execution, and network growth.</p>
        </div>
      </div>

      {/* METRICS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]">
          <div className="text-slate-500 text-xs uppercase mb-1">Success Rate</div>
          <div className="text-2xl font-bold text-emerald-400">{mockAnalytics.investigationSuccessRate}</div>
          <div className="text-[10px] text-slate-400 mt-1">1,102 of 1,248 completed</div>
        </div>

        <div className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]">
          <div className="text-slate-500 text-xs uppercase mb-1">Rule Executions</div>
          <div className="text-2xl font-bold text-cyan-400">{mockAnalytics.ruleExecutionsTotal}</div>
          <div className="text-[10px] text-slate-400 mt-1">Across 4 core symbolic rules</div>
        </div>

        <div className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]">
          <div className="text-slate-500 text-xs uppercase mb-1">Entity Growth</div>
          <div className="text-2xl font-bold text-slate-100">{mockAnalytics.monthlyGrowthEntities}</div>
          <div className="text-[10px] text-slate-400 mt-1">Monthly entity resolution</div>
        </div>

        <div className="p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]">
          <div className="text-slate-500 text-xs uppercase mb-1">Relationship Growth</div>
          <div className="text-2xl font-bold text-slate-100">{mockAnalytics.monthlyGrowthRelationships}</div>
          <div className="text-[10px] text-slate-400 mt-1">Multi-hop graph expansion</div>
        </div>
      </div>

      {/* ANALYTICS CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Risk Trend Bar Chart */}
        <div className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">30-Day Risk Identification Trends</h3>
          <div className="h-44 flex items-end justify-between gap-3 pt-6 px-2 border-b border-[#0e1c2e]">
            {mockAnalytics.riskTrendData.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center gap-1 h-32">
                  <div className="w-2 bg-red-500/80 rounded-t" style={{ height: `${d.high * 2}px` }} title={`High: ${d.high}`} />
                  <div className="w-2 bg-amber-500/80 rounded-t" style={{ height: `${d.medium * 1.5}px` }} title={`Medium: ${d.medium}`} />
                  <div className="w-2 bg-emerald-500/80 rounded-t" style={{ height: `${d.low * 0.6}px` }} title={`Low: ${d.low}`} />
                </div>
                <span className="text-[10px] text-slate-500">{d.date}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-6 text-[10px]">
            <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded bg-red-500" /> High Risk</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded bg-amber-500" /> Medium Risk</span>
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded bg-emerald-500" /> Low Risk</span>
          </div>
        </div>

        {/* Rule Execution Distribution */}
        <div className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Rule Execution Statistics</h3>
          <div className="space-y-3 font-mono text-xs pt-2">
            {mockAnalytics.ruleExecutionStats.map((r) => (
              <div key={r.ruleCode} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-bold">{r.ruleCode}</span>
                  <span className="text-cyan-400">{r.count} executions</span>
                </div>
                <div className="h-2 bg-[#02050a] rounded-full overflow-hidden border border-[#0e1c2e]">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(r.count / 500) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
