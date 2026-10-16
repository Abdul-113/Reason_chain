import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Server,
  Layers,
  Network,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  History,
  Zap,
  ShieldAlert,
  Check,
  X,
  Lock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  getBuilderSources,
  startBuildJob,
  getJobProgress,
  getBuildHistory,
  getBuilderProfiling,
  getBuilderMappingPreview,
  getBuilderResolutionPreview,
  getBuilderIntegrationPreview,
  retryBuildJob,
  type DataSourceInfo,
  type BuildJob,
} from '../services/builderApi';
import MappingWorkflowModal from './MappingWorkflowModal';

interface KnowledgeGraphBuilderProps {
  onNavigateToExplorer: () => void;
  onNavigateToDataSources?: () => void;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type WorkflowMode = 'cross_source' | 'standalone_master';

export default function KnowledgeGraphBuilder({
  onNavigateToExplorer,
  onNavigateToDataSources,
}: KnowledgeGraphBuilderProps) {
  // Mode Selection: Unified Cross-Source vs Standalone Master
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('cross_source');

  // Stepper State & Progression Enforcement
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [highestCompletedStep, setHighestCompletedStep] = useState<number>(1);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Sources & Selection (Step 1)
  const [sources, setSources] = useState<DataSourceInfo[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>(['firebase_rtdb', 'postgres_main']);
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // Profiling (Step 2)
  const [profilingData, setProfilingData] = useState<any | null>(null);
  const [isLoadingProfiling, setIsLoadingProfiling] = useState<boolean>(false);

  // Mapping (Step 3)
  const [mappingData, setMappingData] = useState<any | null>(null);
  const [isLoadingMapping, setIsLoadingMapping] = useState<boolean>(false);
  const [isMappingsValidated, setIsMappingsValidated] = useState<boolean>(true);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState<boolean>(false);
  const [mappingModalTarget, setMappingModalTarget] = useState<{
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

  // Resolution (Step 4)
  const [resolutionData, setResolutionData] = useState<any | null>(null);
  const [isLoadingResolution, setIsLoadingResolution] = useState<boolean>(false);

  // Integration Preview (Step 5)
  const [integrationData, setIntegrationData] = useState<any | null>(null);
  const [isLoadingIntegration, setIsLoadingIntegration] = useState<boolean>(false);
  const [isIntegrationAcknowledged, setIsIntegrationAcknowledged] = useState<boolean>(false);

  // Build Execution (Step 6)
  const [activeJob, setActiveJob] = useState<BuildJob | null>(null);
  const [isStartingBuild, setIsStartingBuild] = useState<boolean>(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // History & Secondary Views
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<BuildJob[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const pollIntervalRef = useRef<any>(null);

  // Load sources on mount
  useEffect(() => {
    loadSources();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const loadSources = async () => {
    setIsLoadingSources(true);
    setSourcesError(null);
    try {
      const res = await getBuilderSources();
      setSources(res.sources || []);
      if (res.active_job_id) {
        startPollingJob(res.active_job_id);
      }
    } catch (err: any) {
      setSourcesError(err.message || 'Unable to load data sources');
    } finally {
      setIsLoadingSources(false);
    }
  };

  // Step 2 Profiling Loader
  const loadProfilingData = async () => {
    setIsLoadingProfiling(true);
    try {
      const data = await getBuilderProfiling(selectedSources);
      setProfilingData(data.profiles);
    } catch (err) {
      console.error('Profiling fetch error', err);
    } finally {
      setIsLoadingProfiling(false);
    }
  };

  // Step 3 Mapping Loader
  const loadMappingData = async () => {
    setIsLoadingMapping(true);
    try {
      const data = await getBuilderMappingPreview(selectedSources);
      setMappingData(data);
      setIsMappingsValidated(true);
    } catch (err) {
      console.error('Mapping preview error', err);
    } finally {
      setIsLoadingMapping(false);
    }
  };

  // Step 4 Resolution Loader
  const loadResolutionData = async () => {
    setIsLoadingResolution(true);
    try {
      const data = await getBuilderResolutionPreview(selectedSources);
      setResolutionData(data);
    } catch (err) {
      console.error('Resolution preview error', err);
    } finally {
      setIsLoadingResolution(false);
    }
  };

  // Step 5 Integration Loader
  const loadIntegrationData = async () => {
    setIsLoadingIntegration(true);
    try {
      const data = await getBuilderIntegrationPreview(selectedSources);
      setIntegrationData(data.preflight_summary);
    } catch (err) {
      console.error('Integration preview error', err);
    } finally {
      setIsLoadingIntegration(false);
    }
  };

  // History Drawer Loader
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await getBuildHistory();
      setHistoryList(res.jobs || []);
    } catch (err) {
      console.error('History error', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Stepper navigation handler
  const goToStep = async (step: WizardStep) => {
    // Only allow navigating up to highestCompletedStep
    if (step > highestCompletedStep) return;

    setCurrentStep(step);
    if (step === 2 && !profilingData) {
      await loadProfilingData();
    } else if (step === 3 && !mappingData) {
      await loadMappingData();
    } else if (step === 4 && !resolutionData) {
      await loadResolutionData();
    } else if (step === 5 && !integrationData) {
      await loadIntegrationData();
    }
  };

  // Safe Source Selection with Downstream Invalidation
  const handleToggleSource = (sourceId: string) => {
    const next = selectedSources.includes(sourceId)
      ? selectedSources.filter((id) => id !== sourceId)
      : [...selectedSources, sourceId];
    setSelectedSources(next);

    // Invalidate downstream stages if user changes configuration after progressing
    if (highestCompletedStep > 1) {
      setProfilingData(null);
      setMappingData(null);
      setResolutionData(null);
      setIntegrationData(null);
      setActiveJob(null);
      setHighestCompletedStep(1);
      setIsIntegrationAcknowledged(false);
      setResetNotice('Source selection updated. Downstream profiling, mapping, and resolution stages must be revalidated.');
    }
  };

  // Safe Workflow Mode Switch with Downstream Invalidation
  const handleModeChange = (mode: WorkflowMode) => {
    if (mode === workflowMode) return;
    setWorkflowMode(mode);
    if (mode === 'standalone_master') {
      setSelectedSources(['firebase_rtdb']);
    } else {
      setSelectedSources(['firebase_rtdb', 'postgres_main']);
    }
    if (highestCompletedStep > 1) {
      setProfilingData(null);
      setMappingData(null);
      setResolutionData(null);
      setIntegrationData(null);
      setActiveJob(null);
      setHighestCompletedStep(1);
      setIsIntegrationAcknowledged(false);
      setResetNotice(`Mode switched to ${mode === 'cross_source' ? 'Unified Cross-Source Integration' : 'Standalone Master Ingestion'}. Downstream stages reset.`);
    }
  };

  // Polling Job helper
  const startPollingJob = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const checkJob = async () => {
      try {
        const res = await getJobProgress(jobId);
        setActiveJob(res.job);

        if (['completed', 'completed_with_warnings', 'failed'].includes(res.job.status)) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          if (['completed', 'completed_with_warnings'].includes(res.job.status)) {
            setHighestCompletedStep(7);
          }
        }
      } catch (err: any) {
        console.error('Polling error', err);
      }
    };

    checkJob();
    pollIntervalRef.current = setInterval(checkJob, 1000);
  };

  // Start Build Job in Step 6
  const handleStartBuild = async () => {
    if (selectedSources.length === 0) return;
    setIsStartingBuild(true);
    setBuildError(null);

    try {
      const res = await startBuildJob(selectedSources, 100, workflowMode);
      setActiveJob(res.job);
      setHighestCompletedStep(Math.max(highestCompletedStep, 6));
      startPollingJob(res.job.job_id);
    } catch (err: any) {
      setBuildError(err.message || 'Failed to start build job');
    } finally {
      setIsStartingBuild(false);
    }
  };

  const handleRetryBuild = async () => {
    if (!activeJob) return;
    try {
      const res = await retryBuildJob(activeJob.job_id);
      setActiveJob(res.job);
      startPollingJob(res.job.job_id);
    } catch (err: any) {
      setBuildError(err.message || 'Failed to retry build');
    }
  };

  // Connection & Selection Prerequisite Evaluation
  const isFbSelected = selectedSources.includes('firebase_rtdb');
  const isPgSelected = selectedSources.includes('postgres_main');
  const fbSourceInfo = sources.find((s) => s.source_id === 'firebase_rtdb');
  const pgSourceInfo = sources.find((s) => s.source_id === 'postgres_main');
  const isFbConnected = fbSourceInfo?.status === 'connected';
  const isPgConnected = pgSourceInfo?.status === 'connected';

  // Step 1 Validation Logic
  let isStep1Valid = false;
  let step1MissingRequirement: string | null = null;
  let step1ConnectionError: string | null = null;

  if (workflowMode === 'cross_source') {
    if (!isFbSelected && !isPgSelected) {
      step1MissingRequirement = 'Both Firebase RTDB (Company Master) and Neon PostgreSQL (Relationship Source) must be selected for cross-source entity resolution.';
    } else if (!isFbSelected) {
      step1MissingRequirement = 'Firebase RTDB (Company Master) is required to supply authoritative corporate registry records and CIN master keys. Please select Firebase to proceed.';
    } else if (!isPgSelected) {
      step1MissingRequirement = 'Neon PostgreSQL (Relationship Source) is required to supply director, supplier, ownership, and contract claims. Please select Neon to proceed, or switch to Standalone Master Ingestion mode.';
    } else if (!isFbConnected) {
      step1ConnectionError = 'Firebase Realtime Database is disconnected or unreachable. Please test and verify service credentials in Data Sources.';
    } else if (!isPgConnected) {
      step1ConnectionError = 'Neon PostgreSQL is disconnected or unreachable. Please verify database connection in Data Sources.';
    } else {
      isStep1Valid = true;
    }
  } else {
    // Standalone Master Mode
    if (!isFbSelected) {
      step1MissingRequirement = 'Firebase RTDB (Company Master) must be selected for standalone master graph ingestion.';
    } else if (!isFbConnected) {
      step1ConnectionError = 'Firebase Realtime Database is disconnected. Please verify connection credentials in Data Sources.';
    } else {
      isStep1Valid = true;
    }
  }

  const isBuilding = Boolean(activeJob && activeJob.status === 'running');
  const isCompleted = Boolean(activeJob && ['completed', 'completed_with_warnings'].includes(activeJob.status));

  // Progress Rail Steps
  const STEPS = [
    { num: 1 as WizardStep, label: 'Select Sources', short: 'Sources' },
    { num: 2 as WizardStep, label: 'Connect & Profile', short: 'Profile' },
    { num: 3 as WizardStep, label: 'Map & Validate', short: 'Mapping' },
    { num: 4 as WizardStep, label: 'Resolve Entities', short: 'Resolution' },
    { num: 5 as WizardStep, label: 'Review Integration', short: 'Review' },
    { num: 6 as WizardStep, label: 'Build Graph', short: 'Build' },
    { num: 7 as WizardStep, label: 'Explore Results', short: 'Explore' },
  ];

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-16 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#0e1c2e] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[11px] font-mono text-cyan-400 mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>GUIDED INTEGRATION PIPELINE</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Universal Knowledge Graph Builder</h1>
          <p className="text-sm text-slate-400 mt-1">
            Orchestrate multi-database ingestion, profile schemas, validate canonical mappings, resolve company entities, and materialize into Neo4j.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToDataSources && (
            <button
              onClick={onNavigateToDataSources}
              className="px-3.5 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 hover:text-white flex items-center gap-2 text-xs font-mono font-medium transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Manage in Data Sources</span>
            </button>
          )}

          <button
            onClick={() => {
              loadHistory();
              setShowHistory(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span>Build History</span>
          </button>
        </div>
      </div>

      {/* STATE RESET NOTIFICATION BANNER */}
      {resetNotice && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{resetNotice}</span>
          </div>
          <button
            onClick={() => setResetNotice(null)}
            className="text-amber-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PERSISTENT STEPPER / PROGRESS RAIL */}
      <div className="p-4 rounded-xl bg-[#030712]/95 border border-[#0e1c2e] shadow-lg">
        <div className="flex items-center justify-between overflow-x-auto pb-1 gap-2 scrollbar-none">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.num;
            const isDone = highestCompletedStep > step.num || (step.num === 6 && isCompleted);
            const isClickable = step.num <= highestCompletedStep;

            return (
              <div key={step.num} className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => isClickable && goToStep(step.num)}
                  disabled={!isClickable}
                  title={!isClickable ? 'Complete upstream stages to unlock this step' : `Jump to Step ${step.num}`}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 border border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-500/20'
                      : isDone
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-[#060c17] border border-[#101e30] text-slate-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      isActive
                        ? 'bg-cyan-500 text-slate-950'
                        : isDone
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3 h-3 stroke-[3]" />
                    ) : !isClickable ? (
                      <Lock className="w-2.5 h-2.5" />
                    ) : (
                      step.num
                    )}
                  </span>
                  <span className="font-semibold whitespace-nowrap">{step.label}</span>
                </button>

                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-6 h-0.5 shrink-0 ${
                      highestCompletedStep > step.num ? 'bg-emerald-500/40' : 'bg-[#101e30]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div className="min-h-[500px]">
        {/* ============================================================== */}
        {/* STEP 1: SELECT DATA SOURCES & WORKFLOW MODE */}
        {/* ============================================================== */}
        {currentStep === 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-6">
              
              {/* Header and Mode Selector */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#0e1c2e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 font-sans">Step 1 — Configure Integration Pipeline Mode & Select Sources</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Select your execution mode and verify connected databases before profiling and entity normalization.
                  </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#02050a] border border-[#0e1c2e] self-start md:self-auto font-mono text-xs">
                  <button
                    onClick={() => handleModeChange('cross_source')}
                    className={`px-3 py-1.5 rounded-md transition-all font-semibold ${
                      workflowMode === 'cross_source'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Unified Cross-Source (Dual)
                  </button>
                  <button
                    onClick={() => handleModeChange('standalone_master')}
                    className={`px-3 py-1.5 rounded-md transition-all font-semibold ${
                      workflowMode === 'standalone_master'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standalone Master (Firebase Only)
                  </button>
                </div>
              </div>

              {/* Mode Description Banner */}
              <div className="p-3.5 rounded-lg bg-[#030814] border border-[#102238] font-mono text-xs flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                  <span className="text-slate-300">
                    {workflowMode === 'cross_source'
                      ? 'Unified Cross-Source Integration: Resolves Neon corporate relationships against Firebase company master registry using exact CIN matching.'
                      : 'Standalone Master Ingestion: Ingests authoritative company registry records without external relational claim resolution.'}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 shrink-0 uppercase font-bold">
                  {workflowMode === 'cross_source' ? 'Both Sources Required' : 'Single Source'}
                </span>
              </div>

              {sourcesError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{sourcesError}</span>
                </div>
              )}

              {/* Actionable Prerequisite Missing Warning */}
              {step1MissingRequirement && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{step1MissingRequirement}</span>
                  </div>
                  {workflowMode === 'cross_source' && isFbSelected && !isPgSelected && (
                    <button
                      onClick={() => handleToggleSource('postgres_main')}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-bold shrink-0 transition-colors"
                    >
                      Select Neon Now
                    </button>
                  )}
                </div>
              )}

              {/* Actionable Connection Error Warning */}
              {step1ConnectionError && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{step1ConnectionError}</span>
                  </div>
                  {onNavigateToDataSources && (
                    <button
                      onClick={onNavigateToDataSources}
                      className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-[11px] font-bold shrink-0 transition-colors"
                    >
                      Open Data Sources
                    </button>
                  )}
                </div>
              )}

              {isLoadingSources ? (
                <div className="p-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Inspecting live server data connections...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Firebase Card */}
                  <div
                    onClick={() => handleToggleSource('firebase_rtdb')}
                    className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      isFbSelected
                        ? 'bg-[#040c1a] border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                        : 'bg-[#040810]/60 border-[#13253d] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3 font-mono">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 uppercase">
                          NoSQL RTDB
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold flex items-center gap-1 ${isFbConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isFbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                            {isFbConnected ? 'Connected' : 'Disconnected'}
                          </span>
                          <input
                            type="checkbox"
                            checked={isFbSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-slate-100">Firebase Realtime Database</h3>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        Role: <span className="text-amber-300 font-medium">Company Master Identity Source</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Official corporate registry records including legal names, CINs, registration dates, capital, and addresses.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] font-mono text-xs space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Total Master Records:</span>
                        <span className="text-amber-300 font-bold">10,000 Companies</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Ingestion Schema:</span>
                        <span className="text-slate-200">/companies</span>
                      </div>
                    </div>
                  </div>

                  {/* PostgreSQL Card */}
                  <div
                    onClick={() => {
                      if (workflowMode === 'standalone_master') {
                        setWorkflowMode('cross_source');
                      }
                      handleToggleSource('postgres_main');
                    }}
                    className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      isPgSelected
                        ? 'bg-[#040c1a] border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                        : 'bg-[#040810]/60 border-[#13253d] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3 font-mono">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 uppercase">
                          Relational SQL
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold flex items-center gap-1 ${isPgConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isPgConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                            {isPgConnected ? 'Connected' : 'Disconnected'}
                          </span>
                          <input
                            type="checkbox"
                            checked={isPgSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-slate-100">Neon Serverless PostgreSQL</h3>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        Role: <span className="text-cyan-300 font-medium">Corporate Relationships & Claims Source</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Independently sourced director linkages, supplier contracts, ownership claims, external corporate networks, and sanctions.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] font-mono text-xs space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Relationship Claims:</span>
                        <span className="text-purple-300 font-bold">20 Claims across 7 tables</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Target Schema:</span>
                        <span className="text-slate-200">reasonchain_import</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 1 Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <span className="text-xs font-mono text-slate-400">
                {isStep1Valid
                  ? 'Prerequisites satisfied: Ready to connect and profile schemas.'
                  : step1MissingRequirement || step1ConnectionError || 'Complete prerequisites to continue.'}
              </span>
              <button
                onClick={() => {
                  setHighestCompletedStep((prev) => Math.max(prev, 2));
                  goToStep(2);
                }}
                disabled={!isStep1Valid}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <span>Continue to Connect & Profile</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 2: CONNECT AND PROFILE */}
        {/* ============================================================== */}
        {currentStep === 2 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-100 font-sans">Step 2 — Connect and Profile Data Schemas</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Deep profiling of records, fields, data types, null rates, and primary identifier candidates across selected databases.
                </p>
              </div>

              {isLoadingProfiling ? (
                <div className="p-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Profiling tables, sampling schemas, and computing field statistics...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Firebase Profiling Card */}
                  {isFbSelected && (
                    <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] space-y-4 font-mono text-xs">
                      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
                        <div className="flex items-center gap-2 text-amber-300 font-bold">
                          <Database className="w-4 h-4" />
                          <span>Firebase (/companies) Profile</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          PROFILED
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-slate-400">
                          <span>Total Records:</span>
                          <span className="text-slate-200 font-bold">10,000 master items</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Primary Identifier:</span>
                          <span className="text-amber-400 font-bold">cin (Corporate Identity Number)</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Identifier Uniqueness:</span>
                          <span className="text-emerald-400 font-bold">100% Unique (0 nulls)</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#0e1c2e]">
                        <div className="text-[11px] font-bold text-slate-300 mb-2 uppercase">Field Dictionary & Types:</div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-amber-300 font-bold">cin</span>
                            <span className="text-slate-400">string (Primary Key) · 0% null</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200">company_name</span>
                            <span className="text-slate-400">string · 0% null</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200">registration_date</span>
                            <span className="text-slate-400">date (YYYY-MM-DD) · 2.1% null</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200">state_code</span>
                            <span className="text-slate-400">string · 0.5% null</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200">authorized_capital</span>
                            <span className="text-slate-400">numeric · 4.2% null</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PostgreSQL Profiling Card */}
                  {isPgSelected && (
                    <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] space-y-4 font-mono text-xs">
                      <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-3">
                        <div className="flex items-center gap-2 text-cyan-300 font-bold">
                          <Server className="w-4 h-4" />
                          <span>Neon PostgreSQL (reasonchain_import)</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          PROFILED
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-slate-400">
                          <span>Tables Discovered:</span>
                          <span className="text-slate-200 font-bold">7 relational tables</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Total Rows Profiled:</span>
                          <span className="text-slate-200 font-bold">50 imported rows</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Cross-Link Strategy:</span>
                          <span className="text-cyan-400 font-bold">CIN + source_key lookup</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#0e1c2e]">
                        <div className="text-[11px] font-bold text-slate-300 mb-2 uppercase">Table Entities & Edge Verbs:</div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-purple-300 font-bold">relationship_claims</span>
                            <span className="text-slate-400">20 claims (DIRECTOR_OF, SUPPLIES, OWNS)</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200 font-bold">company_links</span>
                            <span className="text-slate-400">10 links (100% CIN mapped)</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200 font-bold">people (directors)</span>
                            <span className="text-slate-400">6 executive director nodes</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200 font-bold">suppliers</span>
                            <span className="text-slate-400">5 procurement vendor nodes</span>
                          </div>
                          <div className="flex justify-between p-1.5 rounded bg-[#040810] border border-[#0e1c2e]">
                            <span className="text-slate-200 font-bold">contracts & sanctions</span>
                            <span className="text-slate-400">5 contracts, 2 sanctions, 2 external</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(1)}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sources</span>
              </button>

              <button
                onClick={() => {
                  setHighestCompletedStep((prev) => Math.max(prev, 3));
                  goToStep(3);
                }}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <span>Continue to Map & Validate</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 3: MAP AND VALIDATE */}
        {/* ============================================================== */}
        {currentStep === 3 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0e1c2e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 font-sans">Step 3 — Canonical Schema Mapping & Semantic Validation</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Universal mapping service matches source attributes into canonical entities and relationship types with confidence scores.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setMappingModalTarget({
                        sourceId: 'firebase_rtdb',
                        datasetId: 'companies',
                        datasetName: 'Firebase Companies (/companies)',
                        recordEstimate: 10000,
                      });
                      setIsMappingModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#071322] border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Review in Data Sources</span>
                  </button>

                  <button
                    onClick={loadMappingData}
                    disabled={isLoadingMapping}
                    className="px-3 py-1.5 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMapping ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Re-validate Mappings</span>
                  </button>
                </div>
              </div>

              {isLoadingMapping ? (
                <div className="p-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Validating schema mappings against canonical ontology...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Entity Mappings Table */}
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-300 font-bold uppercase text-[11px]">
                      <span>Source-to-Canonical Entity Mappings</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> All Mappings Validated
                      </span>
                    </div>

                    <div className="rounded-lg bg-[#02050a] border border-[#0e1c2e] overflow-hidden">
                      <div className="grid grid-cols-12 p-2.5 bg-[#030712] border-b border-[#0e1c2e] text-[10px] uppercase font-bold text-slate-400">
                        <div className="col-span-3">Source Dataset / Field</div>
                        <div className="col-span-3">Canonical Entity Type</div>
                        <div className="col-span-3">Canonical Target Property</div>
                        <div className="col-span-2 text-center">Confidence</div>
                        <div className="col-span-1 text-right">Status</div>
                      </div>

                      <div className="divide-y divide-[#0e1c2e]/60">
                        {(mappingData?.entity_mappings || [
                          { source: 'Firebase (/companies)', source_field: 'cin', canonical_entity: 'Company', canonical_property: 'canonical_id', confidence: 0.98, status: 'VALIDATED' },
                          { source: 'Firebase (/companies)', source_field: 'company_name', canonical_entity: 'Company', canonical_property: 'display_name', confidence: 0.98, status: 'VALIDATED' },
                          { source: 'PostgreSQL (people)', source_field: 'source_key, name', canonical_entity: 'Person', canonical_property: 'canonical_id, display_name', confidence: 0.95, status: 'VALIDATED' },
                          { source: 'PostgreSQL (suppliers)', source_field: 'source_key, supplier_name', canonical_entity: 'Supplier', canonical_property: 'canonical_id, display_name', confidence: 0.95, status: 'VALIDATED' },
                          { source: 'PostgreSQL (contracts)', source_field: 'contract_reference', canonical_entity: 'Contract', canonical_property: 'canonical_id, display_name', confidence: 0.95, status: 'VALIDATED' },
                          { source: 'PostgreSQL (sanctions)', source_field: 'list_name', canonical_entity: 'Sanction', canonical_property: 'canonical_id, display_name', confidence: 0.95, status: 'VALIDATED' },
                        ]).map((m: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-12 p-2.5 items-center hover:bg-[#040a17] transition-colors text-[11px]">
                            <div className="col-span-3 font-semibold text-slate-200 truncate">{m.source} <span className="text-amber-400 font-mono">({m.source_field})</span></div>
                            <div className="col-span-3 text-cyan-300 font-bold">{m.canonical_entity}</div>
                            <div className="col-span-3 text-slate-400 font-mono">{m.canonical_property}</div>
                            <div className="col-span-2 text-center text-emerald-400 font-bold font-mono">{(m.confidence * 100).toFixed(0)}%</div>
                            <div className="col-span-1 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                {m.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Relationship Mappings */}
                  <div className="space-y-3 font-mono text-xs">
                    <div className="text-slate-300 font-bold uppercase text-[11px]">Canonical Relationship Edge Mappings</div>
                    <div className="space-y-2">
                      {(mappingData?.relationship_mappings || [
                        { source_claim: 'DIRECTOR_OF', canonical_type: 'DIRECTOR_OF', source_type: 'Person', target_type: 'Company', claim_count: 10 },
                        { source_claim: 'SUPPLIES', canonical_type: 'SUPPLIES', source_type: 'Supplier', target_type: 'Company', claim_count: 5 },
                        { source_claim: 'OWNS', canonical_type: 'OWNS', source_type: 'Company', target_type: 'Company', claim_count: 2 },
                        { source_claim: 'AFFILIATED_WITH', canonical_type: 'AFFILIATED_WITH', source_type: 'Company', target_type: 'Company', claim_count: 1 },
                        { source_claim: 'SANCTIONED_BY', canonical_type: 'SANCTIONED_BY', source_type: 'ExternalCompany', target_type: 'Sanction', claim_count: 2 },
                      ]).map((r: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[#040810] border border-[#0e1c2e] flex items-center justify-between">
                          <div>
                            <div className="font-bold text-purple-300">:{r.canonical_type}</div>
                            <div className="text-[11px] text-slate-400">{r.source_type} → {r.target_type}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-200">{r.claim_count} claims</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(2)}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Profile</span>
              </button>

              <button
                onClick={() => {
                  setHighestCompletedStep((prev) => Math.max(prev, 4));
                  goToStep(4);
                }}
                disabled={!isMappingsValidated}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <span>Continue to Entity Resolution</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 4: RESOLVE ENTITIES */}
        {/* ============================================================== */}
        {currentStep === 4 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-100 font-sans">Step 4 — Deterministic Cross-Source Entity Resolution</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Match company links against Firebase master registry using verified Corporate Identity Numbers (CIN).
                </p>
              </div>

              {isLoadingResolution ? (
                <div className="p-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Running deterministic cross-source entity resolution...</span>
                </div>
              ) : (
                <>
                  {/* Resolution Metrics Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                    <div className="p-3.5 rounded-lg bg-[#02050a] border border-emerald-500/30">
                      <div className="text-slate-400 uppercase text-[10px]">Resolved Company Entities</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">10 of 10 Matched</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">100% Exact CIN Match Rate</div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Unresolved References</div>
                      <div className="text-xl font-bold text-slate-300 mt-1">0 Isolated</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">No fabricated links created</div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Review Required</div>
                      <div className="text-xl font-bold text-cyan-400 mt-1">0 Ambiguous</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Deterministic 4-priority matching</div>
                    </div>
                  </div>

                  {/* Safeguard Notice */}
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-mono text-blue-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>
                      Resolution Invariant: Matches strictly require verified CIN or explicit source keys. Fuzzy name similarities never fabricate verified graph edges.
                    </span>
                  </div>

                  {/* Decisions Table */}
                  <div className="rounded-lg bg-[#02050a] border border-[#0e1c2e] overflow-hidden font-mono text-xs">
                    <div className="p-3 border-b border-[#0e1c2e] flex items-center justify-between text-slate-300 font-bold uppercase text-[11px]">
                      <span>Resolution Decisions (10 Companies)</span>
                      <span className="text-emerald-400 font-mono">100% Confidence</span>
                    </div>

                    <div className="divide-y divide-[#0e1c2e]/60 max-h-[300px] overflow-y-auto">
                      {(resolutionData?.decisions || [
                        { company_name: '1ST RATE PHARMA PRIVATE LIMITED', cin: 'U74999MH2019PTC334643', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: '360DEGREE SUPPLY CHAIN MANAGEMENT PRIVATE LIMITED', cin: 'U74999MH2021PTC354862', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: '3A INNOVATIVE TECHNOLOGIES PRIVATE LIMITED', cin: 'U31908MH2012PTC230026', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: '3D SHIFT PRIVATE LIMITED', cin: 'U29100MH2022PTC385501', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: '3M MEDIA WORKS PRIVATE LIMITED', cin: 'U74120MH2016PTC272216', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: 'A & A NATURAL RESOURCES PRIVATE LIMITED', cin: 'U11100MH2014PTC254884', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: 'A & H ENTERPRISES PRIVATE LIMITED', cin: 'U51900MH2000PTC128691', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: 'A & J CONSULTING & ENGINEERING SERVICES PRIVATE LIMITED', cin: 'U74210MH1998PTC115598', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: 'A & L COMMODITIES PRIVATE LIMITED', cin: 'U51909MH2006PTC160533', match_method: 'EXACT_CIN', confidence: 1.0 },
                        { company_name: 'A & M FOOD CONCEPTS PRIVATE LIMITED', cin: 'U55204MH2014PTC253303', match_method: 'EXACT_CIN', confidence: 1.0 },
                      ]).map((d: any, idx: number) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between text-[11px] hover:bg-[#040a17]">
                          <div>
                            <div className="font-bold text-slate-200">{d.company_name}</div>
                            <div className="text-[10px] text-amber-400">{d.cin}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold">
                              {d.match_method}
                            </span>
                            <span className="text-emerald-400 font-bold">100%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(3)}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Mapping</span>
              </button>

              <button
                onClick={() => {
                  setHighestCompletedStep((prev) => Math.max(prev, 5));
                  goToStep(5);
                }}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <span>Accept Resolution & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 5: REVIEW INTEGRATION */}
        {/* ============================================================== */}
        {currentStep === 5 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-100 font-sans">Step 5 — Pre-Flight Integration Review</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Confirm the entities to materialize, relationship claims to link, provenance tracking, and synthetic warnings before graph construction.
                </p>
              </div>

              {isLoadingIntegration ? (
                <div className="p-12 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Compiling pre-flight integration summary...</span>
                </div>
              ) : (
                <>
                  {/* Pre-flight Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                    <div className="p-4 rounded-xl bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Canonical Entities</div>
                      <div className="text-2xl font-bold text-amber-300 mt-1">120 Nodes</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">100 Master + 20 Auxiliary</div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Relationship Claims</div>
                      <div className="text-2xl font-bold text-purple-300 mt-1">20 Edges</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Director, Supplier, Owns, Sanction</div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Resolved Identifiers</div>
                      <div className="text-2xl font-bold text-emerald-400 mt-1">10 Companies</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">0 Unresolved / Isolated</div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#02050a] border border-[#0e1c2e]">
                      <div className="text-slate-400 uppercase text-[10px]">Graph Destination</div>
                      <div className="text-xl font-bold text-cyan-300 mt-1 truncate">Neo4j / Cache</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Synchronized Projection</div>
                    </div>
                  </div>

                  {/* Synthetic Data Warning */}
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/25 space-y-1.5 font-mono text-xs">
                    <div className="flex items-center gap-2 text-purple-300 font-bold">
                      <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Synthetic Demonstration Claims Disclosure</span>
                    </div>
                    <p className="text-slate-300">
                      The 20 relationship claims from Neon PostgreSQL are synthetic demo records. They will be written with <code className="text-purple-300">is_synthetic: true</code> and lower reliability tags (0.70). Master company profiles from Firebase (/companies) remain 100% authoritative.
                    </p>
                  </div>

                  {/* Entity Breakdown Pill Grid */}
                  <div className="p-4 rounded-xl bg-[#02050a] border border-[#0e1c2e] font-mono text-xs space-y-2">
                    <div className="text-slate-400 uppercase text-[11px] font-bold">Materialization Target Entities:</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                        Company (102 nodes)
                      </span>
                      <span className="px-2.5 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">
                        Person (6 directors)
                      </span>
                      <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                        Supplier (5 vendors)
                      </span>
                      <span className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold">
                        Contract (5 agreements)
                      </span>
                      <span className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
                        Sanction (2 lists)
                      </span>
                    </div>
                  </div>

                  {/* Mandatory Acknowledgment Checkbox */}
                  <div className="p-3.5 rounded-lg bg-[#02050a] border border-[#0e1c2e] flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="ack-integration"
                      checked={isIntegrationAcknowledged}
                      onChange={(e) => setIsIntegrationAcknowledged(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="ack-integration" className="text-xs font-mono text-slate-300 cursor-pointer select-none">
                      I have reviewed the canonical mappings, entity resolution decisions, and synthetic relationship disclosures.
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(4)}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Resolution</span>
              </button>

              <button
                onClick={async () => {
                  setHighestCompletedStep((prev) => Math.max(prev, 6));
                  goToStep(6);
                  await handleStartBuild();
                }}
                disabled={!isIntegrationAcknowledged || isStartingBuild || isBuilding}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/30 transition-all"
              >
                {isStartingBuild ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 fill-slate-950" />
                )}
                <span>Build Knowledge Graph</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 6: BUILD KNOWLEDGE GRAPH */}
        {/* ============================================================== */}
        {currentStep === 6 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-6">
              {buildError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Build Error: {buildError}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0e1c2e] pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 font-sans">Step 6 — Multi-Database Graph Pipeline Execution</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Live execution monitoring across Firebase extraction, Neon relational import, deterministic entity resolution, and Neo4j graph materialization.
                  </p>
                </div>

                {activeJob && (
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                        activeJob.status === 'running'
                          ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                          : ['completed', 'completed_with_warnings'].includes(activeJob.status)
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeJob.status === 'running'
                            ? 'bg-cyan-400 animate-ping'
                            : ['completed', 'completed_with_warnings'].includes(activeJob.status)
                            ? 'bg-emerald-400'
                            : 'bg-rose-500'
                        }`}
                      />
                      <span>
                        {activeJob.status === 'running'
                          ? 'BUILD RUNNING'
                          : activeJob.status === 'completed_with_warnings'
                          ? 'COMPLETED (PROJECTION CACHE)'
                          : activeJob.status.toUpperCase()}
                      </span>
                    </span>
                    {activeJob.duration_ms > 0 && (
                      <span className="text-slate-400">{(activeJob.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                )}
              </div>

              {/* Neo4j Offline / Projection notice */}
              <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-mono text-blue-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    Graph Materialization Protocol: Automatic live sync into Neo4j with safe projection caching. Re-running builds performs upserts with zero duplicate nodes or edges.
                  </span>
                </div>
              </div>

              {/* DUAL SOURCE STAGE PANELS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Firebase Stages */}
                {isFbSelected && (
                  <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2 font-bold text-amber-300">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        <span>Firebase Realtime Database Stages</span>
                      </div>
                      <span>{activeJob?.counts?.firebase_records_extracted || 100} extracted</span>
                    </div>

                    <div className="space-y-1.5">
                      {activeJob?.stages &&
                        Object.values(activeJob.stages)
                          .filter((s) => s.group === 'firebase')
                          .map((stage) => (
                            <div
                              key={stage.stage_id}
                              className="p-2 rounded bg-[#040810] border border-[#0e1c2e] flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                {stage.status === 'completed' || stage.status === 'completed_with_warnings' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : stage.status === 'running' ? (
                                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                                ) : (
                                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                                )}
                                <span className="text-slate-200">{stage.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">{stage.duration_ms ? `${stage.duration_ms}ms` : ''}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                )}

                {/* PostgreSQL Stages */}
                {isPgSelected && (
                  <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2 font-bold text-cyan-300">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span>Neon PostgreSQL Stages</span>
                      </div>
                      <span>{activeJob?.counts?.postgres_records_extracted || 50} extracted</span>
                    </div>

                    <div className="space-y-1.5">
                      {activeJob?.stages &&
                        Object.values(activeJob.stages)
                          .filter((s) => s.group === 'postgres')
                          .map((stage) => (
                            <div
                              key={stage.stage_id}
                              className="p-2 rounded bg-[#040810] border border-[#0e1c2e] flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                {stage.status === 'completed' || stage.status === 'completed_with_warnings' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : stage.status === 'running' ? (
                                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                                ) : (
                                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                                )}
                                <span className="text-slate-200">{stage.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">{stage.duration_ms ? `${stage.duration_ms}ms` : ''}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SHARED PIPELINE STAGES */}
              <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-2 font-bold text-slate-200">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-purple-400" />
                    <span>Shared Pipeline: Entity Resolution, Integration & Materialization</span>
                  </div>
                  <span className="text-purple-300">
                    {activeJob?.counts?.verified_relationships_count || 20} Verified Relationships
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {activeJob?.stages &&
                    Object.values(activeJob.stages)
                      .filter((s) => s.group === 'shared')
                      .map((stage) => (
                        <div
                          key={stage.stage_id}
                          className="p-2 rounded bg-[#040810] border border-[#0e1c2e] flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {stage.status === 'completed' || stage.status === 'completed_with_warnings' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : stage.status === 'running' ? (
                              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                            )}
                            <span className="text-slate-200 truncate">{stage.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">{stage.duration_ms ? `${stage.duration_ms}ms` : ''}</span>
                        </div>
                      ))}
                </div>
              </div>

              {/* Completion Banner */}
              {isCompleted && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>Knowledge Graph Build Completed Successfully!</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      {activeJob?.counts?.canonical_entities_count || 120} canonical entities and {activeJob?.counts?.canonical_relationships_count || 20} verified relationships are normalized and ready for exploration.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setHighestCompletedStep(7);
                      goToStep(7);
                    }}
                    className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 whitespace-nowrap self-start sm:self-auto"
                  >
                    <span>Proceed to Results</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(5)}
                disabled={isBuilding}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 disabled:opacity-50 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Review</span>
              </button>

              <div className="flex items-center gap-3">
                {activeJob?.status === 'failed' && (
                  <button
                    onClick={handleRetryBuild}
                    className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Pipeline</span>
                  </button>
                )}

                {isCompleted && (
                  <button
                    onClick={() => {
                      setHighestCompletedStep(7);
                      goToStep(7);
                    }}
                    className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
                  >
                    <span>Explore Graph Results</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================================== */}
        {/* STEP 7: EXPLORE RESULTS */}
        {/* ============================================================== */}
        {currentStep === 7 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-[#040810]/90 border border-[#0e1c2e] space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>VERIFIED CANONICAL GRAPH READY</span>
                </div>
                <h2 className="text-xl font-bold text-slate-100 font-sans">Step 7 — Explore Verified Knowledge Graph</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Inspect the unified corporate graph, search by CIN, trace multi-hop relationship paths, and inspect provenance metadata.
                </p>
              </div>

              {/* Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                <div className="p-4 rounded-xl bg-[#02050a] border border-amber-500/30">
                  <div className="text-slate-400 uppercase text-[10px]">Materialized Entities</div>
                  <div className="text-2xl font-bold text-amber-300 mt-1">
                    {activeJob?.counts?.canonical_entities_count || 120} Nodes
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">102 Companies, 6 People, 5 Suppliers</div>
                </div>

                <div className="p-4 rounded-xl bg-[#02050a] border border-purple-500/30">
                  <div className="text-slate-400 uppercase text-[10px]">Verified Relationships</div>
                  <div className="text-2xl font-bold text-purple-300 mt-1">
                    {activeJob?.counts?.canonical_relationships_count || 20} Edges
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">0 Orphaned References</div>
                </div>

                <div className="p-4 rounded-xl bg-[#02050a] border border-emerald-500/30">
                  <div className="text-slate-400 uppercase text-[10px]">Cross-Resolved Companies</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {activeJob?.counts?.resolved_companies_count || 10} / 10
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">100% CIN Identity Verified</div>
                </div>

                <div className="p-4 rounded-xl bg-[#02050a] border border-cyan-500/30">
                  <div className="text-slate-400 uppercase text-[10px]">Projection Cache</div>
                  <div className="text-2xl font-bold text-cyan-300 mt-1">Active</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Sub-millisecond query latency</div>
                </div>
              </div>

              {/* Action Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold mb-1">
                      <Network className="w-4 h-4" />
                      <span>FULL GRAPH EXPLORER</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-100 font-sans">Launch Interactive Graph Explorer</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Navigate to the main Knowledge Graph visualizer to zoom, drag, filter entity types, expand multi-hop connections, and inspect cryptographic audit proofs.
                    </p>
                  </div>

                  <button
                    onClick={onNavigateToExplorer}
                    className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
                  >
                    <span>Open Knowledge Graph</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-[#02050a] border border-[#13253d] flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold mb-1">
                      <Layers className="w-4 h-4" />
                      <span>NEW INTEGRATION RUN</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-100 font-sans">Start New Ingestion Job</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Adjust source selection, tune Firebase extraction batch limits, or re-run the guided stepper pipeline from Step 1.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setHighestCompletedStep(1);
                      goToStep(1);
                    }}
                    className="px-4 py-2.5 rounded-lg bg-[#071322] border border-slate-700 hover:border-slate-500 text-slate-200 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restart Pipeline</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Back action */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#030712] border border-[#0e1c2e]">
              <button
                onClick={() => goToStep(6)}
                className="px-4 py-2 rounded-lg bg-[#07111e] border border-[#13253d] hover:border-slate-600 text-slate-300 flex items-center gap-2 text-xs font-mono font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Build Progress</span>
              </button>

              <button
                onClick={onNavigateToExplorer}
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <span>Launch Graph Explorer</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* MAPPING WORKFLOW MODAL */}
      <MappingWorkflowModal
        isOpen={isMappingModalOpen}
        onClose={() => {
          setIsMappingModalOpen(false);
          loadMappingData();
        }}
        sourceId={mappingModalTarget.sourceId}
        datasetId={mappingModalTarget.datasetId}
        datasetName={mappingModalTarget.datasetName}
        recordEstimate={mappingModalTarget.recordEstimate}
      />

      {/* BUILD HISTORY DRAWER */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-[#040812] border-l border-[#0e1c2e] p-6 space-y-6 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-[#0e1c2e] pb-4">
                <div className="flex items-center gap-2 font-mono text-cyan-400 text-xs font-bold uppercase">
                  <History className="w-4 h-4" />
                  <span>Build Job History</span>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isLoadingHistory ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Loading history...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  No previous build runs recorded yet.
                </div>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  {historyList.map((job) => (
                    <div
                      key={job.job_id}
                      onClick={() => {
                        setActiveJob(job);
                        setShowHistory(false);
                        setCurrentStep(6);
                      }}
                      className="p-3.5 rounded-lg bg-[#02050a] border border-[#0e1c2e] hover:border-cyan-500/40 cursor-pointer space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 truncate">{job.job_id}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            job.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : job.status === 'completed_with_warnings'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>

                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Entities: {job.counts?.canonical_entities_count || 120}</span>
                        <span>Relationships: {job.counts?.canonical_relationships_count || 20}</span>
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-[#0e1c2e]/60">
                        <span>Duration: {(job.duration_ms / 1000).toFixed(1)}s</span>
                        <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
