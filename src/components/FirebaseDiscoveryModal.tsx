import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  RefreshCw,
  FolderTree,
  Table as TableIcon,
  Code2,
  AlertCircle,
  X,
  ChevronRight,
  Search,
  Layers,
  FileCode,
  Activity,
  Key,
  Link2,
  Clock,
  CheckSquare,
  Square,
  FileText,
  Network,
  ShieldCheck,
  Copy,
  Check
} from 'lucide-react';
import {
  getFirebasePaths,
  getFirebaseSample,
  profileFirebaseData,
  mapFirebaseData,
  type FirebasePathInfo,
  type FirebaseSampleResponse,
  type FirebaseDataProfileResponse,
  type FirebaseBranchProfile,
  type FirebaseMappingResponse
} from '../services/firebaseApi';

interface FirebaseDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  databaseUrl?: string | null;
  projectId?: string | null;
}

export default function FirebaseDiscoveryModal({
  isOpen,
  onClose,
  databaseUrl,
  projectId
}: FirebaseDiscoveryModalProps) {
  // Tab state: 'explorer' | 'profiler' | 'mapper'
  const [activeTab, setActiveTab] = useState<'explorer' | 'profiler' | 'mapper'>('explorer');

  // Discovery state
  const [paths, setPaths] = useState<FirebasePathInfo[]>([]);
  const [selectedPathNames, setSelectedPathNames] = useState<Set<string>>(new Set());
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [isLoadingPaths, setIsLoadingPaths] = useState<boolean>(false);
  const [pathsError, setPathsError] = useState<string | null>(null);

  // Explorer: Selected path & sample state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sampleData, setSampleData] = useState<FirebaseSampleResponse | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [sampleLimit, setSampleLimit] = useState<number>(5);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Profiler state
  const [profileResult, setProfileResult] = useState<FirebaseDataProfileResponse | null>(null);
  const [isProfiling, setIsProfiling] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedProfileBranch, setSelectedProfileBranch] = useState<string | null>(null);
  const [profileSummaryView, setProfileSummaryView] = useState<'interactive' | 'markdown'>('interactive');
  const [profileSampleLimit, setProfileSampleLimit] = useState<number>(10);
  const [profileFilterQuery, setProfileFilterQuery] = useState<string>('');

  // Mapper state
  const [mappingResult, setMappingResult] = useState<FirebaseMappingResponse | null>(null);
  const [isMapping, setIsMapping] = useState<boolean>(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingLimit, setMappingLimit] = useState<number>(20);
  const [mappingIncludeRelationships, setMappingIncludeRelationships] = useState<boolean>(true);
  const [mappingIncludeNestedEntities, setMappingIncludeNestedEntities] = useState<boolean>(true);
  const [mappingSubTab, setMappingSubTab] = useState<'entities' | 'relationships' | 'payload'>('entities');
  const [mappingFilterQuery, setMappingFilterQuery] = useState<string>('');
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  // Fetch paths on modal open
  useEffect(() => {
    if (isOpen) {
      loadPaths();
    } else {
      setSelectedPath(null);
      setSampleData(null);
      setPathsError(null);
      setSampleError(null);
      setProfileResult(null);
      setProfileError(null);
      setMappingResult(null);
      setMappingError(null);
      setMappingFilterQuery('');
      setActiveTab('explorer');
    }
  }, [isOpen]);

  const loadPaths = async () => {
    setIsLoadingPaths(true);
    setPathsError(null);
    try {
      const data = await getFirebasePaths();
      const discovered = data.paths || [];
      setPaths(discovered);
      setTotalRecords(data.total_records || 0);

      const allNames = new Set(discovered.map((p) => p.name));
      setSelectedPathNames(allNames);

      if (discovered.length > 0) {
        handleSelectPath(discovered[0].name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to discover Firebase paths';
      setPathsError(msg);
    } finally {
      setIsLoadingPaths(false);
    }
  };

  const handleSelectPath = async (pathName: string) => {
    setSelectedPath(pathName);
    setIsLoadingSample(true);
    setSampleError(null);
    try {
      const sample = await getFirebaseSample(pathName, sampleLimit);
      setSampleData(sample);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch sample records';
      setSampleError(msg);
      setSampleData(null);
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleLimitChange = (limit: number) => {
    setSampleLimit(limit);
    if (selectedPath) {
      setIsLoadingSample(true);
      getFirebaseSample(selectedPath, limit)
        .then(setSampleData)
        .catch((err) => setSampleError(err.message))
        .finally(() => setIsLoadingSample(false));
    }
  };

  const togglePathSelection = (pathName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPathNames((prev) => {
      const next = new Set(prev);
      if (next.has(pathName)) {
        next.delete(pathName);
      } else {
        next.add(pathName);
      }
      return next;
    });
  };

  const selectAllPaths = () => {
    setSelectedPathNames(new Set(paths.map((p) => p.name)));
  };

  const deselectAllPaths = () => {
    setSelectedPathNames(new Set());
  };

  const runDataProfiling = async () => {
    const targetPaths = Array.from(selectedPathNames).map((n) => `/${n}`);
    if (targetPaths.length === 0) {
      setProfileError('Please select at least one branch to profile.');
      return;
    }

    setIsProfiling(true);
    setProfileError(null);
    setActiveTab('profiler');

    try {
      const result = await profileFirebaseData({
        paths: targetPaths,
        sample_limit: profileSampleLimit,
        max_depth: 4,
        max_fields: 100,
        cross_validate_references: true,
      });
      setProfileResult(result);
      if (result.branches && result.branches.length > 0) {
        setSelectedProfileBranch(result.branches[0].name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to profile Firebase data';
      setProfileError(msg);
    } finally {
      setIsProfiling(false);
    }
  };

  const runMapping = async () => {
    const targetPath = selectedPath ? `/${selectedPath.replace(/^\/+/, '')}` : '/companies';
    setIsMapping(true);
    setMappingError(null);
    setActiveTab('mapper');

    try {
      const result = await mapFirebaseData({
        path: targetPath,
        limit: mappingLimit,
        include_relationships: mappingIncludeRelationships,
        include_nested_entities: mappingIncludeNestedEntities,
      });
      setMappingResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to map Firebase data to entities';
      setMappingError(msg);
    } finally {
      setIsMapping(false);
    }
  };

  if (!isOpen) return null;

  const activeBranchProfile: FirebaseBranchProfile | undefined = profileResult?.branches.find(
    (b) => b.name === selectedProfileBranch
  );

  const filteredFields =
    activeBranchProfile?.fields.filter((f) => {
      if (!profileFilterQuery.trim()) return true;
      const q = profileFilterQuery.toLowerCase();
      return (
        f.field_path.toLowerCase().includes(q) ||
        f.observed_types.some((t) => t.toLowerCase().includes(q)) ||
        (f.candidate_identifier && 'identifier id'.includes(q)) ||
        (f.candidate_reference && 'reference ref foreign'.includes(q)) ||
        (f.candidate_temporal && 'temporal date time'.includes(q))
      );
    }) || [];

  const filteredRecords =
    sampleData?.sample_records.filter((rec) => {
      if (!searchQuery.trim()) return true;
      return JSON.stringify(rec).toLowerCase().includes(searchQuery.toLowerCase());
    }) || [];

  const filteredMappedEntities =
    mappingResult?.entities.filter((e) => {
      if (!mappingFilterQuery.trim()) return true;
      const q = mappingFilterQuery.toLowerCase();
      return (
        e.canonical_id.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.display_name.toLowerCase().includes(q) ||
        JSON.stringify(e.properties).toLowerCase().includes(q)
      );
    }) || [];

  const filteredMappedRelationships =
    mappingResult?.relationships.filter((r) => {
      if (!mappingFilterQuery.trim()) return true;
      const q = mappingFilterQuery.toLowerCase();
      return (
        r.relationship_id.toLowerCase().includes(q) ||
        r.relationship_type.toLowerCase().includes(q) ||
        r.source_entity_id.toLowerCase().includes(q) ||
        r.target_entity_id.toLowerCase().includes(q) ||
        JSON.stringify(r.properties).toLowerCase().includes(q)
      );
    }) || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="bg-[#030712] border border-amber-500/30 rounded-xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl relative overflow-hidden"
        >
          {/* TOP HEADER */}
          <div className="p-4 border-b border-[#0e1c2e] bg-[#02050e] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold font-sans text-slate-100">
                    Firebase Realtime Database Inspector & Profiler
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                    Live Server RTDB
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {databaseUrl || 'Connected Realtime DB'} {projectId ? `· Project: ${projectId}` : ''}
                </p>
              </div>
            </div>

            {/* TAB SELECTOR & CLOSE */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-[#050c18] border border-[#0e1c2e] rounded-lg p-1 text-xs">
                <button
                  onClick={() => setActiveTab('explorer')}
                  className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-all text-xs font-bold font-sans ${
                    activeTab === 'explorer'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5" /> Explorer & Samples
                </button>
                <button
                  onClick={() => setActiveTab('profiler')}
                  className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-all text-xs font-bold font-sans ${
                    activeTab === 'profiler'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" /> Structure Profiler
                  {profileResult && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('mapper')}
                  className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-all text-xs font-bold font-sans ${
                    activeTab === 'mapper'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Entity Mapper
                  {mappingResult && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse ml-1" />
                  )}
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* MAIN TWO-COLUMN INSPECTION LAYOUT */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            {/* LEFT COLUMN: DISCOVERED ROOT PATHS & SELECTION */}
            <div className="md:col-span-4 border-r border-[#0e1c2e] bg-[#02040a] p-4 flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-amber-400" /> Discovered Branches ({paths.length})
                </span>
                <span className="text-[11px] text-slate-500">{totalRecords.toLocaleString()} items</span>
              </div>

              {/* SELECTION ACTIONS */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-3 pb-2 border-b border-[#0e1c2e]/60">
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllPaths}
                    className="text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Select All
                  </button>
                  <span>·</span>
                  <button
                    onClick={deselectAllPaths}
                    className="text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Deselect
                  </button>
                </div>
                <span>{selectedPathNames.size} selected</span>
              </div>

              {isLoadingPaths ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                  <p className="text-xs">Querying Firebase structure...</p>
                </div>
              ) : pathsError ? (
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4" /> Discovery Error
                  </div>
                  <p className="text-[11px] text-rose-300">{pathsError}</p>
                  <button
                    onClick={loadPaths}
                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[10px] font-bold"
                  >
                    Retry
                  </button>
                </div>
              ) : paths.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs space-y-2">
                  <AlertCircle className="w-6 h-6 mx-auto text-slate-600" />
                  <p>No collections or root nodes discovered in this Firebase instance.</p>
                </div>
              ) : (
                <div className="space-y-2 flex-1">
                  {paths.map((p) => {
                    const isSelected = selectedPath === p.name;
                    const isChecked = selectedPathNames.has(p.name);
                    return (
                      <div
                        key={p.path}
                        onClick={() => handleSelectPath(p.name)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between group cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-sm'
                            : 'bg-[#040914] border-[#0e1c2e] text-slate-300 hover:border-amber-500/20 hover:bg-[#060e1f]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => togglePathSelection(p.name, e)}
                            className="text-slate-500 hover:text-amber-400 transition-colors shrink-0"
                            title="Include in profiling"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>

                          <div className="truncate">
                            <div className="text-xs font-bold font-mono truncate">{p.path}</div>
                            <div className="text-[10px] text-slate-500">
                              {p.record_count.toLocaleString()} direct children
                            </div>
                          </div>
                        </div>

                        <ChevronRight
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isSelected
                              ? 'text-amber-400 translate-x-0.5'
                              : 'text-slate-600 group-hover:text-slate-400'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ACTION: PROFILE SELECTED PATHS */}
              <div className="mt-4 pt-3 border-t border-[#0e1c2e] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] bg-[#02050a] border border-[#0e1c2e] rounded p-1.5">
                  <span className="text-slate-500 text-[10px]">Sample Limit:</span>
                  {[5, 10, 20].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => setProfileSampleLimit(lim)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        profileSampleLimit === lim
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lim}
                    </button>
                  ))}
                </div>

                <button
                  onClick={runDataProfiling}
                  disabled={isProfiling || selectedPathNames.size === 0}
                  className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all font-sans"
                >
                  {isProfiling ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Profiling Data ({selectedPathNames.size} branches)...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      <span>Profile Selected Data ({selectedPathNames.size})</span>
                    </>
                  )}
                </button>

                <button
                  onClick={runMapping}
                  disabled={isMapping}
                  className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all font-sans"
                >
                  {isMapping ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mapping Entities...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4" />
                      <span>Map to Canonical Entities</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: TAB 1 (EXPLORER) OR TAB 2 (PROFILER) */}
            <div className="md:col-span-8 bg-[#030712] p-5 flex flex-col overflow-hidden">
              {activeTab === 'explorer' ? (
                /* ============================================================ */
                /* TAB 1: EXPLORER & SAMPLE VIEWER                              */
                /* ============================================================ */
                selectedPath ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#0e1c2e] shrink-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100 font-mono bg-[#081528] px-2 py-0.5 rounded border border-[#0e1c2e]">
                            /{selectedPath}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 font-bold uppercase">
                            RAW FIREBASE DATA (UNMAPPED)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Source provenance path: <code className="text-amber-300">/{selectedPath}</code> ·{' '}
                          {sampleData?.sample_count ?? 0} sample rows inspected
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* LIMIT SELECTOR */}
                        <div className="flex items-center gap-1 text-[11px] bg-[#02050a] border border-[#0e1c2e] rounded p-1">
                          <span className="text-slate-500 px-1">Limit:</span>
                          {[5, 10, 25].map((lim) => (
                            <button
                              key={lim}
                              onClick={() => handleLimitChange(lim)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                sampleLimit === lim
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {lim}
                            </button>
                          ))}
                        </div>

                        {/* VIEW MODE TOGGLE */}
                        <div className="flex items-center bg-[#02050a] border border-[#0e1c2e] rounded p-1 text-xs">
                          <button
                            onClick={() => setViewMode('table')}
                            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] ${
                              viewMode === 'table'
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <TableIcon className="w-3 h-3" /> Table
                          </button>
                          <button
                            onClick={() => setViewMode('json')}
                            className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] ${
                              viewMode === 'json'
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Code2 className="w-3 h-3" /> JSON
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* FIELD TAGS BAR */}
                    {sampleData?.fields && sampleData.fields.length > 0 && (
                      <div className="py-2.5 border-b border-[#0e1c2e]/60 shrink-0">
                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1.5 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-amber-400" /> Discovered Fields (
                          {sampleData.fields.length}):
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                          {sampleData.fields.map((f) => (
                            <span
                              key={f}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#081528] border border-[#0e1c2e] text-slate-300 hover:border-amber-500/30 transition-colors"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SEARCH FILTER */}
                    <div className="py-2 shrink-0">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter sample records by text..."
                          className="w-full pl-8 pr-3 py-1.5 rounded bg-[#02050a] border border-[#0e1c2e] text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 font-mono"
                        />
                      </div>
                    </div>

                    {/* PREVIEW CONTENT */}
                    <div className="flex-1 overflow-auto rounded-lg border border-[#0e1c2e] bg-[#02050a] mt-1 relative">
                      {isLoadingSample ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 space-y-3 text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                          <p className="text-xs">Fetching sample data from Firebase RTDB...</p>
                        </div>
                      ) : sampleError ? (
                        <div className="p-6 text-center text-rose-400 space-y-2">
                          <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
                          <div className="text-xs font-bold font-sans">Error reading sample records</div>
                          <p className="text-[11px] text-slate-400 max-w-md mx-auto">{sampleError}</p>
                          <button
                            onClick={() => handleSelectPath(selectedPath)}
                            className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-bold"
                          >
                            Retry Query
                          </button>
                        </div>
                      ) : filteredRecords.length === 0 ? (
                        <div className="p-6 text-center text-slate-500 text-xs space-y-1">
                          <FileCode className="w-6 h-6 mx-auto text-slate-600" />
                          <p>No sample records match your search query.</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <div className="overflow-x-auto min-w-full">
                          <table className="w-full text-left text-xs border-collapse font-mono">
                            <thead>
                              <tr className="bg-[#040a17] border-b border-[#0e1c2e] text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                                <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">#</th>
                                {sampleData?.fields.map((field) => (
                                  <th
                                    key={field}
                                    className="p-2.5 border-r border-[#0e1c2e] font-bold whitespace-nowrap"
                                  >
                                    {field}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#0e1c2e]/60">
                              {filteredRecords.map((rec, idx) => (
                                <tr key={idx} className="hover:bg-amber-500/5 transition-colors">
                                  <td className="p-2 text-slate-500 border-r border-[#0e1c2e] text-[10px]">
                                    {idx + 1}
                                  </td>
                                  {sampleData?.fields.map((field) => {
                                    const val = rec[field];
                                    const isObj = typeof val === 'object' && val !== null;
                                    return (
                                      <td
                                        key={field}
                                        className="p-2 text-slate-300 border-r border-[#0e1c2e]/60 max-w-[280px] truncate text-[11px]"
                                        title={isObj ? JSON.stringify(val) : String(val ?? '')}
                                      >
                                        {val === null || val === undefined ? (
                                          <span className="text-slate-600 italic">null</span>
                                        ) : typeof val === 'boolean' ? (
                                          <span className={val ? 'text-emerald-400' : 'text-rose-400'}>
                                            {String(val)}
                                          </span>
                                        ) : isObj ? (
                                          <span className="text-cyan-400 font-mono text-[10px]">
                                            {JSON.stringify(val)}
                                          </span>
                                        ) : (
                                          String(val)
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <pre className="p-4 text-xs font-mono text-cyan-300 leading-relaxed overflow-auto max-h-full">
                          {JSON.stringify(filteredRecords, null, 2)}
                        </pre>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 space-y-2">
                    <FolderTree className="w-8 h-8 text-slate-600" />
                    <p className="text-xs">Select a discovered branch on the left to preview sample data.</p>
                  </div>
                )
              ) : activeTab === 'profiler' ? (
                /* ============================================================ */
                /* TAB 2: DATA PROFILER (OBSERVATIONAL)                         */
                /* ============================================================ */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {isProfiling ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-slate-400">
                      <Activity className="w-8 h-8 animate-spin text-cyan-400" />
                      <div className="text-center">
                        <div className="text-sm font-bold text-slate-200">
                          Profiling Real Firebase Branches...
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Observing types, detecting candidate IDs/references, cross-checking keys with bounded reads.
                        </p>
                      </div>
                    </div>
                  ) : profileError ? (
                    <div className="p-6 text-center text-rose-400 space-y-2">
                      <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
                      <div className="text-xs font-bold font-sans">Profiling Failed</div>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto">{profileError}</p>
                      <button
                        onClick={runDataProfiling}
                        className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-bold"
                      >
                        Retry Profiling
                      </button>
                    </div>
                  ) : !profileResult ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 max-w-md">
                        <Activity className="w-8 h-8 mx-auto mb-2" />
                        <h3 className="text-sm font-bold font-sans text-slate-100">
                          Observational Structure Profiler
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Analyze real Firebase Realtime Database branches to observe field types, null rates, candidate identifiers, foreign references, and temporal fields using bounded sampling.
                        </p>
                      </div>

                      <button
                        onClick={runDataProfiling}
                        disabled={selectedPathNames.size === 0}
                        className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg transition-all font-sans"
                      >
                        <Activity className="w-4 h-4" />
                        <span>Profile Selected Branches ({selectedPathNames.size})</span>
                      </button>
                    </div>
                  ) : (
                    /* PROFILING RESULTS ACTIVE */
                    <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                      {/* PROFILER HEADER & METRICS BAR */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#0e1c2e] shrink-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-cyan-300 font-mono bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                              Data Profile Active
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold uppercase">
                              Read-Only Observational
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Profiled {profileResult.total_branches_profiled} branch(es) ·{' '}
                            {profileResult.config_limits.sample_limit} samples/branch · Depth cap:{' '}
                            {profileResult.config_limits.max_depth}
                          </p>
                        </div>

                        {/* SUMMARY VIEW TOGGLE */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-[#02050a] border border-[#0e1c2e] rounded p-1 text-xs">
                            <button
                              onClick={() => setProfileSummaryView('interactive')}
                              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] ${
                                profileSummaryView === 'interactive'
                                  ? 'bg-cyan-500 text-slate-950 font-bold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <TableIcon className="w-3 h-3" /> Table View
                            </button>
                            <button
                              onClick={() => setProfileSummaryView('markdown')}
                              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] ${
                                profileSummaryView === 'markdown'
                                  ? 'bg-cyan-500 text-slate-950 font-bold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <FileText className="w-3 h-3" /> Summary Doc
                            </button>
                          </div>

                          <button
                            onClick={runDataProfiling}
                            disabled={isProfiling}
                            className="px-2.5 py-1 rounded bg-[#081528] border border-[#0e1c2e] hover:border-cyan-500/40 text-slate-300 text-xs flex items-center gap-1"
                            title="Re-run profiling"
                          >
                            <RefreshCw className="w-3 h-3" /> Re-profile
                          </button>
                        </div>
                      </div>

                      {/* BRANCH SELECTOR TABS (IF MULTIPLE) */}
                      {profileResult.branches.length > 1 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                          {profileResult.branches.map((b) => (
                            <button
                              key={b.path}
                              onClick={() => setSelectedProfileBranch(b.name)}
                              className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors ${
                                selectedProfileBranch === b.name
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-[#040a17] text-slate-400 border border-[#0e1c2e] hover:text-slate-200'
                              }`}
                            >
                              {b.path} ({b.fields.length} fields)
                            </button>
                          ))}
                        </div>
                      )}

                      {/* VIEW: INTERACTIVE TABLE VS MARKDOWN */}
                      {profileSummaryView === 'interactive' ? (
                        <div className="flex-1 flex flex-col overflow-hidden space-y-2">
                          {/* BRANCH INFO PILLS & CANDIDATE SUMMARY */}
                          {activeBranchProfile && (
                            <div className="p-3 rounded-lg bg-[#040914] border border-[#0e1c2e] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-300 font-bold font-mono">
                                  {activeBranchProfile.path}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {activeBranchProfile.is_collection_like ? 'Collection' : 'Single Object'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {activeBranchProfile.sample_size} records sampled
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[10px]">
                                {activeBranchProfile.candidate_identifiers.length > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                                    <Key className="w-3 h-3" /> {activeBranchProfile.candidate_identifiers.length} ID candidates
                                  </span>
                                )}
                                {activeBranchProfile.candidate_references.length > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center gap-1">
                                    <Link2 className="w-3 h-3" /> {activeBranchProfile.candidate_references.length} Ref candidates
                                  </span>
                                )}
                                {activeBranchProfile.candidate_temporal_fields.length > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {activeBranchProfile.candidate_temporal_fields.length} Temporal candidates
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* SEARCH & FILTER BAR */}
                          <div className="relative shrink-0">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                            <input
                              type="text"
                              value={profileFilterQuery}
                              onChange={(e) => setProfileFilterQuery(e.target.value)}
                              placeholder="Filter fields by name, type, candidate flag (id, ref, time)..."
                              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#02050a] border border-[#0e1c2e] text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 font-mono"
                            />
                          </div>

                          {/* FIELDS TABLE */}
                          <div className="flex-1 overflow-auto rounded-lg border border-[#0e1c2e] bg-[#02050a]">
                            <table className="w-full text-left text-xs border-collapse font-mono">
                              <thead>
                                <tr className="bg-[#040a17] border-b border-[#0e1c2e] text-slate-400 uppercase text-[10px] sticky top-0 z-10">
                                  <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">Field Path</th>
                                  <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">Observed Types</th>
                                  <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">Presence Ratio</th>
                                  <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">Missing / Null</th>
                                  <th className="p-2.5 border-r border-[#0e1c2e] bg-[#040a17]">Candidate Heuristics</th>
                                  <th className="p-2.5 bg-[#040a17]">Sample Values</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#0e1c2e]/60">
                                {filteredFields.map((field) => (
                                  <tr key={field.field_path} className="hover:bg-cyan-500/5 transition-colors">
                                    <td className="p-2 text-slate-200 border-r border-[#0e1c2e] font-bold text-[11px] whitespace-nowrap">
                                      {field.field_path}
                                      {field.is_nested && (
                                        <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                                          nested
                                        </span>
                                      )}
                                      {field.is_array && (
                                        <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                                          array
                                        </span>
                                      )}
                                    </td>

                                    <td className="p-2 border-r border-[#0e1c2e] text-[10px]">
                                      <div className="flex flex-wrap gap-1">
                                        {field.observed_types.map((t) => (
                                          <span
                                            key={t}
                                            className={`px-1.5 py-0.5 rounded font-mono ${
                                              t === 'string'
                                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                                : t === 'number'
                                                ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                                : t === 'boolean'
                                                ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                                                : t === 'null'
                                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                                                : 'bg-slate-800 text-slate-300'
                                            }`}
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    </td>

                                    <td className="p-2 border-r border-[#0e1c2e] text-[11px]">
                                      <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${
                                              field.presence_ratio >= 0.9
                                                ? 'bg-emerald-400'
                                                : field.presence_ratio >= 0.5
                                                ? 'bg-amber-400'
                                                : 'bg-rose-400'
                                            }`}
                                            style={{ width: `${field.presence_ratio * 100}%` }}
                                          />
                                        </div>
                                        <span className="text-slate-300 font-bold text-[10px]">
                                          {int(field.presence_ratio * 100)}% ({field.presence_count}/{field.total_sampled})
                                        </span>
                                      </div>
                                    </td>

                                    <td className="p-2 border-r border-[#0e1c2e] text-slate-400 text-[10px]">
                                      <span>{field.null_count} null</span> ·{' '}
                                      <span>{field.missing_count} miss</span>
                                    </td>

                                    <td className="p-2 border-r border-[#0e1c2e] text-[10px]">
                                      <div className="flex flex-wrap gap-1">
                                        {field.candidate_identifier && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1 cursor-help"
                                            title={field.identifier_reason || 'Candidate Identifier'}
                                          >
                                            <Key className="w-2.5 h-2.5" /> [ID]
                                          </span>
                                        )}
                                        {field.candidate_reference && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold flex items-center gap-1 cursor-help"
                                            title={field.reference_reason || 'Candidate Reference'}
                                          >
                                            <Link2 className="w-2.5 h-2.5" /> [REF]
                                          </span>
                                        )}
                                        {field.candidate_temporal && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold flex items-center gap-1 cursor-help"
                                            title={field.temporal_reason || 'Candidate Temporal'}
                                          >
                                            <Clock className="w-2.5 h-2.5" /> [TIME]
                                          </span>
                                        )}
                                        {!field.candidate_identifier &&
                                          !field.candidate_reference &&
                                          !field.candidate_temporal && (
                                            <span className="text-slate-600">—</span>
                                          )}
                                      </div>
                                    </td>

                                    <td className="p-2 text-slate-300 text-[10px] max-w-[200px] truncate">
                                      {field.sample_values.length > 0 ? (
                                        field.sample_values.map((s, i) => (
                                          <span key={i} className="text-cyan-300 mr-1.5">
                                            {String(s)}
                                            {i < field.sample_values.length - 1 ? ',' : ''}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-slate-600 italic">None</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* CROSS-BRANCH REFERENCE CANDIDATES SECTION */}
                          {activeBranchProfile && activeBranchProfile.reference_cross_checks.length > 0 && (
                            <div className="p-3 rounded-lg bg-[#040a17] border border-[#0e1c2e] shrink-0 space-y-1.5">
                              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5 text-cyan-400" /> Discovered Cross-Branch Potential References:
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {activeBranchProfile.reference_cross_checks.map((rc, i) => (
                                  <div
                                    key={i}
                                    className="p-2 rounded bg-[#02050a] border border-[#0e1c2e] text-[11px] space-y-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-amber-300">{rc.source_field}</span>
                                      <span className="text-slate-500">→</span>
                                      <span className="font-bold text-cyan-300">{rc.target_path}</span>
                                      {rc.match_rate !== null && rc.match_rate !== undefined && (
                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold">
                                          {int(rc.match_rate * 100)}% match
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400">{rc.reason}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* MARKDOWN SUMMARY VIEW */
                        <div className="flex-1 overflow-auto p-4 rounded-lg border border-[#0e1c2e] bg-[#02050a]">
                          <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {profileResult.human_readable_summary}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ============================================================ */
                /* TAB 3: CANONICAL ENTITY MAPPER                               */
                /* ============================================================ */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {isMapping ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-slate-400">
                      <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                      <div className="text-center">
                        <div className="text-sm font-bold text-slate-200 font-sans">
                          Transforming Firebase Records into Canonical Entities...
                        </div>
                        <p className="text-xs text-slate-500 mt-1 max-w-md">
                          Applying deterministic ID generation, attaching SourceType.FIREBASE provenance, computing confidence scores, and assembling canonical relationships.
                        </p>
                      </div>
                    </div>
                  ) : mappingError ? (
                    <div className="p-6 text-center text-rose-400 space-y-2">
                      <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
                      <div className="text-xs font-bold font-sans">Mapping Failed</div>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto">{mappingError}</p>
                      <button
                        onClick={runMapping}
                        className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-bold"
                      >
                        Retry Mapping
                      </button>
                    </div>
                  ) : !mappingResult ? (
                    /* EMPTY / PRE-MAPPING STATE */
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 max-w-lg">
                        <Layers className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                        <h3 className="text-sm font-bold font-sans text-slate-100">
                          Firebase Realtime Database → Canonical Entity Mapper
                        </h3>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Translates raw Firebase company documents into strictly typed <span className="text-emerald-300 font-mono">CanonicalEntity</span> and <span className="text-emerald-300 font-mono">CanonicalRelationship</span> objects. 
                          Maintains full provenance back to source paths and assigns confidence metadata.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-lg w-full text-left text-xs">
                        <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] uppercase font-bold text-emerald-400 mb-1 font-mono">01 · Entities</div>
                          <div className="text-slate-200 font-bold font-sans">Company & Directors</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Maps flat company data + nested director arrays to distinct typed entities.</div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] uppercase font-bold text-cyan-400 mb-1 font-mono">02 · Relationships</div>
                          <div className="text-slate-200 font-bold font-sans">Graph Triples</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Builds HAS_DIRECTOR, REGISTERED_IN_STATE, and LOCATED_IN edges.</div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] uppercase font-bold text-amber-400 mb-1 font-mono">03 · Provenance</div>
                          <div className="text-slate-200 font-bold font-sans">Audit & Confidence</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Attaches SourceType.FIREBASE and temporal registration metadata.</div>
                        </div>
                      </div>

                      {/* MAPPING CONTROLS */}
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <div className="flex items-center gap-2 bg-[#02050a] border border-[#0e1c2e] rounded-lg px-3 py-1.5 text-xs text-slate-400">
                            <span>Records:</span>
                            {[5, 10, 20, 50].map((lim) => (
                              <button
                                key={lim}
                                onClick={() => setMappingLimit(lim)}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  mappingLimit === lim
                                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {lim}
                              </button>
                            ))}
                          </div>

                          <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none bg-[#02050a] border border-[#0e1c2e] rounded-lg px-2.5 py-1.5">
                            <input
                              type="checkbox"
                              checked={mappingIncludeRelationships}
                              onChange={(e) => setMappingIncludeRelationships(e.target.checked)}
                              className="rounded accent-emerald-500"
                            />
                            <span>Extract Relationships</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none bg-[#02050a] border border-[#0e1c2e] rounded-lg px-2.5 py-1.5">
                            <input
                              type="checkbox"
                              checked={mappingIncludeNestedEntities}
                              onChange={(e) => setMappingIncludeNestedEntities(e.target.checked)}
                              className="rounded accent-emerald-500"
                            />
                            <span>Extract Nested Directors</span>
                          </label>
                        </div>

                        <button
                          onClick={runMapping}
                          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all font-sans"
                        >
                          <Layers className="w-4 h-4" />
                          <span>Run Entity Mapping (Sample {mappingLimit})</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* MAPPING RESULTS ACTIVE */
                    <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                      {/* RESULTS HEADER */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#0e1c2e] shrink-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-300 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                              Canonical Graph In-Memory
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold uppercase">
                              Source: Firebase RTDB
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {mappingResult.mapping_duration_ms}ms
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Processed {mappingResult.total_records_processed} records from <span className="font-mono text-slate-300">{mappingResult.path}</span> → Generated {mappingResult.total_entities} entities & {mappingResult.total_relationships} relationships
                          </p>
                        </div>

                        {/* SUB-VIEW TOGGLE & RE-RUN */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-[#02050a] border border-[#0e1c2e] rounded p-1 text-xs">
                            <button
                              onClick={() => setMappingSubTab('entities')}
                              className={`px-2.5 py-1 rounded flex items-center gap-1.5 text-[11px] font-sans font-bold ${
                                mappingSubTab === 'entities'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <FolderTree className="w-3 h-3" />
                              Entities ({mappingResult.total_entities})
                            </button>
                            <button
                              onClick={() => setMappingSubTab('relationships')}
                              className={`px-2.5 py-1 rounded flex items-center gap-1.5 text-[11px] font-sans font-bold ${
                                mappingSubTab === 'relationships'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Network className="w-3 h-3" />
                              Relationships ({mappingResult.total_relationships})
                            </button>
                            <button
                              onClick={() => setMappingSubTab('payload')}
                              className={`px-2.5 py-1 rounded flex items-center gap-1.5 text-[11px] font-sans font-bold ${
                                mappingSubTab === 'payload'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Code2 className="w-3 h-3" />
                              JSON Payload
                            </button>
                          </div>

                          <button
                            onClick={runMapping}
                            disabled={isMapping}
                            className="px-2.5 py-1 rounded bg-[#0e1c2e] hover:bg-[#162942] text-slate-300 text-xs flex items-center gap-1 border border-[#1e3452] font-sans"
                            title="Re-run mapping"
                          >
                            <RefreshCw className="w-3 h-3" /> Re-map
                          </button>
                        </div>
                      </div>

                      {/* METRICS CARDS */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                        <div className="p-2.5 rounded bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Processed</div>
                          <div className="text-lg font-bold text-slate-100 font-mono mt-0.5">
                            {mappingResult.total_records_processed}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">Firebase docs</div>
                        </div>

                        <div className="p-2.5 rounded bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Entities</div>
                          <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                            {mappingResult.total_entities}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                            {Object.entries(mappingResult.entity_type_counts).map(([type, count]) => (
                              <span key={type} className="px-1 rounded bg-slate-800/60 text-[9px]">
                                {type}: {count}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="p-2.5 rounded bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Relationships</div>
                          <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">
                            {mappingResult.total_relationships}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                            {Object.entries(mappingResult.relationship_type_counts).map(([type, count]) => (
                              <span key={type} className="px-1 rounded bg-slate-800/60 text-[9px]">
                                {type}: {count}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="p-2.5 rounded bg-[#02050a] border border-[#0e1c2e]">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Provenance</div>
                          <div className="text-sm font-bold text-amber-300 font-mono mt-1 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            <span>FIREBASE</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">100% confidence</div>
                        </div>
                      </div>

                      {/* SEARCH / FILTER BAR */}
                      {mappingSubTab !== 'payload' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              type="text"
                              placeholder={
                                mappingSubTab === 'entities'
                                  ? 'Filter entities by ID, type, name, or property...'
                                  : 'Filter relationships by type, source, or target...'
                              }
                              value={mappingFilterQuery}
                              onChange={(e) => setMappingFilterQuery(e.target.value)}
                              className="w-full bg-[#02050a] border border-[#0e1c2e] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {/* SUB-VIEW 1: ENTITIES LIST */}
                      {mappingSubTab === 'entities' && (
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                          {filteredMappedEntities.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-xs">
                              No entities match the filter.
                            </div>
                          ) : (
                            filteredMappedEntities.map((entity) => (
                              <div
                                key={entity.canonical_id}
                                className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] hover:border-emerald-500/30 transition-colors space-y-2"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${
                                          entity.entity_type.toLowerCase().includes('company')
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : entity.entity_type.toLowerCase().includes('person') || entity.entity_type.toLowerCase().includes('director')
                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        }`}
                                      >
                                        {entity.entity_type}
                                      </span>
                                      <h4 className="text-xs font-bold text-slate-100 font-sans">
                                        {entity.display_name}
                                      </h4>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                      <span className="text-slate-400 font-bold">ID:</span> {entity.canonical_id}
                                      {entity.source_path && (
                                        <>
                                          <span>·</span>
                                          <span className="text-slate-500">Path: {entity.source_path}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400">Confidence:</span>
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-emerald-400 rounded-full"
                                          style={{ width: `${Math.round(entity.mapping_confidence * 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                        {Math.round(entity.mapping_confidence * 100)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* ENTITY PROPERTIES CHIPS */}
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#0e1c2e]/60">
                                  {Object.entries(entity.properties).map(([key, val]) => (
                                    <div
                                      key={key}
                                      className="px-2 py-0.5 rounded bg-[#050c18] border border-[#0e1c2e] text-[10px] flex items-center gap-1 font-mono"
                                    >
                                      <span className="text-slate-500">{key}:</span>
                                      <span className="text-slate-300 truncate max-w-[200px]">
                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* SUB-VIEW 2: RELATIONSHIPS LIST */}
                      {mappingSubTab === 'relationships' && (
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                          {filteredMappedRelationships.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-xs">
                              No relationships match the filter.
                            </div>
                          ) : (
                            filteredMappedRelationships.map((rel) => (
                              <div
                                key={rel.relationship_id}
                                className="p-3 rounded-lg bg-[#02050a] border border-[#0e1c2e] hover:border-cyan-500/30 transition-colors space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-bold">
                                      {rel.source_entity_id}
                                    </span>
                                    <span className="text-slate-500">──</span>
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold">
                                      [{rel.relationship_type}]
                                    </span>
                                    <span className="text-slate-500">──▶</span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-bold">
                                      {rel.target_entity_id}
                                    </span>
                                  </div>

                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {rel.relationship_id}
                                  </span>
                                </div>

                                {/* RELATIONSHIP PROPERTIES */}
                                {Object.keys(rel.properties).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#0e1c2e]/60">
                                    {Object.entries(rel.properties).map(([key, val]) => (
                                      <div
                                        key={key}
                                        className="px-2 py-0.5 rounded bg-[#050c18] border border-[#0e1c2e] text-[10px] flex items-center gap-1 font-mono"
                                      >
                                        <span className="text-slate-500">{key}:</span>
                                        <span className="text-slate-300">
                                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* SUB-VIEW 3: JSON PAYLOAD */}
                      {mappingSubTab === 'payload' && (
                        <div className="flex-1 flex flex-col overflow-hidden space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-mono">
                              Canonical Graph Payload (Ready for Neo4j Persistence)
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(mappingResult, null, 2));
                                setCopiedPayload(true);
                                setTimeout(() => setCopiedPayload(false), 2000);
                              }}
                              className="px-2.5 py-1 rounded bg-[#050c18] border border-[#0e1c2e] text-[11px] text-slate-300 hover:text-white flex items-center gap-1 font-mono transition-colors"
                            >
                              {copiedPayload ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy Payload JSON
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex-1 overflow-auto p-4 rounded-lg border border-[#0e1c2e] bg-[#02050a]">
                            <pre className="text-xs font-mono text-emerald-400/90 leading-relaxed whitespace-pre-wrap">
                              {JSON.stringify(mappingResult, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM MODAL FOOTER */}
          <div className="p-3.5 border-t border-[#0e1c2e] bg-[#02050e] flex items-center justify-between shrink-0 text-xs">
            <div className="text-slate-400 text-[11px] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                {activeTab === 'profiler'
                  ? 'Observational Data Profiler active · Mapping decoupled'
                  : activeTab === 'mapper'
                  ? 'Canonical Entity Mapper active · In-memory transformation'
                  : 'Realtime Database structure discovery active'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'explorer' ? (
                <button
                  onClick={runDataProfiling}
                  disabled={isProfiling || selectedPathNames.size === 0}
                  className="px-3.5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 font-sans"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Profile Selected ({selectedPathNames.size})</span>
                </button>
              ) : activeTab === 'profiler' ? (
                <button
                  onClick={runMapping}
                  disabled={isMapping}
                  className="px-3.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 font-sans"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Proceed to Entity Mapping</span>
                </button>
              ) : null}

              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors font-sans"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function int(val: number): number {
  return Math.round(val);
}
