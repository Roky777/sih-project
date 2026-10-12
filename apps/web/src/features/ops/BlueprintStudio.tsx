import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { architectureColor, type ArchitectureComponent } from "./componentArchitecture";
import { createComponentStructure } from "./componentStructure";
import { fittedCameraPosition, modelFitPoints } from "./cameraFit";
import { createAircraftCutaway, disposeAircraftCutaway } from "./aircraftCutaway";
import { AIRFRAMES, type AirframeSpec } from "./airframes";
export type BlueprintCamera = "perspective" | "top" | "side" | "front";

function Fit({ model, reset, onReady, view = "perspective" }: { model: Group; reset: string; onReady: () => void; view?: BlueprintCamera }) {
  const { camera, size, invalidate } = useThree();
  const points = useMemo(() => modelFitPoints(model), [model]);
  const direction = useMemo(() => view === "top" ? new Vector3(0, 12, .001) : view === "side" ? new Vector3(12, 0, 0) : view === "front" ? new Vector3(0, 0, 12) : new Vector3(7, 5, 9), [view]);
  useEffect(onReady, [onReady]);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    // Top, side and front are engineering elevations: a narrow field of view from far away
    // is near-orthographic, so port and starboard parts (e.g. the two main wheels) line up
    // instead of separating through perspective.
    camera.fov = view === "perspective" ? 35 : 3.5; camera.near = view === "perspective" ? .1 : 2; camera.far = 2000; camera.updateProjectionMatrix();
    camera.position.copy(fittedCameraPosition(direction, points, camera.fov, size.width / size.height, .8));
    camera.lookAt(0, 0, 0); invalidate();
  }, [camera, size.width, size.height, points, reset, direction, view, invalidate]);
  return <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping={false} target={[0, 0, 0]} onChange={() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.position.copy(fittedCameraPosition(camera.position, points, camera.fov, size.width / size.height, .8));
    camera.lookAt(0, 0, 0);
  }}/>;
}
/** Neutral studio reflections so machined and polished metal reads as metal. */
function Reflections() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl), room = new RoomEnvironment(), map = pmrem.fromScene(room, .04);
    const previous = scene.environment;
    scene.environment = map.texture; scene.environmentIntensity = .85; invalidate();
    return () => { scene.environment = previous; map.dispose(); room.dispose(); pmrem.dispose(); };
  }, [gl, scene, invalidate]);
  return null;
}
function ContextStatus({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}
function AircraftCutaway({ airframe, components, onSelect, reset, onReady, view, wireframe }: { airframe: AirframeSpec; components: ArchitectureComponent[]; onSelect: (id: string) => void; reset: string; onReady: () => void; view: BlueprintCamera; wireframe: boolean }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}${airframe.model}`, false, false);
  const model = useMemo(() => createAircraftCutaway(gltf.scene, components, wireframe, airframe), [gltf.scene, components, wireframe, airframe]);
  useEffect(() => () => disposeAircraftCutaway(model), [model]);
  const select = (event: ThreeEvent<MouseEvent>) => {
    const hit = event.intersections.find(item => typeof item.object.userData.componentId === "string");
    if (hit) { event.stopPropagation(); onSelect(hit.object.userData.componentId as string); }
  };
  return <><primitive object={model} dispose={null} onClick={select}/><Fit model={model} reset={reset} onReady={onReady} view={view}/></>;
}
function Part({ component, mode, reset, onReady }: { component: ArchitectureComponent; mode: "assembled" | "exploded" | "wireframe"; reset: string; onReady: () => void }) {
  const model = useMemo(() => createComponentStructure(component.layout!.kind, mode === "exploded", mode === "wireframe", architectureColor(component)), [component, mode]);
  useEffect(() => {
    if (component.attention && component.state !== "under_maintenance") model.traverse(object => {
      if (object instanceof Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
        if (material instanceof MeshStandardMaterial) material.color.set("#ed525c");
      });
    });
  }, [component, model]);
  useEffect(() => () => {
    model.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()); } });
  }, [model]);
  return <><primitive object={model} dispose={null}/><Fit model={model} reset={reset} onReady={onReady}/></>;
}
export function BlueprintStudio({ airframe = AIRFRAMES.lca, components, selected, onSelect, mode = "assembled", reset = "0", view = "perspective", wireframe = false }: {
  airframe?: AirframeSpec; components: ArchitectureComponent[]; selected?: ArchitectureComponent; onSelect?: (id: string) => void; mode?: "assembled" | "exploded" | "wireframe"; reset?: string; view?: BlueprintCamera; wireframe?: boolean;
}) {
  const [lost, setLost] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => { if (ready) return; const timer = setTimeout(() => setLost(true), 20_000); return () => clearTimeout(timer); }, [ready]);
  if (lost) return <p className="bp-renderer-fallback" role="status">3D view unavailable. Component records and evidence remain available.</p>;
  return <><Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [5, 3, 6], fov: 35 }} gl={{ alpha: true, antialias: true }}>
    <ContextStatus onLost={() => setLost(true)}/><Reflections/><ambientLight intensity={.55}/><hemisphereLight args={["#ffffff", "#5b6f7a", .6]}/><directionalLight position={[4, 8, 6]} intensity={1.8}/><directionalLight position={[-4, 2, -5]} intensity={.8}/>
    <Suspense fallback={null}>{selected?.layout ? <Part component={selected} mode={mode} reset={reset} onReady={onReady}/> : <AircraftCutaway airframe={airframe} components={components} onSelect={onSelect ?? (() => undefined)} reset={reset} onReady={onReady} view={view} wireframe={wireframe}/>}</Suspense>
  </Canvas>{!ready && <p className="bp-scene-loading" role="status">Preparing 3D structure…</p>}</>;
}
