import { BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, MeshPhysicalMaterial, SphereGeometry } from "three";
import { finishes, kit, splitAt, stationAt, type Point } from "./airframeKit";
import type { Airfoil, Section } from "./fighterGeometry";

/* Twin-engine, twin-tail heavy multirole fighter with canards, Su-30-class proportions. Metres,
   nose +Z, ground at GROUND_Y. Overall length, span and height follow publicly stated figures
   for the class (21.935 m, 14.7 m, 6.36 m); the blended body, nacelles, booms and surfaces are
   approximations from public three-view drawings — not manufacturer CAD or loads data. */
const nacelle = (side: number): Section[] => [
  { z: 3.70, cx: side * 1.15, cy: -.62, w: .44, top: .36, bot: .40, n: 5 },
  { z: 2.60, cx: side * 1.18, cy: -.60, w: .55, top: .45, bot: .50, n: 4 },
  { z: 0.00, cx: side * 1.20, cy: -.55, w: .62, top: .52, bot: .56, n: 3.2 },
  { z: -4.00, cx: side * 1.20, cy: -.52, w: .62, top: .52, bot: .56, n: 2.8 },
  { z: -7.50, cx: side * 1.17, cy: -.52, w: .58, top: .50, bot: .52, n: 2.2 },
  { z: -8.40, cx: side * 1.15, cy: -.52, w: .52, top: .52, bot: .52, n: 2 },
];
export const HEAVY_FIGHTER = {
  groundY: -2.4,
  dimensions: { lengthM: 21.935, spanM: 14.7, heightM: 6.36 },
  fuselage: [
    { z: 10.55, cy: -.05, w: .015, top: .015, bot: .015 },
    { z: 10.00, cy: -.04, w: .27, top: .27, bot: .27 },
    { z: 9.00, cy: -.02, w: .48, top: .48, bot: .46, n: 2.1 },
    { z: 8.00, cy: 0, w: .60, top: .60, bot: .58, n: 2.2 },
    { z: 7.00, cy: 0, w: .66, top: .70, bot: .64, n: 2.3 },
    { z: 5.50, cy: 0, w: .74, top: .74, bot: .68, n: 2.5 },
    { z: 4.50, cy: 0, w: .88, top: .72, bot: .70, n: 2.7 },
    { z: 3.00, cy: 0, w: 1.25, top: .66, bot: .74, n: 3.0 },
    { z: 1.00, cy: 0, w: 1.50, top: .60, bot: .78, n: 3.4 },
    { z: -1.00, cy: 0, w: 1.50, top: .55, bot: .78, n: 3.4 },
    { z: -3.00, cy: 0, w: 1.35, top: .50, bot: .72, n: 3.0 },
    { z: -5.00, cy: -.02, w: 1.05, top: .45, bot: .58, n: 2.6 },
    { z: -7.00, cy: -.08, w: .66, top: .40, bot: .42, n: 2.3 },
    { z: -9.00, cy: -.15, w: .40, top: .30, bot: .28, n: 2.1 },
    { z: -10.93, cy: -.25, w: .10, top: .10, bot: .08 },
  ] as Section[],
  radomeJointZ: 9.0,
  canopy: [
    { z: 8.35, cy: .62, w: .05, top: .02, bot: 0, n: 2 }, { z: 7.90, cy: .62, w: .40, top: .30, bot: 0, n: 2.2 },
    { z: 7.20, cy: .63, w: .50, top: .52, bot: 0, n: 2.3 }, { z: 6.20, cy: .64, w: .52, top: .62, bot: 0, n: 2.3 },
    { z: 5.30, cy: .64, w: .50, top: .58, bot: 0, n: 2.3 }, { z: 4.60, cy: .64, w: .38, top: .42, bot: 0, n: 2.2 },
    { z: 4.00, cy: .64, w: .18, top: .16, bot: 0, n: 2 },
  ] as Section[],
  seats: [{ z: 6.95, y: .64 }, { z: 5.75, y: .72 }],
  nacelle,
  boom: (side: number): Section[] => [
    { z: -2.4, cx: side * 1.88, cy: -.3, w: .04, top: .04, bot: .04 }, { z: -3.8, cx: side * 1.88, cy: -.32, w: .2, top: .22, bot: .2, n: 2.4 },
    { z: -7.8, cx: side * 1.88, cy: -.32, w: .2, top: .22, bot: .2, n: 2.4 }, { z: -8.9, cx: side * 1.88, cy: -.32, w: .07, top: .09, bot: .07 },
  ],
  // Large blended LERX into a ~42° swept wing; flaperons along the trailing edge.
  wing: [
    { s: .90, h: -.05, le: 5.00, te: -3.50, tc: .05 },
    { s: 1.60, h: -.06, le: 2.30, te: -3.45, tc: .05 },
    { s: 3.50, h: -.08, le: .55, te: -3.60, tc: .048 },
    { s: 7.30, h: -.12, le: -2.75, te: -4.35, tc: .042 },
  ] as Airfoil[],
  controlChord: .55,
  flaperons: [1.95, 6.9] as [number, number],
  canard: [{ s: .9, h: .22, le: 6.5, te: 5.0, tc: .05 }, { s: 3.2, h: .26, le: 5.0, te: 4.35, tc: .045 }] as Airfoil[],
  fin: (side: number): Airfoil[] => [
    { s: -.12, h: side * 1.88, le: -4.3, te: -8.1, tc: .05 }, { s: 2.0, h: side * 1.88, le: -6.3, te: -8.5, tc: .045 }, { s: 3.96, h: side * 1.88, le: -8.1, te: -9.05, tc: .04 },
  ],
  tailplane: [{ s: 1.95, h: -.30, le: -6.0, te: -8.9, tc: .05 }, { s: 4.95, h: -.32, le: -8.3, te: -9.4, tc: .04 }] as Airfoil[],
  engine: { axisY: -.52, faceZ: -3.95, exitZ: -9.15, radius: .52, xs: [-1.17, 1.17] },
  mainGear: { x: 2.2, z: -1.2, tyreRadius: .52, tyreWidth: .3 },
  noseGear: { z: 6.0, tyreRadius: .33, tyreWidth: .2 },
  frames: [9.0, 8.2, 7.4, 6.6, 5.8, 5.0, 4.0, 3.0, 2.0, 1.0, 0, -1.0, -2.0, -3.0, -4.0, -5.0, -6.0, -7.0, -8.0, -9.2],
};

