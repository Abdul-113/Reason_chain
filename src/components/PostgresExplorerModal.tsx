import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  RefreshCw,
  Table,
  Layers,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  Server,
  Eye,
} from 'lucide-react';
import {
  getPostgresStatus,
  getPostgresTableRows,
  getPostgresRelationships,
  type PostgresStatusResponse,
  type TableRowsResponse,
  type RelationshipsResponse,
  type RelationshipClaimRecord
} from '../services/postgresApi';

interface PostgresExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'overview' | 'tables' | 'relationships';
}

export default function PostgresExplorerModal({
  isOpen,
  onClose,
  initialTab = 'overview',
}: PostgresExplorerModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'relationships'>(initialTab);
  
  // Status state
  const [status, setStatus] = useState<PostgresStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);

  // Table Explorer state
  const [selectedTable, setSelectedTable] = useState<string>('relationship_claims');
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [tablePage, setTablePage] = useState<number>(1);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableError, setTableError] = useState<string | null>(null);

  // Relationship Explorer state
  const [relationshipsData, setRelationshipsData] = useState<RelationshipsResponse | null>(null);
  const [relLoading, setRelLoading] = useState<boolean>(false);
  const [relPage, setRelPage] = useState<number>(1);
  const [relFilterType, setRelFilterType] = useState<string>('ALL');
  const [relSearch, setRelSearch] = useState<string>('');
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'tables' && selectedTable) {
      loadTableData(selectedTable, tablePage, tableSearch);
    }
  }, [isOpen, activeTab, selectedTable, tablePage]);

  useEffect(() => {
    if (isOpen && activeTab === 'relationships') {
      loadRelationships(relPage, relFilterType, relSearch);
    }
  }, [isOpen, activeTab, relPage, relFilterType]);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await getPostgresStatus();
      setStatus(data);
      if (data.tables.length > 0 && !selectedTable) {
        setSelectedTable(data.tables[0].table_name);
      }
    } catch (err: any) {
      console.error('Failed to connect to PostgreSQL backend service:', err.message);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadTableData = async (table: string, page: number, search: string) => {
    setTableLoading(true);
    setTableError(null);
    try {
      const data = await getPostgresTableRows(table, page, 15, search);
      setTableData(data);
    } catch (err: any) {
      setTableError(err.message || `Failed to load table ${table}`);
    } finally {
      setTableLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTablePage(1);
    loadTableData(selectedTable, 1, tableSearch);
  };

  const loadRelationships = async (page: number, typeFilter: string, search: string) => {
    setRelLoading(true);
    try {
      const data = await getPostgresRelationships(page, 15, typeFilter, search);
      setRelationshipsData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setRelLoading(false);
    }
  };

  const handleRelSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRelPage(1);
    loadRelationships(1, relFilterType, relSearch);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md font-mono">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-[#030712] border border-cyan-500/40 rounded-xl max-w-6xl w-full h-[90vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)] relative overflow-hidden"
      >
        {/* TOP ACCENT LINE */}
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-[#0e1c2e] flex items-center justify-between bg-[#040915]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-sans text-slate-100">
                  PostgreSQL Relational & Relationship Data Explorer
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Backend Data
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Source: <span className="text-slate-200 font-bold">Firebase /company_relationships Export</span> normalized into PostgreSQL relational engine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              disabled={loadingStatus}
              className="p-2 rounded bg-[#081528] border border-[#0e1c2e] hover:border-cyan-500/40 text-slate-400 hover:text-cyan-300 transition-colors text-xs flex items-center gap-1.5"
              title="Refresh database state"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SYNTHETIC DATA MANDATORY WARNING BANNER */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">
              Synthetic demonstration data — relationships are not verified real-world facts.
            </span>
          </div>
          <span className="text-[10px] text-amber-400/70 hidden sm:inline font-mono">
            Confidence scores represent mock probabilities
          </span>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-[#0e1c2e] bg-[#02050a] px-5 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 font-bold transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Database Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`py-3 px-4 border-b-2 font-bold transition-all flex items-center gap-2 ${
              activeTab === 'tables'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Table Explorer ({status?.total_tables || 13})</span>
          </button>

          <button
            onClick={() => setActiveTab('relationships')}
            className={`py-3 px-4 border-b-2 font-bold transition-all flex items-center gap-2 ${
              activeTab === 'relationships'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Relationship Claims ({status?.total_relationship_claims || 20})</span>
          </button>
        </div>

        {/* CONTENT PANELS */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#030712]">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* CONNECTION & SYSTEM HEALTH */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Engine & Host</div>
                  <div className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span>{status?.engine?.toUpperCase() || 'POSTGRESQL'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                    {status?.host_display || 'Active Relational Provider'}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Database Name</div>
                  <div className="text-sm font-bold text-cyan-300 truncate">
                    {status?.database_name || 'reasonchain_db'}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Credentials Protected
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Imported Entities</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {status?.total_entities ?? 23}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Companies: {status?.entity_breakdown?.companies || 10} · People: {status?.entity_breakdown?.people || 6}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Relationship Claims</div>
                  <div className="text-2xl font-bold text-purple-300">
                    {status?.total_relationship_claims ?? 20}
                  </div>
                  <div className="text-[10px] text-purple-400/80 mt-1">
                    Unresolved Links: <span className="font-bold text-emerald-400">{status?.company_links_unresolved ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* LATEST IMPORT BATCH AUDIT */}
              {status?.latest_import_batch && (
                <div className="p-5 rounded-lg bg-[#040810] border border-cyan-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span className="font-bold text-slate-200 text-xs">LATEST IMPORT BATCH METADATA</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      {status.latest_import_batch.batch_id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Source System:</span>
                      <span className="text-slate-200 font-bold">{status.latest_import_batch.source_system}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Source Path:</span>
                      <span className="text-amber-300 font-mono font-bold">{status.latest_import_batch.source_path}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Content Hash (SHA-256):</span>
                      <span className="text-slate-400 font-mono text-[10px] truncate block" title={status.latest_import_batch.content_hash}>
                        {status.latest_import_batch.content_hash ? `${status.latest_import_batch.content_hash.substring(0, 16)}...` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Import Timestamp:</span>
                      <span className="text-slate-300">{status.latest_import_batch.imported_at}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#0e1c2e] flex flex-wrap gap-4 text-xs">
                    <span className="text-slate-400">
                      Companies Linked: <span className="text-emerald-400 font-bold">{status.latest_import_batch.record_counts?.company_links_resolved ?? 10}</span>
                    </span>
                    <span className="text-slate-400">
                      External Companies: <span className="text-slate-200 font-bold">{status.latest_import_batch.record_counts?.external_companies ?? 2}</span>
                    </span>
                    <span className="text-slate-400">
                      People: <span className="text-slate-200 font-bold">{status.latest_import_batch.record_counts?.people ?? 6}</span>
                    </span>
                    <span className="text-slate-400">
                      Suppliers: <span className="text-slate-200 font-bold">{status.latest_import_batch.record_counts?.suppliers ?? 5}</span>
                    </span>
                    <span className="text-slate-400">
                      Contracts: <span className="text-slate-200 font-bold">{status.latest_import_batch.record_counts?.contracts ?? 5}</span>
                    </span>
                    <span className="text-slate-400">
                      Sanctions: <span className="text-slate-200 font-bold">{status.latest_import_batch.record_counts?.sanctions ?? 2}</span>
                    </span>
                    <span className="text-slate-400">
                      Relationships: <span className="text-purple-300 font-bold">{status.latest_import_batch.record_counts?.relationships ?? 20}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* TABLE INVENTORY GRID */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Table className="w-4 h-4 text-cyan-400" />
                    Actual Database Tables & Live Row Counts
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Click any table to inspect data
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {status?.tables.map((tbl) => (
                    <button
                      key={tbl.table_name}
                      onClick={() => {
                        setSelectedTable(tbl.table_name);
                        setTablePage(1);
                        setTableSearch('');
                        setActiveTab('tables');
                      }}
                      className="p-3.5 rounded bg-[#040810] border border-[#0e1c2e] hover:border-cyan-500/50 hover:bg-[#071326] transition-all text-left flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-bold font-mono text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                          {tbl.table_name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {tbl.table_name === 'relationship_claims'
                            ? 'Normalized Claims'
                            : tbl.table_name === 'company_links'
                            ? 'Firebase Cross-Ref'
                            : tbl.table_name === 'import_batches'
                            ? 'Audit & Provenance'
                            : 'Domain Entity Table'}
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                        {tbl.row_count} rows
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TABLE EXPLORER */}
          {activeTab === 'tables' && (
            <div className="space-y-4">
              {/* TABLE CONTROLS BAR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-bold">Select Table:</span>
                  <select
                    value={selectedTable}
                    onChange={(e) => {
                      setSelectedTable(e.target.value);
                      setTablePage(1);
                      setTableSearch('');
                    }}
                    className="bg-[#02050a] border border-[#0e1c2e] text-slate-200 text-xs rounded px-3 py-1.5 font-mono focus:border-cyan-500 focus:outline-none"
                  >
                    {status?.tables.map((t) => (
                      <option key={t.table_name} value={t.table_name}>
                        {t.table_name} ({t.row_count} rows)
                      </option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search table rows..."
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="bg-[#02050a] border border-[#0e1c2e] text-slate-200 text-xs rounded pl-8 pr-3 py-1.5 font-mono w-48 sm:w-64 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 rounded text-xs font-bold transition-colors"
                  >
                    Filter
                  </button>
                </form>
              </div>

              {/* TABLE ROWS RENDERER */}
              {tableLoading ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Querying PostgreSQL table {selectedTable}...</span>
                </div>
              ) : tableError ? (
                <div className="p-6 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
                  {tableError}
                </div>
              ) : tableData && tableData.rows.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                  No records found in table {selectedTable}.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto border border-[#0e1c2e] rounded-lg">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#040810] text-[10px] text-slate-400 uppercase tracking-wider border-b border-[#0e1c2e]">
                        <tr>
                          {tableData?.columns.map((col) => (
                            <th key={col.name} className="px-3 py-2.5 font-bold font-mono">
                              <span>{col.name}</span>
                              <span className="text-[9px] text-slate-500 font-normal ml-1 lowercase">({col.type})</span>
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-right font-mono">Raw Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0e1c2e]/60 bg-[#02050a]">
                        {tableData?.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#071326]/50 transition-colors">
                            {tableData.columns.map((col) => {
                              const val = row[col.name];
                              let displayVal: any = val;
                              if (typeof val === 'object' && val !== null) {
                                displayVal = (
                                  <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded font-mono truncate max-w-xs block">
                                    {JSON.stringify(val).substring(0, 35)}...
                                  </span>
                                );
                              } else if (val === null || val === undefined) {
                                displayVal = <span className="text-slate-600 italic">null</span>;
                              } else if (typeof val === 'boolean') {
                                displayVal = <span className={val ? 'text-emerald-400' : 'text-slate-500'}>{val ? 'true' : 'false'}</span>;
                              } else {
                                displayVal = String(val);
                              }

                              return (
                                <td key={col.name} className="px-3 py-2 font-mono text-[11px] max-w-xs truncate">
                                  {displayVal}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => setSelectedPayload(row.raw_payload || row)}
                                className="px-2 py-1 rounded bg-[#081528] hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 text-[10px] transition-colors"
                              >
                                View JSON
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* SERVER-SIDE PAGINATION CONTROLS */}
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <div>
                      Total rows: <span className="font-bold text-slate-200">{tableData?.total_rows}</span> · Page{' '}
                      <span className="font-bold text-cyan-400">{tableData?.page}</span> of{' '}
                      <span className="font-bold text-slate-200">{tableData?.total_pages}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage <= 1}
                        className="p-1.5 rounded bg-[#040810] border border-[#0e1c2e] hover:border-cyan-500/40 disabled:opacity-40 text-slate-300"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setTablePage((p) => (tableData && p < tableData.total_pages ? p + 1 : p))}
                        disabled={!tableData || tablePage >= tableData.total_pages}
                        className="p-1.5 rounded bg-[#040810] border border-[#0e1c2e] hover:border-cyan-500/40 disabled:opacity-40 text-slate-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RELATIONSHIP EXPLORER */}
          {activeTab === 'relationships' && (
            <div className="space-y-4">
              {/* RELATIONSHIP FILTER BAR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#040810] border border-[#0e1c2e]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold">Type:</span>
                  {['ALL', 'DIRECTOR_OF', 'SUPPLIES', 'OWNS', 'AFFILIATED_WITH', 'SANCTIONED_BY'].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setRelFilterType(t);
                        setRelPage(1);
                      }}
                      className={`text-[10px] px-2.5 py-1 rounded font-bold transition-all ${
                        relFilterType === t
                          ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                          : 'bg-[#02050a] border border-[#0e1c2e] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleRelSearchSubmit} className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search ID, CIN, name..."
                      value={relSearch}
                      onChange={(e) => setRelSearch(e.target.value)}
                      className="bg-[#02050a] border border-[#0e1c2e] text-slate-200 text-xs rounded pl-8 pr-3 py-1 font-mono w-48 sm:w-56 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 rounded text-xs font-bold"
                  >
                    Filter
                  </button>
                </form>
              </div>

              {/* CLAIMS TABLE */}
              {relLoading ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Querying PostgreSQL relationship claims...</span>
                </div>
              ) : relationshipsData && relationshipsData.claims.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                  No relationship claims match your filter.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto border border-[#0e1c2e] rounded-lg">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#040810] text-[10px] text-slate-400 uppercase tracking-wider border-b border-[#0e1c2e]">
                        <tr>
                          <th className="px-3 py-2.5">Claim ID</th>
                          <th className="px-3 py-2.5">Subject Entity</th>
                          <th className="px-3 py-2.5">Predicate / Type</th>
                          <th className="px-3 py-2.5">Object Entity</th>
                          <th className="px-3 py-2.5">Confidence</th>
                          <th className="px-3 py-2.5">Temporal / Validity</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">Inspect Payload</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0e1c2e]/60 bg-[#02050a]">
                        {relationshipsData?.claims.map((rel: RelationshipClaimRecord) => {
                          const typeColor =
                            rel.relationship_type === 'SANCTIONED_BY'
                              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                              : rel.relationship_type === 'OWNS'
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                              : rel.relationship_type === 'DIRECTOR_OF'
                              ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                              : rel.relationship_type === 'SUPPLIES'
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                              : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300';

                          return (
                            <tr key={rel.relationship_id} className="hover:bg-[#071326]/50 transition-colors">
                              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 font-bold">
                                {rel.relationship_id}
                              </td>

                              <td className="px-3 py-2.5">
                                <div className="font-bold text-slate-200 text-xs truncate max-w-[180px]">
                                  {rel.from_label || rel.from_entity_id}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {rel.from_cin ? `CIN: ${rel.from_cin}` : `Type: ${rel.from_entity_type}`}
                                </div>
                              </td>

                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${typeColor}`}>
                                  {rel.relationship_type}
                                </span>
                                {rel.ownership_percentage && (
                                  <div className="text-[10px] text-purple-400 font-bold mt-0.5">
                                    {rel.ownership_percentage}% Equity
                                  </div>
                                )}
                                {rel.role && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">{rel.role}</div>
                                )}
                                {rel.affiliation_reason && (
                                  <div className="text-[10px] text-slate-500 italic mt-0.5 max-w-[140px] truncate" title={rel.affiliation_reason}>
                                    {rel.affiliation_reason}
                                  </div>
                                )}
                              </td>

                              <td className="px-3 py-2.5">
                                <div className="font-bold text-slate-200 text-xs truncate max-w-[180px]">
                                  {rel.to_label || rel.to_entity_id}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {rel.to_cin ? `CIN: ${rel.to_cin}` : `Type: ${rel.to_entity_type}`}
                                </div>
                              </td>

                              <td className="px-3 py-2.5 font-mono">
                                <span className="text-cyan-300 font-bold">
                                  {(rel.confidence * 100).toFixed(0)}%
                                </span>
                                <span className="text-[9px] text-slate-500 block">synthetic</span>
                              </td>

                              <td className="px-3 py-2.5 text-[10px] text-slate-400 font-mono">
                                {rel.valid_from || rel.valid_to ? (
                                  <div>
                                    <span>{rel.valid_from || '—'}</span> → <span>{rel.valid_to || 'present'}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600">Active / No end date</span>
                                )}
                              </td>

                              <td className="px-3 py-2.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                                  {rel.validation_status}
                                </span>
                              </td>

                              <td className="px-3 py-2.5 text-right">
                                <button
                                  onClick={() => setSelectedPayload(rel.raw_payload)}
                                  className="px-2.5 py-1 rounded bg-[#081528] hover:bg-cyan-500/20 text-cyan-400 text-[10px] font-bold border border-cyan-500/30 transition-colors flex items-center gap-1 ml-auto"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Raw JSON</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <div>
                      Showing <span className="font-bold text-slate-200">{relationshipsData?.claims.length}</span> of{' '}
                      <span className="font-bold text-cyan-400">{relationshipsData?.total}</span> claims
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRelPage((p) => Math.max(1, p - 1))}
                        disabled={relPage <= 1}
                        className="p-1.5 rounded bg-[#040810] border border-[#0e1c2e] hover:border-cyan-500/40 disabled:opacity-40 text-slate-300"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRelPage((p) => (relationshipsData && p < relationshipsData.total_pages ? p + 1 : p))}
                        disabled={!relationshipsData || relPage >= relationshipsData.total_pages}
                        className="p-1.5 rounded bg-[#040810] border border-[#0e1c2e] hover:border-cyan-500/40 disabled:opacity-40 text-slate-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RAW JSON INSPECTION SUB-MODAL */}
        <AnimatePresence>
          {selectedPayload && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#050b18] border border-cyan-500/40 rounded-lg max-w-2xl w-full p-5 space-y-4 shadow-2xl relative"
              >
                <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
                    <Code className="w-4 h-4" />
                    <span>ORIGINAL SOURCE RECORD JSON PAYLOAD</span>
                  </div>
                  <button
                    onClick={() => setSelectedPayload(null)}
                    className="text-slate-400 hover:text-slate-200 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    Raw JSON preserved unmodified from Firebase Realtime Database export.
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto p-4 rounded bg-[#02050a] border border-[#0e1c2e] font-mono text-xs text-slate-200">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(selectedPayload, null, 2)}</pre>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSelectedPayload(null)}
                    className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
