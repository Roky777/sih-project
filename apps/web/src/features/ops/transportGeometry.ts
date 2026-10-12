import { CircleGeometry, Group, SphereGeometry } from "three";
import { finishes, kit, splitAt, stationAt } from "./airframeKit";
import { resample, type Airfoil, type Section } from "./fighterGeometry";

/* High-wing twin-turboprop medium transport, C-295-class proportions. Metres, nose +Z, ground
   at GROUND_Y. Overall length, span and height follow publicly stated figures for that class
   (24.45 m, 25.81 m, 8.66 m); fuselage, wing, nacelles, sponsons and ramp are approximations
   from public three-view drawings — not manufacturer CAD, and not for installation or loads. */
export const TRANSPORT = {
  groundY: -2.3,
  dimensions: { lengthM: 24.45, spanM: 25.81, heightM: 8.66 },
  fuselage: [
    { z: 12.20, cy: -.25, w: .04, top: .04, bot: .04 },
    { z: 11.60, cy: -.18, w: .82, top: .78, bot: .76, n: 2.1 },
    { z: 10.60, cy: -.08, w: 1.26, top: 1.25, bot: 1.18, n: 2.2 },
    { z: 9.00, cy: 0, w: 1.45, top: 1.44, bot: 1.38, n: 2.3 },
    { z: 7.00, cy: 0, w: 1.48, top: 1.46, bot: 1.42, n: 2.4 },
    { z: -3.00, cy: 0, w: 1.48, top: 1.46, bot: 1.42, n: 2.4 },
    { z: -4.60, cy: .15, w: 1.42, top: 1.38, bot: 1.18, n: 2.3 },
    { z: -7.00, cy: .62, w: 1.05, top: 1.02, bot: .62, n: 2.2 },
    { z: -9.60, cy: 1.08, w: .62, top: .62, bot: .3, n: 2.1 },
    { z: -12.25, cy: 1.35, w: .14, top: .14, bot: .1, n: 2 },
  ] as Section[],
  radomeJointZ: 11.1,
  // Flight-deck windscreen and side windows as glazed bands on the nose skin.
  windscreen: { from: 10.95, to: 10.05, arc: [Math.PI * .2, Math.PI * .8] as [number, number] },
  cabinWindows: [6.2, 5.0, 3.8, 2.6, -.6, -1.8, -3.0],
  // High wing with dihedral; flaps inboard, ailerons outboard.
  wing: [
    { s: .90, h: 1.62, le: 1.60, te: -1.65, tc: .17 },
    { s: 4.60, h: 1.68, le: 1.45, te: -1.40, tc: .16 },
    { s: 12.90, h: 1.95, le: .25, te: -.95, tc: .13 },
  ] as Airfoil[],
  controlChord: .7,
  flaps: [1.6, 8.5] as [number, number], ailerons: [8.7, 12.3] as [number, number],
  fin: [
    { s: 1.70, h: 0, le: -7.30, te: -11.40, tc: .12 }, { s: 4.00, h: 0, le: -8.90, te: -11.70, tc: .11 }, { s: 6.36, h: 0, le: -10.30, te: -11.95, tc: .1 },
  ] as Airfoil[],
  tailplane: [{ s: .55, h: 1.25, le: -9.50, te: -11.90, tc: .1 }, { s: 5.15, h: 1.38, le: -10.90, te: -12.20, tc: .09 }] as Airfoil[],
  nacelles: [-1, 1].map(side => ({ side, x: side * 4.6, y: 1.05, front: 3.6, rear: -2.3, radius: .58 })),
  prop: { z: 3.75, radius: 1.965, blades: 6 },
  sponson: (side: number): Section[] => [
    { z: 1.6, cx: side * 1.38, cy: -.95, w: .12, top: .2, bot: .15, n: 2.2 },
    { z: 1.0, cx: side * 1.42, cy: -.95, w: .42, top: .55, bot: .5, n: 2.6 },
    { z: -2.4, cx: side * 1.42, cy: -.95, w: .42, top: .55, bot: .5, n: 2.6 },
    { z: -3.3, cx: side * 1.38, cy: -.9, w: .14, top: .25, bot: .15, n: 2.2 },
  ],
  mainGear: { x: 1.55, z: [0, -1.25], tyreRadius: .44, tyreWidth: .3 },
  noseGear: { z: 9.3, tyreRadius: .32, tyreWidth: .2 },
  frames: [11.1, 10.1, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0, -1.0, -2.0, -3.0, -4.2, -5.4, -6.6, -7.8, -9.0, -10.2, -11.3],
};

