import { useThemePreference } from "../../shared/ui/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, setCsrfToken, pagesDeployment, fullAppUrl, isHealth } from "../../shared/api/client";
import { AccessFrame } from "./AccessFrame";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RoleProvider, roles, type RoleId } from "../ops/roles";
import { RoleEntryGate } from "./RoleEntryGate";
import { BrandLogo } from "../../shared/ui/BrandLogo";

type SessionInfo = { id: string; role: string; authentication: string; csrf_token: string | null };
const SessionContext = createContext<SessionInfo | null>(null);
export function useSession() { return useContext(SessionContext); }
export function SessionGate({ children }: { children: ReactNode }) {
  useThemePreference();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const workspace = roles.find(role => role.id === params.get("workspace"));
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    function endSession() { setExpired(true); setCsrfToken(null); queryClient.clear(); }
    window.addEventListener("fleet:session-expired", endSession);
    return () => window.removeEventListener("fleet:session-expired", endSession);
  }, [queryClient]);
  const session = useQuery({ queryKey: ["session"], enabled: !expired, retry: false, queryFn: async () => {
    if (pagesDeployment && import.meta.env.VITE_FULL_APP_ONLY === 'true' && fullAppUrl) {
      await api('/health/ready', undefined, isHealth);
      window.location.replace(`${fullAppUrl.replace(/\/$/, '')}/demo`);
      await new Promise<never>(() => {});
    }
    const value = await api<SessionInfo>("/access/session");
    setCsrfToken(value.csrf_token);
    return value;
  }});
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creatingAccount = location.pathname === "/signup";
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - clockNow) / 1000));
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClockNow(now);
      if (now >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  function showAccessError(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 429) {
      const now = Date.now();
      setClockNow(now); setRetryAt(now + (cause.retryAfterSeconds ?? 30) * 1000);
    }
    setError(cause instanceof Error ? cause.message : fallback);
  }
  const signInRequired = expired || session.error instanceof ApiError && session.error.status === 401;
  const registration = useQuery({
    queryKey: ["registration-options"], enabled: signInRequired, retry: false,
    queryFn: () => api<{ enabled: boolean }>("/access/registration", undefined,
      (value): value is { enabled: boolean } => typeof value === "object" && value !== null &&
        "enabled" in value && typeof value.enabled === "boolean"),
  });
  function changeMode(create: boolean) {
    if (busy) return;
    navigate(`${create ? "/signup" : "/login"}${workspace ? `?workspace=${workspace.id}` : ""}`);
    setError(""); setNotice(""); setShowPassword(false);
    setPassword(""); setConfirmPassword("");
  }
  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || Date.now() < retryAt || !registration.data?.enabled || !workspace) return;
    setError(""); setNotice("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const account = await api<{ id: string; role: string }>("/access/registration", {
        method: "POST", body: JSON.stringify({
          user_id: user.trim().toLowerCase(), display_name: displayName.trim(), password,
        }),
      }, (value): value is { id: string; role: string } => typeof value === "object" &&
        value !== null && "id" in value && typeof value.id === "string" &&
        "role" in value && value.role === "viewer");
      setUser(account.id); setPassword(""); setConfirmPassword("");
      navigate(`/login?workspace=${workspace.id}`, { replace: true });
      setShowPassword(false);
      setNotice(workspace?.id === "fleet_manager"
        ? "Account created with viewer access. Sign in below to open your fleet dashboard."
        : "Account created with viewer access. Ask your administrator to assign access to this team before signing in here, or choose the Fleet manager workspace for read-only access.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422) {
        setError("Check your name, account ID and password requirements.");
      } else { showAccessError(cause, "Account creation failed"); }
    } finally { setBusy(false); }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy || Date.now() < retryAt) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await api<SessionInfo>("/access/session", { method: "POST", body: JSON.stringify({ user_id: user.trim(), password, ...(workspace ? { workspace: workspace.id } : {}) }) });
      setCsrfToken(value.csrf_token);
      if (pagesDeployment) {
        try { await api<SessionInfo>('/access/session'); }
        catch { throw new Error('This browser could not retain the cross-site session. Open the complete demo below to sign in.'); }
      }
      setPassword(""); setExpired(false);
      try { sessionStorage.setItem("fleet:workspace-entry", `${value.id}:${value.role}`); } catch { /* Entry is also tracked in memory. */ }
      queryClient.clear(); queryClient.setQueryData(["session"], value);
      const homeRole = value.role === "viewer" ? "fleet_manager" :
        ["planner", "administrator"].includes(value.role) ? "supervisor" : value.role;
      if (workspace || ["/", "/login", "/signup"].includes(location.pathname)) {
        navigate(roles.find(role => role.id === homeRole)?.home ?? "/dashboard", { replace: true });
      }
    } catch (cause) { showAccessError(cause, "Sign in failed"); }
    finally { setBusy(false); }
  }
  async function chooseWorkspace(target: RoleId) {
    if (session.data?.authentication === "server session" && !expired) {
      await api("/access/session", { method: "DELETE" });
      setExpired(true); setCsrfToken(null); queryClient.clear();
    }
    setPassword(""); setConfirmPassword(""); setError(""); setNotice(""); setShowPassword(false);
    navigate(`/login?workspace=${target}`);
  }
  const publicEntry = session.data?.authentication === "server session" && ["/", "/home"].includes(location.pathname);
  if (session.data && !expired && !publicEntry) return <SessionContext.Provider value={session.data}>{children}</SessionContext.Provider>;
  if (session.isPending && !expired) return <div className="async-state loading-state" role="status"><span className="spinner"/><strong>Opening your workspace…</strong></div>;
  if (publicEntry || signInRequired && !workspace) return <RoleProvider><RoleEntryGate onRequestSignIn={chooseWorkspace}>{null}</RoleEntryGate></RoleProvider>;
  if (!signInRequired) return <main className="login-shell"><section className="login-card" role="alert"><BrandLogo className="aerocare-logo-login"/><h1>Demo backend offline</h1><p>AeroCare connects AI engine-health evidence with parts, crew, a checked schedule and human approval.</p><p>The demo server is currently unreachable. Please retry in a moment. Your saved records remain on the server; calculations are unavailable until it reconnects.</p><button onClick={() => void session.refetch()}>Try again</button>{fullAppUrl && <p><a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open complete demo</a></p>}</section></main>;
  return <AccessFrame title="A clearer path to
