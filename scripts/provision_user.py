"""Local administrator entry point; passwords are prompted, never passed in arguments."""

import argparse
import getpass

from fleet_maintenance.persistence.database import SessionLocal
from fleet_maintenance.persistence.models import AuditEvent, LoginSession, User
from fleet_maintenance.services.access import passwords
from sqlalchemy import delete


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision or reset a local server-session account"
    )
    parser.add_argument("user_id")
    parser.add_argument("--display-name", required=True)
    parser.add_argument(
        "--role",
        required=True,
        choices=[
            "viewer",
            "fleet_manager",
            "planner",
            "engineer",
            "logistics",
            "supervisor",
            "administrator",
        ],
    )
    args = parser.parse_args()
    if not 1 <= len(args.user_id) <= 64 or not 1 <= len(args.display_name) <= 120:
        parser.error("Account fields exceed their permitted length")
    password = getpass.getpass("Password (at least 14 characters): ")
    if len(password) < 14 or password != getpass.getpass("Repeat password: "):
        parser.error("Passwords must match and have at least 14 characters")
    with SessionLocal() as session:
        user = session.get(User, args.user_id)
        if user is None:
            user = User(id=args.user_id, display_name=args.display_name, role=args.role)
            session.add(user)
        session.execute(delete(LoginSession).where(LoginSession.user_id == args.user_id))
        user.display_name, user.role = args.display_name, args.role
        user.password_hash = passwords.hash(password)
        user.disabled, user.failed_logins, user.locked_until = False, 0, None
        session.add(
            AuditEvent(
                actor="local-administrator",
                action="account.provisioned",
                subject_id=user.id,
                details={"role": args.role},
            )
        )
        session.commit()
    print(f"Account {args.user_id} provisioned; no session created.")


if __name__ == "__main__":
    main()
