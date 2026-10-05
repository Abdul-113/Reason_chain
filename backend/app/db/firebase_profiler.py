"""
Firebase Realtime Database Data Profiler
Safe, read-only structural profiler for Firebase Realtime Database.
Inspects real Firebase branches using bounded sampling to produce mapping-ready profiles.
Does NOT perform semantic mapping or write to Neo4j.
"""

import re
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Set, Tuple

from app.core.config import settings
from app.db.firebase import FirebaseConnection
from app.models.schemas import (
    FirebaseProfileRequest,
    FirebaseFieldProfile,
    FirebaseReferenceCandidate,
    FirebaseBranchProfile,
    FirebaseDataProfileResponse,
)

logger = logging.getLogger("reasonchain.firebase.profiler")

# Regex heuristics for candidate identification
RE_IDENTIFIER_NAME = re.compile(
    r"^(id|_id|uid|uuid|guid|cin|key|_key|code|registration_?number|reg_?no|company_?id|supplier_?id|person_?id|contract_?id)$",
    re.IGNORECASE
)
RE_IDENTIFIER_SUFFIX = re.compile(r"(_id|Id|_code|Code|_key|Key|_number|Number)$", re.IGNORECASE)

# Regex heuristics for candidate reference fields
RE_REFERENCE_NAME = re.compile(
    r"(_id|Id|_key|Key|_ref|Ref|_code|Code|_cin|Cin)$",
    re.IGNORECASE
)

# Regex heuristics for candidate temporal fields & values
RE_TEMPORAL_NAME = re.compile(
    r"(date|time|created|updated|_at|timestamp|start_?date|end_?date|registration_?date|effective|expiry|dob)",
    re.IGNORECASE
)
RE_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$")
RE_STANDARD_DATE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")

SENSITIVE_KEY_PATTERNS = {"password", "secret", "private_key", "token", "auth", "credential", "api_key"}


