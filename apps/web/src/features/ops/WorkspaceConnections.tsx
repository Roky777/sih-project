import { Link, useLocation, useParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { isResearchPath } from "./workspaceNavigation";

type Connection = { label: string; to: string };
/** Explicit handoffs keep fleet operations and engine research in their own record domains. */
export function WorkspaceConnections() {
  const { pathname, search } = useLocation();
  const { aircraftId, componentId } = useParams();
  const params = new URLSearchParams(search);
  let title = "Continue the maintenance workflow", description = "Review evidence, schedule recorded work, secure its parts, then follow the fleet outcome.";
  let links: Connection[];
  if (isResearchPath(pathname)) {
    title = "Continue with these engine records";
    description = "Research proposals, reservations and simulations use this engine dataset. Fleet operations remain a separate synthetic demonstration.";
    links = componentId ? [{ label: "Review maintenance options", to: `/planning?component=${encodeURIComponent(componentId)}` }, { label: "Engine register", to: "/fleet/register" }]
      : pathname === "/planning" ? [{ label: "Check parts & deliveries", to: "/inventory" }, { label: "Compare engine projections", to: "/scenarios" }]
        : pathname === "/inventory" || pathname === "/scenarios" ? [{ label: "Return to proposal review", to: "/planning" }, { label: "Engine evidence", to: "/fleet/register" }]
          : [{ label: "Engine register", to: "/fleet/register" }, { label: "Constraint planner", to: "/planning" }, { label: "Guided trial", to: "/demo" }];
  } else if (aircraftId) {
    title = `Continue with ${aircraftId}`;
    description = "Inspect a drawn component for its evidence, then review this aircraft’s findings and scheduled work.";
    links = [{ label: "Aircraft findings", to: `/advisories?aircraft=${encodeURIComponent(aircraftId)}` }, { label: "Aircraft work board", to: `/maintenance?aircraft=${encodeURIComponent(aircraftId)}` }, { label: "All aircraft", to: "/aircraft" }];
  } else if (pathname.startsWith("/health/") && componentId) {
    title = "Evidence → finding → work order";
    description = "Review the component’s finding before scheduling. A scenario compares projections; it does not record maintenance work.";
    links = [{ label: "Review this finding", to: `/advisories?component=${encodeURIComponent(componentId)}` }, { label: "Component work", to: `/maintenance?component=${encodeURIComponent(componentId)}` }, { label: "Compare a scenario", to: `/simulator?kind=schedule_maintenance&component=${encodeURIComponent(componentId)}` }];
  } else if (pathname === "/advisories") {
    description = "Open a finding for sensor evidence and the recorded decision. Confirmed findings appear in the maintenance work board.";
    const scope = new URLSearchParams();
    for (const key of ["aircraft", "component"]) if (params.get(key)) scope.set(key, params.get(key)!);
    links = [{ label: "Schedule confirmed findings", to: `/maintenance${scope.size ? `?${scope}` : ""}` }, { label: "Inspect aircraft", to: "/aircraft" }];
  } else if (pathname === "/maintenance") {
    description = "Scheduling creates a work order and its parts request. Logistics secures the part before work starts; the dashboard follows recorded outcomes.";
    const scope = new URLSearchParams({ view: "requests" });
    for (const key of ["aircraft", "component"]) if (params.get(key)) scope.set(key, params.get(key)!);
    links = [{ label: "Secure parts for work", to: `/spares?${scope}` }, { label: "Review new findings", to: "/advisories?status=proposed" }, { label: "Fleet outcome", to: "/dashboard#grounded" }];
  } else if (pathname === "/spares") {
    description = "Inventory forecasts support supply decisions. Reserve or receive a scheduled job’s part in Parts requests, then return to its work board.";
    const scope = new URLSearchParams();
    for (const key of ["aircraft", "component"]) if (params.get(key)) scope.set(key, params.get(key)!);
    links = [{ label: "Return to work board", to: `/maintenance${scope.size ? `?${scope}` : ""}` }, { label: "Test a supply scenario", to: "/simulator?kind=spare_unavailable" }];
  } else if (pathname === "/simulator") {
    title = "Compare here. Record decisions in maintenance.";
    description = "These are synthetic projected outcomes. A saved scenario does not approve, schedule or complete a work order.";
    links = [{ label: "Review maintenance work", to: "/maintenance" }, { label: "Fleet dashboard", to: "/dashboard" }];
  } else if (pathname === "/analytics" || pathname === "/data") {
    title = "From data quality to a reviewed finding";
    description = "Use source and model evidence to qualify the finding, then follow the same maintenance workflow.";
    links = [{ label: "Review findings", to: "/advisories" }, { label: pathname === "/data" ? "Reports & models" : "Inspect data sources", to: pathname === "/data" ? "/analytics" : "/data" }];
  } else if (pathname === "/notifications") {
    title = "An acknowledgement starts the review";
    description = "Acknowledging an alert records attention. Open its component evidence to decide on maintenance; it does not resolve the finding.";
    links = [{ label: "Review findings", to: "/advisories?status=proposed" }, { label: "Work board", to: "/maintenance" }];
  } else {
    links = [{ label: "Review findings", to: "/advisories?status=proposed" }, { label: "Inspect aircraft", to: "/aircraft" }, { label: "Maintenance work", to: "/maintenance" }];
  }
  links = links.filter(link => link.to !== `${pathname}${search}` && link.to !== pathname);
  return <section className="workspace-connections" aria-label="Next steps"><div><h2>{title}</h2><p>{description}</p></div><nav aria-label="Related workflow steps">{links.map((link, index) => <Link key={link.to} className={`o-btn sm${index ? " ghost" : ""}`} to={link.to}>{link.label}<Icon name="arrow" size={14}/></Link>)}</nav></section>;
}
