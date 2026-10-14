import { expect, test } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { createFighterVisual } from "./fighterGeometry";
import { createHelicopterVisual } from "./helicopterGeometry";
import { createTrainerVisual } from "./trainerGeometry";
import { createTransportVisual } from "./transportGeometry";
import { createHeavyFighterVisual } from "./heavyFighterGeometry";
import { fittedCameraPosition, modelFitPoints } from "./cameraFit";

test("the whole normalized fighter fits through arbitrary orbit angles and aspect ratios", () => {
  const model = createFighterVisual();
  const original = new Box3().setFromObject(model);
  const scale = 10 / Math.max(...original.getSize(new Vector3()).toArray());
  const center = original.getCenter(new Vector3());
  model.scale.setScalar(scale); model.position.copy(center.multiplyScalar(-scale));
  const points = modelFitPoints(model);
  for (const aspect of [.6, 1, 1.4, 2.5, 4]) for (let azimuth = 0; azimuth < 360; azimuth += 15) for (const elevation of [2, 20, 45, 70, 89]) {
    const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
    const direction = new Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
    const camera = new PerspectiveCamera(32, aspect, .1, 1000);
    camera.position.copy(fittedCameraPosition(direction, points, 32, aspect));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    let maxX = 0, maxY = 0, maxZ = 0;
    for (const sample of points) {
      const point = sample.clone().project(camera);
      maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, Math.abs(point.y)); maxZ = Math.max(maxZ, point.z);
    }
    expect(maxX).toBeLessThanOrEqual(.880001); expect(maxY).toBeLessThanOrEqual(.880001); expect(maxZ).toBeLessThan(1);
  }
});


test("every airframe keeps its geometry above statistics with an uninterrupted shadow canvas", () => {
  for (const create of [createFighterVisual, createHelicopterVisual, createTrainerVisual, createTransportVisual, createHeavyFighterVisual]) {
    const model = create();
    const original = new Box3().setFromObject(model);
    const scale = 10 / Math.max(...original.getSize(new Vector3()).toArray());
    model.scale.setScalar(scale); model.position.copy(original.getCenter(new Vector3()).multiplyScalar(-scale));
    const points = modelFitPoints(model);
    for (const [width, height, top, bottom] of [[1155, 680, 60, 136], [1090, 480, 60, 136], [390, 240, 0, 0], [1330, 250, 0, 0], [1170, 250, 0, 0], [670, 250, 0, 0], [310, 210, 0, 0]]) {
      for (const direction of [new Vector3(5.8, 3, 6.5), new Vector3(0, 1.4, 10.5), new Vector3(11, 2.2, 0), new Vector3(0, 1, .001)]) {
        const camera = new PerspectiveCamera(32, width / height, .1, 1000);
        camera.setViewOffset(width, height, 0, (bottom - top) / 2, width, height);
        camera.position.copy(fittedCameraPosition(direction, points, 32, width / height, .88, .88 * (height - top - bottom) / height));
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
        for (const sample of points) {
          const point = sample.clone().project(camera);
          expect(point.x).toBeGreaterThanOrEqual(-.880001); expect(point.x).toBeLessThanOrEqual(.880001);
          expect(point.y).toBeGreaterThanOrEqual(-1 + 2 * bottom / height);
          expect(point.y).toBeLessThanOrEqual(1 - 2 * top / height);
        }
      }
    }
    model.traverse(object => { if ("geometry" in object) (object.geometry as { dispose: () => void }).dispose(); });
  }
});
