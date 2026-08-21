import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Play,
  Pause,
  RefreshCw,
  Sparkles
} from 'lucide-react';

import KnowledgeGraphPanel from './graph/KnowledgeGraphPanel';

// ==========================================
// INTERACTIVE PRODUCT DEMO SECTION
// "Ask the question. Follow the evidence."
// ==========================================

export default function ProductDemoSection() {
  const [demoStep, setDemoStep] = useState(4); // 0 to 4
  const [isPlaying, setIsPlaying] = useState(true);

  // Auto progression of demo steps
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setDemoStep(prev => (prev + 1) % 5);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const pipelineSteps = [
    { label: 'Understanding question', doneAtStep: 0 },
    { label: 'Finding entities', doneAtStep: 1 },
    { label: 'Traversing relationships', doneAtStep: 2 },
    { label: 'Verifying evidence', doneAtStep: 3 },
    { label: 'Building proof', doneAtStep: 4 }
  ];

  const reasoningSteps = [
    {
      num: '01',
      title: 'ABC Industrial Supplies supplies Acme Manufacturing.',
      source: 'ERP Database',
      sourceColor: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
      activeAtStep: 1
    },
    {
      num: '02',
      title: 'Rahul Mehta is a director of Acme Manufacturing.',
      source: 'Corporate Registry',
      sourceColor: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
      activeAtStep: 2
    },
    {
      num: '03',
      title: 'Rahul Mehta is also a director of Orion Trading.',
      source: 'Corporate Registry',
      sourceColor: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
      activeAtStep: 3
    },
    {
      num: '04',
      title: 'Orion Trading appears on the sanctions registry.',
      source: 'Compliance Registry',
      sourceColor: 'text-red-400 border-red-500/20 bg-red-500/10',
      activeAtStep: 4
    }
  ];

  return (
    <section id="demo" className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-8 py-20 lg:py-28 font-mono">
      
      {/* SECTION HEADER */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#091929]/60 border border-cyan-500/15 mb-4">
          <span className="w-[5px] h-[5px] rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] text-cyan-400 tracking-[0.15em] uppercase font-bold">
            Interactive Product Demo
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold font-sans tracking-tight text-slate-100 leading-[1.15]">
          Ask the question.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            Follow the evidence.
          </span>
        </h2>
      </div>

      {/* DEMO INTERFACE BOX */}
      <div className="rounded-xl border border-cyan-500/30 bg-[#040810]/95 p-6 shadow-2xl relative overflow-hidden space-y-6">
        
        {/* TOP INVESTIGATION QUESTION BAR */}
        <div className="p-4 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase tracking-widest block">Active Investigation Query</span>
              <p className="text-sm font-bold font-sans text-slate-100">
                "Which active suppliers are indirectly connected to sanctioned companies through shared directors?"
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded border border-[#0e1c2e] bg-[#081528] hover:border-cyan-500/40 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 text-cyan-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{isPlaying ? 'Pause Auto-Run' : 'Play Auto-Run'}</span>
            </button>
            <button
              onClick={() => setDemoStep(0)}
              className="p-1.5 rounded border border-[#0e1c2e] bg-[#081528] text-slate-400 hover:text-slate-200"
              title="Restart Demo"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3-COLUMN DEMO BODY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* LEFT: PIPELINE STATUS */}
          <div className="lg:col-span-3 bg-[#02050a] border border-[#0e1c2e] rounded-lg p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-[#0e1c2e] pb-2 mb-4 font-bold">
                Execution Pipeline
              </div>

              <div className="space-y-3 text-xs">
                {pipelineSteps.map((step) => {
                  const isDone = demoStep >= step.doneAtStep;
                  const isCurrent = demoStep === step.doneAtStep;

                  return (
                    <div
                      key={step.label}
                      className={`flex items-center justify-between p-2.5 rounded border transition-all ${
                        isCurrent
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 font-bold'
                          : isDone
                            ? 'bg-[#040810] border-[#0e1c2e] text-slate-300'
                            : 'bg-[#02050a] border-transparent text-slate-600'
                      }`}
                    >
                      <span className="text-[11px]">{step.label}</span>
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-800 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded bg-[#040810] border border-[#0e1c2e] text-[10px] space-y-1">
              <span className="text-slate-500 uppercase block">Engine Mode</span>
              <span className="text-cyan-400 font-bold">Symbolic Rule Traversal v4.2</span>
            </div>
          </div>

          {/* CENTER: INTERACTIVE KNOWLEDGE GRAPH PANEL */}
          <div className="lg:col-span-5 bg-[#02050a] border border-[#0e1c2e] rounded-lg relative overflow-hidden min-h-[380px]">
            <KnowledgeGraphPanel
              activeStep={demoStep}
              setActiveStep={setDemoStep}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
            />
          </div>

          {/* RIGHT: REASONING CHAIN & CONCLUSION */}
          <div className="lg:col-span-4 bg-[#02050a] border border-[#0e1c2e] rounded-lg p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2 mb-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Auditable Reasoning Chain</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  4 HOPS
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {reasoningSteps.map((step) => {
                  const isActive = demoStep >= step.activeAtStep;

                  return (
                    <motion.div
                      key={step.num}
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: isActive ? 1 : 0.4 }}
                      className={`p-3 rounded border transition-all ${
                        isActive
                          ? 'bg-[#040810] border-[#0e1c2e]'
                          : 'bg-[#02050a] border-transparent opacity-40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-cyan-400 font-bold text-[10px]">{step.num}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${step.sourceColor}`}>
                          {step.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-200 leading-relaxed font-sans">{step.title}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* FINAL CONCLUSION BOX */}
            <div className={`p-3.5 rounded border transition-all ${
              demoStep >= 4
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-[#040810] border-[#0e1c2e]'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Final Conclusion</span>
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  ✓ VERIFIED
                </span>
              </div>
              <p className="text-xs font-bold text-red-400 font-sans">
                ABC Industrial Supplies has an indirect sanctions relationship.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
