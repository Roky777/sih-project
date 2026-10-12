import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type MeshStandardMaterialParameters, Quaternion, TubeGeometry, Vector2, Vector3, type Material } from "three";
import { liftingSurface, loft, resample, sectionPoint, type Airfoil, type Section } from "./fighterGeometry";

export type Point = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolated station of a planform (stations ordered by ascending span `s`). */
export function stationAt(planform: Airfoil[], s: number): Airfoil {
  const i = Math.max(0, Math.min(planform.length - 2, planform.findIndex((st, k) => k < planform.length - 1 && s <= planform[k + 1].s)));
  const a = planform[i], b = planform[i + 1], t = (s - a.s) / (b.s - a.s);
  return { s, h: lerp(a.h, b.h, t), le: lerp(a.le, b.le, t), te: lerp(a.te, b.te, t), tc: lerp(a.tc, b.tc, t) };
}

/** Split a fuselage at station z into two section lists sharing the exact joint section, so
 *  separately lofted parts (radome / body) meet without a gap. */
export function splitAt(sections: Section[], z: number): [Section[], Section[]] {
  const rows = resample(sections, 16);
  const i = rows.findIndex(s => s.z <= z);
  const a = rows[Math.max(0, i - 1)], b = rows[i], t = a.z === b.z ? 0 : (z - a.z) / (b.z - a.z);
  const joint: Section = { z, cx: lerp(a.cx ?? 0, b.cx ?? 0, t), cy: lerp(a.cy, b.cy, t), w: lerp(a.w, b.w, t), top: lerp(a.top, b.top, t), bot: lerp(a.bot, b.bot, t), n: lerp(a.n ?? 2, b.n ?? 2, t) };
  return [[...rows.filter(s => s.z > z), joint], [joint, ...rows.filter(s => s.z < z)]];
}
/** Composite blade along +Y (root at 0): chord across X, thickness along Z, with planform
 *  taper, root cuff, washout twist and a rounded or swept tip. */
export function bladeGeometry(length: number, chord: number, { thickness = .1, twist = .6, root = .3, tipSweep = 0 } = {}) {
  const geometry = new CylinderGeometry(1, 1, length, 14, 24).translate(0, length / 2, 0);
  const p = geometry.getAttribute("position");
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), v = y / length, ang = Math.atan2(p.getZ(k), p.getX(k));
    const cuff = v < .12 ? .45 + .55 * (v / .12) : 1;
    const plan = (v < .35 ? .85 + .15 * (v / .35) : 1 - .35 * ((v - .35) / .65)) * cuff;
    const tip = v > .92 ? Math.sqrt(Math.max(0, 1 - ((v - .92) / .08) ** 2)) : 1;
    const c = chord * plan * Math.max(.18, tip) / 2, t = c * thickness * (v < .12 ? 2.4 - 1.4 * v / .12 : 1);
    let x = Math.cos(ang) * c, z = Math.sin(ang) * t;
    if (v < root * .3) { x *= .55; z = Math.sin(ang) * c * .4; }
    const pitch = twist * (1 - v);
    const sweep = tipSweep && v > .88 ? -tipSweep * ((v - .88) / .12) ** 2 : 0;
    p.setXYZ(k, x * Math.cos(pitch) - z * Math.sin(pitch) + sweep, y, x * Math.sin(pitch) + z * Math.cos(pitch));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Realistic shared finishes: matte paint, exposed metals, rubber, acrylic and cockpit trim. */
