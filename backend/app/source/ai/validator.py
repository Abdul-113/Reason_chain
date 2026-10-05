"""
Deterministic Mapping Validator
Enforces strict schema constraints, canonical types, and field existence checks.
CRITICAL: Pure deterministic validation. Zero LLM calls.
Validates that:
1. Target entity categories exist in EntityCategory enum.
2. Target relationship types exist in CanonicalRelationshipType enum.
3. Referenced source fields exist in dataset ProfileResult.
4. Identifiers are non-empty and have sufficient presence ratio.
5. Transformation types are valid TransformType enum values.
6. Confidence scores are strictly within [0.0, 1.0].
7. Origin is preserved as AI_PROPOSED for proposals.
"""

import logging
from typing import List, Dict, Any, Optional, Set
from pydantic import BaseModel, Field

from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.source.models import ProfileResult
from app.source.mapping import (
    MappingSpecification,
    ValidationStatus,
    ApprovalStatus,
    MappingOrigin,
    TransformType,
)

logger = logging.getLogger("reasonchain.source.ai.validator")


class ValidationIssue(BaseModel):
    """Specific error or warning encountered during deterministic validation."""
    severity: str = Field(..., description="'error' or 'warning'")
    field_or_target: str = Field(..., description="Target property, rule, or source field path")
    message: str = Field(..., description="Clear explanation of the validation failure")


class ValidationReport(BaseModel):
    """Complete deterministic validation outcome for a mapping specification."""
    status: ValidationStatus = Field(..., description="Overall validation status: VALID, WARNING, INVALID")
    issues: List[ValidationIssue] = Field(default_factory=list, description="All identified validation issues")
    validation_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Calculated deterministic validation score")
    verified_fields: List[str] = Field(default_factory=list, description="Source fields verified to exist in profile")
    unverified_fields: List[str] = Field(default_factory=list, description="Source fields not found in profile")


