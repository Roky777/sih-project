import { Box3, CylinderGeometry, EdgesGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Material } from "three";
import { architectureColor, type ArchitectureComponent } from "./componentArchitecture";
import { createComponentStructure } from "./componentStructure";

/** Conceptual cutaway of the authored visual airframe. Never mutate cached GLTF assets. */
export function createAircraftCutaway(source: Group, components: ArchitectureComponent[], wireframe = false) {
  const root = new Group();
  root.userData = { engineeringValidated: false, units: "arbitrary scene units" };
  source.updateMatrixWorld(true);
  source.traverse(object => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || /fastener|roundel|petal|spoke/i.test(object.name)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const cabin = /seat|headrest|instrument|pedal|control stick/i.test(object.name);
    const canopy = /canopy|windscreen/i.test(object.name);
    const shell = /fuselage|nose|wing|fin|intake fairing/i.test(object.name);
    const material = new MeshStandardMaterial({ color: cabin ? "#365557" : canopy ? "#a1caca" : "#8ca29d", roughness: .65, metalness: .15,
      transparent: !cabin, opacity: cabin ? 1 : shell ? .09 : canopy ? .12 : .38, depthWrite: cabin, wireframe });
    const mesh = new Mesh(geometry, material); mesh.name = object.name; root.add(mesh);
    if (!/seam|line|rivet|decorative|lens/i.test(object.name)) {
      const edges = new EdgesGeometry(geometry, shell ? 28 : 40);
      const lines = new LineSegments(edges, new LineBasicMaterial({ color: "#4e726b", transparent: true, opacity: shell ? .45 : .65 }));
      lines.name = `${object.name} outline`; root.add(lines);
    }
  });
  // Interior wing ribs give fuel cells and flight-control units a readable structural context.
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const rib = new Mesh(new CylinderGeometry(.014, .014, 1.15 + i * .16, 6), new MeshStandardMaterial({ color: "#8baba0", roughness: .8 }));
    rib.name = "Conceptual wing rib"; rib.rotation.x = Math.PI / 2; rib.position.set(side * (.7 + i * .34), .035, -1.1 - i * .22); root.add(rib);
  }
  for (const component of components) {
    if (!component.layout) continue;
    const model = createComponentStructure(component.layout.kind, false, wireframe, architectureColor(component));
    const engine = ["compressor", "turbine"].includes(component.layout.kind);
    const actuator = ["actuator", "strut"].includes(component.layout.kind);
    const scale = engine ? .48 : actuator ? .25 : ["brake", "tyre"].includes(component.layout.kind) ? .30 : .18;
    model.scale.setScalar(scale);
    // Wheel structures already use a transverse X axle. Keep their Y/Z rolling
    // plane aligned with the authored landing gear rather than turning it 90°.
    if (!["brake", "tyre"].includes(component.layout.kind)) model.rotation.y = Math.PI / 2;
    if (component.layout.kind === "strut") model.rotation.z = Math.PI / 2;
    model.position.set(...component.layout.position);
    model.name = component.name;
    model.userData.componentId = component.id; model.userData.attention = component.attention;
    model.traverse(object => {
      object.userData.componentId = component.id;
      object.userData.attention = component.attention;
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        // Colour the whole recorded assembly, including its casing, rather than a locator sphere.
        if (component.attention && component.state !== "under_maintenance") material.color.set("#ed525c");
        material.transparent = false; material.opacity = 1; material.depthWrite = true;
        // Open shell sections keep the shaft, rotors and boards inspectable.
        if (/housing|casing|enclosure|shell/i.test(object.name)) { material.transparent = true; material.opacity = .28; material.depthWrite = false; }
      }
    });
    root.add(model);
  }
  root.updateMatrixWorld(true);
  const center = new Box3().setFromObject(root).getCenter(new Vector3());
  root.position.sub(center); root.updateMatrixWorld(true);
  return root;
}

export function disposeAircraftCutaway(model: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  // Resource sets prevent repeatedly disposing shared assembly materials.
  model.traverse(object => {
    if (!(object instanceof Mesh || object instanceof LineSegments)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
