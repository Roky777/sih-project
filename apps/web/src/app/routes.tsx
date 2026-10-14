import { lazy, Suspense, type ReactNode } from "react";
import { AssistantProvider } from "../features/assistant/AssistantProvider";
import { createBrowserRouter, createHashRouter, Link, Navigate, useLocation, useRouteError } from "react-router-dom";
import { SessionGate } from "../features/access/SessionGate";
import { AsOfProvider } from "../features/ops/AsOf";
import { OpsLayout } from "../features/ops/OpsLayout";
import { RoleProvider } from "../features/ops/roles";
import { ToastProvider } from "../features/ops/ui";
const CustomerTrialPage = lazy(() => import("../features/demo/CustomerTrialPage").then(module => ({ default: module.CustomerTrialPage })));
const ComponentPage = lazy(() => import("../features/components/ComponentPage").then((module) => ({ default: module.ComponentPage })));
const RegisteredAircraftDetail = lazy(() => import("../features/ops/AircraftRegistration").then(m => ({ default: m.RegisteredAircraftDetail })));
const workflow = () => import("../features/ops/WorkflowPages");
const FleetDashboard = lazy(() => import("../features/ops/FleetDashboard").then((module) => ({ default: module.FleetDashboard })));
const FocusRedirect = lazy(() => import("../features/ops/Focus").then((module) => ({ default: module.FocusRedirect })));
const HomeRedirect = lazy(() => workflow().then((module) => ({ default: module.HomeRedirect })));
const WelcomePage = lazy(() => workflow().then((module) => ({ default: module.WelcomePage })));
const AircraftListPage = lazy(() => import("../features/ops/AircraftPages").then((module) => ({ default: module.AircraftListPage })));
const AircraftDetailPage = lazy(() => import("../features/ops/AircraftPages").then((module) => ({ default: module.AircraftDetailPage })));
const ComponentHealthPage = lazy(() => import("../features/ops/ComponentHealthPage").then((module) => ({ default: module.ComponentHealthPage })));
const AdvisoriesPage = lazy(() => import("../features/ops/AdvisoriesPage").then((module) => ({ default: module.AdvisoriesPage })));
const MaintenanceWorkspace = lazy(() => import("../features/ops/OperationsWorkspaces").then(module => ({ default: module.MaintenanceWorkspace })));
const SupplyWorkspace = lazy(() => import("../features/ops/OperationsWorkspaces").then(module => ({ default: module.SupplyWorkspace })));
const ResearchWorkspace = lazy(() => import("../features/ops/OperationsWorkspaces").then(module => ({ default: module.ResearchWorkspace })));
const CaseDetailPage = lazy(() => import("../features/ops/CaseWorkspace").then(m => ({ default: m.CaseDetailPage })));
const WorkOrderDetail = lazy(() => import("../features/ops/OperationalRecord").then(m => ({ default: m.WorkOrderDetail })));
const PartsRequestDetail = lazy(() => import("../features/ops/OperationalRecord").then(m => ({ default: m.PartsRequestDetail })));
const connected = () => import("../features/ops/ConnectedPages");
const AnalysisWorkspace = lazy(() => connected().then(m => ({ default: m.AnalysisWorkspace })));
const HelpPage = lazy(() => connected().then(m => ({ default: m.HelpPage })));
const AccountPage = lazy(() => connected().then(m => ({ default: m.AccountPage })));
const SettingsPage = lazy(() => connected().then(m => ({ default: m.SettingsPage })));
const TelemetryPage = lazy(() => import("../features/ops/TelemetryPage").then(m => ({ default: m.TelemetryPage })));
const DataPage = lazy(() => import("../features/ops/DataPage").then((module) => ({ default: module.DataPage })));
const NotificationsPage = lazy(() => import("../features/ops/DataPage").then((module) => ({ default: module.NotificationsPage })));
/** Retired duplicate entry points retain bookmarks and record context. */
function RouteAlias({ to, defaults = {} }: { to: string; defaults?: Record<string, string> }) {
  const location = useLocation();
  const target = new URL(to, "http://workspace.local");
  const params = new URLSearchParams(defaults);
  new URLSearchParams(location.search).forEach((value, key) => params.set(key, value));
  target.searchParams.forEach((value, key) => params.set(key, value));
  const search = params.toString();
  return <Navigate replace to={`${target.pathname}${search ? `?${search}` : ""}${location.hash || target.hash}`}/>;
}
function RouteFailure() {
  const error = useRouteError();
  const missing = typeof error === "object" && error !== null && "status" in error && error.status === 404;
  return <div className="page"><div className="async-state empty-state"><h1>{missing ? "Page not found" : "This view couldn’t open"}</h1><p>{missing ? "The page address is not part of this workspace." : "Please reload the page. Your saved records remain on the server."}</p><Link className="button" to="/dashboard">Return to dashboard</Link></div></div>;
}
const loading = <div className="async-state loading-state" role="status"><span className="spinner"/><strong>Opening workspace…</strong></div>;
const createRouter = import.meta.env.VITE_PAGES === 'true' ? createHashRouter : createBrowserRouter;
const page = (element: ReactNode) => <Suspense fallback={loading}>{element}</Suspense>;
export const router = createRouter([{ path:"/", element:<SessionGate><RoleProvider><AsOfProvider><ToastProvider><AssistantProvider><OpsLayout/></AssistantProvider></ToastProvider></AsOfProvider></RoleProvider></SessionGate>, errorElement:<RouteFailure/>, children:[
  { index:true, element:import.meta.env.VITE_PAGES === 'true' ? <Navigate to="/demo" replace/> : page(<HomeRedirect/>) },
  { path:"home", element:page(<HomeRedirect/>) },
  { path:"welcome", element:page(<WelcomePage/>) },
  { path:"review", element:<RouteAlias to="/advisories" defaults={{ status: "proposed" }}/> },
  { path:"plan", element:<RouteAlias to="/maintenance" defaults={{ view: "work" }}/> },
  { path:"parts", element:<RouteAlias to="/spares" defaults={{ view: "requests" }}/> },
  { path:"status", element:<RouteAlias to="/dashboard#grounded"/> },
  { path:"dashboard", element:page(<FleetDashboard/>) },
  { path:"aircraft-detail", element:page(<FocusRedirect kind="aircraft"/>) },
  { path:"component-health", element:page(<FocusRedirect kind="component"/>) },
  { path:"aircraft", element:page(<AircraftListPage/>) },
  { path:"aircraft/registered/:registrationId", element:page(<RegisteredAircraftDetail/>) },
  { path:"aircraft/:aircraftId", element:page(<AircraftDetailPage/>) },
  { path:"health/:componentId", element:page(<ComponentHealthPage/>) },
  { path:"advisories", element:page(<AdvisoriesPage/>) },
  { path:"cases/:caseId", element:page(<CaseDetailPage/>) },
  { path:"maintenance/work/:workId", element:page(<WorkOrderDetail/>) },
  { path:"spares/requests/:requestId", element:page(<PartsRequestDetail/>) },
  { path:"maintenance", element:page(<MaintenanceWorkspace/>) },
  { path:"spares", element:page(<SupplyWorkspace/>) },
  { path:"simulator", element:<RouteAlias to="/analysis" defaults={{ view: "compare" }}/> },
  { path:"analysis", element:page(<AnalysisWorkspace/>) },
  { path:"help", element:page(<HelpPage/>) },
  { path:"account", element:page(<AccountPage/>) },
  { path:"settings", element:page(<SettingsPage/>) },
  { path:"analytics", element:<RouteAlias to="/analysis" defaults={{ view: "reports" }}/> },
  { path:"data", element:page(<DataPage/>) },
  { path:"telemetry", element:page(<TelemetryPage/>) },
  { path:"notifications", element:page(<NotificationsPage/>) },
  { path:"overview", element:<RouteAlias to="/welcome"/> },
  { path:"research", element:page(<ResearchWorkspace/>) },
  { path:"fleet", element:<RouteAlias to="/aircraft" defaults={{ dataset: "research", view: "visual" }}/> },
  { path:"demo", element:<Suspense fallback={loading}><CustomerTrialPage/></Suspense> },
  { path:"ai", element:<RouteAlias to="/analysis" defaults={{ dataset: "research", view: "models" }}/> },
  { path:"fleet/register", element:<RouteAlias to="/aircraft" defaults={{ dataset: "research" }}/> },
  { path:"components/:componentId", element:<Suspense fallback={loading}><ComponentPage/></Suspense> },
  { path:"alerts", element:<RouteAlias to="/advisories" defaults={{ dataset: "research" }}/> },
  { path:"planning", element:<RouteAlias to="/maintenance" defaults={{ dataset: "research", view: "bays" }}/> },
  { path:"inventory", element:<RouteAlias to="/spares" defaults={{ dataset: "research", view: "inventory" }}/> },
  { path:"scenarios", element:<RouteAlias to="/analysis" defaults={{ dataset: "research", view: "compare" }}/> },
  { path:"*", element:<RouteFailure/> },
] }]);
