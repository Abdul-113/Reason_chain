"""
Firebase Entity Mapper — Maps raw Firebase Realtime Database records to Canonical ReasonChain Models.
Acts as a Firebase-specific source adapter translating hierarchical JSON documents into
CanonicalEntities, CanonicalRelationships, and ProvenanceMetadata records.

Parallel to the PostgreSQL mapper (mapper.py), this module transforms Firebase data using
the same canonical domain model with SourceType.FIREBASE provenance.

Does NOT write to Neo4j. Does NOT perform cross-source entity resolution.
"""

import logging
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone

from app.domain.provenance import ProvenanceMetadata, SourceType
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata
from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.graph import CanonicalGraphPayload
from app.db.firebase import FirebaseConnection

logger = logging.getLogger("reasonchain.firebase.mapper")

# ========================================================================
# CONFIGURATION DEFAULTS
# ========================================================================

DEFAULT_MAPPING_CONFIDENCE = 0.95  # High confidence — profiler confirmed fields
DEFAULT_NESTED_MAPPING_CONFIDENCE = 0.85  # Slightly lower for nested/extracted entities
DEFAULT_RELATIONSHIP_CONFIDENCE = 0.90


# ========================================================================
# IDENTIFIER GENERATION
# ========================================================================

def _generate_firebase_canonical_id(collection: str, record_key: str, identifier_field: Optional[str] = None) -> str:
    """
    Generate a deterministic canonical ID for a Firebase entity.
    Uses the strongest available identifier (e.g., CIN for companies).
    Format: firebase:{collection}:{identifier}
    """
    identifier = identifier_field or record_key
    return f"firebase:{collection}:{identifier}"


def _generate_director_canonical_id(director_record: Dict[str, Any], company_key: str, index: int) -> str:
    """
    Generate a deterministic canonical ID for a director entity extracted from Firebase.
    Uses DIN (Director Identification Number) if available, otherwise generates from name + company.
    """
    din = director_record.get("din") or director_record.get("DIN") or director_record.get("director_id")
    if din:
        return f"firebase:directors:{din}"

    # Fallback: hash of name + company key for deduplication
    name = (
        director_record.get("name")
        or director_record.get("director_name")
        or director_record.get("full_name")
        or f"director_{index}"
    )
    hash_input = f"{name}:{company_key}".lower().strip()
    short_hash = hashlib.md5(hash_input.encode()).hexdigest()[:12]
    return f"firebase:directors:{short_hash}"


# ========================================================================
# ENTITY MAPPERS
# ========================================================================

def map_firebase_company_to_canonical(
    key: str,
    record: Dict[str, Any],
    collection_path: str = "/companies",
) -> CanonicalEntity:
    """
    Map a single Firebase company record to a CanonicalEntity.

    Args:
        key: Firebase record key (e.g., the push ID or structured key).
        record: Raw Firebase document dict.
        collection_path: Firebase path (e.g., '/companies').

    Returns:
        CanonicalEntity with SourceType.FIREBASE provenance.
    """
    # Determine the best identifier — prefer CIN over _key
    cin = record.get("cin") or record.get("CIN")
    canonical_id = _generate_firebase_canonical_id(
        collection="companies",
        record_key=key,
        identifier_field=cin,
    )

    # Extract display name
    display_name = (
        record.get("company_name")
        or record.get("name")
        or record.get("companyName")
        or key
    )

    # Build provenance
    provenance = ProvenanceMetadata(
        source_system="firebase",
        source_type=SourceType.FIREBASE,
        source_path=f"{collection_path}/{key}",
        source_record_id=key,
        source_table=collection_path.strip("/"),
        ingested_at=datetime.now(timezone.utc).isoformat(),
    )

    # Build confidence metadata
    confidence = ConfidenceMetadata(
        mapping_confidence=DEFAULT_MAPPING_CONFIDENCE,
        entity_confidence=DEFAULT_MAPPING_CONFIDENCE,
        source_reliability=0.90,  # Firebase RTDB is a live business database
    )

    # Build temporal metadata from registration_date if present
    temporal = None
    reg_date = record.get("registration_date") or record.get("date_of_registration")
    if reg_date and isinstance(reg_date, str) and reg_date.strip():
        temporal = TemporalMetadata(valid_from=reg_date.strip())

    # Build flat properties — exclude nested objects and arrays for clean entity properties
    properties: Dict[str, Any] = {}
    nested_keys_to_skip = set()
    for field_key, field_val in record.items():
        if isinstance(field_val, (dict, list)):
            nested_keys_to_skip.add(field_key)
            continue
        properties[field_key] = field_val

    # Ensure core identifiers are always present
    properties["_firebase_key"] = key
    if cin:
        properties["cin"] = cin

    entity = CanonicalEntity(
        canonical_id=canonical_id,
        entity_type=EntityCategory.COMPANY,
        display_name=display_name,
        properties=properties,
        source_references=[provenance],
        confidence=confidence,
        temporal=temporal,
    )
    return entity


