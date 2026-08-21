import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Search,
  Globe,
  ChevronRight,
  Database
} from 'lucide-react';
import { mockEntities, type Entity } from '../data/mockData';

export default function EntitiesView() {
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filteredEntities = mockEntities.filter(ent => {
    const matchesSearch = ent.name.toLowerCase().includes(searchQuery.toLowerCase()) || ent.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'ALL' || ent.type.toUpperCase() === typeFilter.toUpperCase();
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12 font-mono">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 mb-1">
            <Layers className="w-3.5 h-3.5" /> ENTITY MANAGEMENT & PROFILES
          </div>
          <h1 className="text-xl font-bold font-sans text-slate-100">Enterprise Entity Directory</h1>
          <p className="text-xs text-slate-400">Search, audit, and inspect individual corporate entities, directors, suppliers, and contracts.</p>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="font-bold text-slate-200">{filteredEntities.length}</span> of {mockEntities.length} entities
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-[#040810]/80 border border-[#0e1c2e]">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entity name, ID, country, or category..."
            className="w-full bg-[#02050a] border border-[#0e1c2e] focus:border-blue-500/50 rounded-md pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto text-xs">
          {['ALL', 'SUPPLIER', 'COMPANY', 'PERSON', 'CONTRACT', 'SANCTION'].map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded text-[11px] uppercase transition-colors whitespace-nowrap ${
                typeFilter === type
                  ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300 font-bold'
                  : 'bg-[#02050a] border border-[#0e1c2e] text-slate-400 hover:text-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* ENTITIES TABLE */}
      <div className="rounded-lg bg-[#040810]/80 border border-[#0e1c2e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#02050a] text-slate-500 border-b border-[#0e1c2e] uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">ID / Entity Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Risk Assessment</th>
                <th className="px-4 py-3">Ingest Source</th>
                <th className="px-4 py-3">Relationships</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0e1c2e]/60">
              {filteredEntities.map((ent) => (
                <tr
                  key={ent.id}
                  onClick={() => setSelectedEntity(ent)}
                  className="hover:bg-[#081528]/50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">{ent.name}</div>
                    <div className="text-[10px] text-slate-500">{ent.id} · {ent.details}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] uppercase font-bold">
                      {ent.type}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 flex items-center gap-1.5 pt-4">
                    <Globe className="w-3.5 h-3.5 text-slate-500" />
                    {ent.country}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`font-bold ${
                      ent.risk === 'Critical' || ent.risk === 'High' 
                        ? 'text-red-400' 
                        : ent.risk === 'Medium' 
                          ? 'text-amber-400' 
                          : 'text-emerald-400'
                    }`}>
                      {ent.risk}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400">{ent.source}</td>
                  <td className="px-4 py-3.5 text-slate-300 font-bold">{ent.relationshipsCount} links</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-slate-500 group-hover:text-blue-400 transition-colors inline-block">
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ENTITY PROFILE DRAWER MODAL */}
      <AnimatePresence>
        {selectedEntity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#050d1a] border border-blue-500/30 rounded-lg max-w-xl w-full p-6 space-y-4 shadow-2xl relative"
            >
              <button
                onClick={() => setSelectedEntity(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
              >
                [ESC]
              </button>

              <div className="flex items-center gap-2 text-blue-400 text-xs">
                <Database className="w-4 h-4" />
                <span>{selectedEntity.id} PROFILE PROFILE</span>
              </div>

              <h2 className="text-lg font-bold font-sans text-slate-100">{selectedEntity.name}</h2>

              <div className="grid grid-cols-2 gap-4 p-4 rounded bg-[#02050a] border border-[#0e1c2e] text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Entity Type</span>
                  <span className="text-slate-200 font-semibold">{selectedEntity.type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Jurisdiction</span>
                  <span className="text-slate-200 font-semibold">{selectedEntity.country}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Risk Level</span>
                  <span className="text-red-400 font-bold">{selectedEntity.risk}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Data Source</span>
                  <span className="text-cyan-400">{selectedEntity.source}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedEntity.details}. Connected across {selectedEntity.relationshipsCount} multi-hop enterprise entity links.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="px-4 py-2 rounded bg-blue-600 text-white font-bold text-xs uppercase"
                >
                  Close Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
