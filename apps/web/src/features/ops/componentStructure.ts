import { BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, TorusGeometry, Vector2, type Material } from "three";
import type { StructureKind } from "./componentArchitecture";

const HEALTHY_COLOR = "#76d5b1";

/* Representative assemblies of each component type, modelled the way such parts are built
   (bladed spools, piston pumps, wound stators, multi-disc brakes, card-cage avionics…).
   Proportions are typical, not taken from any manufacturer drawing: no dimensional, damage or
   fault-location claim. Long axis is X; the cutaway scales each assembly to its real size. */
export function createComponentStructure(kind: StructureKind, exploded: boolean, wireframe: boolean, color: string) {
  const group = new Group();
  group.userData = { engineeringValidated: false, units: "normalised assembly units", kind };
  const mat = (hex: string, metalness: number, roughness: number, extra: Partial<MeshStandardMaterial> = {}) =>
    Object.assign(new MeshStandardMaterial({ color: hex, metalness, roughness, wireframe }), extra);
  const titanium = mat("#a9b0b5", .85, .32), steel = mat("#c7ccd0", .92, .2), alloy = mat("#9aa3a8", .78, .38);
  const dark = mat("#3b4248", .45, .6), anodised = mat("#4f5d66", .6, .45), copper = mat("#b46f3d", .9, .32);
  const nickel = mat("#8d8478", .88, .36), carbon = mat("#2a2b2d", .2, .75), pcb = mat("#2f6a4c", .1, .6), rubber = mat("#1f2022", 0, .92);
  // Healthy parts keep their real finish; maintenance / attention states colour the key parts.
  const highlight = color.toLowerCase() === HEALTHY_COLOR ? mat("#b9bec2", .85, .3) : mat(color, .45, .4);
  const shell = mat("#7fa3b8", .3, .4, { transparent: true, opacity: wireframe ? 1 : .2, side: DoubleSide, depthWrite: false });
  const spread = exploded ? 1 : 0;
  const add = (name: string, geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0, rotation: [number, number, number] = [0, 0, 0]) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.set(...rotation); group.add(mesh); return mesh;
  };
  /** Body of revolution about X from [radius, x] points. `phi` < 2π gives a cutaway shell. */
  const lathe = (name: string, points: [number, number][], material: Material, x = 0, phi = Math.PI * 2, segments = 64) => {
    const geometry = new LatheGeometry(points.map(([r, px]) => new Vector2(Math.max(.001, r), px)), segments, Math.PI / 2, phi).rotateZ(-Math.PI / 2);
    return add(name, geometry, material, x);
  };
  const cylinderX = (name: string, radius: number, length: number, x = 0, material: Material = alloy, open = false, y = 0, z = 0, segments = 40) =>
    add(name, new CylinderGeometry(radius, radius, length, segments, 1, open), material, x, y, z, [0, 0, Math.PI / 2]);
  const ringX = (name: string, radius: number, tube: number, x: number, material: Material = alloy) => add(name, new TorusGeometry(radius, tube, 12, 64), material, x, 0, 0, [0, Math.PI / 2, 0]);
  const instanced = (name: string, geometry: BufferGeometry, material: Material, matrices: Matrix4[]) => {
    const mesh = new InstancedMesh(geometry, material, matrices.length); mesh.name = name;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh); return mesh;
  };
  const pose = new Object3D();
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { pose.position.set(x, y, z); pose.rotation.set(rx, ry, rz); pose.updateMatrix(); return pose.matrix.clone(); };
  /** Bolt circle around X at station x. */
  const bolts = (name: string, x: number, radius: number, count: number, size = .025, material: Material = steel) =>
    instanced(name, new CylinderGeometry(size, size, size * 2.4, 8), material, Array.from({ length: count }, (_, i) => { const a = i / count * Math.PI * 2; return at(x, Math.cos(a) * radius, Math.sin(a) * radius, 0, 0, Math.PI / 2); }));
  /** Twisted aerofoil blade row (one InstancedMesh per row). */
  const bladeRow = (name: string, x: number, hub: number, tip: number, count: number, chord: number, twist: number, material: Material, lean = .35) => {
    const span = tip - hub, blade = new BoxGeometry(chord, span, chord * .12, 3, 6, 1);
    const p = blade.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + span / 2) / span, a = lean + twist * (v - .5), cx = p.getX(i), cz = p.getZ(i) * (1 - .55 * Math.abs(cx / chord * 2));
      p.setXYZ(i, cx * Math.cos(a) - cz * Math.sin(a), p.getY(i) + hub + span / 2, cx * Math.sin(a) + cz * Math.cos(a));
    }
    blade.computeVertexNormals();
    return instanced(name, blade, material, Array.from({ length: count }, (_, i) => at(x, 0, 0, i / count * Math.PI * 2, 0, 0)));
  };

  if (kind === "compressor") {
    // Fan (3 stages) + HP compressor (7 stages) on concentric spools inside a split casing.
    lathe("Spinner", [[.001, -1.42], [.12, -1.32], [.22, -1.18], [.26, -1.08]], titanium, -spread * .7);
    bladeRow("Inlet guide vanes", -1.0 - spread * .55, .26, .86, 24, .12, .2, alloy, 0);
    const fan = [-.84, -.62, -.42];
    fan.forEach((x, i) => {
      cylinderX(i === 0 ? "Rotor disc" : `Fan disc ${i + 1}`, .3, .07, x - spread * (.42 - i * .1), highlight);
      bladeRow(`Fan blades stage ${i + 1}`, x - spread * (.42 - i * .1), .3, .84 - i * .05, 28 - i * 2, .17, .9, titanium);
      if (i < 2) bladeRow(`Fan stator row ${i + 1}`, x + .11 - spread * (.36 - i * .1), .32, .82 - i * .05, 36, .07, .2, alloy, -.25);
    });
    for (let s = 0; s < 7; s++) {
      const x = -.18 + s * .17 + spread * (s * .08), tip = .55 - s * .022, hub = .36 + s * .012;
      cylinderX(`HPC disc ${s + 1}`, hub, .05, x, highlight);
      bladeRow(`HPC rotor stage ${s + 1}`, x, hub, tip, 40 + s * 4, .07, .5, titanium);
      bladeRow(`HPC stator row ${s + 1}`, x + .085, hub + .02, tip, 48 + s * 4, .045, .15, nickel, -.3);
    }
    cylinderX("Spool shaft", .09, 3.2, .05, dark);
    lathe("Cutaway casing", [[.9, -1.1], [.88, -.3], [.6, -.1], [.58, 1.05]], shell, 0, Math.PI * 1.25);
    for (const [x, r] of [[-1.08, .9], [-.2, .62], [1.05, .6]] as const) { ringX(x === -1.08 ? "Front casing flange" : x === 1.05 ? "Rear casing flange" : "Fan/HPC split flange", r, .025, x + (x < 0 ? -spread * .5 : spread * .7)); bolts("Flange bolts", x + (x < 0 ? -spread * .5 : spread * .7), r, 36); }
  } else if (kind === "turbine") {
    // Annular combustor, HP/LP turbine stages, rear frame and exhaust cone.
    lathe("Combustor liner", [[.36, -1.0], [.5, -.92], [.52, -.55], [.46, -.38]], nickel, -spread * .7, Math.PI * 1.4);
    lathe("Combustor inner liner", [[.24, -1.0], [.25, -.4]], nickel, -spread * .7, Math.PI * 1.4);
    instanced("Fuel nozzles", new CylinderGeometry(.018, .018, .16, 10), steel, Array.from({ length: 18 }, (_, i) => { const a = i / 18 * Math.PI * 2; return at(-1.02 - spread * .75, Math.cos(a) * .43, Math.sin(a) * .43, 0, 0, Math.PI / 2); }));
    bladeRow("Nozzle guide vanes", -.3 - spread * .3, .3, .5, 40, .1, .1, nickel, -.6);
    cylinderX("Rotor disc", .3, .1, -.12, highlight); cylinderX("HP turbine disc", .3, .1, -.12, highlight);
    bladeRow("HP turbine blades", -.12, .3, .5, 64, .07, .3, nickel, .7);
    bladeRow("LP nozzle guide vanes", .08 + spread * .2, .3, .55, 44, .09, .1, nickel, -.6);
    cylinderX("LP turbine disc", .28, .1, .26 + spread * .4, highlight);
    bladeRow("LP turbine blades", .26 + spread * .4, .28, .58, 72, .07, .45, nickel, .7);
    instanced("Rear frame struts", new BoxGeometry(.18, .32, .03), alloy, Array.from({ length: 8 }, (_, i) => at(.55 + spread * .65, Math.cos(i / 8 * Math.PI * 2) * .42, Math.sin(i / 8 * Math.PI * 2) * .42, i / 8 * Math.PI * 2)));
    lathe("Exhaust cone", [[.26, .45], [.22, .75], [.1, 1.0], [.001, 1.08]], dark, spread * .7);
    cylinderX("Spool shaft", .08, 2.3, 0, dark);
    lathe("Cutaway casing", [[.6, -1.05], [.62, -.35], [.62, .3], [.66, .7]], shell, 0, Math.PI * 1.25);
    for (const x of [-1.05, .7]) { ringX(x < 0 ? "Front casing flange" : "Rear casing flange", x < 0 ? .6 : .66, .025, x + (x < 0 ? -spread * .5 : spread * .7)); bolts("Flange bolts", x + (x < 0 ? -spread * .5 : spread * .7), x < 0 ? .6 : .66, 32); }
  } else if (kind === "pump") {
    // Variable-displacement axial-piston pump.
    lathe("Housing", [[.42, -.55], [.46, -.4], [.46, .45], [.36, .6]], shell, 0, Math.PI * 1.35);
    cylinderX("Mounting flange", .58, .05, -.6 - spread * .3, alloy); bolts("Flange bolts", -.6 - spread * .3, .52, 6, .03);
    cylinderX("Drive spline", .08, .5, -.85 - spread * .6, steel);
    cylinderX("Cylinder barrel", .3, .5, .05, highlight);
    instanced("Pistons", new CylinderGeometry(.055, .055, .62, 16), steel, Array.from({ length: 9 }, (_, i) => { const a = i / 9 * Math.PI * 2; return at(.02 + spread * .25, Math.cos(a) * .19, Math.sin(a) * .19, 0, 0, Math.PI / 2); }));
    add("Swash plate", new CylinderGeometry(.36, .36, .06, 40), anodised, -.32 - spread * .3, 0, 0, [0, 0, Math.PI / 2 + .28]);
    add("Port block", new BoxGeometry(.3, .7, .62), alloy, .62 + spread * .4);
    for (const side of [-1, 1]) add("Service port", new CylinderGeometry(.07, .07, .2, 20), highlight, .62 + spread * .4, side * .42, 0);
    add("Pressure compensator", new CylinderGeometry(.09, .09, .4, 20), anodised, .3, .52 + spread * .3, 0, [0, 0, Math.PI / 2]);
  } else if (kind === "generator") {
    // Brushless generator: laminated stator, windings, salient-pole rotor, fan, end bells.
    lathe("Stator casing", [[.5, -.62], [.52, -.5], [.52, .5], [.5, .62]], shell, 0, Math.PI * 1.3);
    instanced("Stator laminations", new CylinderGeometry(.47, .47, .012, 48, 1, true), alloy, Array.from({ length: 32 }, (_, i) => at(-.4 + i * .026, 0, 0, 0, 0, Math.PI / 2)));
    instanced("Stator windings", new TorusGeometry(.07, .028, 8, 16), copper, Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return at(-.45, Math.cos(a) * .38, Math.sin(a) * .38, a, Math.PI / 2, 0); }).concat(Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return at(.45, Math.cos(a) * .38, Math.sin(a) * .38, a, Math.PI / 2, 0); })));
    cylinderX("Rotor", .2, .82, spread * .5, highlight);
    instanced("Rotor poles", new BoxGeometry(.8, .1, .16), copper, Array.from({ length: 6 }, (_, i) => at(spread * .5, Math.cos(i / 6 * Math.PI * 2) * .25, Math.sin(i / 6 * Math.PI * 2) * .25, i / 6 * Math.PI * 2)));
    bladeRow("Cooling fan", .7 + spread * .7, .1, .4, 14, .12, .1, alloy, .5);
    cylinderX("Drive shaft", .07, 1.8, -.1 + spread * .5, steel);
    for (const x of [-.66, .66]) lathe("End bell", x < 0 ? [[.12, -.06], [.5, -.02], [.52, .03]] : [[.52, -.03], [.5, .02], [.12, .06]], alloy, x + Math.sign(x) * spread * .55, Math.PI * 1.3);
    add("Terminal block", new BoxGeometry(.32, .14, .22), dark, 0, .58 + spread * .3, 0);
  } else if (kind === "actuator") {
    // Electro-hydraulic servo actuator (flight control surface).
    cylinderX("Cylinder housing", .2, 1.5, -.15, shell, true);
    for (const x of [-.9, .6]) cylinderX("Gland nut", .23, .08, x + (x < 0 ? -spread * .3 : spread * .3), alloy);
    cylinderX("Piston", .18, .1, .1 + spread * .3, highlight);
    cylinderX("Piston rod", .07, 1.4, .75 + spread * .6, steel);
    ringX("Rod-end eye", .1, .035, 1.5 + spread * .75); ringX("Trunnion eye", .12, .04, -1.05 - spread * .4);
    add("Servo-valve manifold", new BoxGeometry(.5, .2, .3), anodised, -.25, .28 + spread * .35, 0);
    add("Torque motor", new CylinderGeometry(.11, .11, .18, 24), dark, -.25, .47 + spread * .55, 0);
    cylinderX("LVDT position sensor", .045, .9, .05, alloy, false, -.26 - spread * .3, 0);
    for (const x of [-.45, -.05]) add("Hydraulic port", new CylinderGeometry(.04, .04, .14, 16), highlight, x, .28 + spread * .35, .19, [Math.PI / 2, 0, 0]);
  } else if (kind === "strut") {
    // Oleo-pneumatic shock strut with torque links and steering collar.
    cylinderX("Oleo housing", .2, 1.3, -.45, shell, true);
    cylinderX("Sliding piston", .14, 1.25, .45 + spread * .45, steel);
    cylinderX("Gland ring", .22, .06, .2 + spread * .2, alloy);
    ringX("Steering collar", .23, .04, -.55);
    add("Upper torque link", new BoxGeometry(.5, .06, .05), alloy, .2 + spread * .2, .26, 0, [0, 0, -.35]);
    add("Lower torque link", new BoxGeometry(.5, .06, .05), alloy, .62 + spread * .4, .26, 0, [0, 0, .35]);
    add("Charging valve", new CylinderGeometry(.03, .03, .1, 12), steel, -1.05, .2, 0);
    cylinderX("Trunnion", .08, .7, -1.1 - spread * .3, alloy, false, 0, 0).rotation.set(Math.PI / 2, 0, 0);
    add("Axle", new CylinderGeometry(.07, .07, .6, 20), steel, 1.1 + spread * .5, 0, 0, [Math.PI / 2, 0, 0]);
  } else if (kind === "tyre" || kind === "brake") {
    // Axle along X. Tyre: tubeless carcass on split wheel. Brake: carbon heat-sink stack.
    const tyreProfile = Array.from({ length: 19 }, (_, i) => { const a = -Math.PI / 2 + i / 18 * Math.PI, c = Math.cos(a); return [.55 + .42 * c, Math.sin(a) * .27 * (1 + .1 * c)] as [number, number]; });
    if (kind === "tyre") {
      lathe("Tyre", tyreProfile, rubber, -spread * .35, Math.PI * 2, 72);
      for (const x of [-.1, 0, .1]) ringX("Tread groove", .968, .012, x - spread * .35, carbon);
      for (const k of [-1, 1]) lathe(`Wheel half ${k}`, [[.2, 0], [.55, 0], [.58, k * .05], [.55, k * .2]], alloy, k * spread * .25, Math.PI * 2, 48);
      cylinderX("Rim", .56, .38, 0, highlight, true);
      bolts("Tie bolts", 0, .38, 10, .02);
      cylinderX("Bearing hub", .14, .5, 0, steel);
      add("Inflation valve", new CylinderGeometry(.015, .015, .12, 8), steel, .2, .42, 0);
    } else {
      cylinderX("Torque tube", .22, .7, 0, dark);
      for (let i = 0; i < 9; i++) {
        const rotor = i % 2 === 0;
        const disc = cylinderX(rotor ? "Brake disc" : "Stator disc", rotor ? .6 : .54, .05, (i - 4) * (.075 + spread * .09), rotor ? highlight : carbon, false, 0, 0, 48);
        disc.name = rotor ? "Brake disc" : "Stator disc";
      }
      cylinderX("Pressure plate", .58, .06, -.4 - spread * .45, alloy);
      cylinderX("Piston housing", .5, .16, -.55 - spread * .7, anodised);
      instanced("Brake pistons", new CylinderGeometry(.045, .045, .12, 14), steel, Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return at(-.47 - spread * .6, Math.cos(a) * .4, Math.sin(a) * .4, 0, 0, Math.PI / 2); }));
      cylinderX("Wear-pin indicator", .02, .25, -.72 - spread * .7, steel, false, .3, 0);
      cylinderX("Axle", .1, 1.5, 0, steel);
    }
    if (kind === "tyre") cylinderX("Axle", .1, 1.3, 0, steel);
  } else if (kind === "electronics") {
    // ATR-format avionics LRU: chassis, card cage, front connectors, rear heat sink.
    add("Enclosure", new BoxGeometry(1.9, .8, .9), shell, 0, 0, 0);
    add("Cover", new BoxGeometry(1.9, .04, .9), alloy, 0, .42 + spread * .6, 0);
    add("Front panel", new BoxGeometry(.05, .8, .9), anodised, -.97 - spread * .4, 0, 0);
    for (let i = 0; i < 6; i++) {
      const z = (i - 2.5) * .13;
      add(i === 2 ? "Circuit board" : `Circuit card ${i + 1}`, new BoxGeometry(1.6, .66, .02), i === 2 ? highlight : pcb, spread * .2 * (i - 2.5), 0, z + spread * (i - 2.5) * .06);
      instanced("Integrated circuits", new BoxGeometry(.14, .1, .03), dark, Array.from({ length: 6 }, (_, k) => at(-.55 + (k % 3) * .5 + spread * .2 * (i - 2.5), -.15 + Math.floor(k / 3) * .3, z + .025 + spread * (i - 2.5) * .06)));
    }
    for (const y of [-.2, .2]) { add("Connector", new CylinderGeometry(.11, .11, .14, 24), alloy, -1.06 - spread * .55, y, -.2, [0, 0, Math.PI / 2]); ringX("Connector coupling ring", .12, .02, -1.12 - spread * .55).position.set(-1.12 - spread * .55, y, -.2); }
    instanced("Heat-sink fins", new BoxGeometry(.04, .7, .82), alloy, Array.from({ length: 10 }, (_, i) => at(.98 + i * .05 + spread * .4, 0, 0)));
    for (const z of [-.42, .42]) add("Hold-down hook", new BoxGeometry(.12, .1, .06), steel, -.9, -.42, z);
  } else if (kind === "battery") {
    add("Battery enclosure", new BoxGeometry(1.4, .8, .9), shell, 0, 0, 0);
    add("Lid", new BoxGeometry(1.42, .06, .92), anodised, 0, .44 + spread * .55, 0);
    instanced("Cell module", new CylinderGeometry(.11, .11, .62, 24), highlight, Array.from({ length: 15 }, (_, i) => at(-.5 + (i % 5) * .25, -.04 + spread * .2, -.25 + Math.floor(i / 5) * .25)));
    instanced("Bus bars", new BoxGeometry(.24, .02, .05), copper, Array.from({ length: 12 }, (_, i) => at(-.38 + (i % 4) * .25, .3 + spread * .3, -.25 + Math.floor(i / 4) * .25)));
    add("Main connector", new CylinderGeometry(.12, .12, .14, 24), alloy, .76 + spread * .4, .1, 0, [0, 0, Math.PI / 2]);
    add("Vent tube", new CylinderGeometry(.03, .03, .3, 12), dark, -.6, .5 + spread * .55, .3);
  } else if (kind === "sensor") {
    // Heated air-data / sensing probe on a mounting flange.
    cylinderX("Mounting flange", .32, .05, -.6 - spread * .3, alloy); bolts("Flange bolts", -.6 - spread * .3, .26, 6, .02);
    cylinderX("Sensor body", .18, .4, -.85 - spread * .5, shell);
    lathe("Probe", [[.12, -.55], [.1, .4], [.07, 1.2], [.045, 1.5], [.001, 1.56]], highlight, spread * .4);
    for (const x of [.3, .55]) ringX("Static port ring", .1, .008, x + spread * .4, dark);
    cylinderX("Connector", .1, .22, -1.15 - spread * .7, dark);
  } else if (kind === "cooling") {
    // ECS heat exchanger: plate-fin core with headers and ram-air ducts.
    add("Core", new BoxGeometry(1.2, .7, .9), highlight, 0, 0, 0);
    instanced("Cooling fin", new BoxGeometry(1.2, .012, .9), alloy, Array.from({ length: 22 }, (_, i) => at(0, -.33 + i * .031 + spread * (i - 10.5) * .012, 0)));
    for (const side of [-1, 1]) lathe("Manifold", [[.001, -.45], [.25, -.4], [.33, 0], [.25, .4], [.001, .45]], alloy, side * (.68 + spread * .45), Math.PI, 32).rotation.set(0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    for (const side of [-1, 1]) lathe("Ram-air duct", [[.2, 0], [.22, .3], [.18, .6]], shell, side * 1.0, Math.PI * 2, 32).position.set(side * (1.0 + spread * .7), 0, 0);
    add("Bypass valve", new CylinderGeometry(.08, .08, .2, 20), dark, 0, .48 + spread * .35, .3);
  } else if (kind === "valve") {
    // Butterfly pressure-regulating / shut-off valve.
    lathe("Valve body", [[.36, -.35], [.32, -.3], [.32, .3], [.36, .35]], shell, 0, Math.PI * 1.3);
    for (const x of [-.36, .36]) { ringX("Flange", .36, .03, x + Math.sign(x) * spread * .3); bolts("Flange bolts", x + Math.sign(x) * spread * .3, .4, 8, .018); }
    add("Spool", new CylinderGeometry(.3, .3, .025, 40), highlight, 0, 0, 0, [.5, 0, 0]);
    add("Valve shaft", new CylinderGeometry(.03, .03, .85, 12), steel, 0, .1, 0);
    add("Actuator housing", new CylinderGeometry(.17, .17, .28, 32), anodised, 0, .55 + spread * .45, 0);
    add("Actuator dome", new SphereGeometry(.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), anodised, 0, .69 + spread * .45, 0);
    add("Position indicator", new BoxGeometry(.1, .04, .1), highlight, 0, .86 + spread * .55, 0);
    add("Solenoid", new BoxGeometry(.2, .2, .2), dark, .26, .5 + spread * .45, 0);
  } else if (kind === "reservoir") {
    // Engine oil tank / hydraulic reservoir.
    lathe("Reservoir shell", [[.001, -.75], [.25, -.7], [.36, -.55], [.38, -.3], [.38, .3], [.36, .55], [.25, .7], [.001, .75]], shell, 0, Math.PI * 1.35);
    add("Sight glass", new BoxGeometry(.5, .06, .03), mat("#6fb5c9", .1, .1, { transparent: true, opacity: .7 }), 0, 0, .38);
    cylinderX("Level indicator", .03, 1.1, 0, highlight, false, .1, 0);
    add("Filler cap", new CylinderGeometry(.09, .09, .1, 24), alloy, -.3, .42 + spread * .4, 0);
    cylinderX("Pickup tube", .04, 1.1, .1, steel, false, -.22, 0);
    for (const x of [.45, .65]) add("Service port", new CylinderGeometry(.045, .045, .16, 16), dark, x + spread * .3, -.38, 0);
  } else {
    // Hydraulic filter: head, bowl, pleated element and ΔP indicator.
    add("Filter head", new BoxGeometry(.55, .3, .55), alloy, -.75 - spread * .45, 0, 0);
    for (const side of [-1, 1]) add("Port", new CylinderGeometry(.06, .06, .2, 16), dark, -.75 - spread * .45, 0, side * .34, [Math.PI / 2, 0, 0]);
    add("Differential-pressure indicator", new CylinderGeometry(.05, .05, .1, 16), highlight, -.75 - spread * .45, .2, 0);
    lathe("Filter housing", [[.3, -.6], [.32, -.5], [.32, .6], [.2, .72], [.001, .75]], shell, 0, Math.PI * 1.3);
    cylinderX("Filter core", .1, 1.15, 0, steel);
    instanced("Filter pleat", new BoxGeometry(1.1, .16, .012), highlight, Array.from({ length: 36 }, (_, i) => { const a = i / 36 * Math.PI * 2; return at(spread * .35, Math.cos(a) * .2, Math.sin(a) * .2, a); }));
  }
  return group;
}