class DeterministicMappingValidator:
    """
    Deterministic validator for mapping specifications.
    Validates rules against profile data and domain ontology constraints.
    """

    @classmethod
    def validate(
        cls,
        spec: MappingSpecification,
        profile: Optional[ProfileResult] = None,
    ) -> ValidationReport:
        """
        Run complete deterministic validation against a specification and optional profile.
        Updates spec.validation_status and spec.validation_messages in-place.
        """
        issues: List[ValidationIssue] = []
        verified_fields: Set[str] = set()
        unverified_fields: Set[str] = set()

        # Build set of valid profile fields if profile is provided
        known_profile_fields: Set[str] = set()
        field_presence_map: Dict[str, float] = {}
        if profile and profile.fields:
            for f in profile.fields:
                known_profile_fields.add(f.field_path)
                field_presence_map[f.field_path] = f.presence_ratio

        # 1. Check specification metadata & origin
        if not spec.mapping_id:
            issues.append(ValidationIssue(severity="error", field_or_target="mapping_id", message="Missing mapping_id"))
        if not spec.dataset_id:
            issues.append(ValidationIssue(severity="error", field_or_target="dataset_id", message="Missing dataset_id"))

        # 2. Check entities
        if not spec.target_entities:
            issues.append(ValidationIssue(
                severity="error",
                field_or_target="target_entities",
                message="Specification contains no target entity mapping rules."
            ))

        valid_categories = {ec.value for ec in EntityCategory}
        valid_rel_types = {rt.value for rt in CanonicalRelationshipType}

        for idx, ent in enumerate(spec.target_entities):
            prefix = f"target_entities[{idx}]"

            # Check category
            cat_val = ent.target_entity_category.value if hasattr(ent.target_entity_category, "value") else str(ent.target_entity_category)
            if cat_val not in valid_categories:
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.target_entity_category",
                    message=f"Invalid entity category '{cat_val}'. Must be one of {sorted(list(valid_categories))}"
                ))

            # Check identifier field
            if not ent.identifier_field or ent.identifier_field.strip() == "":
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.identifier_field",
                    message="Entity rule is missing an identifier_field."
                ))
            else:
                id_field = ent.identifier_field.strip()
                if known_profile_fields:
                    if id_field in known_profile_fields:
                        verified_fields.add(id_field)
                        pres = field_presence_map.get(id_field, 1.0)
                        if pres < 0.5:
                            issues.append(ValidationIssue(
                                severity="warning",
                                field_or_target=f"{prefix}.identifier_field",
                                message=f"Identifier field '{id_field}' has low presence ratio ({pres:.1%}) in dataset sample."
                            ))
                    else:
                        unverified_fields.add(id_field)
                        issues.append(ValidationIssue(
                            severity="error",
                            field_or_target=f"{prefix}.identifier_field",
                            message=f"Identifier field '{id_field}' was not found in dataset profile fields."
                        ))

            # Check display name field if specified
            if ent.display_name_field:
                dn_field = ent.display_name_field.strip()
                if known_profile_fields:
                    if dn_field in known_profile_fields:
                        verified_fields.add(dn_field)
                    else:
                        unverified_fields.add(dn_field)
                        issues.append(ValidationIssue(
                            severity="warning",
                            field_or_target=f"{prefix}.display_name_field",
                            message=f"Display name field '{dn_field}' not found in dataset profile."
                        ))

            # Check entity confidence
            if not (0.0 <= ent.confidence <= 1.0):
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.confidence",
                    message=f"Entity confidence {ent.confidence} must be between 0.0 and 1.0"
                ))

            # Check field mappings
            for f_idx, fm in enumerate(ent.field_mappings):
                fm_prefix = f"{prefix}.field_mappings[{f_idx}]"
                src_field = fm.source_field.strip() if fm.source_field else ""
                tgt_prop = fm.target_property.strip() if fm.target_property else ""

                if not src_field:
                    issues.append(ValidationIssue(
                        severity="error",
                        field_or_target=f"{fm_prefix}.source_field",
                        message="Missing source_field in field mapping rule."
                    ))
                elif known_profile_fields:
                    if src_field in known_profile_fields:
                        verified_fields.add(src_field)
                    else:
                        unverified_fields.add(src_field)
                        issues.append(ValidationIssue(
                            severity="error",
                            field_or_target=f"{fm_prefix}.source_field",
                            message=f"Source field '{src_field}' does not exist in dataset profile."
                        ))

                if not tgt_prop:
                    issues.append(ValidationIssue(
                        severity="error",
                        field_or_target=f"{fm_prefix}.target_property",
                        message="Missing target_property in field mapping rule."
                    ))

                # Check transform type
                if fm.transformation:
                    tt = fm.transformation.transform_type
                    tt_val = tt.value if hasattr(tt, "value") else str(tt)
                    if not any(tt_val == t.value for t in TransformType):
                        issues.append(ValidationIssue(
                            severity="error",
                            field_or_target=f"{fm_prefix}.transformation",
                            message=f"Invalid transform type '{tt_val}'."
                        ))

        # 3. Check relationships
        for idx, rel in enumerate(spec.target_relationships):
            prefix = f"target_relationships[{idx}]"
            rel_val = rel.target_relationship_type.value if hasattr(rel.target_relationship_type, "value") else str(rel.target_relationship_type)
            if rel_val not in valid_rel_types:
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.target_relationship_type",
                    message=f"Invalid relationship type '{rel_val}'. Must be one of {sorted(list(valid_rel_types))}"
                ))

            # Source ref
            if not rel.source_entity_ref or rel.source_entity_ref.strip() == "":
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.source_entity_ref",
                    message="Missing source_entity_ref in relationship rule."
                ))
            elif rel.source_entity_ref != "$PRIMARY" and known_profile_fields:
                if rel.source_entity_ref in known_profile_fields:
                    verified_fields.add(rel.source_entity_ref)
                else:
                    unverified_fields.add(rel.source_entity_ref)
                    issues.append(ValidationIssue(
                        severity="error",
                        field_or_target=f"{prefix}.source_entity_ref",
                        message=f"Source entity ref field '{rel.source_entity_ref}' not found in profile."
                    ))

            # Target ref
            if not rel.target_entity_ref or rel.target_entity_ref.strip() == "":
                issues.append(ValidationIssue(
                    severity="error",
                    field_or_target=f"{prefix}.target_entity_ref",
                    message="Missing target_entity_ref in relationship rule."
                ))
            elif known_profile_fields:
                if rel.target_entity_ref in known_profile_fields:
                    verified_fields.add(rel.target_entity_ref)
                else:
                    unverified_fields.add(rel.target_entity_ref)
                    issues.append(ValidationIssue(
                        severity="error",
                        field_or_target=f"{prefix}.target_entity_ref",
                        message=f"Target entity ref field '{rel.target_entity_ref}' not found in profile."
                    ))

            # Auto-generation target entity checks
            if rel.generate_target_entity and not rel.target_entity_category:
                issues.append(ValidationIssue(
                    severity="warning",
                    field_or_target=f"{prefix}.target_entity_category",
                    message="generate_target_entity is True but target_entity_category is not specified."
                ))

        # Determine overall status and score
        errors = [iss for iss in issues if iss.severity == "error"]
        warnings = [iss for iss in issues if iss.severity == "warning"]

        if errors:
            status = ValidationStatus.INVALID
            score = max(0.0, 1.0 - (len(errors) * 0.25) - (len(warnings) * 0.05))
        elif warnings:
            status = ValidationStatus.WARNING
            score = max(0.5, 1.0 - (len(warnings) * 0.1))
        else:
            status = ValidationStatus.VALID
            score = 1.0

        # Update specification in-place
        spec.validation_status = status
        spec.validation_messages = [f"[{iss.severity.upper()}] {iss.field_or_target}: {iss.message}" for iss in issues]

        return ValidationReport(
            status=status,
            issues=issues,
            validation_score=round(score, 3),
            verified_fields=sorted(list(verified_fields)),
            unverified_fields=sorted(list(unverified_fields)),
        )
