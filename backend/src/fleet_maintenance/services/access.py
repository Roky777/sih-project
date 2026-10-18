"""Opaque server-side sessions; credentials use maintained Argon2 password hashing."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.models import AuditEvent, LoginSession, User
from fleet_maintenance.settings import get_settings

passwords = PasswordHash.recommended()
_DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))
COOKIE_NAME = "fleet_session"


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register(session: Session, user_id: str, display_name: str, password: str) -> User:
    """Self-registration never assigns mutation or approval permissions."""
    if session.get(User, user_id) is not None:
        raise HTTPException(409, "Account ID is already in use. Choose another or sign in.")
    user = User(
        id=user_id,
        display_name=display_name,
        role="viewer",
        password_hash=passwords.hash(password),
    )
    session.add(user)
    session.add(
        AuditEvent(
            actor=user_id,
            action="account.registered",
            subject_id=user_id,
            details={"role": "viewer"},
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            409, "Account ID is already in use. Choose another or sign in."
        ) from exc
    return user


def allowed_workspaces(role: str) -> set[str]:
    if role == "supervisor":
        return {"engineer", "supervisor", "logistics", "fleet_manager"}
    mapped = {"viewer": "fleet_manager", "planner": "supervisor", "administrator": "supervisor"}
    return {mapped.get(role, role)}


def effective_session_role(user: User, record: LoginSession) -> str:
    if record.workspace and record.workspace not in allowed_workspaces(user.role):
        raise HTTPException(401, "Workspace access has changed. Sign in again.")
    # Supervisor workspaces narrow the session's permissions to the chosen team.
    # Other account types retain their original server permissions.
    if user.role == "supervisor" and record.workspace:
        return record.workspace
    return user.role


def login(
    session: Session, user_id: str, password: str, workspace: str | None = None
) -> tuple[str, LoginSession]:
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    now = datetime.now(UTC)
    valid = passwords.verify(
        password, user.password_hash if user and user.password_hash else _DUMMY_HASH
    )
    if user is None or user.disabled or (user.locked_until and utc(user.locked_until) > now):
        raise HTTPException(401, "Invalid credentials or unavailable account")
    if not valid or not user.password_hash:
        user.failed_logins += 1
        if user.failed_logins >= 5:
            user.locked_until = now + timedelta(minutes=15)
        session.commit()
        raise HTTPException(401, "Invalid credentials or unavailable account")
    if workspace is not None and workspace not in allowed_workspaces(user.role):
        raise HTTPException(403, "This account does not have access to the selected workspace")
    user.failed_logins = 0
    user.locked_until = None
    token = secrets.token_urlsafe(48)
    record = LoginSession(
        token_hash=token_hash(token),
        user_id=user.id,
        workspace=workspace,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(hours=get_settings().session_hours),
    )
    session.add(record)
    session.commit()
    return token, record


def session_record(session: Session, request: Request) -> LoginSession:
    token = request.cookies.get(COOKIE_NAME, "")
    record = session.get(LoginSession, token_hash(token)) if token else None
    if record is None or utc(record.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "Authentication required")
    return record


def authenticate_session(session: Session, request: Request) -> User:
    record = session_record(session, request)
    user = session.get(User, record.user_id)
    if user is None or user.disabled:
        raise HTTPException(401, "Authentication required")
    effective_session_role(user, record)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        supplied = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(supplied, record.csrf_token):
            raise HTTPException(403, "Valid CSRF token required")
        if request.headers.get("origin") not in get_settings().allowed_origins:
            raise HTTPException(403, "Allowed request origin required")
    return user
