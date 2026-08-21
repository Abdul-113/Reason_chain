import { useState } from 'react';
import {
  FileCheck,
  Shield,
  Download
} from 'lucide-react';

export default function ProofsView() {
  const [selectedProof, setSelectedProof] = useState<any | null>(null);
  console.log('Active selected proof:', selectedProof?.id);

  const proofPackages = [
    {
      id: 'PRF-2025-0891',
      title: 'Supplier Sanction Link Chain',
      subject: 'ABC Industrial Supplies',
      created: '2026-08-10 16:42:00 UTC',
      verifiedBy: 'Rule Symbolic Engine v4.2',
      status: 'VERIFIED & SIGNED',
      riskLevel: 'HIGH',
      hash: '0x8f2a...91b4c',
      hops: 4,
      rulesPassed: ['AML-04', 'SEC-OWNER', 'CORP-CTRL']
    },
    {
      id: 'PRF-2025-0890',
      title: 'Beneficial Ownership Attestation',
      subject: 'Apex Holding Group',
      created: '2026-08-10 14:15:30 UTC',
      verifiedBy: 'Corporate Registry Sync',
      status: 'VERIFIED & SIGNED',
      riskLevel: 'LOW',
      hash: '0x3c1d...44e9a',
      hops: 2,
      rulesPassed: ['OWN-TRANSPARENCY', 'TAX-EU-01']
    },
    {
      id: 'PRF-2025-0889',
      title: 'Director Dual Executive Conflict',
      subject: 'Rahul Mehta',
      created: '2026-08-09 22:04:12 UTC',
      verifiedBy: 'SEC Filing Inspector',
      status: 'VERIFIED & SIGNED',
      riskLevel: 'MEDIUM',
      hash: '0x7e8b...12c8f',
      hops: 3,
      rulesPassed: ['EXEC-CONFLICT-02']
    }
  ];

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 mb-1">
            <FileCheck className="w-3 h-3" /> AUDITABLE PROOF CHAINS
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Cryptographically Signed Proof Packages</h1>
          <p className="text-xs text-slate-400">Every conclusion is backed by traceable multi-hop logic and immutable verification rules.</p>
        </div>

        <button className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2">
          <Download className="w-3.5 h-3.5" /> Export All Proofs (ZIP)
        </button>
      </div>

      {/* PROOFS LIST */}
      <div className="grid grid-cols-1 gap-4">
        {proofPackages.map((proof) => (
          <div
            key={proof.id}
            onClick={() => setSelectedProof(proof)}
            className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] hover:border-cyan-500/40 cursor-pointer transition-all space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{proof.title}</h3>
                  <div className="text-[10px] text-slate-500 mt-0.5">{proof.id} · Subject: <span className="text-slate-300 font-semibold">{proof.subject}</span></div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                  ✓ {proof.status}
                </span>
                <span className={`font-bold ${proof.riskLevel === 'HIGH' ? 'text-red-400' : proof.riskLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  RISK: {proof.riskLevel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded bg-[#02050a] border border-[#0e1c2e] text-xs">
              <div>
                <span className="text-slate-600 block text-[9px] uppercase">Cryptographic Hash</span>
                <span className="text-cyan-400 font-mono text-[11px]">{proof.hash}</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[9px] uppercase">Reasoning Hops</span>
                <span className="text-slate-300">{proof.hops} Verified Nodes</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[9px] uppercase">Rules Evaluated</span>
                <span className="text-slate-300">{proof.rulesPassed.join(', ')}</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[9px] uppercase">Timestamp</span>
                <span className="text-slate-400 text-[11px]">{proof.created}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
