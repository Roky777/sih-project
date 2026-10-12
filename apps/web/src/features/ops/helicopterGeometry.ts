import { CircleGeometry, CylinderGeometry, Group, SphereGeometry } from "three";
import { finishes, kit, splitAt } from "./airframeKit";
import { resample, type Airfoil, type Section } from "./fighterGeometry";

/* Twin-engine utility helicopter with wheeled gear, ALH-class proportions. Metres, nose +Z,
   ground at GROUND_Y. Overall length (rotors turning), main-rotor diameter and height follow
   publicly stated figures for the class (15.87 m, 13.2 m, 4.98 m); the pod, boom, cowlings,
   rotors and gear are approximations from public drawings — not manufacturer CAD. */
export const HELICOPTER = {
  groundY: -1.55,
  dimensions: { lengthM: 15.87, spanM: 13.2, heightM: 4.98 },
  fuselage: [
    { z: 4.35, cy: -.3, w: .05, top: .05, bot: .05 },
    { z: 4.00, cy: -.18, w: .55, top: .55, bot: .5, n: 2.2 },
    { z: 3.20, cy: -.02, w: .86, top: .9, bot: .76, n: 2.4 },
    { z: 2.00, cy: .05, w: 1.0, top: 1.0, bot: .8, n: 2.8 },
    { z: 0.00, cy: .05, w: 1.02, top: 1.0, bot: .8, n: 3.0 },
    { z: -1.60, cy: .15, w: .9, top: .9, bot: .6, n: 2.8 },
    { z: -2.60, cy: .42, w: .45, top: .48, bot: .25, n: 2.4 },
    { z: -4.50, cy: .56, w: .28, top: .3, bot: .22, n: 2.2 },
    { z: -7.20, cy: .66, w: .18, top: .2, bot: .16 },
    { z: -8.40, cy: .72, w: .1, top: .12, bot: .08 },
  ] as Section[],
  noseJointZ: 3.6,
  rotor: { y: 2.02, z: 0, radius: 6.6, blades: 4, chord: .5, tail: { x: -.36, y: 2.2, z: -8.0, radius: 1.275, blades: 4, chord: .2 } },
  engines: [-1, 1].map(side => ({ x: side * .32, y: 1.15, front: .7, rear: -1.9, radius: .3 })),
  tailplane: [{ s: .12, h: .72, le: -6.25, te: -6.95, tc: .1 }, { s: 1.6, h: .72, le: -6.4, te: -7.0, tc: .1 }] as Airfoil[],
  fin: [{ s: .75, h: 0, le: -7.05, te: -8.35, tc: .12 }, { s: 3.0, h: 0, le: -7.95, te: -8.6, tc: .1 }] as Airfoil[],
  mainGear: { x: 1.18, z: -.9, tyreRadius: .3, tyreWidth: .18 },
  noseGear: { z: 3.0, tyreRadius: .2, tyreWidth: .12 },
  frames: [3.6, 3.0, 2.2, 1.4, .6, -.2, -1.0, -1.8, -2.6, -3.6, -4.6, -5.6, -6.6, -7.6],
};

