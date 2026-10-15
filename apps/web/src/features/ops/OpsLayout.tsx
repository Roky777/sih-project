import { useThemePreference } from "../../shared/ui/theme";
import * as Dialog from "@radix-ui/react-dialog";
import { AskAIButton, AssistantPanel } from "../assistant/AssistantPanel";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, isHealth } from "../../shared/api/client";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { useSession } from "../access/SessionGate";
import { useAcknowledgeAlert, useAdvisories, useAlerts, useEngine, useRequestEngineRun } from "./api";
import { roleById, stageCounts, useActorRole, useRole, type RoleId } from "./roles";
import { useToast } from "./ui";
import { WorkspaceGrid } from "./WorkspaceGrid";

import { isResearchPath, navigationGroups, type NavItem } from "./workspaceNavigation";
import { WorkspaceConnections } from "./WorkspaceConnections";
import "./workspace-flow.css";
import "./connected-workspace.css";
import { useAsOf } from "./AsOf";
const groups = navigationGroups;
const titles: Record<string, string> = Object.fromEntries(groups.flatMap(group => group.items).map(item => [item.to.split("?")[0], item.label]));

export function OpsLayout() {
  const location = useLocation();
  const [theme, setTheme] = useThemePreference();
  const { asOf, setAsOf } = useAsOf();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const lab = isResearchPath(location.pathname) || new URLSearchParams(location.search).get("dataset") === "research" || location.pathname === "/demo";
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
  const title = ({ "/help": "Help", "/account": "Account", "/settings": "Settings", "/notifications": "Notifications", "/data": "Data & integrations", "/telemetry": "Live telemetry demonstration", "/research": "Technical sandbox", "/demo": "Guided trial" } as Record<string, string>)[location.pathname] ?? titles[location.pathname] ?? (location.pathname.startsWith("/aircraft/") ? "Aircraft Detail" : location.pathname.startsWith("/health/") ? "Component Health" : location.pathname.startsWith("/cases/") ? "Maintenance case" : location.pathname.startsWith("/maintenance/work/") ? "Work order" : location.pathname.startsWith("/spares/requests/") ? "Parts request" : location.pathname.startsWith("/components/") ? "Engine evidence" : location.pathname === "/welcome" ? "Welcome" : "Workspace");

  useEffect(() => { document.title = `${title} · AeroCare`; }, [title]);
  const visualAircraft = location.pathname.startsWith("/aircraft/") && new URLSearchParams(location.search).get("dataset") !== "research";
  return <div ref={shell} className={`o-shell${visualAircraft ? " o-twin-atmosphere" : ""}${scrolled ? " is-scrolled" : ""}`}>
    <div className="o-header-backdrop" aria-hidden="true"/>
    {!visualAircraft && <WorkspaceGrid host={shell} paused={mobileOpen || paletteOpen}/>}
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="o-header">
      <button type="button" ref={menuButton} className="o-round-btn o-mobile-only" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" size={18}/></button>
      <Link to="/dashboard" className="o-header-brand" aria-label="FleetAvail — home"><span className="o-wordmark"><strong>FleetAvail</strong><small>Integrated Fleet Availability</small></span></Link>
      <TopNav/>
      <div className="o-header-tools">
        <AskAIButton/>
        <button type="button" className="o-round-btn" onClick={() => setPaletteOpen(true)} aria-label="Search (⌘K)" title="Search  ⌘K"><Icon name="search" size={17}/></button>
        <button type="button" className="o-round-btn o-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"}><Icon name={theme === "dark" ? "sun" : "moon"} size={17}/></button>
        <AlertsMenu/>
        <ProfileMenu/>
      </div>
    </header>
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="o-mobile-nav" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); menuButton.current?.focus(); }}><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title><div className="o-mobile-nav-head"><strong>FleetAvail</strong><Dialog.Close asChild><button type="button" className="o-round-btn" aria-label="Close navigation"><Icon name="close" size={16}/></button></Dialog.Close></div><CompactMenu/></Dialog.Content></Dialog.Portal></Dialog.Root>
    <AssistantPanel/>
    {!lab && asOf && <div className="o-replay-banner" role="status"><strong>History/replay · {asOf} · Read only</strong><button className="o-btn ghost" onClick={() => setAsOf(null)}>Exit replay</button></div>}
    <div className="o-main">
      {/* Preserve unsaved forms when appearance changes; chart palettes observe theme tokens. */}
      <main id="main-content" tabIndex={-1} className={lab ? "o-content legacy-surface" : "o-content"} key={`${location.pathname.startsWith("/aircraft/") ? "/aircraft/twin" : location.pathname}`} aria-label={title}>
        {lab ? <><div className="workspace-research-context"><Link to="/research">Engine research workspace</Link><span>Engine dataset & saved logistics · independent of fleet replay</span><Link to="/dashboard">Return to fleet operations</Link></div><div className="page"><Outlet/></div></> : ["/", "/welcome", "/home", "/overview", "/review", "/plan", "/parts", "/status", "/help", "/account", "/settings"].includes(location.pathname) || location.pathname.startsWith("/cases/") ? <Outlet/> : <EngineGate><Outlet/></EngineGate>}
        {!location.pathname.startsWith("/aircraft/") && <WorkspaceConnections/>}
      </main>
      <footer className="o-footer"><span>AeroCare · Aircraft maintenance & fleet availability · PS 26249</span><span>Synthetic data environment · Decision support only · No airworthiness or dispatch authority</span><span className="o-footer-connection">{health.isError ? "API offline" : health.isSuccess ? "API connected" : "Connecting to API"}</span></footer>
    </div>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}/>
  </div>;
}

