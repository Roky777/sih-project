import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { fittedCameraPosition, modelFitPoints } from "../ops/cameraFit";
import { semanticColor } from "../../shared/styles/semanticColor";
type OrbitControlsType = ComponentRef<typeof OrbitControls>;
type Props = { components: { id: string; label: string }[]; selected: string | null; onSelect: (id: string) => void; condition?: "unassessed" | "monitored" | "review" | "stale" };
type Anchor = { x: number; y: number; visible: boolean };
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailed:()=>void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailed(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function AircraftModel({ onLoaded, condition, onSelectEngine }: { onLoaded: (bounds: Vector3[]) => void; condition?: Props["condition"]; onSelectEngine: () => void }) {
  // This registered asset has no Draco or Meshopt extensions. Avoid initializing
  // unused external/WASM decoders under the application's strict local CSP.
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/${condition ? "transport-visual.glb" : "aircraft.glb"}`, false, false);

  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new Box3().setFromObject(clone), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
    const scale = 10 / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale); clone.position.copy(center.multiplyScalar(-scale));
    const owned: MeshStandardMaterial[] = [];
    clone.traverse(object => { if (object instanceof Mesh) {
      object.castShadow = true; object.receiveShadow = true;
      const name = object.name.replaceAll("_", " ");
      // Explicit authored asset names identify one conceptual installation, not physical CAD.
      const mapped = name.startsWith("Engine nacelle -1") || name.startsWith("Propeller -1") || (name.startsWith("Nacelle ") && name.includes(" -1"));
      if (condition && mapped) {
        object.userData.telemetryMappedEngine = true;
        const tint = (material: MeshStandardMaterial) => { const copy = material.clone(); copy.color.set(condition === "review" ? "#ed525c" : condition === "monitored" ? "#46bfa3" : condition === "stale" ? "#dba340" : "#92a4b0"); owned.push(copy); return copy; };
        object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
      }
    } });
    clone.userData.ownedMaterials = owned;
    return clone;
  }, [gltf.scene, condition]);
  useEffect(() => { onLoaded(modelFitPoints(model)); }, [onLoaded, model]);
  useEffect(() => () => { (model.userData.ownedMaterials as MeshStandardMaterial[]).forEach(material => material.dispose()); }, [model]);
  return <primitive object={model} dispose={null} onClick={(event: {object: Mesh; stopPropagation: () => void}) => { if (event.object.userData.telemetryMappedEngine) { event.stopPropagation(); onSelectEngine(); } }}/>;
}
function CameraControl({ action, bounds }: { action: { name: string; sequence: number }; bounds?: Vector3[] }) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const c = controls.current; if (!c) return;
    if (action.name === 'Engines') { camera.position.set(8, 3, 7); c.target.set(0, 0, 0); }
    else if (action.name === 'Zoom in' || action.name === 'Zoom out') {
      const delta = camera.position.clone().sub(c.target);
      delta.multiplyScalar(action.name === 'Zoom in' ? .85 : 1.18).clampLength(7, 22);
      camera.position.copy(c.target).add(delta);
    } else { camera.position.set(7, 4, 7).multiplyScalar(Math.max(1,1.8/(size.width/size.height))); c.target.set(0, 0, 0); }
    if (bounds && camera instanceof PerspectiveCamera && !["Zoom in", "Zoom out"].includes(action.name)) camera.position.copy(fittedCameraPosition(camera.position, bounds, camera.fov, size.width / size.height, .86, .86));
    c.update(); invalidate();
  }, [action, bounds, camera, invalidate, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={false} minDistance={7} maxDistance={22} minPolarAngle={.25} maxPolarAngle={Math.PI / 2.05} />;
}
function ProjectedAnchors({ onChange }: { onChange: (anchors: Anchor[]) => void }) {
  const { camera, size } = useThree();
  const points = useMemo(() => [new Vector3(1.325, -.35, 1.786), new Vector3(-1.325, -.35, 1.786)], []);
  useFrame(() => onChange(points.map(point => {
    const p = point.clone().project(camera);
    return { x: (p.x + 1) * size.width / 2, y: (1 - p.y) * size.height / 2, visible: p.z > -1 && p.z < 1 };
  })));
  return null;
}
function ContextLifecycle({ onLost }: { onLost: () => void }) {
  const { gl, setFrameloop, invalidate } = useThree();
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    const visibility = () => { setFrameloop(document.hidden ? 'never' : 'demand'); if (!document.hidden) invalidate(); };
    gl.domElement.addEventListener('webglcontextlost', lost); document.addEventListener('visibilitychange', visibility);
    return () => { gl.domElement.removeEventListener('webglcontextlost', lost); document.removeEventListener('visibilitychange', visibility); };
  }, [gl, onLost, setFrameloop, invalidate]);
  return null;
}
export function AircraftScene({ components, selected, onSelect, condition }: Props) {
  const [action, setAction] = useState({ name: 'Overview', sequence: 0 });
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [bounds, setBounds] = useState<Vector3[]>();
  const onLoaded = useCallback((points: Vector3[]) => { setBounds(points); setLoaded(true); }, []), onLost = useCallback(() => setFailed(true), []);
  const onAnchors = useCallback((next: Anchor[]) => setAnchors(previous => previous.length === next.length && previous.every((a, i) => Math.abs(a.x - next[i].x) < .5 && Math.abs(a.y - next[i].y) < .5 && a.visible === next[i].visible) ? previous : next), []);
  useEffect(() => { if (loaded) return; const timer = setTimeout(onLost, 20000); return () => clearTimeout(timer); }, [loaded, onLost]);
  const fallback = <div className="scene-fallback"><img src={`${import.meta.env.BASE_URL}models/aircraft-poster.png`} alt="Illustrative twin-propeller aircraft" /><strong>3D view unavailable</strong><p>Use the mapped component buttons to inspect evidence. No data or permissions change.</p></div>;
  return <div className="aircraft-stage"><div className="aircraft-canvas">
    {failed ? fallback : <SceneBoundary fallback={fallback} onFailed={onLost}><Canvas frameloop="demand" dpr={[1, 1.5]} shadows camera={{ position: [7, 4, 7], fov: 30 }} fallback={fallback} gl={{ antialias: true }}>
      <color attach="background" args={[semanticColor('bg-stage')]} /><ambientLight intensity={1.7} /><hemisphereLight args={[semanticColor('bg-surface'), semanticColor('text-muted'), 1.5]} />
      <directionalLight position={[-5, 10, 8]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <Suspense fallback={null}><AircraftModel onLoaded={onLoaded} condition={condition} onSelectEngine={() => { if (components[0]) onSelect(components[0].id); }}/></Suspense>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow><planeGeometry args={[35, 35]} /><shadowMaterial transparent opacity={.16} /></mesh>
      <CameraControl action={action} bounds={condition ? bounds : undefined} /><ProjectedAnchors onChange={onAnchors} /><ContextLifecycle onLost={onLost} />
    </Canvas></SceneBoundary>}
    {!failed && !loaded && <span className="model-loading model-loading-overlay" role="status">Loading aircraft asset…</span>}
    {!condition && !failed && loaded && components.slice(0, 2).map((component, index) => anchors[index]?.visible && <button key={component.id} className="engine-hotspot projected-hotspot" style={{ left: anchors[index].x + (index ? -30 : 30), top: anchors[index].y }} aria-label={`Inspect mapped ${component.label}`} aria-pressed={selected === component.id} onClick={() => onSelect(component.id)}><span className="selection-dot" />Engine {index + 1}</button>)}
  </div><div className="scene-toolbar" aria-label="Aircraft view controls">{['Overview', 'Engines', 'Reset view', 'Zoom in', 'Zoom out'].map(name => <button className="button-secondary" key={name} onClick={() => setAction(previous => ({ name, sequence: previous.sequence + 1 }))} disabled={failed || !loaded}>{name}</button>)}</div><div className="scene-components" aria-label="Mapped component selection">{components.map(component => <button key={component.id} aria-pressed={selected === component.id} onClick={() => onSelect(component.id)}><span className="selection-dot" />{component.label}</button>)}</div><p className="scene-provenance">Illustrative aircraft model · Synthetic installation anchors · Unmapped parts: Not assessed</p></div>;
}
