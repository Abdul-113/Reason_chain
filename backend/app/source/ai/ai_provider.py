"""
AI Mapping Provider — Provider-Agnostic Interface & Groq Implementation
Handles structured mapping proposal generation via OpenAI-compatible APIs.
Never exposes API keys. Gracefully degrades if unconfigured.
"""

import json
import uuid
import time
import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from app.core.config import settings
from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.source.mapping import (
    MappingSpecification, MappingOrigin, ValidationStatus, ApprovalStatus,
    EntityMappingRule, RelationshipMappingRule, FieldMappingRule,
    TransformationRule, TransformType,
)
from app.source.ai.ai_context import (
    MappingProposalRequest, MappingProposalResponse, FieldAmbiguity,
)
from app.source.ai.ai_prompt import SYSTEM_PROMPT, PROMPT_VERSION, build_user_prompt

logger = logging.getLogger("reasonchain.source.ai.provider")


# ========================================================================
# ABSTRACT PROVIDER
# ========================================================================

class BaseMappingProvider(ABC):
    """Provider-agnostic interface for AI-assisted mapping proposal generation."""

    @abstractmethod
    def propose_mapping(self, request: MappingProposalRequest) -> MappingProposalResponse:
        """Generate a structured mapping proposal. Must not write to the knowledge graph."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if this provider has valid configuration (API key, etc.)."""
        pass

    @abstractmethod
    def get_provider_info(self) -> Dict[str, Any]:
        """Return safe provider metadata (no secrets)."""
        pass


# ========================================================================
# GROQ OPENAI-COMPATIBLE PROVIDER
# ========================================================================

