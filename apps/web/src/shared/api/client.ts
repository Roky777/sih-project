import type { components } from "./generated/schema";

export type FleetItem = components["schemas"]["FleetItemResponse"];
export type Assessment = components["schemas"]["AssessmentSummaryResponse"];
export type ComponentDetail = components["schemas"]["ComponentDetailResponse"];
export type Plan = components["schemas"]["PlanResponse"];
export type PartArrival = components["schemas"]["ArrivalResponse"];
export type InventoryPart = components["schemas"]["InventoryPartResponse"];
export type Scenario = components["schemas"]["ScenarioResponse"];
export type SimulationRun = components["schemas"]["SimulationRunResponse"];
export type Alert = components["schemas"]["AlertResponse"];
export type Job = components["schemas"]["JobResponse"];

export type Validator<T> = (value: unknown) => value is T;

export const pagesDeployment = import.meta.env.VITE_PAGES === "true";
export const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (pagesDeployment ? "" : "/api")).replace(/\/$/, "");
export const fullAppUrl = import.meta.env.VITE_FULL_APP_URL || "";
export function apiUrl(path: string) {
  if (!apiBase) throw new Error("Demo backend offline");
  return `${apiBase}${path}`;
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) { csrfToken = token; }
// Local demo mode only: the role chosen in the workspace. Session mode ignores these headers.
let demoRole = "supervisor";
export function setDemoRole(role: string) { demoRole = role; }
function replayHeaders(): Record<string, string> {
  try {
    const date = window.sessionStorage.getItem("ops:replay-as-of");
    return date ? { "X-Fleet-Replay-Date": date } : {};
  } catch { return {}; }
}
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds: number | null = null) { super(message); }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function nullableString(value: unknown): value is string | null {
  return value === null || string(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= 0;
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (finiteNumber(value) && value >= 0);
}

export const isHealth: Validator<{ status: string; database: string | null }> = (value): value is { status: string; database: string | null } =>
  record(value) && value.status === "ready" && (value.database === null || string(value.database));

export function arrayOf<T>(validator: Validator<T>): Validator<T[]> {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(validator);
}

export const isFleetItem: Validator<FleetItem> = (value): value is FleetItem =>
  record(value) &&
  string(value.id) &&
  string(value.tail_number) &&
  string(value.label) &&
  string(value.provenance) &&
  Array.isArray(value.component_ids) &&
  value.component_ids.every(string) &&
  nonnegativeInteger(value.components) &&
  nonnegativeInteger(value.open_tasks);

export const isAlert: Validator<Alert> = (value): value is Alert =>
  record(value) &&
  string(value.id) &&
  string(value.component_id) &&
  string(value.state) &&
  string(value.reason) &&
  string(value.policy_version) &&
  nullableString(value.assessment_id) &&
  nullableString(value.acknowledged_by) &&
  Array.isArray(value.acknowledgements) &&
  value.acknowledgements.every(
    (acknowledgement) =>
      record(acknowledgement) &&
      string(acknowledgement.actor) &&
      string(acknowledgement.created_at),
  );

export const isInventoryPart: Validator<InventoryPart> = (value): value is InventoryPart =>
  record(value) &&
  string(value.id) &&
  string(value.name) &&
  nonnegativeInteger(value.on_hand) &&
  nonnegativeInteger(value.reserved) &&
  value.reserved <= value.on_hand &&
  nonnegativeInteger(value.lead_time_slots) &&
  nonnegativeInteger(value.version) && value.version >= 1 &&
  string(value.provenance);

export const isPlan: Validator<Plan> = (value): value is Plan =>
  record(value) &&
  string(value.id) &&
  string(value.status) &&
  string(value.solver_status) &&
  string(value.input_version) &&
  Array.isArray(value.assignments) &&
  value.assignments.every(
    (assignment) =>
      record(assignment) &&
      string(assignment.task_id) &&
      nonnegativeInteger(assignment.start) &&
      nonnegativeInteger(assignment.end) && assignment.end > assignment.start,
  ) &&
  Array.isArray(value.diagnostics) &&
  value.diagnostics.every(string) &&
  string(value.created_at) &&
  nullableString(value.approved_at) &&
  nullableString(value.approved_by);

export const isScenario: Validator<Scenario> = (value): value is Scenario =>
  record(value) &&
  string(value.id) &&
  string(value.name) &&
  nonnegativeInteger(value.version) && value.version >= 1 &&
  record(value.assumptions) &&
  string(value.provenance);

export const isSimulationRun: Validator<SimulationRun> = (value): value is SimulationRun =>
  record(value) &&
  string(value.id) &&
  string(value.scenario_id) &&
  string(value.policy) &&
  finiteNumber(value.seed) &&
  finiteNumber(value.availability) &&
  value.availability >= 0 &&
  value.availability <= 1 &&
  record(value.metrics);

export const isJob: Validator<Job> = (value): value is Job =>
  record(value) &&
  string(value.id) &&
  string(value.kind) &&
  string(value.state) && ["queued", "running", "succeeded", "failed", "cancellation_requested", "cancelled"].includes(value.state) &&
  finiteNumber(value.attempt) &&
  Number.isInteger(value.attempt) &&
  value.attempt >= 0 &&
  (value.result === null || record(value.result));

export const isComponentDetail: Validator<ComponentDetail> = (
  value,
): value is ComponentDetail =>
  record(value) &&
  string(value.id) &&
  string(value.aircraft_id) &&
  string(value.serial_number) &&
  string(value.kind) &&
  string(value.status) &&
  nonnegativeInteger(value.current_cycle) &&
  Array.isArray(value.observations) &&
  value.observations.every(
    (observation) =>
      record(observation) &&
      nonnegativeInteger(observation.cycle) &&
      string(observation.sensor) &&
      finiteNumber(observation.value) &&
      string(observation.unit) &&
      string(observation.source_version),
  ) &&
  (value.assessment === null ||
    (record(value.assessment) &&
      string(value.assessment.id) &&
      string(value.assessment.state) &&
      nullableNumber(value.assessment.estimate_cycles) &&
      nullableNumber(value.assessment.lower_cycles) &&
      nullableNumber(value.assessment.upper_cycles) &&
      (value.assessment.lower_cycles === null || value.assessment.upper_cycles === null || value.assessment.lower_cycles <= value.assessment.upper_cycles) &&
      nullableString(value.assessment.model_version) &&
      string(value.assessment.input_version) &&
      Array.isArray(value.assessment.quality_findings) &&
      value.assessment.quality_findings.every((finding) => record(finding) && string(finding.code) && string(finding.severity) && string(finding.message))));

function responseError(body: unknown, fallback: string): string {
  if (!record(body)) return fallback;
  if (string(body.detail)) return body.detail;
  if (string(body.message)) return body.message;
  if (Array.isArray(body.detail)) {
    const issues = body.detail.filter(record).filter(issue => string(issue.msg) && Array.isArray(issue.loc)).slice(0, 5);
    const labels = issues.map(issue => {
      const path = (issue.loc as unknown[]).filter(part => part !== "body" && (typeof part === "string" || typeof part === "number")).map(part => typeof part === "number" ? part + 1 : part).join(".");
      return `${path || "Input"}: ${String(issue.msg).slice(0, 240)}`;
    });
    if (labels.length) return labels.join("; ");
  }
  return fallback;
}

export async function api<T>(
  path: string,
  init?: RequestInit,
  validate?: Validator<T>,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    signal: init?.signal ?? AbortSignal.timeout(12_000),
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Role": demoRole,
      ...replayHeaders(),
      "X-Demo-User": `demo-${demoRole.replace("_", "-")}`,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    let retryAfterSeconds: number | null = null;
    if (response.status === 429) {
      const header = response.headers.get("Retry-After");
      const seconds = header && /^\d+$/.test(header) ? Number(header)
        : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : Number.NaN;
      retryAfterSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 30;
    }
    const fallback = response.status === 429
      ? "Too many attempts. Please wait before trying again."
      : `Request failed (${response.status}). Please try again.`;
    const message = responseError(body, fallback);
    if (response.status === 401 && path !== "/access/session") window.dispatchEvent(new Event("fleet:session-expired"));
    throw new ApiError(message, response.status, retryAfterSeconds);
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json();
  if (validate && !validate(payload)) {
    throw new Error(`API response validation failed for ${path}`);
  }
  return payload as T;
}

/** Authenticated newline-delimited events; use the same session/CSRF headers as JSON calls. */
export async function apiStream(path: string, init: RequestInit, onEvent: (event: unknown) => unknown): Promise<void> {
  const response = await fetch(apiUrl(path), {
    ...init, credentials: "include", headers: {
      "Content-Type": "application/json", "X-Demo-Role": demoRole,
      "X-Demo-User": `demo-${demoRole.replace("_", "-")}`,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401) window.dispatchEvent(new Event("fleet:session-expired"));
    throw new ApiError(responseError(body, `Request failed (${response.status}).`), response.status);
  }
  if (!response.body) throw new Error("The answer stream is unavailable.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() && onEvent(JSON.parse(line)) === false) return;
      }
      if (done) break;
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}


export const isPartArrival: Validator<PartArrival> = (value): value is PartArrival =>
  record(value) && string(value.id) && string(value.part_id) &&
  nonnegativeInteger(value.quantity) && value.quantity > 0 &&
  nonnegativeInteger(value.arrival_slot) && value.arrival_slot < 14 &&
  ["expected", "received", "cancelled", "quarantined", "rejected"].includes(String(value.status)) &&
  nonnegativeInteger(value.version) && value.version >= 1 && string(value.reason) &&
  string(value.created_at) && nullableString(value.received_at) &&
  value.provenance === "synthetic" && value.slot_duration_hours === 8;

export type AssessmentDetail = components["schemas"]["AssessmentDetailResponse"];
export const isAssessmentDetail: Validator<AssessmentDetail> = (value): value is AssessmentDetail =>
  record(value) && string(value.id) && string(value.component_id) && string(value.input_version) &&
  string(value.state) && nullableNumber(value.estimate_cycles) && nullableNumber(value.lower_cycles) && nullableNumber(value.upper_cycles) &&
  record(value.evidence) && record(value.explanation) && string(value.explanation.state) && string(value.explanation.reason) &&
  (value.cutoff_cycle === null || nonnegativeInteger(value.cutoff_cycle));
export type MaintenanceContext = components["schemas"]["ComponentMaintenanceResponse"];
export const isMaintenanceContext: Validator<MaintenanceContext> = (value): value is MaintenanceContext => record(value) && string(value.component_id) && nonnegativeInteger(value.slot_duration_hours) && Array.isArray(value.tasks) && value.tasks.every(task=>record(task)&&string(task.id)&&string(task.title)&&string(task.status)&&typeof task.mandatory==='boolean'&&nonnegativeInteger(task.deadline_slot)&&nonnegativeInteger(task.duration_slots)&&string(task.required_skill)&&nullableString(task.part_id)&&nonnegativeInteger(task.part_required)&&nullableNumber(task.part_available)&&nonnegativeInteger(task.version));

export type PlanCommitment = components["schemas"]["PlanCommitmentResponse"];
export const isPlanCommitment: Validator<PlanCommitment> = (value): value is PlanCommitment =>
  record(value)&&string(value.plan_id)&&Array.isArray(value.reservations)&&value.reservations.every(row=>record(row)&&nonnegativeInteger(row.id)&&string(row.part_id)&&nonnegativeInteger(row.quantity)&&string(row.status))&&Array.isArray(value.work)&&value.work.every(row=>record(row)&&string(row.id)&&string(row.task_id)&&string(row.status)&&nonnegativeInteger(row.version)&&nonnegativeInteger(row.consumed_quantity)&&string(row.notes)&&nullableString(row.started_at)&&nullableString(row.completed_at));
