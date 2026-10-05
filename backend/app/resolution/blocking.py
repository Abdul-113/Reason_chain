"""
Universal Entity Resolution — Blocking Strategies
Reduces O(n²) pairwise comparisons by grouping records into blocks
where only records sharing a blocking key are compared.

All strategies are source-agnostic — they operate on normalized attribute dicts.
"""

from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.resolution.normalizers import normalize_generic


# ========================================================================
# BASE BLOCKING STRATEGY
# ========================================================================

class BlockingStrategy(ABC):
    """Abstract base for blocking key generation."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable strategy name."""
        ...
    
    @abstractmethod
    def generate_key(self, attributes: Dict[str, Any]) -> Optional[str]:
        """
        Generate a blocking key for a record's attributes.
        Returns None if the key cannot be generated (missing field).
        """
        ...
    
    def generate_blocks(self, records: List[Dict[str, Any]], record_ids: List[str]) -> Dict[str, List[str]]:
        """
        Group record IDs into blocks by their generated keys.
        
        Args:
            records: List of attribute dicts
            record_ids: Corresponding list of record IDs
        
        Returns:
            Dict mapping blocking keys to lists of record IDs
        """
        blocks: Dict[str, List[str]] = {}
        
        for attrs, rid in zip(records, record_ids):
            key = self.generate_key(attrs)
            if key is not None and key != "":
                if key not in blocks:
                    blocks[key] = []
                blocks[key].append(rid)
        
        return blocks
    
    def generate_candidate_pairs(
        self, records: List[Dict[str, Any]], record_ids: List[str]
    ) -> Set[Tuple[str, str]]:
        """
        Generate candidate pairs (record ID tuples) from blocks.
        Only records in the same block are paired for comparison.
        Pairs are unordered (sorted) to avoid duplicates.
        """
        blocks = self.generate_blocks(records, record_ids)
        pairs: Set[Tuple[str, str]] = set()
        
        for _key, ids in blocks.items():
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    pair = tuple(sorted([ids[i], ids[j]]))
                    pairs.add(pair)
        
        return pairs


# ========================================================================
# CONCRETE BLOCKING STRATEGIES
# ========================================================================

class ExactBlockingKey(BlockingStrategy):
    """Group records by exact normalized value of a field."""
    
    def __init__(self, field_name: str) -> None:
        self._field_name = field_name
    
    @property
    def name(self) -> str:
        return f"exact_block({self._field_name})"
    
    def generate_key(self, attributes: Dict[str, Any]) -> Optional[str]:
        value = attributes.get(self._field_name)
        if value is None:
            return None
        normalized = normalize_generic(value)
        return normalized


class PrefixBlockingKey(BlockingStrategy):
    """Group records by the first N characters of a normalized field value."""
    
    def __init__(self, field_name: str, prefix_length: int = 3) -> None:
        self._field_name = field_name
        self._prefix_length = max(1, prefix_length)
    
    @property
    def name(self) -> str:
        return f"prefix_block({self._field_name}, {self._prefix_length})"
    
    def generate_key(self, attributes: Dict[str, Any]) -> Optional[str]:
        value = attributes.get(self._field_name)
        if value is None:
            return None
        normalized = normalize_generic(value)
        if normalized is None or len(normalized) < self._prefix_length:
            return normalized
        return normalized[:self._prefix_length]


class SortedNeighborhood(BlockingStrategy):
    """
    Sorted neighborhood blocking: sorts records by a key field and compares
    within a sliding window. The 'key' here is the full normalized value;
    generate_blocks groups by sorted-order windows.
    """
    
    def __init__(self, field_name: str, window_size: int = 5) -> None:
        self._field_name = field_name
        self._window_size = max(2, window_size)
    
    @property
    def name(self) -> str:
        return f"sorted_neighborhood({self._field_name}, w={self._window_size})"
    
    def generate_key(self, attributes: Dict[str, Any]) -> Optional[str]:
        value = attributes.get(self._field_name)
        if value is None:
            return None
        return normalize_generic(value)
    
    def generate_candidate_pairs(
        self, records: List[Dict[str, Any]], record_ids: List[str]
    ) -> Set[Tuple[str, str]]:
        """Override: use sliding window over sorted records instead of exact blocks."""
        # Build (sort_key, record_id) pairs
        keyed: List[Tuple[str, str]] = []
        for attrs, rid in zip(records, record_ids):
            key = self.generate_key(attrs)
            if key is not None:
                keyed.append((key, rid))
        
        # Sort by key
        keyed.sort(key=lambda x: x[0])
        
        # Sliding window
        pairs: Set[Tuple[str, str]] = set()
        for i in range(len(keyed)):
            for j in range(i + 1, min(i + self._window_size, len(keyed))):
                pair = tuple(sorted([keyed[i][1], keyed[j][1]]))
                pairs.add(pair)
        
        return pairs


# ========================================================================
# BLOCKING PIPELINE
# ========================================================================

class BlockingPipeline:
    """
    Chain multiple blocking strategies with union of candidate pairs.
    Ensures comprehensive candidate generation while maintaining efficiency.
    """
    
    def __init__(self, strategies: Optional[List[BlockingStrategy]] = None) -> None:
        self._strategies: List[BlockingStrategy] = strategies or []
    
    def add_strategy(self, strategy: BlockingStrategy) -> None:
        """Add a blocking strategy to the pipeline."""
        self._strategies.append(strategy)
    
    def generate_candidate_pairs(
        self,
        records: List[Dict[str, Any]],
        record_ids: List[str],
        max_pairs: Optional[int] = None,
    ) -> Set[Tuple[str, str]]:
        """
        Generate the union of candidate pairs from all strategies.
        
        Args:
            records: List of attribute dicts
            record_ids: Corresponding record IDs
            max_pairs: Optional cap on total candidate pairs
        
        Returns:
            Set of (record_id_a, record_id_b) pairs to compare
        """
        all_pairs: Set[Tuple[str, str]] = set()
        
        for strategy in self._strategies:
            pairs = strategy.generate_candidate_pairs(records, record_ids)
            all_pairs |= pairs
            
            if max_pairs and len(all_pairs) >= max_pairs:
                break
        
        if max_pairs and len(all_pairs) > max_pairs:
            # Deterministic truncation: sorted order
            sorted_pairs = sorted(all_pairs)
            return set(sorted_pairs[:max_pairs])
        
        return all_pairs
    
    @property
    def strategy_names(self) -> List[str]:
        return [s.name for s in self._strategies]
    
    @property
    def strategy_count(self) -> int:
        return len(self._strategies)


def create_default_blocking_pipeline(
    blocking_fields: Optional[List[str]] = None,
    prefix_length: int = 3,
) -> BlockingPipeline:
    """
    Create a default blocking pipeline using exact blocking on specified fields
    plus prefix blocking on company_name.
    """
    fields = blocking_fields or ["state", "company_category"]
    pipeline = BlockingPipeline()
    
    for field in fields:
        pipeline.add_strategy(ExactBlockingKey(field))
    
    # Add prefix blocking on company_name for broader coverage
    pipeline.add_strategy(PrefixBlockingKey("company_name", prefix_length))
    
    return pipeline
