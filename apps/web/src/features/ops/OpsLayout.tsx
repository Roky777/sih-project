import * as Dialog from "@radix-ui/react-dialog";
import { AskAIButton, AssistantPanel } from "../assistant/AssistantPanel";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, isHealth } from "../../shared/api/client";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { useSession } from "../access/SessionGate";
import { useAcknowledgeAlert, useAdvisories, useAircraftList, useAlerts, useEngine, useRequestEngineRun } from "./api";
import { roleById, roles, stageCounts, useRole, type RoleId } from "./roles";
import { useToast } from "./ui";
import { WorkspaceGrid } from "./WorkspaceGrid";

import { isResearchPath, navigationGroups, type NavItem } from "./workspaceNavigation";
import { WorkspaceConnections } from "./WorkspaceConnections";
import "./workspace-flow.css";
const groups = navigationGroups;
const titles: Record<string, string> = Object.fromEntries(groups.flatMap(group => group.items).map(item => [item.to, item.label]));

function readPreference(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
function writePreference(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } }

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (readPreference("ops:theme") as "light" | "dark" | null)
    ?? "light"); // light glass palette by default; dark remains available
  useEffect(() => { document.documentElement.dataset.theme = theme; writePreference("ops:theme", theme); }, [theme]);
  return [theme, () => setTheme(value => value === "dark" ? "light" : "dark")] as const;
}

export function OpsLayout() {
  const location = useLocation();
  const [theme, toggleTheme] = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const lab = isResearchPath(location.pathname);
  const health = useQuery({ queryKey: ["api-health"], queryFn: () => api("/health/ready", undefined, isHealth), refetchInterval: 30_000, retry: false });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(open => !open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search, location.hash]);
  // Once the page scrolls, a backdrop band fills the gap around the floating header so
  // content passing upward is hidden instead of showing above and beside it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 2);
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const reveal = () => {
      const target = document.getElementById(id);
      if (!target || !target.getBoundingClientRect().height) return false;
      target.scrollIntoView({ block: "start", behavior: "instant" });
      return true;
    };
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    if (!reveal()) observer.observe(document.getElementById("main-content")!, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname, location.search, location.hash]);
  const title = titles[location.pathname] ?? (location.pathname.startsWith("/aircraft/") ? "Aircraft Detail" : location.pathname.startsWith("/health/") ? "Component Health" : location.pathname === "/welcome" ? "Welcome" : "Workspace");

  return <div ref={shell} className={`o-shell${location.pathname.startsWith("/aircraft/") ? " o-twin-atmosphere" : ""}${scrolled ? " is-scrolled" : ""}`}>
    <div className="o-header-backdrop" aria-hidden="true"/>
    {!location.pathname.startsWith("/aircraft/") && <WorkspaceGrid host={shell} paused={mobileOpen || paletteOpen}/>}
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="o-header">
      <button type="button" ref={menuButton} className="o-round-btn o-mobile-only" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" size={18}/></button>
      <Link to="/dashboard" className="o-header-brand" aria-label="Integrated Fleet Availability Platform — home"><OfficialMarks/><span className="o-wordmark"><strong>FleetAvail</strong><small>DSSC · Integrated Fleet Availability</small></span></Link>
      <TopNav/>
      <div className="o-header-tools">
        <AskAIButton/>
        <button type="button" className="o-round-btn" onClick={() => setPaletteOpen(true)} aria-label="Search (⌘K)" title="Search  ⌘K"><Icon name="search" size={17}/></button>
        <button type="button" className="o-round-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} size={17}/></button>
        <AlertsMenu/>
        <ProfileMenu/>
      </div>
    </header>
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="o-mobile-nav" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); menuButton.current?.focus(); }}><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title><div className="o-mobile-nav-head"><strong>FleetAvail</strong><Dialog.Close asChild><button type="button" className="o-round-btn" aria-label="Close navigation"><Icon name="close" size={16}/></button></Dialog.Close></div><Sidebar/></Dialog.Content></Dialog.Portal></Dialog.Root>
    <AssistantPanel/>
    <AskAIButton floating/>
    <div className="o-main">
      {/* Keyed by theme as well: legacy charts and the 3D stage read colour tokens once when drawn. */}
      <main id="main-content" tabIndex={-1} className={lab ? "o-content legacy-surface" : "o-content"} key={`${location.pathname.startsWith("/aircraft/") ? "/aircraft/twin" : location.pathname}:${theme}`} aria-label={title}>
        {lab ? <><div className="workspace-research-context"><Link to="/research">Engine research workspace</Link><span>Engine dataset & saved logistics · independent of fleet replay</span><Link to="/dashboard">Return to fleet operations</Link></div><div className="page"><Outlet/></div></> : ["/", "/welcome", "/home", "/overview", "/review", "/plan", "/parts", "/status"].includes(location.pathname) ? <Outlet/> : <EngineGate><Outlet/></EngineGate>}
        <WorkspaceConnections/>
      </main>
      <footer className="o-footer"><span>PS 26249 · Integrated predictive maintenance & fleet availability demonstrator</span><span>Synthetic data environment · Decision support only · No airworthiness or dispatch authority</span><span className="o-footer-connection">{health.isError ? "API offline" : health.isSuccess ? "API connected" : "Connecting to API"}</span></footer>
    </div>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}/>
  </div>;
}

