import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, CheckCircle2, ArrowRight } from 'lucide-react';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#040810] border border-[#0e1c2e] rounded-xl max-w-lg w-full p-8 relative shadow-2xl font-mono"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors text-xs"
        >
          [ESC]
        </button>

        {!submitted ? (
          <>
            <div className="flex items-center gap-2 text-cyan-400 text-xs mb-2">
              <Calendar className="w-4 h-4" />
              <span>ENTERPRISE DEMO REQUEST</span>
            </div>
            <h2 className="text-xl font-bold font-sans text-slate-100 mb-2">Schedule a Custom Platform Demonstration</h2>
            <p className="text-xs text-slate-400 font-sans leading-relaxed mb-6">
              See how ReasonChain connects ERP, CRM & compliance data to automate multi-hop relationship reasoning.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Sarah Jenkins"
                  className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded px-3.5 py-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="sarah.j@enterprise-corp.com"
                  className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded px-3.5 py-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">Company / Organization</label>
                <input
                  type="text"
                  required
                  placeholder="Enterprise Financial Group"
                  className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded px-3.5 py-2 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2 mt-2"
              >
                <span>Request Live Demo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold font-sans text-slate-100">Demo Request Submitted</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Our enterprise solutions team will contact you within 2 business hours to confirm your custom demonstration session.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider hover:bg-cyan-400 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
