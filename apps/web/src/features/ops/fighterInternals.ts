import { BoxGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry, type Material } from "three";
import { AIRFRAMES, type AirframeSpec } from "./airframes";
import { stationAt } from "./airframeKit";
import { liftingSurface, loft, resample, sectionPoint, WING_PLANFORM, type Airfoil, type Section } from "./fighterGeometry";

type Point = [number, number, number];
/** Light-combat-aircraft wing station (kept for callers that predate multiple airframes). */
export const wingStation = (s: number) => stationAt(WING_PLANFORM, s);

/** Internal airframe for the cutaway, derived from the airframe's own geometry: frames,
 *  longerons, spars and ribs, ducts or cabin, fuel, radar, engine section, accessory drive and
 *  system runs. Typical arrangement for the class in metres; representative, not manufacturer
 *  structure or installation data. */
export function createInternals(spec: AirframeSpec, wireframe = false) {
  const root = new Group(); root.name = "Internal structure and systems";
  root.userData = { engineeringValidated: false, units: "metres", airframe: spec.id };
  const m = (color: string, metalness: number, roughness: number, opacity = 1) => new MeshStandardMaterial({
    color, metalness, roughness, wireframe, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: opacity < 1 ? DoubleSide : undefined,
  });
  const frame = m("#b7c7c2", .7, .4), spar = m("#a8bdb6", .7, .42), duct = m("#7fa7b9", .3, .5, .26), fuel = m("#e0a84a", .1, .5, .24);
  const steel = m("#c9ced2", .9, .25), dark = m("#3c454c", .4, .6), hydraulic = m("#5fa8d3", .4, .4), electric = m("#d58b4a", .3, .5), fuelLine = m("#d6b45a", .5, .4);
  const add = (name: string, geometry: BufferGeometry, material: Material, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0]) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.rotation.set(...rotation); root.add(mesh); return mesh;
  };
  const tube = (name: string, points: Point[], radius: number, material: Material, closed = false) =>
    add(name, new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p)), closed), Math.max(32, points.length * 10), radius, 8, closed), material);
  const skin = resample(spec.fuselage, 24);
  const at = (z: number) => skin.reduce((best, s) => Math.abs(s.z - z) < Math.abs(best.z - z) ? s : best, skin[0]);
  const ring = (z: number, inset: number) => { const s = at(z); return Array.from({ length: 48 }, (_, i) => { const [x, y] = sectionPoint({ ...s, w: s.w - inset, top: s.top - inset, bot: s.bot - inset }, i / 48 * Math.PI * 2); return [x, y, s.z] as Point; }); };
  const big = spec.dimensions.lengthM > 18, inset = big ? .06 : .03, wing = spec.wing, hasWing = wing.length > 1;
  const tipS = hasWing ? wing[wing.length - 1].s : 0, rootS = hasWing ? wing[1].s : 0;
  const nose = spec.fuselage[0].z, tail = spec.fuselage[spec.fuselage.length - 1].z;

  // Fuselage frames and longerons.
  for (const z of spec.frames) tube(`Fuselage frame ${z}`, ring(z, inset), big ? .028 : .013, frame, true);
  const longerons = big ? [.12, .5, .88, 1.2, 1.5, 1.8] : [.18, .5, .82, 1.08, 1.5, 1.92];
  for (const angle of longerons.map(f => f * Math.PI)) tube(`Longeron ${angle.toFixed(2)}`, Array.from({ length: 8 }, (_, i) => { const z = (nose - (nose - tail) * (.12 + i * .11)); const s = at(z); const [x, y] = sectionPoint({ ...s, w: s.w - inset - .005, top: s.top - inset - .005, bot: s.bot - inset - .005 }, angle); return [x, y, s.z] as Point; }), big ? .02 : .012, frame);

  // Wing box: spars, ribs and integral fuel between front and rear spars.
  const usable = (st: Airfoil) => st.le - st.te - spec.controlChord;
  if (hasWing) for (const side of [-1, 1]) {
    for (const f of [.12, .3, .48, .66]) tube(`Wing spar ${side}-${f}`, [0, .33, .66, 1].map(t => rootS + (tipS - .05 - rootS) * t).map(s => { const st = stationAt(wing, s); return [side * s, st.h, st.le - f * usable(st)] as Point; }), big ? .03 : .016, spar);
    const ribStep = (tipS - rootS) / (big ? 14 : 7);
    for (let s = rootS + ribStep; s < tipS - .1; s += ribStep) { const st = stationAt(wing, s); tube(`Wing rib ${side}-${s.toFixed(1)}`, [[side * s, st.h, st.le - .04], [side * s, st.h, st.te + spec.controlChord + .03]], big ? .018 : .01, spar); }
    const tank = (s: number): Airfoil => { const st = stationAt(wing, s), chord = usable(st); return { s: side * s, h: st.h, le: st.le - .14 * chord, te: st.le - .66 * chord, tc: st.tc * 1.6 }; };
    const stations = [.25, .45, .65, .82].map(t => tank(rootS + (tipS - rootS) * t));
    add(`Integral wing fuel tank ${side}`, liftingSurface(side < 0 ? stations.reverse() : stations, "x", 16), fuel);
  }
  spec.fins.forEach((fin, i) => { for (const f of [.15, .45, .75]) tube(`Fin spar ${i}-${f}`, fin.map(st => [st.h, st.s, st.le - f * (st.le - st.te)] as Point), big ? .025 : .012, spar); });
  if (spec.canard) for (const side of [-1, 1]) tube(`Canard spar ${side}`, spec.canard.map(st => [side * st.s, st.h, st.le - .4 * (st.le - st.te)] as Point), .012, spar);
  if (spec.tailplane) for (const side of [-1, 1]) for (const f of [.2, .6]) tube(`Tailplane spar ${side}-${f}`, spec.tailplane.map(st => [side * st.s, st.h, st.le - f * (st.le - st.te)] as Point), big ? .02 : .01, spar);

  // Nose: radar or weather radar on its gimbal, avionics racks.
  const radomeZ = nose - (big ? .9 : (nose - tail) * .07), radar = at(radomeZ);
  add("Radar antenna array", new CylinderGeometry(radar.w * .72, radar.w * .72, .035, 48), m("#9aa6ad", .6, .35), [0, radar.cy, radomeZ], [Math.PI / 2 - .08, 0, 0]);
  add("Radar gimbal", new CylinderGeometry(.06, .08, .3, 20), steel, [0, radar.cy, radomeZ - .2], [Math.PI / 2, 0, 0]);
  const bay = at(radomeZ - (big ? 1.4 : .9));
  for (const x of [-1, 1]) add(`Avionics rack ${x}`, new BoxGeometry(bay.w * .7, .04, big ? 1.6 : .9), frame, [x * bay.w * .45, bay.cy - bay.bot * .6, bay.z]);

  if (spec.engines.kind === "jet") {
    const e = spec.engines, xs = e.xs ?? [0], ex = (side: number) => xs.length > 1 ? xs[side < 0 ? 0 : 1] : 0;
    // Intake ducts from each lip to the engine face.
    if (spec.intake) for (const side of [-1, 1]) {
      const lip = spec.intake(side)[0], mid = spec.intake(side)[Math.min(2, spec.intake(side).length - 1)];
      const sections: Section[] = [
        { ...lip, w: lip.w - .03, top: lip.top - .03, bot: lip.bot - .03 }, { ...mid, w: mid.w - .03, top: mid.top - .03, bot: mid.bot - .03 },
        { z: (mid.z + e.faceZ) / 2, cx: ((mid.cx ?? 0) + ex(side)) / 2, cy: (mid.cy + e.axisY) / 2, w: e.radius * .75, top: e.radius * .82, bot: e.radius * .82, n: 2.2 },
        { z: e.faceZ, cx: ex(side), cy: e.axisY, w: e.radius * .95, top: e.radius * .95, bot: e.radius * .95, n: 2 },
      ];
      add(`Intake duct ${side}`, loft(sections, { perSpan: 10, sides: 40 }), duct);
    }
    // Fuselage fuel cells above the ducts and a collector tank.
    const top = (z: number) => { const s = at(z); return s.cy + s.top * .45; };
    const z0 = spec.intake ? spec.intake(1)[0].z - .9 : nose * .2, z1 = e.faceZ + .2;
    add("Fuselage fuel tank", loft([z0, (z0 + z1) / 2, z1].map(z => { const s = at(z); return { z, cy: top(z), w: s.w * .7, top: s.top * .32, bot: s.top * .2, n: 3.4 }; }), { perSpan: 6, sides: 32, capStart: true, capEnd: true }), fuel);
    add("Collector tank", new BoxGeometry(.42, .2, .6), fuel, [0, at(z1 + 1.2).cy - at(z1 + 1.2).bot * .55, z1 + 1.2]);
    // Jet pipe / afterburner, mounts, accessory gearbox and power take-off.
    const pipe = e.afterburner ? 1.3 : (e.faceZ - 1.9 - e.exitZ) * .9;
    for (const x of xs) {
      const length = xs.length > 1 ? Math.min(pipe, (e.faceZ - 2.4) - e.exitZ - .3) : pipe;
      add(e.afterburner ? `Afterburner duct ${x}` : `Jet pipe ${x}`, new CylinderGeometry(e.radius * .93, e.radius * .97, length, 48, 1, true), m("#8c8a86", .7, .45, .45), [x, e.axisY, e.exitZ + .25 + length / 2], [Math.PI / 2, 0, 0]);
      if (e.afterburner) for (const dz of [.8, 1.0]) add(`Afterburner spray ring ${x} ${dz}`, new TorusGeometry(e.radius * .62 - (dz - .8) * .3, .012, 8, 40), steel, [x, e.axisY, e.exitZ + .25 + length - dz]);
      for (const side of [-1, 1]) tube(`Engine mount ${x} ${side}`, [[x + side * e.radius, e.axisY + .2, e.faceZ - .3], [x + side * e.radius * 1.4, e.axisY + .33, e.faceZ - .15]], .02, steel);
    }
    add("Accessory gearbox", new BoxGeometry(.58, .19, .3), m("#6f7b83", .7, .4), [0, e.axisY - e.radius * 1.15, e.faceZ + .4]);
    tube("Power take-off shaft", [[0, e.axisY - e.radius * .3, e.faceZ - .15], [0, e.axisY - e.radius * .8, e.faceZ + .1], [0, e.axisY - e.radius * 1.05, e.faceZ + .35]], .025, steel);
    if (e.afterburner && xs.length === 1) {
      for (let i = 0; i < 4; i++) { const a = (i + .5) / 4 * Math.PI * 2; tube(`Nozzle actuator ${i}`, [[Math.cos(a) * .48, e.axisY + Math.sin(a) * .48, -5.75], [Math.cos(a) * .45, e.axisY + Math.sin(a) * .45, -6.3]], .018, steel); }
      tube("23 mm gun barrels", [[.56, -.62, 1.35], [.56, -.62, -.25]], .035, dark);
      add("Ammunition tank", new BoxGeometry(.32, .26, .7), dark, [.42, -.52, -.95]);
    }
    if (hasWing) for (const side of [-1, 1]) { const act = stationAt(wing, Math.min(tipS * .45, 1.6)); tube(`Hydraulic line ${side}`, [[side * .3, e.axisY - e.radius * 1.15, e.faceZ + .4], [side * .6, act.h - .05, e.faceZ - .3], [side * act.s, act.h, act.te + spec.controlChord + .1]], .012, hydraulic); }
    tube("Fuel feed line", [[0, at(z1 + 1.2).cy - at(z1 + 1.2).bot * .55, z1 + 1.2], [0, e.axisY - e.radius * .9, e.faceZ + .6], [-.3, e.axisY - e.radius * 1.0, e.faceZ - .2]], .015, fuelLine);
  } else if (spec.engines.kind === "turboshaft") {
    // Helicopter: engine deck, main gearbox and mast, swashplate, tail-rotor drive train, cabin
    // floor and crash-resistant under-floor fuel cells.
    for (const u of spec.engines.units) add(`Turboshaft engine casing ${u.x}`, new CylinderGeometry(u.radius, u.radius * .9, u.front - u.rear, 32, 1, true), m("#8c8a86", .6, .45, .4), [u.x, u.y, (u.front + u.rear) / 2], [Math.PI / 2, 0, 0]);
    add("Main gearbox", new CylinderGeometry(.42, .5, .55, 32), m("#6f7b83", .7, .4), [0, 1.3, .35]);
    if (spec.rotor) {
      tube("Rotor mast", [[0, 1.3, spec.rotor.z], [0, spec.rotor.y, spec.rotor.z]], .1, steel);
      add("Swashplate", new TorusGeometry(.26, .04, 10, 32), steel, [0, 1.72, spec.rotor.z], [Math.PI / 2, 0, 0]);
      const t = spec.rotor.tail;
      tube("Tail-rotor drive shaft", [[0, 1.15, -.4], [0, 1.05, -2.6], [0, .82, -5.0], [0, .78, -7.0], [0, t.y - .4, t.z + .2]], .035, steel);
      for (const z of [-3.2, -4.4, -5.6, -6.6]) add(`Hanger bearing ${z}`, new TorusGeometry(.07, .015, 8, 20), frame, [0, .8 + (z + 3.2) * -.01, z]);
      add("Intermediate gearbox", new BoxGeometry(.2, .2, .25), m("#6f7b83", .7, .4), [0, .8, -7.2]);
    }
    const floor = at(.5);
    add("Cabin floor", new BoxGeometry(floor.w * 1.6, .04, 4.8), m("#9fb3ad", .4, .5, .3), [0, floor.cy - floor.bot * .45, .8]);
    for (const z of [.8, -.6]) add(`Under-floor fuel cell ${z}`, new BoxGeometry(floor.w * 1.2, .22, 1.1), fuel, [0, floor.cy - floor.bot * .72, z]);
    tube("Fuel feed line", [[0, floor.cy - floor.bot * .6, -.4], [-.2, .2, -1.2], [-.32, 1.05, -1.0]], .015, fuelLine);
    tube("Hydraulic line", [[.3, 1.28, .62], [.28, 1.5, .25]], .012, hydraulic);
  } else {
    const e = spec.engines;
    // Cabin floor, cargo ramp, flight-deck floor and wing carry-through box.
    const cabin = at(2);
    add("Cabin floor", new BoxGeometry(cabin.w * 1.7, .05, 13.5), m("#9fb3ad", .4, .5, .3), [0, cabin.cy - cabin.bot * .62, 1.9]);
    const ramp = at(-6.2);
    add("Cargo ramp", new BoxGeometry(ramp.w * 1.6, .05, 3.4), m("#9fb3ad", .5, .5, .5), [0, ramp.cy - ramp.bot * .7, -6.0], [-.32, 0, 0]);
    add("Flight-deck floor", new BoxGeometry(2.0, .04, 2.2), m("#9fb3ad", .4, .5, .35), [0, -.75, 9.6]);
    add("Wing carry-through box", new BoxGeometry(3.0, .45, 2.2), m("#a8bdb6", .6, .45, .4), [0, 1.55, -.1]);
    for (const n of e.nacelles) {
      for (const z of [n.front - .9, .8, -.8]) add(`Nacelle frame ${n.side} ${z}`, new TorusGeometry(n.radius * .85, .02, 8, 40), frame, [n.x, n.y + .05, z]);
      add(`Propeller reduction gearbox ${n.side}`, new CylinderGeometry(.28, .36, .5, 32), m("#6f7b83", .7, .4), [n.x, n.y, e.prop.z - .55], [Math.PI / 2, 0, 0]);
      tube(`Propeller shaft ${n.side}`, [[n.x, n.y, e.prop.z], [n.x, n.y, e.prop.z - .35]], .06, steel);
      for (const side of [-1, 1]) tube(`Engine mount ${n.side} ${side}`, [[n.x + side * .35, n.y + .1, -.3], [n.x + side * .45, n.y + .5, -.9]], .03, steel);
      const wingSt = stationAt(wing, Math.abs(n.x));
      tube(`Fuel feed line ${n.side}`, [[n.x * .65, wingSt.h, -.2], [n.x, wingSt.h - .25, .2], [n.x, n.y + .3, .9]], .02, fuelLine);
    }
    for (const side of [-1, 1]) tube(`Hydraulic line ${side}`, [[side * 1.3, -.9, -2.6], [side * 1.3, .8, -1.2], [side * 3, 1.55, -.6], [side * 10.2, 1.8, -.8]], .016, hydraulic);
    add("Weather radar bay", new CircleGeometry(radar.w * .9, 32), m("#9fb3ad", .5, .5, .35), [0, radar.cy, radomeZ - .4]);
  }
  tube("Main electrical loom", Array.from({ length: 7 }, (_, i) => { const z = nose - (nose - tail) * (.1 + i * .13); const s = at(z); return [0, s.cy + s.top - inset * 3, z] as Point; }), big ? .03 : .016, electric);
  return root;
}
/** Back-compatible helper for the light combat aircraft. */
export const createFighterInternals = (wireframe = false) => createInternals(AIRFRAMES.lca, wireframe);
