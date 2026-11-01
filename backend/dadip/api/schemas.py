"""Pydantic request/response models. Response models never expose password hashes or report contacts
unless the endpoint is operator-only."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Hazard = Literal["flood", "cyclone", "earthquake", "tsunami", "landslide", "fire", "heatwave", "other"]
Severity = Literal["low", "moderate", "high", "critical"]
IncidentStatus = Literal["open", "monitoring", "closed"]
ReportStatus = Literal["pending", "verified", "dismissed", "responded"]
RoleName = Literal["citizen", "operator", "approver", "admin"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


# ---- auth ----
class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=10, max_length=200)
    language: str = Field(default="en", max_length=8)


class UserOut(ORM):
    id: uuid.UUID
    email: str
    name: str
    role: RoleName
    language: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth2 token type, not a secret
    user: UserOut


class RoleUpdateIn(BaseModel):
    role: RoleName


# ---- incidents ----
class IncidentIn(BaseModel):
    hazard_type: Hazard
    title: str = Field(min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    severity: Severity
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str | None = Field(default=None, max_length=120)
    magnitude: float | None = None
    affected_population: int | None = Field(default=None, ge=0)


class IncidentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    severity: Severity | None = None
    status: IncidentStatus | None = None
    region: str | None = Field(default=None, max_length=120)
    affected_population: int | None = Field(default=None, ge=0)


class IncidentOut(ORM):
    id: uuid.UUID
    hazard_type: Hazard
    title: str
    description: str | None
    severity: Severity
    status: IncidentStatus
    latitude: float
    longitude: float
    region: str | None
    source: str
    external_id: str | None
    magnitude: float | None
    affected_population: int | None
    data_origin: str
    created_at: datetime
    updated_at: datetime


class AssessmentOut(ORM):
    id: uuid.UUID
    incident_id: uuid.UUID
    model_version: str
    inputs: dict
    input_provenance: dict
    risk: dict
    reliability: dict
    distribution_shift: dict
    admissibility: dict
    explanation: dict
    uncertainty: dict
    composite_risk: int
    admissibility_score: float
    decision: Literal["execute", "defer", "abstain"]
    created_at: datetime


# ---- reports ----
class ReportIn(BaseModel):
    reporter_name: str = Field(min_length=1, max_length=200)
    contact: str | None = Field(default=None, max_length=64)
    hazard_type: Hazard
    description: str = Field(min_length=5, max_length=4000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    location_text: str = Field(min_length=2, max_length=300)
    reported_severity: Severity = "moderate"


class ReportPublicOut(ORM):
    """What the submitter (and the public map) may see: no contact, no reporter identity."""

    id: uuid.UUID
    hazard_type: Hazard
    description: str
    latitude: float
    longitude: float
    location_text: str
    reported_severity: Severity
    status: ReportStatus
    created_at: datetime


class ReportOut(ReportPublicOut):
    reporter_name: str
    contact: str | None
    incident_id: uuid.UUID | None
    credibility: float | None
    credibility_detail: dict | None
    source: str


class ReportPatch(BaseModel):
    status: ReportStatus | None = None
    incident_id: uuid.UUID | None = None


# ---- resources / audit ----
class ResourceOut(ORM):
    id: uuid.UUID
    name: str
    kind: str
    latitude: float
    longitude: float
    address: str | None
    phone: str | None
    capacity: int | None
    occupancy: int
    operational: bool
    region: str | None
    data_origin: str


class AuditOut(ORM):
    id: int
    actor_id: uuid.UUID | None
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict | None
    created_at: datetime
