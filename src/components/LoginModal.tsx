import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowRight, Lock, Key } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('alex.investigator@acme-corp.com');
  const [password, setPassword] = useState('••••••••••••');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onSuccess();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#040810] border border-[#0e1c2e] rounded-xl max-w-md w-full p-8 relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors text-xs font-mono"
        >
          [ESC]
        </button>

        {/* Header Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-[#08152b] flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.25)]">
            <span className="font-mono text-base font-black text-cyan-400">RC</span>
          </div>
          <div>
            <h3 className="font-sans text-sm font-bold text-slate-100 uppercase tracking-[0.2em]">ReasonChain</h3>
            <p className="text-[10px] font-mono text-cyan-400">ENTERPRISE AUTHENTICATION</p>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-100 font-sans">Sign in to Enterprise Workspace</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Access multi-hop reasoning, knowledge graphs, and audit-ready proof chains.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Work Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded-md px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none transition-colors"
              />
              <Lock className="w-3.5 h-3.5 text-slate-600 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider">Password</label>
              <span className="text-[10px] font-mono text-cyan-400/80 hover:underline cursor-pointer">SSO Login</span>
            </div>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-cyan-500/60 rounded-md px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none transition-colors"
              />
              <Key className="w-3.5 h-3.5 text-slate-600 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 py-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded border-[#0e1c2e] bg-[#02050a] text-cyan-500" />
              <span>Remember 30 days</span>
            </label>
            <span className="text-emerald-400 flex items-center gap-1">
              <Shield className="w-3 h-3" /> SOC-2 Certified
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Authenticate Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#0e1c2e] flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Workspace: Acme Manufacturing</span>
          <span className="text-cyan-400/80">Demo Mode Active</span>
        </div>
      </motion.div>
    </div>
  );
}
