/** Lightweight aircraft identity; geometry is loaded only by inspection views. */
export type AirframeId = "lca" | "ajt" | "mta" | "mki" | "alh";
export const AIRFRAME_INFO = {
  "lca": {
    "id": "lca",
    "fleetType": "Light combat aircraft (synthetic)",
    "title": "Light combat aircraft",
    "subtitle": "Tejas-class light fighter \u00b7 Illustrative 3D model",
    "drawingNumber": "FA-LCA-001",
    "model": "models/tejas-visual.glb",
    "poster": "models/fighter-poster.svg",
    "basis": "Tejas Mk1-class proportions. Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence."
  },
  "ajt": {
    "id": "ajt",
    "fleetType": "Advanced jet trainer (synthetic)",
    "title": "Advanced jet trainer",
    "subtitle": "Two-seat advanced jet trainer \u00b7 Illustrative 3D model",
    "drawingNumber": "FA-AJT-001",
    "model": "models/trainer-visual.glb",
    "poster": "models/fighter-poster.svg",
    "basis": "Hawk-class proportions. Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence."
  },
  "mta": {
    "id": "mta",
    "fleetType": "Medium transport aircraft (synthetic)",
    "title": "Medium transport aircraft",
    "subtitle": "Twin-turboprop medium transport \u00b7 Illustrative 3D model",
    "drawingNumber": "FA-MTA-001",
    "model": "models/transport-visual.glb",
    "poster": "models/fighter-poster.svg",
    "basis": "C-295-class proportions. Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence."
  },
  "mki": {
    "id": "mki",
    "fleetType": "Heavy multirole fighter (synthetic)",
    "title": "Heavy multirole fighter",
    "subtitle": "Twin-engine heavy multirole fighter \u00b7 Illustrative 3D model",
    "drawingNumber": "FA-HMF-001",
    "model": "models/heavy-fighter-visual.glb",
    "poster": "models/fighter-poster.svg",
    "basis": "Su-30-class proportions. Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence."
  },
  "alh": {
    "id": "alh",
    "fleetType": "Utility helicopter (synthetic)",
    "title": "Utility helicopter",
    "subtitle": "Twin-engine utility helicopter \u00b7 Illustrative 3D model",
    "drawingNumber": "FA-UH-001",
    "model": "models/helicopter-visual.glb",
    "poster": "models/fighter-poster.svg",
    "basis": "ALH-class proportions (length with rotors turning, main-rotor diameter as span). Built at 1:1 scale to the publicly stated overall dimensions of its class; sections, planform, systems and internal arrangement are approximations from public three-view and cutaway drawings. Not manufacturer CAD or this aircraft's verified configuration; not for installation, clearance or loads. Synthetic records are not airworthiness evidence."
  }
} as const;
export const FLEET_CYCLE: AirframeId[] = ["lca", "lca", "lca", "ajt", "mta", "mki", "lca", "alh", "ajt", "mta"];
export function airframeForIndex(index: number): AirframeId { return FLEET_CYCLE[((index % FLEET_CYCLE.length) + FLEET_CYCLE.length) % FLEET_CYCLE.length]; }
export function airframeInfo(aircraft: { id?: unknown; type?: unknown } | undefined) {
  const byType = Object.values(AIRFRAME_INFO).find(item => item.fleetType === aircraft?.type);
  if (byType) return byType;
  const match = typeof aircraft?.id === "string" ? /(\d+)$/.exec(aircraft.id) : null;
  return AIRFRAME_INFO[match ? airframeForIndex(Number(match[1]) - 1) : "lca"];
}
