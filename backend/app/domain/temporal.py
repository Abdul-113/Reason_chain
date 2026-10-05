"""
Temporal Metadata Models
Represents time-bound validity and event timestamps for ReasonChain domain entities and relationships.
"""

from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class TemporalMetadata(BaseModel):
    """
    Optional temporal metadata allowing time-aware graph reasoning.
    """
    valid_from: Optional[str] = Field(default=None, description="ISO timestamp when fact became effective")
    valid_to: Optional[str] = Field(default=None, description="ISO timestamp when fact ceased to be effective")
    observed_at: Optional[str] = Field(default=None, description="ISO timestamp when fact was observed in source system")
    ingested_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp when fact was ingested into ReasonChain"
    )
