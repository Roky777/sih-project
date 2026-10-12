import { CANOPY, ELEVON_CHORD, ENGINE_AXIS_Y, FIN, FIGHTER_DIMENSIONS, FUSELAGE, GROUND_Y, INTAKE, MAIN_GEAR, NOSE_GEAR, NOZZLE_EXIT_Z, WING_PLANFORM, type Airfoil, type Section } from "./fighterGeometry";
import { TRAINER } from "./trainerGeometry";
import { TRANSPORT } from "./transportGeometry";
import { HEAVY_FIGHTER } from "./heavyFighterGeometry";
import { HELICOPTER } from "./helicopterGeometry";

export type AirframeId = "lca" | "ajt" | "mta" | "mki" | "alh";
export type StructureKind = "compressor" | "turbine" | "pump" | "generator" | "actuator" | "filter" | "electronics" | "battery" | "brake" | "strut" | "tyre" | "sensor" | "cooling" | "valve" | "reservoir";
/** Placement in the airframe model (metres, nose +Z). `size` is the assembly's largest
 *  real-world dimension; `axis` is the airframe axis its own long axis (X) is aligned to. */
export type Layout = { position: [number, number, number]; kind: StructureKind; size: number; axis: "x" | "y" | "z" };
export type Engines =
  | { kind: "jet"; axisY: number; faceZ: number; exitZ: number; radius: number; afterburner: boolean; xs?: number[] }
  | { kind: "turboshaft"; units: { x: number; y: number; front: number; rear: number; radius: number }[] }
  | { kind: "turboprop"; nacelles: { side: number; x: number; y: number; front: number; rear: number; radius: number }[]; prop: { z: number; radius: number; blades: number } };
export type AirframeSpec = {
  id: AirframeId;
  /** Data label used by the synthetic fleet records (no real type names in data). */
  fleetType: string;
  title: string; subtitle: string; drawingNumber: string;
  model: string; poster: string;
  dimensions: { lengthM: number; spanM: number; heightM: number };
  basis: string;
  groundY: number;
  fuselage: Section[]; canopy?: Section[]; intake?: (side: number) => Section[]; sponson?: (side: number) => Section[];
  /** Empty for rotorcraft. */
  wing: Airfoil[]; controlChord: number;
  /** One entry per fin (twin-fin aircraft have two). */
  fins: Airfoil[][]; tailplane?: Airfoil[]; canard?: Airfoil[];
  rotor?: { y: number; z: number; radius: number; blades: number; tail: { x: number; y: number; z: number; radius: number; blades: number } };
  engines: Engines;
  mainGear: { x: number; z: number[]; tyreRadius: number; tyreWidth: number };
  noseGear: { z: number; tyreRadius: number; tyreWidth: number; twin: boolean };
  frames: number[];
  layouts: Record<string, Layout>;
};

