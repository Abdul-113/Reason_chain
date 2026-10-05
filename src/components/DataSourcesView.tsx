import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Server,
  ArrowUpRight,
  HardDrive,
  Database,
  CheckCircle2,
  FolderTree,
  Sparkles,
  Network
} from 'lucide-react';
import { mockDataSources, type DataSource } from '../data/mockData';
import {
  getFirebaseStatus,
  getFirebasePaths,
  getFirebaseSourceConfig,
  testFirebaseServerConnection,
  type FirebaseStatusResponse,
  type FirebasePathsResponse,
  type FirebaseSourceConfigResponse,
} from '../services/firebaseApi';
import FirebaseDiscoveryModal from './FirebaseDiscoveryModal';
import MappingWorkflowModal from './MappingWorkflowModal';

interface DataSourcesViewProps {
  onNavigateToGraph?: (source?: string) => void;
}

export default function DataSourcesView({ onNavigateToGraph }: DataSourcesViewProps = {}) {
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [sources, setSources] = useState<DataSource[]>(mockDataSources);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Real Firebase Source State
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseStatusResponse | null>(null);
  const [firebasePaths, setFirebasePaths] = useState<FirebasePathsResponse | null>(null);
  const [firebaseSourceConfig, setFirebaseSourceConfig] = useState<FirebaseSourceConfigResponse | null>(null);
  const [isCheckingFirebase, setIsCheckingFirebase] = useState<boolean>(false);
  const [firebaseConnectionState, setFirebaseConnectionState] = useState<'connected' | 'unconfigured' | 'failed' | 'checking'>('checking');
  const [firebaseMessage, setFirebaseMessage] = useState<string>('Checking server configuration...');
  const [lastFirebaseCheck, setLastFirebaseCheck] = useState<string>('Just now');
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState<boolean>(false);
  const [mappingTarget, setMappingTarget] = useState<{
    sourceId: string;
    datasetId: string;
    datasetName: string;
    recordEstimate: number;
  }>({
    sourceId: 'firebase_rtdb',
    datasetId: 'companies',
    datasetName: 'Firebase Companies',
    recordEstimate: 10000,
  });

  // Initial load of Firebase status from real backend
  useEffect(() => {
    fetchFirebaseRealState();
  }, []);

  const fetchFirebaseRealState = async () => {
    setIsCheckingFirebase(true);
    setFirebaseConnectionState('checking');
    try {
      const statusData = await getFirebaseStatus();
      setFirebaseStatus(statusData);

      if (statusData.is_configured) {
        // Test connection and retrieve paths
        const testRes = await testFirebaseServerConnection();
        if (testRes.success) {
          setFirebaseConnectionState('connected');
          setFirebaseMessage(testRes.message || 'Firebase Realtime Database connected');
          try {
            const pathsData = await getFirebasePaths();
            setFirebasePaths(pathsData);
          } catch {
            // Ignore path fetch failures
          }
          try {
            const cfg = await getFirebaseSourceConfig();
            setFirebaseSourceConfig(cfg);
          } catch {
            // Ignore config fetch failures
          }
        } else {
          setFirebaseConnectionState('failed');
          setFirebaseMessage(testRes.message || 'Firebase connection failed');
        }
      } else {
        setFirebaseConnectionState('unconfigured');
        setFirebaseMessage('Firebase not configured on server');
      }
      setLastFirebaseCheck(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      setFirebaseConnectionState('failed');
      setFirebaseMessage('Backend service unreachable');
    } finally {
      setIsCheckingFirebase(false);
    }
  };

  const handleTestFirebaseConnection = async () => {
    setIsCheckingFirebase(true);
    try {
      const testRes = await testFirebaseServerConnection();
      if (testRes.success) {
        setFirebaseConnectionState('connected');
        setFirebaseMessage('✓ ' + (testRes.message || 'Firebase Realtime Database connected'));
        const pathsData = await getFirebasePaths();
        setFirebasePaths(pathsData);
      } else {
        setFirebaseConnectionState('failed');
        setFirebaseMessage('✗ ' + (testRes.message || 'Firebase connection failed'));
      }
      setLastFirebaseCheck(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setFirebaseConnectionState('failed');
      setFirebaseMessage('✗ ' + msg);
    } finally {
      setIsCheckingFirebase(false);
    }
  };

  const handleSync = (id: string) => {
    setIsSyncing(id);
    setTimeout(() => {
      setSources(prev => prev.map(s => s.id === id ? { ...s, lastSync: 'Just now', status: 'Healthy' } : s));
      setIsSyncing(null);
    }, 1200);
  };

  const totalConnectedCount = 5 + (firebaseConnectionState === 'connected' ? 1 : 0);

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
            {totalConnectedCount} Connected Sources
          </span>
        </div>
      </div>

      {/* DATA SOURCES CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* ============================================================ */}
        {/* REAL FIREBASE REALTIME DATABASE SOURCE CARD */}
        {/* ============================================================ */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-lg bg-[#040810]/90 border border-amber-500/30 hover:border-amber-500/60 transition-all flex flex-col justify-between space-y-4 shadow-lg relative overflow-hidden"
        >
          {/* Subtle amber accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40" />

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <Database className="w-3 h-3 text-amber-400" />
                NoSQL Database
              </span>

              <span
                className={`text-[10px] font-bold flex items-center gap-1.5 ${
                  firebaseConnectionState === 'connected'
                    ? 'text-emerald-400'
                    : firebaseConnectionState === 'checking'
                    ? 'text-cyan-400'
                    : firebaseConnectionState === 'unconfigured'
                    ? 'text-slate-400'
                    : 'text-rose-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    firebaseConnectionState === 'connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : firebaseConnectionState === 'checking'
                      ? 'bg-cyan-400 animate-ping'
                      : firebaseConnectionState === 'unconfigured'
                      ? 'bg-slate-500'
                      : 'bg-rose-500'
                  }`}
                />
                {firebaseConnectionState === 'connected'
                  ? 'Connected'
                  : firebaseConnectionState === 'checking'
                  ? 'Checking...'
                  : firebaseConnectionState === 'unconfigured'
                  ? 'Not Configured'
                  : 'Connection Failed'}
              </span>
            </div>

            <h3 className="text-sm font-bold font-sans text-slate-100 mb-1 flex items-center gap-2">
              Firebase Realtime Database
            </h3>
            <div className="text-[11px] text-slate-400 truncate font-mono">
              {firebaseStatus?.database_url || 'https://reason-chain-default-rtdb.firebaseio.com'}
            </div>
            {firebaseStatus?.project_id && (
              <div className="text-[10px] text-amber-400/80 mt-0.5">
                Project ID: <span className="text-slate-200 font-bold">{firebaseStatus.project_id}</span>
              </div>
            )}
            {firebaseMessage && (
              <div className="text-[10px] text-slate-400 mt-1 italic truncate">
                {firebaseMessage}
              </div>
            )}
          </div>

          <div className="space-y-2 p-3 rounded bg-[#02050a] border border-[#0e1c2e] text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Total Discovered Items:</span>
              <span className="font-bold text-amber-300">
                {firebasePaths ? firebasePaths.total_records.toLocaleString() : '10,000'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Source Hierarchy:</span>
              <span className="text-slate-200 font-bold">
                1 Source → {firebaseSourceConfig ? `${firebaseSourceConfig.selected_datasets_count} Active Datasets` : '2 Datasets'}
              </span>
            </div>
            
            {/* Datasets List in Card */}
            <div className="pt-1.5 border-t border-[#0e1c2e]/60 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Configured Datasets:</span>
              {(firebaseSourceConfig?.datasets || firebasePaths?.paths || [
                { dataset_id: 'companies', physical_identifier: '/companies', record_estimate: 10000, is_synthetic: false, included: true },
                { dataset_id: 'company_relationships', physical_identifier: '/company_relationships', record_estimate: 8, is_synthetic: true, included: true },
                { dataset_id: 'company_reference', physical_identifier: '/company_reference', record_estimate: 500, is_synthetic: false, included: false },
              ]).map((item: any) => {
                const name = item.dataset_id || item.name;
                const path = item.physical_identifier || item.path || `/${name}`;
                const count = item.record_estimate ?? item.record_count ?? 0;
                const isSynth = item.is_synthetic ?? (name === 'company_relationships');
                const isInc = item.included !== undefined ? item.included : (name !== 'company_reference');
                return (
                  <div key={name} className="flex items-center justify-between text-[11px] py-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={isInc ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                        {isInc ? '✓' : '✗'}
                      </span>
                      <span className={`font-mono ${isInc ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{path}</span>
                      {isSynth && (
                        <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          synth
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono text-[10px]">{count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-slate-400 pt-1 border-t border-[#0e1c2e]/40">
              <span>Server Auth:</span>
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3 h-3" /> Service Account
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Last Checked:</span>
              <span className="text-slate-300">{lastFirebaseCheck}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#0e1c2e]/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsFirebaseModalOpen(true)}
                className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 text-xs font-bold font-sans"
              >
                <FolderTree className="w-3.5 h-3.5" /> Inspect Datasets
              </button>

              <button
                onClick={() => {
                  setMappingTarget({
                    sourceId: 'firebase_rtdb',
                    datasetId: 'companies',
                    datasetName: 'Firebase Companies (/companies)',
                    recordEstimate: 10000,
                  });
                  setIsMappingModalOpen(true);
                }}
                className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 transition-all text-xs font-bold shadow-sm shadow-cyan-500/10"
                title="AI Mapping for /companies"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>Map /companies</span>
              </button>

              <button
                onClick={() => {
                  setMappingTarget({
                    sourceId: 'firebase_rtdb',
                    datasetId: 'company_relationships',
                    datasetName: 'Firebase Relationships (/company_relationships - Synthetic)',
                    recordEstimate: 8,
                  });
                  setIsMappingModalOpen(true);
                }}
                className="px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/40 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 flex items-center gap-1.5 transition-all text-xs font-bold shadow-sm shadow-purple-500/10"
                title="AI Mapping for /company_relationships (Synthetic)"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Map /relationships</span>
              </button>

              {onNavigateToGraph && (
                <button
                  onClick={() => onNavigateToGraph('firebase')}
                  className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 flex items-center gap-1.5 transition-all text-xs font-bold shadow-sm shadow-amber-500/10"
                  title="Explore Firebase Subgraph in Knowledge Graph"
                >
                  <Network className="w-3.5 h-3.5 text-amber-400" />
                  <span>View Graph</span>
                </button>
              )}
            </div>

            <button
              onClick={handleTestFirebaseConnection}
              disabled={isCheckingFirebase}
              className="px-3 py-1 rounded bg-[#081528] border border-amber-500/30 hover:border-amber-500/60 text-amber-300 hover:text-amber-200 flex items-center gap-1.5 transition-colors text-[11px] font-bold"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingFirebase ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isCheckingFirebase ? 'Checking...' : 'Test Connection'}</span>
            </button>
          </div>
        </motion.div>

        {/* ============================================================ */}
        {/* EXISTING RELATIONAL DATA SOURCES */}
        {/* ============================================================ */}
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

      {/* FIREBASE DISCOVERY MODAL */}
      <FirebaseDiscoveryModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
        databaseUrl={firebaseStatus?.database_url}
        projectId={firebaseStatus?.project_id}
      />

      {/* AI-ASSISTED SEMANTIC MAPPING & GOVERNANCE MODAL */}
      <MappingWorkflowModal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        sourceId={mappingTarget.sourceId}
        datasetId={mappingTarget.datasetId}
        datasetName={mappingTarget.datasetName}
        recordEstimate={mappingTarget.recordEstimate}
        onNavigateToGraph={onNavigateToGraph}
      />

      {/* RELATIONAL SCHEMA DETAILS MODAL */}
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
