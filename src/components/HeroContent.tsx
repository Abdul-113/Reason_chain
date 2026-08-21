import { ArrowRight, Play, CheckCircle, Layers, Database } from 'lucide-react';
import { motion } from 'framer-motion';

// ==========================================
// HERO LEFT COLUMN CONTENT
// Eyebrow, headline, supporting text, CTAs,
// trust indicators, and trace audit panel.
// ==========================================

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 14 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.55, delay, ease: 'easeOut' as const }
});

interface HeroContentProps {
  onStartInvestigation: () => void;
  onBookDemo?: () => void;
}

export default function HeroContent({ onStartInvestigation, onBookDemo }: HeroContentProps) {
  return (
    <div className="lg:col-span-5 flex flex-col justify-center space-y-7">

      {/* Eyebrow */}
      <motion.div {...fadeUp(0.4)} className="space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#091929]/60 border border-cyan-500/15">
          <span className="w-[6px] h-[6px] rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono text-cyan-400 tracking-[0.15em] uppercase font-bold">
            Enterprise Reasoning Platform
          </span>
        </div>
      </motion.div>

      {/* Headline */}
      <motion.div {...fadeUp(0.6)}>
        <h1 className="text-[40px] sm:text-[48px] lg:text-[46px] font-extrabold tracking-[-0.02em] text-slate-100 leading-[1.12]">
          From fragmented data
          <br />
          to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400">
            verified reasoning.
          </span>
        </h1>
      </motion.div>

      {/* Supporting Text */}
      <motion.p
        {...fadeUp(0.8)}
        className="text-[14px] text-slate-400 leading-[1.7] max-w-[440px]"
      >
        ReasonChain connects your enterprise data, uncovers hidden
        relationships, and delivers auditable answers to complex business
        questions.
      </motion.p>

      {/* CTA Buttons */}
      <motion.div {...fadeUp(1.0)} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
        <button
          onClick={onStartInvestigation}
          className="group flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-cyan-500 text-[#050a0f] font-bold text-[12px] uppercase tracking-wider hover:bg-cyan-400 transition-all duration-200 shadow-[0_0_24px_rgba(6,182,212,0.25)] hover:shadow-[0_0_32px_rgba(6,182,212,0.35)]"
        >
          Start Investigation
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={onBookDemo}
          className="group flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-[#1a2d4a] bg-[#050e20]/40 text-slate-300 font-semibold text-[12px] uppercase tracking-wider hover:border-[#243d64] hover:text-slate-100 transition-all duration-200"
        >
          <span>Explore Demo</span>
          <Play className="w-3 h-3 fill-current opacity-70 group-hover:opacity-100" />
        </button>
      </motion.div>

      {/* Trust Indicators */}
      <motion.div
        {...fadeUp(1.1)}
        className="grid grid-cols-3 gap-4 pt-6 border-t border-[#0e1c2e]/60"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <CheckCircle className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">Audit-ready</span>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">Every answer is traceable.</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <Layers className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">Enterprise-grade</span>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">Secure, scalable, compliant.</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <Database className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">Built for complexity</span>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">Multi-hop reasoning engine.</p>
        </div>
      </motion.div>

      {/* Trace & Audit Log Panel */}
      <motion.div
        {...fadeUp(1.15)}
        className="border border-[#0e1c2e] bg-[#040810]/80 rounded p-3.5 font-mono text-[10px] space-y-2"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center justify-between border-b border-[#0e1c2e]/60 pb-1.5">
          <span className="text-slate-500 uppercase tracking-[0.15em] text-[8px] font-bold">
            Trace &amp; Audit Log
          </span>
          <span className="text-[8px] text-emerald-400 bg-emerald-500/8 px-1.5 py-[2px] rounded flex items-center gap-1 font-semibold border border-emerald-500/15">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-slate-400">
          <div>
            <span className="text-slate-600 uppercase text-[8px] tracking-wider block">Initiated By</span>
            <p className="text-slate-300 mt-0.5">System Auto-Audit</p>
          </div>
          <div>
            <span className="text-slate-600 uppercase text-[8px] tracking-wider block">Query Target</span>
            <p className="text-cyan-400 font-semibold mt-0.5">Vendor ABC Industrial</p>
          </div>
        </div>

        <div className="pt-1.5 border-t border-[#0e1c2e]/40">
          <span className="text-slate-600 uppercase text-[8px] tracking-wider block">Verification Rules</span>
          <p className="text-slate-300 mt-0.5">[AML-04, SEC-OWNER, CORP-CTRL]</p>
        </div>

        <div className="pt-1.5 border-t border-[#0e1c2e]/40 flex items-center justify-between">
          <span className="text-slate-600 uppercase text-[8px] tracking-wider">Status</span>
          <span className="text-red-400 font-bold flex items-center gap-1">
            ⚠ High Risk Path Identified
          </span>
        </div>
      </motion.div>
    </div>
  );
}
