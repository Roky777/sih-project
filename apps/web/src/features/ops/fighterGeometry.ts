import { BufferGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, type Material } from "three";

/* Light single-engine tailless compound-delta fighter, Tejas-class proportions.
   One scene unit = one metre, nose towards +Z, starboard +X, up +Y, ground at y = GROUND_Y.
   Overall dimensions follow the publicly stated Tejas Mk1 figures (length 13.2 m, span 8.2 m,
   height 4.4 m, wing area ~38.4 m²); every other station, section and part size is an informed
   approximation from public three-view drawings. It is not manufacturer CAD and must never be
   used for installation, clearance, loads or physics. */
export const GROUND_Y = -1.9;
export const FIGHTER_DIMENSIONS = { lengthM: 13.2, spanM: 8.2, heightM: 4.4, wingAreaM2: 38.4 } as const;

type Point = [number, number, number];
/** Fuselage cross-section: superellipse with separate upper/lower extents. */
export type Section = { z: number; cx?: number; cy: number; w: number; top: number; bot: number; n?: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
/** Smoothly resample a section list (Catmull-Rom per parameter). */
export function resample(sections: Section[], perSpan = 10): Section[] {
  const out: Section[] = [];
  const keys = ["z", "cx", "cy", "w", "top", "bot", "n"] as const;
  const at = (i: number) => sections[Math.max(0, Math.min(sections.length - 1, i))];
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < perSpan; k++) {
      const t = k / perSpan, s = {} as Section;
      for (const key of keys) {
        const v = (j: number) => at(j)[key] ?? (key === "n" ? 2 : 0);
        (s as Record<string, number>)[key] = key === "z" ? lerp(v(i), v(i + 1), t) : catmull(v(i - 1), v(i), v(i + 1), v(i + 2), t);
      }
      out.push(s);
    }
  }
  out.push({ n: 2, cx: 0, ...sections[sections.length - 1] });
  return out;
}
export function sectionPoint(s: Section, angle: number): [number, number] {
  const c = Math.cos(angle), sn = Math.sin(angle), e = 2 / Math.max(1.2, s.n ?? 2);
  const x = (s.cx ?? 0) + Math.max(.0005, s.w) * Math.sign(c) * Math.abs(c) ** e;
  const y = s.cy + (sn >= 0 ? s.top : s.bot) * Math.sign(sn) * Math.abs(sn) ** e;
  return [x, y];
}
/** Flip triangle winding when a probe vertex's normal points against the known outward
 *  direction, so procedurally built surfaces always shade from the outside. */
