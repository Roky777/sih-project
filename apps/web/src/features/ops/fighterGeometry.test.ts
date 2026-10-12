import { Box3, Mesh, Vector3, type Material } from "three";
import { describe, expect, it } from "vitest";
import { createFighterVisual } from "./fighterGeometry";

describe("authored illustrative fighter geometry", () => {
  it("has finite nonempty surfaces, symmetric delta wings and valid front/rear features", () => {
    const model = createFighterVisual();
    const bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3());
    expect(size.z).toBeGreaterThan(size.x);
    expect(size.x).toBeGreaterThan(6);
    expect(model.userData.engineeringValidated).toBe(false);
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute("position");
      expect(positions.count, object.name).toBeGreaterThan(2);
      expect([...positions.array].every(Number.isFinite), object.name).toBe(true);
      const normals = object.geometry.getAttribute("normal");
      expect([...normals.array].every(Number.isFinite), object.name).toBe(true);
    });
    const left = new Box3().setFromObject(model.getObjectByName("Compound delta wing -1")!);
    const right = new Box3().setFromObject(model.getObjectByName("Compound delta wing 1")!);
    expect(left.min.x).toBeCloseTo(-right.max.x, 4);
    expect(left.max.x).toBeCloseTo(-right.min.x, 4);
    expect(left.min.z).toBeCloseTo(right.min.z, 4);
    expect(left.max.z).toBeCloseTo(right.max.z, 4);
    expect(model.getObjectByName("Nose pitot visual")!.position.z).toBeGreaterThan(4);
    expect(model.getObjectByName("Exhaust dark inner cavity")!.position.z).toBeLessThan(-4);
    expect(model.getObjectByName("Cockpit glazed canopy")!.position.y).toBeGreaterThan(0);
    expect(model.getObjectByName("Main gear 1 tyre")!.position.y).toBeLessThan(-1);
    const materials = new Set<Material>();
    model.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); } });
    materials.forEach(material => material.dispose());
  });
  it("is built at 1:1 scale to the publicly stated overall dimensions", () => {
    const model = createFighterVisual();
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    expect(model.userData.units).toBe("metres");
    expect(size.z).toBeGreaterThan(13.05); expect(size.z).toBeLessThan(13.35); // length 13.2 m
    expect(size.x).toBeGreaterThan(8.1); expect(size.x).toBeLessThan(8.35);    // span 8.2 m
    expect(size.y).toBeGreaterThan(4.3); expect(size.y).toBeLessThan(4.5);     // height 4.4 m
  });
});

describe("cockpit fit", () => {
  it("keeps the ejection seat and cockpit fittings below the canopy glazing", () => {
    const model = createFighterVisual();
    const canopy = new Box3().setFromObject(model.getObjectByName("Cockpit glazed canopy")!);
    for (const name of ["Cockpit seat headrest", "Seat drogue container", "Ejection seat bucket", "HUD combiner", "Control stick"]) {
      const part = new Box3().setFromObject(model.getObjectByName(name)!);
      expect(part.max.y, name).toBeLessThan(canopy.max.y - .04);
      expect(part.max.z, name).toBeLessThan(canopy.max.z);
      expect(part.min.z, name).toBeGreaterThan(canopy.min.z);
    }
  });
});

describe("fleet airframes", () => {
  it("builds each airframe at 1:1 scale to its class's published overall dimensions", async () => {
    const { createTrainerVisual, TRAINER } = await import("./trainerGeometry");
    const { createTransportVisual, TRANSPORT } = await import("./transportGeometry");
    const { createHeavyFighterVisual, HEAVY_FIGHTER } = await import("./heavyFighterGeometry");
    const { createHelicopterVisual, HELICOPTER } = await import("./helicopterGeometry");
    for (const [model, dims] of [[createTrainerVisual(), TRAINER.dimensions], [createTransportVisual(), TRANSPORT.dimensions], [createHeavyFighterVisual(), HEAVY_FIGHTER.dimensions], [createHelicopterVisual(), HELICOPTER.dimensions]] as const) {
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      expect(model.userData.engineeringValidated).toBe(false);
      expect(Math.abs(size.z - dims.lengthM) / dims.lengthM, model.name).toBeLessThan(.02);
      expect(Math.abs(size.x - dims.spanM) / dims.spanM, model.name).toBeLessThan(.02);
      expect(Math.abs(size.y - dims.heightM) / dims.heightM, model.name).toBeLessThan(.03);
      model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        expect([...object.geometry.getAttribute("position").array].every(Number.isFinite), object.name).toBe(true);
      });
    }
  });
  it("keeps the trainer's tandem seats inside its canopy and assigns a deterministic fleet mix", async () => {
    const { createTrainerVisual } = await import("./trainerGeometry");
    const { AIRFRAMES, airframeOf } = await import("./airframes");
    const model = createTrainerVisual(), canopy = new Box3().setFromObject(model.getObjectByName("Cockpit glazed canopy")!);
    for (const name of ["Cockpit seat headrest", "Rear ejection seat headrest"]) expect(new Box3().setFromObject(model.getObjectByName(name)!).max.y, name).toBeLessThan(canopy.max.y - .03);
    expect(airframeOf({ id: "AC-001" }).id).toBe("lca");
    expect(airframeOf({ id: "AC-004" }).id).toBe("ajt");
    expect(airframeOf({ id: "AC-005" }).id).toBe("mta");
    expect(airframeOf({ id: "AC-006" }).id).toBe("mki");
    expect(airframeOf({ id: "AC-008" }).id).toBe("alh");
    expect(airframeOf({ id: "AC-017" }).id).toBe("lca");
    expect(airframeOf({ id: "AC-019" }).id).toBe("ajt");
    expect(airframeOf({ id: "AC-020" }).id).toBe("mta");
    expect(airframeOf({ id: "AC-001", type: AIRFRAMES.mta.fleetType }).id).toBe("mta");
    for (const spec of Object.values(AIRFRAMES)) expect(Object.keys(spec.layouts)).toHaveLength(20);
  });
});
