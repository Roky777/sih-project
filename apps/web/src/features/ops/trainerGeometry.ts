import { CircleGeometry, Group, MeshPhysicalMaterial, SphereGeometry } from "three";
import { finishes, kit, stationAt, type Point } from "./airframeKit";
import type { Airfoil, Section } from "./fighterGeometry";

/* Two-seat advanced jet trainer, Hawk-class proportions. Metres, nose +Z, ground at GROUND_Y.
   Overall length, span and height follow publicly stated figures for that class (12.43 m,
   9.94 m, 3.98 m); sections, planform and parts are approximations from public three-view
   drawings — not manufacturer CAD, and not for installation, clearance or loads. */
export const TRAINER = {
  groundY: -1.55,
  dimensions: { lengthM: 12.43, spanM: 9.94, heightM: 3.98 },
  fuselage: [
    { z: 6.00, cy: .02, w: .015, top: .015, bot: .015 },
    { z: 5.40, cy: .03, w: .20, top: .20, bot: .19 },
    { z: 4.60, cy: .04, w: .37, top: .38, bot: .35, n: 2.1 },
    { z: 3.80, cy: .05, w: .47, top: .50, bot: .46, n: 2.2 },
    { z: 3.00, cy: .05, w: .51, top: .55, bot: .52, n: 2.3 },
    { z: 2.00, cy: .05, w: .55, top: .60, bot: .56, n: 2.5 },
    { z: 1.00, cy: .04, w: .62, top: .60, bot: .60, n: 2.8 },
    { z: 0.00, cy: .03, w: .70, top: .60, bot: .62, n: 3.0 },
    { z: -1.00, cy: .03, w: .68, top: .58, bot: .60, n: 2.8 },
    { z: -2.50, cy: .04, w: .56, top: .55, bot: .54, n: 2.4 },
    { z: -4.00, cy: .06, w: .44, top: .48, bot: .44, n: 2.2 },
    { z: -5.30, cy: .07, w: .35, top: .38, bot: .35 },
    { z: -6.20, cy: .07, w: .30, top: .30, bot: .30 },
  ] as Section[],
  radomeJointZ: 4.6,
  canopy: [
    { z: 3.95, cy: .5, w: .05, top: .02, bot: 0, n: 2 }, { z: 3.55, cy: .5, w: .34, top: .24, bot: 0, n: 2.2 },
    { z: 3.00, cy: .51, w: .40, top: .36, bot: 0, n: 2.3 }, { z: 2.40, cy: .52, w: .42, top: .40, bot: 0, n: 2.3 },
    { z: 1.85, cy: .53, w: .42, top: .49, bot: 0, n: 2.3 }, { z: 1.35, cy: .54, w: .37, top: .42, bot: 0, n: 2.2 },
    { z: .90, cy: .55, w: .20, top: .17, bot: 0, n: 2 },
  ] as Section[],
  seats: [{ z: 2.85, y: .52 }, { z: 1.72, y: .66 }],
  // Low swept wing (LE ~26°), slight dihedral; flaps inboard, ailerons outboard.
  wing: [
    { s: .45, h: -.40, le: 1.05, te: -1.95, tc: .11 },
    { s: .70, h: -.40, le: .95, te: -1.92, tc: .105 },
    { s: 2.20, h: -.35, le: .22, te: -2.00, tc: .09 },
    { s: 4.97, h: -.25, le: -1.12, te: -2.12, tc: .08 },
  ] as Airfoil[],
  controlChord: .45,
  flaps: [.8, 2.6] as [number, number], ailerons: [2.72, 4.6] as [number, number],
  fin: [
    { s: .50, h: 0, le: -3.10, te: -5.75, tc: .07 }, { s: 1.50, h: 0, le: -4.30, te: -5.85, tc: .065 }, { s: 2.43, h: 0, le: -5.25, te: -6.05, tc: .06 },
  ] as Airfoil[],
  // All-moving tailplane with ~10° anhedral.
  tailplane: [{ s: .30, h: .06, le: -4.55, te: -5.95, tc: .07 }, { s: 2.20, h: -.27, le: -5.45, te: -6.12, tc: .06 }] as Airfoil[],
  intake: (side: number): Section[] => [
    { z: 1.35, cx: side * .62, cy: -.02, w: .17, top: .30, bot: .30, n: 2.2 },
    { z: .80, cx: side * .66, cy: -.02, w: .20, top: .32, bot: .32, n: 2.4 },
    { z: -.30, cx: side * .60, cy: -.02, w: .20, top: .30, bot: .30, n: 2.4 },
    { z: -1.20, cx: side * .45, cy: 0, w: .15, top: .22, bot: .22, n: 2 },
  ],
  engine: { axisY: .02, faceZ: -.95, exitZ: -6.2, radius: .3 },
  mainGear: { x: 1.75, z: -.95, tyreRadius: .28, tyreWidth: .17 },
  noseGear: { z: 4.3, tyreRadius: .2, tyreWidth: .12 },
  frames: [5.2, 4.6, 3.95, 3.3, 2.6, 1.95, 1.3, .6, -.1, -.8, -1.5, -2.3, -3.1, -3.9, -4.7, -5.5],
};

