import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, Vector3 } from "three";
import { fittedCameraPosition, modelFitPoints } from "./cameraFit";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { StudioPoster } from "./TwinShowcase";
import type { FlowSignal } from "./elasticGridMath";
import type { RefObject } from "react";

const ease = (t: number) => t * t * (3 - 2 * t);
type Props = { model: string; view: "front" | "perspective" | "profile" | "top"; viewRevision: number; onOrbit: () => void; reduced: boolean; flowPose: RefObject<FlowSignal> };

function Model({ url, onReady }: { url: string; onReady: (bounds: Vector3[]) => void }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}${url}`, false, false);
  const model = useMemo(() => {
    const copy = gltf.scene.clone(true);
    const box = new Box3().setFromObject(copy);
    const scale = 10 / Math.max(...box.getSize(new Vector3()).toArray());
    copy.scale.setScalar(scale); copy.position.copy(box.getCenter(new Vector3()).multiplyScalar(-scale));
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    copy.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true; object.receiveShadow = true;
      const polish = (material: MeshStandardMaterial) => {
        const cached = materials.get(material);
        if (cached) return cached;
        const own = material.clone();
        materials.set(material, own);
        own.envMapIntensity = .75;
        return own;
      };
      object.material = Array.isArray(object.material) ? object.material.map(polish) : polish(object.material);
    });
    copy.userData.viewerBounds = modelFitPoints(copy);
    return copy;
  }, [gltf.scene]);
  useEffect(() => { onReady(model.userData.viewerBounds as Vector3[]); }, [onReady, model]);
  useEffect(() => () => {
    const materials = new Set<{ dispose: () => void }>();
    model.traverse(object => { if (object instanceof Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    materials.forEach(material => material.dispose());
  }, [model]);
  return <primitive object={model} dispose={null}/>;
}
function StudioEnvironment() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pmrem.fromScene(room, .04);
    const previous = scene.environment;
    scene.environment = map.texture; invalidate();
    return () => { scene.environment = previous; map.dispose(); room.dispose(); pmrem.dispose(); };
  }, [gl, scene, invalidate]);
  return null;
}
function Motion({ model, view, viewRevision, onOrbit, reduced, flowPose, onReady }: Props & { onReady: (points: Vector3[]) => void }) {
  const orbit = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate, gl } = useThree();
  const cameraFrom = useRef(new Vector3()), cameraTo = useRef(new Vector3());
  const cameraStart = useRef(0);
  const [bounds, setBounds] = useState<Box3 | Vector3[]>(() => new Box3(new Vector3(-5, -2, -5), new Vector3(5, 2, 5)));
  const modelReady = useCallback((points: Vector3[]) => { setBounds(points); onReady(points); }, [onReady]);
  // Keep the full transparent canvas for the floor shadow, but frame the airframe
  // inside the space between its heading and statistics.
  const verticalMargin = useRef(.88);
  const measureFrame = useCallback(() => {
    const surface = gl.domElement.closest(".twin-scene");
    const stage = surface?.closest(".twin-showcase");
    const rect = surface?.getBoundingClientRect();
    const heading = stage?.querySelector(".twin-heading")?.getBoundingClientRect();
    const stats = stage?.querySelector(".twin-stats")?.getBoundingClientRect();
    const top = rect && heading ? Math.max(0, heading.bottom + 20 - rect.top) : 0;
    const bottom = rect && stats ? Math.max(0, rect.bottom - stats.top + 24) : 0;
    const safeHeight = Math.max(size.height * .3, size.height - top - bottom);
    if (camera instanceof PerspectiveCamera) camera.setViewOffset(size.width, size.height, 0, (bottom - top) / 2, size.width, size.height);
    verticalMargin.current = .88 * safeHeight / size.height;
  }, [camera, gl, size.width, size.height]);
  const fitOrbit = () => {
    if (cameraStart.current || !(camera instanceof PerspectiveCamera)) return;
    camera.position.copy(fittedCameraPosition(camera.position, bounds, camera.fov, size.width / size.height, .88, verticalMargin.current));
    camera.lookAt(0, 0, 0);
  };
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    measureFrame();
    const direction = view === "top" ? new Vector3(0, 1, .001) : view === "profile" ? new Vector3(11, 2.2, 0) : view === "front" ? new Vector3(0, 1.4, 10.5) : new Vector3(5.8, 3, 6.5);
    const target = fittedCameraPosition(direction, bounds, camera.fov, size.width / size.height, .88, verticalMargin.current);
    cameraFrom.current.copy(camera.position); cameraTo.current.copy(target);
    cameraStart.current = performance.now();
    if (reduced) { camera.position.copy(target); camera.lookAt(0, 0, 0); cameraStart.current = 0; }
    invalidate();
  }, [view, viewRevision, reduced, camera, size.width, size.height, invalidate, bounds, measureFrame]);
  useEffect(() => {
    const visibility = () => { if (!document.hidden) invalidate(); };
    const lost = (event: Event) => event.preventDefault();
    document.addEventListener("visibilitychange", visibility);
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => { document.removeEventListener("visibilitychange", visibility); gl.domElement.removeEventListener("webglcontextlost", lost); };
  }, [gl, invalidate]);
  useFrame(() => {
    if (document.hidden) return;
    flowPose.current.x = .5 + Math.sin(Math.atan2(camera.position.x, camera.position.z)) * .065;
    flowPose.current.y = .56 + Math.min(.07, camera.position.y / camera.position.length() * .07);
    flowPose.current.wake?.();
    if (cameraStart.current) {
      const t = Math.min(1, (performance.now() - cameraStart.current) / 360);
      camera.position.lerpVectors(cameraFrom.current, cameraTo.current, ease(t));
      if (camera instanceof PerspectiveCamera) camera.position.copy(fittedCameraPosition(camera.position, bounds, camera.fov, size.width / size.height, .88, verticalMargin.current));
      camera.lookAt(0, 0, 0);
      if (t < 1) invalidate(); else cameraStart.current = 0;
    }
  });
  return <>
    <Model url={model} onReady={modelReady}/>
    <OrbitControls ref={orbit} makeDefault enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={.02} maxPolarAngle={Math.PI / 2.1} target={[0, 0, 0]} onStart={() => { cameraStart.current = 0; onOrbit(); fitOrbit(); }} onChange={fitOrbit}/>
  </>;
}
function RendererStatus({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}
export function TwinStudio(props: Props) {
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [ground, setGround] = useState(-1.72);
  const onReady = useCallback((points: Vector3[]) => { setGround(Math.min(...points.map(point => point.y)) - .015); setReady(true); }, []), onLost = useCallback(() => setFailed(true), []);
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(onLost, 20_000);
    return () => clearTimeout(timeout);
  }, [ready, onLost]);
  if (failed) return <StudioPoster failed model={props.model}/>;
  return <><Canvas frameloop="demand" dpr={[1, 2]} shadows camera={{ position: [0, 2, 14], fov: 32 }} gl={{ alpha: true, antialias: true }}>
    <ambientLight intensity={.18}/><hemisphereLight args={["#ffffff", "#a4b0be", .45]}/>
    <directionalLight position={[-8, 12, 6]} intensity={1.15}/><directionalLight position={[8, 5, -10]} intensity={.55}/>
    <StudioEnvironment/><RendererStatus onLost={onLost}/>
    <Suspense fallback={null}><Motion {...props} onReady={onReady}/><ContactShadows position={[0, ground, 0]} opacity={.35} scale={18} blur={2.3} far={7} resolution={512} frames={1}/></Suspense>
  </Canvas>{!ready && <span className="twin-model-loading" role="status">Loading aircraft model…</span>}</>;
}