def map_firebase_director_to_canonical(
    company_key: str,
    director_record: Dict[str, Any],
    index: int,
    company_path: str = "/companies",
) -> CanonicalEntity:
    """
    Map a single director record (extracted from a company's nested directors[] array)
    to a CanonicalEntity of type PERSON.

    Args:
        company_key: Firebase key of the parent company.
        director_record: Dict representing one director entry.
        index: Index of this director within the array.
        company_path: Firebase path of the parent company collection.

    Returns:
        CanonicalEntity with PERSON type and Firebase provenance.
    """
    canonical_id = _generate_director_canonical_id(director_record, company_key, index)

    # Extract display name
    display_name = (
        director_record.get("name")
        or director_record.get("director_name")
        or director_record.get("full_name")
        or f"Director {index + 1}"
    )

    # Build provenance pointing to the specific nested location
    provenance = ProvenanceMetadata(
        source_system="firebase",
        source_type=SourceType.FIREBASE,
        source_path=f"{company_path}/{company_key}/directors[{index}]",
        source_record_id=f"{company_key}:director:{index}",
        source_table=company_path.strip("/"),
        source_field="directors",
        ingested_at=datetime.now(timezone.utc).isoformat(),
    )

    # Lower confidence for nested/extracted entities
    confidence = ConfidenceMetadata(
        mapping_confidence=DEFAULT_NESTED_MAPPING_CONFIDENCE,
        entity_confidence=DEFAULT_NESTED_MAPPING_CONFIDENCE,
        source_reliability=0.90,
    )

    # Build properties — flatten director record
    properties: Dict[str, Any] = {}
    for field_key, field_val in director_record.items():
        if not isinstance(field_val, (dict, list)):
            properties[field_key] = field_val
    properties["_firebase_parent_key"] = company_key
    properties["_firebase_array_index"] = index

    entity = CanonicalEntity(
        canonical_id=canonical_id,
        entity_type=EntityCategory.PERSON,
        display_name=display_name,
        properties=properties,
        source_references=[provenance],
        confidence=confidence,
    )
    return entity


def map_firebase_state_to_canonical(state_name: str) -> CanonicalEntity:
    """
    Create a CanonicalEntity for a state/jurisdiction referenced in Firebase company records.
    """
    clean_state = state_name.strip().title()
    canonical_id = f"firebase:states:{clean_state.lower().replace(' ', '_')}"

    provenance = ProvenanceMetadata(
        source_system="firebase",
        source_type=SourceType.FIREBASE,
        source_path="/companies",
        source_field="state",
        ingested_at=datetime.now(timezone.utc).isoformat(),
    )

    return CanonicalEntity(
        canonical_id=canonical_id,
        entity_type=EntityCategory.COUNTRY,  # Reuse COUNTRY for geographic entities
        display_name=clean_state,
        properties={
            "name": clean_state,
            "entity_subtype": "state",
            "source": "firebase_company_registration",
        },
        source_references=[provenance],
        confidence=ConfidenceMetadata(
            mapping_confidence=0.80,
            entity_confidence=0.80,
        ),
    )


# ========================================================================
# RELATIONSHIP MAPPERS
# ========================================================================

def map_firebase_company_director_relationships(
    company_canonical_id: str,
    company_key: str,
    directors: List[Dict[str, Any]],
    company_path: str = "/companies",
) -> Tuple[List[CanonicalEntity], List[CanonicalRelationship]]:
    """
    Extract director entities and create HAS_DIRECTOR/DIRECTOR_OF relationships
    from a company's nested directors[] array.

    Returns:
        Tuple of (director_entities, relationships)
    """
    entities = []
    relationships = []

    for idx, director_record in enumerate(directors):
        if not isinstance(director_record, dict):
            continue

        # Create director entity
        director_entity = map_firebase_director_to_canonical(
            company_key=company_key,
            director_record=director_record,
            index=idx,
            company_path=company_path,
        )
        entities.append(director_entity)

        # Provenance for relationships
        provenance = ProvenanceMetadata(
            source_system="firebase",
            source_type=SourceType.FIREBASE,
            source_path=f"{company_path}/{company_key}/directors[{idx}]",
            source_record_id=f"{company_key}:director:{idx}",
            source_table=company_path.strip("/"),
        )

        confidence = ConfidenceMetadata(
            relationship_confidence=DEFAULT_RELATIONSHIP_CONFIDENCE,
        )

        # Company -> HAS_DIRECTOR -> Person
        relationships.append(CanonicalRelationship(
            relationship_id=f"{company_canonical_id}-{director_entity.canonical_id}-HAS_DIRECTOR",
            relationship_type=CanonicalRelationshipType.HAS_DIRECTOR,
            source_entity_id=company_canonical_id,
            source_entity_type="Company",
            target_entity_id=director_entity.canonical_id,
            target_entity_type="Person",
            properties={
                "role": director_record.get("designation") or director_record.get("role"),
                "source": "firebase",
            },
            provenance=provenance,
            confidence=confidence,
        ))

        # Person -> DIRECTOR_OF -> Company
        relationships.append(CanonicalRelationship(
            relationship_id=f"{director_entity.canonical_id}-{company_canonical_id}-DIRECTOR_OF",
            relationship_type=CanonicalRelationshipType.DIRECTOR_OF,
            source_entity_id=director_entity.canonical_id,
            source_entity_type="Person",
            target_entity_id=company_canonical_id,
            target_entity_type="Company",
            properties={
                "role": director_record.get("designation") or director_record.get("role"),
                "source": "firebase",
            },
            provenance=provenance,
            confidence=confidence,
        ))

    return entities, relationships


