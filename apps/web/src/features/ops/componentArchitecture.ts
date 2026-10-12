import type { AircraftDetail, TwinComponent } from "./api";
import { AIRFRAMES, airframeOf, type Layout, type StructureKind } from "./airframes";

export type { Layout, StructureKind } from "./airframes";
/** Light-combat-aircraft placements (the default airframe); see `AIRFRAMES` for every type. */
export const componentLayouts = AIRFRAMES.lca.layouts;
export type ArchitectureComponent = TwinComponent & { number: number; system: string; layout: Layout | null; attention: boolean; openAdvisories: AircraftDetail["advisories"] };
export function architectureComponents(data: AircraftDetail): ArchitectureComponent[] {
  const layouts = airframeOf(data.aircraft as { id?: unknown; type?: unknown } | undefined).layouts;
  return data.systems.flatMap(system => system.components.map(component => {
    const openAdvisories = data.advisories.filter(item => item.component_id === component.id && !["completed", "dismissed"].includes(item.status));
    return { ...component, system: system.name, layout: layouts[component.type] ?? null,
      attention: ["watch", "degraded", "critical", "failed"].includes(component.state) || (component.state !== "under_maintenance" && openAdvisories.length > 0), openAdvisories };
  })).map((component, index) => ({ ...component, number: index + 1 }));
}
export const architectureColor = (component: ArchitectureComponent) => component.state === "under_maintenance" ? "#55b6ff" : component.attention ? "#ed525c" : "#76d5b1";
export const structureLabels: Record<StructureKind, string[]> = {
  compressor: ["Spinner and inlet guide vanes", "Three-stage fan", "Seven-stage HP compressor", "Stator rows", "Split casing and flanges", "Spool shaft"],
  turbine: ["Annular combustor and fuel nozzles", "Nozzle guide vanes", "HP turbine stage", "LP turbine stage", "Rear frame struts", "Exhaust cone"],
  pump: ["Housing and mounting flange", "Cylinder barrel and pistons", "Swash plate", "Port block", "Pressure compensator", "Drive spline"],
  generator: ["Stator laminations", "Stator windings", "Salient-pole rotor", "Cooling fan", "End bells", "Terminal block"],
  actuator: ["Barrel and gland nuts", "Piston and rod", "Servo-valve manifold", "Torque motor", "LVDT position sensor", "Rod-end and trunnion eyes"],
  strut: ["Oleo cylinder", "Chromed sliding piston", "Torque links", "Steering collar", "Charging valve", "Axle and trunnion"],
  filter: ["Filter head and ports", "Bowl", "Pleated element", "Differential-pressure indicator"],
  electronics: ["Chassis and cover", "Card cage and circuit cards", "Circular connectors", "Heat-sink fins", "Hold-down hooks"],
  battery: ["Case and lid", "Cell modules", "Bus bars and terminals", "Vent and main connector"],
  brake: ["Carbon rotor and stator discs", "Pressure plate", "Piston housing", "Torque tube", "Wear-pin indicator"],
  tyre: ["Tyre carcass and tread", "Split wheel halves", "Tie bolts", "Bearings and axle", "Inflation valve"],
  sensor: ["Mounting flange", "Heated probe", "Pressure / sense ports", "Electrical connector"],
  cooling: ["Plate-fin core", "Inlet and outlet headers", "Ram-air ducts", "Bypass valve"],
  valve: ["Valve body and flanges", "Butterfly disc and shaft", "Actuator housing", "Position indicator", "Solenoid"],
  reservoir: ["Tank shell and domes", "Sight glass", "Level indicator", "Filler cap", "Pickup tube and ports"],
};
