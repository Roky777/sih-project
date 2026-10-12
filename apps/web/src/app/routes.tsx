import { lazy, Suspense, type ReactNode } from "react";
import { AssistantProvider } from "../features/assistant/AssistantProvider";
import { createBrowserRouter, createHashRouter, Link, Navigate, useLocation, useRouteError } from "react-router-dom";
import { SessionGate } from "../features/access/SessionGate";
import { AsOfProvider } from "../features/ops/AsOf";
import { OpsLayout } from "../features/ops/OpsLayout";
import { RoleProvider } from "../features/ops/roles";
import { ToastProvider } from "../features/ops/ui";
const InspectionPage = lazy(() => import("../features/inspection/InspectionPage").then((module) => ({ default: module.InspectionPage })));
const CustomerTrialPage = lazy(() => import("../features/demo/CustomerTrialPage").then(module => ({ default: module.CustomerTrialPage })));
const AIPage = lazy(() => import("../features/health/AIPage").then((module) => ({ default: module.AIPage })));
const FleetPage = lazy(() => import("../features/fleet/FleetPage").then((module) => ({ default: module.FleetPage })));
const ComponentPage = lazy(() => import("../features/components/ComponentPage").then((module) => ({ default: module.ComponentPage })));
const AlertsPage = lazy(() => import("../features/alerts/AlertsPage").then((module) => ({ default: module.AlertsPage })));
const PlanningPage = lazy(() => import("../features/planning/PlanningPage").then((module) => ({ default: module.PlanningPage })));
const InventoryPage = lazy(() => import("../features/inventory/InventoryPage").then((module) => ({ default: module.InventoryPage })));
const ScenariosPage = lazy(() => import("../features/scenarios/ScenariosPage").then((module) => ({ default: module.ScenariosPage })));
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
const SimulatorPage = lazy(() => import("../features/ops/SimulatorPage").then((module) => ({ default: module.SimulatorPage })));
const AnalyticsPage = lazy(() => import("../features/ops/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
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
  { path:"aircraft/:aircraftId", element:page(<AircraftDetailPage/>) },
  { path:"health/:componentId", element:page(<ComponentHealthPage/>) },
  { path:"advisories", element:page(<AdvisoriesPage/>) },
  { path:"maintenance", element:page(<MaintenanceWorkspace/>) },
  { path:"spares", element:page(<SupplyWorkspace/>) },
  { path:"simulator", element:page(<SimulatorPage/>) },
  { path:"analytics", element:page(<AnalyticsPage/>) },
  { path:"data", element:page(<DataPage/>) },
  { path:"notifications", element:page(<NotificationsPage/>) },
  { path:"overview", element:<RouteAlias to="/welcome"/> },
  { path:"research", element:page(<ResearchWorkspace/>) },
  { path:"fleet", element:<Suspense fallback={loading}><InspectionPage/></Suspense> },
  { path:"demo", element:<Suspense fallback={loading}><CustomerTrialPage/></Suspense> },
  { path:"ai", element:<Suspense fallback={loading}><AIPage/></Suspense> },
  { path:"fleet/register", element:<Suspense fallback={loading}><FleetPage/></Suspense> },
  { path:"components/:componentId", element:<Suspense fallback={loading}><ComponentPage/></Suspense> },
  { path:"alerts", element:<Suspense fallback={loading}><AlertsPage/></Suspense> },
  { path:"planning", element:<Suspense fallback={loading}><PlanningPage/></Suspense> },
  { path:"inventory", element:<Suspense fallback={loading}><InventoryPage/></Suspense> },
  { path:"scenarios", element:<Suspense fallback={loading}><ScenariosPage/></Suspense> },
  { path:"*", element:<RouteFailure/> },
] }]);