export function createHelicopterVisual() {
  const t = HELICOPTER;
  const root = new Group(); root.name = "Utility helicopter (ALH-class proportions)";
  root.userData = { modelKind: "illustrative-helicopter", revision: "visual-v1", engineeringValidated: false, units: "metres", dimensions: t.dimensions,
    source: "Procedural geometry sized to publicly stated overall dimensions for the class; parts approximated from public drawings. Not manufacturer CAD." };
  const f = finishes("#6f7b6c", "#808b7e"), k = kit(root, f), skin = k.onSkin(t.fuselage), P = Math.PI;
  const [nose, body] = splitAt(t.fuselage, t.noseJointZ);
  k.add("Continuous shaped fuselage", k.loft(body, { arc: [0, P], perSpan: 1, sides: 72 }), f.paint);
  k.add("Fuselage lower skin", k.loft(body, { arc: [P, P * 2], perSpan: 1, sides: 72 }), f.paintLow);
  k.add("Nose cone", k.loft(nose, { perSpan: 1, sides: 56 }), f.paint);
  // Large cockpit glazing, chin windows, cabin sliding-door windows.
  const glaze = (name: string, from: number, to: number, arc: [number, number]) => {
    const rows = resample(t.fuselage, 24).filter(s => s.z <= from && s.z >= to).map(s => ({ ...s, w: s.w + .012, top: s.top + .012, bot: s.bot + .012 }));
    if (rows.length >= 2) k.add(name, k.loft(rows, { arc, perSpan: 1, sides: 16 }), f.window);
  };
  glaze("Cockpit windscreen", 3.95, 2.75, [P * .3, P * .7]);
  for (const side of [-1, 1]) {
    glaze(`Cockpit side window ${side}`, 3.7, 2.35, side > 0 ? [P * .03, P * .27] : [P * .73, P * .97]);
    glaze(`Chin window ${side}`, 3.95, 3.25, side > 0 ? [-P * .3, -P * .08] : [P * 1.08, P * 1.3]);
    glaze(`Cabin window ${side}`, 1.6, .2, side > 0 ? [P * .05, P * .3] : [P * .7, P * .95]);
    k.line(`Sliding door outline ${side}`, [[1.75, .45], [-.05, .45], [-.05, -.65], [1.75, -.65], [1.75, .45]].map(([z, a]) => skin(z, side > 0 ? a : P - a, .008)), .006);
    k.line(`Door rail ${side}`, [skin(1.9, side > 0 ? .55 : P - .55, .02), skin(-1.2, side > 0 ? .55 : P - .55, .02)], .015, f.alloy);
  }
  k.line("Windscreen centre post", [skin(3.95, P / 2, .02), skin(2.75, P / 2, .02)], .022, f.cockpit);
  // Engine deck: twin turboshaft cowlings, intake grilles, exhausts; main-rotor mast and head.
  k.add("Engine cowling", k.loft([
    { z: 1.9, cy: 1.0, w: .25, top: .1, bot: .05 }, { z: 1.2, cy: 1.02, w: .78, top: .42, bot: .1, n: 3 },
    { z: -1.4, cy: 1.02, w: .72, top: .4, bot: .1, n: 3 }, { z: -2.5, cy: .95, w: .3, top: .18, bot: .05 },
  ], { perSpan: 8, sides: 44, capStart: true, capEnd: true }), f.paint);
  for (const e of t.engines) {
    k.add(`Engine intake grille ${e.x}`, new CircleGeometry(.17, 24), f.duct, [e.x + Math.sign(e.x) * .5, 1.18, .9], [0, Math.sign(e.x) * P / 2, 0]);
    k.latheZ(`Engine exhaust ${e.x}`, [[.15, -1.6], [.17, -2.1], [.16, -2.15]], f.burnt, e.x + Math.sign(e.x) * .48, 1.25);
  }
  k.add("Rotor mast fairing", new CylinderGeometry(.22, .3, .55, 24), f.paint, [0, 1.6, 0]);
  k.add("Rotor mast", new CylinderGeometry(.11, .12, .4, 20), f.steel, [0, 1.9, 0]);
  k.rotor("Main rotor", [0, t.rotor.y, t.rotor.z], t.rotor.radius, t.rotor.blades, t.rotor.chord, "y", 0);
  for (let i = 0; i < 4; i++) { const a = i / 4 * P * 2 + P / 4; k.rod(`Pitch link ${i}`, [Math.sin(a) * .22, 1.72, Math.cos(a) * .22], [Math.sin(a) * .26, 1.98, Math.cos(a) * .26], .015, f.steel); }
  // Tail boom, horizontal stabiliser with endplates, swept fin, four-blade tail rotor.
  k.mirrored("Horizontal stabiliser", t.tailplane, f.paint);
  for (const side of [-1, 1]) k.add(`Stabiliser endplate ${side}`, k.liftingSurface([{ s: .5, h: side * 1.62, le: -6.3, te: -6.98, tc: .08 }, { s: 1.05, h: side * 1.62, le: -6.55, te: -7.05, tc: .08 }], "y", 10), f.paint);
  k.add("Single swept vertical fin", k.liftingSurface(t.fin, "y"), f.paint);
  k.add("Tail-rotor gearbox", new SphereGeometry(.16, 20, 14), f.alloy, [t.rotor.tail.x + .1, t.rotor.tail.y, t.rotor.tail.z]);
  k.rotor("Tail rotor", [t.rotor.tail.x, t.rotor.tail.y, t.rotor.tail.z], t.rotor.tail.radius, t.rotor.tail.blades, t.rotor.tail.chord, "x", 0);
  k.add("Tail bumper", new CylinderGeometry(.03, .03, .45, 10), f.steel, [0, .25, -7.3], [.4, 0, 0]);
  for (const z of [2.3, .9, -.9, -2.0, -4.0, -6.0]) k.line(`Fuselage frame line ${z}`, Array.from({ length: 25 }, (_, i) => skin(z, P * .1 + i / 24 * P * .8)), .0035);
  // Wheeled tricycle gear with sponson fairings; antennas, beacon, pitot.
  for (const side of [-1, 1]) {
    const g = t.mainGear, cy = t.groundY + g.tyreRadius, x = side * g.x;
    k.add(`Main gear sponson ${side}`, k.loft([{ z: -.1, cx: side * .95, cy: -.55, w: .05, top: .1, bot: .08 }, { z: -.6, cx: side * .98, cy: -.6, w: .22, top: .22, bot: .2, n: 2.4 }, { z: -1.4, cx: side * .98, cy: -.6, w: .22, top: .22, bot: .2, n: 2.4 }, { z: -1.9, cx: side * .95, cy: -.55, w: .05, top: .1, bot: .08 }], { perSpan: 6, sides: 28, capStart: true, capEnd: true }), f.paintLow);
    k.wheel(`Main gear ${side}`, [x, cy, g.z], g.tyreRadius, g.tyreWidth);
    k.rod(`Main oleo ${side}`, [side * .98, -.7, g.z], [x - side * .12, cy + .05, g.z], .05, f.alloy);
    k.rod(`Main axle ${side}`, [x - side * .12, cy, g.z], [x, cy, g.z], .035, f.steel);
    k.rod(`Pitot ${side}`, [side * .45, .15, 3.8], [side * .5, .17, 4.4], .012, f.steel);
  }
  const ng = t.noseGear, ncy = t.groundY + ng.tyreRadius;
  k.wheel("Nose gear", [0, ncy, ng.z], ng.tyreRadius, ng.tyreWidth);
  k.rod("Nose oleo cylinder", [0, -.7, ng.z + .05], [0, ncy + .3, ng.z], .04, f.alloy);
  k.rod("Nose oleo piston", [0, ncy + .3, ng.z], [0, ncy, ng.z], .028, f.steel);
  for (const side of [-1, 1]) k.rod(`Nose fork ${side}`, [0, ncy + .14, ng.z], [side * .08, ncy, ng.z], .016, f.alloy);
  k.add("Anti-collision beacon", new SphereGeometry(.06, 12, 8), f.red, [0, 1.47, -2.3]);
  k.add("Blade antenna", k.liftingSurface([{ s: -.75, h: 0, le: 1.0, te: .8, tc: .12 }, { s: -.95, h: 0, le: .92, te: .78, tc: .12 }], "y", 10), f.panel);
  return root;
}
