import { useThemePreference } from "../../shared/ui/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, setCsrfToken, pagesDeployment, fullAppUrl, isHealth } from "../../shared/api/client";
import { AccessFrame } from "./AccessFrame";
import { BrandLogo } from "../../shared/ui/BrandLogo";

type SessionInfo = { id: string; role: string; authentication: string; csrf_token: string | null };
const SessionContext = createContext<SessionInfo | null>(null);
export function useSession() { return useContext(SessionContext); }
export function SessionGate({ children }: { children: ReactNode }) {
  useThemePreference();
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
  const [creatingAccount, setCreatingAccount] = useState(false);
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
    setCreatingAccount(create); setError(""); setNotice("");
    setPassword(""); setConfirmPassword("");
  }
  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || Date.now() < retryAt) return;
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
      setCreatingAccount(false);
      setNotice("Account created. Sign in with your account ID and password.");
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
      const value = await api<SessionInfo>("/access/session", { method: "POST", body: JSON.stringify({ user_id: user, password }) });
      setCsrfToken(value.csrf_token);
      if (pagesDeployment) {
        try { await api<SessionInfo>('/access/session'); }
        catch { throw new Error('This browser could not retain the cross-site session. Open the complete demo below to sign in.'); }
      }
      setPassword(""); setExpired(false);
      try { sessionStorage.removeItem("fleet:workspace-entry"); } catch { /* Entry is also tracked in memory. */ }
      queryClient.clear(); queryClient.setQueryData(["session"], value);
    } catch (cause) { showAccessError(cause, "Sign in failed"); }
    finally { setBusy(false); }
  }
  if (session.data && !expired) return <SessionContext.Provider value={session.data}>{children}</SessionContext.Provider>;
  if (session.isPending && !expired) return <div className="async-state loading-state" role="status"><span className="spinner"/><strong>Opening your workspace…</strong></div>;
  if (!signInRequired) return <main className="login-shell"><section className="login-card" role="alert"><BrandLogo className="aerocare-logo-login"/><h1>Demo backend offline</h1><p>AeroCare connects AI engine-health evidence with parts, crew, a checked schedule and human approval.</p><p>The demo server is currently unreachable. Its host needs to keep Docker and the HTTPS tunnel running. No calculations are available while disconnected.</p><button onClick={() => void session.refetch()}>Try again</button>{fullAppUrl && <p><a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open complete demo</a></p>}</section></main>;
  return <AccessFrame title="A clearer path to
fleet readiness." description="Sign in to connect aircraft health evidence with the people, parts and maintenance decisions that keep your team moving." eyebrow="YOUR FLEET WORKSPACE">
    <span className="entry-step">01 / ACCOUNT</span>
    <h2>{creatingAccount ? "Create your FleetAvail account" : "Sign in to FleetAvail"}</h2>
    <p>{creatingAccount ? "Create an account to explore the maintenance workspace." : "Use your maintenance workspace account."}</p>
    {pagesDeployment && fullAppUrl && <p><a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open complete demo</a><small>Use this when your browser blocks cross-site sign-in.</small></p>}
    {notice && <p role="status" className="form-success">{notice}</p>}
    <form className="entry-auth-form" onSubmit={(event) => void (creatingAccount ? register(event) : login(event))}>
      {creatingAccount && <label>Display name<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120}/></label>}
      <label>Account ID<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(event) => setUser(event.target.value)} required minLength={creatingAccount ? 3 : undefined} maxLength={64} pattern={creatingAccount ? "[a-zA-Z0-9][a-zA-Z0-9._-]*" : undefined}/>
        {creatingAccount && <small>3–64 letters, numbers, dots, underscores or hyphens. Starts with a letter or number; saved in lowercase.</small>}
      </label>
      <label>Password<input type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={creatingAccount ? 14 : undefined} maxLength={256}/>
        {creatingAccount && <small>Use at least 14 characters.</small>}
      </label>
      {creatingAccount && <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={14} maxLength={256}/></label>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {retrySeconds > 0 && <p role="status">Try again in {retrySeconds} seconds.</p>}
      <button type="submit" className="entry-continue" disabled={busy || retrySeconds > 0}>{busy ? creatingAccount ? "Creating account…" : "Signing in…" : retrySeconds > 0 ? `Wait ${retrySeconds}s` : creatingAccount ? "Create account" : "Sign in"}</button>
    </form>
    {registration.data?.enabled && <p className="account-switch">{creatingAccount ? "Already have an account? " : "New here? "}<button type="button" className="account-switch-button" disabled={busy || retrySeconds > 0} onClick={() => changeMode(!creatingAccount)}>{creatingAccount ? "Sign in" : "Create account"}</button></p>}
    {creatingAccount && <p className="signup-access-note">New accounts can view the shared demonstration workspace. Contact the administrator for planning or approval access.</p>}
    {pagesDeployment && fullAppUrl && <a className="button-secondary" href={`${fullAppUrl.replace(/\/$/, '')}/demo`}>Open the complete demo</a>}
    <small>Evidence supports human review.</small>
  </AccessFrame>;
}