export function createTrainerVisual() {
  const t = TRAINER;
  const root = new Group(); root.name = "Advanced jet trainer (Hawk-class proportions)";
  root.userData = { modelKind: "illustrative-trainer", revision: "visual-v1", engineeringValidated: false, units: "metres", dimensions: t.dimensions,
    source: "Procedural geometry sized to publicly stated overall dimensions for the class; parts approximated from public three-view drawings. Not manufacturer CAD." };
  const f = finishes("#7e888d", "#9aa2a6"), k = kit(root, f), skin = k.onSkin(t.fuselage);
  // Two-tone trainer scheme: light grey with a darker upper fuselage band.
  const body = t.fuselage.filter(s => s.z <= t.radomeJointZ);
  k.add("Continuous shaped fuselage", k.loft(body, { arc: [0, Math.PI], perSpan: 9 }), f.paint);
  k.add("Fuselage lower skin", k.loft(body, { arc: [Math.PI, Math.PI * 2], perSpan: 9 }), f.paintLow);
  k.add("Nose cone", k.loft(t.fuselage.filter(s => s.z >= t.radomeJointZ - .001), { perSpan: 12 }), f.radome);
  k.line("Nose cone joint", Array.from({ length: 49 }, (_, i) => skin(t.radomeJointZ, i / 48 * Math.PI * 2, .006)), .005);
  k.add("Anti-glare panel", k.loft([{ z: 4.6, cy: .04, w: .28, top: .39, bot: 0 }, { z: 4.2, cy: .045, w: .38, top: .45, bot: 0 }, { z: 3.95, cy: .05, w: .42, top: .495, bot: 0 }], { arc: [Math.PI * .28, Math.PI * .72], perSpan: 6 }), f.antiGlare);
  k.rod("Nose pitot visual", [0, .02, 5.98], [0, .02, 6.22], .012, f.steel);
  // Stepped tandem canopy with windscreen bow and the inter-cockpit transparency arch.
  const glass = k.add("Cockpit glazed canopy", k.loft(t.canopy, { arc: [0, Math.PI], perSpan: 10, sides: 48 }), f.glass, [0, .0001, 0]);
  glass.castShadow = false; glass.renderOrder = 2;
  for (const [z, name] of [[3.5, "Windscreen bow"], [2.3, "Inter-cockpit arch"]] as const) {
    const sec = t.canopy.reduce((best, s) => Math.abs(s.z - z) < Math.abs(best.z - z) ? s : best);
    k.line(name, Array.from({ length: 33 }, (_, i) => { const a = i / 32 * Math.PI; return [Math.cos(a) * (sec.w + .006), sec.cy + Math.sin(a) * (sec.top + .006), sec.z] as Point; }), .02, f.cockpit);
  }
  t.seats.forEach((seat, i) => {
    k.seat(i ? "Rear ejection seat" : "Cockpit seat", seat.z, seat.y);
    k.add(`${i ? "Rear" : "Front"} instrument panel`, k.loft([{ z: seat.z + .62, cy: seat.y + .06, w: .27, top: .1, bot: .08, n: 4 }, { z: seat.z + .54, cy: seat.y + .06, w: .27, top: .1, bot: .08, n: 4 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), f.cockpit);
    for (const x of [-.12, .12]) k.add(`${i ? "Rear" : "Front"} display ${x}`, new CircleGeometry(.07, 4), f.display, [x, seat.y + .08, seat.z + .535], [0, Math.PI, Math.PI / 4]);
    k.rod(`${i ? "Rear" : "Front"} control stick`, [0, seat.y - .04, seat.z + .3], [0, seat.y + .14, seat.z + .36], .018, f.cockpit);
  });
  k.add("HUD combiner", new CircleGeometry(.07, 4), new MeshPhysicalMaterial({ color: "#7fb3a3", transparent: true, opacity: .25, roughness: .05 }), [0, .78, 3.5], [-.5, 0, Math.PI / 4], [1.4, 1, 1]);
  // Side intakes ahead of the wing root.
  for (const side of [-1, 1]) {
    const intake = t.intake(side);
    k.add(`Side intake fairing ${side}`, k.loft(intake, { perSpan: 10, sides: 48 }), f.paintLow);
    k.add(`Dark recessed intake mouth ${side}`, k.loft(intake.slice(0, 3).map(s => ({ ...s, w: s.w - .02, top: s.top - .02, bot: s.bot - .02 })), { perSpan: 6, sides: 36 }), f.duct);
    const lip = intake[0];
    k.line(`Intake rolled lip ${side}`, Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return [lip.cx! + lip.w * Math.sign(c) * Math.abs(c) ** (2 / 2.2), lip.cy + lip.top * Math.sign(s) * Math.abs(s) ** (2 / 2.2), lip.z + .004] as Point; }), .014, f.alloy);
  }
  // Wing, flaps, ailerons, tip lights; tail surfaces; ventral strakes and airbrake.
  k.wing(t.wing, t.flaps[0], t.controlChord);
  k.controlSurface("Flap", t.wing, t.flaps[0] + .03, t.flaps[1], t.controlChord);
  k.controlSurface("Aileron", t.wing, t.ailerons[0], t.ailerons[1], t.controlChord);
  for (const side of [-1, 1]) {
    const tip = stationAt(t.wing, 4.97);
    k.add(`Wingtip navigation lens ${side}`, new SphereGeometry(.035, 12, 8), side < 0 ? f.red : f.green, [side * 4.97, tip.h + .02, (tip.le + tip.te) / 2]);
    for (const s of [1.5, 3.0]) {
      const st = stationAt(t.wing, s), mid = (st.le + st.te) / 2 + .1;
      k.add(`Underwing pylon ${side}-${s}`, k.liftingSurface([{ s: st.h - .05, h: side * s, le: mid + .55, te: mid - .55, tc: .09 }, { s: st.h - .26, h: side * s, le: mid + .45, te: mid - .5, tc: .09 }], "y", 12), f.paintLow).userData.empty = true;
    }
  }
  k.add("Single swept vertical fin", k.liftingSurface(t.fin.map(st => ({ ...st, te: st.s < 2.1 ? st.te + .42 : st.te })), "y"), f.paint);
  k.add("Rudder", k.liftingSurface([{ s: .7, h: 0, le: -5.35, te: -5.78, tc: .05 }, { s: 1.5, h: 0, le: -5.43, te: -5.85, tc: .05 }, { s: 2.08, h: 0, le: -5.5, te: -5.95, tc: .05 }], "y"), f.panel);
  k.mirrored("All-moving tailplane", t.tailplane, f.paint);
  for (const side of [-1, 1]) k.add(`Ventral strake ${side}`, k.liftingSurface([{ s: -.32, h: side * .26, le: -4.3, te: -5.5, tc: .04 }, { s: -.62, h: side * .3, le: -4.9, te: -5.6, tc: .04 }], "y", 10), f.paintLow);
  k.line("Ventral airbrake outline", [skin(-1.8, -Math.PI / 2 - .35), skin(-2.9, -Math.PI / 2 - .3), skin(-2.9, -Math.PI / 2 + .3), skin(-1.8, -Math.PI / 2 + .35), skin(-1.8, -Math.PI / 2 - .35)], .0035);
  for (const z of [3.3, 1.2, -.6, -2.2, -3.8]) k.line(`Fuselage frame line ${z}`, Array.from({ length: 25 }, (_, i) => skin(z, Math.PI * .08 + i / 24 * Math.PI * .84)), .0032);
  k.add("Blade antenna", k.liftingSurface([{ s: .6, h: 0, le: -.2, te: -.38, tc: .12 }, { s: .78, h: 0, le: -.3, te: -.42, tc: .12 }], "y", 10), f.panel);
  k.add("Low-visibility roundel 1", new CircleGeometry(.22, 40), f.lowVis, [3.4, stationAt(t.wing, 3.4).h + .06, -1.1], [-Math.PI / 2, 0, 0]);
  k.add("Low-visibility roundel -1", new CircleGeometry(.22, 40), f.lowVis, [-3.4, stationAt(t.wing, 3.4).h + .06, -1.1], [-Math.PI / 2, 0, 0]);
  // Jet pipe and exhaust.
  k.latheZ("Jet pipe shroud", [[.33, -5.9], [.31, -6.1], [.3, -6.2]], f.burnt, 0, t.engine.axisY);
  k.add("Exhaust dark inner cavity", new CircleGeometry(.27, 40), f.soot, [0, t.engine.axisY, -5.95], [0, Math.PI, 0]).castShadow = false;
  k.latheZ("Turbine exhaust cone", [[.001, -6.0], [.08, -5.85], [.13, -5.65]], f.soot, 0, t.engine.axisY);
  // Gear: wing-mounted main legs, nose leg; tyres on the ground line.
  for (const side of [-1, 1]) {
    const g = t.mainGear, cy = t.groundY + g.tyreRadius, x = side * g.x, wy = stationAt(t.wing, g.x).h;
    k.wheel(`Main gear ${side}`, [x, cy, g.z], g.tyreRadius, g.tyreWidth);
    k.rod(`Main oleo cylinder ${side}`, [x - side * .1, wy - .08, g.z + .05], [x - side * .1, cy + .45, g.z], .05, f.alloy);
    k.rod(`Main oleo piston ${side}`, [x - side * .1, cy + .46, g.z], [x - side * .1, cy + .08, g.z], .032, f.steel);
    k.rod(`Main axle ${side}`, [x - side * .1, cy, g.z], [x, cy, g.z], .035, f.steel);
    k.rod(`Main side brace ${side}`, [x - side * .55, wy - .1, g.z - .25], [x - side * .1, cy + .35, g.z], .022, f.alloy);
    k.add(`Main gear door ${side}`, k.liftingSurface([{ s: wy - .12, h: side * (g.x - .2), le: g.z + .45, te: g.z - .4, tc: .03 }, { s: cy + .2, h: side * (g.x - .22), le: g.z + .35, te: g.z - .35, tc: .03 }], "y", 8), f.paintLow);
  }
  const ng = t.noseGear, ncy = t.groundY + ng.tyreRadius;
  k.wheel("Nose gear", [0, ncy, ng.z], ng.tyreRadius, ng.tyreWidth);
  k.rod("Nose oleo cylinder", [0, -.38, ng.z + .08], [0, ncy + .45, ng.z + .03], .04, f.alloy);
  k.rod("Nose oleo piston", [0, ncy + .46, ng.z + .03], [0, ncy + .1, ng.z], .026, f.steel);
  for (const side of [-1, 1]) k.rod(`Nose fork ${side}`, [0, ncy + .14, ng.z], [side * .08, ncy, ng.z], .016, f.alloy);
  k.add("Taxi light", new CircleGeometry(.035, 20), f.white, [0, ncy + .55, ng.z + .1]);
  return root;
}
