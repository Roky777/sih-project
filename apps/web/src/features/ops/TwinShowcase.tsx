import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAsOf } from "./AsOf";
import { fetchAircraftDetail, useAircraftList, type AircraftDetail } from "./api";
import { num, rulText, shortDate, stateLabel, stateRank } from "./format";
import "./twin-showcase.css";
import { AIRFRAME_INFO, airframeInfo as airframeOf } from "./airframeInfo";
import type { FlowSignal } from "./elasticGridMath";

const Studio = lazy(() => import("./TwinStudio").then(module => ({ default: module.TwinStudio })));

class StudioBoundary extends Component<{ children: ReactNode; model: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StudioPoster failed model={this.props.model}/> : this.props.children; }
}
export function StudioPoster({ failed = false, model }: { failed?: boolean; model?: string }) {
  const family = Object.values(AIRFRAME_INFO).find(item => item.model === model);
  return <div className="twin-poster"><img src={`${import.meta.env.BASE_URL}${family ? `models/previews/${family.id}.jpg` : "models/fighter-poster.svg"}`} alt={family ? `${family.title} illustrative preview` : "Illustrative aircraft silhouette"}/>
    <span role="status">{failed ? "3D view unavailable · Aircraft records remain available below" : "Preparing aircraft model…"}</span></div>;
}
export function TwinShowcase({ data, onExploreBlueprint, large = false }: { data: AircraftDetail; onExploreBlueprint?: () => void; large?: boolean }) {
  const id = String(data.aircraft.id);
  const list = useAircraftList();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { asOf } = useAsOf();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const exploringBlueprint = useRef(false);
  const [view, setView] = useState<"front" | "perspective" | "profile" | "top">("perspective");
  const [viewRevision, setViewRevision] = useState(0), [manualView, setManualView] = useState(false);
  const onOrbit = useCallback(() => setManualView(true), []);
  const [reduced, setReduced] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const viewer = useRef<HTMLElement>(null);
  useEffect(() => {
    const surface = viewer.current;
    if (!surface) return;
    const fit = () => {
      const header = document.querySelector(".o-header")?.getBoundingClientRect();
      const clearance = (header?.bottom ?? 88) + 16;
      const controls = [".aircraft-viewer-head", ".aircraft-viewer-toolbar", ".aircraft-viewer-footer"]
        .reduce((height, selector) => height + (surface.querySelector(selector)?.getBoundingClientRect().height ?? 0), 0);
      surface.style.setProperty("--aircraft-stage-height", `${Math.max(280, Math.min(660, window.innerHeight - clearance - controls - 16))}px`);
    };
    const observer = new ResizeObserver(fit);
    for (const selector of [".aircraft-viewer-head", ".aircraft-viewer-toolbar", ".aircraft-viewer-footer"]) {
      const controls = surface.querySelector(selector);
      if (controls) observer.observe(controls);
    }
    const frame = requestAnimationFrame(() => {
      fit();
      const header = document.querySelector(".o-header")?.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, window.scrollY + surface.getBoundingClientRect().top - (header?.bottom ?? 88) - 16), behavior: "instant" });
    });
    window.addEventListener("resize", fit);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [id]);
  const request = useRef(0);
  const scene = useRef<HTMLDivElement>(null);
  const fade = useRef<Animation | null>(null);
  const locked = useRef(false);
  const flowPose = useRef<FlowSignal>({ x: .5, y: .56 });
  const rows = [...(list.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const index = rows.findIndex(row => row.id === id);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => { media.removeEventListener("change", update); request.current++; };
  }, []);
  useEffect(() => {
    // Animate only the model surface. Record identity, evidence and statistics update together.
    fade.current?.cancel();
    if (!reduced && scene.current) fade.current = scene.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, easing: "cubic-bezier(.2,0,.2,1)" },
    );
    return () => { fade.current?.cancel(); };
  }, [id, asOf, reduced]);
  async function step(direction: number) {
    const next = rows[index + direction];
    if (locked.current || !next || index < 0) return;
    locked.current = true;
    const token = ++request.current;
    setPending(next.id); setError("");
    try {
      // Prefetch under the same key as the detail hook, then switch the whole record.
      // Keep the current aircraft visible while the next record loads.
      await queryClient.fetchQuery({ queryKey: ["ops", "aircraft-detail", `/aircraft/${next.id}`, asOf], queryFn: () => fetchAircraftDetail(next.id, asOf) });
      if (token !== request.current) return;
      if (!reduced && scene.current) {
        fade.current?.cancel();
        fade.current = scene.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "ease-out", fill: "forwards" });
        await fade.current.finished.catch(() => {});
        if (token !== request.current) return;
      }
      const query = new URLSearchParams(location.search);
      for (const key of ["case", "component", "system", "part", "scenario", "aircraft"]) query.delete(key);
      navigate(`/aircraft/${next.id}?${query}`);
    } catch (cause) {
      if (token === request.current) { fade.current?.cancel(); setError(cause instanceof Error ? cause.message : "Could not open the selected aircraft."); }
    } finally { if (token === request.current) { locked.current = false; setPending(null); } }
  }
  const shown = data;
  const shownId = id;
  const active = data.advisories.filter(item => !["completed", "dismissed"].includes(item.status)).length;
  const components = data.systems.flatMap(system => system.components.map(component => ({ ...component, system: system.name })))
    .sort((a, b) => stateRank[b.state] - stateRank[a.state] || a.hi - b.hi);
  const model = airframeOf(data.aircraft as { id?: unknown; type?: unknown }).model;
  return <section ref={viewer} className={`aircraft-viewer${large ? " aircraft-viewer-large" : ""}`} aria-label="Aircraft digital twin showcase" aria-busy={Boolean(pending)}>
    <header className="aircraft-viewer-head"><div><span className="aircraft-viewer-eyebrow">{id}<i/>Aircraft visualisation</span><h2>{airframeOf(data.aircraft as { id?: unknown; type?: unknown }).title}</h2><p>Illustrative airframe · Drag to rotate</p></div>
      <div className="aircraft-viewer-actions"><span className="aircraft-viewer-condition"><i className={`twin-dot state-${data.state}`}/>{stateLabel[data.state]}</span>
        <Dialog.Root open={evidenceOpen} onOpenChange={setEvidenceOpen}>
          <Dialog.Trigger asChild><button type="button" className="twin-evidence-toggle" disabled={Boolean(pending)}>Component condition <Icon name="chevron" size={14}/></button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="o-overlay twin-panel-overlay"/><Dialog.Content className="o-drawer twin-component-panel" aria-describedby="twin-panel-context" onCloseAutoFocus={event => { if (exploringBlueprint.current) { event.preventDefault(); exploringBlueprint.current = false; document.getElementById("aircraft-workspace")?.focus({ preventScroll: true }); } }}>
      <header className="twin-panel-head"><div><Dialog.Title>Component condition</Dialog.Title><Dialog.Description id="twin-panel-context">{shownId} · {shortDate(shown.as_of)} · Synthetic records</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Close component condition"><Icon name="close" size={18}/></button></Dialog.Close></header>
      <div className="twin-panel-body">
      <div className="twin-evidence-heading"><p>{active ? `${active} open ${active === 1 ? "advisory" : "advisories"} for review` : "No open advisories in this snapshot"}</p></div>
      <div className="twin-component-list">{components.map(component => <Link key={component.id} to={`/health/${component.id}`} className="twin-component" aria-label={`View evidence for ${component.name}`} onClick={event => { if (pending) event.preventDefault(); }} aria-disabled={Boolean(pending)}>
        <div><strong>{component.name}</strong><span className={`twin-component-state state-${component.state}`}><i className={`twin-dot state-${component.state}`}/>{stateLabel[component.state]}</span></div>
        <p>{component.system}</p><div className="twin-component-values"><span>Health index <b>{num(component.hi)}<small>/100</small></b></span><span>Remaining life <b>{rulText(component.rul)}</b></span></div><span className="twin-evidence-link">View evidence <Icon name="arrow" size={14}/></span>
      </Link>)}</div>
      {!components.length && <p className="twin-evidence-empty">Component records unavailable.</p>}
      <details className="twin-model-source"><summary>Model accuracy and limits</summary><p>{airframeOf(shown.aircraft as { id?: unknown; type?: unknown }).basis}</p></details>
      </div>
      <footer className="twin-panel-footer"><button type="button" onClick={() => { exploringBlueprint.current = true; setEvidenceOpen(false); if (onExploreBlueprint) onExploreBlueprint(); else document.getElementById("aircraft-blueprint")?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" }); }}>Explore aircraft blueprint <Icon name="arrow" size={16}/></button></footer>
      </Dialog.Content></Dialog.Portal></Dialog.Root>
      </div>
    </header>
    <div className="aircraft-viewer-toolbar"><span className="aircraft-viewer-tool-label">Camera view</span><div className="aircraft-camera-controls" role="group" aria-label="Aircraft camera views">
      {(["front", "perspective", "profile", "top"] as const).map(name => <button type="button" key={name} aria-pressed={!manualView && view === name} disabled={Boolean(pending)} onClick={() => { setView(name); setManualView(false); setViewRevision(value => value + 1); }}>{name === "front" ? "Front" : name === "perspective" ? "3/4" : name === "profile" ? "Side" : "Top"}</button>)}
      <button type="button" aria-label="Reset aircraft camera" disabled={Boolean(pending)} onClick={() => { setView("perspective"); setManualView(false); setViewRevision(value => value + 1); }}><Icon name="history" size={14}/>Reset</button>
    </div><span className="aircraft-viewer-interaction">Drag to orbit · Select a view to reset</span></div>
    <section ref={stage} className="twin-showcase aircraft-viewer-stage" aria-label="Interactive aircraft model">
      <div className="twin-floor"/>
      <div ref={scene} className="twin-scene"><StudioBoundary key={model} model={model}><Suspense fallback={<StudioPoster model={model}/>}><Studio key={model} model={model} view={view} viewRevision={viewRevision} onOrbit={onOrbit} reduced={reduced} flowPose={flowPose}/></Suspense></StudioBoundary></div>
    </section>
    <footer className="aircraft-viewer-footer"><div className="twin-browse" aria-label="Browse aircraft"><button type="button" aria-label="Previous aircraft" disabled={Boolean(pending) || index <= 0} onClick={() => void step(-1)}><Icon name="arrow" size={16} style={{ transform: "rotate(180deg)" }}/></button><button type="button" aria-label="Next aircraft" disabled={Boolean(pending) || index < 0 || index >= rows.length - 1} onClick={() => void step(1)}><Icon name="arrow" size={16}/></button><span>{index >= 0 ? `Aircraft ${index + 1} of ${rows.length}` : "Aircraft count unavailable"}</span></div>
      {onExploreBlueprint && <button type="button" className="aircraft-viewer-explore" disabled={Boolean(pending)} onClick={onExploreBlueprint}>Explore aircraft <Icon name="arrow" size={16}/></button>}
    </footer>
      {pending && <span className="twin-notice" role="status">Opening {pending}…</span>}
      {error && <span className="twin-notice twin-error" role="alert">{error}</span>}
      {list.isError && <span className="twin-notice twin-error" role="alert">Aircraft browsing unavailable. <button onClick={() => void list.refetch()}>Retry</button></span>}
  </section>;
}
