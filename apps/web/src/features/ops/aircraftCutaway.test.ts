import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { AircraftDetail, TwinComponent } from "./api";
import { architectureComponents, componentLayouts } from "./componentArchitecture";
import { createFighterVisual } from "./fighterGeometry";
import { createAircraftCutaway, disposeAircraftCutaway } from "./aircraftCutaway";

describe("illustrative aircraft cutaway", () => {
  it("renders every mapped assembly and colours its whole geometry without mutating the source", () => {
    const source = new Group();
    const original = new Mesh(new BoxGeometry(1, 1, 8), new MeshStandardMaterial({ color: "#778899" }));
    original.name = "Continuous shaped fuselage"; source.add(original);
    const items = Object.keys(componentLayouts).map((type, i) => ({ id: `C-${i}`, type, name: type, state: i === 0 ? "failed" : "healthy" } as TwinComponent));
    const components = architectureComponents({ systems: [{ name: "Synthetic", components: items }], advisories: [] } as unknown as AircraftDetail);
    const model = createAircraftCutaway(source, components);
    for (const component of components) {
      const assembly = model.children.find(child => child.userData.componentId === component.id);
      expect(assembly).toBeDefined();
      let meshes = 0;
      assembly!.traverse(object => {
        if (!(object instanceof Mesh)) return;
        meshes++;
        expect(Array.from(object.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
        if (component.attention) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          expect((material as MeshStandardMaterial).color.getHexString()).toBe("ed525c");
        }
      });
      expect(meshes).toBeGreaterThan(0);
    }
    expect(new Box3().setFromObject(model).getSize(new Vector3()).toArray().every(Number.isFinite)).toBe(true);
    expect(model.userData.engineeringValidated).toBe(false);
    expect(original.material.color.getHexString()).toBe("778899");
    expect((model.children[0] as Mesh).geometry).not.toBe(original.geometry);
    disposeAircraftCutaway(model);
    expect(original.geometry.getAttribute("position").count).toBeGreaterThan(0);
    original.geometry.dispose(); original.material.dispose();
  });
  it("fits tyre and brake assemblies to the visual gear's transverse axles", () => {
    const source = createFighterVisual();
    const components = architectureComponents({ systems: [{ name: "Landing gear", components: [
      { id: "wheel", type: "LG-TYR", name: "Main wheel tyre", state: "healthy" },
      { id: "brake", type: "LG-BRK", name: "Brake assembly", state: "healthy" },
    ] }], advisories: [] } as unknown as AircraftDetail);
    const model = createAircraftCutaway(source, components);
    for (const [id, partName, referenceName] of [
      ["wheel", "Tyre", "Main gear 1 tyre"],
      ["brake", "Brake disc", "Main gear -1 hub"],
    ]) {
      const assembly = model.children.find(child => child.userData.componentId === id)!;
      const part = assembly.getObjectByName(partName)!;
      const reference = model.getObjectByName(referenceName)!;
      const bounds = new Box3().setFromObject(part);
      const referenceBounds = new Box3().setFromObject(reference);
      expect(bounds.getCenter(new Vector3()).distanceTo(referenceBounds.getCenter(new Vector3()))).toBeLessThan(.1);
      const size = bounds.getSize(new Vector3());
      expect(size.x).toBeLessThan(size.z * .6);
      expect(size.y / size.z).toBeCloseTo(1, 1);
    }
    disposeAircraftCutaway(model);
    disposeAircraftCutaway(source);
  });

});
