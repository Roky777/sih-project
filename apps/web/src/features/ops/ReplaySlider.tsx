import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "../../shared/ui/Icon";
import { addDays, dayDiff, useAsOf } from "./AsOf";
import { useEngine } from "./api";
import { longDate } from "./format";

/** Inline time-replay slider (UI spec §2): scrub the operational date across the replay window. */
export function ReplaySlider() {
  const engine = useEngine();
  const { asOf, setAsOf } = useAsOf();
  const [playing, setPlaying] = useState(false);
  const from = engine.data?.replay_from, to = engine.data?.replay_to;
  const span = from && to ? dayDiff(from, to) : 0;
  const current = asOf ?? to ?? null;
  const offset = current && from ? dayDiff(from, current) : span;
  const [draft, setDraft] = useState(offset);
  useEffect(() => setDraft(offset), [offset]);
  const commit = (value: number) => { if (!from || !to) return; const clamped = Math.max(0, Math.min(span, value)); setAsOf(clamped >= span ? null : addDays(from, clamped)); };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (offset >= span) { setPlaying(false); return; }
      commitRef.current(offset + 1);
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, offset, span]);
  if (!from || !to) return null;
  const replaying = Boolean(asOf);
  return <div className={`o-replay-inline${replaying ? " replaying" : ""}`} title={`Replay scored history ${longDate(from)} – ${longDate(to)}. Decisions are recorded only at the latest date.`}>
    <button type="button" className="o-replay-play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => { if (offset >= span) commit(Math.max(0, span - 30)); setPlaying(value => !value); }}><Icon name={playing ? "pause" : "play"} size={12}/></button>
    <input type="range" min={0} max={span} value={draft} aria-label="Operational date" aria-valuetext={longDate(addDays(from, draft))}
      onChange={event => setDraft(Number(event.target.value))} onPointerUp={() => commit(draft)} onKeyUp={() => commit(draft)}
      style={{ "--fill": `${(draft / Math.max(span, 1)) * 100}%` } as CSSProperties}/>
    <span className="o-replay-date">{replaying ? "REPLAY " : "T0 "}{longDate(addDays(from, draft)).toUpperCase()}</span>
    {replaying && <button type="button" className="o-replay-live" onClick={() => { setPlaying(false); setAsOf(null); }}>LIVE</button>}
  </div>;
}

export function HeadingReplay() {
  return null;
}