export function createHeavyFighterVisual() {
  const t = HEAVY_FIGHTER;
  const root = new Group(); root.name = "Heavy multirole fighter (Su-30-class proportions)";
  root.userData = { modelKind: "illustrative-heavy-fighter", revision: "visual-v1", engineeringValidated: false, units: "metres", dimensions: t.dimensions,
    source: "Procedural geometry sized to publicly stated overall dimensions for the class; parts approximated from public three-view drawings. Not manufacturer CAD." };
  const f = finishes("#7b858c", "#939ca1"), k = kit(root, f), skin = k.onSkin(t.fuselage);
  const [noseCone, body] = splitAt(t.fuselage, t.radomeJointZ);
  k.add("Continuous shaped fuselage", k.loft(body, { arc: [0, Math.PI], perSpan: 1, sides: 72 }), f.paint);
  k.add("Fuselage lower skin", k.loft(body, { arc: [Math.PI, Math.PI * 2], perSpan: 1, sides: 72 }), f.paintLow);
  k.add("Radar nose radome", k.loft(noseCone, { perSpan: 1, sides: 56 }), f.radome);
  k.line("Radome joint", Array.from({ length: 49 }, (_, i) => skin(t.radomeJointZ, i / 48 * Math.PI * 2, .006)), .006);
  k.add("Anti-glare panel", k.loft([{ z: 8.9, cy: 0, w: .34, top: .5, bot: 0 }, { z: 8.6, cy: 0, w: .44, top: .56, bot: 0 }, { z: 8.35, cy: 0, w: .5, top: .6, bot: 0 }], { arc: [Math.PI * .3, Math.PI * .7], perSpan: 4 }), f.antiGlare);
  k.rod("Nose pitot visual", [0, -.05, 10.5], [0, -.05, 11.0], .016, f.steel);
  k.rod("Refuelling probe", [-.55, .35, 7.4], [-.48, .4, 9.0], .04, f.alloy);
  // Tandem canopy, seats, panels.
  const glass = k.add("Cockpit glazed canopy", k.loft(t.canopy, { arc: [0, Math.PI], perSpan: 10, sides: 48 }), f.glass, [0, .0001, 0]);
  glass.castShadow = false; glass.renderOrder = 2;
  for (const [z, name] of [[7.75, "Windscreen bow"], [6.35, "Inter-cockpit arch"]] as const) {
    const sec = t.canopy.reduce((best, s) => Math.abs(s.z - z) < Math.abs(best.z - z) ? s : best);
    k.line(name, Array.from({ length: 33 }, (_, i) => { const a = i / 32 * Math.PI; return [Math.cos(a) * (sec.w + .006), sec.cy + Math.sin(a) * (sec.top + .006), sec.z] as Point; }), .022, f.cockpit);
  }
  t.seats.forEach((seat, i) => {
    k.seat(i ? "Rear ejection seat" : "Cockpit seat", seat.z, seat.y);
    k.add(`${i ? "Rear" : "Front"} instrument panel`, k.loft([{ z: seat.z + .62, cy: seat.y + .06, w: .3, top: .1, bot: .08, n: 4 }, { z: seat.z + .54, cy: seat.y + .06, w: .3, top: .1, bot: .08, n: 4 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), f.cockpit);
    for (const x of [-.15, 0, .15]) k.add(`${i ? "Rear" : "Front"} display ${x}`, new CircleGeometry(.065, 4), f.display, [x, seat.y + .08, seat.z + .535], [0, Math.PI, Math.PI / 4]);
  });
  k.add("HUD combiner", new CircleGeometry(.07, 4), new MeshPhysicalMaterial({ color: "#7fb3a3", transparent: true, opacity: .25, roughness: .05 }), [0, .9, 7.62], [-.5, 0, Math.PI / 4], [1.4, 1, 1]);
  // Engine nacelles with ramp intakes, tail booms, nozzles.
  for (const side of [-1, 1]) {
    const nac = t.nacelle(side);
    k.add(`Engine nacelle ${side}`, k.loft(nac, { perSpan: 10, sides: 56 }), f.paintLow);
    k.add(`Dark recessed intake mouth ${side}`, k.loft(nac.slice(0, 3).map(s => ({ ...s, w: s.w - .03, top: s.top - .03, bot: s.bot - .03 })), { perSpan: 6, sides: 40 }), f.duct);
    k.add(`Intake splitter ${side}`, k.liftingSurface([{ s: -.22, h: side * .66, le: 3.85, te: 2.6, tc: .02 }, { s: -.95, h: side * .66, le: 3.85, te: 2.7, tc: .02 }], "y", 8), f.alloy);
    k.add(`Tail boom ${side}`, k.loft(t.boom(side), { perSpan: 6, sides: 32, capStart: true, capEnd: true }), f.paint);
    const e = t.engine, x = e.xs[side < 0 ? 0 : 1];
    k.latheZ(`Nozzle shroud ${side}`, [[.53, -8.35], [.52, -8.55], [.5, -8.7]], f.burnt, x, e.axisY);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, b = (i + .86) / 14 * Math.PI * 2, r0 = .5, r1 = .45;
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute([x + Math.cos(a) * r0, e.axisY + Math.sin(a) * r0, -8.7, x + Math.cos(b) * r0, e.axisY + Math.sin(b) * r0, -8.7, x + Math.cos(a) * r1, e.axisY + Math.sin(a) * r1, e.exitZ, x + Math.cos(b) * r1, e.axisY + Math.sin(b) * r1, e.exitZ], 3));
      g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); k.add(`Nozzle petal ${side}-${i}`, g, i % 2 ? f.burnt : f.alloy);
    }
    k.add(`Exhaust dark inner cavity ${side}`, new CircleGeometry(.42, 40), f.soot, [x, e.axisY, -8.6], [0, Math.PI, 0]).castShadow = false;
  }
  // Wing with flaperons and leading-edge slat line, canards, twin fins with rudders, ventral
  // fins, all-moving stabilators, wingtip rails, pylons.
  k.wing(t.wing, t.flaperons[0], t.controlChord);
  k.controlSurface("Flaperon", t.wing, t.flaperons[0] + .03, t.flaperons[1], t.controlChord);
  k.mirrored("Canard foreplane", t.canard, f.paint);
  for (const side of [-1, 1]) {
    k.line(`Leading-edge slat line ${side}`, [2.0, 7.1].map(s => { const st = stationAt(t.wing, s); return [side * s, st.h + .03, st.le - .35] as Point; }));
    k.add(`Vertical fin ${side}`, k.liftingSurface(t.fin(side).map(st => ({ ...st, te: st.s < 3.6 ? st.te + .5 : st.te })), "y"), f.paint);
    k.add(`Rudder ${side}`, k.liftingSurface([{ s: .9, h: side * 1.88, le: -7.75, te: -8.25, tc: .04 }, { s: 2.0, h: side * 1.88, le: -7.98, te: -8.48, tc: .04 }, { s: 3.5, h: side * 1.88, le: -8.4, te: -8.9, tc: .04 }], "y"), f.panel);
    k.add(`Ventral fin ${side}`, k.liftingSurface([{ s: -.4, h: side * 1.88, le: -5.0, te: -6.4, tc: .05 }, { s: -1.0, h: side * 1.88, le: -5.9, te: -6.6, tc: .05 }], "y", 10), f.paintLow);
    const tip = stationAt(t.wing, 7.3);
    k.add(`Wingtip launch rail ${side}`, k.loft([{ z: tip.le + .3, cx: side * 7.36, cy: tip.h, w: .012, top: .012, bot: .012 }, { z: tip.le, cx: side * 7.36, cy: tip.h, w: .05, top: .045, bot: .06, n: 3 }, { z: tip.te, cx: side * 7.36, cy: tip.h, w: .05, top: .045, bot: .06, n: 3 }], { perSpan: 4, sides: 20, capEnd: true }), f.alloy);
    k.add(`Wingtip navigation lens ${side}`, new SphereGeometry(.035, 12, 8), side < 0 ? f.red : f.green, [side * 7.36, tip.h + .05, tip.te]);
    for (const s of [3.0, 4.6, 6.0]) {
      const st = stationAt(t.wing, s), mid = (st.le + st.te) / 2 + .2, len = Math.min(1.8, (st.le - st.te) * .55);
      k.add(`Underwing pylon ${side}-${s}`, k.liftingSurface([{ s: st.h - .04, h: side * s, le: mid + len / 2, te: mid - len / 2, tc: .09 }, { s: st.h - .3, h: side * s, le: mid + len / 2 - .15, te: mid - len / 2 + .05, tc: .09 }], "y", 12), f.paintLow).userData.empty = true;
    }
    k.add(`Low-visibility roundel ${side}`, new CircleGeometry(.32, 40), f.lowVis, [side * 5.0, stationAt(t.wing, 5).h + .05, -2.9], [-Math.PI / 2, 0, 0]);
  }
  k.mirrored("All-moving stabilator", t.tailplane, f.paint);
  k.line("Dorsal airbrake outline", [[-.4, .48], [-2.0, .48], [-2.0, -.48], [-.4, -.48], [-.4, .48]].map(([z, a]) => skin(z, Math.PI / 2 + a)), .0035);
  for (const z of [8.0, 5.0, 2.0, -1.0, -4.0, -7.0]) k.line(`Fuselage frame line ${z}`, Array.from({ length: 25 }, (_, i) => skin(z, Math.PI * .1 + i / 24 * Math.PI * .8)), .0035);
  for (const z of [3.0, -2.5]) k.add(`Blade antenna ${z}`, k.liftingSurface([{ s: skin(z, Math.PI / 2)[1], h: 0, le: z + .12, te: z - .08, tc: .12 }, { s: skin(z, Math.PI / 2)[1] + .2, h: 0, le: z + .02, te: z - .1, tc: .12 }], "y", 10), f.panel);
  // Gear: twin-wheel nose leg, single large main wheels on legs from the nacelles.
  for (const side of [-1, 1]) {
    const g = t.mainGear, cy = t.groundY + g.tyreRadius, x = side * g.x;
    k.wheel(`Main gear ${side}`, [x, cy, g.z], g.tyreRadius, g.tyreWidth);
    k.rod(`Main oleo cylinder ${side}`, [side * 1.75, -.85, g.z + .25], [x - side * .18, cy + .65, g.z], .075, f.alloy);
    k.rod(`Main oleo piston ${side}`, [x - side * .18, cy + .66, g.z], [x - side * .18, cy + .1, g.z], .05, f.steel);
    k.rod(`Main axle ${side}`, [x - side * .18, cy, g.z], [x, cy, g.z], .05, f.steel);
    k.rod(`Main side brace ${side}`, [side * 1.4, -.95, g.z - .9], [x - side * .18, cy + .55, g.z], .035, f.alloy);
    k.add(`Main gear door ${side}`, k.liftingSurface([{ s: -.95, h: side * 1.95, le: g.z + .9, te: g.z - .8, tc: .03 }, { s: -1.55, h: side * 2.0, le: g.z + .7, te: g.z - .7, tc: .03 }], "y", 10), f.paintLow);
  }
  const ng = t.noseGear, ncy = t.groundY + ng.tyreRadius;
  for (const side of [-1, 1]) k.wheel(`Nose gear${side < 0 ? "" : " starboard"}`, [side * .17, ncy, ng.z], ng.tyreRadius, ng.tyreWidth);
  k.rod("Nose oleo cylinder", [0, -.55, ng.z + .15], [0, ncy + .65, ng.z + .05], .06, f.alloy);
  k.rod("Nose oleo piston", [0, ncy + .66, ng.z + .05], [0, ncy, ng.z], .04, f.steel);
  k.rod("Nose axle", [-.27, ncy, ng.z], [.27, ncy, ng.z], .035, f.steel);
  k.rod("Nose drag brace", [0, -.6, ng.z - .8], [0, ncy + .5, ng.z + .03], .03, f.alloy);
  k.add("Taxi light", new CircleGeometry(.045, 20), f.white, [0, ncy + .8, ng.z + .12]);
  return root;
}
