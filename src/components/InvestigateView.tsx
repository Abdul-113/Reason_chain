import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  GitBranch,
  ArrowRight,
  FileText,
  ChevronRight,
  Cpu,
  Network
} from 'lucide-react';

interface InvestigateViewProps {
  onNavigateToGraph?: () => void;
  onNavigateToProofs?: () => void;
}

export default function InvestigateView({ onNavigateToGraph, onNavigateToProofs }: InvestigateViewProps) {
  const [query, setQuery] = useState('Is Supplier ABC Industrial connected to any sanctioned entities or PEPs?');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [hasResults, setHasResults] = useState(true);

  const suggestedQueries = [
    'Trace ownership control for Orion Trading LLC offshore subsidiary',
    'Verify executive conflict of interest between Acme & Director Rahul Mehta',
    'Analyze sanction exposure across top 50 tier-1 hardware suppliers',
    'Audit compliance records for contracts signed in Q3 2025'
  ];

  const handleRunInvestigation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsInvestigating(true);
    setTimeout(() => {
      setIsInvestigating(false);
      setHasResults(true);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12">
      
      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#091b35]/60 border border-cyan-500/20 text-[10px] font-mono text-cyan-400 mb-1">
            <Cpu className="w-3 h-3" /> MULTI-HOP REASONING ENGINE
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Enterprise Investigation Workspace</h1>
          <p className="text-xs text-slate-400 font-mono">Ask complex relationship queries across connected ERP, CRM & Sanctions data.</p>
        </div>
      </div>

      {/* QUESTION INPUT BOX */}
      <div className="bg-[#040810]/90 border border-cyan-500/30 rounded-xl p-5 shadow-2xl relative">
        <form onSubmit={handleRunInvestigation} className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <Sparkles className="w-4 h-4" />
            <span>ENTER NATURAL LANGUAGE QUERY OR PROMPT</span>
          </div>

          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={2}
              className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded-lg p-3.5 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none transition-colors"
              placeholder="e.g. Find all indirect links between Vendor X and OFAC Sanctions..."
            />
            <button
              type="submit"
              disabled={isInvestigating}
              className="absolute right-3 bottom-3 px-5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center gap-2"
            >
              {isInvestigating ? (
                <span>Reasoning...</span>
              ) : (
                <>
                  <span>Run Investigation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* SUGGESTED INVESTIGATIONS */}
        <div className="mt-4 pt-3 border-t border-[#0e1c2e] flex items-center gap-2 overflow-x-auto text-[11px] font-mono">
          <span className="text-slate-500 whitespace-nowrap">Suggested:</span>
          {suggestedQueries.map((sq, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(sq);
                handleRunInvestigation();
              }}
              className="px-2.5 py-1 rounded bg-[#081528] border border-[#0e1c2e] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 whitespace-nowrap transition-colors"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* RESULTS DISPLAY */}
      {hasResults && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* LEFT: STEP-BY-STEP REASONING CHAIN & EVIDENCE */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* Reasoning Chain */}
            <div className="bg-[#040810]/80 border border-[#0e1c2e] rounded-lg p-5">
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3 mb-4">
                <div className="flex items-center gap-2 font-mono text-xs text-slate-200 font-bold uppercase tracking-wider">
                  <GitBranch className="w-4 h-4 text-cyan-400" />
                  <span>Auditable Reasoning Chain (4 Hops)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  LOGICALLY VERIFIED
                </span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="flex items-start gap-3 p-3 rounded bg-[#02050a] border border-[#0e1c2e]">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-[10px] flex items-center justify-center shrink-0">1</span>
                  <div>
                    <div className="text-slate-200 font-semibold">Entity Selected: ABC Industrial Supplies</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Primary ERP Vendor Record ID: #ERP-99214</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded bg-[#02050a] border border-[#0e1c2e]">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-[10px] flex items-center justify-center shrink-0">2</span>
                  <div>
                    <div className="text-slate-200 font-semibold">Ownership Hop → Acme Manufacturing</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Corporate Registry match (98.4% identity confidence)</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded bg-[#02050a] border border-[#0e1c2e]">
                  <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px] flex items-center justify-center shrink-0">3</span>
                  <div>
                    <div className="text-slate-200 font-semibold">Director Link → Rahul Mehta</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">SEC Filings verify dual executive directorship</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded bg-[#0f0406] border border-red-500/30">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 font-bold text-[10px] flex items-center justify-center shrink-0">4</span>
                  <div>
                    <div className="text-red-400 font-semibold">Sanction Match → Orion Trading → Sanctions List</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">OFAC Specially Designated Nationals (SDN) match</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence & Conclusion Card */}
            <div className="bg-[#040810]/80 border border-[#0e1c2e] rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400 uppercase tracking-wider font-bold">Investigation Conclusion</span>
                <span className="font-mono text-xs text-red-400 font-bold">HIGH RISK EXPOSURE</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                ABC Industrial Supplies exhibits an indirect high-risk connection to OFAC sanctioned entity Orion Trading through shared Director Rahul Mehta. Immediate compliance audit recommended.
              </p>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={onNavigateToProofs}
                  className="px-3.5 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> View Proof Package
                </button>
                <button 
                  onClick={onNavigateToGraph}
                  className="px-3.5 py-1.5 rounded bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-mono hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                >
                  <Network className="w-3.5 h-3.5" /> Open Knowledge Graph Explorer
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT: KNOWLEDGE GRAPH MINI-VIEWER */}
          <div className="lg:col-span-5 bg-[#040810]/80 border border-[#0e1c2e] rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3 mb-4">
                <span className="font-mono text-xs text-slate-200 uppercase font-bold tracking-wider">Visual Multi-Hop Path</span>
                <span className="text-[10px] font-mono text-cyan-400">4 ENTITIES CONNECTED</span>
              </div>

              {/* Simplified Path Diagram */}
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">ABC Industrial</span>
                  <span className="text-[10px] text-slate-500">SUPPLIER</span>
                </div>
                <div className="text-center text-slate-600 text-[10px]">↓ SUPPLIES TO ↓</div>
                
                <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">Acme Manufacturing</span>
                  <span className="text-[10px] text-slate-500">COMPANY</span>
                </div>
                <div className="text-center text-slate-600 text-[10px]">↓ MANAGED BY ↓</div>

                <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 flex items-center justify-between">
                  <span className="text-amber-400 font-bold">Rahul Mehta</span>
                  <span className="text-[10px] text-slate-500">DIRECTOR</span>
                </div>
                <div className="text-center text-slate-600 text-[10px]">↓ DIRECTOR OF ↓</div>

                <div className="p-3 rounded border border-red-500/30 bg-red-500/5 flex items-center justify-between">
                  <span className="text-red-400 font-bold">Sanctions List</span>
                  <span className="text-[10px] text-slate-500">OFAC SANCTION</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#0e1c2e] flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">Confidence: 94.2%</span>
              <button 
                onClick={onNavigateToGraph}
                className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
              >
                Expand in Full Graph <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

    </div>
  );
}
