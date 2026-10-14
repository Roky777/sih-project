import { Box3, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from "three";

function corners(bounds: Box3) {
  const points: Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new Vector3(x, y, z));
  return points;
}

/** Per-part bounds avoid fitting empty corners of one oversized aircraft box. */
export function modelFitPoints(model: Object3D) {
  const points: Vector3[] = [];
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const count = object instanceof InstancedMesh ? object.count : 1;
    for (let index = 0; index < count; index++) {
      const matrix = object.matrixWorld.clone();
      if (object instanceof InstancedMesh) { const instance = new Matrix4(); object.getMatrixAt(index, instance); matrix.multiply(instance); }
      points.push(...corners(box).map(point => point.applyMatrix4(matrix)));
    }
  });
  return points;
}

/** Fit every bound corner, including depth, to the current perspective direction. */
export function fittedCameraPosition(direction: Vector3, bounds: Box3 | Vector3[], fov: number, aspect: number, margin = .88, verticalMargin = margin) {
  const forward = direction.clone().normalize();
  const basis = new Matrix4().lookAt(forward, new Vector3(), new Vector3(0, 1, 0));
  const right = new Vector3().setFromMatrixColumn(basis, 0);
  const up = new Vector3().setFromMatrixColumn(basis, 1);
  const tangent = Math.tan(fov * Math.PI / 360);
  const vertical = tangent * verticalMargin;
  const horizontal = tangent * margin * Math.max(.01, aspect);
  let distance = 0;
  for (const point of bounds instanceof Box3 ? corners(bounds) : bounds) {
    distance = Math.max(distance, point.dot(forward) + Math.max(Math.abs(point.dot(right)) / horizontal, Math.abs(point.dot(up)) / vertical));
  }
  return forward.multiplyScalar(distance);
}