export function finishes(upper: string, lower: string) {
  const m = (name: string, color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({ name, color, metalness, roughness, ...extra });
  return {
    paint: m("Upper paint", upper, .1, .58), paintLow: m("Lower paint", lower, .1, .58), panel: m("Control surface paint", upper, .1, .55),
    radome: m("Composite radome", "#7a8286", 0, .72), antiGlare: m("Anti-glare", "#33383b", 0, .92), seam: m("Panel line", "#5f676b", .05, .8),
    steel: m("Polished steel", "#c4c9cc", .92, .22), alloy: m("Machined alloy", "#9aa0a3", .8, .38),
    burnt: m("Heat-tinted metal", "#6b6159", .9, .42, { side: DoubleSide }), soot: m("Soot", "#262422", .5, .7, { side: DoubleSide }),
    rubber: m("Tyre rubber", "#1d1e20", 0, .93), cockpit: m("Cockpit interior", "#2c3135", .1, .85), seatPad: m("Seat cushion", "#3e4637", 0, .95),
    duct: m("Duct interior", "#3a3f42", .15, .8, { side: DoubleSide }), lowVis: m("Low-visibility marking", "#6c7478", 0, .75),
    display: m("Display glass", "#0f2a26", .1, .3, { emissive: "#1f6b55", emissiveIntensity: .35 }),
    glass: new MeshPhysicalMaterial({ name: "Canopy acrylic", color: "#6f8796", roughness: .04, transparent: true, opacity: .32, clearcoat: 1, clearcoatRoughness: .03, side: DoubleSide, depthWrite: false }),
    window: new MeshPhysicalMaterial({ name: "Window glazing", color: "#1e2a33", metalness: .2, roughness: .08, clearcoat: 1, clearcoatRoughness: .05 }),
    prop: m("Propeller composite", "#2a2d30", .2, .55), propTip: m("Propeller tip", "#d9c34a", .1, .5),
    red: m("Nav light red", "#b0413c", 0, .3, { emissive: "#5e1d1a", emissiveIntensity: .4 }), green: m("Nav light green", "#3f8f69", 0, .3, { emissive: "#18412d", emissiveIntensity: .4 }),
    white: m("Light lens", "#f2efe2", 0, .2, { emissive: "#5c5a50", emissiveIntensity: .5 }),
  };
}
export type Finishes = ReturnType<typeof finishes>;

/** Builder bound to one airframe root: meshes, struts, tubes, mirrored surfaces, gear, props. */
export function kit(root: Group, f: Finishes) {
  const add = (name: string, geometry: BufferGeometry, material: Material, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const rod = (name: string, a: Point, b: Point, radius: number, material: Material = f.steel, segments = 16) => {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
    const mesh = add(name, new CylinderGeometry(radius, radius, delta.length(), segments), material);
    mesh.position.copy(start.add(end).multiplyScalar(.5)); mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
    return mesh;
  };
  const line = (name: string, points: Point[], radius = .0035, material: Material = f.seam) =>
    add(name, new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), Math.max(24, points.length * 16), radius, 5, false), material);
  /** Starboard planform mirrored to port; names end in " 1" and " -1". */
  const mirrored = (name: string, starboard: Airfoil[], material: Material, span: "x" | "y" = "x") => {
    for (const side of [-1, 1]) {
      const stations = starboard.map(st => span === "x" ? { ...st, s: st.s * side } : { ...st, h: st.h * side });
      add(`${name} ${side}`, liftingSurface(side < 0 && span === "x" ? [...stations].reverse() : stations, span), material);
    }
  };
  /** Control surfaces between span stations, hinged `chord` ahead of the trailing edge. */
  const controlSurface = (name: string, planform: Airfoil[], from: number, to: number, chord: number) => {
    for (const side of [-1, 1]) {
      const st = [from, (from + to) / 2, to].map(s => { const a = stationAt(planform, s); return { ...a, s: a.s * side, le: a.te + chord - .02, tc: a.tc * .55 }; });
      add(`${name} ${side}`, liftingSurface(side < 0 ? st.reverse() : st), f.panel);
      line(`${name} hinge ${side}`, [from, to].map(s => { const a = stationAt(planform, s); return [side * s, a.h + a.tc * chord * .9, a.te + chord - .015] as Point; }));
    }
  };
  /** Wing with a trailing edge cut back to the hinge line where control surfaces sit. */
  const wing = (planform: Airfoil[], cutFrom: number, chord: number, material: Material = f.paint) => {
    const cut = (s: number) => ({ ...stationAt(planform, s), te: stationAt(planform, s).te + chord });
    const inboard = planform.filter(st => st.s < cutFrom);
    const outboard = planform.filter(st => st.s > cutFrom + .03).map(st => ({ ...st, te: st.te + chord }));
    const stations = [...inboard, stationAt(planform, cutFrom), cut(cutFrom + .03), ...outboard];
    for (const side of [-1, 1]) {
      const st = stations.map(a => ({ ...a, s: a.s * side }));
      add(`Main wing ${side}`, liftingSurface(side < 0 ? st.reverse() : st), material).userData.planform = "public-figure approximation";
    }
  };
  /** Tyre (lathe carcass), split hub and bolts; axle along X. */
  const wheel = (name: string, centre: Point, radius: number, width: number) => {
    const tyre = new LatheGeometry(Array.from({ length: 17 }, (_, i) => {
      const a = -Math.PI / 2 + i / 16 * Math.PI, bulge = Math.cos(a);
      return new Vector2(radius * .62 + radius * .38 * bulge, Math.sin(a) * width / 2 * (1 + .12 * bulge));
    }), 56);
    add(`${name} tyre`, tyre, f.rubber, centre, [0, 0, Math.PI / 2]);
    for (const k of [-1, 1]) add(`${name} hub half ${k}`, new CylinderGeometry(radius * .6, radius * .62, width * .42, 32), f.alloy, [centre[0] + k * width * .22, centre[1], centre[2]], [0, 0, Math.PI / 2]);
    add(`${name} hub`, new CylinderGeometry(radius * .16, radius * .16, width * 1.25, 20), f.steel, centre, [0, 0, Math.PI / 2]);
  };
  /** Body of revolution along Z from [radius, z] points, centred on (x, y). */
  const latheZ = (name: string, points: [number, number][], material: Material, x = 0, y = 0, segments = 48) =>
    add(name, new LatheGeometry(points.map(([r, z]) => new Vector2(Math.max(.001, r), z)), segments), material, [x, y, 0], [Math.PI / 2, 0, 0]);
  /** Propeller: spinner with cut-outs, wide twisted composite blades with painted tips. */
  const propeller = (name: string, x: number, y: number, z: number, radius: number, blades: number, spinner = .42) => {
    latheZ(`${name} spinner`, [[.001, z + spinner * 2.3], [spinner * .45, z + spinner * 1.9], [spinner * .82, z + spinner * 1.1], [spinner, z + spinner * .25], [spinner, z - .05]], f.alloy, x, y, 64);
    latheZ(`${name} spinner bulkhead`, [[spinner * 1.02, z - .05], [spinner * .95, z - .22]], f.cockpit, x, y);
    for (let i = 0; i < blades; i++) {
      const a = i / blades * Math.PI * 2 + .2, length = radius - spinner * .7;
      const mesh = add(`${name} blade ${i}`, bladeGeometry(length, radius * .19, { thickness: .09, twist: .95 }), f.prop, [x + Math.cos(a) * spinner * .7, y + Math.sin(a) * spinner * .7, z + .08], [0, 0, a - Math.PI / 2]);
      mesh.userData.blade = true;
      const tip = bladeGeometry(length * .08, radius * .19 * .62, { thickness: .09, twist: .1 });
      add(`${name} blade tip ${i}`, tip, f.propTip, [x + Math.cos(a) * (spinner * .7 + length * .9), y + Math.sin(a) * (spinner * .7 + length * .9), z + .08], [0, 0, a - Math.PI / 2]);
    }
  };
  /** Rotor head: hub, mast, blades (axis "y" = main rotor, "x" = tail rotor). */
  const rotor = (name: string, centre: Point, radius: number, blades: number, chord: number, axis: "y" | "x", phase = 0) => {
    const [x, y, z] = centre;
    if (axis === "y") {
      add(`${name} hub`, new CylinderGeometry(.32, .38, .22, 32), f.alloy, centre);
      add(`${name} hub cap`, new CylinderGeometry(.18, .3, .16, 24), f.cockpit, [x, y + .18, z]);
    } else add(`${name} hub`, new CylinderGeometry(.14, .14, .2, 20), f.alloy, centre, [0, 0, Math.PI / 2]);
    for (let i = 0; i < blades; i++) {
      const a = phase + i / blades * Math.PI * 2, root = axis === "y" ? .32 : .12, length = radius - root;
      const geometry = bladeGeometry(length, chord, { thickness: .12, twist: axis === "y" ? .2 : .35, root: .05, tipSweep: axis === "y" ? chord * .6 : 0 });
      if (axis === "y") {
        const mesh = add(`${name} blade ${i}`, geometry, f.prop, [x + Math.sin(a) * root, y, z + Math.cos(a) * root]);
        mesh.rotation.set(Math.PI / 2, 0, 0); mesh.rotateOnWorldAxis(new Vector3(0, 1, 0), a); mesh.rotateX(-.035);
      } else add(`${name} blade ${i}`, geometry, f.prop, [x, y + Math.cos(a) * root, z + Math.sin(a) * root], [a, 0, 0]);
    }
  };
  /** Points on a lofted skin, used to lay panel lines and windows exactly on the surface. */
  const onSkin = (sections: Section[]) => {
    const skin = resample(sections, 24);
    return (z: number, angle: number, lift = .004): Point => {
      const s = skin.reduce((best, item) => Math.abs(item.z - z) < Math.abs(best.z - z) ? item : best, skin[0]);
      const [x, y] = sectionPoint({ ...s, w: s.w + lift, top: s.top + lift, bot: s.bot + lift }, angle);
      return [x, y, s.z];
    };
  };
  /** Ejection seat with headbox and firing handles. */
  const seat = (name: string, z: number, y: number) => {
    add(`${name} bucket`, loft([{ z: z + .32, cy: y, w: .22, top: .08, bot: .1, n: 4 }, { z: z - .1, cy: y, w: .23, top: .08, bot: .1, n: 4 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), f.cockpit);
    add(`${name} headrest`, loft([{ z: z - .05, cy: y + .12, w: .17, top: .11, bot: .14, n: 3.5 }, { z: z - .22, cy: y + .12, w: .18, top: .12, bot: .15, n: 3.5 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), f.seatPad);
    for (const side of [-1, 1]) rod(`${name} firing handle ${side}`, [side * .2, y + .14, z + .22], [side * .2, y + .24, z + .1], .012, new MeshStandardMaterial({ color: "#c9a227", roughness: .5 }));
  };
  return { add, rod, line, mirrored, controlSurface, wing, wheel, latheZ, propeller, rotor, onSkin, seat, loft, liftingSurface };
}