fleet readiness." description="Sign in to connect aircraft health evidence with the people, parts and maintenance decisions that keep your team moving." eyebrow="YOUR FLEET WORKSPACE">
    <span className="entry-step">{workspace?.label} · {creatingAccount ? "NEW ACCOUNT" : "SIGN IN"}</span>
    <h2>{creatingAccount ? "Create your AeroCare account" : "Sign in to AeroCare"}</h2>
    <p>{creatingAccount ? "Explore the shared demonstration fleet with a viewer account." : workspace ? `Sign in to the ${workspace.label.toLowerCase()} workspace.` : "Use your account ID and password. We’ll open the workspace assigned to your account."}</p>
    {workspace && <button type="button" className="account-switch-button" disabled={busy} onClick={() => { navigate("/"); setPassword(""); setConfirmPassword(""); setError(""); setNotice(""); }}>Change workspace</button>}
    {pagesDeployment && fullAppUrl && <p><a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open complete demo</a><small>Use this when your browser blocks cross-site sign-in.</small></p>}
    {notice && <p role="status" className="form-success">{notice}</p>}
    {expired && <p role="status" className="signup-access-note">Your session ended. Sign in again to continue.</p>}
    {creatingAccount && <aside className="access-permissions"><strong>Start with viewer access</strong><p>Browse the shared synthetic fleet and its evidence. Creating an account does not grant planning, editing or approval permissions. Your installation administrator assigns staff access.</p></aside>}
    {creatingAccount && registration.isPending && <p role="status">Checking account creation availability…</p>}
    {registration.isError && <p role="alert" className="form-error">We couldn’t check account creation availability. <button type="button" className="account-switch-button" onClick={() => void registration.refetch()}>Retry</button></p>}
    {creatingAccount && registration.data?.enabled === false && <p role="status">Account creation is closed for this installation. Ask its administrator to create an account, or sign in with an existing account.</p>}
    {(!creatingAccount || registration.data?.enabled) && <form className="entry-auth-form" onSubmit={(event) => void (creatingAccount ? register(event) : login(event))}>
      {creatingAccount && <label>Display name<input disabled={busy} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120}/></label>}
      <label>Account ID<input aria-label="Account ID" aria-describedby={creatingAccount ? "signup-id-help" : undefined} disabled={busy} autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(event) => setUser(event.target.value)} required minLength={creatingAccount ? 3 : undefined} maxLength={64} pattern={creatingAccount ? "[a-zA-Z0-9][a-zA-Z0-9._-]*" : undefined}/>
        {creatingAccount && <small id="signup-id-help">3–64 letters, numbers, dots, underscores or hyphens. Starts with a letter or number; saved in lowercase.</small>}
      </label>
      <label>Password<input aria-label="Password" aria-describedby={creatingAccount ? "signup-password-help" : undefined} disabled={busy} type={showPassword ? "text" : "password"} autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={creatingAccount ? 14 : undefined} maxLength={256}/>
        {creatingAccount && <small id="signup-password-help">Use at least 14 characters.</small>}
      </label>
      {creatingAccount && <label>Confirm password<input disabled={busy} type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={14} maxLength={256}/></label>}
      <button type="button" className="account-switch-button password-visibility" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</button>
      {error && <p role="alert" className="form-error">{error}</p>}
      {retrySeconds > 0 && <p role="status">Try again in {retrySeconds} seconds.</p>}
      <button type="submit" className="entry-continue" disabled={busy || retrySeconds > 0}>{busy ? creatingAccount ? "Creating account…" : "Signing in…" : retrySeconds > 0 ? `Wait ${retrySeconds}s` : creatingAccount ? "Create account" : "Sign in"}</button>
    </form>}
    {(creatingAccount || registration.data?.enabled) && <p className="account-switch">{creatingAccount ? "Already have an account? " : "New here? "}<button type="button" className="account-switch-button" disabled={busy || retrySeconds > 0} onClick={() => changeMode(!creatingAccount)}>{creatingAccount ? "Sign in" : "Create account"}</button></p>}
    {!creatingAccount && <details className="access-help"><summary>Forgot your account ID or password?</summary><p>Ask this installation’s administrator to confirm your account ID or reset your password. Email recovery is not available.</p></details>}
    {!creatingAccount && registration.data?.enabled === false && <p className="signup-access-note">Need an account? Ask this installation’s administrator. Public account creation is disabled.</p>}
    {pagesDeployment && fullAppUrl && <a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open the complete demo</a>}
    <small>Evidence supports human review.</small>
  </AccessFrame>;
}
