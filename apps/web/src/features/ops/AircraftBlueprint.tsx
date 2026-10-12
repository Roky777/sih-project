import { Component, Suspense, lazy, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import type { AircraftDetail } from "./api";
import { architectureComponents, structureLabels } from "./componentArchitecture";
import { num, pct, rulText, shortDate, stateLabel } from "./format";
import { Icon } from "../../shared/ui/Icon";
import { BlueprintDrawing } from "./BlueprintDrawing";
import { airframeOf } from "./airframes";
import type { BlueprintCamera } from "./BlueprintStudio";
import "./aircraft-blueprint.css";

const Studio = lazy(() => import("./BlueprintStudio").then(module => ({ default: module.BlueprintStudio })));
class BlueprintBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="bp-renderer-fallback" role="status">3D view unavailable. Use the drawing and component records to continue.</p> : this.props.children; }
}
export function AircraftBlueprint({ data }: { data: AircraftDetail }) {
  const components = useMemo(() => architectureComponents(data), [data]);
  const airframe = useMemo(() => airframeOf(data.aircraft as { id?: unknown; type?: unknown }), [data.aircraft]);
  const [view, setView] = useState<"drawing" | "spatial">("drawing");
  const [findingsOnly, setFindingsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"assembled" | "exploded" | "wireframe">("assembled");
  const [reset, setReset] = useState(0);
  const [camera, setCamera] = useState<BlueprintCamera>("perspective");
  const [wireframe, setWireframe] = useState(false);
  const lastSelection = useRef<string | null>(null);
  const selected = components.find(item => item.id === selectedId);
  const findings = components.filter(item => item.attention).length;
  const visible = useMemo(() => components.filter(item => !findingsOnly || item.attention), [components, findingsOnly]);
  const select = (id: string) => { lastSelection.current = id; setSelectedId(id); setMode("assembled"); setReset(0); };
  return <section className="aircraft-blueprint" aria-label="Aircraft component blueprint" id="aircraft-blueprint">
    <header className="bp-header"><div><span className="bp-eyebrow">AIRFRAME / COMPONENT INSPECTION</span><h2>Aircraft blueprint</h2><p>Select a component to inspect its structure and condition.</p></div><span className={`bp-finding-count${!components.length ? " is-unavailable" : findings ? " has-findings" : ""}`}><Icon name={findings ? "warning" : "aircraft"} size={16}/>{!components.length ? "Component records unavailable" : findings ? `${findings} condition ${findings === 1 ? "finding" : "findings"}` : "No condition findings"}</span></header>
    <div className="bp-workspace">
      <div className="bp-drawing-panel">
        <div className="bp-toolbar"><div role="group" aria-label="Blueprint view">{(["drawing", "spatial"] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{item === "drawing" ? "Blueprint" : "3D architecture"}</button>)}</div><button type="button" className="bp-filter" aria-pressed={findingsOnly} onClick={() => setFindingsOnly(value => !value)}>Findings only</button></div>
        {view === "spatial" && <div className="bp-camera-toolbar" role="group" aria-label="Blueprint camera">
          {(["perspective", "top", "side", "front"] as const).map(item => <button type="button" key={item} aria-pressed={camera === item} onClick={() => setCamera(item)}>{item === "perspective" ? "3/4 view" : item === "top" ? "Top-down" : item === "side" ? "Side view" : "Front view"}</button>)}
          <button type="button" aria-pressed={wireframe} onClick={() => setWireframe(value => !value)}>Wireframe</button>
          <button type="button" onClick={() => setReset(value => value + 1)} aria-label="Reset blueprint camera"><Icon name="history" size={14}/></button>
        </div>}
        <div className="bp-drawing-surface">
          {view === "drawing" ? <svg viewBox="0 0 900 600" role="group" aria-label={`${airframe.title} general-arrangement blueprint for ${String(data.aircraft.id)}`}>
            <BlueprintDrawing airframe={airframe} components={visible} onSelect={select} aircraftId={String(data.aircraft.id)}/>
          </svg> : <div className="bp-spatial-scene" aria-label="Rotatable 3D aircraft architecture"><BlueprintBoundary><Suspense fallback={<p className="bp-renderer-fallback" role="status">Preparing architecture…</p>}><Studio airframe={airframe} components={visible} onSelect={select} reset={String(reset)} view={camera} wireframe={wireframe}/></Suspense></BlueprintBoundary></div>}
        </div>
        <footer className="bp-drawing-footer"><div><span><i className="bp-red"/>Condition finding</span><span><i className="bp-blue"/>Maintenance</span><span><i className="bp-green"/>Healthy</span></div><span>{view === "drawing" ? "Select a drawn assembly" : "Drag to orbit · Select an assembly"}</span></footer>
      </div>
      <aside className="bp-component-register" aria-label="Blueprint component register"><header><h3>Component register</h3><span>{visible.length} / {components.length}</span></header><div className="bp-register-list">
        {visible.map(item => <button type="button" key={item.id} onClick={() => select(item.id)} className={`bp-register-item${item.attention ? " has-finding" : ""}`} data-component-id={item.id} data-attention={item.attention}>
          <span className="bp-number" style={{ color: item.attention ? "#bf3344" : item.state === "under_maintenance" ? "#287aab" : "#477969" }}>{String(components.indexOf(item) + 1).padStart(2, "0")}</span><span><strong>{item.name}</strong><small>{item.system} · {stateLabel[item.state]}</small></span><Icon name="chevron" size={14}/>
        </button>)}
        {!visible.length && <p className="bp-empty">{components.length && findingsOnly ? "No condition findings in this snapshot. Turn off Findings only to inspect all components." : "No component records available for this aircraft."}</p>}
      </div></aside>
    </div>
    <p className="bp-provenance">Illustrative architecture · Synthetic component records. Locations and internal structures are conceptual, not verified installation or fault-location data.</p>
    <Dialog.Root open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }}><Dialog.Portal><Dialog.Overlay className="o-overlay bp-inspection-overlay"/><Dialog.Content className="bp-inspection-dialog" aria-describedby="bp-inspection-context" onCloseAutoFocus={event => { event.preventDefault(); if (lastSelection.current) document.querySelector<HTMLButtonElement>(`.bp-register-item[data-component-id="${CSS.escape(lastSelection.current)}"]`)?.focus(); }}>
      {selected && <><header className="bp-inspection-header"><div><span className="bp-eyebrow">COMPONENT / 3D INSPECTION</span><Dialog.Title>{selected.name}</Dialog.Title><Dialog.Description id="bp-inspection-context">{String(data.aircraft.id)} · {selected.system} · {shortDate(data.as_of)}</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Close component inspection"><Icon name="close" size={20}/></button></Dialog.Close></header>
        <div className="bp-inspection-body"><div className="bp-part-stage"><div className="bp-part-toolbar" role="group" aria-label="Component structure view">{(["assembled", "exploded", "wireframe"] as const).map(item => <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}<button type="button" aria-label="Reset component camera" onClick={() => setReset(value => value + 1)}><Icon name="history" size={15}/></button></div>
          <div className="bp-part-canvas" aria-label={`3D structure of ${selected.name}`}>{selected.layout ? <BlueprintBoundary key={selected.id}><Suspense fallback={<p role="status">Preparing component structure…</p>}><Studio airframe={airframe} components={components} selected={selected} mode={mode} reset={String(reset)}/></Suspense></BlueprintBoundary> : <p className="bp-renderer-fallback">A structure model is not available for this component type. Its condition records remain available.</p>}</div>
          <div className="bp-part-legend">{selected.layout && structureLabels[selected.layout.kind].map(label => <span key={label}>{label}</span>)}</div><p className="bp-part-note">Illustrative section model · Drag to rotate. Red marks the component’s recorded condition, not a diagnosed internal defect.</p>
        </div><aside className="bp-part-evidence"><span className={`bp-condition ${selected.attention ? "has-finding" : selected.state === "under_maintenance" ? "state-maintenance" : ""}`}>{stateLabel[selected.state]}</span><dl><div><dt>Health index</dt><dd>{num(selected.hi)}<small>/100</small></dd></div><div><dt>Remaining life</dt><dd>{rulText(selected.rul)}</dd></div><div><dt>14-day risk</dt><dd>{pct(selected.risk14)}</dd></div><div><dt>Serial</dt><dd className="bp-serial">{selected.serial || "Unavailable"}</dd></div></dl>
          <h3>Recorded findings</h3>{selected.openAdvisories.length ? selected.openAdvisories.map(advisory => <p key={advisory.id}>{advisory.id} · {advisory.status.replaceAll("_", " ")}</p>) : <p>No open advisory in this snapshot. The condition shown above is the component record, not a confirmed fault cause.</p>}
          <Link className="bp-evidence-action" to={`/health/${selected.id}`}>Open condition evidence <Icon name="arrow" size={16}/></Link>
        </aside></div></>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
