import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Validator } from "../../shared/api/client";
import type { components } from "../../shared/api/generated/schema";
import { useAsOf } from "./AsOf";

type S = components["schemas"];
export type EngineStatus = S["EngineStatusResponse"];
export type Advisory = S["AdvisoryResponse"];
export type FleetSummary = S["FleetSummaryResponse"];
export type AvailabilityTrend = S["AvailabilityTrendResponse"];
export type HeatGrid = S["HeatGridResponse"];
export type AircraftItem = S["AircraftListItem"];
export type AircraftDetail = S["AircraftDetailResponse"];
export type TwinSystem = S["TwinSystem"];
export type TwinComponent = S["TwinComponent"];
export type ComponentHealth = S["ComponentHealthResponse"];
export type WorkOrders = S["WorkOrdersResponse"];
export type PlannedWorkOrder = S["PlannedWorkOrderResponse"];
export type Schedule = S["ScheduleResponse"];
export type InventoryItem = S["InventoryItem"];
export type DemandForecast = S["DemandForecastResponse"];
export type FleetAlert = S["FleetAlertResponse"];
export type ScenarioRun = S["FleetScenarioResponse"];
export type ScenarioRequest = S["FleetScenarioRequest"];
export type DataSources = S["DataSourcesResponse"];
export type IngestBatch = S["IngestBatchResponse"];
export type HealthState = Advisory["health_state"];
export type PartRequest = S["PartRequestResponse"];
export type CannibalizeStrategy = S["CannibalizeStrategyResponse"];
export type MandatoryTask = { id: string; aircraft: string; task: string; kind: string; due_in_days: number; due_date: string; overdue: boolean; component_id: string | null; remaining_flight_hours: number };

