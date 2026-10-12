/* global Buffer, process, URL */
/* Run with: node --import ./scripts/ts-resolve.mjs scripts/build-fighter-model.mjs */
import { mkdir, writeFile } from "node:fs/promises";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createFighterVisual } from "../src/features/ops/fighterGeometry.ts";
import { createTrainerVisual } from "../src/features/ops/trainerGeometry.ts";
import { createTransportVisual } from "../src/features/ops/transportGeometry.ts";
import { createHeavyFighterVisual } from "../src/features/ops/heavyFighterGeometry.ts";
import { createHelicopterVisual } from "../src/features/ops/helicopterGeometry.ts";

// GLTFExporter uses FileReader even for texture-free Node export.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`; this.onloadend?.(); }); }
};
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true });
for (const [file, create] of [["tejas-visual.glb", createFighterVisual], ["trainer-visual.glb", createTrainerVisual], ["transport-visual.glb", createTransportVisual], ["heavy-fighter-visual.glb", createHeavyFighterVisual], ["helicopter-visual.glb", createHelicopterVisual]]) {
  const model = create();
  const result = await new GLTFExporter().parseAsync(model, { binary: true });
  if (!(result instanceof ArrayBuffer)) throw new Error("Expected binary GLB output");
  const target = new URL(`../public/models/${file}`, import.meta.url);
  await writeFile(target, new Uint8Array(result));
  let meshes = 0, triangles = 0;
  model.traverse(object => { if (object.isMesh) { meshes++; triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3; } });
  process.stdout.write(JSON.stringify({ file, bytes: result.byteLength, meshes, triangles, engineeringValidated: false }) + "\n");
}