function orient(geometry: BufferGeometry, probe: number, outward: Vector3) {
  const normal = geometry.getAttribute("normal");
  if (new Vector3().fromBufferAttribute(normal, probe).dot(outward) >= 0) return geometry;
  const index = geometry.getIndex()!;
  for (let i = 0; i < index.count; i += 3) { const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a); }
  index.needsUpdate = true; geometry.computeVertexNormals();
  return geometry;
}
/** Lofted skin through cross-sections. `arc` limits the sweep (e.g. [0, π] for a canopy). */
export function loft(sections: Section[], { sides = 72, perSpan = 10, arc = [0, Math.PI * 2] as [number, number], capStart = false, capEnd = false } = {}) {
  const rows = resample(sections, perSpan), vertices: number[] = [], indices: number[] = [];
  const full = Math.abs(arc[1] - arc[0] - Math.PI * 2) < 1e-6;
  rows.forEach((s, i) => {
    for (let j = 0; j <= sides; j++) {
      const [x, y] = sectionPoint(s, lerp(arc[0], arc[1], j / sides));
      vertices.push(x, y, s.z);
      if (i < rows.length - 1 && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const cap = (row: number, flip: boolean) => {
    const s = rows[row], centre = vertices.length / 3;
    vertices.push(s.cx ?? 0, s.cy, s.z);
    for (let j = 0; j < sides; j++) {
      const a = row * (sides + 1) + j;
      if (flip) indices.push(centre, a + 1, a); else indices.push(centre, a, a + 1);
    }
  };
  if (full && capStart) cap(0, true);
  if (full && capEnd) cap(rows.length - 1, false);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const row = Math.floor(rows.length / 2), j = Math.floor(sides / 2), probe = row * (sides + 1) + j, mid = rows[row];
  const outward = new Vector3(vertices[probe * 3] - (mid.cx ?? 0), vertices[probe * 3 + 1] - mid.cy, 0);
  return outward.lengthSq() > 1e-10 ? orient(geometry, probe, outward) : geometry;
}

/** Symmetric NACA 4-digit half-thickness (closed trailing edge). */
const naca = (x: number, t: number) => 5 * t * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4);
/** Lifting-surface section: span station `s`, offset `h` normal to the span, leading/trailing
 *  edge chordwise positions (along Z) and thickness/chord ratio. */
export type Airfoil = { s: number; h: number; le: number; te: number; tc: number };
/** Thin lifting surface. "x" spans starboard (wings), "y" spans upward (fin). */
export function liftingSurface(stations: Airfoil[], span: "x" | "y" = "x", chordPoints = 28) {
  const vertices: number[] = [], indices: number[] = [];
  const ring = chordPoints * 2;
  const place = (s: number, h: number, z: number, n: number) => span === "x" ? vertices.push(s, h + n, z) : vertices.push(h + n, s, z);
  stations.forEach((st, i) => {
    const chord = st.le - st.te;
    for (let k = 0; k < ring; k++) {
      // Cosine spacing concentrates points at the leading edge.
      const upper = k < chordPoints, u = upper ? k / (chordPoints - 1) : 1 - (k - chordPoints) / (chordPoints - 1);
      const xc = (1 - Math.cos(u * Math.PI)) / 2;
      const thick = naca(xc, st.tc) * chord;
      place(st.s, st.h, st.le - xc * chord, upper ? thick : -thick);
      if (i < stations.length - 1) {
        const a = i * ring + k, b = i * ring + (k + 1) % ring, c = a + ring, d = b + ring;
        indices.push(a, c, b, b, c, d);
      }
    }
  });
  // Close root and tip.
  for (const [row, flip] of [[0, true], [stations.length - 1, false]] as const) {
    for (let k = 1; k < chordPoints - 1; k++) {
      const a = row * ring + k, b = row * ring + k + 1, c = row * ring + (ring - 1 - k), d = row * ring + (ring - 2 - k);
      if (flip) indices.push(a, b, c, b, d, c); else indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  // Upper-surface mid-chord vertex of the middle station must face "up" (+thickness axis).
  const probe = Math.floor(stations.length / 2) * ring + Math.floor(chordPoints / 2);
  return orient(geometry, probe, span === "x" ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
}

// Public-figure planform (metres). Leading-edge sweeps ~62° inboard, ~50° outboard.
const WING_Y = -.18;
export const WING_PLANFORM: Airfoil[] = [
  { s: .55, h: WING_Y + .02, le: 2.05, te: -5.35, tc: .046 },
  { s: .95, h: WING_Y, le: 1.30, te: -5.30, tc: .045 },
  { s: 2.10, h: WING_Y - .03, le: -.86, te: -5.05, tc: .042 },
  { s: 3.20, h: WING_Y - .06, le: -2.17, te: -4.78, tc: .038 },
  { s: 4.02, h: WING_Y - .08, le: -3.13, te: -4.56, tc: .035 },
];
export const ELEVON_CHORD = .62;
/** Single-piece canopy (upper half-sections on the cockpit sill). */
export const CANOPY: Section[] = [
  { z: 3.98, cy: .57, w: .05, top: .02, bot: 0, n: 2 }, { z: 3.70, cy: .57, w: .32, top: .24, bot: 0, n: 2.2 },
  { z: 3.10, cy: .58, w: .39, top: .40, bot: 0, n: 2.3 }, { z: 2.40, cy: .58, w: .39, top: .39, bot: 0, n: 2.3 },
  { z: 1.85, cy: .59, w: .34, top: .30, bot: 0, n: 2.2 }, { z: 1.45, cy: .60, w: .20, top: .14, bot: 0, n: 2 },
];
/** Fin stations (span along +Y). */
export const FIN: Airfoil[] = [
  { s: .68, h: 0, le: -1.55, te: -5.95, tc: .05 }, { s: 1.6, h: 0, le: -3.0, te: -5.75, tc: .045 }, { s: 2.5, h: 0, le: -4.45, te: -5.45, tc: .04 },
];
/** Lateral intake box, side = -1 (port) or 1 (starboard). */
export const INTAKE = (side: number): Section[] => [
  { z: 2.32, cx: side * .99, cy: -.26, w: .27, top: .35, bot: .35, n: 4.2 },
  { z: 1.70, cx: side * 1.0, cy: -.27, w: .29, top: .37, bot: .37, n: 4.2 },
  { z: .70, cx: side * .97, cy: -.27, w: .31, top: .38, bot: .38, n: 4 },
  { z: -.40, cx: side * .88, cy: -.24, w: .28, top: .34, bot: .36, n: 3.6 },
  { z: -1.40, cx: side * .74, cy: -.18, w: .2, top: .25, bot: .3, n: 3 },
];
/** Fuselage outer mould line, nose tip to nozzle shroud. */
export const FUSELAGE: Section[] = [
  { z: 6.10, cy: .04, w: .015, top: .015, bot: .015 },
  { z: 5.60, cy: .05, w: .19, top: .19, bot: .19 },
  { z: 4.95, cy: .07, w: .35, top: .35, bot: .34 },
  { z: 4.15, cy: .09, w: .47, top: .47, bot: .45, n: 2.1 },
  { z: 3.55, cy: .10, w: .54, top: .55, bot: .52, n: 2.2 },
  { z: 2.70, cy: .09, w: .60, top: .60, bot: .60, n: 2.4 },
  { z: 1.80, cy: .07, w: .66, top: .63, bot: .70, n: 2.7 },
  { z: .60, cy: .05, w: .74, top: .66, bot: .74, n: 3.0 },
  { z: -.80, cy: .05, w: .80, top: .68, bot: .72, n: 3.1 },
  { z: -2.30, cy: .06, w: .78, top: .66, bot: .66, n: 2.8 },
  { z: -3.80, cy: .07, w: .66, top: .60, bot: .58, n: 2.4 },
  { z: -5.10, cy: .07, w: .55, top: .53, bot: .52, n: 2.1 },
  { z: -6.05, cy: .07, w: .47, top: .47, bot: .47, n: 2 },
];
export const RADOME_JOINT_Z = 4.15;
/** Engine axis and the nozzle exit (exhaust plane). */
export const ENGINE_AXIS_Y = .07;
export const NOZZLE_EXIT_Z = -6.55;
export const MAIN_GEAR = { x: 1.12, z: -1.75, tyreRadius: .33, tyreWidth: .19 };
export const NOSE_GEAR = { z: 3.25, tyreRadius: .22, tyreWidth: .13 };

export function createFighterVisual() {
  const root = new Group(); root.name = "Light combat aircraft (Tejas-class proportions)";
  root.userData = {
    modelKind: "illustrative-fighter", revision: "visual-v2", engineeringValidated: false, units: "metres",
    dimensions: FIGHTER_DIMENSIONS,
    source: "Procedural geometry sized to publicly stated overall dimensions; stations and parts approximated from public three-view drawings. Not manufacturer CAD.",
  };
  // Matte two-tone air-superiority grey; metal only where metal is exposed.
  const paint = new MeshStandardMaterial({ name: "Upper camouflage grey", color: "#7c858a", metalness: .1, roughness: .58 });
  const paintLow = new MeshStandardMaterial({ name: "Lower camouflage grey", color: "#939ca0", metalness: .1, roughness: .58 });
  const panel = new MeshStandardMaterial({ name: "Control surface grey", color: "#737c81", metalness: .1, roughness: .58 });
  const radome = new MeshStandardMaterial({ name: "Composite radome", color: "#7d8589", metalness: 0, roughness: .72 });
  const antiGlare = new MeshStandardMaterial({ name: "Anti-glare", color: "#33383b", metalness: 0, roughness: .92 });
  const seam = new MeshStandardMaterial({ name: "Panel line", color: "#5f676b", metalness: .05, roughness: .8 });
  const steel = new MeshStandardMaterial({ name: "Polished steel", color: "#c4c9cc", metalness: .92, roughness: .22 });
  const alloy = new MeshStandardMaterial({ name: "Machined alloy", color: "#9aa0a3", metalness: .8, roughness: .38 });
  const burnt = new MeshStandardMaterial({ name: "Heat-tinted nozzle", color: "#6b6159", metalness: .9, roughness: .42, side: DoubleSide });
  const soot = new MeshStandardMaterial({ name: "Exhaust soot", color: "#262422", metalness: .5, roughness: .7, side: DoubleSide });
  const rubber = new MeshStandardMaterial({ name: "Tyre rubber", color: "#1d1e20", metalness: 0, roughness: .93 });
  const cockpit = new MeshStandardMaterial({ name: "Cockpit interior", color: "#2c3135", metalness: .1, roughness: .85 });
  const seatPad = new MeshStandardMaterial({ name: "Seat cushion", color: "#3e4637", metalness: 0, roughness: .95 });
  const intakeDark = new MeshStandardMaterial({ name: "Intake duct", color: "#3a3f42", metalness: .15, roughness: .8, side: DoubleSide });
  const glass = new MeshPhysicalMaterial({ name: "Canopy acrylic", color: "#6f8796", metalness: 0, roughness: .04, transmission: 0, transparent: true, opacity: .32, clearcoat: 1, clearcoatRoughness: .03, side: DoubleSide, depthWrite: false });
  const display = new MeshStandardMaterial({ name: "MFD glass", color: "#0f2a26", emissive: "#1f6b55", emissiveIntensity: .35, roughness: .3 });
  const lowVis = new MeshStandardMaterial({ name: "Low-visibility marking", color: "#6c7478", metalness: 0, roughness: .75 });

  const add = (name: string, geometry: BufferGeometry, material: Material, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const rod = (name: string, a: Point, b: Point, radius: number, material: Material = steel, radialSegments = 16) => {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
    const mesh = add(name, new CylinderGeometry(radius, radius, delta.length(), radialSegments), material);
    mesh.position.copy(start.add(end).multiplyScalar(.5)); mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
    return mesh;
  };
  const line = (name: string, points: Point[], radius = .0035, material: Material = seam) =>
    add(name, new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), Math.max(24, points.length * 16), radius, 5, false), material);
  // Points on the fuselage skin, used to lay panel lines exactly on the surface.
  const skin = resample(FUSELAGE, 24);
  const skinAt = (z: number) => skin.reduce((best, s) => Math.abs(s.z - z) < Math.abs(best.z - z) ? s : best, skin[0]);
  const onSkin = (z: number, angle: number, lift = .004): Point => { const s = skinAt(z); const [x, y] = sectionPoint({ ...s, w: s.w + lift, top: s.top + lift, bot: s.bot + lift }, angle); return [x, y, s.z]; };

  // Fuselage: composite radome + metallic centre/aft body, upper/lower paint split at the chine.
  const body = FUSELAGE.filter(s => s.z <= RADOME_JOINT_Z);
  add("Continuous shaped fuselage", loft(body, { arc: [0, Math.PI], perSpan: 9 }), paint);
  add("Fuselage lower skin", loft(body, { arc: [Math.PI, Math.PI * 2], perSpan: 9 }), paintLow);
  add("Tapered radar nose visual", loft(FUSELAGE.filter(s => s.z >= RADOME_JOINT_Z - .001), { perSpan: 14 }), radome);
  line("Radome joint", Array.from({ length: 49 }, (_, i) => onSkin(RADOME_JOINT_Z, i / 48 * Math.PI * 2, .006)), .005);
  // Anti-glare panel ahead of the windscreen.
  add("Anti-glare panel", loft([
    { z: 4.55, cy: .09, w: .30, top: .465, bot: 0 }, { z: 4.25, cy: .095, w: .40, top: .49, bot: 0 }, { z: 3.98, cy: .1, w: .44, top: .515, bot: 0 },
  ].map(s => ({ ...s, w: s.w, top: s.top + .004 })), { arc: [Math.PI * .28, Math.PI * .72], perSpan: 6 }), antiGlare);
  // Pitot boom and air-data probes.
  rod("Nose pitot visual", [0, .04, 6.06], [0, .04, 6.62], .016, steel).position.z = 6.34;
  rod("Pitot tip", [0, .04, 6.62], [0, .04, 6.72], .007, steel);
  for (const side of [-1, 1]) rod(`AoA vane ${side}`, [side * .33, .02, 4.9], [side * .43, .02, 4.82], .008, steel);
  // Fixed in-flight refuelling probe (starboard, ahead of the windscreen).
  rod("Refuelling probe", [.5, .32, 3.4], [.42, .36, 5.0], .035, alloy);
  add("Refuelling probe nozzle", new SphereGeometry(.05, 16, 12), steel, [.42, .36, 5.03]);

  // Canopy: one-piece bubble on the cockpit sill with windscreen bow and sill rails.
  const canopy = CANOPY;
  const glassMesh = add("Cockpit glazed canopy", loft(canopy, { arc: [0, Math.PI], perSpan: 10, sides: 48 }), glass);
  glassMesh.position.y = .0001; glassMesh.castShadow = false; glassMesh.renderOrder = 2;
  const canopyRow = resample(canopy, 8);
  const bow = canopyRow.reduce((best, s) => Math.abs(s.z - 3.55) < Math.abs(best.z - 3.55) ? s : best);
  line("Windscreen bow", Array.from({ length: 33 }, (_, i) => { const [x, y] = sectionPoint({ ...bow, w: bow.w + .006, top: bow.top + .006 }, i / 32 * Math.PI); return [x, y, bow.z]; }), .022, cockpit);
  for (const side of [-1, 1]) line(`Canopy sill rail ${side}`, canopyRow.map(s => [side * (s.w + .012), s.cy + .01, s.z]), .016, cockpit);
  // Spine fairing behind the canopy into the fin root.
  add("Dorsal spine", loft([
    { z: 1.55, cy: .62, w: .16, top: .1, bot: .05 }, { z: .4, cy: .66, w: .22, top: .12, bot: .06, n: 2.4 },
    { z: -1.2, cy: .68, w: .22, top: .11, bot: .06, n: 2.4 }, { z: -2.6, cy: .66, w: .16, top: .08, bot: .05 },
  ], { perSpan: 10, sides: 40, capStart: true, capEnd: true }), paint);
  for (const z of [.0, -1.0]) add(`Blade antenna ${z}`, liftingSurface([{ s: .74, h: 0, le: z + .1, te: z - .06, tc: .12 }, { s: .88, h: 0, le: z + .01, te: z - .08, tc: .12 }], "y", 10), panel);
  add("Ventral blade antenna", liftingSurface([{ s: -.62, h: 0, le: 1.2, te: 1.0, tc: .12 }, { s: -.80, h: 0, le: 1.12, te: .98, tc: .12 }], "y", 10), cockpit);

  // Cockpit interior visible through the canopy: ejection seat, panel, displays, HUD, stick.
  add("Cockpit tub floor", loft([{ z: 3.85, cy: .5, w: .30, top: .02, bot: .02 }, { z: 1.8, cy: .5, w: .30, top: .02, bot: .02 }], { perSpan: 2, sides: 16 }), cockpit);
  add("Instrument panel", loft([{ z: 3.62, cy: .62, w: .29, top: .12, bot: .08, n: 4 }, { z: 3.52, cy: .62, w: .29, top: .12, bot: .08, n: 4 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), cockpit);
  for (const x of [-.17, 0, .17]) add(`Multi-function display ${x}`, new CircleGeometry(.075, 4), display, [x, .64, 3.505], [0, Math.PI, Math.PI / 4]);
  add("HUD combiner", new CircleGeometry(.08, 4), new MeshPhysicalMaterial({ color: "#7fb3a3", transparent: true, opacity: .25, roughness: .05, side: DoubleSide }), [0, .82, 3.6], [-.5, 0, Math.PI / 4], [1.4, 1, 1]);
  const seatZ = 2.55;
  add("Ejection seat bucket", loft([{ z: seatZ + .32, cy: .62, w: .22, top: .08, bot: .1, n: 4 }, { z: seatZ - .1, cy: .62, w: .23, top: .08, bot: .1, n: 4 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), cockpit);
  add("Cockpit seat headrest", loft([{ z: seatZ - .05, cy: .74, w: .17, top: .11, bot: .14, n: 3.5 }, { z: seatZ - .22, cy: .74, w: .18, top: .12, bot: .15, n: 3.5 }], { perSpan: 1, sides: 24, capStart: true, capEnd: true }), seatPad);
  add("Seat drogue container", loft([{ z: seatZ - .14, cy: .87, w: .12, top: .025, bot: .025, n: 3 }, { z: seatZ - .26, cy: .87, w: .12, top: .025, bot: .025, n: 3 }], { perSpan: 1, sides: 20, capStart: true, capEnd: true }), lowVis);
  for (const side of [-1, 1]) rod(`Seat firing handle ${side}`, [side * .2, .76, seatZ + .22], [side * .2, .86, seatZ + .1], .012, new MeshStandardMaterial({ color: "#c9a227", roughness: .5 }));
  rod("Control stick", [0, .58, 3.05], [0, .78, 3.12], .02, cockpit);

  // Intakes: lateral boxes with splitter plates, rounded lips and dark inner ducts.
  for (const side of [-1, 1]) {
    const intake = INTAKE(side);
    add(`Side intake fairing ${side}`, loft(intake, { perSpan: 10, sides: 56 }), paintLow);
    const lip = resample(intake, 1)[0];
    line(`Intake rolled lip ${side}`, Array.from({ length: 57 }, (_, i) => { const [x, y] = sectionPoint(lip, i / 56 * Math.PI * 2); return [x, y, lip.z + .005]; }), .018, alloy);
    add(`Dark recessed intake mouth ${side}`, loft(intake.slice(0, 3).map(s => ({ ...s, w: s.w - .025, top: s.top - .025, bot: s.bot - .025 })), { perSpan: 6, sides: 40 }), intakeDark);
    add(`Intake duct throat ${side}`, new CircleGeometry(1, 40), soot, [side * .99, -.27, 1.2], [0, 0, 0], [.24, .32, 1]);
    // Boundary-layer splitter plate standing off the fuselage side.
    add(`Intake splitter ${side}`, liftingSurface([{ s: -.55, h: side * .705, le: 2.48, te: 1.55, tc: .02 }, { s: .02, h: side * .705, le: 2.42, te: 1.6, tc: .02 }], "y", 8), alloy);
    add(`Intake nav light ${side}`, new SphereGeometry(.025, 12, 8), new MeshStandardMaterial({ color: side < 0 ? "#b0413c" : "#3f8f69", emissive: side < 0 ? "#5e1d1a" : "#18412d", emissiveIntensity: .4, roughness: .3 }), [side * 1.27, -.18, 1.9]);
  }

  // Wings: thin NACA sections, separate elevons, slat line and wingtip launch rails.
  for (const side of [-1, 1]) {
    const mirror = (stations: Airfoil[]) => stations.map(st => ({ ...st, s: st.s * side }));
    const sorted = (stations: Airfoil[]) => side < 0 ? [...stations].reverse() : stations;
    // Full chord inboard of the elevons, hinge-line trailing edge outboard of them.
    const step = (s: number) => { const a = WING_PLANFORM[1], b = WING_PLANFORM[2], t = (s - a.s) / (b.s - a.s); return { s, h: lerp(a.h, b.h, t), le: lerp(a.le, b.le, t), te: lerp(a.te, b.te, t), tc: lerp(a.tc, b.tc, t) }; };
    const main = [...WING_PLANFORM.slice(0, 2), step(1.0), { ...step(1.03), te: step(1.03).te + ELEVON_CHORD }, ...WING_PLANFORM.slice(2).map(st => ({ ...st, te: st.te + ELEVON_CHORD }))];
    const wing = add(`Compound delta wing ${side}`, liftingSurface(sorted(mirror(main))), paint);
    wing.userData.planform = "public-figure approximation";
    const hinge = (st: Airfoil) => ({ ...st, le: st.te + ELEVON_CHORD - .02 });
    const interpolate = (s: number) => {
      const i = Math.max(0, WING_PLANFORM.findIndex((st, k) => k < WING_PLANFORM.length - 1 && s >= st.s && s <= WING_PLANFORM[k + 1].s));
      const a = WING_PLANFORM[i], b = WING_PLANFORM[i + 1], t = (s - a.s) / (b.s - a.s);
      return { s, h: lerp(a.h, b.h, t), le: lerp(a.le, b.le, t), te: lerp(a.te, b.te, t), tc: lerp(a.tc, b.tc, t) * .7 };
    };
    for (const [name, from, to] of [["inboard", 1.05, 2.45], ["outboard", 2.52, 3.92]] as const) {
      add(`Elevon ${name} ${side}`, liftingSurface(sorted(mirror([hinge(interpolate(from)), hinge(interpolate((from + to) / 2)), hinge(interpolate(to))]))), panel);
      line(`Elevon hinge ${name} ${side}`, [interpolate(from), interpolate(to)].map(st => [side * st.s, st.h + .012, st.te + ELEVON_CHORD - .015]), .004);
    }
    // Leading-edge slat break and wing access panels drawn on the upper skin.
    line(`Leading-edge slat line ${side}`, [2.15, 3.95].map(s => { const st = interpolate(s); return [side * s, st.h + .022, st.le - .32]; }), .0035);
    line(`Wing fuel panel ${side}`, ([[1.3, -1.6], [2.3, -2.3], [2.25, -3.5], [1.25, -3.6], [1.3, -1.6]] as const).map(([s, z]) => [side * s, interpolate(s).h + .03, z]), .003);
    // Wingtip rail and a nav/formation light.
    const tip = WING_PLANFORM[WING_PLANFORM.length - 1];
    add(`Wingtip launch rail ${side}`, loft([
      { z: tip.le + .25, cx: side * (tip.s + .06), cy: tip.h, w: .012, top: .012, bot: .012 }, { z: tip.le - .05, cx: side * (tip.s + .06), cy: tip.h, w: .05, top: .045, bot: .06, n: 3 },
      { z: tip.te + .05, cx: side * (tip.s + .06), cy: tip.h, w: .05, top: .045, bot: .06, n: 3 }, { z: tip.te - .05, cx: side * (tip.s + .06), cy: tip.h, w: .02, top: .02, bot: .03 },
    ], { perSpan: 6, sides: 24, capEnd: true }), alloy);
    add(`Wingtip navigation lens ${side}`, new SphereGeometry(.03, 12, 8), new MeshStandardMaterial({ color: side < 0 ? "#b0413c" : "#3f8f69", emissive: side < 0 ? "#5e1d1a" : "#18412d", emissiveIntensity: .35, roughness: .3 }), [side * (tip.s + .06), tip.h + .05, tip.te]);
    // Three underwing pylons per side (aerodynamic, with sway braces).
    for (const s of [1.55, 2.45, 3.25]) {
      const st = interpolate(s), mid = (st.le + st.te) / 2 + .1, length = Math.min(1.6, (st.le - st.te) * .62);
      const py = add(`Underwing pylon ${side}-${s}`, liftingSurface([{ s: st.h - .03, h: side * s, le: mid + length / 2, te: mid - length / 2, tc: .09 }, { s: st.h - .26, h: side * s, le: mid + length / 2 - .12, te: mid - length / 2 + .05, tc: .09 }], "y", 14), paintLow);
      py.userData.empty = true;
      for (const dz of [-.22, .22]) rod(`Sway brace ${side}-${s}-${dz}`, [side * s - .05, st.h - .27, mid + dz], [side * s + .05, st.h - .27, mid + dz], .012, alloy);
    }
    // Low-visibility roundel on the upper wing.
    add(`Low-visibility roundel ${side}`, new CircleGeometry(.24, 40), lowVis, [side * 2.7, interpolate(2.7).h + .04, -3.2], [-Math.PI / 2, 0, 0]);
  }
  // Centreline pylon.
  add("Centreline pylon", liftingSurface([{ s: -.7, h: 0, le: .2, te: -1.2, tc: .09 }, { s: -.94, h: 0, le: .05, te: -1.05, tc: .09 }], "y", 14), paintLow);

  // Fin and rudder; drag-chute housing at the fin base; dorsal airbrakes.
  const fin = FIN;
  add("Single swept vertical fin", liftingSurface(fin.map(st => ({ ...st, te: st.s < 2.2 ? st.te + .55 : st.te })), "y"), paint);
  add("Rudder", liftingSurface([{ s: .95, h: 0, le: -5.37, te: -5.92, tc: .035 }, { s: 1.6, h: 0, le: -5.18, te: -5.73, tc: .035 }, { s: 2.18, h: 0, le: -5.0, te: -5.55, tc: .035 }], "y"), panel);
  line("Rudder hinge", [[.02, .98, -5.36], [.02, 2.17, -4.99]], .0035);
  add("Drag chute housing", loft([
    { z: -5.15, cy: .78, w: .1, top: .11, bot: .02 }, { z: -5.6, cy: .78, w: .14, top: .14, bot: .02, n: 2.6 }, { z: -6.25, cy: .76, w: .14, top: .14, bot: .02, n: 2.6 },
  ], { perSpan: 6, sides: 36, capStart: true, capEnd: true }), paint);
  for (const side of [-1, 1]) {
    line(`Airbrake outline ${side}`, ([[-3.2, .48], [-4.1, .5], [-4.1, .8], [-3.2, .78], [-3.2, .48]] as const).map(([z, a]) => onSkin(z, Math.PI / 2 - side * a)), .0035);
  }

  // Panel lines on the fuselage: frames and longitudinal seams.
  for (const z of [3.0, 1.6, .2, -1.4, -3.0, -4.6]) {
    line(`Fuselage frame line ${z}`, Array.from({ length: 25 }, (_, i) => onSkin(z, Math.PI * .08 + i / 24 * Math.PI * .84)), .0032);
  }
  for (const side of [-1, 1]) line(`Upper longitudinal seam ${side}`, [3.6, 2.0, .0, -2.0, -4.0, -5.8].map(z => onSkin(z, Math.PI / 2 - side * .62)), .0032);
  line("Gun port fairing", [onSkin(1.4, -Math.PI * .1, .02), onSkin(.5, -Math.PI * .12, .02)], .022, antiGlare);

  // Exhaust: shroud, convergent-divergent petals, afterburner liner, flameholder and turbine cone.
  const nozzle = (z: number, r: number) => new Vector2(r, z);
  add("Nozzle shroud", new LatheGeometry([nozzle(-6.0, .47), nozzle(-6.2, .455), nozzle(-6.33, .44)], 64), burnt, [0, ENGINE_AXIS_Y, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, b = (i + .86) / 16 * Math.PI * 2, r0 = .435, r1 = .385;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
      Math.cos(a) * r0, Math.sin(a) * r0 + ENGINE_AXIS_Y, -6.32, Math.cos(b) * r0, Math.sin(b) * r0 + ENGINE_AXIS_Y, -6.32,
      Math.cos(a) * r1, Math.sin(a) * r1 + ENGINE_AXIS_Y, NOZZLE_EXIT_Z, Math.cos(b) * r1, Math.sin(b) * r1 + ENGINE_AXIS_Y, NOZZLE_EXIT_Z,
    ], 3));
    geometry.setIndex([0, 2, 1, 1, 2, 3]); geometry.computeVertexNormals();
    add(`Nozzle petal ${i}`, geometry, i % 2 ? burnt : alloy);
  }
  add("Afterburner liner", new CylinderGeometry(.37, .37, 1.1, 48, 1, true), soot, [0, ENGINE_AXIS_Y, -5.95], [Math.PI / 2, 0, 0]);
  add("Flameholder ring", new TorusGeometry(.22, .02, 8, 40), alloy, [0, ENGINE_AXIS_Y, -5.55]);
  add("Turbine exhaust cone", new LatheGeometry([new Vector2(.001, -5.75), new Vector2(.1, -5.55), new Vector2(.16, -5.3)], 32), soot, [0, ENGINE_AXIS_Y, 0], [Math.PI / 2, 0, 0]);
  const cavity = add("Exhaust dark inner cavity", new CircleGeometry(.37, 48), soot, [0, ENGINE_AXIS_Y, -5.4], [0, Math.PI, 0]);
  cavity.castShadow = false;

  // Landing gear (extended): main gear with oleo, torque links, side brace, retraction jack and
  // multi-spoke hubs; steerable nose gear with taxi light. Tyres sit on GROUND_Y.
  const wheel = (name: string, centre: Point, radius: number, width: number) => {
    const tyre = new LatheGeometry(Array.from({ length: 17 }, (_, i) => {
      const a = -Math.PI / 2 + i / 16 * Math.PI, bulge = Math.cos(a);
      return new Vector2(radius * .62 + radius * .38 * bulge, Math.sin(a) * width / 2 * (1 + .12 * bulge));
    }), 56);
    add(`${name} tyre`, tyre, rubber, centre, [0, 0, Math.PI / 2]);
    for (const k of [-1, 1]) add(`${name} hub half ${k}`, new CylinderGeometry(radius * .6, radius * .62, width * .42, 32), alloy, [centre[0] + k * width * .22, centre[1], centre[2]], [0, 0, Math.PI / 2]);
    add(`${name} hub`, new CylinderGeometry(radius * .16, radius * .16, width * 1.25, 20), steel, centre, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(`${name} hub bolt ${i}`, new CylinderGeometry(.012, .012, width * 1.1, 8), steel, [centre[0], centre[1] + Math.cos(a) * radius * .36, centre[2] + Math.sin(a) * radius * .36], [0, 0, Math.PI / 2]); }
  };
  for (const side of [-1, 1]) {
    const g = MAIN_GEAR, cy = GROUND_Y + g.tyreRadius, x = side * g.x;
    const top: Point = [side * .78, -.62, g.z + .1];
    wheel(`Main gear ${side}`, [x, cy, g.z], g.tyreRadius, g.tyreWidth);
    rod(`Main oleo cylinder ${side}`, top, [x - side * .12, cy + .55, g.z], .06, alloy);
    rod(`Main oleo piston ${side}`, [x - side * .12, cy + .56, g.z], [x - side * .12, cy + .1, g.z], .038, steel);
    rod(`Main axle ${side}`, [x - side * .12, cy, g.z], [x, cy, g.z], .04, steel);
    rod(`Main torque link upper ${side}`, [x - side * .12, cy + .5, g.z - .07], [x - side * .12, cy + .3, g.z - .17], .015, alloy);
    rod(`Main torque link lower ${side}`, [x - side * .12, cy + .3, g.z - .17], [x - side * .12, cy + .12, g.z - .06], .015, alloy);
    rod(`Main side brace ${side}`, [side * .55, -.68, g.z - .55], [x - side * .12, cy + .45, g.z], .028, alloy);
    rod(`Main retraction jack ${side}`, [side * .5, -.6, g.z + .55], [x - side * .12, cy + .62, g.z], .026, steel);
    add(`Main gear door ${side}`, liftingSurface([{ s: -.66, h: side * .86, le: g.z + .65, te: g.z - .55, tc: .03 }, { s: -1.22, h: side * .92, le: g.z + .5, te: g.z - .5, tc: .03 }], "y", 10), paintLow);
  }
  const ng = NOSE_GEAR, ncy = GROUND_Y + ng.tyreRadius;
  wheel("Nose gear", [0, ncy, ng.z], ng.tyreRadius, ng.tyreWidth);
  rod("Nose oleo cylinder", [0, -.42, ng.z + .12], [0, ncy + .55, ng.z + .04], .045, alloy);
  rod("Nose oleo piston", [0, ncy + .56, ng.z + .04], [0, ncy + .14, ng.z], .03, steel);
  add("Nose steering collar", new TorusGeometry(.055, .018, 10, 24), alloy, [0, ncy + .62, ng.z + .05], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) rod(`Nose fork ${side}`, [0, ncy + .16, ng.z], [side * .1, ncy, ng.z], .02, alloy);
  rod("Nose drag brace", [0, -.4, ng.z - .55], [0, ncy + .4, ng.z + .03], .022, alloy);
  add("Taxi light", new CylinderGeometry(.04, .04, .03, 20), new MeshStandardMaterial({ color: "#f2efe2", emissive: "#5c5a50", emissiveIntensity: .5, roughness: .2 }), [0, ncy + .7, ng.z + .1], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) add(`Nose bay door ${side}`, liftingSurface([{ s: -.48, h: side * .17, le: ng.z + .55, te: ng.z - .35, tc: .03 }, { s: -.8, h: side * .18, le: ng.z + .5, te: ng.z - .3, tc: .03 }], "y", 8), paintLow);

  return root;
}
