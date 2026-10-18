import { describe, expect, it } from "vitest";
import { Box3, LatheGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { AircraftDetail, TwinComponent } from "./api";
import { architectureColor, architectureComponents, componentLayouts, structureLabels } from "./componentArchitecture";
import { createComponentStructure } from "./componentStructure";

const component = (id: string, type: string, state: TwinComponent["state"]): TwinComponent => ({
  id, aircraft: "AC-001", slot: 1, type, name: type, serial: "SYN-001", state, hi: state === "failed" ? 30 : 90, criticality: 3, risk14: .1, risk30: .2,
  rul: { p10: 4, p50: 12, p90: 30 }, anomaly: 0, anomaly_sustained: false, work_order: null,
});
describe("illustrative architecture selection", () => {
  it("uses selected records, exposes unknown mappings and separates findings from maintenance", () => {
    const items = [component("AC-001-T", "ENG-TRB", "failed"), component("AC-001-B", "ELE-BAT", "healthy"), component("AC-001-M", "LG-STR", "under_maintenance"), component("AC-001-X", "UNSUPPORTED", "watch")];
    const data = { systems: [{ name: "Synthetic system", components: items }], advisories: [] } as unknown as AircraftDetail;
    const result = architectureComponents(data);
    expect(result.map(item => item.id)).toEqual(items.map(item => item.id));
    expect(result.map(item => item.number)).toEqual([1, 2, 3, 4]);
    expect(result.map(item => item.attention)).toEqual([true, false, false, true]);
    expect(result[3].layout).toBeNull();
    expect(architectureColor(result[0])).toBe("#ed525c");
    expect(architectureColor(result[2])).toBe("#55b6ff");
    expect(architectureColor(result[1])).toBe("#76d5b1");
  });
  it("highlights a current advisory without inventing an internal defect or reviving completed advisories", () => {
    const data = { systems: [{ name: "Propulsion", components: [component("AC-001-A", "ENG-CMP", "healthy"), component("AC-001-B", "ENG-TRB", "healthy")] }], advisories: [
      { id: "ADV-1", component_id: "AC-001-A", status: "open" }, { id: "ADV-2", component_id: "AC-001-B", status: "completed" },
    ] } as unknown as AircraftDetail;
    const result = architectureComponents(data);
    expect(result[0].attention).toBe(true); expect(result[0].openAdvisories[0].id).toBe("ADV-1");
    expect(result[1].attention).toBe(false); expect(result[1].openAdvisories).toEqual([]);
  });
  it("shows a complete opaque casing in assembled view while keeping cutaway internals available", () => {
    for (const kind of ["compressor", "turbine", "pump", "generator", "actuator", "strut", "electronics", "battery", "sensor", "cooling", "valve", "reservoir", "filter"] as const) {
      for (const cutaway of [false, true]) {
        const model = createComponentStructure(kind, false, false, "#ed525c", cutaway);
        let shells = 0;
        const finishes = new Set<string>();
        model.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (!(material instanceof MeshStandardMaterial)) continue;
            finishes.add(material.color.getHexString());
            if (material.color.getHexString() === "7fa3b8") {
              shells++;
              expect(material.transparent).toBe(cutaway);
              expect(material.depthWrite).toBe(!cutaway);
              expect(material.opacity).toBe(cutaway ? .2 : 1);
              if (!cutaway && object.geometry instanceof LatheGeometry) expect(object.geometry.parameters.phiLength).toBeCloseTo(Math.PI * 2);
            }
          }
          object.geometry.dispose(); materials.forEach(material => material.dispose());
        });
        expect(shells).toBeGreaterThan(0);
        expect(finishes.size).toBeGreaterThan(2);
      }
    }
  });
  it("builds finite, bounded, explicitly illustrative assemblies for every catalogue layout and view", () => {
    expect(Object.keys(componentLayouts)).toHaveLength(20);
    for (const kind of new Set(Object.values(componentLayouts).map(item => item.kind))) {
      expect(structureLabels[kind].length).toBeGreaterThan(1);
      for (const [exploded, wireframe, cutaway] of [[false, false, false], [false, false, true], [true, false, true], [false, true, true]]) {
        const model = createComponentStructure(kind, exploded, wireframe, "#ed525c", cutaway);
        expect(model.userData.engineeringValidated).toBe(false);
        const size = new Box3().setFromObject(model).getSize(new Vector3());
        expect(size.toArray().every(value => value > 0 && value < 10)).toBe(true);
        model.traverse(object => {
          if (!(object instanceof Mesh)) return;
          expect(Array.from(object.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
          object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
        });
      }
    }
  });
});