const wheelY = (ground: number, r: number) => ground + r;
const LCA_LAYOUTS: Record<string, Layout> = {
  "ENG-CMP": { position: [0, ENGINE_AXIS_Y, -3.25], kind: "compressor", size: 1.35, axis: "z" },
  "ENG-TRB": { position: [0, ENGINE_AXIS_Y, -4.3], kind: "turbine", size: .95, axis: "z" },
  "ENG-OIL": { position: [.42, -.2, -3.3], kind: "reservoir", size: .36, axis: "z" },
  "ENG-FCU": { position: [-.36, -.36, -2.85], kind: "valve", size: .3, axis: "z" },
  "HYD-PMP": { position: [.3, -.47, -2.2], kind: "pump", size: .32, axis: "z" },
  "HYD-ACT": { position: [1.6, -.2, -4.4], kind: "actuator", size: .55, axis: "z" },
  "HYD-FLT": { position: [.46, -.22, -1.55], kind: "filter", size: .3, axis: "y" },
  "ELE-GEN": { position: [-.3, -.47, -2.2], kind: "generator", size: .4, axis: "z" },
  "ELE-BAT": { position: [.26, -.14, 3.95], kind: "battery", size: .3, axis: "z" },
  "ELE-BUS": { position: [-.26, -.14, 3.95], kind: "electronics", size: .32, axis: "z" },
  "LG-BRK": { position: [-MAIN_GEAR.x, wheelY(GROUND_Y, MAIN_GEAR.tyreRadius), MAIN_GEAR.z], kind: "brake", size: MAIN_GEAR.tyreRadius * 1.6, axis: "x" },
  "LG-STR": { position: [0, (GROUND_Y + NOSE_GEAR.tyreRadius + .62 - .42) / 2, NOSE_GEAR.z + .07], kind: "strut", size: .95, axis: "y" },
  "LG-TYR": { position: [MAIN_GEAR.x, wheelY(GROUND_Y, MAIN_GEAR.tyreRadius), MAIN_GEAR.z], kind: "tyre", size: MAIN_GEAR.tyreRadius * 2, axis: "x" },
  "AVN-FCC": { position: [0, .52, 1.15], kind: "electronics", size: .42, axis: "z" },
  "AVN-DSP": { position: [0, .63, 3.42], kind: "electronics", size: .36, axis: "x" },
  "AVN-SNS": { position: [0, .04, 6.25], kind: "sensor", size: .55, axis: "z" },
  "FUE-BST": { position: [0, -.42, -.55], kind: "pump", size: .3, axis: "z" },
  "FUE-QTY": { position: [-2.2, -.2, -2.65], kind: "sensor", size: .26, axis: "y" },
  "ECS-PCK": { position: [.28, .3, .85], kind: "cooling", size: .5, axis: "z" },
  "ECS-PRC": { position: [-.34, .24, 1.6], kind: "valve", size: .28, axis: "z" },
};
const T = TRAINER, TG = T.groundY;
const AJT_LAYOUTS: Record<string, Layout> = {
  "ENG-CMP": { position: [0, T.engine.axisY, -1.55], kind: "compressor", size: 1.1, axis: "z" },
  "ENG-TRB": { position: [0, T.engine.axisY, -2.6], kind: "turbine", size: .72, axis: "z" },
  "ENG-OIL": { position: [.38, -.2, -1.9], kind: "reservoir", size: .3, axis: "z" },
  "ENG-FCU": { position: [-.36, -.3, -1.6], kind: "valve", size: .26, axis: "z" },
  "HYD-PMP": { position: [.28, -.38, -1.05], kind: "pump", size: .28, axis: "z" },
  "HYD-ACT": { position: [3.6, -.29, -1.75], kind: "actuator", size: .45, axis: "z" },
  "HYD-FLT": { position: [.4, -.15, -.45], kind: "filter", size: .26, axis: "y" },
  "ELE-GEN": { position: [-.28, -.38, -1.05], kind: "generator", size: .34, axis: "z" },
  "ELE-BAT": { position: [.2, -.08, 4.55], kind: "battery", size: .26, axis: "z" },
  "ELE-BUS": { position: [-.2, -.08, 4.55], kind: "electronics", size: .28, axis: "z" },
  "LG-BRK": { position: [-T.mainGear.x, wheelY(TG, T.mainGear.tyreRadius), T.mainGear.z], kind: "brake", size: T.mainGear.tyreRadius * 1.6, axis: "x" },
  "LG-STR": { position: [0, (TG + T.noseGear.tyreRadius + .46 - .38) / 2, T.noseGear.z + .05], kind: "strut", size: .8, axis: "y" },
  "LG-TYR": { position: [T.mainGear.x, wheelY(TG, T.mainGear.tyreRadius), T.mainGear.z], kind: "tyre", size: T.mainGear.tyreRadius * 2, axis: "x" },
  "AVN-FCC": { position: [0, .25, 1.0], kind: "electronics", size: .36, axis: "z" },
  "AVN-DSP": { position: [0, .6, 3.33], kind: "electronics", size: .3, axis: "x" },
  "AVN-SNS": { position: [0, .02, 6.02], kind: "sensor", size: .4, axis: "z" },
  "FUE-BST": { position: [0, -.35, .2], kind: "pump", size: .26, axis: "z" },
  "FUE-QTY": { position: [-2.3, -.34, -1.0], kind: "sensor", size: .22, axis: "y" },
  "ECS-PCK": { position: [.25, .3, .3], kind: "cooling", size: .42, axis: "z" },
  "ECS-PRC": { position: [-.3, .3, .85], kind: "valve", size: .25, axis: "z" },
};
const M = TRANSPORT, MG = M.groundY, port = M.nacelles[0];
const MTA_LAYOUTS: Record<string, Layout> = {
  // Port engine nacelle: reduction gearbox forward, compressor and turbine behind it.
  "ENG-CMP": { position: [port.x, port.y + .05, 1.75], kind: "compressor", size: 1.05, axis: "z" },
  "ENG-TRB": { position: [port.x, port.y + .05, .7], kind: "turbine", size: .8, axis: "z" },
  "ENG-OIL": { position: [port.x + .42, port.y + .2, 1.5], kind: "reservoir", size: .36, axis: "z" },
  "ENG-FCU": { position: [port.x - .4, port.y - .25, 1.3], kind: "valve", size: .3, axis: "z" },
  "HYD-PMP": { position: [port.x + .3, port.y - .35, .1], kind: "pump", size: .32, axis: "z" },
  "HYD-ACT": { position: [-10.2, 1.8, -.7], kind: "actuator", size: .6, axis: "z" },
  "HYD-FLT": { position: [1.32, -.9, -2.6], kind: "filter", size: .32, axis: "y" },
  "ELE-GEN": { position: [port.x, port.y + .02, 2.85], kind: "generator", size: .5, axis: "z" },
  "ELE-BAT": { position: [.35, -.7, 10.3], kind: "battery", size: .36, axis: "z" },
  "ELE-BUS": { position: [-.35, -.7, 10.3], kind: "electronics", size: .4, axis: "z" },
  "LG-BRK": { position: [-M.mainGear.x, wheelY(MG, M.mainGear.tyreRadius), 0], kind: "brake", size: M.mainGear.tyreRadius * 1.6, axis: "x" },
  "LG-STR": { position: [0, (-1.3 + MG + M.noseGear.tyreRadius + .5) / 2, M.noseGear.z + .05], kind: "strut", size: 1.0, axis: "y" },
  "LG-TYR": { position: [M.mainGear.x, wheelY(MG, M.mainGear.tyreRadius), 0], kind: "tyre", size: M.mainGear.tyreRadius * 2, axis: "x" },
  "AVN-FCC": { position: [0, -.3, 8.5], kind: "electronics", size: .45, axis: "z" },
  "AVN-DSP": { position: [0, .25, 10.45], kind: "electronics", size: .5, axis: "x" },
  "AVN-SNS": { position: [.7, .1, 11.45], kind: "sensor", size: .55, axis: "z" },
  "FUE-BST": { position: [3.0, 1.6, -.2], kind: "pump", size: .32, axis: "z" },
  "FUE-QTY": { position: [-7.0, 1.75, .05], kind: "sensor", size: .26, axis: "y" },
  "ECS-PCK": { position: [.55, 1.55, -.6], kind: "cooling", size: .65, axis: "z" },
  "ECS-PRC": { position: [-.55, 1.5, .8], kind: "valve", size: .32, axis: "z" },
};

