import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setDemoRole } from "../../shared/api/client";
import type { IconName } from "../../shared/ui/Icon";
import { useSession } from "../access/SessionGate";
import type { Advisory } from "./api";

export type RoleId = "engineer" | "supervisor" | "logistics" | "fleet_manager";
export type Role = { id: RoleId; label: string; short: string; home: string; homeLabel: string; icon: IconName; question: string; does: string[] };

/** The four users, in the order work flows between them. */
export const roles: Role[] = [
  { id: "engineer", label: "Maintenance engineer", short: "Engineer", home: "/advisories?status=proposed", homeLabel: "Review findings", icon: "activity",
    question: "Is this warning real, and does the component need maintenance?",
    does: ["Check the sensor evidence behind each warning", "Confirm the finding or dismiss it with a reason"] },
  { id: "supervisor", label: "Maintenance supervisor", short: "Supervisor", home: "/maintenance", homeLabel: "Plan maintenance", icon: "calendar",
    question: "What work do we schedule, in which bay, and when?",
    does: ["Schedule confirmed findings and mandatory inspections", "Track work orders through to completion"] },
  { id: "logistics", label: "Logistics team", short: "Logistics", home: "/spares?view=requests", homeLabel: "Secure parts", icon: "box",
    question: "Which parts must we secure, and by when?",
    does: ["Reserve stock or order parts for scheduled work", "Watch parts that will run short in the next 30 days"] },
  { id: "fleet_manager", label: "Fleet manager", short: "Fleet manager", home: "/dashboard", homeLabel: "Fleet dashboard", icon: "aircraft",
    question: "How many aircraft can fly now and over the next month?",
    does: ["See which aircraft are down and why", "Test decisions in the what-if simulator"] },
];
export const roleById = Object.fromEntries(roles.map(role => [role.id, role])) as Record<RoleId, Role>;

/** Backend roles map onto the four product roles; planners act as supervisors, viewers as fleet managers. */
function fromBackend(role: string | undefined): RoleId | null {
  if (role === "engineer" || role === "supervisor" || role === "logistics" || role === "fleet_manager") return role;
  if (role === "planner" || role === "administrator") return "supervisor";
  if (role === "viewer") return "fleet_manager";
  return null;
}

type RoleValue = { role: Role; chosen: boolean; canSwitch: boolean; setRole: (id: RoleId) => void };
const RoleContext = createContext<RoleValue | null>(null);
const key = "ops:role";
function stored(): RoleId | null {
  try { return fromBackend(window.localStorage.getItem(key) ?? undefined); } catch { return null; }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  // Signed-in accounts have a fixed server role; the local demo lets you try every role.
  const fixed = session?.authentication === "server session" ? fromBackend(session.role) : null;
  const [choice, setChoice] = useState<RoleId | null>(stored);
  const id = fixed ?? choice ?? "supervisor";
  useEffect(() => { setDemoRole(id); }, [id]);
  setDemoRole(id);
  const setRole = useCallback((next: RoleId) => {
    setChoice(next);
    try { window.localStorage.setItem(key, next); } catch { /* per-viewer convenience only */ }
  }, []);
  const value = useMemo(() => ({ role: roleById[id], chosen: Boolean(fixed ?? choice), canSwitch: !fixed, setRole }), [id, fixed, choice, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
export function useRole() {
  const value = useContext(RoleContext);
  if (!value) throw new Error("useRole must be used inside RoleProvider");
  return value;
}

/** Which product roles may perform each decision (mirrors the API's checks). */
export const can = {
  review: (role: RoleId) => role === "engineer" || role === "supervisor",
  schedule: (role: RoleId) => role === "supervisor",
  secureParts: (role: RoleId) => role === "logistics" || role === "supervisor",
  simulate: (role: RoleId) => role === "fleet_manager" || role === "supervisor",
};

export type Stage = { id: "review" | "schedule" | "parts" | "ready"; step: number; label: string; owner: RoleId; to: string; hint: string };
export const stages: Stage[] = [
  { id: "review", step: 1, label: "Review", owner: "engineer", to: "/advisories?status=proposed", hint: "Findings waiting for an engineer" },
  { id: "schedule", step: 2, label: "Schedule", owner: "supervisor", to: "/maintenance", hint: "Confirmed, not yet scheduled" },
  { id: "parts", step: 3, label: "Secure parts", owner: "logistics", to: "/spares?view=requests", hint: "Scheduled, part not yet secured" },
  { id: "ready", step: 4, label: "Record work", owner: "supervisor", to: "/maintenance#scheduled-work", hint: "Scheduled with parts secured" },
];

export function stageOf(advisory: Advisory): Stage["id"] | null {
  if (advisory.status === "proposed") return "review";
  if (advisory.status === "accepted") return "schedule";
  if (advisory.status === "scheduled") return advisory.parts_status === "open" || advisory.parts_status === "ordered" ? "parts" : "ready";
  return null;
}
export function stageCounts(advisories: Advisory[] | undefined) {
  const counts: Record<Stage["id"], number> = { review: 0, schedule: 0, parts: 0, ready: 0 };
  for (const advisory of advisories ?? []) { const stage = stageOf(advisory); if (stage) counts[stage] += 1; }
  return counts;
}

export const statusLabel: Record<string, string> = { proposed: "Needs review", accepted: "Confirmed", scheduled: "Scheduled", completed: "Done", dismissed: "Dismissed" };
export const partsLabel: Record<string, string> = { open: "Part needed", reserved: "Part reserved", ordered: "Part on order", received: "Part received", cancelled: "Cancelled" };
