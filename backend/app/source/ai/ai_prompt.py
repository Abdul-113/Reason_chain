"""
AI Prompt Templates for Semantic Mapping
Versioned, structured prompt templates instructing the model to propose semantic mappings.
The model is explicitly told it is proposing mappings, NOT asserting enterprise facts.
"""

PROMPT_VERSION = "v1.0"

SYSTEM_PROMPT = """You are a semantic mapping assistant for ReasonChain, an enterprise reasoning platform.

Your role is to PROPOSE semantic mappings from raw data fields to a canonical knowledge graph ontology.
You are NOT asserting enterprise facts. You are suggesting how source data fields map to canonical entities and relationships.

CRITICAL RULES:
1. Only propose mappings for fields that actually exist in the provided profile.
2. Never invent fields that are not present in the data.
3. Never invent relationships without source evidence.
4. When evidence is insufficient, report ambiguity rather than guessing.
5. Assign honest confidence scores. Do not inflate confidence.
6. Prefer uncertainty over unsupported assumptions.
7. Use CUSTOM entity/relationship types only when no standard type fits.

You must respond with a single valid JSON object matching the exact schema specified."""

USER_PROMPT_TEMPLATE = """Analyze the following dataset profile and sample records, then propose semantic mappings to the ReasonChain canonical ontology.

## CANONICAL ONTOLOGY

Entity Categories: {entity_categories}

Relationship Types: {relationship_types}

## DATASET PROFILE

Dataset: {dataset_id} ({dataset_logical_name})
Type: {dataset_type}
Estimated Records: {record_estimate}
Sampled Records: {records_sampled}

### Fields ({total_fields} total):
{fields_description}

### Reference Candidates:
{reference_candidates}

### Temporal Candidates:
{temporal_candidates}

## SAMPLE RECORDS ({sample_count}):
{sample_records}

## YOUR TASK

Respond with a JSON object containing exactly these keys:

{{
  "entity_mappings": [
    {{
      "target_entity_category": "<EntityCategory value>",
      "identifier_field": "<field that uniquely identifies this entity>",
      "id_namespace": "<optional namespace prefix>",
      "display_name_field": "<field for human-readable name>",
      "field_mappings": [
        {{
          "source_field": "<source field path>",
          "target_property": "<canonical property name>",
          "transform_type": "direct|lowercase|uppercase|strip|parse_int|parse_float|parse_date_iso",
          "confidence": 0.0-1.0
        }}
      ],
      "confidence": 0.0-1.0,
      "evidence": "<why you chose this mapping>"
    }}
  ],
  "relationship_mappings": [
    {{
      "target_relationship_type": "<CanonicalRelationshipType value>",
      "source_entity_ref": "<field or $PRIMARY>",
      "source_entity_type": "<entity type label>",
      "target_entity_ref": "<field providing target entity ID>",
      "target_entity_type": "<target entity type label>",
      "generate_target_entity": true/false,
      "target_entity_category": "<if generating target entity>",
      "target_entity_name_field": "<display name for generated entity>",
      "condition_field": "<optional: field that must be present>",
      "confidence": 0.0-1.0,
      "evidence": "<why you chose this mapping>"
    }}
  ],
  "ambiguities": [
    {{
      "field_path": "<ambiguous field>",
      "candidate_interpretations": ["<interpretation1>", "<interpretation2>"],
      "selected_interpretation": "<your choice or null>",
      "evidence": "<reasoning>",
      "confidence": 0.0-1.0
    }}
  ],
  "overall_confidence": 0.0-1.0,
  "rationale": "<overall explanation of the proposed mapping>"
}}

Important: Only use entity categories and relationship types from the canonical ontology above. Do not invent new types unless using CUSTOM."""


def format_fields_description(fields: list) -> str:
    """Format field descriptors into a concise human-readable block."""
    lines = []
    for f in fields:
        flags = []
        if f.get("identifier_likelihood", 0) > 0.5:
            flags.append("LIKELY_ID")
        if f.get("reference_likelihood", 0) > 0.5:
            flags.append("LIKELY_REF")
        if f.get("temporal_likelihood", 0) > 0.5:
            flags.append("LIKELY_TEMPORAL")
        if f.get("is_nested"):
            flags.append("NESTED")

        flag_str = f" [{', '.join(flags)}]" if flags else ""
        samples = f.get("sample_values", [])
        sample_str = f" | samples: {samples}" if samples else ""
        presence = f.get("presence_ratio", 1.0)

        lines.append(
            f"  - {f['field_path']}: {f['inferred_type']} "
            f"(presence: {presence:.0%}){flag_str}{sample_str}"
        )
    return "\n".join(lines)


def build_user_prompt(request_data: dict) -> str:
    """Build the complete user prompt from a MappingProposalRequest dict."""
    import json

    profile = request_data.get("profile_summary", {})
    ontology = request_data.get("ontology", {})
    samples = request_data.get("sample_records", [])

    entity_cats = ", ".join(e["category"] for e in ontology.get("entity_categories", []))
    rel_types = ", ".join(r["type"] for r in ontology.get("relationship_types", []))

    fields_desc = format_fields_description(profile.get("fields", []))

    ref_cands = profile.get("reference_candidates", [])
    ref_str = json.dumps(ref_cands, indent=2) if ref_cands else "None detected"

    temp_cands = profile.get("temporal_candidates", [])
    temp_str = json.dumps(temp_cands, indent=2) if temp_cands else "None detected"

    samples_str = json.dumps(samples[:5], indent=2, default=str) if samples else "No samples available"

    return USER_PROMPT_TEMPLATE.format(
        entity_categories=entity_cats,
        relationship_types=rel_types,
        dataset_id=profile.get("dataset_id", "unknown"),
        dataset_logical_name=profile.get("dataset_logical_name", "Unknown"),
        dataset_type=profile.get("dataset_type", "unknown"),
        record_estimate=profile.get("record_estimate", "unknown"),
        records_sampled=profile.get("records_sampled", 0),
        total_fields=profile.get("total_fields", 0),
        fields_description=fields_desc,
        reference_candidates=ref_str,
        temporal_candidates=temp_str,
        sample_count=len(samples),
        sample_records=samples_str,
    )