class FirebaseDataProfiler:
    """Safe, observational schema and structure profiler for Firebase Realtime Database."""

    @classmethod
    def profile_database(cls, request: FirebaseProfileRequest) -> FirebaseDataProfileResponse:
        """
        Main entry point for profiling selected or all discovered Firebase paths.
        Enforces bounded sampling and observational analysis.
        """
        start_time = datetime.now(timezone.utc).isoformat()

        # Ensure Firebase connection is initialized
        FirebaseConnection.get_app()

        # 1. Discover all top-level paths to establish universe
        all_discovered = FirebaseConnection.list_paths()
        discovered_map = {p["name"]: p for p in all_discovered}

        # 2. Determine target paths to profile
        if request.paths and len(request.paths) > 0:
            target_names = [p.strip().lstrip("/") for p in request.paths if p.strip()]
        else:
            target_names = list(discovered_map.keys())

        # Config limits
        sample_limit = min(max(request.sample_limit, 1), 50)
        max_depth = min(max(request.max_depth, 1), 8)
        max_fields = min(max(request.max_fields, 5), 300)

        branch_profiles: List[FirebaseBranchProfile] = []
        branch_sampled_records: Dict[str, List[Dict[str, Any]]] = {}
        branch_keys_cache: Dict[str, Set[str]] = {}

        # 3. Sample and profile each target branch
        for branch_name in target_names:
            clean_path = f"/{branch_name}"
            disc_info = discovered_map.get(branch_name, {"record_count": 0})
            approx_count = disc_info.get("record_count", 0)

            # Bounded read using Firebase Realtime Database query
            try:
                records, is_collection, is_object, is_primitive = cls._sample_branch_records(
                    clean_path, sample_limit
                )
            except Exception as e:
                logger.error("Error sampling Firebase branch %s: %s", clean_path, e)
                branch_profiles.append(
                    FirebaseBranchProfile(
                        path=clean_path,
                        name=branch_name,
                        exists=False,
                        approx_child_count=approx_count,
                        sample_size=0,
                        is_collection_like=False,
                        warnings=[f"Failed to read path: {str(e)}"],
                    )
                )
                continue

            branch_sampled_records[branch_name] = records
            # Cache discovered keys for cross-reference matching
            branch_keys_cache[branch_name] = {
                str(r.get("_key")) for r in records if "_key" in r and r["_key"] is not None
            }

            # Profile fields recursively
            field_profiles, has_nested, has_arrays = cls._profile_records_fields(
                records=records,
                branch_path=clean_path,
                max_depth=max_depth,
                max_fields=max_fields,
            )

            candidate_ids = [f.field_path for f in field_profiles if f.candidate_identifier]
            candidate_refs = [f.field_path for f in field_profiles if f.candidate_reference]
            candidate_temporals = [f.field_path for f in field_profiles if f.candidate_temporal]

            branch_profile = FirebaseBranchProfile(
                path=clean_path,
                name=branch_name,
                exists=True,
                approx_child_count=approx_count,
                sample_size=len(records),
                is_collection_like=is_collection,
                is_object_like=is_object,
                is_primitive_like=is_primitive,
                has_nested_children=has_nested,
                has_arrays=has_arrays,
                fields=field_profiles,
                candidate_identifiers=candidate_ids,
                candidate_references=candidate_refs,
                candidate_temporal_fields=candidate_temporals,
                reference_cross_checks=[],
                warnings=[],
            )
            branch_profiles.append(branch_profile)

        # 4. Cross-Branch Reference Candidate Analysis
        global_references: List[FirebaseReferenceCandidate] = []
        if request.cross_validate_references and len(branch_profiles) > 0:
            for bp in branch_profiles:
                records = branch_sampled_records.get(bp.name, [])
                ref_checks = cls._cross_check_references(
                    source_branch=bp,
                    source_records=records,
                    all_branches=branch_profiles,
                    branch_keys_cache=branch_keys_cache,
                )
                bp.reference_cross_checks = ref_checks
                global_references.extend(ref_checks)

        # 5. Generate Human-Readable Markdown Summary
        summary_md = cls._generate_markdown_summary(
            branch_profiles=branch_profiles,
            global_references=global_references,
            sample_limit=sample_limit,
            profiled_at=start_time,
        )

        return FirebaseDataProfileResponse(
            success=True,
            database_url=settings.FIREBASE_DATABASE_URL or None,
            project_id=None,
            profiled_at=start_time,
            config_limits={
                "sample_limit": sample_limit,
                "max_depth": max_depth,
                "max_fields": max_fields,
                "cross_validate_references": request.cross_validate_references,
            },
            total_branches_profiled=len(branch_profiles),
            branches=branch_profiles,
            global_reference_candidates=global_references,
            human_readable_summary=summary_md,
        )

    @classmethod
    def _sample_branch_records(
        cls, clean_path: str, limit: int
    ) -> Tuple[List[Dict[str, Any]], bool, bool, bool]:
        """
        Fetch bounded sample records using order_by_key().limit_to_first().
        Returns: (records, is_collection_like, is_object_like, is_primitive_like)
        """
        ref = FirebaseConnection.get_reference(clean_path)
        data = ref.order_by_key().limit_to_first(limit).get()

        records: List[Dict[str, Any]] = []
        is_collection = True
        is_object = False
        is_primitive = False

        if data is None:
            return [], False, False, False

        if isinstance(data, dict):
            has_dict_values = any(isinstance(v, dict) for v in data.values())
            if has_dict_values:
                for key, val in data.items():
                    if isinstance(val, dict):
                        records.append({"_key": key, **val})
                    else:
                        records.append({"_key": key, "value": val})
                is_collection = True
            else:
                # Single root object / map
                records.append(data)
                is_collection = False
                is_object = True

        elif isinstance(data, list):
            for idx, val in enumerate(data):
                if val is not None:
                    if isinstance(val, dict):
                        records.append({"_index": idx, **val})
                    else:
                        records.append({"_index": idx, "value": val})
            is_collection = True

        else:
            # Primitive single value
            records.append({"value": data})
            is_collection = False
            is_primitive = True

        return records, is_collection, is_object, is_primitive

    @classmethod
    def _profile_records_fields(
        cls,
        records: List[Dict[str, Any]],
        branch_path: str,
        max_depth: int,
        max_fields: int,
    ) -> Tuple[List[FirebaseFieldProfile], bool, bool]:
        """
        Recursively extracts and profiles field structure across sampled records.
        """
        total_records = len(records)
        if total_records == 0:
            return [], False, False

        field_observations: Dict[str, Dict[str, Any]] = {}
        has_nested = False
        has_arrays = False

        for rec in records:
            flat_items = cls._flatten_record(rec, prefix="", depth=1, max_depth=max_depth)
            for fpath, fval, is_n, is_a, arr_elem_types in flat_items:
                if is_n:
                    has_nested = True
                if is_a:
                    has_arrays = True

                if fpath not in field_observations:
                    if len(field_observations) >= max_fields:
                        continue
                    field_observations[fpath] = {
                        "values": [],
                        "types": set(),
                        "is_nested": is_n,
                        "is_array": is_a,
                        "array_item_types": set() if arr_elem_types else None,
                    }

                field_observations[fpath]["values"].append(fval)
                val_type = cls._detect_type(fval)
                field_observations[fpath]["types"].add(val_type)
                if arr_elem_types and field_observations[fpath]["array_item_types"] is not None:
                    field_observations[fpath]["array_item_types"].update(arr_elem_types)

        # Build FieldProfile objects
        profiles: List[FirebaseFieldProfile] = []
        for fpath, obs in field_observations.items():
            vals = obs["values"]
            non_null_vals = [v for v in vals if v is not None]
            presence_count = len(non_null_vals)
            null_count = sum(1 for v in vals if v is None)
            missing_count = total_records - len(vals)
            presence_ratio = round(presence_count / total_records, 3) if total_records > 0 else 0.0

            sample_vals = cls._sanitize_sample_values(fpath, non_null_vals)
            unique_count = len(set(str(v) for v in non_null_vals))

            # Observational Heuristics
            cand_id, id_reason = cls._evaluate_identifier_candidate(
                field_path=fpath,
                presence_count=presence_count,
                total_sampled=total_records,
                unique_count=unique_count,
                observed_types=obs["types"],
            )

            cand_ref, ref_reason = cls._evaluate_reference_candidate(
                field_path=fpath,
                observed_types=obs["types"],
                sample_values=non_null_vals,
                is_candidate_id=cand_id,
            )

            cand_temp, temp_reason, temp_fmt = cls._evaluate_temporal_candidate(
                field_path=fpath,
                observed_types=obs["types"],
                sample_values=non_null_vals,
            )

            arr_item_types = sorted(list(obs["array_item_types"])) if obs["array_item_types"] else None

            profiles.append(
                FirebaseFieldProfile(
                    field_path=fpath,
                    observed_types=sorted(list(obs["types"])),
                    presence_count=presence_count,
                    null_count=null_count,
                    missing_count=missing_count,
                    total_sampled=total_records,
                    presence_ratio=presence_ratio,
                    is_nested=obs["is_nested"],
                    is_array=obs["is_array"],
                    array_item_types=arr_item_types,
                    candidate_identifier=cand_id,
                    identifier_reason=id_reason,
                    candidate_reference=cand_ref,
                    reference_reason=ref_reason,
                    candidate_temporal=cand_temp,
                    temporal_reason=temp_reason,
                    temporal_format=temp_fmt,
                    sample_values=sample_vals,
                    unique_value_count=unique_count,
                )
            )

        # Sort fields: candidate identifiers first, then alphabetical
        profiles.sort(key=lambda f: (not f.candidate_identifier, f.field_path))
        return profiles, has_nested, has_arrays

    @classmethod
    def _flatten_record(
        cls,
        data: Any,
        prefix: str = "",
        depth: int = 1,
        max_depth: int = 4,
    ) -> List[Tuple[str, Any, bool, bool, Optional[List[str]]]]:
        """
        Recursively extract field paths, values, nested indicators, and array types.
        Returns tuples: (field_path, value, is_nested, is_array, array_item_types)
        """
        results = []
        if depth > max_depth or not isinstance(data, dict):
            return results

        for key, val in data.items():
            if prefix == "" and key in ("_key", "_index"):
                results.append((key, val, False, False, None))
                continue

            current_path = f"{prefix}.{key}" if prefix else key
            is_nested = bool(prefix)

            if isinstance(val, dict):
                if depth < max_depth:
                    results.extend(cls._flatten_record(val, prefix=current_path, depth=depth + 1, max_depth=max_depth))
                else:
                    results.append((current_path, val, True, False, None))

            elif isinstance(val, list):
                if not val:
                    results.append((f"{current_path}[]", [], is_nested, True, []))
                else:
                    item_types = list({cls._detect_type(item) for item in val[:5]})
                    has_dict_items = any(isinstance(item, dict) for item in val[:5])
                    if has_dict_items and depth < max_depth:
                        for item in val[:3]:
                            if isinstance(item, dict):
                                results.extend(
                                    cls._flatten_record(
                                        item,
                                        prefix=f"{current_path}[]",
                                        depth=depth + 1,
                                        max_depth=max_depth,
                                    )
                                )
                    else:
                        results.append((f"{current_path}[]", val[:3], is_nested, True, item_types))
            else:
                results.append((current_path, val, is_nested, False, None))

        return results

    @classmethod
    def _detect_type(cls, val: Any) -> str:
        """Identify observed JSON type."""
        if val is None:
            return "null"
        if isinstance(val, bool):
            return "boolean"
        if isinstance(val, (int, float)):
            return "number"
        if isinstance(val, str):
            return "string"
        if isinstance(val, dict):
            return "object"
        if isinstance(val, list):
            return "array"
        return "unknown"

    @classmethod
    def _sanitize_sample_values(cls, field_path: str, values: List[Any]) -> List[Any]:
        """Produce safe, truncated sample values without exposing secrets."""
        lowered = field_path.lower()
        if any(pat in lowered for pat in SENSITIVE_KEY_PATTERNS):
            return ["[REDACTED_SENSITIVE_VALUE]"]

        sanitized = []
        for val in values[:3]:
            if isinstance(val, str):
                if len(val) > 60:
                    sanitized.append(val[:57] + "...")
                else:
                    sanitized.append(val)
            elif isinstance(val, (dict, list)):
                dumped = json.dumps(val)
                if len(dumped) > 60:
                    sanitized.append(dumped[:57] + "...")
                else:
                    sanitized.append(dumped)
            else:
                sanitized.append(val)
        return sanitized

    @classmethod
    def _evaluate_identifier_candidate(
        cls,
        field_path: str,
        presence_count: int,
        total_sampled: int,
        unique_count: int,
        observed_types: Set[str],
    ) -> Tuple[bool, Optional[str]]:
        """
        Observational heuristic: Checks whether a field looks structurally suitable as an identifier.
        """
        base_name = field_path.split(".")[-1].replace("[]", "")
        is_name_match = bool(RE_IDENTIFIER_NAME.match(base_name))
        is_suffix_match = bool(RE_IDENTIFIER_SUFFIX.search(base_name))
        is_unique = unique_count == presence_count and presence_count > 0
        is_100_percent_present = presence_count == total_sampled and total_sampled > 0

        if is_name_match:
            if is_unique and is_100_percent_present:
                return (
                    True,
                    f"Exact identifier naming pattern ('{base_name}') with 100% presence ({presence_count}/{total_sampled}) and 100% unique sample values ({unique_count} distinct).",
                )
            return (
                True,
                f"Identifier naming pattern ('{base_name}') observed in {presence_count}/{total_sampled} records.",
            )

        if base_name in ("_key", "id"):
            return (
                True,
                "Firebase node key / direct identifier attribute.",
            )

        if is_suffix_match and is_unique and is_100_percent_present:
            return (
                True,
                f"Identifier suffix ('{base_name}') with 100% unique values across all sampled records.",
            )

        return False, None

    @classmethod
    def _evaluate_reference_candidate(
        cls,
        field_path: str,
        observed_types: Set[str],
        sample_values: List[Any],
        is_candidate_id: bool,
    ) -> Tuple[bool, Optional[str]]:
        """
        Observational heuristic: Checks whether a field may reference another branch/entity.
        """
        base_name = field_path.split(".")[-1].replace("[]", "")
        if base_name in ("_key", "id") and "." not in field_path:
            return False, None

        if RE_REFERENCE_NAME.search(base_name):
            if observed_types.intersection({"string", "number"}):
                return (
                    True,
                    f"Field name pattern ('{base_name}') resembles foreign reference/key with alphanumeric/numeric data types.",
                )

        return False, None

    @classmethod
    def _evaluate_temporal_candidate(
        cls,
        field_path: str,
        observed_types: Set[str],
        sample_values: List[Any],
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Observational heuristic: Checks if field likely contains date/time data.
        """
        base_name = field_path.split(".")[-1].replace("[]", "")
        name_match = bool(RE_TEMPORAL_NAME.search(base_name))

        for val in sample_values[:5]:
            if isinstance(val, str):
                if RE_ISO_DATE.match(val):
                    return (
                        True,
                        f"Values match ISO-8601 timestamp format ('{val[:19]}').",
                        "ISO-8601 Timestamp",
                    )
                if RE_STANDARD_DATE.match(val):
                    return (
                        True,
                        f"Values match formatted date string ('{val}').",
                        "Formatted Date",
                    )
            elif isinstance(val, (int, float)):
                if 1000000000 <= val <= 2500000000:
                    return (
                        True,
                        f"Numeric value ({val}) corresponds to Unix epoch timestamp in seconds.",
                        "Unix Epoch Timestamp (Seconds)",
                    )
                elif 1000000000000 <= val <= 2500000000000:
                    return (
                        True,
                        f"Numeric value ({val}) corresponds to Unix epoch timestamp in milliseconds.",
                        "Unix Epoch Timestamp (Milliseconds)",
                    )

        if name_match:
            return (
                True,
                f"Field name ('{base_name}') suggests temporal metadata.",
                "Candidate Date/Time",
            )

        return False, None, None

    @classmethod
    def _cross_check_references(
        cls,
        source_branch: FirebaseBranchProfile,
        source_records: List[Dict[str, Any]],
        all_branches: List[FirebaseBranchProfile],
        branch_keys_cache: Dict[str, Set[str]],
    ) -> List[FirebaseReferenceCandidate]:
        """
        Safe cross-branch validation: checks if sample values from candidate reference fields
        match keys or candidate ID values from other discovered branches.
        """
        ref_checks: List[FirebaseReferenceCandidate] = []
        if not source_records:
            return ref_checks

        ref_fields = [f for f in source_branch.fields if f.candidate_reference]

        for rf in ref_fields:
            fpath = rf.field_path
            raw_vals = [
                r.get(fpath)
                for r in source_records
                if fpath in r and r[fpath] is not None
            ]
            if not raw_vals:
                continue

            str_vals = [str(v).strip() for v in raw_vals if str(v).strip()]
            if not str_vals:
                continue

            for target_bp in all_branches:
                if target_bp.path == source_branch.path:
                    continue

                target_keys = branch_keys_cache.get(target_bp.name, set())
                target_id_vals: Set[str] = set()
                for target_field in target_bp.fields:
                    if target_field.candidate_identifier:
                        for s_val in target_field.sample_values:
                            if s_val is not None:
                                target_id_vals.add(str(s_val).strip())

                all_target_identifiers = target_keys.union(target_id_vals)

                matches = sum(1 for v in str_vals if v in all_target_identifiers)
                match_rate = round(matches / len(str_vals), 3) if str_vals else 0.0

                if matches > 0 or cls._is_target_name_match(rf.field_path, target_bp.name):
                    ref_checks.append(
                        FirebaseReferenceCandidate(
                            source_path=source_branch.path,
                            source_field=rf.field_path,
                            target_path=target_bp.path,
                            reason=(
                                f"Observed {matches}/{len(str_vals)} sample values matching keys in {target_bp.path} "
                                f"(match rate: {int(match_rate * 100)}%)."
                                if matches > 0
                                else f"Field name pattern matches target branch '{target_bp.name}'."
                            ),
                            match_rate=match_rate if matches > 0 else None,
                            sampled_matches=matches if matches > 0 else None,
                            sampled_total=len(str_vals),
                        )
                    )

        return ref_checks

    @classmethod
    def _is_target_name_match(cls, field_name: str, target_branch_name: str) -> bool:
        """Check if field name resembles target collection name (e.g. company_id -> companies)."""
        clean_field = field_name.lower().replace("_id", "").replace("id", "").replace("_key", "")
        clean_target = target_branch_name.lower().rstrip("s")
        return clean_field == clean_target or clean_target in clean_field

    @classmethod
    def _generate_markdown_summary(
        cls,
        branch_profiles: List[FirebaseBranchProfile],
        global_references: List[FirebaseReferenceCandidate],
        sample_limit: int,
        profiled_at: str,
    ) -> str:
        """Generate clean, human-readable markdown report of the profiling results."""
        lines = [
            "# Firebase Realtime Database — Structural Data Profile",
            f"**Profiled At**: `{profiled_at}` | **Sample Limit**: `{sample_limit}` records/path | **Branches Profiled**: `{len(branch_profiles)}`",
            "",
            "> [!NOTE]",
            "> This profile is purely **observational**. No semantic mapping or Neo4j entities have been generated.",
            "",
        ]

        for bp in branch_profiles:
            lines.extend([
                f"## Branch: `{bp.path}`",
                f"- **Direct Children (approx)**: `{bp.approx_child_count}`",
                f"- **Records Sampled**: `{bp.sample_size}`",
                f"- **Classification**: `{'Collection' if bp.is_collection_like else 'Single Object'}` | **Nested Objects**: `{'Yes' if bp.has_nested_children else 'No'}` | **Arrays**: `{'Yes' if bp.has_arrays else 'No'}`",
                "",
                "### Discovered Fields",
                "| Field Path | Observed Types | Presence | Missing/Null | Candidate Flags | Sample Values |",
                "| :--- | :--- | :--- | :--- | :--- | :--- |",
            ])

            for f in bp.fields:
                flags = []
                if f.candidate_identifier:
                    flags.append("[ID]")
                if f.candidate_reference:
                    flags.append("[REF]")
                if f.candidate_temporal:
                    flags.append(f"[TIME: {f.temporal_format or 'Date'}]")
                flag_str = " ".join(flags) if flags else "—"

                types_str = ", ".join(f.observed_types)
                presence_str = f"{f.presence_count}/{f.total_sampled} ({int(f.presence_ratio * 100)}%)"
                null_miss = f"{f.null_count} null / {f.missing_count} miss"
                samples_str = ", ".join(str(s) for s in f.sample_values[:2]) or "—"

                lines.append(
                    f"| `{f.field_path}` | {types_str} | {presence_str} | {null_miss} | {flag_str} | `{samples_str}` |"
                )

            if bp.reference_cross_checks:
                lines.extend([
                    "",
                    "### Candidate References & Cross-Branch Links",
                    "| Source Field | Target Path | Match Rate | Evidence |",
                    "| :--- | :--- | :--- | :--- |",
                ])
                for rc in bp.reference_cross_checks:
                    rate_str = f"{int((rc.match_rate or 0) * 100)}%" if rc.match_rate is not None else "Pattern Match"
                    lines.append(
                        f"| `{rc.source_field}` | `{rc.target_path}` | `{rate_str}` | {rc.reason} |"
                    )

            lines.append("")

        return "\n".join(lines)
