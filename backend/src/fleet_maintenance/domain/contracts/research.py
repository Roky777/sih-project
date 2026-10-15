"""Read-only research evidence; these contracts cannot register an operational model."""

from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

Subset = Literal["FD001", "FD002", "FD003", "FD004"]


class ResearchRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ErrorMetrics(ResearchRecord):
    count: int = Field(ge=1)
    mae_cycles: FiniteFloat = Field(ge=0)
    rmse_cycles: FiniteFloat = Field(ge=0)
    asymmetric_score: FiniteFloat = Field(ge=0)


class SensorPoint(ResearchRecord):
    cycle: int = Field(ge=1)
    sensor_2: FiniteFloat
    sensor_3: FiniteFloat
    sensor_4: FiniteFloat


class InputInfluence(ResearchRecord):
    feature: str
    change_when_replaced_cycles: FiniteFloat


class ResearchEngine(ResearchRecord):
    engine_id: str
    engine_number: int = Field(ge=1)
    cutoff_cycle: int = Field(ge=1)
    status: Literal["evaluated", "withheld"]
    predicted_rul_cycles: FiniteFloat | None
    lower_cycles: FiniteFloat | None
    upper_cycles: FiniteFloat | None
    reference_rul_cycles: FiniteFloat = Field(ge=0)
    review_urgency: Literal["critical_review", "review", "routine", "unavailable"]
    recommendation: str
    sensor_trend: list[SensorPoint]
    influences: list[InputInfluence] = []

    @model_validator(mode="after")
    def aligned(self) -> Self:
        if self.status == "withheld":
            if any(x is not None for x in (
                self.predicted_rul_cycles, self.lower_cycles, self.upper_cycles
            )) or self.review_urgency != "unavailable" or self.influences:
                raise ValueError("Withheld evidence cannot contain predictions or influences")
        elif (self.predicted_rul_cycles is None or self.lower_cycles is None
              or self.upper_cycles is None or not
              0 <= self.lower_cycles <= self.predicted_rul_cycles <= self.upper_cycles
              or self.review_urgency == "unavailable"):
            raise ValueError("Evaluated prediction must have an ordered nonnegative life range")
        cycles = [point.cycle for point in self.sensor_trend]
        if cycles != sorted(set(cycles)) or any(c > self.cutoff_cycle for c in cycles):
            raise ValueError("Sensor history must be unique, ordered and cutoff-bound")
        return self


class ResearchSummary(ResearchRecord):
    schema_version: Literal["research-benchmark-v1"] = "research-benchmark-v1"
    subset: Subset
    simulated: Literal[True] = True
    evidence_status: Literal["historical_inspected", "research_only"]
    model_version: str
    operating_conditions: int
    fault_modes: int
    target_cap_cycles: int
    minimum_history_cycles: int
    train_engine_count: int
    test_engine_count: int
    withheld_count: int
    split_counts: dict[str, int]
    capped_primary: ErrorMetrics
    uncapped_secondary: ErrorMetrics
    validation: ErrorMetrics | None
    constant_baseline: ErrorMetrics | None
    interval_coverage: FiniteFloat = Field(ge=0, le=1)
    mean_interval_width_cycles: FiniteFloat = Field(ge=0)
    nominal_interval_coverage: FiniteFloat = Field(gt=0, lt=1)
    protocol: str
    limitations: str
    provenance: dict[str, Any]


class ResearchReport(ResearchSummary):
    engines: list[ResearchEngine]

    @model_validator(mode="after")
    def denominators(self) -> Self:
        if (len(self.engines) != self.test_engine_count
                or len({e.engine_id for e in self.engines}) != len(self.engines)):
            raise ValueError("Research engine identities/count mismatch")
        if self.withheld_count != sum(e.status == "withheld" for e in self.engines):
            raise ValueError("Research withholding count mismatch")
        if self.capped_primary.count + self.withheld_count != self.test_engine_count:
            raise ValueError("Research metric denominator mismatch")
        if any(e.engine_id != f"NASA_CMAPSS:{self.subset}:test:{e.engine_number}"
               for e in self.engines):
            raise ValueError("Research source identity mismatch")
        return self


class ResearchCatalog(ResearchRecord):
    version: str
    reports: dict[Subset, str]


class ResearchIndex(ResearchRecord):
    version: str
    summaries: list[ResearchSummary]


class DrawingEvidence(ResearchRecord):
    model_family: str
    component_reference: str
    mapping_reference: str
    drawing_reference: str | None = None
    drawing_revision: str | None = None
    verification_status: Literal["pending"] = "pending"
    reviewer: str | None = None
    provenance: Literal["authored_demonstration_mapping"] = "authored_demonstration_mapping"
