# Access and Permissions

Status: single-workspace server sessions and demo identity injection implemented. External identity federation, multi-role accounts and tenant/record isolation are not implemented.

| Role | Implemented mutations |
|---|---|
| viewer | None; read protected workspace records. |
| fleet_manager | Run fleet-health what-if scenarios; acknowledge alerts. |
| engineer | Import supported engine histories, request assessments, acknowledge alerts. |
| planner | Submit planning/simulation jobs and create/revise proposals/scenarios. |
| logistics | Version-checked, audited stock adjustments. |
| supervisor | Engineer/planner/logistics actions plus approval, rejection and work outcomes. |
| administrator | Controlled model registration and labelled workspace fixture imports; no implicit operational approval. |

Every protected router authenticates on the server. Version checks and role checks apply regardless of hidden browser controls. Jobs record an owner; cancellation requires that owner or a supervisor. Workspace reads are shared by authenticated accounts; there is no tenant-isolation claim.

## Sessions

`FLEET_AUTHENTICATION_MODE=session` uses Argon2 password hashes through pwdlib and opaque random server-side sessions. Only SHA-256 session-token hashes are stored. Cookies are HttpOnly, SameSite=Strict, scoped to `/api`, and Secure in production. Sessions expire after eight hours by default. Mutations require the returned CSRF token and an allowed Origin. Login origin checks, per-account lockout after five failures for fifteen minutes, and proxy login rate limits are implemented. Logout deletes the server session; disabling/resetting an account prevents its previous sessions being used.

`GET/POST/DELETE /api/access/session` provide identity, login and logout. The browser keeps the CSRF token in memory and returns to sign-in after session expiry. Provision/reset an account using `scripts/provision_user.py` with a configured database and the installable backend package; passwords are prompted twice, require fourteen characters, and never appear in arguments or logs. Provisioning resets sessions and adds an audit event.

## Optional self-registration

`FLEET_ALLOW_SIGNUP` defaults to false. When explicitly enabled with session
authentication, `GET /api/access/registration` advertises signup and `POST` creates
an account with an allowed Origin. Account IDs are normalized to lowercase and
must contain 3–64 ASCII letters, digits, dots, underscores or hyphens, starting
with a letter or digit. Display names are trimmed and passwords require 14–256
characters. Duplicate account IDs return 409 and never reset an existing account.
Passwords are Argon2 hashes; registration is audited without credentials.

By default, every self-registered account has the **viewer** role. Role input is rejected.
Registration does not create a session: the user signs in after success. An
administrator provisions additional roles separately. Viewers can read the
shared synthetic workspace; no record/tenant isolation or email verification is
claimed. The EC2 HTTPS proxy limits signup POSTs to five per minute per source IP
with a burst of three. AWS demonstration signup is enabled by its compose overlay.

`demo` mode reads `X-Demo-User` and `X-Demo-Role` for labelled local fixtures only. Session mode ignores these headers. Production settings reject demo authentication, insecure cookies, automatic schema creation/seeding, non-PostgreSQL storage and non-HTTPS origins.

Audit records retain actors, UTC timestamps, versions and reasons for material changes. These controls do not establish regulatory certification or aircraft maintenance authority.

Customer-trial `/demo` routes require local development/demo authentication or the explicit `tunnel_demo` environment with server sessions. Production still rejects them. Tunnel mode requires a separate `fleet_public_demo` PostgreSQL database, secure cookies, explicit HTTPS origins and explicit migrations/bootstrap. It cannot use header identities. `FLEET_COOKIE_SAMESITE=none` permits the cross-site Pages experiment; `strict` is the default and production setting. Cookie blocking still applies to `none`; Pages uses the complete-app origin for reliable sessions. Trial creation/planning requires planner or supervisor. Assessments, delivery outcomes, approval and work retain their existing engineer/logistics/supervisor checks. Offline model installation uses administrator registration; a customer cannot upload executable model weights. Actions in the guided customer trial mutate only its dedicated synthetic records.

## Release scope — 2026-10-05

Administrator additionally configures operational resources; planner/supervisor submits exact-plan comparisons. Authentication scopes one isolated agency installation: all authenticated accounts share its read workspace; job cancellation retains owner/supervisor authorization. `deployment_scope` rejects shared multi-agency mode. Selected ASVS 5.0.0 controls and remaining security-assessment limits are mapped in `docs/operations/security_review.md`.

## Fleet-health workspace decisions

The fleet-health screens follow one decision flow, and the API enforces each step: engineers confirm or dismiss findings; supervisors (and planners) schedule work orders; logistics reserves, orders or receives parts requests; fleet managers run scenarios. Supervisors may act at every step. In local demo mode the role chosen in the top bar is sent as `X-Demo-Role`; signed-in accounts keep their server role.


## Workspace-first public sign-in — 20 October 2026

Public root entry shows the four workspace choices even with a restored server session.
Confirmation ends the old session with CSRF and opens the selected team's credential form.
Login/signup links preserve `workspace`; invalid or missing choices return to the selector.
The login API still validates workspace authorization after checking credentials. Signed-in
record bookmarks and refresh within a workspace continue normally.

Public signup in the deployed synthetic demo supports all four selected workspaces. The
explicit `FLEET_DEMO_WORKSPACE_ACCOUNTS=true` policy is enabled by `compose.aws-demo.yaml`
and is valid only in `tunnel_demo`, whose settings require the isolated demo database. New
accounts have the demo supervisor capability; each login's selected workspace narrows its
session role. Previously created viewer accounts can also enter any of the four workspaces
with their existing password under this policy, without rewriting their stored role. Turning
the policy off invalidates viewer sessions that no longer qualify for their workspace.

Outside that explicit demo policy signup remains viewer-only and staff access requires
administrator assignment. Production settings reject enabling the demo policy. Account role
input remains rejected; passwords, lockout, allowed origins and CSRF checks still apply. This supersedes
the previous account-first anonymous entry.

## Workspace-first sign-in — 18 October 2026 (historical anonymous entry)

The local Compose stack defaults to server-session authentication. Workspace cards
are public navigation to the credential form; anonymous entry never prefetches
protected fleet data. Login accepts an optional `workspace` value and validates it
after password verification, before creating a session. Engineer, logistics and
fleet-manager accounts match their corresponding workspace; planner and administrator
map to the supervisor workspace and viewer maps to fleet manager, retaining their
existing server permissions. A supervisor account can enter any of the four workspaces.
Its selected workspace is stored on the server session and narrows that session to the
chosen team role. Existing sessions without a workspace retain their original role. A workspace mismatch returns 403 without a session.

On a successful workspace login, the browser opens that workspace directly. Switching
workspace from Account ends the existing server session before presenting the new
credentials form. Passwords are not retained in browser storage. Account provisioning
is a separate administrator action, not a side effect of selecting a workspace.


The local `pushkar` account uses the same credentials for all four workspace choices.
`LoginSession.workspace` keeps those sessions independent. Password checks run before
workspace validation; role reductions invalidate incompatible active workspace sessions.
