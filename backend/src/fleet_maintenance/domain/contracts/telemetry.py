from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from fleet_maintenance.domain.contracts.health import HistoryRow


class TelemetryFrame(HistoryRow):
    observed_at: datetime = Field(strict=False)


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frames: list[dict[str, Any]] = Field(min_length=1, max_length=10)


class ReplayTick(BaseModel):
    model_config = ConfigDict(extra="forbid")
    count: int = Field(default=5, ge=1, le=10)
    demonstrate_rejection: bool = False


class StreamControl(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["running", "paused"]
