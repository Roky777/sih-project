import { Box3, EdgesGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Material } from "three";
import { architectureColor, type ArchitectureComponent } from "./componentArchitecture";
import { createComponentStructure } from "./componentStructure";
import { AIRFRAMES, type AirframeSpec } from "./airframes";
import { createInternals } from "./fighterInternals";

const DETAIL = /line|seam|joint|hinge|outline|bolt|petal|roundel|lens|nav light|taxi light|sway brace|aoa vane|pitot tip|blade antenna|combiner|crew door|paratroop door|blade tip|beacon|cabin window/i;
const CABIN = /seat|headrest|drogue|firing handle|instrument|display|control stick|cockpit tub/i;
const CANOPY = /canopy|windscreen/i;
const SHELL = /fuselage|radar nose|radome|nose cone|wing(?! rib| spar)|fin|rudder|elevon|elevator|flap|aileron|tailplane|strake|intake fairing|intake mouth|splitter|spine|anti-glare|drag chute|pylon|launch rail|door|refuelling|nacelle|sponson|fairing|fillet|boom|canard|foreplane|stabilator|stabiliser|endplate|cowling|winglet|ventral|mast fairing/i;

/** Cutaway of the airframe: ghosted skin, internal structure and systems, and every mapped
 *  component assembly at its installation zone and real size. Never mutates cached GLTF assets. */
export function createAircraftCutaway(source: Group, components: ArchitectureComponent[], wireframe = false, spec: AirframeSpec = AIRFRAMES.lca) {
  const root = new Group();
  root.userData = { engineeringValidated: false, units: "metres", airframe: spec.id };
  source.updateMatrixWorld(true);
  source.traverse(object => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || DETAIL.test(object.name)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const cabin = CABIN.test(object.name), canopy = CANOPY.test(object.name), shell = SHELL.test(object.name);
    const material = new MeshStandardMaterial({ color: cabin ? "#46575c" : canopy ? "#a9cfd2" : shell ? "#9fbab3" : "#8b9aa0", roughness: .55, metalness: shell ? .1 : .6,
      transparent: !cabin, opacity: cabin ? 1 : shell ? .07 : canopy ? .1 : .3, depthWrite: cabin, wireframe });
    const mesh = new Mesh(geometry, material); mesh.name = object.name; root.add(mesh);
    if (shell && !/door|pylon|splitter|anti-glare/i.test(object.name)) {
      const lines = new LineSegments(new EdgesGeometry(geometry, 24), new LineBasicMaterial({ color: "#7fb2a4", transparent: true, opacity: .42 }));
      lines.name = `${object.name} outline`; root.add(lines);
    }
  });
  root.add(createInternals(spec, wireframe));
  for (const component of components) {
    const layout = component.layout;
    if (!layout) continue;
    const model = createComponentStructure(layout.kind, false, wireframe, architectureColor(component));
    // Scale the representative assembly to the component's real size and align its long
    // axis (X) with the installation axis: compressor/turbine intakes face forward (+Z).
    const raw = new Box3().setFromObject(model).getSize(new Vector3());
    model.scale.setScalar(layout.size / Math.max(raw.x, raw.y, raw.z));
    if (layout.axis === "z") model.rotation.y = Math.PI / 2;
    if (layout.axis === "y") model.rotation.z = Math.PI / 2;
    model.updateMatrixWorld(true);
    const centre = new Box3().setFromObject(model).getCenter(new Vector3());
    model.position.set(...layout.position).sub(centre);
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
        // A faint state-coloured glow keeps each recorded assembly identifiable among the
        // airframe's own structure without repainting healthy hardware.
        material.emissive.set(architectureColor(component)); material.emissiveIntensity = component.attention ? .25 : .18;
        // Open shell sections keep the shafts, rotors and boards inspectable.
        if (/housing|casing|enclosure|shell|body/i.test(object.name)) { material.transparent = true; material.opacity = .28; material.depthWrite = false; }
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
