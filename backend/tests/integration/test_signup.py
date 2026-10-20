import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from fleet_maintenance.main import app
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import AuditEvent, User
from fleet_maintenance.services.access import passwords
from fleet_maintenance.settings import get_settings

ORIGIN = "https://frontend.example"
PAYLOAD = {
    "user_id": "new-viewer",
    "display_name": "New Viewer",
    "password": "Synthetic-test-password-123",
}


@pytest.fixture
def signup_client(isolated_session, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "authentication_mode", "session")
    monkeypatch.setattr(settings, "allow_signup", True)
    monkeypatch.setattr(settings, "secure_cookies", True)
    monkeypatch.setattr(settings, "allowed_origins", [ORIGIN])

    def override():
        yield isolated_session

    app.dependency_overrides[get_session] = override
    try:
        with TestClient(app, base_url=ORIGIN) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_signup_persists_hash_normalizes_id_and_cannot_grant_approval(
    signup_client, isolated_session
):
    response = signup_client.post(
        "/api/access/registration",
        json=PAYLOAD | {"user_id": " New-Viewer ", "display_name": " New Viewer "},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 201
    assert response.json() == {
        "id": "new-viewer", "display_name": "New Viewer", "role": "viewer"
    }
    assert "set-cookie" not in response.headers
    user = isolated_session.get(User, "new-viewer")
    assert user.password_hash != PAYLOAD["password"]
    assert passwords.verify(PAYLOAD["password"], user.password_hash)
    audit = isolated_session.scalar(
        select(AuditEvent).where(AuditEvent.action == "account.registered")
    )
    assert audit.actor == user.id and audit.details == {"role": "viewer"}
    assert PAYLOAD["password"] not in str(audit.details)
    login = signup_client.post(
        "/api/access/session",
        json={"user_id": user.id, "password": PAYLOAD["password"]},
        headers={"Origin": ORIGIN},
    )
    assert login.status_code == 200 and login.json()["role"] == "viewer"
    assert signup_client.get("/api/fleet").status_code == 200
    assert signup_client.post(
        "/api/jobs/planning", json={},
        headers={"Origin": ORIGIN, "X-CSRF-Token": login.json()["csrf_token"]},
    ).status_code == 403


def test_duplicate_signup_preserves_original_password(signup_client, isolated_session):
    assert signup_client.post(
        "/api/access/registration", json=PAYLOAD, headers={"Origin": ORIGIN}
    ).status_code == 201
    duplicate = signup_client.post(
        "/api/access/registration", json=PAYLOAD | {"password": "Different-test-password"},
        headers={"Origin": ORIGIN},
    )
    assert duplicate.status_code == 409
    assert passwords.verify(
        PAYLOAD["password"], isolated_session.get(User, "new-viewer").password_hash
    )


@pytest.mark.parametrize("changes", [
    {"password": "short"}, {"user_id": "a"}, {"user_id": "bad id"},
    {"user_id": "éxample"}, {"display_name": "   "}, {"display_name": "bad\nname"},
    {"role": "supervisor"},
])
def test_invalid_signup_creates_no_account(signup_client, isolated_session, changes):
    assert signup_client.post(
        "/api/access/registration", json=PAYLOAD | changes, headers={"Origin": ORIGIN}
    ).status_code == 422
    assert isolated_session.get(User, "new-viewer") is None


def test_registration_origin_and_disabled_flag(signup_client, isolated_session, monkeypatch):
    assert signup_client.get("/api/access/registration").json() == {"enabled": True}
    for headers in ({}, {"Origin": "https://untrusted.example"}):
        assert signup_client.post(
            "/api/access/registration", json=PAYLOAD, headers=headers
        ).status_code == 403
    monkeypatch.setattr(get_settings(), "allow_signup", False)
    assert signup_client.get("/api/access/registration").json() == {"enabled": False}
    assert signup_client.post(
        "/api/access/registration", json=PAYLOAD, headers={"Origin": ORIGIN}
    ).status_code == 404
    assert isolated_session.get(User, "new-viewer") is None


def test_demo_header_mode_cannot_register(signup_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "authentication_mode", "demo")
    assert signup_client.get("/api/access/registration").json() == {"enabled": False}
    assert signup_client.post(
        "/api/access/registration", json=PAYLOAD, headers={"Origin": ORIGIN}
    ).status_code == 404


@pytest.mark.parametrize("workspace", ["engineer", "supervisor", "logistics", "fleet_manager"])
@pytest.mark.parametrize("existing_viewer", [False, True])
def test_demo_signup_and_existing_accounts_can_sign_in_to_each_workspace(
    signup_client, isolated_session, monkeypatch, workspace, existing_viewer,
):
    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "tunnel_demo")
    monkeypatch.setattr(settings, "demo_workspace_accounts", not existing_viewer)
    created = signup_client.post(
        "/api/access/registration", json=PAYLOAD, headers={"Origin": ORIGIN},
    )
    assert created.status_code == 201
    assert created.json()["role"] == ("viewer" if existing_viewer else "supervisor")
    monkeypatch.setattr(settings, "demo_workspace_accounts", True)
    credentials = {"user_id": PAYLOAD["user_id"], "password": PAYLOAD["password"],
                   "workspace": workspace}
    rejected = signup_client.post(
        "/api/access/session", json=credentials | {"password": "wrong-password"},
        headers={"Origin": ORIGIN},
    )
    assert rejected.status_code == 401 and "set-cookie" not in rejected.headers
    response = signup_client.post(
        "/api/access/session", json=credentials, headers={"Origin": ORIGIN},
    )
    assert response.status_code == 200 and response.json()["role"] == workspace
    assert signup_client.get("/api/access/session").json()["role"] == workspace
    assert isolated_session.get(User, PAYLOAD["user_id"]).role == (
        "viewer" if existing_viewer else "supervisor"
    )
    if existing_viewer and workspace != "fleet_manager":
        monkeypatch.setattr(settings, "demo_workspace_accounts", False)
        assert signup_client.get("/api/access/session").status_code == 401


def test_normal_signup_still_rejects_staff_workspace(signup_client, monkeypatch):
    # A flag alone cannot enable demo permissions outside the isolated demo environment.
    monkeypatch.setattr(get_settings(), "demo_workspace_accounts", True)
    created = signup_client.post(
        "/api/access/registration", json=PAYLOAD, headers={"Origin": ORIGIN},
    )
    assert created.json()["role"] == "viewer"
    rejected = signup_client.post(
        "/api/access/session", json={"user_id": PAYLOAD["user_id"],
        "password": PAYLOAD["password"], "workspace": "supervisor"},
        headers={"Origin": ORIGIN},
    )
    assert rejected.status_code == 403 and "set-cookie" not in rejected.headers


def test_workspace_self_service_cannot_be_enabled_in_production():
    from pydantic import ValidationError

    from fleet_maintenance.settings import Settings

    with pytest.raises(ValidationError, match="isolated tunnel demo"):
        Settings(environment="production", demo_workspace_accounts=True)