export function createTransportVisual() {
  const t = TRANSPORT;
  const root = new Group(); root.name = "Medium transport aircraft (C-295-class proportions)";
  root.userData = { modelKind: "illustrative-transport", revision: "visual-v1", engineeringValidated: false, units: "metres", dimensions: t.dimensions,
    source: "Procedural geometry sized to publicly stated overall dimensions for the class; parts approximated from public three-view drawings. Not manufacturer CAD." };
  const f = finishes("#7f898e", "#8e979b"), k = kit(root, f), skin = k.onSkin(t.fuselage);
  // Radome and body share the exact joint section, so they meet without a gap.
  const [noseCone, body] = splitAt(t.fuselage, t.radomeJointZ);
  k.add("Continuous shaped fuselage", k.loft(body, { arc: [0, Math.PI], perSpan: 1, sides: 80 }), f.paint);
  k.add("Fuselage lower skin", k.loft(body, { arc: [Math.PI, Math.PI * 2], perSpan: 1, sides: 80 }), f.paintLow);
  k.add("Weather radar radome", k.loft(noseCone, { perSpan: 1, sides: 64 }), f.radome);
  k.line("Radome joint", Array.from({ length: 65 }, (_, i) => skin(t.radomeJointZ, i / 64 * Math.PI * 2, .008)), .007);
  // Flight-deck glazing as a band on the nose skin; cabin windows; crew and side doors.
  // Flight deck: four framed windscreen panes and two side windows each side, on the skin.
  const glaze = (name: string, from: number, to: number, arc: [number, number]) => {
    const rows = resample(t.fuselage, 24).filter(s => s.z <= from && s.z >= to).map(s => ({ ...s, w: s.w + .012, top: s.top + .012, bot: s.bot + .012 }));
    if (rows.length >= 2) k.add(name, k.loft(rows, { arc, perSpan: 1, sides: 10 }), f.window);
  };
  const P = Math.PI, wsFrom = t.windscreen.from, wsTo = t.windscreen.to;
  glaze("Flight-deck windscreen", wsFrom, wsTo, [P * .505, P * .615]); glaze("Flight-deck windscreen left", wsFrom, wsTo, [P * .385, P * .495]);
  glaze("Windscreen outer right", wsFrom - .05, wsTo + .05, [P * .63, P * .74]); glaze("Windscreen outer left", wsFrom - .05, wsTo + .05, [P * .26, P * .37]);
  for (const side of [-1, 1]) {
    const arc: [number, number] = side > 0 ? [P * .09, P * .22] : [P * .78, P * .91];
    glaze(`Flight-deck side window fwd ${side}`, wsTo - .05, wsTo - .7, arc); glaze(`Flight-deck side window aft ${side}`, wsTo - .8, wsTo - 1.35, arc);
  }
  for (const a of [.255, .375, .5, .625, .745]) k.line(`Windscreen mullion ${a}`, [wsFrom + .03, (wsFrom + wsTo) / 2, wsTo - .03].map(z => skin(z, P * a, .02)), .02, f.cockpit);
  k.line("Windscreen upper frame", Array.from({ length: 13 }, (_, i) => skin(wsTo - .02, P * (.25 + i / 12 * .5), .02)), .022, f.cockpit);
  for (const side of [-1, 1]) {
    for (const z of t.cabinWindows) { const [x, y] = skin(z, Math.PI / 2 - side * (Math.PI / 2 - .32), .012); k.add(`Cabin window ${side} ${z}`, new CircleGeometry(.17, 24), f.window, [x, y, z], [0, side * Math.PI / 2, 0]); }
    k.line(`Crew door ${side}`, [[8.4, .3], [7.6, .3], [7.6, -.75], [8.4, -.75], [8.4, .3]].map(([z, a]) => skin(z, Math.PI / 2 - side * (Math.PI / 2 - a))), .006);
    k.line(`Paratroop door ${side}`, [[-3.9, .35], [-4.9, .35], [-4.9, -.6], [-3.9, -.6], [-3.9, .35]].map(([z, a]) => skin(z, Math.PI / 2 - side * (Math.PI / 2 - a))), .006);
    k.add(`Main gear sponson ${side}`, k.loft(t.sponson(side), { perSpan: 8, sides: 40, capStart: true, capEnd: true }), f.paintLow);
  }
  // Rear loading ramp and ramp door outline on the upswept aft fuselage.
  k.line("Rear ramp outline", [-4.4, -5.6, -6.8, -8.0, -9.0].map(z => skin(z, -Math.PI / 2 - .9)).concat([-9.0, -8.0, -6.8, -5.6, -4.4].map(z => skin(z, -Math.PI / 2 + .9))), .008);
  k.line("Ramp door hinge", Array.from({ length: 17 }, (_, i) => skin(-7.0, -Math.PI / 2 - .9 + i / 16 * 1.8)), .007);
  for (const z of [9.0, 5.6, 1.8, -1.6, -5.4, -8.6]) k.line(`Fuselage frame line ${z}`, Array.from({ length: 33 }, (_, i) => skin(z, Math.PI * .06 + i / 32 * Math.PI * .88)), .005);
  k.rod("Nose pitot visual", [.7, .1, 11.2], [.7, .1, 11.75], .015, f.steel);
  // High wing with flaps and ailerons, wing-to-body fairing, nav lights.
  k.wing(t.wing, t.flaps[0], t.controlChord);
  k.controlSurface("Flap", t.wing, t.flaps[0] + .03, t.flaps[1], t.controlChord);
  k.controlSurface("Aileron", t.wing, t.ailerons[0], t.ailerons[1], t.controlChord);
  k.add("Wing-to-body fairing", k.loft([{ z: 2.6, cy: 1.3, w: .3, top: .15, bot: .1 }, { z: 1.4, cy: 1.35, w: 1.05, top: .5, bot: .2, n: 2.6 }, { z: -1.6, cy: 1.35, w: 1.05, top: .45, bot: .2, n: 2.6 }, { z: -3.4, cy: 1.3, w: .3, top: .15, bot: .1 }], { perSpan: 8, sides: 40, capStart: true, capEnd: true }), f.paint);
  for (const side of [-1, 1]) {
    const tip = stationAt(t.wing, 12.9);
    // Swept winglets and underwing flap-track fairings.
    k.add(`Winglet ${side}`, k.liftingSurface([{ s: tip.h + .02, h: side * 12.86, le: tip.le - .05, te: tip.te + .05, tc: .1 }, { s: tip.h + .95, h: side * 12.98, le: tip.te + .45, te: tip.te - .15, tc: .08 }], "y", 18), f.paint);
    for (const s of [3.2, 6.4, 8.2]) {
      const st = stationAt(t.wing, s), z0 = st.te + t.controlChord + .3;
      k.add(`Flap track fairing ${side} ${s}`, k.loft([{ z: z0 + .5, cx: side * s, cy: st.h - .22, w: .02, top: .02, bot: .02 }, { z: z0, cx: side * s, cy: st.h - .25, w: .1, top: .1, bot: .15, n: 2.2 }, { z: st.te - .45, cx: side * s, cy: st.h - .2, w: .06, top: .06, bot: .1 }, { z: st.te - .9, cx: side * s, cy: st.h - .12, w: .01, top: .01, bot: .02 }], { perSpan: 6, sides: 20 }), f.paintLow);
    }
    k.add(`Wingtip navigation lens ${side}`, new SphereGeometry(.05, 12, 8), side < 0 ? f.red : f.green, [side * 12.92, tip.h, (tip.le + tip.te) / 2]);
  }
  // Under-wing nacelles with six-blade propellers and exhaust stubs.
  for (const n of t.nacelles) {
    // Under-slung nacelle blending into the wing, chin intake below the spinner, outboard
    // exhaust, six-blade composite propeller.
    k.add(`Engine nacelle ${n.side}`, k.loft([
      { z: n.front + .02, cx: n.x, cy: n.y, w: .41, top: .41, bot: .41 }, { z: n.front - .45, cx: n.x, cy: n.y - .02, w: .5, top: .5, bot: .55, n: 2.1 },
      { z: n.front - 1.5, cx: n.x, cy: n.y + .1, w: .58, top: .66, bot: .64, n: 2.4 }, { z: .3, cx: n.x, cy: n.y + .2, w: .6, top: .68, bot: .6, n: 2.5 },
      { z: -1.2, cx: n.x, cy: n.y + .28, w: .52, top: .56, bot: .5, n: 2.4 }, { z: n.rear, cx: n.x, cy: n.y + .4, w: .14, top: .16, bot: .12 },
    ], { perSpan: 10, sides: 56, capEnd: true }), f.paint);
    k.add(`Nacelle intake lip ${n.side}`, k.loft([{ z: n.front - .38, cx: n.x, cy: n.y - .52, w: .22, top: .1, bot: .11, n: 3.2 }, { z: n.front - .7, cx: n.x, cy: n.y - .56, w: .24, top: .12, bot: .14, n: 3.2 }, { z: n.front - 1.6, cx: n.x, cy: n.y - .5, w: .2, top: .1, bot: .1, n: 3 }], { perSpan: 4, sides: 28 }), f.paintLow);
    k.add(`Nacelle intake ${n.side}`, k.loft([{ z: n.front - .39, cx: n.x, cy: n.y - .52, w: .19, top: .075, bot: .085, n: 3.2 }, { z: n.front - .9, cx: n.x, cy: n.y - .52, w: .19, top: .08, bot: .09, n: 3.2 }], { perSpan: 2, sides: 24 }), f.duct);
    k.propeller(`Propeller ${n.side}`, n.x, n.y, t.prop.z, t.prop.radius, t.prop.blades, .42);
    k.latheZ(`Exhaust stub ${n.side}`, [[.12, -.5], [.15, -1.0], [.14, -1.05]], f.burnt, n.x + n.side * .5, n.y + .32);
    for (const z of [n.front - 1.0, -.6]) k.line(`Nacelle cowl line ${n.side} ${z}`, Array.from({ length: 25 }, (_, i) => { const a = Math.PI * (.1 + i / 24 * .8); return [n.x + Math.cos(a) * .62, n.y + .15 + Math.sin(a) * .7, z] as [number, number, number]; }), .004);
  }
  // Fin with rudder and dorsal fillet; tailplane with elevators.
  k.add("Single swept vertical fin", k.liftingSurface(t.fin.map(st => ({ ...st, te: st.s < 5.9 ? st.te + .95 : st.te })), "y"), f.paint);
  k.add("Rudder", k.liftingSurface([{ s: 1.9, h: 0, le: -10.45, te: -11.4, tc: .08 }, { s: 4.0, h: 0, le: -10.75, te: -11.7, tc: .08 }, { s: 5.9, h: 0, le: -11.0, te: -11.9, tc: .08 }], "y"), f.panel);
  k.add("Dorsal fin fillet", k.loft([{ z: -4.8, cy: 1.35, w: .06, top: .06, bot: .02 }, { z: -6.4, cy: 1.2, w: .16, top: .4, bot: .02 }, { z: -7.6, cy: 1.15, w: .12, top: .55, bot: .02 }], { perSpan: 6, sides: 24, capStart: true, capEnd: true }), f.paint);
  k.mirrored("Horizontal tailplane", t.tailplane.map(st => ({ ...st, te: st.te + .7 })), f.paint);
  for (const side of [-1, 1]) {
    const el = t.tailplane.map(st => ({ ...st, s: st.s * side, le: st.te + .68, tc: st.tc * .6 }));
    k.add(`Elevator ${side}`, k.liftingSurface(side < 0 ? el.reverse() : el), f.panel);
  }
  for (const side of [-1, 1]) k.add(`Ventral strake ${side}`, k.liftingSurface([{ s: .25, h: side * .55, le: -7.6, te: -9.6, tc: .05 }, { s: -.05, h: side * .6, le: -8.4, te: -9.8, tc: .05 }], "y", 10), f.paintLow);
  k.latheZ("APU exhaust", [[.07, -12.15], [.08, -12.3]], f.burnt, 0, 1.35);
  // Tandem main wheels per side in the sponsons; twin-wheel nose gear.
  for (const side of [-1, 1]) for (const z of t.mainGear.z) {
    const g = t.mainGear, cy = t.groundY + g.tyreRadius;
    k.wheel(`Main gear ${side}${z === 0 ? "" : " aft"}`, [side * g.x, cy, z], g.tyreRadius, g.tyreWidth);
    k.rod(`Main shock strut ${side} ${z}`, [side * 1.4, -1.25, z + .25], [side * g.x, cy + .02, z], .07, f.alloy);
    k.rod(`Main axle ${side} ${z}`, [side * (g.x - .2), cy, z], [side * (g.x + .16), cy, z], .05, f.steel);
  }
  const ng = t.noseGear, ncy = t.groundY + ng.tyreRadius;
  for (const side of [-1, 1]) k.wheel(`Nose gear${side < 0 ? "" : " starboard"}`, [side * .17, ncy, ng.z], ng.tyreRadius, ng.tyreWidth);
  k.rod("Nose oleo cylinder", [0, -1.3, ng.z + .1], [0, ncy + .5, ng.z + .04], .07, f.alloy);
  k.rod("Nose oleo piston", [0, ncy + .5, ng.z + .04], [0, ncy, ng.z], .045, f.steel);
  k.rod("Nose axle", [-.28, ncy, ng.z], [.28, ncy, ng.z], .04, f.steel);
  k.add("Taxi light", new CircleGeometry(.05, 20), f.white, [0, ncy + .7, ng.z + .12]);
  // Antennas and beacon.
  for (const z of [4.0, -1.0]) k.add(`Blade antenna ${z}`, k.liftingSurface([{ s: 1.45, h: 0, le: z + .15, te: z - .1, tc: .12 }, { s: 1.68, h: 0, le: z, te: z - .14, tc: .12 }], "y", 10), f.panel);
  k.add("Anti-collision beacon", new SphereGeometry(.07, 12, 8), f.red, [0, 1.92, 2.2]);
  return root;
}