// Minimal runtime checks: the generated types describe the contract but do not validate bytes.
type Check = (value: unknown) => boolean;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const num: Check = value => typeof value === "number" && Number.isFinite(value);
const fraction: Check = value => num(value) && (value as number) >= 0 && (value as number) <= 1;
const str: Check = value => typeof value === "string";
const bool: Check = value => typeof value === "boolean";
const optional = (check: Check): Check => value => value === null || value === undefined || check(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const shape = (fields: Record<string, Check>): Check => value => isRecord(value) && Object.entries(fields).every(([key, check]) => check(value[key]));
const oneOf = (...options: string[]): Check => value => typeof value === "string" && options.includes(value);
const healthState = oneOf("healthy", "watch", "degraded", "critical", "failed", "under_maintenance");
const quantiles = shape({ p10: num, p50: num, p90: num });
function validator<T>(check: Check): Validator<T> { return (value: unknown): value is T => check(value); }

const advisoryCheck = shape({
  id: str, component_id: str, aircraft: str, health_state: healthState, health_index: num,
  risk_14d: fraction, risk_30d: fraction, rul_days: quantiles, anomaly_score: fraction,
  priority: shape({ level: oneOf("P1", "P2", "P3", "P4"), score: num, factors: list(shape({ name: str, weight: num, value: num, points: num })) }),
  action: shape({ code: str, label: str }), spare: shape({ part_number: str, status: oneOf("available", "contested", "short", "additive_print"), on_hand: num, available: num }),
  downtime: shape({ act_now_days: num, run_to_failure_days: num }), status: oneOf("proposed", "accepted", "scheduled", "completed", "dismissed"),
  attribution: list(shape({ label: str, contribution: num })), contributing_parameters: list(shape({ name: str, unit: str, deviation_sigma: num })),
  confidence: shape({ level: oneOf("low", "moderate", "high"), notes: list(str) }), explanation: str,
});
export const isAdvisory = validator<Advisory>(advisoryCheck);
const isAdvisories = validator<Advisory[]>(list(advisoryCheck));
const isEngine = validator<EngineStatus>(shape({ ready: bool, runs: list(shape({ id: str, state: str })) }));
const isSummary = validator<FleetSummary>(shape({
  as_of: str, aircraft: num, availability_today: fraction, availability_7d: fraction, availability_30d: fraction,
  readiness_proxy: fraction, backlog: shape({ open_work_orders: num, man_hours: num }), parts_at_risk: list(str),
  forecast_30d: shape({ availability_mean: fraction, availability_p10: fraction, availability_p90: fraction }),
}));
const isTrend = validator<AvailabilityTrend>(shape({
  history: list(shape({ date: str, availability: fraction })), forecast: list(shape({ date: str, p10: fraction, p50: fraction, p90: fraction })),
  downtime_by_month: list(shape({ month: str })),
}));
const isHeatGrid = validator<HeatGrid>(shape({ systems: list(shape({ code: str, name: str })), rows: list(shape({ aircraft: str, state: healthState, cells: list(shape({ system: str, state: healthState, health_index: num })) })) }));
const isAircraftList = validator<AircraftItem[]>(list(shape({ id: str, state: healthState, health_index: num, open_advisories: num })));
const twinComponent = shape({ id: str, name: str, state: healthState, hi: num, risk14: fraction, rul: quantiles });
const isAircraftDetail = validator<AircraftDetail>(shape({ aircraft: shape({ id: str }), as_of: str, replay: bool, availability_state: str, state: healthState, health_index: num, systems: list(shape({ code: str, name: str, health_index: num, state: healthState, components: list(twinComponent) })), advisories: list(advisoryCheck) }));
export async function fetchAircraftDetail(id: string, asOf: string | null) {
  const detail = await api(withAsOf(`${base}/aircraft/${encodeURIComponent(id)}`, asOf), undefined, isAircraftDetail);
  if (detail.aircraft.id !== id) throw new Error("The aircraft response does not match your selection.");
  return detail;
}
const isComponentHealth = validator<ComponentHealth>(shape({
  as_of: str, dates: list(str), sensors: list(shape({ name: str, unit: str, values: list(optional(num)) })), health_index: list(num),
  replay_dates: list(str), risk14: list(fraction), rul: list(quantiles), anomaly: list(fraction), anomaly_alert: list(bool), state: healthState,
}));
const plannedCheck = shape({ id: str, aircraft: str, agency_id: str, planned_start: str, duration_days: num, status: str, version: num });
const isPlanned = validator<PlannedWorkOrder>(plannedCheck);
const isWorkOrders = validator<WorkOrders>(shape({ recorded: list(shape({ id: str, status: str })), planned: list(plannedCheck) }));
const isSchedule = validator<Schedule>(shape({ from: str, to: str, today: str, agencies: list(shape({ id: str, lanes: num })), bars: list(shape({ id: str, agency: str, start: str, end: str })) }));
const isInventory = validator<InventoryItem[]>(list(shape({ part_number: str, on_hand: num, available: num, status: oneOf("ok", "at_risk", "short", "print") })));
const isForecast = validator<DemandForecast>(shape({ part_number: str, expected: num, p10: num, p90: num, shortfall_probability: fraction }));
const alertCheck = shape({ key: str, severity: oneOf("critical", "warning", "info"), title: str, message: str });
const isAlerts = validator<FleetAlert[]>(list(alertCheck));
const scenarioCheck = shape({ id: str, name: str, kind: str, results: shape({ dates: list(str), delta: shape({ availability_pct_points: num, aircraft_days_lost: num }) }) });
const isScenario = validator<ScenarioRun>(scenarioCheck);
const isScenarios = validator<ScenarioRun[]>(list(scenarioCheck));
const isSources = validator<DataSources>(shape({ integration: shape({ sources: list(shape({ id: str, name: str, quality_score: num })) }), batches: list(shape({ id: str })) }));
const isBatch = validator<IngestBatch>(shape({ id: str, accepted: num, rejected: num, errors: list(shape({ row: num, field: str, message: str })) }));
const isPartRequests = validator<PartRequest[]>(list(shape({ id: str, part: str, status: oneOf("open", "reserved", "ordered", "received", "cancelled"), needed_by: str, version: num, at_risk: bool })));
const isPartRequest = validator<PartRequest>(shape({ id: str, status: str, version: num }));
const isTasks = validator<{ tasks: MandatoryTask[] }>(shape({ tasks: list(shape({ id: str, aircraft: str, task: str, due_in_days: num, overdue: bool })) }));
const isAnyRecord = validator<Record<string, unknown>>(isRecord);

const base = "/fleet-health";
function withAsOf(path: string, asOf: string | null) {
  if (!asOf) return path;
  return `${path}${path.includes("?") ? "&" : "?"}as_of=${asOf}`;
}

export function useEngine(poll = false) {
  return useQuery({ queryKey: ["ops", "engine"], queryFn: () => api(`${base}/engine`, undefined, isEngine), refetchInterval: poll ? 4000 : 60_000 });
}
function useReplayQuery<T>(key: string, path: string, validate: Validator<T>, enabled = true) {
  const { asOf } = useAsOf();
  return useQuery({ queryKey: ["ops", key, path, asOf], queryFn: () => api(withAsOf(`${base}${path}`, asOf), undefined, validate), placeholderData: keepPreviousData, enabled });
}
export const useSummary = () => useReplayQuery("summary", "/summary", isSummary);
export const useTrend = () => useReplayQuery("trend", "/availability/trend", isTrend);
export const useHeatGrid = () => useReplayQuery("heatgrid", "/heatgrid", isHeatGrid);
export const useAircraftList = (enabled = true) => useReplayQuery("aircraft", "/aircraft", isAircraftList, enabled);
export function useAircraftDetail(id: string) {
  const { asOf } = useAsOf();
  return useQuery({ queryKey: ["ops", "aircraft-detail", `/aircraft/${encodeURIComponent(id)}`, asOf], queryFn: () => fetchAircraftDetail(id, asOf), placeholderData: keepPreviousData, enabled: Boolean(id) });
}
export const useComponentHealth = (id: string, days = 180) => useReplayQuery("component", `/components/${encodeURIComponent(id)}?days=${days}`, isComponentHealth, Boolean(id));
export const useAdvisories = (enabled = true) => useReplayQuery("advisories", "/advisories", isAdvisories, enabled);
export const useInventory = () => useReplayQuery("inventory", "/inventory", isInventory);
const isStrategy = validator<CannibalizeStrategy>(shape({ as_of: str, swaps: list(shape({ donor: str, recipient: str, part_number: str, labor_hours: num, text: str })), sequence: list(shape({ step: num, action: oneOf("remove", "transfer", "install"), aircraft: str })), total_labor_hours: num, verification: shape({ greedy_unblocked: num, plan_source: oneOf("greedy", "exact") }) }));
/** Read-only plan; fetched on demand when the supervisor asks for it. */
export const useCannibalizeStrategy = (enabled: boolean) => useReplayQuery("cannibalize", "/engine/cannibalize-strategy", isStrategy, enabled);
export function useWorkOrders(enabled = true) { return useQuery({ enabled, queryKey: ["ops", "work-orders"], queryFn: () => api(`${base}/work-orders`, undefined, isWorkOrders) }); }
export function useSchedule() { return useQuery({ queryKey: ["ops", "schedule"], queryFn: () => api(`${base}/maintenance/schedule`, undefined, isSchedule) }); }
export function useDemand(part: string | null, horizon: number) { return useQuery({ queryKey: ["ops", "demand", part, horizon], queryFn: () => api(`${base}/inventory/${encodeURIComponent(part!)}/forecast?horizon=${horizon}`, undefined, isForecast), enabled: Boolean(part) }); }
export function useAlerts(enabled = true) { return useQuery({ queryKey: ["ops", "alerts"], queryFn: () => api(`${base}/alerts`, undefined, isAlerts), refetchInterval: 60_000, enabled }); }
export function useScenarios() { return useQuery({ queryKey: ["ops", "scenarios"], queryFn: () => api(`${base}/scenarios`, undefined, isScenarios) }); }
export function useKpis() { return useQuery({ queryKey: ["ops", "kpis"], queryFn: () => api(`${base}/kpis`, undefined, isAnyRecord) }); }
export function useModels() { return useQuery({ queryKey: ["ops", "models"], queryFn: () => api(`${base}/models`, undefined, isAnyRecord) }); }
export function usePartRequests(includeClosed = false) { return useQuery({ queryKey: ["ops", "part-requests", includeClosed], queryFn: () => api(`${base}/part-requests${includeClosed ? "?include_closed=true" : ""}`, undefined, isPartRequests) }); }
export function useTasks() { return useQuery({ queryKey: ["ops", "tasks"], queryFn: () => api(`${base}/maintenance/tasks`, undefined, isTasks) }); }
export function useSources() { return useQuery({ queryKey: ["ops", "sources"], queryFn: () => api(`${base}/data/sources`, undefined, isSources) }); }

function useInvalidateOps() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ predicate: query => query.queryKey[0] === "ops" && query.queryKey[1] !== "engine" });
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });

