import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Brain,
  ShieldCheck,
  Layers,
  ArrowRight,
  Database,
  UserCheck,
  RefreshCw,
  Tag
} from 'lucide-react';
import {
  getMappingStatus,
  proposeMapping,
  approveProposal,
  rejectProposal,
  validateProposal,
  type MappingStatusResponse,
  type MappingProposalResponse,
  type ValidationReport
} from '../services/mappingApi';

interface MappingWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceId: string;
  datasetId: string;
  datasetName?: string;
  recordEstimate?: number;
  onNavigateToGraph?: (source?: string) => void;
}

type TabType = 'overview' | 'proposal' | 'ambiguities' | 'validation' | 'governance';

export default function MappingWorkflowModal({
  isOpen,
  onClose,
  sourceId,
  datasetId,
  datasetName,
  recordEstimate,
  onNavigateToGraph,
}: MappingWorkflowModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [aiStatus, setAiStatus] = useState<MappingStatusResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isDeciding, setIsDeciding] = useState<boolean>(false);
  const [proposal, setProposal] = useState<MappingProposalResponse | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [sampleLimit, setSampleLimit] = useState<number>(10);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check AI Provider status on open
  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await getMappingStatus();
      setAiStatus(res);
    } catch {
      setAiStatus({
        configured: false,
        provider: null,
        model: null,
        prompt_version: null,
        base_url: null,
        message: 'Could not reach backend API server',
      });
    }
  };

  const handleGenerateProposal = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await proposeMapping({
        source_id: sourceId,
        dataset_id: datasetId,
        sample_limit: sampleLimit,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setProposal(res);
        setSuccessMessage('AI Semantic Mapping Proposal generated and validated!');
        setActiveTab('proposal');

        // Automatically fetch validation report
        if (res.proposal_id) {
          try {
            const vReport = await validateProposal(res.proposal_id);
            setValidationReport(vReport);
          } catch {
            // Non-fatal
          }
        }
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to generate proposal');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunValidation = async () => {
    if (!proposal?.proposal_id) return;
    setIsValidating(true);
    setErrorMessage(null);
    try {
      const report = await validateProposal(proposal.proposal_id);
      setValidationReport(report);
      if (proposal.proposed_specification) {
        proposal.proposed_specification.validation_status = report.status;
      }
      setSuccessMessage('Deterministic validation completed successfully.');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleApprove = async () => {
    if (!proposal?.proposal_id) return;
    setIsDeciding(true);
    setErrorMessage(null);
    try {
      const updatedSpec = await approveProposal(proposal.proposal_id, 'analyst_operator', reviewerNotes);
      if (proposal.proposed_specification) {
        proposal.proposed_specification.approval_status = updatedSpec.approval_status;
      }
      setSuccessMessage('Mapping specification APPROVED! Redirecting to Knowledge Graph...');
      setTimeout(() => {
        onClose();
        if (onNavigateToGraph) {
          const targetSource = (sourceId || '').toLowerCase().includes('firebase') ? 'firebase' : 'all';
          onNavigateToGraph(targetSource);
        }
      }, 700);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to approve proposal');
    } finally {
      setIsDeciding(false);
    }
  };

  const handleReject = async () => {
    if (!proposal?.proposal_id) return;
    setIsDeciding(true);
    setErrorMessage(null);
    try {
      const updatedSpec = await rejectProposal(proposal.proposal_id, 'analyst_operator', reviewerNotes);
      if (proposal.proposed_specification) {
        proposal.proposed_specification.approval_status = updatedSpec.approval_status;
      }
      setSuccessMessage('Mapping specification REJECTED.');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to reject proposal');
    } finally {
      setIsDeciding(false);
    }
  };

  if (!isOpen) return null;

  const spec = proposal?.proposed_specification;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-5xl my-8 bg-slate-950 border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold text-white tracking-wide">
                  AI-Assisted Semantic Mapping & Governance
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                  {sourceId} / {datasetId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic validation & human-in-the-loop approval layer. Non-authoritative neural proposals.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* AI Provider Status Pill */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs">
              <span className={`w-2 h-2 rounded-full ${aiStatus?.configured ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
              <span className="text-slate-300 font-mono">
                {aiStatus?.provider
                  ? `${aiStatus.provider.toUpperCase()} (${aiStatus.model})`
                  : aiStatus?.message?.includes('reach backend')
                  ? 'Backend Offline'
                  : 'AI Not Configured'}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-900/20 text-xs font-medium space-x-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'overview'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Dataset & Controls</span>
          </button>

          <button
            onClick={() => setActiveTab('proposal')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'proposal'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Mapping Proposal</span>
            {proposal && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px]">
                {spec?.target_entities.length || 0}E / {spec?.target_relationships.length || 0}R
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ambiguities')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'ambiguities'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Ambiguities & Evidence</span>
            {proposal && proposal.ambiguities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                {proposal.ambiguities.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('validation')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'validation'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Deterministic Validation</span>
            {spec && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] uppercase ${
                  spec.validation_status === 'valid'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : spec.validation_status === 'warning'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {spec.validation_status}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('governance')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'governance'
                ? 'border-cyan-400 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Governance & Approval</span>
            {spec && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] uppercase font-bold ${
                  spec.approval_status === 'approved'
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                    : spec.approval_status === 'rejected'
                    ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                    : 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                }`}
              >
                {spec.approval_status}
              </span>
            )}
          </button>
        </div>

        {/* Alerts Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center space-x-3 text-rose-300 text-xs">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center space-x-3 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW & CONTROLS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Target dataset card */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Target Dataset Information</h3>
                      <p className="text-xs text-slate-400">
                        {datasetName || datasetId} • ~{recordEstimate?.toLocaleString() || '10,000'} records
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 text-xs rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Source: {sourceId}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <span className="text-slate-500 block">Dataset Identifier</span>
                    <span className="text-slate-200 font-mono font-medium">{datasetId}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <span className="text-slate-500 block">Profiling Mode</span>
                    <span className="text-slate-200 font-medium">Observational & Bounded</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <span className="text-slate-500 block">AI Governance Model</span>
                    <span className="text-cyan-400 font-medium">Proposal-Only (Non-authoritative)</span>
                  </div>
                </div>
              </div>

              {/* Proposal Generation Config */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-slate-900/80 to-cyan-950/20 border border-cyan-900/30 space-y-4">
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">Request AI Semantic Mapping Proposal</h3>
                    <p className="text-xs text-slate-400">
                      AI analyzes bounded profile & field presence to suggest canonical entity and relationship rules.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">Sample Records:</span>
                    <select
                      value={sampleLimit}
                      onChange={(e) => setSampleLimit(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value={5}>5 records (fast)</option>
                      <option value={10}>10 records (standard)</option>
                      <option value={20}>20 records (deep)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleGenerateProposal}
                    disabled={isGenerating || !aiStatus?.configured}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg transition-all ${
                      isGenerating || !aiStatus?.configured
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-cyan-500/20 hover:scale-[1.02]'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Profile with {aiStatus?.provider?.toUpperCase() || 'AI'}...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Proposal</span>
                      </>
                    )}
                  </button>

                  {!aiStatus?.configured && (
                    <span className="text-xs text-amber-400 flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        {aiStatus?.message?.includes('reach backend')
                          ? 'Backend server unreachable at http://localhost:8000. Start backend server to enable AI proposal generation.'
                          : (aiStatus?.message || 'Set AI_API_KEY in server environment to enable live AI proposal generation.')}
                      </span>
                      <button
                        onClick={fetchStatus}
                        className="underline hover:text-amber-300 ml-1 text-xs cursor-pointer"
                        title="Retry connection"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROPOSAL SPECIFICATION */}
          {activeTab === 'proposal' && (
            <div className="space-y-6">
              {!proposal ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                  <Brain className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No mapping proposal generated yet for this session.</p>
                  <button
                    onClick={handleGenerateProposal}
                    disabled={isGenerating}
                    className="mt-3 px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs hover:bg-cyan-500/30"
                  >
                    Generate Now
                  </button>
                </div>
              ) : (
                <>
                  {/* Proposal Summary Card */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Tag className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono text-slate-300 font-semibold">{proposal.proposal_id}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {String(proposal.provider_metadata?.model || 'AI Model')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs">
                        <span className="text-slate-400">
                          AI Confidence:{' '}
                          <strong className="text-cyan-400 font-mono">{(proposal.ai_confidence * 100).toFixed(0)}%</strong>
                        </span>
                        <span className="text-slate-400">
                          Deterministic Score:{' '}
                          <strong className="text-emerald-400 font-mono">
                            {(proposal.system_validation_confidence * 100).toFixed(0)}%
                          </strong>
                        </span>
                      </div>
                    </div>

                    {proposal.rationale && (
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs text-slate-300">
                        <strong className="text-slate-400 block mb-1">AI Rationale:</strong>
                        <p className="leading-relaxed">{proposal.rationale}</p>
                      </div>
                    )}
                  </div>

                  {/* Target Entities Rules */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      <span>Target Entity Mapping Rules ({spec?.target_entities.length || 0})</span>
                    </h4>

                    {spec?.target_entities.map((ent, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              {ent.target_entity_category}
                            </span>
                            <span className="text-xs text-slate-400">
                              ID Field: <strong className="text-slate-200 font-mono">{ent.identifier_field}</strong>
                            </span>
                            {ent.id_namespace && (
                              <span className="text-[10px] font-mono text-slate-500">
                                namespace: &quot;{ent.id_namespace}&quot;
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono text-cyan-400">
                            Confidence: {(ent.confidence * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* Field mappings table */}
                        {ent.field_mappings.length > 0 && (
                          <div className="rounded-lg border border-slate-800/80 overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950/80 text-slate-500 text-[10px] uppercase font-mono border-b border-slate-800">
                                <tr>
                                  <th className="px-3 py-1.5">Source Field</th>
                                  <th className="px-3 py-1.5">Canonical Property</th>
                                  <th className="px-3 py-1.5">Transformation</th>
                                  <th className="px-3 py-1.5 text-right">Confidence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {ent.field_mappings.map((fm, fIdx) => (
                                  <tr key={fIdx} className="hover:bg-slate-800/20">
                                    <td className="px-3 py-1.5 font-mono text-slate-300">{fm.source_field}</td>
                                    <td className="px-3 py-1.5 font-mono text-cyan-300">{fm.target_property}</td>
                                    <td className="px-3 py-1.5 text-slate-400">
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                        {fm.transformation?.transform_type || 'direct'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                                      {(fm.confidence * 100).toFixed(0)}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Target Relationship Rules */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                      <ArrowRight className="w-4 h-4 text-violet-400" />
                      <span>Target Relationship Mapping Rules ({spec?.target_relationships.length || 0})</span>
                    </h4>

                    {spec?.target_relationships.map((rel, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/30">
                              {rel.target_relationship_type}
                            </span>
                            <span className="text-xs text-slate-300 font-mono">
                              ({rel.source_entity_ref}) ──[{rel.target_relationship_type}]──&gt; ({rel.target_entity_ref})
                            </span>
                          </div>
                          <span className="text-xs font-mono text-violet-400">
                            Confidence: {(rel.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        {rel.generate_target_entity && (
                          <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            <span>
                              Auto-generates target entity node of type:{' '}
                              <strong className="text-cyan-300">{rel.target_entity_category || 'Entity'}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: AMBIGUITIES */}
          {activeTab === 'ambiguities' && (
            <div className="space-y-4">
              {!proposal || proposal.ambiguities.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
                  <p className="text-sm text-slate-300 font-semibold">No Ambiguities Detected</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All discovered fields have unambiguous semantic alignments.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300">
                    <strong>Human Review Recommended:</strong> The AI detected {proposal.ambiguities.length} fields
                    with multiple plausible interpretations. Please inspect candidate interpretations and evidence
                    before approving.
                  </div>

                  {proposal.ambiguities.map((amb, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <HelpCircle className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-mono text-white font-semibold">{amb.field_path}</span>
                        </div>
                        <span className="text-xs font-mono text-amber-400">
                          Confidence: {(amb.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-slate-500 block mb-1">Candidate Semantic Interpretations:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {amb.candidate_interpretations.map((ci, cIdx) => (
                              <span
                                key={cIdx}
                                className={`px-2 py-0.5 rounded text-xs font-mono ${
                                  ci === amb.selected_interpretation
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {ci} {ci === amb.selected_interpretation && '✓ (Selected)'}
                              </span>
                            ))}
                          </div>
                        </div>

                        {amb.evidence && (
                          <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300">
                            <strong className="text-slate-500 block text-[10px] uppercase">Reasoning Evidence:</strong>
                            <p className="mt-0.5">{amb.evidence}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DETERMINISTIC VALIDATION */}
          {activeTab === 'validation' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      spec?.validation_status === 'valid'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : spec?.validation_status === 'warning'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                      <span>Deterministic Validation Status:</span>
                      <span className="uppercase text-xs font-mono font-bold">
                        {spec?.validation_status || 'UNVALIDATED'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verifies field presence in profile, canonical type enums, and identifier integrity.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleRunValidation}
                  disabled={isValidating || !proposal}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 flex items-center space-x-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                  <span>Re-validate</span>
                </button>
              </div>

              {/* Validation Issues */}
              {validationReport && validationReport.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Validation Findings ({validationReport.issues.length})
                  </h4>
                  {validationReport.issues.map((iss, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs flex items-start space-x-2.5 ${
                        iss.severity === 'error'
                          ? 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                          : 'bg-amber-950/30 border-amber-800/60 text-amber-300'
                      }`}
                    >
                      {iss.severity === 'error' ? (
                        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-mono font-bold block">{iss.field_or_target}</span>
                        <span>{iss.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Verified Fields */}
              {validationReport && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                    <span className="text-slate-400 font-semibold block flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Verified Profile Fields ({validationReport.verified_fields.length})</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {validationReport.verified_fields.map((vf, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 font-mono text-[11px] border border-emerald-900/60">
                          {vf}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                    <span className="text-slate-400 font-semibold block flex items-center space-x-1.5">
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Unverified Fields ({validationReport.unverified_fields.length})</span>
                    </span>
                    {validationReport.unverified_fields.length === 0 ? (
                      <span className="text-slate-500 italic">None. All referenced fields exist in profile.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {validationReport.unverified_fields.map((uf, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 font-mono text-[11px] border border-rose-900/60">
                            {uf}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GOVERNANCE & APPROVAL */}
          {activeTab === 'governance' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <UserCheck className="w-6 h-6 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">Human-in-the-Loop Governance</h3>
                      <p className="text-xs text-slate-400">
                        AI proposals cannot write to the Knowledge Graph until approved by a human analyst.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400">Current Status:</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${
                        spec?.approval_status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : spec?.approval_status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {spec?.approval_status || 'PENDING'}
                    </span>
                  </div>
                </div>

                {/* Review Notes Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Reviewer Notes / Governance Rationale:
                  </label>
                  <textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Document alignment verification (e.g. 'Verified CIN field aligns with MCA registry schema...')"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 h-20 resize-none"
                  />
                </div>

                {/* Decision Actions */}
                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    onClick={handleReject}
                    disabled={isDeciding || !proposal || spec?.approval_status === 'rejected'}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all disabled:opacity-50"
                  >
                    Reject Mapping Proposal
                  </button>

                  {spec?.approval_status === 'approved' && onNavigateToGraph ? (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToGraph();
                      }}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <span>View in Knowledge Graph</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleApprove}
                      disabled={
                        isDeciding ||
                        !proposal ||
                        spec?.approval_status === 'approved' ||
                        spec?.validation_status === 'invalid'
                      }
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeciding ? 'Saving Decision...' : 'Approve Mapping Specification'}
                    </button>
                  )}
                </div>
              </div>

              {/* Specification Audit Metadata */}
              {spec && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                  <span className="text-slate-500 block uppercase font-sans font-semibold">Audit Record</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400">
                    <div>Origin: <span className="text-slate-200">{spec.origin}</span></div>
                    <div>Created: <span className="text-slate-200">{new Date(spec.created_at).toLocaleTimeString()}</span></div>
                    <div>Prompt: <span className="text-slate-200">{spec.metadata?.prompt_version as string || 'v1.0'}</span></div>
                    <div>Is Active: <span className={spec.validation_status === 'valid' && spec.approval_status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}>{spec.validation_status === 'valid' && spec.approval_status === 'approved' ? 'YES' : 'NO (Inactive)'}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/40 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>ReasonChain Universal Source Contract • AI Governance Engine</span>
          </div>
          <div className="flex items-center space-x-2">
            {spec?.approval_status === 'approved' && onNavigateToGraph && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToGraph();
                }}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <span>View in Knowledge Graph</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