const H = HEAVY_FIGHTER, HG = H.groundY, eL = H.engine.xs[0];
const MKI_LAYOUTS: Record<string, Layout> = {
  // Port engine bay; accessory drive between the engines; stabilator actuator in the boom.
  "ENG-CMP": { position: [eL, H.engine.axisY, -4.65], kind: "compressor", size: 1.3, axis: "z" },
  "ENG-TRB": { position: [eL, H.engine.axisY, -5.85], kind: "turbine", size: .95, axis: "z" },
  "ENG-OIL": { position: [eL - .5, -.35, -4.9], kind: "reservoir", size: .4, axis: "z" },
  "ENG-FCU": { position: [eL + .45, -.85, -4.4], kind: "valve", size: .32, axis: "z" },
  "HYD-PMP": { position: [-.32, -.62, -3.4], kind: "pump", size: .34, axis: "z" },
  "HYD-ACT": { position: [1.88, -.32, -6.9], kind: "actuator", size: .7, axis: "z" },
  "HYD-FLT": { position: [0, -.4, -2.3], kind: "filter", size: .32, axis: "y" },
  "ELE-GEN": { position: [.32, -.62, -3.4], kind: "generator", size: .45, axis: "z" },
  "ELE-BAT": { position: [.3, -.2, 8.35], kind: "battery", size: .32, axis: "z" },
  "ELE-BUS": { position: [-.3, -.2, 8.35], kind: "electronics", size: .34, axis: "z" },
  "LG-BRK": { position: [-H.mainGear.x, wheelY(HG, H.mainGear.tyreRadius), H.mainGear.z], kind: "brake", size: H.mainGear.tyreRadius * 1.6, axis: "x" },
  "LG-STR": { position: [0, (-.55 + HG + H.noseGear.tyreRadius) / 2 + .1, H.noseGear.z + .1], kind: "strut", size: 1.3, axis: "y" },
  "LG-TYR": { position: [H.mainGear.x, wheelY(HG, H.mainGear.tyreRadius), H.mainGear.z], kind: "tyre", size: H.mainGear.tyreRadius * 2, axis: "x" },
  "AVN-FCC": { position: [0, .32, 3.9], kind: "electronics", size: .45, axis: "z" },
  "AVN-DSP": { position: [0, .72, 7.45], kind: "electronics", size: .4, axis: "x" },
  "AVN-SNS": { position: [0, -.05, 10.75], kind: "sensor", size: .6, axis: "z" },
  "FUE-BST": { position: [0, -.2, -.5], kind: "pump", size: .34, axis: "z" },
  "FUE-QTY": { position: [-4.2, -.1, -2.6], kind: "sensor", size: .28, axis: "y" },
  "ECS-PCK": { position: [.45, .3, 2.6], kind: "cooling", size: .55, axis: "z" },
  "ECS-PRC": { position: [-.45, .3, 3.2], kind: "valve", size: .3, axis: "z" },
};
const R = HELICOPTER, RG = R.groundY, eng = R.engines[0];
const ALH_LAYOUTS: Record<string, Layout> = {
  // Port turboshaft on the engine deck; hydraulics and generator on the main gearbox.
  "ENG-CMP": { position: [eng.x, eng.y, -.2], kind: "compressor", size: .8, axis: "z" },
  "ENG-TRB": { position: [eng.x, eng.y, -1.1], kind: "turbine", size: .6, axis: "z" },
  "ENG-OIL": { position: [.42, 1.08, -1.0], kind: "reservoir", size: .3, axis: "z" },
  "ENG-FCU": { position: [-.62, 1.05, -.7], kind: "valve", size: .26, axis: "z" },
  "HYD-PMP": { position: [.3, 1.28, .62], kind: "pump", size: .28, axis: "z" },
  "HYD-ACT": { position: [.28, 1.55, .22], kind: "actuator", size: .42, axis: "y" },
  "HYD-FLT": { position: [-.3, 1.22, .85], kind: "filter", size: .25, axis: "y" },
  "ELE-GEN": { position: [-.3, 1.28, .5], kind: "generator", size: .32, axis: "z" },
  "ELE-BAT": { position: [.26, -.35, 3.4], kind: "battery", size: .28, axis: "z" },
  "ELE-BUS": { position: [-.26, -.35, 3.4], kind: "electronics", size: .3, axis: "z" },
  "LG-BRK": { position: [-R.mainGear.x, wheelY(RG, R.mainGear.tyreRadius), R.mainGear.z], kind: "brake", size: R.mainGear.tyreRadius * 1.6, axis: "x" },
  "LG-STR": { position: [0, (-.7 + RG + R.noseGear.tyreRadius + .3) / 2, R.noseGear.z + .03], kind: "strut", size: .7, axis: "y" },
  "LG-TYR": { position: [R.mainGear.x, wheelY(RG, R.mainGear.tyreRadius), R.mainGear.z], kind: "tyre", size: R.mainGear.tyreRadius * 2, axis: "x" },
  "AVN-FCC": { position: [0, -.45, 2.4], kind: "electronics", size: .38, axis: "z" },
  "AVN-DSP": { position: [0, .22, 3.2], kind: "electronics", size: .42, axis: "x" },
  "AVN-SNS": { position: [.48, .16, 4.1], kind: "sensor", size: .45, axis: "z" },
  "FUE-BST": { position: [0, -.62, -.4], kind: "pump", size: .28, axis: "z" },
  "FUE-QTY": { position: [.45, -.55, .3], kind: "sensor", size: .22, axis: "y" },
  "ECS-PCK": { position: [0, 1.0, 1.5], kind: "cooling", size: .4, axis: "z" },
  "ECS-PRC": { position: [.32, .95, 1.85], kind: "valve", size: .25, axis: "z" },
};