/** Badge counts shared by the top navigation and the mobile menu. */
function useNavBadges(live: boolean) {
  // Shared navigation badges retain the same meaning on operations and research screens.
  const advisories = useAdvisories(live);
  const alerts = useAlerts(live);
  const counts = stageCounts(advisories.data);
  const urgent = advisories.data?.filter(a => ["P1", "P2"].includes(a.priority.level) && !["completed", "dismissed"].includes(a.status)).length;
  return (key?: NavItem["badge"]) => key === "alerts" ? alerts.data?.filter(a => !a.acknowledged_by).length : key === "urgent" ? urgent : key ? counts[key] : undefined;
}
function isActive(pathname: string, item: NavItem) {
  return pathname === item.to || pathname.startsWith(`${item.to}/`) || Boolean(item.match?.some(prefix => pathname.startsWith(prefix)));
}

/** Glass pill navigation (replaces the sidebar): primary screens as pills, the team workflow and
 *  supporting views in pill menus. */
function TopNav() {
  const badge = useNavBadges(true);
  const { role } = useRole();
  const location = useLocation();
  const pill = (item: NavItem) => {
    const count = badge(item.badge);
    return <NavLink key={item.to} to={item.to} className={isActive(location.pathname, item) ? "active" : ""} title={item.label}>
      {item.short ?? item.label}{count ? <span className="o-pill-count">{count}</span> : null}
    </NavLink>;
  };
  return <nav className="o-topnav" aria-label="Primary">
    {navigationGroups[0].items.map(pill)}
    {navigationGroups.slice(1).map(group => <NavMenu key={group.title} title={group.title} items={group.items} badge={badge} role={role.id}/>)}
  </nav>;
}

function NavMenu({ title, items, badge, role }: { title: string; items: NavItem[]; badge: (key?: NavItem["badge"]) => number | undefined; role: RoleId }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
    const close = (event: MouseEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [location.pathname, location.search, location.hash]);
  const active = items.some(item => isActive(location.pathname, item));
  const total = items.reduce((sum, item) => sum + (item.owner === role ? badge(item.badge) ?? 0 : 0), 0);
  return <details className={`o-navmenu${active ? " active" : ""}`} ref={ref}>
    <summary>{title}{total ? <span className="o-pill-count">{total}</span> : null}<Icon name="chevron" size={12}/></summary>
    <div className="o-glass-pop">{items.map(item => {
      const count = badge(item.badge);
      const mine = item.owner === role;
      return <NavLink key={item.to} to={item.to} className={`${isActive(location.pathname, item) ? "active" : ""}${mine ? " mine" : ""}`}>
        {item.step ? <span className="o-nav-step">{item.step}</span> : <Icon name={item.icon} size={16}/>}
        <span>{item.label}{item.owner && <small>{mine ? "Your step" : roleById[item.owner].short}</small>}</span>
        {count ? <span className="o-pill-count">{count}</span> : null}
      </NavLink>;
    })}</div>
  </details>;
}

/** Official marks slot. Renders authorised artwork placed in public/branding/ (see README there);
 *  it never substitutes a drawn imitation. Missing files fall back to a neutral placeholder. */