def map_firebase_company_state_relationships(
    company_entities: List[CanonicalEntity],
) -> Tuple[List[CanonicalEntity], List[CanonicalRelationship]]:
    """
    Create REGISTERED_IN_STATE relationships for companies that have a state field.
    Also creates state entities as needed.

    Returns:
        Tuple of (state_entities, relationships)
    """
    state_entities_map: Dict[str, CanonicalEntity] = {}
    relationships = []

    for company in company_entities:
        state_name = company.properties.get("state") or company.properties.get("state_code")
        if not state_name or not isinstance(state_name, str) or not state_name.strip():
            continue

        clean_state = state_name.strip().title()
        state_id = f"firebase:states:{clean_state.lower().replace(' ', '_')}"

        # Create state entity if not already created
        if state_id not in state_entities_map:
            state_entities_map[state_id] = map_firebase_state_to_canonical(clean_state)

        # Create REGISTERED_IN_STATE relationship
        provenance = ProvenanceMetadata(
            source_system="firebase",
            source_type=SourceType.FIREBASE,
            source_path="/companies",
            source_field="state" if "state" in company.properties else "state_code",
        )

        relationships.append(CanonicalRelationship(
            relationship_id=f"{company.canonical_id}-{state_id}-REGISTERED_IN_STATE",
            relationship_type=CanonicalRelationshipType.REGISTERED_IN_STATE,
            source_entity_id=company.canonical_id,
            source_entity_type="Company",
            target_entity_id=state_id,
            target_entity_type="Country",
            properties={
                "state": clean_state,
                "source": "firebase",
            },
            provenance=provenance,
        ))

    return list(state_entities_map.values()), relationships


def map_firebase_company_country_relationships(
    company_entities: List[CanonicalEntity],
) -> Tuple[List[CanonicalEntity], List[CanonicalRelationship]]:
    """
    Create LOCATED_IN relationships for companies that have a country field.
    Also creates country entities as needed.

    Returns:
        Tuple of (country_entities, relationships)
    """
    country_entities_map: Dict[str, CanonicalEntity] = {}
    relationships = []

    for company in company_entities:
        country_name = company.properties.get("country") or company.properties.get("indian_foreign_company")
        if not country_name or not isinstance(country_name, str) or not country_name.strip():
            continue

        # If field is like 'Indian Company' or 'India', normalize to India
        raw_country = country_name.strip()
        if "india" in raw_country.lower():
            clean_country = "India"
        else:
            clean_country = raw_country.title()

        country_id = f"firebase:countries:{clean_country.lower().replace(' ', '_')}"

        # Create country entity if not already created
        if country_id not in country_entities_map:
            provenance = ProvenanceMetadata(
                source_system="firebase",
                source_type=SourceType.FIREBASE,
                source_path="/companies",
                source_field="country",
            )
            country_entities_map[country_id] = CanonicalEntity(
                canonical_id=country_id,
                entity_type=EntityCategory.COUNTRY,
                display_name=clean_country,
                properties={
                    "name": clean_country,
                    "entity_subtype": "country",
                    "source": "firebase_company_registration",
                },
                source_references=[provenance],
                confidence=ConfidenceMetadata(
                    mapping_confidence=0.80,
                    entity_confidence=0.80,
                ),
            )

        # Create LOCATED_IN relationship
        provenance = ProvenanceMetadata(
            source_system="firebase",
            source_type=SourceType.FIREBASE,
            source_path="/companies",
            source_field="country",
        )

        relationships.append(CanonicalRelationship(
            relationship_id=f"{company.canonical_id}-{country_id}-LOCATED_IN",
            relationship_type=CanonicalRelationshipType.LOCATED_IN,
            source_entity_id=company.canonical_id,
            source_entity_type="Company",
            target_entity_id=country_id,
            target_entity_type="Country",
            properties={
                "country": clean_country,
                "source": "firebase",
            },
            provenance=provenance,
        ))

    return list(country_entities_map.values()), relationships


