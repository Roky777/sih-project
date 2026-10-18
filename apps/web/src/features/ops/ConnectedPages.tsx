import { CapacitySettings } from "./CapacitySettings";
import { lazy, Suspense, useState } from "react";
import { Icon } from "../../shared/ui/Icon";
import { useThemePreference } from "../../shared/ui/theme";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useSession } from "../access/SessionGate";
import { labTools } from "./workspaceNavigation";
import { roles, useActorRole, useRole } from "./roles";
import { Card, PageHead, Segmented } from "./ui";

const AvailabilityStudy = lazy(() => import("./AvailabilityStudy").then(m => ({ default: m.AvailabilityStudy })));
const Simulator = lazy(() => import("./SimulatorPage").then(m => ({ default: m.SimulatorPage })));
const Analytics = lazy(() => import("./AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const ResearchScenarios = lazy(() => import("../scenarios/ScenariosPage").then(m => ({ default: m.ScenariosPage })));
const ResearchModels = lazy(() => import("../health/AIPage").then(m => ({ default: m.AIPage })));

export function AnalysisWorkspace() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "study" ? "study" : params.get("view") === "reports" ? "reports" : params.get("view") === "models" ? "models" : "compare";
  const research = params.get("dataset") === "research";
  return <div className="o-screen operations-workspace">
    <PageHead title="Analysis" description={research ? "Engine research · saved assumptions and evidence; separate from the operational fleet" : "Compare options, recorded availability, and model evaluation"}/>
    <Segmented label="Analysis views" value={view} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("view", value); return next; })} options={research ? [["compare", "Compare options"], ["models", "Model evaluation"]] as const : [["compare", "Compare options"], ["study", "Availability study"], ["reports", "Availability reports"], ["models", "Model evaluation"]] as const}/>
    <Suspense fallback={<p role="status">Opening analysis…</p>}>
      {research ? view === "models" ? <ResearchModels embedded/> : <ResearchScenarios embedded/> : view === "study" ? <AvailabilityStudy/> : view === "compare" ? <Simulator embedded/> : <Analytics section={view}/>}
    </Suspense>
  </div>;
}

export function HelpPage() {
  const actorRole = useActorRole();
  const technical = ["engineer", "planner", "supervisor", "administrator"].includes(actorRole);
  return <div className="o-screen utility-screen help-screen"><PageHead title="Help" description="Guidance and demonstration tools for AeroCare"/>
    <div className="o-grid o-cols-2"><Card className="help-topic" title="Workflow guidance" subtitle="Understand the next step and who owns it"><Icon name="list" size={23}/><p>Follow a finding from evidence and review through planning, supply, execution and verification.</p><Link className="o-btn" to="/welcome">Open workflow guidance <Icon name="arrow" size={16}/></Link></Card>
      <Card className="help-topic" title="Guided demonstration" subtitle="Try the complete decision journey"><Icon name="play" size={23}/><p>Use a saved or new engine trial with its own synthetic stock, crew and bay assumptions.</p><Link className="o-btn ghost" to="/demo">Open guided trial <Icon name="arrow" size={16}/></Link></Card></div>
    {technical && <Card title="Technical sandbox" subtitle="Engine research retains its own dataset, cutoffs, stock and proposals"><nav className="workspace-research-links">{labTools.map(item => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav></Card>}
  </div>;
}

export function AccountPage() {
  const session = useSession();
  const { role, setRole, canSwitch } = useRole();
  const navigate = useNavigate();
  const [switchingRole, setSwitchingRole] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const changeRole = async (value: string) => {
    const next = roles.find(item => item.id === value);
    if (!next || next.id === role.id || switchingRole) return;
    if (canSwitch) {
      setRole(next.id);
      window.dispatchEvent(new CustomEvent("fleet:choose-workspace", { detail: { role: next.id } }));
      navigate(`/login?workspace=${next.id}`, { replace: true });
      return;
    }
    setSwitchingRole(true); setSwitchError("");
    try {
      await api("/access/session", { method: "DELETE" });
      navigate(`/login?workspace=${next.id}`, { replace: true });
      window.dispatchEvent(new Event("fleet:session-expired"));
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : "Unable to sign out. Try again.");
      setSwitchingRole(false);
    }
  };
  return <div className="o-screen utility-screen account-screen"><PageHead title="Account" description="Your identity and permitted responsibilities"/>
    <Card title="Profile" subtitle="Identity used for the current workspace"><dl className="account-details"><div><dt>Account</dt><dd>{canSwitch ? `demo-${role.id.replace("_", "-")}` : session?.id ?? "Identity unavailable"}</dd></div><div><dt>Role</dt><dd>{role.label}</dd></div><div><dt>Session</dt><dd>{session?.authentication === "server session" ? "Signed in" : "Local demonstration"}</dd></div></dl></Card>
    <Card title="Workspace role" subtitle="Switching workspace requires signing in with an account assigned to that role.">
      <label className="o-field account-role-field">Current role<select value={role.id} disabled={switchingRole} onChange={e => void changeRole(e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      {switchError && <p role="alert">{switchError}</p>}
      {switchingRole && <p role="status">Opening sign-in…</p>}
      <ul className="account-responsibilities">{role.does.map(item => <li key={item}><Icon name="check" size={16}/>{item}</li>)}</ul>
      <Link className="o-btn ghost" to={role.home}>{role.homeLabel}<Icon name="arrow" size={16}/></Link>
    </Card></div>;
}

export function SettingsPage() {
  const [theme, setTheme] = useThemePreference();
  return <div className="o-screen utility-screen settings-screen"><PageHead title="Settings" description="Appearance preferences and operational resource assumptions"/>
    <Card title="Appearance" subtitle="Choose a comfortable display theme. Your preference is retained on this browser.">
      <div className="settings-row"><div><strong>Display theme</strong><p>Applies to pages, charts and inspection panels.</p></div><div className="appearance-options" role="group" aria-label="Display theme">{(["light", "dark"] as const).map(value => <button className="o-btn ghost" type="button" key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon name={value === "light" ? "sun" : "moon"} size={18}/>{value === "light" ? "Light" : "Dark"}{theme === value && <Icon name="check" size={16}/>}</button>)}</div></div>
    </Card>
    <CapacitySettings/>
  </div>;
}
