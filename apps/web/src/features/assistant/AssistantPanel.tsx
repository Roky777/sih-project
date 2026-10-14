import * as Dialog from "@radix-ui/react-dialog";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { suggestionsFor, useAssistant, useOptionalAssistant, type ChatMessage, type ChatResponse, type Selection } from "./AssistantProvider";
import "./assistant.css";

type Artifact = Record<string, unknown> & { type: string; label?: string };
type Citation = ChatResponse["citations"][number];
const contextLabels: Record<keyof Selection, string> = { aircraft_id: "Aircraft", component_id: "Component", advisory_id: "Finding", part_number: "Part", scenario_id: "Scenario" };
const kindLabel: Record<string, string> = { observed: "Observed", forecast: "Model forecast", simulated: "Simulated", "observed + forecast": "Observed + forecast" };
const num = (value: unknown, digits = 2) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-GB", { maximumFractionDigits: digits }) : "—";
const pct = (value: unknown, digits = 1) => typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";
const signed = (value: unknown, suffix = "") => typeof value === "number" ? `${value > 0 ? "+" : ""}${num(value)}${suffix}` : "—";

/** Header entry point. Renders nothing when the feature is turned off on the server. */
export function AskAIButton({ floating = false }: { floating?: boolean }) {
  const assistant = useOptionalAssistant();
  if (!assistant?.enabled) return null;
  return <button type="button" className={`o-ask-ai${floating ? " floating" : ""}`} onClick={() => assistant.setOpen(true)} aria-label="Ask AeroCare maintenance copilot" aria-haspopup="dialog">
    <Icon name="spark" size={16}/><span>Ask AI</span>
  </button>;
}

/** Contextual entry point: opens the copilot with a record selected and a question drafted. */
export function ExplainWithAI({ selection, question, label = "Explain with AI" }: { selection: Selection; question: string; label?: string }) {
  const assistant = useOptionalAssistant();
  if (!assistant?.enabled) return null;
  return <button type="button" className="o-explain-ai" onClick={event => { event.stopPropagation(); assistant.explain(selection, question); }}><Icon name="spark" size={13}/>{label}</button>;
}