# ========================================================================
# ORCHESTRATOR — BUILD CANONICAL GRAPH PAYLOAD FROM FIREBASE
# ========================================================================

def build_firebase_canonical_payload(
    path: str = "/companies",
    limit: int = 100,
    include_relationships: bool = True,
    include_nested_entities: bool = True,
) -> CanonicalGraphPayload:
    """
    Main orchestrator: reads bounded records from Firebase and builds a complete
    CanonicalGraphPayload with entities, relationships, and provenance.

    Args:
        path: Firebase collection path (e.g., '/companies').
        limit: Maximum records to read (bounded).
        include_relationships: Whether to extract relationships (state, country, directors).
        include_nested_entities: Whether to extract nested entities (directors).

    Returns:
        CanonicalGraphPayload with all mapped entities and relationships.
    """
    logger.info("Starting Firebase entity mapping for path=%s, limit=%d", path, limit)
    start_time = datetime.now(timezone.utc)

    payload = CanonicalGraphPayload()
    company_entities: List[CanonicalEntity] = []
    entity_counts: Dict[str, int] = {}
    relationship_counts: Dict[str, int] = {}

    # Read bounded records from Firebase
    sample_data = FirebaseConnection.get_sample_records(path=path, limit=limit)
    records = sample_data.get("sample_records", [])

    logger.info("Retrieved %d records from Firebase path=%s", len(records), path)

    # Map each record to a company entity
    for record in records:
        key = record.get("_key") or record.get("_index", "unknown")
        key = str(key)

        # Remove internal keys before mapping
        clean_record = {k: v for k, v in record.items() if k not in ("_key", "_index")}

        company_entity = map_firebase_company_to_canonical(
            key=key,
            record=clean_record,
            collection_path=path,
        )
        company_entities.append(company_entity)
        payload.add_entity(company_entity)

        # Track entity type counts
        entity_type = str(company_entity.entity_type)
        entity_counts[entity_type] = entity_counts.get(entity_type, 0) + 1

        # Extract nested directors if enabled
        if include_nested_entities and include_relationships:
            directors_data = clean_record.get("directors") or clean_record.get("directors_list")
            if isinstance(directors_data, list) and directors_data:
                director_entities, director_rels = map_firebase_company_director_relationships(
                    company_canonical_id=company_entity.canonical_id,
                    company_key=key,
                    directors=directors_data,
                    company_path=path,
                )
                for de in director_entities:
                    payload.add_entity(de)
                    et = str(de.entity_type)
                    entity_counts[et] = entity_counts.get(et, 0) + 1

                for dr in director_rels:
                    payload.add_relationship(dr)
                    rt = str(dr.relationship_type)
                    relationship_counts[rt] = relationship_counts.get(rt, 0) + 1

    # Extract state relationships
    if include_relationships and company_entities:
        state_entities, state_rels = map_firebase_company_state_relationships(company_entities)
        for se in state_entities:
            payload.add_entity(se)
            et = str(se.entity_type)
            entity_counts[et] = entity_counts.get(et, 0) + 1

        for sr in state_rels:
            payload.add_relationship(sr)
            rt = str(sr.relationship_type)
            relationship_counts[rt] = relationship_counts.get(rt, 0) + 1

    # Extract country relationships
    if include_relationships and company_entities:
        country_entities, country_rels = map_firebase_company_country_relationships(company_entities)
        for ce in country_entities:
            payload.add_entity(ce)
            et = str(ce.entity_type)
            entity_counts[et] = entity_counts.get(et, 0) + 1

        for cr in country_rels:
            payload.add_relationship(cr)
            rt = str(cr.relationship_type)
            relationship_counts[rt] = relationship_counts.get(rt, 0) + 1

    # Attach metadata
    end_time = datetime.now(timezone.utc)
    payload.metadata.update({
        "source": "firebase",
        "source_path": path,
        "records_processed": len(records),
        "total_entities": len(payload.entities),
        "total_relationships": len(payload.relationships),
        "entity_type_counts": entity_counts,
        "relationship_type_counts": relationship_counts,
        "mapping_started_at": start_time.isoformat(),
        "mapping_completed_at": end_time.isoformat(),
        "mapping_duration_ms": int((end_time - start_time).total_seconds() * 1000),
    })

    logger.info(
        "Firebase mapping complete: %d entities, %d relationships from %d records",
        len(payload.entities),
        len(payload.relationships),
        len(records),
    )

    return payload
