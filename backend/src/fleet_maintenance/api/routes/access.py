from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import User
from fleet_maintenance.services.access import (
    COOKIE_NAME,
    effective_session_role,
    login,
    register,
    session_record,
)
from fleet_maintenance.settings import get_settings

router = APIRouter(prefix="/access", tags=["access"])


class Credentials(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    workspace: Literal["engineer", "supervisor", "logistics", "fleet_manager"] | None = None


class SessionInfo(BaseModel):
    id: str
    role: str
    authentication: str
    csrf_token: str | None = None


class RegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=14, max_length=256)

    @field_validator("user_id", mode="before")
    @classmethod
    def normalize_id(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if any(ord(character) < 32 or ord(character) == 127 for character in value):
                raise ValueError("Display name cannot contain control characters")
        return value


class RegistrationOptions(BaseModel):
    enabled: bool


class RegistrationInfo(BaseModel):
    id: str
    display_name: str
    role: str


@router.get("/registration", response_model=RegistrationOptions)
def registration_options() -> dict[str, bool]:
    settings = get_settings()
    return {"enabled": settings.allow_signup and settings.authentication_mode == "session"}


@router.post("/registration", status_code=201, response_model=RegistrationInfo)
def create_account(
    credentials: RegistrationRequest,
    request: Request,
    database: Session = Depends(get_session),
) -> dict[str, str]:
    settings = get_settings()
    if not settings.allow_signup or settings.authentication_mode != "session":
        raise HTTPException(404, "Self-registration is disabled")
    if request.headers.get("origin") not in settings.allowed_origins:
        raise HTTPException(403, "Allowed request origin required")
    user = register(database, credentials.user_id, credentials.display_name, credentials.password)
    return {"id": user.id, "display_name": user.display_name, "role": user.role}


@router.get("/session", response_model=SessionInfo)
def session(
    request: Request,
    actor: Actor = Depends(current_actor),
    database: Session = Depends(get_session),
) -> dict[str, object]:
    mode = get_settings().authentication_mode
    return {
        "id": actor.id,
        "role": actor.role,
        "authentication": "server session" if mode == "session" else "demonstration header",
        "csrf_token": session_record(database, request).csrf_token if mode == "session" else None,
    }


@router.post("/session", response_model=SessionInfo)
def create_session(
    credentials: Credentials,
    request: Request,
    response: Response,
    database: Session = Depends(get_session),
) -> dict[str, object]:
    settings = get_settings()
    if settings.authentication_mode != "session":
        raise HTTPException(404, "Session login is disabled in demonstration mode")
    if request.headers.get("origin") not in settings.allowed_origins:
        raise HTTPException(403, "Allowed request origin required")
    token, record = login(
        database, credentials.user_id, credentials.password, credentials.workspace
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        max_age=settings.session_hours * 3600,
        path=settings.api_prefix,
    )
    user = database.get(User, record.user_id)
    assert user is not None
    return {
        "id": record.user_id,
        "role": effective_session_role(user, record),
        "authentication": "server session",
        "csrf_token": record.csrf_token,
    }


@router.delete("/session", status_code=204)
def logout(
    request: Request,
    response: Response,
    actor: Actor = Depends(current_actor),
    database: Session = Depends(get_session),
) -> None:
    del actor
    if get_settings().authentication_mode == "session":
        database.delete(session_record(database, request))
        database.commit()
    settings = get_settings()
    response.delete_cookie(
        COOKIE_NAME,
        path=settings.api_prefix,
        secure=settings.secure_cookies,
        httponly=True,
        samesite=settings.cookie_samesite,
    )
