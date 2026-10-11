import type { IconName } from "../../shared/ui/Icon";
import type { RoleId } from "./roles";

export type NavItem = { to: string; label: string; short?: string; icon: IconName; owner?: RoleId; step?: number; badge?: "review" | "schedule" | "parts" | "alerts" | "urgent"; match?: string[] };
export const labTools: NavItem[] = [
  { to: "/research", label: "Research workspace", icon: "flask" },
  { to: "/fleet/register", label: "Engine fleet register", icon: "layers" },
  { to: "/fleet", label: "Engine evidence", icon: "activity" },
  { to: "/planning", label: "Constraint planner", icon: "wrench" },
  { to: "/inventory", label: "Parts & deliveries", icon: "box" },
  { to: "/scenarios", label: "Engine what-ifs", icon: "trend" },
  { to: "/alerts", label: "Engine alerts", icon: "shield" },
  { to: "/ai", label: "AI & evidence", icon: "spark" },
  { to: "/demo", label: "Guided trial", icon: "play" },
];
export const navigationGroups: { title: string; items: NavItem[] }[] = [
  { title: "Operations", items: [
    { to: "/dashboard", label: "Fleet Dashboard", short: "Overview", icon: "grid" },
    { to: "/aircraft", label: "Aircraft", icon: "aircraft" },
    { to: "/advisories", label: "Findings & evidence", short: "Findings", icon: "activity", badge: "urgent", match: ["/health/"] },
    { to: "/maintenance", label: "Maintenance", icon: "calendar", badge: "schedule" },
    { to: "/spares", label: "Spares & supply", short: "Spares", icon: "box", badge: "parts" },
    { to: "/simulator", label: "Scenario Simulator", short: "Simulator", icon: "sliders" },
  ] },
  { title: "More", items: [
    { to: "/component-health", label: "Last component evidence", icon: "activity" },
    { to: "/notifications", label: "Alerts", icon: "bell", badge: "alerts" },
    { to: "/analytics", label: "Reports & models", icon: "chart" },
    { to: "/data", label: "Data sources", icon: "file" },
    { to: "/welcome", label: "How the workflow works", icon: "list" },
  ] },
  { title: "Research", items: labTools },
];
export const labPaths = ["/research", "/fleet", "/planning", "/scenarios", "/inventory", "/alerts", "/ai", "/demo", "/components/"];
export const isResearchPath = (pathname: string) => labPaths.some(path => pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`));
