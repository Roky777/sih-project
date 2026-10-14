from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


class AircraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    tail_number: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9][A-Za-z0-9-]+$")
    serial_number: str = Field(min_length=1, max_length=80)
    aircraft_type: str = Field(min_length=2, max_length=100)
    base: str = Field(min_length=1, max_length=80)
    fleet_entry_date: date


class ComponentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    serial_number: str = Field(min_length=1, max_length=80)
    kind: str = Field(min_length=2, max_length=80)
    position: str = Field(min_length=1, max_length=80)
    installed_on: date


class SourceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: Literal["usage", "maintenance_requirement", "technical_history"]
    effective_date: date
    component_id: str | None = Field(default=None, max_length=64)
    flight_hours: FiniteFloat | None = Field(default=None, ge=0)
    cycles: int | None = Field(default=None, ge=0)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    due_date: date | None = None
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def required_fields(self) -> "SourceRecord":
        if self.kind == "usage" and self.component_id:
            raise ValueError(
                "Usage rows refer to the airframe; use technical history for components"
            )
        if self.kind == "usage" and (self.flight_hours is None or self.cycles is None):
            raise ValueError("Usage requires flight_hours (hours) and cycles")
        if self.kind != "usage" and not self.title:
            raise ValueError("Maintenance and technical records require a title")
        if self.kind == "maintenance_requirement" and self.due_date is None:
            raise ValueError("Maintenance requirement needs a due_date")
        return self


class RecordsImport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    source: str = Field(min_length=1, max_length=120)
    records: list[SourceRecord] = Field(min_length=1, max_length=500)
    preview: bool = True
