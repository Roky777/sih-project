"""Create isolated local login accounts without resetting existing credentials."""

import argparse
import json
import os
import secrets
from pathlib import Path

from fleet_maintenance.persistence.database import SessionLocal
from fleet_maintenance.persistence.models import AuditEvent, User
from fleet_maintenance.services.access import allowed_workspaces, passwords

ROLES = {
    "engineer": "Maintenance engineer",
    "supervisor": "Maintenance supervisor",
    "logistics": "Logistics team",
    "fleet_manager": "Fleet manager",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("LOCAL_LOGIN_CREDENTIALS.json"))
    args = parser.parse_args()
    with SessionLocal() as session:
        if args.output.exists():
            saved = json.loads(args.output.read_text())
            for account in saved["accounts"]:
                user = session.get(User, account["user_id"])
                if (
                    not user
                    or not user.password_hash
                    or account["role"] not in allowed_workspaces(user.role)
                ):
                    raise RuntimeError("Saved local accounts do not match the database")
                if not passwords.verify(account["password"], user.password_hash):
                    raise RuntimeError(
                        "A local password has changed; existing accounts were preserved"
                    )
            print("Local login accounts already available; credentials preserved.")
            return
        accounts = []
        for role, label in ROLES.items():
            user_id = f"local-{role.replace('_', '-')}"
            if session.get(User, user_id) is not None:
                raise RuntimeError(f"Account {user_id} exists; no password was reset")
            password = secrets.token_urlsafe(24)
            session.add(
                User(
                    id=user_id,
                    display_name=label,
                    role=role,
                    password_hash=passwords.hash(password),
                )
            )
            session.add(
                AuditEvent(
                    actor="local-administrator",
                    action="account.provisioned",
                    subject_id=user_id,
                    details={"role": role, "purpose": "local-workspace-login"},
                )
            )
            accounts.append(
                {"workspace": label, "role": role, "user_id": user_id, "password": password}
            )
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w") as output:
                json.dump({"accounts": accounts}, output, indent=2)
                output.write("\n")
            session.commit()
        except Exception:
            args.output.unlink(missing_ok=True)
            raise
    print(f"Created four local accounts. Credentials saved to {args.output}; no passwords logged.")


if __name__ == "__main__":
    main()