function OfficialMarks() {
  const marks = [["mod-crest", "Ministry of Defence"], ["dssc-crest", "Defence Services Staff College"]] as const;
  const [missing, setMissing] = useState<string[]>([]);
  return <span className="o-marks">{marks.map(([file, name]) => missing.includes(file)
    ? <span key={file} className="o-mark-placeholder" title={`${name} mark not installed — add public/branding/${file}.png`} aria-label={`${name} mark not installed`}><Icon name="shield" size={18}/></span>
    : <img key={file} className="o-mark" src={`${import.meta.env.BASE_URL}branding/${file}.png`} alt={name} width={32} height={32} onError={() => setMissing(list => [...list, file])}/>)}</span>;
}

/** Vertical navigation shown in the mobile menu sheet. */
function Sidebar() {
  const badge = useNavBadges(true);
  const { role } = useRole();
  const location = useLocation();
  const link = (item: NavItem) => {
    const count = badge(item.badge);
    const mine = item.owner === role.id;
    return <NavLink key={item.to} to={item.to} className={`${isActive(location.pathname, item) ? "active" : ""}${mine ? " mine" : ""}`}>
      {item.step ? <span className="o-nav-step">{item.step}</span> : <Icon name={item.icon} size={18}/>}
      <span className="o-nav-label">{item.label}{item.owner && <small>{mine ? "Your step" : roleById[item.owner].short}</small>}</span>
      {count ? <span className="o-nav-count">{count}</span> : null}
    </NavLink>;
  };
  return <aside className="o-sidebar">
    <nav aria-label="Primary">
      {navigationGroups.map(group => <div className="o-nav-group" key={group.title}>
        <span className="o-nav-title">{group.title}</span>
        {group.items.map(link)}
      </div>)}
    </nav>
  </aside>;
}

const roleTag: Record<RoleId, string> = { fleet_manager: "COMMANDER", engineer: "ENGINEER", supervisor: "SUPERVISOR", logistics: "LOGISTICS" };

/** Avatar with the active role; also switches role (demo mode) and signs out (sessions). */
function ProfileMenu() {
  const { role, setRole, canSwitch } = useRole();
  const session = useSession();
  const navigate = useNavigate();
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
    const close = (event: MouseEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [location.pathname, location.search, location.hash]);
  return <details className="o-profile" ref={ref}>
    <summary aria-label={`Account: ${role.label}`}><span className="o-avatar"><Icon name={role.icon} size={16}/></span><span className="o-role-tag">{roleTag[role.id]}</span></summary>
    <div className="o-glass-pop">
      <div className="o-profile-who"><strong>{session?.id ?? "Workspace user"}</strong><small>{role.label} · {session?.authentication === "server session" ? "signed in" : "local demo"}</small></div>
      <p className="o-muted o-small">{canSwitch ? "Switch role to see the workspace as each team does." : "Your account role is set by an administrator."}</p>
      {roles.map(r => <button type="button" key={r.id} className={r.id === role.id ? "on" : ""} disabled={!canSwitch && r.id !== role.id} onClick={() => { setRole(r.id); navigate(r.home); }}>
        <Icon name={r.icon} size={16}/><span><strong>{r.label}</strong><small>{r.homeLabel}</small></span>{r.id === role.id && <Icon name="check" size={14}/>}
      </button>)}
      <div className="o-profile-foot"><Link className="o-link" to="/welcome">How the flow works</Link>{session?.authentication === "server session" && <button type="button" className="o-btn sm ghost" onClick={() => void api("/access/session", { method: "DELETE" }).then(() => window.dispatchEvent(new Event("fleet:session-expired")))}>Sign out</button>}</div>
    </div>
  </details>;
}

