import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAsOf } from "./AsOf";
import { fetchAircraftDetail, useAircraftList, type AircraftDetail } from "./api";
import { availabilityLabel, num, rulText, shortDate, stateLabel, stateRank } from "./format";
import "./twin-showcase.css";
import { airframeOf } from "./airframes";
import { FlowGrid } from "./FlowGrid";
import type { FlowSignal } from "./elasticGridMath";

const Studio = lazy(() => import("./TwinStudio").then(module => ({ default: module.TwinStudio })));
export type TwinMotion = { sequence: number; direction: number; started: number; duration: number; next: AircraftDetail };

class StudioBoundary extends Component<{ children: ReactNode; poster: string; title: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StudioPoster failed poster={this.props.poster} title={this.props.title}/> : this.props.children; }
}
export function StudioPoster({ failed = false, poster = "models/fighter-poster.svg", title = "Aircraft" }: { failed?: boolean; poster?: string; title?: string }) {
  return <div className="twin-poster"><img src={`${import.meta.env.BASE_URL}${poster}`} alt={`${title} illustrative preview`}/>
    <span role="status">{failed ? "3D view unavailable · Aircraft records remain available below" : "Preparing aircraft model…"}</span></div>;
}
function recordNumber(data: AircraftDetail, field: string) {
  const value = data.aircraft[field];
  return typeof value === "number" && Number.isFinite(value) ? num(value) : "Unavailable";
}