export function AssistantPanel() {
  const a = useAssistant();
  const location = useLocation();
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const previousUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    const user = a.messages.filter(m => m.role === "user").at(-1)?.id;
    if (user !== previousUser.current) follow.current = true;
    previousUser.current = user;
    if (follow.current) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [a.messages, a.open]);
  if (!a.enabled) return null;
  const available = a.status?.available ?? false;
  const canAsk = a.status?.enabled === true;
  const suggestions = suggestionsFor(location.pathname, a.selection);
  const chips = (Object.keys(contextLabels) as (keyof Selection)[]).filter(key => a.selection[key]);
  return <Dialog.Root open={a.open} onOpenChange={a.setOpen} modal={false}>
    <Dialog.Portal>
      <Dialog.Content className="o-ai-panel" aria-describedby="o-ai-desc" onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}>
        <header className="o-ai-head">
          <span className="o-ai-mark"><Icon name="spark" size={16}/></span>
          <div><Dialog.Title>AeroCare copilot</Dialog.Title><p id="o-ai-desc">Your fleet records, explained clearly</p></div>
          <button type="button" className="o-round-btn" onClick={a.clearConversation} aria-label="Clear conversation" title="Clear conversation" disabled={!a.messages.length}><Icon name="history" size={15}/></button>
          <Dialog.Close asChild><button type="button" className="o-round-btn" aria-label="Close copilot"><Icon name="close" size={15}/></button></Dialog.Close>
        </header>
        <section className="o-ai-context" aria-label="Copilot context">
          <span className="o-ai-date"><Icon name="clock" size={13}/>{a.selection.as_of ? `Replay ${a.selection.as_of}` : "Latest date"}</span>
          {chips.map(key => <span key={key} className="o-ai-chip">{contextLabels[key]} <b>{a.selection[key]}</b><button type="button" aria-label={`Remove ${contextLabels[key]} from context`} onClick={() => a.removeContext(key)}><Icon name="close" size={11}/></button></span>)}
          {!chips.length && <span className="o-ai-muted">Fleet context</span>}
          {a.pinned && <button type="button" className="o-link" onClick={a.followPage}>Use this page</button>}
        </section>
        {!available && <div className="o-ai-unavailable" role="status"><Icon name="warning" size={15}/><div><strong>AI explanations unavailable</strong><p>{a.statusError ? "Could not check the assistant service." : a.status?.detail ?? "Checking the model service…"} Record-based questions and charts remain available.</p></div><button type="button" className="o-btn sm ghost" onClick={a.refreshStatus}><Icon name="refresh" size={13}/>Retry</button></div>}
        <div className="o-ai-messages" ref={list} aria-live="polite" onScroll={() => {
          const el = list.current;
          if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}>
          {!a.messages.length && <div className="o-ai-empty"><span className="o-ai-welcome-mark"><Icon name="spark" size={24}/></span><h3>What would you like to check?</h3><p>Understand fleet availability, inspect a finding or check a spare. Start with a question below.</p><span className="o-ai-grounding">Record links accompany answers. Forecasts and simulations are labelled.</span></div>}
          {a.messages.map(message => <Message key={message.id} message={message}/>)}
        </div>
        {!a.busy && !a.messages.length && <div className="o-ai-suggestions" aria-label="Suggested questions">{suggestions.map(text => <button type="button" key={text} disabled={!canAsk || (!available && !["Summarise this aircraft.", "How do I add an aircraft?", "Why is my prediction unavailable?", "How do I approve maintenance?", "Explain this finding with evidence.", "What is the current availability?", "How many aircraft are in the fleet?", "What is the stock level?", "Explain the drop in fleet availability.", "What does the 30-day availability forecast show?", "Show the recent sensor trends behind this alert.", "What maintenance is open for this aircraft?"].includes(text))} onClick={() => a.ask(text)}>{text}</button>)}</div>}
        <form className="o-ai-input" onSubmit={event => { event.preventDefault(); a.ask(a.draft); }}>
          <label className="sr-only" htmlFor="o-ai-question">Ask the copilot</label>
          <textarea id="o-ai-question" ref={input} rows={2} maxLength={2000} value={a.draft} placeholder="Ask about this fleet…" disabled={!canAsk}
            onChange={event => a.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); a.ask(a.draft); } }}/>
          {a.busy ? <button type="button" className="o-btn sm ghost" onClick={a.cancel}><Icon name="close" size={13}/>Cancel</button>
            : <button type="submit" className="o-btn sm" disabled={!canAsk || !a.draft.trim()}><Icon name="arrow" size={13}/>Ask</button>}
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function Message({ message }: { message: ChatMessage }) {
  const a = useAssistant();
  if (message.role === "user") return <div className="o-ai-msg user"><p>{message.content}</p></div>;
  if (message.pending) return <div className="o-ai-msg bot" role="status">{message.content && <p>{message.content}</p>}<span className="o-ai-typing"><i/><i/><i/></span><span className="o-ai-muted">{message.content ? "Draft answer — checking references…" : "Checking AeroCare records…"}</span></div>;
  if (message.cancelled) return <div className="o-ai-msg bot"><p className="o-ai-muted">Cancelled.</p><button type="button" className="o-link" onClick={a.retry}>Ask again</button></div>;
  if (message.error) return <div className="o-ai-msg bot error" role="alert"><p><strong>{message.error.unavailable ? "The assistant is unavailable." : "The request failed."}</strong> {message.error.message}</p><p className="o-ai-muted">No answer was generated; nothing is shown in its place.</p><button type="button" className="o-btn sm ghost" onClick={a.retry}><Icon name="refresh" size={13}/>Retry</button></div>;
  const response = message.response!;
  const byId = new Map(response.citations.map(c => [c.id, c]));
  return <div className="o-ai-msg bot">
    <p className="o-ai-muted">{response.answer_mode === "records" ? "From application records" : response.answer_mode === "guidance" ? "AeroCare site guidance" : "AI explanation · inspect supporting evidence"}</p>
    <Reply text={message.content} citations={byId}/>
    {response.artifacts.map((artifact, i) => <ArtifactCard key={i} artifact={artifact as Artifact}/>)}
    {response.warnings.map(w => <p key={w} className="o-ai-warn"><Icon name="warning" size={13}/>{w}</p>)}
    {response.citations.length > 0 && <div className="o-ai-sources"><span>Sources</span>{response.citations.map(c => <Cite key={c.id} citation={c}/>)}</div>}
    <details className="o-ai-trace"><summary>Answer details · {message.context.as_of ? `as of ${message.context.as_of}` : "latest date"}</summary>
      {response.model && <p>Model: {response.model}</p>}<ul>{response.tool_calls.map((t, i) => <li key={i} className={t.ok ? "ok" : "bad"}><code>{t.name}</code> {JSON.stringify(t.arguments)} {t.ok ? "✓" : `— ${t.error}`}</li>)}</ul></details>
    <p className="o-ai-label">{response.data_label}</p>
  </div>;
}

