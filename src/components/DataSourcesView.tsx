import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Server,
  ArrowUpRight,
  HardDrive
} from 'lucide-react';
import { mockDataSources, type DataSource } from '../data/mockData';

export default function DataSourcesView() {
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [sources, setSources] = useState<DataSource[]>(mockDataSources);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  const handleSync = (id: string) => {
    setIsSyncing(id);
    setTimeout(() => {
      setSources(prev => prev.map(s => s.id === id ? { ...s, lastSync: 'Just now', status: 'Healthy' } : s));
      setIsSyncing(null);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 mb-1">
            <Server className="w-3.5 h-3.5" /> DATA INGESTION & PIPELINES
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Connected Enterprise Data Sources</h1>
          <p className="text-xs text-slate-400">Manage database connections, schema sync status, and ingest pipelines.</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            5 Connected Sources
          </span>
        </div>
      </div>

      {/* DATA SOURCES CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sources.map((src) => (
          <motion.div
            key={src.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-lg bg-[#040810]/80 border border-[#0e1c2e] hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 uppercase">
                  {src.category}
                </span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${src.status === 'Healthy' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${src.status === 'Healthy' ? 'bg-emerald-400' : 'bg-cyan-400 animate-ping'}`} />
                  {src.status}
                </span>
              </div>

              <h3 className="text-sm font-bold font-sans text-slate-100 mb-1">{src.name}</h3>
              <div className="text-[11px] text-slate-500">{src.id} · Type: <span className="text-slate-300">{src.type}</span></div>
            </div>

            <div className="space-y-2 p-3 rounded bg-[#02050a] border border-[#0e1c2e] text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Record Count:</span>
                <span className="font-bold text-slate-200">{src.recordCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tables Ingested:</span>
                <span className="text-slate-200">{src.tablesCount} tables</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Schema Version:</span>
                <span className="text-cyan-400">{src.schemaVersion}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Last Sync:</span>
                <span className="text-slate-300">{src.lastSync}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#0e1c2e]/60 text-xs">
              <button
                onClick={() => setSelectedSource(src)}
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                View Schema <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleSync(src.id)}
                disabled={isSyncing === src.id}
                className="px-3 py-1 rounded bg-[#081528] border border-[#0e1c2e] hover:border-purple-500/40 text-slate-300 hover:text-purple-300 flex items-center gap-1.5 transition-colors text-[11px]"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing === src.id ? 'animate-spin text-purple-400' : ''}`} />
                <span>{isSyncing === src.id ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* SCHEMA DETAILS MODAL */}
      <AnimatePresence>
        {selectedSource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#050d1a] border border-purple-500/30 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setSelectedSource(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
              >
                [ESC]
              </button>

              <div className="flex items-center gap-2 text-purple-400 text-xs">
                <HardDrive className="w-4 h-4" />
                <span>{selectedSource.id} SCHEMA INFO</span>
              </div>

              <h2 className="text-lg font-bold font-sans text-slate-100">{selectedSource.name}</h2>

              <div className="p-4 rounded bg-[#02050a] border border-[#0e1c2e] space-y-2 text-xs">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider mb-2">Ingested Relational Tables ({selectedSource.tablesCount})</div>
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between border-b border-[#0e1c2e]/60 pb-1">
                    <span>tbl_vendor_master</span>
                    <span className="text-cyan-400">42,190 rows</span>
                  </div>
                  <div className="flex justify-between border-b border-[#0e1c2e]/60 pb-1">
                    <span>tbl_contracts_register</span>
                    <span className="text-cyan-400">14,200 rows</span>
                  </div>
                  <div className="flex justify-between border-b border-[#0e1c2e]/60 pb-1">
                    <span>tbl_directors_ownership</span>
                    <span className="text-cyan-400">69,040 rows</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedSource(null)}
                  className="px-4 py-2 rounded bg-purple-500 text-slate-950 font-bold text-xs uppercase"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
