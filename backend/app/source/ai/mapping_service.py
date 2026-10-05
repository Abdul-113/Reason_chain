"""
Mapping Service & Proposal Governance Orchestrator
Coordinates the end-to-end flow:
Source Adapter -> Profile & Samples -> Safe AI Request -> Provider Proposal -> Deterministic Validation -> Human Governance Approval.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.source.contract import ProfileOptions, ExtractOptions
from app.source.adapters.firebase_adapter import FirebaseSourceAdapter
from app.source.adapters.postgres_adapter import PostgreSQLSourceAdapter
from app.source.mapping import (
    MappingSpecification,
    ApprovalStatus,
    ValidationStatus,
    MappingOrigin,
)
from app.source.ai.ai_context import (
    build_mapping_request,
    MappingProposalResponse,
)
from app.source.ai.ai_provider import get_mapping_provider, BaseMappingProvider
from app.source.ai.validator import DeterministicMappingValidator, ValidationReport

logger = logging.getLogger("reasonchain.source.ai.service")


class MappingService:
    """
    Central orchestration service for AI-assisted semantic mapping proposals,
    deterministic validation, and human governance lifecycle.
    """

    def __init__(self, provider: Optional[BaseMappingProvider] = None):
        self._provider = provider
        # In-memory storage for proposals & validation reports
        self._proposals: Dict[str, MappingProposalResponse] = {}
        self._validation_reports: Dict[str, ValidationReport] = {}
        # Cached profile results for validation lookups
        self._profiles: Dict[str, Any] = {}

    def get_provider(self) -> Optional[BaseMappingProvider]:
        if self._provider is None:
            self._provider = get_mapping_provider()
        return self._provider

    def get_adapter(self, source_id: str):
        """Retrieve appropriate adapter based on source_id."""
        normalized = source_id.lower()
        if "firebase" in normalized:
            return FirebaseSourceAdapter()
        elif "postgres" in normalized or "pg" in normalized:
            return PostgreSQLSourceAdapter()
        else:
            raise ValueError(f"Unknown or unsupported source adapter for source_id: '{source_id}'")

    def propose_mapping(
        self,
        source_id: str,
        dataset_id: str,
        sample_limit: int = 10,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> MappingProposalResponse:
        """
        Full proposal generation pipeline:
        1. Discover & profile target dataset using source adapter
        2. Extract bounded sample records
        3. Build safe, redacted AI request
        4. Call AI mapping provider (or graceful fallback if unconfigured)
        5. Run deterministic validation against real profile
        6. Store proposal in governance state
        """
        adapter = self.get_adapter(source_id)
        if not adapter.connect():
            raise RuntimeError(f"Failed to connect to source adapter '{source_id}'")

        # 1. Profile dataset
        logger.info("Profiling dataset '%s' on source '%s'", dataset_id, source_id)
        profile_opts = ProfileOptions(sample_limit=sample_limit)
        profile = adapter.profile_dataset(dataset_id, options=profile_opts)
        cache_key = f"{source_id}:{dataset_id}"
        self._profiles[cache_key] = profile

        # 2. Extract bounded sample records
        sample_extract_count = min(sample_limit, 5)
        logger.info("Extracting %d sample records from '%s'", sample_extract_count, dataset_id)
        extract_opts = ExtractOptions(limit=sample_extract_count)
        sample_batch = adapter.extract_records(dataset_id, options=extract_opts)
        sample_records = sample_batch.records

        # 3. Build safe request
        request = build_mapping_request(
            source_id=source_id,
            dataset_id=dataset_id,
            profile=profile,
            samples=sample_records,
            constraints=constraints,
        )

        # 4. Call provider
        provider = self.get_provider()
        if provider is None or not provider.is_configured():
            # Return unconfigured proposal response
            proposal_id = f"prop_unconf_{int(datetime.now(timezone.utc).timestamp())}"
            response = MappingProposalResponse(
                proposal_id=proposal_id,
                source_id=source_id,
                dataset_id=dataset_id,
                error="AI mapping provider is not configured. Set AI_API_KEY in server environment.",
                provider_metadata={"configured": False},
            )
            self._proposals[proposal_id] = response
            return response

        logger.info("Calling AI provider for mapping proposal...")
        response = provider.propose_mapping(request)

        # 5. Deterministic validation
        if response.proposed_specification:
            report = DeterministicMappingValidator.validate(
                response.proposed_specification,
                profile=profile
            )
            self._validation_reports[response.proposal_id] = report
            response.system_validation_confidence = report.validation_score

        # 6. Store and return
        self._proposals[response.proposal_id] = response
        return response

    def validate_proposal(self, proposal_id: str) -> ValidationReport:
        """Run or re-run deterministic validation for a stored proposal."""
        if proposal_id not in self._proposals:
            raise KeyError(f"Proposal '{proposal_id}' not found.")

        prop = self._proposals[proposal_id]
        if not prop.proposed_specification:
            raise ValueError(f"Proposal '{proposal_id}' contains no proposed specification.")

        cache_key = f"{prop.source_id}:{prop.dataset_id}"
        profile = self._profiles.get(cache_key)

        report = DeterministicMappingValidator.validate(
            prop.proposed_specification,
            profile=profile
        )
        self._validation_reports[proposal_id] = report
        prop.system_validation_confidence = report.validation_score
        return report

    def approve_proposal(
        self,
        proposal_id: str,
        reviewer_id: str = "human_operator",
        notes: Optional[str] = None
    ) -> MappingSpecification:
        """
        Transition proposal approval_status from PENDING to APPROVED.
        Requires validation_status to be VALID or WARNING.
        """
        if proposal_id not in self._proposals:
            raise KeyError(f"Proposal '{proposal_id}' not found.")

        prop = self._proposals[proposal_id]
        spec = prop.proposed_specification
        if not spec:
            raise ValueError(f"Proposal '{proposal_id}' has no specification.")

        if spec.validation_status == ValidationStatus.INVALID:
            raise ValueError(
                f"Cannot approve proposal '{proposal_id}' with INVALID validation status. "
                f"Issues: {spec.validation_messages}"
            )

        spec.approval_status = ApprovalStatus.APPROVED
        spec.metadata["approved_by"] = reviewer_id
        spec.metadata["approved_at"] = datetime.now(timezone.utc).isoformat()
        if notes:
            spec.metadata["approval_notes"] = notes

        # Automatic Knowledge Graph materialization upon approval
        source_id = str(prop.source_id).lower()
        dataset_id = str(prop.dataset_id).lower()
        if "firebase" in source_id or "firebase" in dataset_id or "companies" in dataset_id:
            try:
                from app.ingestion.materialization_pipeline import MaterializationPipeline
                pipeline = MaterializationPipeline()
                materialize_res = pipeline.materialize_firebase_graph(limit=100, include_synthetic=True)
                logger.info("[MAPPING APPROVAL] Materialized Firebase data into Knowledge Graph: %s", materialize_res)
                spec.metadata["materialization_status"] = "success"
                spec.metadata["materialized_entities"] = materialize_res.get("entities_materialized", 0)
                spec.metadata["materialized_relationships"] = materialize_res.get("relationships_materialized", 0)
            except Exception as mat_err:
                logger.error("[MAPPING APPROVAL] Notice materializing Firebase data: %s", mat_err)
                spec.metadata["materialization_status"] = "warning"
                spec.metadata["materialization_error"] = str(mat_err)

        return spec

    def reject_proposal(
        self,
        proposal_id: str,
        reviewer_id: str = "human_operator",
        reason: Optional[str] = None
    ) -> MappingSpecification:
        """Transition proposal approval_status to REJECTED."""
        if proposal_id not in self._proposals:
            raise KeyError(f"Proposal '{proposal_id}' not found.")

        prop = self._proposals[proposal_id]
        spec = prop.proposed_specification
        if not spec:
            raise ValueError(f"Proposal '{proposal_id}' has no specification.")

        spec.approval_status = ApprovalStatus.REJECTED
        spec.metadata["rejected_by"] = reviewer_id
        spec.metadata["rejected_at"] = datetime.now(timezone.utc).isoformat()
        if reason:
            spec.metadata["rejection_reason"] = reason

        return spec

    def get_proposal(self, proposal_id: str) -> Optional[MappingProposalResponse]:
        """Retrieve stored proposal by ID."""
        return self._proposals.get(proposal_id)

    def get_validation_report(self, proposal_id: str) -> Optional[ValidationReport]:
        """Retrieve stored validation report by proposal ID."""
        return self._validation_reports.get(proposal_id)

    def list_proposals(self) -> List[Dict[str, Any]]:
        """List summary of all proposals in memory."""
        summaries = []
        for pid, prop in self._proposals.items():
            spec = prop.proposed_specification
            summaries.append({
                "proposal_id": pid,
                "source_id": prop.source_id,
                "dataset_id": prop.dataset_id,
                "generated_at": prop.generated_at,
                "has_specification": spec is not None,
                "origin": spec.origin.value if spec else None,
                "validation_status": spec.validation_status.value if spec else None,
                "approval_status": spec.approval_status.value if spec else None,
                "ai_confidence": prop.ai_confidence,
                "system_validation_confidence": prop.system_validation_confidence,
                "ambiguities_count": len(prop.ambiguities),
                "error": prop.error,
            })
        return summaries


# Global singleton instance
mapping_service = MappingService()