export function TwinShowcase({ data, onExploreBlueprint }: { data: AircraftDetail; onExploreBlueprint?: () => void }) {
  const id = String(data.aircraft.id);
  const list = useAircraftList();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { asOf } = useAsOf();
  const [motion, setMotion] = useState<TwinMotion | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const openingBlueprint = useRef(false);
  const [view, setView] = useState<"front" | "perspective" | "profile" | "top">("perspective");
  const [viewRevision, setViewRevision] = useState(0), [manualView, setManualView] = useState(false);
  const onOrbit = useCallback(() => setManualView(true), []);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  const locked = useRef(false);
  const stage = useRef<HTMLElement>(null);
  const flowPose = useRef<FlowSignal>({ x: .5, y: .56 });
  const browse = useRef<(direction: number) => void>(() => undefined);
  const rows = [...(list.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const index = rows.findIndex(row => row.id === id);
  const number = index < 0 ? 0 : index;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current++; if (timer.current) clearTimeout(timer.current); };
  }, []);
  // Route/replay changes invalidate an in-flight transition and its queued navigation.
  useEffect(() => {
    request.current++; locked.current = false;
    if (timer.current) clearTimeout(timer.current);
    setPending(null); setMotion(null); setError(""); setEvidenceOpen(false);
  }, [id, asOf]);

  async function changeAircraft(nextId: string, direction: number) {
    if (locked.current || nextId === id) return;
    locked.current = true;
    const token = ++request.current;
    setPending(nextId); setError("");
    try {
      const path = `/aircraft/${encodeURIComponent(nextId)}`;
      const nextParams = new URLSearchParams(params);
      for (const key of ["case", "component", "system"]) nextParams.delete(key);
      const destination = `${path}${nextParams.size ? `?${nextParams}` : ""}`;
      const next = await queryClient.fetchQuery({ queryKey: ["ops", "aircraft-detail", path, asOf], queryFn: () => fetchAircraftDetail(nextId, asOf) });
      if (!alive.current || token !== request.current) return;
      if (next.aircraft.id !== nextId) throw new Error("The aircraft response does not match your selection.");
      if (reduced) { navigate(destination); return; }
      const duration = 1450;
      setView("perspective");
      setManualView(false); setViewRevision(value => value + 1);
      setMotion({ sequence: token, direction, started: performance.now(), duration, next });
      timer.current = setTimeout(() => {
        if (alive.current && token === request.current) navigate(destination);
      }, duration);
    } catch (cause) {
      if (alive.current && token === request.current) {
        locked.current = false; setPending(null);
        setError(cause instanceof Error ? cause.message : "Could not open the selected aircraft.");
      }
    }
  }
  const step = (direction: number) => {
    if (rows.length < 2) return;
    const nextIndex = (number + direction + rows.length) % rows.length;
    void changeAircraft(rows[nextIndex].id, direction);
  };
  useEffect(() => { browse.current = step; });
  useEffect(() => {
    const surface = stage.current?.querySelector(".twin-scene");
    if (!surface) return;
    let distance = 0, lastWheel = 0;
    // Sideways browsing only: a horizontal trackpad swipe (or shift + wheel) changes aircraft;
    // ordinary vertical scrolling is left alone so the page scrolls normally.
    const wheel = (raw: Event) => {
      const event = raw as WheelEvent;
      const sideways = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
      if (event.ctrlKey || !sideways || (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;
      event.preventDefault();
      if (locked.current) { distance = 0; return; }
      const now = performance.now();
      if (now - lastWheel > 250) distance = 0;
      lastWheel = now;
      distance += sideways * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      if (Math.abs(distance) > 70) { browse.current(Math.sign(distance)); distance = 0; }
    };
    // Touch: a quick horizontal swipe on the stage (outside the orbitable canvas) browses.
    const host = stage.current!;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (event: TouchEvent) => { const target = event.target as Element; start = event.touches.length === 1 && !target.closest("canvas, button, select, a, [role=dialog]") ? { x: event.touches[0].clientX, y: event.touches[0].clientY, t: performance.now() } : null; };
    const up = (event: TouchEvent) => {
      if (!start || locked.current) return;
      const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - start.t < 600) browse.current(dx < 0 ? 1 : -1);
      start = null;
    };
    surface.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("touchstart", down, { passive: true }); host.addEventListener("touchend", up);
    return () => { surface.removeEventListener("wheel", wheel); host.removeEventListener("touchstart", down); host.removeEventListener("touchend", up); };
  }, []);
  const shown = motion?.next ?? data;
  const shownId = String(shown.aircraft.id);
  const active = shown.advisories.filter(item => !["completed", "dismissed"].includes(item.status)).length;
  const base = typeof shown.aircraft.base === "string" ? shown.aircraft.base.replace("BASE-", "Base ") : "Base unavailable";
  const components = shown.systems.flatMap(system => system.components.map(component => ({ ...component, system: system.name })))
    .sort((a, b) => stateRank[b.state] - stateRank[a.state] || a.hi - b.hi);
  return <section ref={stage} className={`twin-showcase${motion ? " is-changing" : ""}`} aria-label="Aircraft digital twin showcase" aria-busy={Boolean(pending)}
    onKeyDown={event => {
      if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); }
    }}>
    <div className="twin-masthead"><span><Icon name="aircraft" size={19}/> DIGITAL TWIN</span>
      <label className="twin-picker"><span className="sr-only">Select aircraft twin</span><select value={id} disabled={Boolean(pending) || !rows.length} onChange={event => void changeAircraft(event.target.value, rows.findIndex(row => row.id === event.target.value) >= number ? 1 : -1)}>{rows.length ? rows.map(row => <option key={row.id} value={row.id}>{row.id}</option>) : <option>{id}</option>}</select></label>
    </div>
    <div className="twin-heading" key={shownId}>
      <div><span className="twin-eyebrow">{base} <i>·</i> Synthetic aircraft record</span><h1>{shownId}<span>{airframeOf(shown.aircraft as { id?: unknown; type?: unknown }).subtitle}</span></h1></div>
      <div className="twin-condition"><strong><i className={`twin-dot state-${shown.state}`}/>{stateLabel[shown.state]}</strong><span>{availabilityLabel[shown.availability_state] ?? shown.availability_state}</span><small>{shown.replay ? "Replay" : "Snapshot"} · {shortDate(shown.as_of)}</small></div>
    </div>
    <div className="twin-floor"/>
    <FlowGrid stage={stage} pose={flowPose} reduced={reduced} paused={evidenceOpen}/>
    <div className="twin-scene" aria-label="Interactive aircraft model"><StudioBoundary key={airframeOf(data.aircraft).id} poster={airframeOf(data.aircraft).poster} title={airframeOf(data.aircraft).title}><Suspense fallback={<StudioPoster poster={airframeOf(data.aircraft).poster} title={airframeOf(data.aircraft).title}/>}><Studio model={airframeOf(data.aircraft as { id?: unknown; type?: unknown }).model} motion={motion} view={view} viewRevision={viewRevision} onOrbit={onOrbit} reduced={reduced} flowPose={flowPose}/></Suspense></StudioBoundary></div>
    <div className="twin-controls">
    <div className="twin-views" role="group" aria-label="Aircraft camera views">{(["front", "perspective", "profile", "top"] as const).map(name => <button type="button" key={name} aria-pressed={!manualView && view === name} disabled={Boolean(pending)} onClick={() => { setView(name); setManualView(false); setViewRevision(value => value + 1); }}>{name === "front" ? "Front view" : name === "perspective" ? "3/4 view" : name === "profile" ? "Side view" : "Top view"}</button>)}</div>
    <aside className="twin-evidence" aria-label="Selected aircraft component condition">
      <Dialog.Root open={evidenceOpen} onOpenChange={setEvidenceOpen}>
      <Dialog.Trigger asChild><button type="button" className="twin-evidence-toggle" disabled={Boolean(pending)}>Component condition <Icon name="chevron" size={14}/></button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="o-overlay twin-panel-overlay"/><Dialog.Content className="o-drawer twin-component-panel" aria-describedby="twin-panel-context" onCloseAutoFocus={event => { if (openingBlueprint.current) { event.preventDefault(); openingBlueprint.current = false; requestAnimationFrame(() => { if (onExploreBlueprint) onExploreBlueprint(); else document.getElementById("aircraft-blueprint")?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" }); }); } }}>
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
      <footer className="twin-panel-footer"><button type="button" onClick={() => { openingBlueprint.current = true; setEvidenceOpen(false); }}>Explore aircraft blueprint <Icon name="arrow" size={16}/></button></footer>
      </Dialog.Content></Dialog.Portal></Dialog.Root>
    </aside>
    </div>
    <div className="twin-browse" aria-label="Browse aircraft"><button type="button" aria-label="Previous aircraft" disabled={Boolean(pending) || rows.length < 2} onClick={() => step(-1)}><Icon name="arrow" size={22} style={{ transform: "rotate(180deg)" }}/></button><button type="button" className="twin-next" aria-label="Next aircraft" disabled={Boolean(pending) || rows.length < 2} onClick={() => step(1)}><Icon name="arrow" size={22}/></button><span>{index < 0 ? "—" : String(index + 1).padStart(2, "0")}<small>/ {list.data ? String(rows.length).padStart(2, "0") : "—"}</small></span></div>
    <div className="twin-stats" key={`stats-${shownId}`}>
      <dl><div><dt>Flight hours</dt><dd>{recordNumber(shown, "total_flight_hours")}<small>FH</small></dd></div><div><dt>Total cycles</dt><dd>{recordNumber(shown, "total_cycles")}</dd></div><div><dt>Health index</dt><dd>{num(shown.health_index)}<small>/ 100</small></dd></div><div><dt>Open advisories</dt><dd>{active.toString().padStart(2, "0")}</dd></div></dl>
      <button type="button" className="twin-details" disabled={Boolean(pending)} onClick={() => { if (onExploreBlueprint) onExploreBlueprint(); else document.getElementById("aircraft-blueprint")?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" }); }}>Explore blueprint <Icon name="arrow" size={22}/></button>
    </div>
    {pending && !motion && <span className="twin-notice" role="status">Opening {pending}…</span>}
    {error && <span className="twin-notice twin-error" role="alert">{error}</span>}
    {list.isError && <span className="twin-notice twin-error" role="alert">Aircraft browsing unavailable. <button onClick={() => void list.refetch()}>Retry</button></span>}
    <span className="sr-only" aria-live="polite">{pending ? `Opening ${pending}` : `${id}, ${stateLabel[data.state]}, ${active} open advisories`}</span>
  </section>;
}
