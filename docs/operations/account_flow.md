# Account flow repair — 20 October 2026

Status: implemented and verified locally; not deployed to the public VM. Check
Git history for the published source revision before updating the server.

## User journey

1. Open the application: sign in is available immediately, without staff selection.
2. New visitors choose Create account and open `/signup`. When registration is
   enabled, they enter their display name, account ID and a confirmed password of
   at least fourteen characters. The form explains that records are shared,
   synthetic demonstration inputs and new accounts have viewer-only access.
3. Successful creation returns to `/login`, retains the normalized account ID and
   clears passwords and any previous staff-workspace request. The success message
   explains the next step. Account creation itself does not create a session.
4. Sign in: the existing API checks credentials and supplies the authoritative
   role. Ordinary sign-in does not ask the visitor to guess their staff role.
   Viewers/fleet managers open the dashboard; engineers open findings; logistics
   opens parts; supervisors/planners/administrators open maintenance.
5. Reloading or opening a new tab retains the server session without another role
   selector. Explicit staff workspace switching still signs out and requires the
   existing server-validated workspace credentials. Viewer profile copy is read
   only and does not offer a misleading staff-role selector.

Disabled registration, unavailable registration options, duplicate account IDs,
mismatched passwords, rate limits and unreachable backend states have actionable
copy. Password visibility is optional. The mobile layout puts the account form
directly below the brand. Password reset remains administrator-assisted; no email
recovery service has been implemented.

## Executed local verification

- `make web-check`: ESLint, TypeScript, production build and all 30 Vitest tests
  passed. Existing large-chunk and ineffective-dynamic-import build warnings remain.
- `corepack pnpm --filter @fleet-maintenance/web test:e2e credential-entry.spec.ts account-onboarding.spec.ts --workers=1`:
  all 15 Chrome tests passed. They cover signup/login, all six staff-role mappings,
  viewer profile/refresh, explicit staff switching, mismatch, duplicate IDs, disabled
  signup, rate limiting across form navigation, option retry, backend unavailable
  and desktop/mobile layout. These tests use API fixtures and do not prove live
  server account persistence or deployed session-cookie behavior.
- Desktop sign-in/signup and mobile signup PNGs were captured and visually inspected
  under `output/auth-flow/`. No horizontal overflow was observed at 390px width.
- The initial browser attempt could not bind localhost in the sandbox; the run was
  repeated with execution permission. Early fixture runs intercepted source module
  URLs containing `/api/`, and exposed ambiguous signup field labels. Fixtures now
  match only API endpoints at the origin root; accessible field names and help
  descriptions are explicit. The final uninterrupted 15-test run passed.

No backend source, schema or generated client contract changed. Backend suites and
the rest of the browser suite were not rerun for this frontend repair.

## Release order

Fix locally → verify → review/publish the source revision → update the existing VM
web image → verify on the actual HTTPS origin. Keep database/model volumes and
accounts intact. This repair needs no migration or model reinstallation.

Once the source revision is available on the VM, use the same four-file Compose
stack and `.env.production` as the running installation to build and recreate only
`web`. Do not run a plain development `docker compose up` or remove volumes.
The hostname and existing account credentials remain the same. Single-host web
recreation may briefly interrupt requests; no zero-downtime claim is made.

On the VM, confirm `GET /api/access/registration` reports enabled before testing
public signup. Test a fresh browser signup, viewer login, read-only access,
supervisor login, logout, refresh and expired-session recovery. A successful
frontend build alone is not release acceptance. Certificate renewal/reload,
off-host backups, monitoring, credit alerts and Zoho entry-link wiring remain
separate deployment tasks from the ongoing hosting setup.
