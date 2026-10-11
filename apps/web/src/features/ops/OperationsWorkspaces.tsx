import { Suspense, lazy } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { HeadingReplay } from "./ReplaySlider";
import { FlowStrip } from "./FlowStrip";
import { Segmented } from "./ui";
import { useAsOf } from "./AsOf";

const WorkBoard = lazy(() => import("./WorkflowPages").then(module => ({ default: module.PlanPage })));
const Requests = lazy(() => import("./WorkflowPages").then(module => ({ default: module.PartsPage })));
const Bays = lazy(() => import("./MaintenancePage").then(module => ({ default: module.MaintenancePage })));
const WorkRegister = lazy(() => import("./MaintenancePage").then(module => ({ default: module.WorkRegister })));
const Inventory = lazy(() => import("./SparesPage").then(module => ({ default: module.SparesPage })));

export function WorkspaceScope({ fleetWide = false }: { fleetWide?: boolean }) {
  const [params, setParams] = useSearchParams();
  const aircraft = params.get("aircraft"), component = params.get("component");
  if (!aircraft && !component) return null;
  return <div className="workspace-scope"><span><Icon name="aircraft" size={15}/>{component ?? aircraft}{fleetWide ? " · This view shows the whole fleet" : " · Selected records"}</span><button type="button" className="o-link" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete("aircraft"); next.delete("component"); return next; })}>Show all records</button></div>;
}

export function MaintenanceWorkspace() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "bays" ? "bays" : params.get("view") === "register" ? "register" : "work";
  return <div className="o-screen operations-workspace">
    <div className="o-screen-head"><h1>Maintenance</h1><span>Confirmed findings → schedule → secure parts → record work</span><HeadingReplay/></div>
    <FlowStrip compact/>
    <Segmented label="Maintenance views" value={view} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("view", value); return next; })} options={[["work", "Work board"], ["bays", "Bays & timeline"], ["register", "Work register"]] as const}/>
    <WorkspaceScope fleetWide={view !== "work"}/>
    <Suspense fallback={<p role="status">Opening maintenance records…</p>}>
      {view === "work" ? <WorkBoard/> : view === "bays" ? <Bays/> : <WorkRegister/>}
    </Suspense>
  </div>;
}

export function SupplyWorkspace() {
  const [params, setParams] = useSearchParams();
  const requests = params.get("view") === "requests";
  return <div className="o-screen operations-workspace">
    <div className="o-screen-head"><h1>Spares & supply</h1><span>Forecast shortages · secure parts for scheduled work</span><HeadingReplay/></div>
    <FlowStrip compact/>
    <Segmented label="Supply views" value={requests ? "requests" : "inventory"} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("view", value); next.delete("part"); return next; })} options={[["inventory", "Inventory & demand"], ["requests", "Parts requests"]] as const}/>
    <WorkspaceScope fleetWide={!requests}/>
    <Suspense fallback={<p role="status">Opening supply records…</p>}>{requests ? <Requests/> : <Inventory/>}</Suspense>
  </div>;
}

export function ResearchWorkspace() {
  const { asOf } = useAsOf();
  return <div className="o-screen research-home">
    <div className="o-screen-head"><h1>Engine research workspace</h1><span>C-MAPSS engine evidence · separate synthetic logistics records</span></div>
    <p className="workspace-description">Review an engine’s recorded history and model uncertainty, calculate a resource-constrained proposal, then review its approval and work records. These tools use their own engine dataset; they do not update the 40-aircraft fleet’s findings or bay schedule.</p>
    {asOf && <p className="o-note">Fleet replay is selected. Engine research uses its own saved input cutoffs.</p>}
    <div className="workspace-research-steps">
      <Link to="/fleet/register"><span>01 · Inspect</span><h2>Choose an engine record</h2><p>Open its history, estimate, quality findings and uncertainty.</p><Icon name="arrow" size={20}/></Link>
      <Link to="/planning"><span>02 · Plan</span><h2>Calculate a feasible proposal</h2><p>Check task windows, qualified resources, parts and current commitments.</p><Icon name="arrow" size={20}/></Link>
      <Link to="/scenarios"><span>03 · Compare & review</span><h2>Inspect projected outcomes</h2><p>Compare saved assumptions. Approve an exact proposal in the planner when authorized.</p><Icon name="arrow" size={20}/></Link>
    </div>
    <div className="workspace-research-links"><Link to="/demo">Try the guided case</Link><Link to="/inventory">Parts & deliveries</Link><Link to="/alerts">Engine alerts</Link><Link to="/ai">How the model helps</Link><Link to="/fleet">Spatial engine inspection</Link></div>
  </div>;
}
