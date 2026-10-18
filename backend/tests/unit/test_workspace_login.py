from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from fleet_maintenance.main import app
from fleet_maintenance.persistence.database import Base, get_session
from fleet_maintenance.persistence.models import LoginSession, User
from fleet_maintenance.services.access import passwords
from fleet_maintenance.settings import get_settings

PASSWORD = "workspace-test-password-long-enough"
ORIGIN = {"Origin": "http://localhost:8080"}


@pytest.fixture
def login_client(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, Session], None, None]:
    engine = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    monkeypatch.setattr(get_settings(), "authentication_mode", "session")
    with Session(engine, expire_on_commit=False) as session:
        for role in ["engineer", "supervisor", "logistics", "fleet_manager"]:
            session.add(
                User(
                    id=f"test-{role}",
                    display_name=role,
                    role=role,
                    password_hash=passwords.hash(PASSWORD),
                )
            )
        session.commit()

        def override() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[get_session] = override
        try:
            client = TestClient(app)
            yield client, session
            client.close()
        finally:
            app.dependency_overrides.pop(get_session, None)
    engine.dispose()


@pytest.mark.parametrize("role", ["engineer", "supervisor", "logistics", "fleet_manager"])
def test_workspace_requires_matching_credentials_and_server_session(
    login_client: tuple[TestClient, Session], role: str
) -> None:
    client, session = login_client
    assert client.get("/api/access/session", headers={"X-Demo-Role": role}).status_code == 401
    data = {"user_id": f"test-{role}", "password": PASSWORD, "workspace": role}
    assert (
        client.post(
            "/api/access/session", json={**data, "password": "incorrect"}, headers=ORIGIN
        ).status_code
        == 401
    )
    if role != "supervisor":
        wrong_workspace = "logistics" if role != "logistics" else "engineer"
        assert (
            client.post(
                "/api/access/session", json={**data, "workspace": wrong_workspace}, headers=ORIGIN
            ).status_code
            == 403
        )
    assert session.scalar(select(func.count()).select_from(LoginSession)) == 0
    response = client.post("/api/access/session", json=data, headers=ORIGIN)
    assert response.status_code == 200
    identity = response.json()
    assert identity["id"] == data["user_id"]
    assert identity["role"] == role
    assert identity["authentication"] == "server session"
    assert identity["csrf_token"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert client.get("/api/access/session").json()["role"] == role
    assert client.delete("/api/access/session", headers=ORIGIN).status_code == 403
    assert (
        client.delete(
            "/api/access/session", headers={**ORIGIN, "X-CSRF-Token": identity["csrf_token"]}
        ).status_code
        == 204
    )
    assert client.get("/api/access/session").status_code == 401


def test_workspace_login_rejects_invalid_workspace_and_untrusted_origin(
    login_client: tuple[TestClient, Session],
) -> None:
    client, session = login_client
    data = {"user_id": "test-engineer", "password": PASSWORD, "workspace": "administrator"}
    assert client.post("/api/access/session", json=data, headers=ORIGIN).status_code == 422
    data["workspace"] = "engineer"
    assert (
        client.post(
            "/api/access/session", json=data, headers={"Origin": "https://untrusted.example"}
        ).status_code
        == 403
    )
    assert session.scalar(select(func.count()).select_from(LoginSession)) == 0


@pytest.mark.parametrize("workspace", ["engineer", "supervisor", "logistics", "fleet_manager"])
def test_one_supervisor_username_can_open_every_workspace_with_scoped_permissions(
    login_client: tuple[TestClient, Session], workspace: str
) -> None:
    client, session = login_client
    response = client.post(
        "/api/access/session",
        json={"user_id": "test-supervisor", "password": PASSWORD, "workspace": workspace},
        headers=ORIGIN,
    )
    assert response.status_code == 200
    assert response.json()["id"] == "test-supervisor"
    assert response.json()["role"] == workspace
    assert client.get("/api/access/session").json()["role"] == workspace
    record = session.scalar(select(LoginSession))
    assert record and record.workspace == workspace
    user = session.get(User, "test-supervisor")
    assert user and user.role == "supervisor"
    # A later permission reduction invalidates an incompatible active workspace.
    if workspace != "engineer":
        user.role = "engineer"
        session.commit()
        assert client.get("/api/access/session").status_code == 401