function AlertsMenu() {
  const alerts = useAlerts();
  const acknowledge = useAcknowledgeAlert();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const pending = alerts.data?.filter(alert => !alert.acknowledged_by) ?? [];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <div className="o-alerts" ref={ref}>
    <button type="button" className="o-round-btn" aria-label={`Alerts (${pending.length} unacknowledged)`} onClick={() => setOpen(value => !value)}><Icon name="bell" size={18}/>{pending.length > 0 && <span className="o-dot">{pending.length}</span>}</button>
    {open && <div className="o-alerts-pop o-glass-pop">
      <header><strong>Alerts</strong><button type="button" className="o-link" onClick={() => { setOpen(false); navigate("/notifications"); }}>View all</button></header>
      {pending.length === 0 ? <p className="o-muted">All alerts acknowledged.</p> : pending.slice(0, 6).map(alert => <article key={alert.key} className={`o-alert-row ${alert.severity}`}>
        <i/><div><strong>{alert.title}</strong><p>{alert.message}</p>
          <div className="o-alert-actions">{alert.component_id && <button type="button" className="o-link" onClick={() => { setOpen(false); navigate(`/health/${alert.component_id}`); }}>Open component</button>}<button type="button" className="o-link" onClick={() => acknowledge.mutate(alert.key, { onSuccess: () => toast({ tone: "success", title: "Alert acknowledged" }), onError: error => toast({ tone: "error", title: "Could not acknowledge", body: error.message }) })}>Acknowledge</button></div>
        </div>
      </article>)}
    </div>}
  </div>;
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const aircraft = useAircraftList(open);
  const advisories = useAdvisories(open);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const items = useMemo(() => {
    const pages = groups.flatMap(group => group.items.map(item => ({ key: item.to, label: item.label, hint: group.title, to: item.to, icon: item.icon })));
    const planes = (aircraft.data ?? []).map(row => ({ key: row.id, label: row.id, hint: `Aircraft · ${row.base} · HI ${row.health_index.toFixed(0)}`, to: `/aircraft/${row.id}`, icon: "aircraft" as IconName }));
    const parts = (advisories.data ?? []).map(row => ({ key: row.id, label: `${row.aircraft} ${row.component_name}`, hint: `${row.priority.level} · ${row.action.label}`, to: `/health/${row.component_id}`, icon: "gauge" as IconName }));
    const query = text.trim().toLowerCase();
    return [...pages, ...planes, ...parts].filter(item => !query || `${item.label} ${item.hint}`.toLowerCase().includes(query)).slice(0, 12);
  }, [aircraft.data, advisories.data, text]);
  useEffect(() => { setCursor(0); }, [text, open]);
  const go = (to: string) => { onOpenChange(false); setText(""); navigate(to); };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="o-palette" aria-describedby={undefined}>
    <Dialog.Title className="sr-only">Search</Dialog.Title>
    <div className="o-palette-input"><Icon name="search" size={18}/><input autoFocus value={text} placeholder="Jump to an aircraft, component or page…" onChange={event => setText(event.target.value)} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setCursor(value => Math.min(items.length - 1, value + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setCursor(value => Math.max(0, value - 1)); }
      if (event.key === "Enter" && items[cursor]) go(items[cursor].to);
    }}/><kbd>esc</kbd></div>
    <ul role="listbox" aria-label="Results">{items.map((item, index) => <li key={item.key} role="option" aria-selected={index === cursor}><button type="button" className={index === cursor ? "on" : ""} onMouseEnter={() => setCursor(index)} onClick={() => go(item.to)}><Icon name={item.icon} size={16}/><span>{item.label}</span><small>{item.hint}</small></button></li>)}{items.length === 0 && <li className="o-muted o-palette-empty">No matches</li>}</ul>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function EngineGate({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const session = useSession();
  const request = useRequestEngineRun();
  const ready = engine.data?.ready;
  const poll = useEngine(!ready);
  if (engine.isLoading) return <div className="o-gate"><span className="o-spinner"/><strong>Connecting to the fleet engine…</strong></div>;
  if (engine.error && !engine.data) return <div className="o-gate"><Icon name="warning" size={28}/><strong>Fleet engine unavailable</strong><p>{engine.error.message}</p><button type="button" className="o-btn" onClick={() => void engine.refetch()}>Retry</button></div>;
  if (ready) return <>{children}</>;
  const pending = poll.data?.pending_run ?? engine.data?.pending_run;
  const failed = !pending && engine.data?.runs.some(run => run.state === "failed");
  return <div className="o-gate">
    <div className="o-gate-art"><Icon name="spark" size={30}/></div>
    <strong>{pending ? "Building the synthetic fleet…" : failed ? "The last engine run failed" : "No engine run yet"}</strong>
    <p>{pending ? "Simulating 40 aircraft over three years, training the anomaly, risk and remaining-life models, and scoring the replay window. This takes about half a minute." : "A supervisor can start an engine run to generate the synthetic fleet and train its models."}</p>
    {pending && <div className="o-gate-steps">{["Simulate latent health", "Engineer past-only features", "Train & calibrate models", "Score, explain & forecast"].map((step, index) => <span key={step} style={{ animationDelay: `${index * 0.35}s` }}>{step}</span>)}</div>}
    {!pending && session?.role === "supervisor" && <button type="button" className="o-btn" disabled={request.isPending} onClick={() => request.mutate(42)}><Icon name="play" size={15}/>Start engine run</button>}
  </div>;
}