class GroqMappingProvider(BaseMappingProvider):
    """
    OpenAI-compatible mapping provider using Groq's API.
    Uses JSON mode for structured output.
    """

    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.model = settings.AI_MODEL or "openai/gpt-oss-120b"
        self.base_url = settings.AI_BASE_URL or "https://api.groq.com/openai/v1"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip() and self.api_key != "your-api-key-here")

    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "provider": "groq",
            "model": self.model,
            "base_url": self.base_url,
            "is_configured": self.is_configured(),
            "prompt_version": PROMPT_VERSION,
        }

    def propose_mapping(self, request: MappingProposalRequest) -> MappingProposalResponse:
        """Call Groq API with structured JSON output mode."""
        proposal_id = f"prop_{uuid.uuid4().hex[:12]}"

        if not self.is_configured():
            return MappingProposalResponse(
                proposal_id=proposal_id,
                source_id=request.source_id,
                dataset_id=request.dataset_id,
                error="AI provider not configured. Set AI_API_KEY in server environment.",
                provider_metadata=self.get_provider_info(),
            )

        try:
            user_prompt = build_user_prompt(request.model_dump())
            raw_content, elapsed_ms, model_used, usage = self._call_llm(user_prompt)

            if not raw_content:
                return MappingProposalResponse(
                    proposal_id=proposal_id,
                    source_id=request.source_id,
                    dataset_id=request.dataset_id,
                    error="AI returned empty response",
                    provider_metadata={**self.get_provider_info(), "elapsed_ms": elapsed_ms},
                )

            ai_output = json.loads(raw_content)
            return self._parse_ai_output(
                ai_output, proposal_id, request, elapsed_ms,
                model_used=model_used,
                usage=usage,
            )

        except json.JSONDecodeError as e:
            logger.error(f"AI returned non-JSON output: {e}")
            return MappingProposalResponse(
                proposal_id=proposal_id,
                source_id=request.source_id,
                dataset_id=request.dataset_id,
                error=f"AI returned malformed JSON: {str(e)}",
                provider_metadata=self.get_provider_info(),
            )
        except Exception as e:
            logger.error(f"AI provider error: {e}")
            error_msg = str(e)
            if "rate_limit" in error_msg.lower() or "429" in error_msg:
                error_msg = "AI provider rate limit exceeded. Please retry later."
            elif "timeout" in error_msg.lower():
                error_msg = "AI provider request timed out."
            elif "authentication" in error_msg.lower() or "401" in error_msg:
                error_msg = "AI provider authentication failed. Check AI_API_KEY."

            return MappingProposalResponse(
                proposal_id=proposal_id,
                source_id=request.source_id,
                dataset_id=request.dataset_id,
                error=error_msg,
                provider_metadata=self.get_provider_info(),
            )

    def _call_llm(self, user_prompt: str) -> tuple[str, float, str, Dict[str, Any]]:
        """Call Groq / OpenAI compatible completion endpoint using standard library urllib."""
        import urllib.request
        import urllib.error

        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 4096,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "ReasonChain/1.0",
            },
            method="POST",
        )
        start_time = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                resp_data = json.loads(resp.read().decode("utf-8"))

            content = resp_data["choices"][0]["message"]["content"]
            model_used = resp_data.get("model", self.model)
            usage = resp_data.get("usage", {})
            return content, elapsed_ms, model_used, usage
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            try:
                err_json = json.loads(err_body)
                err_msg = err_json.get("error", {}).get("message", err_body)
            except Exception:
                err_msg = err_body
            raise RuntimeError(f"HTTP {he.code}: {err_msg}")

    def _parse_ai_output(
        self,
        ai_output: Dict[str, Any],
        proposal_id: str,
        request: MappingProposalRequest,
        elapsed_ms: float,
        model_used: str = "",
        usage: Dict[str, Any] = None,
    ) -> MappingProposalResponse:
        """Parse structured AI JSON output into a MappingProposalResponse."""

        # Parse entity mappings
        entity_rules: List[EntityMappingRule] = []
        for em in ai_output.get("entity_mappings", []):
            try:
                category = self._resolve_entity_category(em.get("target_entity_category", ""))
                if not category:
                    continue

                field_mappings = []
                for fm in em.get("field_mappings", []):
                    transform_type = self._resolve_transform_type(fm.get("transform_type", "direct"))
                    field_mappings.append(FieldMappingRule(
                        source_field=fm["source_field"],
                        target_property=fm["target_property"],
                        transformation=TransformationRule(transform_type=transform_type),
                        confidence=min(1.0, max(0.0, float(fm.get("confidence", 0.8)))),
                    ))

                entity_rules.append(EntityMappingRule(
                    target_entity_category=category,
                    identifier_field=em.get("identifier_field", ""),
                    id_namespace=em.get("id_namespace"),
                    display_name_field=em.get("display_name_field"),
                    field_mappings=field_mappings,
                    confidence=min(1.0, max(0.0, float(em.get("confidence", 0.8)))),
                ))
            except Exception as e:
                logger.warning(f"Skipping malformed entity mapping: {e}")

        # Parse relationship mappings
        rel_rules: List[RelationshipMappingRule] = []
        for rm in ai_output.get("relationship_mappings", []):
            try:
                rel_type = self._resolve_relationship_type(rm.get("target_relationship_type", ""))
                if not rel_type:
                    continue

                target_cat = None
                if rm.get("target_entity_category"):
                    target_cat = self._resolve_entity_category(rm["target_entity_category"])

                rel_rules.append(RelationshipMappingRule(
                    target_relationship_type=rel_type,
                    source_entity_ref=rm.get("source_entity_ref", "$PRIMARY"),
                    source_entity_type=rm.get("source_entity_type", "Company"),
                    target_entity_ref=rm.get("target_entity_ref", ""),
                    target_entity_type=rm.get("target_entity_type", "Company"),
                    generate_target_entity=bool(rm.get("generate_target_entity", False)),
                    target_entity_category=target_cat,
                    target_entity_name_field=rm.get("target_entity_name_field"),
                    condition_field=rm.get("condition_field"),
                    confidence=min(1.0, max(0.0, float(rm.get("confidence", 0.7)))),
                ))
            except Exception as e:
                logger.warning(f"Skipping malformed relationship mapping: {e}")

        # Parse ambiguities
        ambiguities: List[FieldAmbiguity] = []
        for amb in ai_output.get("ambiguities", []):
            try:
                ambiguities.append(FieldAmbiguity(
                    field_path=amb.get("field_path", ""),
                    candidate_interpretations=amb.get("candidate_interpretations", []),
                    selected_interpretation=amb.get("selected_interpretation"),
                    evidence=amb.get("evidence", ""),
                    confidence=min(1.0, max(0.0, float(amb.get("confidence", 0.5)))),
                ))
            except Exception:
                pass

        # Build MappingSpecification
        spec = MappingSpecification(
            mapping_id=proposal_id,
            dataset_id=request.dataset_id,
            description=ai_output.get("rationale", "AI-proposed semantic mapping"),
            target_entities=entity_rules,
            target_relationships=rel_rules,
            origin=MappingOrigin.AI_PROPOSED,
            validation_status=ValidationStatus.UNVALIDATED,
            approval_status=ApprovalStatus.PENDING,
            confidence=min(1.0, max(0.0, float(ai_output.get("overall_confidence", 0.7)))),
            metadata={
                "provider": "groq",
                "model": model_used,
                "prompt_version": PROMPT_VERSION,
            }
        )

        warnings = []
        if not entity_rules:
            warnings.append("AI proposed no entity mappings.")
        if not rel_rules:
            warnings.append("AI proposed no relationship mappings.")

        return MappingProposalResponse(
            proposal_id=proposal_id,
            source_id=request.source_id,
            dataset_id=request.dataset_id,
            proposed_specification=spec,
            rationale=ai_output.get("rationale", ""),
            ambiguities=ambiguities,
            warnings=warnings,
            ai_confidence=min(1.0, max(0.0, float(ai_output.get("overall_confidence", 0.7)))),
            provider_metadata={
                **self.get_provider_info(),
                "elapsed_ms": elapsed_ms,
                "model_used": model_used,
                "usage": usage or {},
            }
        )

    @staticmethod
    def _resolve_entity_category(raw: str) -> Optional[EntityCategory]:
        """Resolve a string to EntityCategory, handling case variations."""
        if not raw:
            return None
        for ec in EntityCategory:
            if ec.value.lower() == raw.lower() or ec.name.lower() == raw.lower():
                return ec
        return None

    @staticmethod
    def _resolve_relationship_type(raw: str) -> Optional[CanonicalRelationshipType]:
        """Resolve a string to CanonicalRelationshipType, handling case variations."""
        if not raw:
            return None
        for rt in CanonicalRelationshipType:
            if rt.value.lower() == raw.lower() or rt.name.lower() == raw.lower():
                return rt
        return None

    @staticmethod
    def _resolve_transform_type(raw: str) -> TransformType:
        """Resolve a string to TransformType."""
        for tt in TransformType:
            if tt.value.lower() == raw.lower():
                return tt
        return TransformType.DIRECT


# ========================================================================
# PROVIDER FACTORY
# ========================================================================

def get_mapping_provider() -> Optional[BaseMappingProvider]:
    """
    Factory function returning the configured AI mapping provider.
    Returns None if AI is not configured, allowing graceful degradation.
    """
    provider_name = (settings.AI_PROVIDER or "").strip().lower()

    if provider_name in ("groq", "openai"):
        provider = GroqMappingProvider()
        if provider.is_configured():
            return provider
        logger.info("AI provider '%s' configured but API key missing.", provider_name)
        return provider  # Return even if unconfigured so we can report status

    if settings.AI_API_KEY and settings.AI_API_KEY.strip():
        # If only API key is set without provider name, default to Groq
        return GroqMappingProvider()

    logger.info("No AI mapping provider configured. AI mapping features disabled.")
    return None