/** Badge counts shared by the top navigation and the mobile menu. */
function useNavBadges(live: boolean) {
  // Shared navigation badges retain the same meaning on operations and research screens.
  const advisories = useAdvisories(live);
  const alerts = useAlerts(live);
  const summary = useQuery({ queryKey: ["workspace-summary"], queryFn: () => api<{ awaiting_review: number; work_needing_action: number }>("/workspace/summary"), enabled: live });
  const counts = stageCounts(advisories.data);
  const urgent = advisories.data?.filter(a => ["P1", "P2"].includes(a.priority.level) && !["completed", "dismissed"].includes(a.status)).length;
  return (key?: NavItem["badge"]) => key === "alerts" ? alerts.data?.filter(a => !a.acknowledged_by).length : key === "urgent" ? urgent : key === "review" ? summary.data?.awaiting_review : key === "schedule" ? summary.data?.work_needing_action : key ? counts[key] : undefined;
}
function isActive(pathname: string, item: NavItem) {
  const path = item.to.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`) || Boolean(item.match?.some(prefix => pathname.startsWith(prefix)));
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
  const active = items.some(item => isActive(location.pathname, item) && (!item.to.includes("dataset=research") || new URLSearchParams(location.search).get("dataset") === "research"));
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

/** Vertical navigation shown in the mobile menu sheet. */
function CompactMenu() {
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
  return <div className="o-compact-menu">
    <nav aria-label="Primary">
      {navigationGroups.map(group => <div className="o-nav-group" key={group.title}>
        <span className="o-nav-title">{group.title}</span>
        {group.items.map(link)}
      </div>)}
    </nav>
  </div>;
}

const roleTag: Record<RoleId, string> = { fleet_manager: "COMMANDER", engineer: "ENGINEER", supervisor: "SUPERVISOR", logistics: "LOGISTICS" };

/** Avatar with the active role; also switches role (demo mode) and signs out (sessions). */
function ProfileMenu() {
  const actorRole = useActorRole();
  const { role } = useRole();
  const session = useSession();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
    const close = (event: MouseEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [location.pathname, location.search, location.hash]);
  return <details className="o-profile" ref={ref} onKeyDown={event => { if (event.key === "Escape" && ref.current?.open) { event.preventDefault(); ref.current.open = false; ref.current.querySelector("summary")?.focus(); } }}>
    <summary aria-label={`Account: ${role.label}`}><span className="o-avatar"><Icon name={role.icon} size={16}/></span><span className="o-role-tag">{roleTag[role.id]}</span></summary>
    <div className="o-glass-pop">
      <div className="o-profile-who"><strong>{session?.authentication === "server session" ? session.id : `demo-${role.id.replace("_", "-")}`}</strong><small>{role.label} · {session?.authentication === "server session" ? "signed in" : "local demo"}</small></div>
      <Link to="/account">Account</Link>
      {["engineer", "planner", "supervisor", "administrator"].includes(actorRole ?? "") && <Link to="/data">Data & integrations</Link>}
      <Link to="/settings">Settings</Link>
      <Link to="/help">Help</Link>
      {session?.authentication === "server session" && <button type="button" className="o-link" disabled={signingOut} onClick={() => { setSigningOut(true); void api("/access/session", { method: "DELETE" }).then(() => window.dispatchEvent(new Event("fleet:session-expired"))).catch(error => toast({ tone: "error", title: "Could not sign out", body: error instanceof Error ? error.message : "Please retry." })).finally(() => setSigningOut(false)); }}>{signingOut ? "Signing out…" : "Sign out"}</button>}
    </div>
  </details>;
}

function AlertsMenu() {
  const actorRole = useActorRole();
  const { asOf } = useAsOf();
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
  return <div className="o-alerts" ref={ref} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); ref.current?.querySelector("button")?.focus(); } }}>
    <button type="button" className="o-round-btn" aria-expanded={open} aria-controls={open ? "header-notifications" : undefined} aria-label={`Notifications (${pending.length} unread notifications)`} onClick={() => setOpen(value => !value)}><Icon name="bell" size={18}/>{pending.length > 0 && <span className="o-dot">{pending.length}</span>}</button>
    {open && <div id="header-notifications" className="o-alerts-pop o-glass-pop">
      <header><strong>Alerts</strong><button type="button" className="o-link" onClick={() => { setOpen(false); navigate("/notifications"); }}>View all</button></header>
      {pending.length === 0 ? <p className="o-muted">All alerts acknowledged.</p> : pending.slice(0, 6).map(alert => <article key={alert.key} className={`o-alert-row ${alert.severity}`}>
        <i/><div><strong>{alert.title}</strong><p>{alert.message}</p>
          <div className="o-alert-actions">{alert.component_id && <button type="button" className="o-link" onClick={() => { setOpen(false); navigate(`/health/${alert.component_id}`); }}>Open component</button>}<button type="button" className="o-link" disabled={Boolean(asOf) || actorRole === "viewer" || acknowledge.isPending} onClick={() => acknowledge.mutate(alert.key, { onSuccess: () => toast({ tone: "success", title: "Alert acknowledged" }), onError: error => toast({ tone: "error", title: "Could not acknowledge", body: error.message }) })}>Acknowledge</button></div>
        </div>
      </article>)}
    </div>}
  </div>;
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setSearchTerm(text.trim()), 180); return () => window.clearTimeout(timer); }, [text]);
  const search = useQuery({ queryKey: ["workspace-search", searchTerm], queryFn: () => api<{ id: string; label: string; type: string; dataset: string; to: string }[]>(`/workspace/search?q=${encodeURIComponent(searchTerm)}`), enabled: open && searchTerm.length >= 2 });
  const [cursor, setCursor] = useState(0);
  const results = useRef<HTMLUListElement>(null);
  const items = useMemo(() => {
    const pages = groups.flatMap(group => group.items.map(item => ({ key: item.to, label: item.label, hint: group.title, to: item.to, icon: item.icon })));
    const records = (searchTerm === text.trim() ? search.data ?? [] : []).map(row => ({ key: `${row.dataset}:${row.type}:${row.id}`, label: row.label, hint: `${row.type} · ${row.dataset}`, to: row.to, icon: "file" as IconName }));
    const query = text.trim().toLowerCase();
    return [...pages.filter(item => !query || item.label.toLowerCase().includes(query)), ...records].slice(0, 30);
  }, [search.data, text, searchTerm]);
  useEffect(() => { setCursor(0); }, [text, open]);
  useEffect(() => { results.current?.querySelector(`[data-search-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);
  const go = (to: string) => { onOpenChange(false); setText(""); navigate(to); };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="o-palette" aria-describedby={undefined}>
    <Dialog.Title className="sr-only">Search</Dialog.Title>
    <div className="o-palette-input"><Icon name="search" size={18}/><input aria-label="Search workspace records and pages" autoFocus value={text} placeholder="Search aircraft, components, cases, work or parts…" onChange={event => setText(event.target.value)} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setCursor(value => Math.max(0, Math.min(items.length - 1, value + 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setCursor(value => Math.max(0, value - 1)); }
      if (event.key === "Enter" && items[cursor]) go(items[cursor].to);
    }}/><kbd>esc</kbd></div>
    {search.isFetching && <p className="o-muted" role="status">Searching records…</p>}
    {search.error && <p role="alert">Record search unavailable. <button className="o-link" onClick={() => void search.refetch()}>Retry</button></p>}
    <ul ref={results} role="listbox" aria-label="Results">{items.map((item, index) => <li key={item.key} data-search-index={index} role="option" aria-selected={index === cursor}><button type="button" className={index === cursor ? "on" : ""} onMouseEnter={() => setCursor(index)} onClick={() => go(item.to)}><Icon name={item.icon} size={16}/><span>{item.label}</span><small>{item.hint}</small></button></li>)}{items.length === 0 && <li className="o-muted o-palette-empty">{search.isFetching || searchTerm !== text.trim() ? "Searching…" : text.trim().length < 2 ? "Type at least two characters to search records." : "No matching pages or records."}</li>}</ul>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function EngineGate({ children }: { children: ReactNode }) {
  const actorRole = useActorRole();
  const engine = useEngine();
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
    {!pending && actorRole === "supervisor" && <button type="button" className="o-btn" disabled={request.isPending} onClick={() => request.mutate(42)}><Icon name="play" size={15}/>Start engine run</button>}
  </div>;
}
