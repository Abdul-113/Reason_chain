"""
Universal Mapping Engine
Pure source-agnostic transformation engine.
Consumes normalized SourceRecord objects and declarative MappingSpecifications
to produce Canonical ReasonChain Entities, Relationships, and CanonicalGraphPayloads.

CRITICAL ARCHITECTURAL BOUNDARY:
This engine has ZERO source-specific branching.
It contains NO `if source == 'firebase':` or `if source == 'postgres':` logic.
It operates purely on SourceRecord.attributes and explicit mapping rules.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timezone

from app.domain.entities import CanonicalEntity
from app.domain.relationships import CanonicalRelationship
from app.domain.graph import CanonicalGraphPayload
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata
from app.source.records import SourceRecord, SourceBatch
from app.source.mapping import (
    MappingSpecification,
    EntityMappingRule,
    RelationshipMappingRule,
    ValidationStatus,
)

logger = logging.getLogger("reasonchain.source.engine")


class UniversalMappingEngine:
    """
    Source-agnostic semantic mapping engine.
    Transforms universal SourceRecord instances into Canonical ReasonChain domain models.
    """

    @classmethod
    def map_record(
        cls,
        record: SourceRecord,
        spec: MappingSpecification,
        enforce_validation: bool = False,
    ) -> Tuple[List[CanonicalEntity], List[CanonicalRelationship]]:
        """
        Transform a single universal SourceRecord into canonical entities and relationships.
        Zero knowledge of underlying database type.
        """
        if enforce_validation and spec.validation_status != ValidationStatus.VALID:
            spec.validate_rules()
            if spec.validation_status != ValidationStatus.VALID:
                raise ValueError(f"MappingSpecification '{spec.mapping_id}' failed validation: {spec.validation_messages}")

        entities: List[CanonicalEntity] = []
        relationships: List[CanonicalRelationship] = []
        primary_entity_id: Optional[str] = None

        # 1. Map Target Entities
        for rule in spec.target_entities:
            raw_id = record.get_attribute(rule.identifier_field)
            if raw_id is None or str(raw_id).strip() == "":
                continue

            str_id = str(raw_id).strip()
            canonical_id = f"{rule.id_namespace}:{str_id}" if rule.id_namespace else str_id

            # Save primary entity ID for $PRIMARY relationship references
            if primary_entity_id is None:
                primary_entity_id = canonical_id

            # Resolve display name
            display_name = None
            if rule.display_name_field:
                raw_name = record.get_attribute(rule.display_name_field)
                if raw_name:
                    display_name = str(raw_name).strip()
            if not display_name:
                display_name = rule.default_display_name or str_id

            # Extract mapped properties
            properties: Dict[str, Any] = {}
            for fm in rule.field_mappings:
                raw_val = record.get_attribute(fm.source_field)
                if raw_val is not None:
                    transformed = fm.transformation.apply(raw_val)
                    if transformed is not None:
                        properties[fm.target_property] = transformed
                elif fm.required:
                    # Required property missing
                    pass

            # Create canonical entity
            entity = CanonicalEntity(
                canonical_id=canonical_id,
                entity_type=rule.target_entity_category,
                display_name=display_name,
                properties=properties,
                source_references=[record.to_canonical_provenance()],
                confidence=ConfidenceMetadata(
                    mapping_confidence=rule.confidence,
                    extraction_confidence=1.0,
                ),
            )
            entities.append(entity)

        # 2. Map Target Relationships
        for rel_rule in spec.target_relationships:
            # Check condition field if specified
            if rel_rule.condition_field:
                cond_val = record.get_attribute(rel_rule.condition_field)
                if not cond_val:
                    continue

            # Resolve source entity ID
            if rel_rule.source_entity_ref == "$PRIMARY":
                src_id = primary_entity_id
            else:
                raw_src = record.get_attribute(rel_rule.source_entity_ref)
                src_id = str(raw_src).strip() if raw_src is not None else None

            if not src_id:
                continue

            # Resolve target entity ID
            raw_tgt = record.get_attribute(rel_rule.target_entity_ref)
            if raw_tgt is None or str(raw_tgt).strip() == "":
                continue
            tgt_id = str(raw_tgt).strip()

            # If auto-generating target entity (e.g. Country or State node)
            if rel_rule.generate_target_entity and rel_rule.target_entity_category:
                tgt_name = tgt_id
                if rel_rule.target_entity_name_field:
                    raw_tgt_name = record.get_attribute(rel_rule.target_entity_name_field)
                    if raw_tgt_name:
                        tgt_name = str(raw_tgt_name).strip()

                target_entity = CanonicalEntity(
                    canonical_id=tgt_id,
                    entity_type=rel_rule.target_entity_category,
                    display_name=tgt_name,
                    properties={"code": tgt_id, "name": tgt_name},
                    source_references=[record.to_canonical_provenance()],
                    confidence=ConfidenceMetadata(mapping_confidence=rel_rule.confidence),
                )
                # Avoid duplicate target entities if already in entities list
                if not any(e.canonical_id == tgt_id for e in entities):
                    entities.append(target_entity)

            # Map edge properties
            edge_props: Dict[str, Any] = {}
            for fm in rel_rule.field_mappings:
                raw_val = record.get_attribute(fm.source_field)
                if raw_val is not None:
                    edge_props[fm.target_property] = fm.transformation.apply(raw_val)

            rel_id = f"{src_id}-{rel_rule.target_relationship_type.value}-{tgt_id}"
            rel = CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=rel_rule.target_relationship_type,
                source_entity_id=src_id,
                source_entity_type=rel_rule.source_entity_type,
                target_entity_id=tgt_id,
                target_entity_type=rel_rule.target_entity_type,
                properties=edge_props,
                provenance=record.to_canonical_provenance(),
                confidence=ConfidenceMetadata(mapping_confidence=rel_rule.confidence),
            )
            relationships.append(rel)

        return entities, relationships

    @classmethod
    def map_batch(
        cls,
        batch: SourceBatch,
        spec: MappingSpecification,
        enforce_validation: bool = False,
    ) -> CanonicalGraphPayload:
        """
        Transform a SourceBatch into a unified CanonicalGraphPayload.
        Deduplicates entities by canonical_id while merging provenance references.
        """
        payload = CanonicalGraphPayload(
            metadata={
                "source_id": batch.source_id,
                "dataset_id": batch.dataset_id,
                "mapping_id": spec.mapping_id,
                "mapping_origin": spec.origin.value,
                "batch_records_count": len(batch.records),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        entity_registry: Dict[str, CanonicalEntity] = {}
        seen_rel_ids = set()

        for record in batch.records:
            ents, rels = cls.map_record(record, spec, enforce_validation=enforce_validation)

            for ent in ents:
                if ent.canonical_id not in entity_registry:
                    entity_registry[ent.canonical_id] = ent
                else:
                    # Merge provenance and properties
                    existing = entity_registry[ent.canonical_id]
                    for ref in ent.source_references:
                        if ref not in existing.source_references:
                            existing.add_source_reference(ref)
                    for k, v in ent.properties.items():
                        if k not in existing.properties and v is not None:
                            existing.properties[k] = v

            for rel in rels:
                if rel.relationship_id not in seen_rel_ids:
                    seen_rel_ids.add(rel.relationship_id)
                    payload.add_relationship(rel)

        for ent in entity_registry.values():
            payload.add_entity(ent)

        return payload