export function useUpdateAdvisory() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: Advisory["status"]; reason?: string; expected_status?: Advisory["status"] }) =>
      api(`${base}/advisories/${encodeURIComponent(id)}`, json("PATCH", body), isAdvisory),
    onSuccess: () => void invalidate(),
  });
}
export function useCreateWorkOrder() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: (body: { component_id: string; advisory_id?: string | null; agency_id?: string | null; planned_start: string; notes?: string }) =>
      api(`${base}/work-orders`, json("POST", body), isPlanned),
    onSuccess: () => void invalidate(),
  });
}
export function useUpdateWorkOrder() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: "in_progress" | "completed" | "cancelled"; expected_version: number }) =>
      api(`${base}/work-orders/${encodeURIComponent(id)}`, json("PATCH", body), isPlanned),
    onSuccess: () => void invalidate(),
  });
}
export function useRunScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ScenarioRequest) => api(`${base}/scenarios/run`, json("POST", body), isScenario),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["ops", "scenarios"] }),
  });
}
export function useAcknowledgeAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api(`${base}/alerts/${encodeURIComponent(key)}/acknowledge`, { method: "POST" }, isAlerts),
    onSuccess: data => { client.setQueryData(["ops", "alerts"], data); void client.invalidateQueries({ queryKey: ["ops", "summary"] }); },
  });
}
export function useIngest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { source: string; readings: unknown[] }) => api(`${base}/ingest/sensor-readings`, json("POST", body), isBatch),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["ops", "sources"] }),
  });
}
export function useRequestEngineRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (seed: number) => api(`${base}/engine/runs`, json("POST", { seed }), isEngine),
    onSuccess: data => client.setQueryData(["ops", "engine"], data),
  });
}
export function useUpdatePartRequest() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: "reserved" | "ordered" | "received" | "cancelled"; eta?: string | null; note?: string; expected_version: number }) =>
      api(`${base}/part-requests/${encodeURIComponent(id)}`, json("PATCH", body), isPartRequest),
    onSuccess: () => void invalidate(),
  });
}
export function useReturnToService() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: ({ id, note, action = "verify" }: { id: string; note?: string; action?: "execute" | "verify" }) =>
      api(`${base}/work-orders/recorded/${encodeURIComponent(id)}/return-to-service`, json("POST", { note: note ?? "", action }), isWorkOrders),
    onSuccess: () => void invalidate(),
  });
}
export function useRescheduleWorkOrder() {
  const invalidate = useInvalidateOps();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; planned_start: string; agency_id: string; expected_version: number }) =>
      api(`${base}/work-orders/${encodeURIComponent(id)}/schedule`, json("PATCH", body), isPlanned),
    onSuccess: () => void invalidate(),
  });
}
