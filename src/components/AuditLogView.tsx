import { BookOpen, Clock } from 'lucide-react';
import { mockAuditLogs } from '../data/mockData';

export default function AuditLogView() {
  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-slate-500/10 border border-slate-500/20 text-[10px] text-slate-300 mb-1">
            <BookOpen className="w-3.5 h-3.5" /> SYSTEM ACTIVITY & EVENT STREAM
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Chronological System Audit Log</h1>
          <p className="text-xs text-slate-400">Complete immutable record of all system events, actor actions, rule updates, and proof creations.</p>
        </div>

        <span className="text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded">
          ● LIVE AUDIT LOGGING
        </span>
      </div>

      {/* AUDIT LOG TABLE */}
      <div className="rounded-lg bg-[#040810]/80 border border-[#0e1c2e] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#02050a] text-slate-500 border-b border-[#0e1c2e] uppercase text-[10px]">
            <tr>
              <th className="px-4 py-3">Timestamp (UTC)</th>
              <th className="px-4 py-3">Actor / Agent</th>
              <th className="px-4 py-3">Action Performed</th>
              <th className="px-4 py-3">Target Object</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3 text-right">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0e1c2e]/60">
            {mockAuditLogs.map((log) => (
              <tr key={log.id} className="hover:bg-[#081528]/40 transition-colors">
                <td className="px-4 py-3.5 text-slate-400 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                  {log.timestamp}
                </td>
                <td className="px-4 py-3.5 font-bold text-slate-200">{log.actor}</td>
                <td className="px-4 py-3.5 text-cyan-300">{log.action}</td>
                <td className="px-4 py-3.5 text-slate-300 font-semibold">{log.object}</td>
                <td className="px-4 py-3.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                    log.result === 'Success' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {log.result}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right text-slate-500 font-mono">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
