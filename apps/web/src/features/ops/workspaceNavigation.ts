import type { IconName } from "../../shared/ui/Icon";
import type { RoleId } from "./roles";

export type NavItem = { to: string; label: string; short?: string; icon: IconName; owner?: RoleId; step?: number; badge?: "review" | "schedule" | "parts" | "alerts" | "urgent"; match?: string[] };
/** Normal navigation is deliberately limited to the six connected operational destinations. */
export const navigationGroups: { title: string; items: NavItem[] }[] = [{ title: "Workspace", items: [
  { to: "/dashboard", label: "Overview", icon: "grid" },
  { to: "/aircraft", label: "Aircraft", icon: "aircraft", match: ["/aircraft/"] },
  { to: "/advisories", label: "Findings", icon: "activity", badge: "review", match: ["/health/"] },
  { to: "/maintenance", label: "Maintenance", icon: "calendar", badge: "schedule", match: ["/maintenance/", "/cases/"] },
  { to: "/spares?view=requests", label: "Spares", icon: "box", match: ["/spares"] },
  { to: "/analysis", label: "Analysis", icon: "sliders", match: ["/simulator", "/analytics", "/analysis"] },
] }];
/** Sandbox links are local tools in Help, never a second global navigation. */
export const labTools: NavItem[] = [
  { to: "/research", label: "Technical sandbox", icon: "flask" },
  { to: "/aircraft?dataset=research", label: "Engine record register", icon: "layers" },
  { to: "/aircraft?dataset=research&view=visual", label: "Spatial engine inspection", icon: "aircraft" },
  { to: "/maintenance?dataset=research&view=bays", label: "Constraint planner", icon: "wrench" },
  { to: "/spares?dataset=research&view=inventory", label: "Parts & deliveries", icon: "box" },
  { to: "/analysis?dataset=research", label: "Engine comparisons", icon: "trend" },
  { to: "/advisories?dataset=research", label: "Engine review", icon: "shield" },
];
export const labPaths = ["/research", "/fleet", "/planning", "/scenarios", "/inventory", "/alerts", "/ai", "/components/"];
export const isResearchPath = (pathname: string) => labPaths.some(path => pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`));
