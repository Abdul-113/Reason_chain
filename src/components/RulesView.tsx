import { useState } from 'react';
import {
  ShieldCheck,
  Code
} from 'lucide-react';
import { mockRules, type Rule } from '../data/mockData';

export default function RulesView() {
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  console.log('Active rule:', selectedRule?.id);

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5" /> SYMBOLIC REASONING RULES ENGINE
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Verification Rule Definitions</h1>
          <p className="text-xs text-slate-400">Configure symbolic logic rules used by the reasoning layer to evaluate risk paths.</p>
        </div>

        <button className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2">
          <Code className="w-3.5 h-3.5" /> Add Symbolic Rule
        </button>
      </div>

      {/* RULES LIST */}
      <div className="grid grid-cols-1 gap-4">
        {mockRules.map((rule) => (
          <div
            key={rule.id}
            onClick={() => setSelectedRule(rule)}
            className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] hover:border-amber-500/40 cursor-pointer transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs">
                  {rule.code}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans">{rule.name}</h3>
                  <div className="text-[10px] text-slate-500">Category: {rule.category} · Version: {rule.version} · Applied {rule.timesApplied} times</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className={`font-bold ${rule.severity === 'Critical' || rule.severity === 'High' ? 'text-red-400' : 'text-amber-400'}`}>
                  SEVERITY: {rule.severity}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px]">
                  {rule.status}
                </span>
              </div>
            </div>

            <div className="p-3 rounded bg-[#02050a] border border-[#0e1c2e] text-xs space-y-2">
              <div>
                <span className="text-slate-500 uppercase text-[9px] block">Symbolic Condition</span>
                <code className="text-cyan-300 text-[11px] block mt-0.5">{rule.conditions}</code>
              </div>
              <div className="pt-1.5 border-t border-[#0e1c2e]/60">
                <span className="text-slate-500 uppercase text-[9px] block">Conclusion Output</span>
                <span className="text-slate-200">{rule.conclusion}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
