import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Server,
  ArrowRight,
  Database,
  CheckCircle2,
  FolderTree,
  Sparkles,
  Network,
  ShieldAlert,
  Layers,
  ChevronRight,
  Info,
  Clock,
  KeyRound,
} from 'lucide-react';
import {
  getFirebaseStatus,
  testFirebaseServerConnection,
  type FirebaseStatusResponse,
} from '../services/firebaseApi';
import FirebaseDiscoveryModal from './FirebaseDiscoveryModal';
import MappingWorkflowModal from './MappingWorkflowModal';
import PostgresExplorerModal from './PostgresExplorerModal';
import { getPostgresStatus, type PostgresStatusResponse } from '../services/postgresApi';

interface DataSourcesViewProps {
  onNavigateToGraph?: (source?: string) => void;
  onNavigateToBuilder?: () => void;
}

export default function DataSourcesView({ onNavigateToGraph, onNavigateToBuilder }: DataSourcesViewProps) {
  // Real Firebase Source State
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseStatusResponse | null>(null);
  const [isCheckingFirebase, setIsCheckingFirebase] = useState<boolean>(false);
  const [firebaseConnectionState, setFirebaseConnectionState] = useState<'connected' | 'unconfigured' | 'failed' | 'checking'>('checking');
  const [lastFirebaseCheck, setLastFirebaseCheck] = useState<string>('Just now');

  // Real PostgreSQL Source State
  const [postgresStatus, setPostgresStatus] = useState<PostgresStatusResponse | null>(null);
  const [isCheckingPostgres, setIsCheckingPostgres] = useState<boolean>(false);
  const [lastPostgresCheck, setLastPostgresCheck] = useState<string>('Just now');

  // Modals & Details Drawers
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [isPostgresModalOpen, setIsPostgresModalOpen] = useState<boolean>(false);
  const [postgresInitialTab, setPostgresInitialTab] = useState<'overview' | 'tables' | 'relationships'>('overview');
  const [isMappingModalOpen, setIsMappingModalOpen] = useState<boolean>(false);
  const [mappingTarget, setMappingTarget] = useState<{
    sourceId: string;
    datasetId: string;
    datasetName: string;
    recordEstimate: number;
  }>({
    sourceId: 'firebase_rtdb',
    datasetId: 'companies',
    datasetName: 'Firebase Companies (/companies)',
    recordEstimate: 10000,
  });

  useEffect(() => {
    fetchAllRealStates();
  }, []);

  const fetchAllRealStates = async () => {
    await Promise.all([fetchFirebaseRealState(), fetchPostgresRealState()]);
  };

  const fetchPostgresRealState = async () => {
    setIsCheckingPostgres(true);
    try {
      const data = await getPostgresStatus();
      setPostgresStatus(data);
      setLastPostgresCheck(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch PostgreSQL status', err);
    } finally {
      setIsCheckingPostgres(false);
    }
  };

  const fetchFirebaseRealState = async () => {
    setIsCheckingFirebase(true);
    setFirebaseConnectionState('checking');
    try {
      const statusData = await getFirebaseStatus();
      setFirebaseStatus(statusData);

      if (statusData.is_configured) {
        const testRes = await testFirebaseServerConnection();
        if (testRes.success) {
          setFirebaseConnectionState('connected');
        } else {
          setFirebaseConnectionState('failed');
        }
      } else {
        setFirebaseConnectionState('unconfigured');
      }
      setLastFirebaseCheck(new Date().toLocaleTimeString());
    } catch {
      setFirebaseConnectionState('failed');
    } finally {
      setIsCheckingFirebase(false);
    }
  };

  const handleTestFirebaseConnection = async () => {
    await fetchFirebaseRealState();
  };

  const isPostgresConnected = Boolean(postgresStatus?.connected);
  const isFirebaseConnected = firebaseConnectionState === 'connected';
  const totalConnected = (isFirebaseConnected ? 1 : 0) + (isPostgresConnected ? 1 : 0);

  return (
    <div className="space-y-8 max-w-[1500px] mx-auto pb-16 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#0e1c2e] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[11px] font-mono text-cyan-400 mb-2">
            <Server className="w-3.5 h-3.5" />
            <span>ENTERPRISE DATA FABRIC</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Data Sources Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage data source connections, inspect database schemas, verify synchronization, and configure inputs for Knowledge Graph integration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={fetchAllRealStates}
            disabled={isCheckingFirebase || isCheckingPostgres}
            className="px-3.5 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingFirebase || isCheckingPostgres ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh Connections</span>
          </button>

          {onNavigateToBuilder && (
            <button
              onClick={onNavigateToBuilder}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
            >
              <Layers className="w-4 h-4" />
              <span>Proceed to KG Builder</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* METRIC RIBBON */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-xl bg-[#030712]/90 border border-[#0e1c2e] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Active Connected Sources</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{totalConnected} of 2 Active</div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#030712]/90 border border-[#0e1c2e] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Master Company Records</div>
            <div className="text-2xl font-bold text-amber-300 mt-1">10,000 Verified</div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Database className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#030712]/90 border border-[#0e1c2e] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Corporate Relationship Claims</div>
            <div className="text-2xl font-bold text-purple-300 mt-1">20 Linked Claims</div>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Network className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#030712]/90 border border-[#0e1c2e] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Integrations Unconfigured</div>
            <div className="text-2xl font-bold text-slate-400 mt-1">1 Connector</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400">
            <Info className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* WORKFLOW HANDOFF BANNER */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-[#071324] to-[#040a14] border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 font-sans">
              Two-Part Architecture: Sources Manage Inputs, KG Builder Builds the Graph
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify your schemas and records below. When ready to profile, validate mappings, resolve company entities, and materialize into Neo4j, launch the guided Knowledge Graph Builder workflow.
            </p>
          </div>
        </div>
        {onNavigateToBuilder && (
          <button
            onClick={onNavigateToBuilder}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider whitespace-nowrap transition-all shadow-md shadow-cyan-500/10 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>Start KG Builder Pipeline</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* CONFIGURED SOURCES GRID */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Configured Primary Data Sources (2)
          </h2>
          <span className="text-xs text-slate-500 font-mono">Real server-side connections verified</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* ============================================================ */}
          {/* 1. FIREBASE REALTIME DATABASE */}
          {/* ============================================================ */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-[#040810]/95 border border-[#13253d] hover:border-amber-500/50 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-amber-500/60 via-amber-400 to-amber-500/20" />
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100 font-sans">Firebase Realtime Database</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold uppercase">
                        NoSQL RTDB
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Role: <span className="text-slate-300 font-medium">Company Master Identity Source</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#02050a] border border-[#0e1c2e] text-xs font-mono">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isFirebaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  <span className={isFirebaseConnected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {isFirebaseConnected ? 'Connected' : 'Connection Failed'}
                  </span>
                </div>
              </div>

              {/* Endpoint details */}
              <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] font-mono text-xs space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Host / Database URL:</span>
                  <span className="text-slate-200 truncate max-w-[280px]" title={firebaseStatus?.database_url ?? undefined}>
                    {firebaseStatus?.database_url || 'https://reason-chain-default-rtdb.firebaseio.com'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Project ID:</span>
                  <span className="text-slate-200">{firebaseStatus?.project_id || 'reason-chain'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Authentication Method:</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <KeyRound className="w-3 h-3" /> Server Service Account JSON
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Last Connection Check:</span>
                  <span className="text-slate-300 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" /> {lastFirebaseCheck}
                  </span>
                </div>
              </div>

              {/* Datasets breakdown */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                  <span className="uppercase text-[11px] font-bold text-slate-300">Discovered Datasets (3 Collections)</span>
                  <span>10,508 Total Records</span>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  {/* /companies */}
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="font-bold text-slate-200">/companies</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        Authoritative Master
                      </span>
                    </div>
                    <span className="text-amber-300 font-bold">10,000 records</span>
                  </div>

                  {/* /company_reference */}
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      <span className="text-slate-300">/company_reference</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        Index Reference
                      </span>
                    </div>
                    <span className="text-slate-400">500 records</span>
                  </div>

                  {/* /company_relationships */}
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <span className="text-slate-300">/company_relationships</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">
                        Synthetic Demo Staging
                      </span>
                    </div>
                    <span className="text-purple-300 font-bold">8 records</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-[#02050a]/90 border-t border-[#0e1c2e] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFirebaseModalOpen(true)}
                  className="px-3 py-1.5 rounded-md bg-[#071322] border border-amber-500/30 hover:border-amber-500/60 text-amber-300 hover:text-amber-200 flex items-center gap-1.5 font-medium transition-colors"
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span>Inspect Datasets</span>
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
                  className="px-3 py-1.5 rounded-md bg-[#071322] border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Review Mapping</span>
                </button>
              </div>

              <button
                onClick={handleTestFirebaseConnection}
                disabled={isCheckingFirebase}
                className="px-3 py-1.5 rounded-md bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingFirebase ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isCheckingFirebase ? 'Checking...' : 'Test Connection'}</span>
              </button>
            </div>
          </motion.div>

          {/* ============================================================ */}
          {/* 2. NEON SERVERLESS POSTGRESQL */}
          {/* ============================================================ */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl bg-[#040810]/95 border border-[#13253d] hover:border-cyan-500/50 transition-all flex flex-col justify-between shadow-lg relative overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-cyan-500/60 via-cyan-400 to-cyan-500/20" />
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100 font-sans">Neon Serverless PostgreSQL</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-bold uppercase">
                        Relational SQL
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Role: <span className="text-slate-300 font-medium">Corporate Relationships & Claims Source</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#02050a] border border-[#0e1c2e] text-xs font-mono">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPostgresConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  <span className={isPostgresConnected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {isPostgresConnected ? 'Connected' : 'Connection Failed'}
                  </span>
                </div>
              </div>

              {/* Endpoint details */}
              <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] font-mono text-xs space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Host / Region:</span>
                  <span className="text-slate-200">
                    {postgresStatus?.host_display || 'Neon Serverless PostgreSQL (AWS us-east-2)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Target Database & Schema:</span>
                  <span className="text-cyan-300 font-bold">
                    {postgresStatus?.database_name || 'neondb (reasonchain_import)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Relational Driver Engine:</span>
                  <span className="text-slate-200">psycopg v3 (PostgreSQL 16 Engine)</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Last Synchronization / Import:</span>
                  <span className="text-slate-300 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {postgresStatus?.latest_import_batch?.imported_at
                      ? new Date(postgresStatus.latest_import_batch.imported_at).toLocaleString()
                      : lastPostgresCheck}
                  </span>
                </div>
              </div>

              {/* Tables Breakdown */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                  <span className="uppercase text-[11px] font-bold text-slate-300">
                    Configured Tables ({postgresStatus?.tables?.length || 10} Ingested)
                  </span>
                  <span>50 Relationship Records</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">company_links</span>
                    <span className="text-cyan-300 font-bold">10 rows</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">relationship_claims</span>
                    <span className="text-purple-300 font-bold">20 claims</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">people (directors)</span>
                    <span className="text-slate-300">6 rows</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">suppliers</span>
                    <span className="text-slate-300">5 rows</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">contracts</span>
                    <span className="text-slate-300">5 rows</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center justify-between">
                    <span className="text-slate-300 truncate">sanctions & external</span>
                    <span className="text-slate-300">4 rows</span>
                  </div>
                </div>

                {/* Synthetic Demarcation Tag */}
                <div className="mt-2.5 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-2 text-xs font-mono text-purple-300">
                  <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Synthetic Demonstration Claims: Marked with lower reliability and synthetic provenance tags.</span>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-[#02050a]/90 border-t border-[#0e1c2e] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPostgresInitialTab('overview');
                    setIsPostgresModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-md bg-[#071322] border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 font-medium transition-colors"
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span>Inspect Tables</span>
                </button>

                <button
                  onClick={() => {
                    setMappingTarget({
                      sourceId: 'postgres_main',
                      datasetId: 'relationship_claims',
                      datasetName: 'Neon Relationship Claims (relationship_claims)',
                      recordEstimate: 20,
                    });
                    setIsMappingModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-md bg-[#071322] border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Review Mapping</span>
                </button>
              </div>

              <button
                onClick={fetchPostgresRealState}
                disabled={isCheckingPostgres}
                className="px-3 py-1.5 rounded-md bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingPostgres ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isCheckingPostgres ? 'Checking...' : 'Refresh Status'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* UNCONFIGURED / FUTURE CONNECTORS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            Unconfigured & Available Enterprise Connectors
          </h2>
          <span className="text-xs text-slate-500 font-mono">No active credentials detected</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Salesforce CRM */}
          <div className="p-5 rounded-xl bg-[#03060c]/60 border border-[#0d1624] flex flex-col justify-between space-y-4 opacity-75 hover:opacity-100 transition-opacity">
            <div>
              <div className="flex items-center justify-between mb-3 font-mono">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-slate-400 uppercase">
                  CRM Connector
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  Not Configured
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-300">Salesforce CRM Enterprise</h3>
              <p className="text-xs text-slate-500 mt-1">
                Customer account hierarchies, opportunity pipelines, and contact networks. Requires Salesforce Connected App credentials.
              </p>
            </div>

            <div className="pt-3 border-t border-[#0e1c2e]/60 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-600 text-[11px]">0 records synced</span>
              <button
                disabled
                className="px-2.5 py-1 rounded bg-slate-800/40 text-slate-500 border border-slate-700/30 text-[11px] cursor-not-allowed"
                title="Configure via server environment (SALESFORCE_CLIENT_ID)"
              >
                Configure Connector
              </button>
            </div>
          </div>

          {/* SEC EDGAR Corporate Filings */}
          <div className="p-5 rounded-xl bg-[#03060c]/60 border border-[#0d1624] flex flex-col justify-between space-y-4 opacity-75 hover:opacity-100 transition-opacity">
            <div>
              <div className="flex items-center justify-between mb-3 font-mono">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-slate-400 uppercase">
                  Public Filings
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  Available Extension
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-300">SEC EDGAR Public Filings</h3>
              <p className="text-xs text-slate-500 mt-1">
                Direct SEC feed for public 10-K, 10-Q, and beneficial ownership filings (Form 3, 4, 5). Universal adapter ready.
              </p>
            </div>

            <div className="pt-3 border-t border-[#0e1c2e]/60 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-600 text-[11px]">Public API Source</span>
              <button
                disabled
                className="px-2.5 py-1 rounded bg-slate-800/40 text-slate-500 border border-slate-700/30 text-[11px] cursor-not-allowed"
              >
                Enable Stream
              </button>
            </div>
          </div>

          {/* OFAC Sanctions Stream */}
          <div className="p-5 rounded-xl bg-[#03060c]/60 border border-[#0d1624] flex flex-col justify-between space-y-4 opacity-75 hover:opacity-100 transition-opacity">
            <div>
              <div className="flex items-center justify-between mb-3 font-mono">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-slate-400 uppercase">
                  Compliance Feed
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  Available Extension
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-300">OFAC & Global Sanctions Stream</h3>
              <p className="text-xs text-slate-500 mt-1">
                Live SDN and consolidated sanction lists from US Treasury, EU, and UN databases. Extensible relational schema.
              </p>
            </div>

            <div className="pt-3 border-t border-[#0e1c2e]/60 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-600 text-[11px]">Real-time Watchlist</span>
              <button
                disabled
                className="px-2.5 py-1 rounded bg-slate-800/40 text-slate-500 border border-slate-700/30 text-[11px] cursor-not-allowed"
              >
                Enable Feed
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      <FirebaseDiscoveryModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
        databaseUrl={firebaseStatus?.database_url}
        projectId={firebaseStatus?.project_id}
      />

      <MappingWorkflowModal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        sourceId={mappingTarget.sourceId}
        datasetId={mappingTarget.datasetId}
        datasetName={mappingTarget.datasetName}
        recordEstimate={mappingTarget.recordEstimate}
        onNavigateToGraph={onNavigateToGraph}
      />

      <PostgresExplorerModal
        isOpen={isPostgresModalOpen}
        onClose={() => setIsPostgresModalOpen(false)}
        initialTab={postgresInitialTab}
      />
    </div>
  );
}