const BASIS = "Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence.";
export const AIRFRAMES: Record<AirframeId, AirframeSpec> = {
  lca: {
    id: "lca", fleetType: "Light combat aircraft (synthetic)", title: "Light combat aircraft", subtitle: "Tejas-class light fighter · 1:1 visual model", drawingNumber: "FA-LCA-001",
    model: "models/tejas-visual.glb", poster: "models/fighter-poster.svg", dimensions: FIGHTER_DIMENSIONS, basis: `Tejas Mk1-class proportions. ${BASIS}`,
    groundY: GROUND_Y, fuselage: FUSELAGE, canopy: CANOPY, intake: INTAKE, wing: WING_PLANFORM, controlChord: ELEVON_CHORD, fins: [FIN],
    engines: { kind: "jet", axisY: ENGINE_AXIS_Y, faceZ: -2.6, exitZ: NOZZLE_EXIT_Z, radius: .44, afterburner: true },
    mainGear: { x: MAIN_GEAR.x, z: [MAIN_GEAR.z], tyreRadius: MAIN_GEAR.tyreRadius, tyreWidth: MAIN_GEAR.tyreWidth }, noseGear: { ...NOSE_GEAR, twin: false },
    frames: [5.2, 4.15, 3.85, 3.2, 2.5, 1.75, 1.0, .25, -.5, -1.25, -2.0, -2.6, -3.3, -4.0, -4.7, -5.4], layouts: LCA_LAYOUTS,
  },
  ajt: {
    id: "ajt", fleetType: "Advanced jet trainer (synthetic)", title: "Advanced jet trainer", subtitle: "Two-seat advanced jet trainer · 1:1 visual model", drawingNumber: "FA-AJT-001",
    model: "models/trainer-visual.glb", poster: "models/fighter-poster.svg", dimensions: T.dimensions, basis: `Hawk-class proportions. ${BASIS}`,
    groundY: TG, fuselage: T.fuselage, canopy: T.canopy, intake: T.intake, wing: T.wing, controlChord: T.controlChord, fins: [T.fin], tailplane: T.tailplane,
    engines: { kind: "jet", ...T.engine, afterburner: false },
    mainGear: { x: T.mainGear.x, z: [T.mainGear.z], tyreRadius: T.mainGear.tyreRadius, tyreWidth: T.mainGear.tyreWidth }, noseGear: { ...T.noseGear, twin: false },
    frames: T.frames, layouts: AJT_LAYOUTS,
  },
  mta: {
    id: "mta", fleetType: "Medium transport aircraft (synthetic)", title: "Medium transport aircraft", subtitle: "Twin-turboprop medium transport · 1:1 visual model", drawingNumber: "FA-MTA-001",
    model: "models/transport-visual.glb", poster: "models/fighter-poster.svg", dimensions: M.dimensions, basis: `C-295-class proportions. ${BASIS}`,
    groundY: MG, fuselage: M.fuselage, sponson: M.sponson, wing: M.wing, controlChord: M.controlChord, fins: [M.fin], tailplane: M.tailplane,
    engines: { kind: "turboprop", nacelles: M.nacelles, prop: M.prop },
    mainGear: M.mainGear, noseGear: { ...M.noseGear, twin: true }, frames: M.frames, layouts: MTA_LAYOUTS,
  },
  mki: {
    id: "mki", fleetType: "Heavy multirole fighter (synthetic)", title: "Heavy multirole fighter", subtitle: "Twin-engine heavy multirole fighter · 1:1 visual model", drawingNumber: "FA-HMF-001",
    model: "models/heavy-fighter-visual.glb", poster: "models/fighter-poster.svg", dimensions: H.dimensions, basis: `Su-30-class proportions. ${BASIS}`,
    groundY: HG, fuselage: H.fuselage, canopy: H.canopy, intake: side => H.nacelle(side).slice(0, 3), sponson: side => H.nacelle(side),
    wing: H.wing, controlChord: H.controlChord, fins: [H.fin(-1), H.fin(1)], tailplane: H.tailplane, canard: H.canard,
    engines: { kind: "jet", axisY: H.engine.axisY, faceZ: H.engine.faceZ, exitZ: H.engine.exitZ, radius: H.engine.radius, afterburner: true, xs: H.engine.xs },
    mainGear: { x: H.mainGear.x, z: [H.mainGear.z], tyreRadius: H.mainGear.tyreRadius, tyreWidth: H.mainGear.tyreWidth }, noseGear: { ...H.noseGear, twin: true },
    frames: H.frames, layouts: MKI_LAYOUTS,
  },
  alh: {
    id: "alh", fleetType: "Utility helicopter (synthetic)", title: "Utility helicopter", subtitle: "Twin-engine utility helicopter · 1:1 visual model", drawingNumber: "FA-UH-001",
    model: "models/helicopter-visual.glb", poster: "models/fighter-poster.svg", dimensions: R.dimensions, basis: `ALH-class proportions (length with rotors turning, main-rotor diameter as span). ${BASIS}`,
    groundY: RG, fuselage: R.fuselage, wing: [], controlChord: 0, fins: [R.fin], tailplane: R.tailplane,
    rotor: { y: R.rotor.y, z: R.rotor.z, radius: R.rotor.radius, blades: R.rotor.blades, tail: R.rotor.tail },
    engines: { kind: "turboshaft", units: R.engines },
    mainGear: { x: R.mainGear.x, z: [R.mainGear.z], tyreRadius: R.mainGear.tyreRadius, tyreWidth: R.mainGear.tyreWidth }, noseGear: { ...R.noseGear, twin: false },
    frames: R.frames, layouts: ALH_LAYOUTS,
  },
};

/** Fleet mix used by the synthetic fleet records (mirrors backend `engine.py` FLEET_TYPES): a
 *  repeating cycle of ten tails — 4 light combat aircraft, 2 trainers, 2 transports, 1 heavy
 *  fighter and 1 helicopter. */
export const FLEET_CYCLE: AirframeId[] = ["lca", "lca", "lca", "ajt", "mta", "mki", "lca", "alh", "ajt", "mta"];
export function airframeForIndex(index: number): AirframeId { return FLEET_CYCLE[((index % FLEET_CYCLE.length) + FLEET_CYCLE.length) % FLEET_CYCLE.length]; }
/** Airframe for an aircraft record: its recorded fleet type, else the deterministic fleet mix. */
export function airframeOf(aircraft: { id?: unknown; type?: unknown } | undefined): AirframeSpec {
  const type = typeof aircraft?.type === "string" ? aircraft.type : "";
  const byType = Object.values(AIRFRAMES).find(item => item.fleetType === type);
  if (byType) return byType;
  const match = typeof aircraft?.id === "string" ? /(\d+)$/.exec(aircraft.id) : null;
  return AIRFRAMES[match ? airframeForIndex(Number(match[1]) - 1) : "lca"];
}