function Cite({ citation }: { citation: Citation }) {
  const { setOpen } = useAssistant();
  const navigate = useNavigate();
  return <button type="button" className={`o-ai-cite${citation.cited ? " cited" : ""}`} title={citation.label}
    onClick={() => { navigate(citation.href); if (window.matchMedia("(max-width: 760px)").matches) setOpen(false); }}>{citation.id}</button>;
}

/** Plain-text answer with paragraphs, bullets, bold and inline citation links. */
function Reply({ text, citations }: { text: string; citations: Map<string, Citation> }) {
  const inline = (line: string) => line.split(/(\[[A-Z][A-Za-z0-9-]{2,79}\]|\*\*[^*]+\*\*)/g).map((part, i) => {
    const id = /^\[(.+)\]$/.exec(part)?.[1];
    if (id && citations.has(id)) return <Cite key={i} citation={citations.get(id)!}/>;
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
  const blocks = text.split(/\n{2,}/);
  return <div className="o-ai-reply">{blocks.map((block, i) => {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length && lines.every(l => /^\s*([-*•]|\d+\.)\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>)}</ul>;
    return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br/>}{inline(l.replace(/^#+\s*/, ""))}</Fragment>)}</p>;
  })}</div>;
}

function Badge({ label }: { label?: string }) {
  return label ? <span className={`o-ai-badge k-${label.split(" ")[0]}`}>{kindLabel[label] ?? label}</span> : null;
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  if (artifact.type === "series") return <SeriesCard artifact={artifact}/>;
  if (artifact.type === "prediction") return <PredictionCard artifact={artifact}/>;
  if (artifact.type === "table") return <TableCard artifact={artifact}/>;
  if (artifact.type === "scenario") return <ScenarioCard artifact={artifact}/>;
  return null;
}

function Card({ title, label, children, actions }: { title: string; label?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="o-ai-card"><header><strong>{title}</strong><Badge label={label}/></header>{children}{actions && <footer>{actions}</footer>}</section>;
}

function SeriesCard({ artifact }: { artifact: Artifact }) {
  const dates = (artifact.dates as string[]) ?? [];
  const series = (artifact.series as { name: string; values: (number | null)[] }[]) ?? [];
  const together = series.length > 1 && series.every(s => /^P\d0$/.test(s.name));
  const groups = together ? [series] : series.map(s => [s]);
  return <Card title={String(artifact.title)} label={artifact.label}>
    {groups.map((group, i) => <Spark key={i} group={group} dates={dates} unit={together ? String(artifact.unit ?? "") : ""}/>)}
    {dates.length > 0 && <p className="o-ai-axis"><span>{dates[0]}</span><span>{dates[dates.length - 1]}</span></p>}
  </Card>;
}

function Spark({ group, dates, unit }: { group: { name: string; values: (number | null)[] }[]; dates: string[]; unit: string }) {
  const all = group.flatMap(s => s.values).filter((v): v is number => typeof v === "number");
  if (!all.length) return <p className="o-ai-muted">{group[0]?.name}: no readings in this window.</p>;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1, w = 300, h = 54, n = Math.max(dates.length, ...group.map(s => s.values.length));
  const path = (values: (number | null)[]) => values.map((v, i) => v == null ? "" : `${i && values[i - 1] != null ? "L" : "M"}${(i / Math.max(n - 1, 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`).join("");
  const latest = group[0].values.filter((v): v is number => typeof v === "number").at(-1);
  return <figure className="o-ai-spark">
    <figcaption><span>{group.map(s => s.name).join(" · ")}{unit ? ` (${unit})` : ""}</span><b>{num(latest, 3)}</b></figcaption>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${group.map(s => s.name).join(", ")} from ${num(min, 3)} to ${num(max, 3)}`}>
      {group.map((s, i) => <path key={s.name} d={path(s.values)} className={i === 0 ? "main" : "band"}/>)}
    </svg>
    <p className="o-ai-axis"><span>min {num(min, 3)}</span><span>max {num(max, 3)}</span></p>
  </figure>;
}

function PredictionCard({ artifact }: { artifact: Artifact }) {
  const rul = artifact.rul_days as { p10: number; p50: number; p90: number } | undefined;
  return <Card title={String(artifact.title)} label={artifact.label} actions={<Link className="o-link" to={`/health/${String(artifact.component_id)}`}>Open component evidence <Icon name="arrow" size={12}/></Link>}>
    <dl className="o-ai-kv">
      <div><dt>Health index</dt><dd>{num(artifact.health_index, 1)} <small>/ 100</small></dd></div>
      <div><dt>Failure risk 14 d</dt><dd>{pct(artifact.risk_14d)}</dd></div>
      <div><dt>Failure risk 30 d</dt><dd>{pct(artifact.risk_30d)}</dd></div>
      <div><dt>Remaining life</dt><dd>{rul ? `${num(rul.p50, 1)} d` : "—"} <small>{rul ? `P10–P90 ${num(rul.p10, 1)}–${num(rul.p90, 1)} d` : ""}</small></dd></div>
      <div><dt>Priority</dt><dd>{String(artifact.priority ?? "—")}</dd></div>
      <div><dt>Confidence</dt><dd>{String(artifact.confidence ?? "—")}</dd></div>
    </dl>
    <p className="o-ai-muted">Recommended: {String(artifact.action ?? "—")} — a proposal for engineer review, not a flight clearance.</p>
  </Card>;
}

function TableCard({ artifact }: { artifact: Artifact }) {
  const columns = (artifact.columns as string[]) ?? [], rows = (artifact.rows as unknown[][]) ?? [];
  return <Card title={String(artifact.title)} label={artifact.label}>
    <div className="o-ai-table"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === "number" ? num(cell, 3) : String(cell ?? "—")}</td>)}</tr>)}</tbody></table></div>
  </Card>;
}

function ScenarioCard({ artifact }: { artifact: Artifact }) {
  const { resetScenario, setOpen } = useAssistant();
  const navigate = useNavigate();
  const b = artifact.baseline as Record<string, number>, s = artifact.scenario as Record<string, number>;
  const d = artifact.delta as { availability_pct_points: number; aircraft_days_lost: number; by_cause: Record<string, number> };
  const affected = (artifact.most_affected_aircraft as { aircraft: string; delta_aircraft_days: number }[]) ?? [];
  const stockouts = (artifact.stockouts as { part_number: string; baseline: number; scenario: number }[]) ?? [];
  const reset = Boolean(artifact.reset);
  return <Card title={`What-if · ${String(artifact.name).replace(/^Copilot: /, "")}`} label="simulated" actions={<>
    <button type="button" className="o-btn sm" onClick={() => { setOpen(false); navigate(String(artifact.simulator_href)); }}><Icon name="sliders" size={13}/>Open in Simulator</button>
    <button type="button" className="o-btn sm ghost" disabled={reset} onClick={() => resetScenario(String(artifact.scenario_id))}><Icon name="history" size={13}/>{reset ? "Scenario reset" : "Reset scenario"}</button></>}>
    {reset && <p className="o-ai-muted">Removed from this conversation's context. The saved run stays in the Simulator list; records and the baseline plan were never changed.</p>}
    <dl className="o-ai-assume"><dt>Baseline</dt><dd>{String(artifact.baseline_assumptions)}</dd><dt>Scenario</dt><dd>{String(artifact.scenario_assumptions)}</dd>
      <dt>Horizon</dt><dd>{num(artifact.horizon_days, 0)} days · {num(artifact.runs, 0)} Monte Carlo runs · same random numbers for both</dd></dl>
    <div className="o-ai-table"><table><thead><tr><th/><th>Baseline</th><th>Scenario</th><th>Difference</th></tr></thead><tbody>
      <tr><th>Mean availability</th><td>{pct(b.availability_mean)}</td><td>{pct(s.availability_mean)}</td><td className={d.availability_pct_points < 0 ? "neg" : "pos"}>{signed(d.availability_pct_points, " pts")}</td></tr>
      <tr><th>P10–P90</th><td>{pct(b.availability_p10, 0)}–{pct(b.availability_p90, 0)}</td><td>{pct(s.availability_p10, 0)}–{pct(s.availability_p90, 0)}</td><td/></tr>
      <tr><th>Aircraft-days lost</th><td>{num(b.aircraft_days_lost, 1)}</td><td>{num(s.aircraft_days_lost, 1)}</td><td className={d.aircraft_days_lost > 0 ? "neg" : "pos"}>{signed(d.aircraft_days_lost)}</td></tr>
      {Object.entries(d.by_cause ?? {}).filter(([, v]) => Math.abs(v) >= .05).map(([cause, v]) => <tr key={cause}><th>· {cause.replace(/_/g, " ")}</th><td/><td/><td className={v > 0 ? "neg" : "pos"}>{signed(v, " d")}</td></tr>)}
    </tbody></table></div>
    {affected.length > 0 && <p className="o-ai-muted">Most affected: {affected.map(x => `${x.aircraft} (${signed(x.delta_aircraft_days, " d")})`).join(", ")}</p>}
    {stockouts.length > 0 && <p className="o-ai-muted">Stock-out probability: {stockouts.map(x => `${x.part_number} ${pct(x.baseline, 0)} → ${pct(x.scenario, 0)}`).join(", ")}</p>}
  </Card>;
}
