import { HeadingReplay } from "./ReplaySlider";
import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../shared/ui/Icon";
import type { HealthState } from "./api";
import { stateLabel } from "./format";

export function StateBadge({ state, compact = false }: { state: HealthState; compact?: boolean }) {
  return <span className={`o-state o-state-${state}${compact ? " compact" : ""}`}><i aria-hidden="true"/>{stateLabel[state]}</span>;
}
export function PriorityBadge({ level }: { level: string }) {
  return <span className={`o-priority o-priority-${level.toLowerCase()}`} title={`Priority ${level}`}>{level}</span>;
}
export function Pill({ tone = "neutral", children, icon }: { tone?: string; children: ReactNode; icon?: IconName }) {
  return <span className={`o-pill o-pill-${tone}`}>{icon && <Icon name={icon} size={13}/>}{children}</span>;
}

export function Card({ title, subtitle, actions, children, className = "", id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={`o-card ${className}`} id={id} aria-label={typeof title === "string" ? title : undefined}>
    {(title || actions) && <header className="o-card-head"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="o-card-actions">{actions}</div>}</header>}
    {children}
  </section>;
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduceMotion() || from === value) { setShown(value); return; }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 650);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}

export function Sparkline({ data, tone = "accent", height = 34, band }: { data: number[]; tone?: string; height?: number; band?: [number[], number[]] }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return null;
  const all = band ? [...data, ...band[0], ...band[1]] : data;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const width = 120;
  const x = (i: number, n: number) => (i / (n - 1)) * width;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i, data.length).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${width},${height}L0,${height}Z`;
  return <svg className={`o-spark o-tone-${tone}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    {band && <path className="o-spark-band" d={`${band[1].map((v, i) => `${i ? "L" : "M"}${x(i, band[1].length)},${y(v)}`).join("")}${[...band[0]].reverse().map((v, i, arr) => `L${x(arr.length - 1 - i, arr.length)},${y(v)}`).join("")}Z`}/>}
    <path d={area} fill={`url(#g${id})`}/>
    <path d={line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export function Kpi({ label, value, format, detail, icon, tone = "accent", spark, footer, onClick }: {
  label: string; value: number | null; format: (value: number) => string; detail?: ReactNode; icon: IconName; tone?: string; spark?: number[]; footer?: ReactNode; onClick?: () => void;
}) {
  const content = <>
    <div className="o-kpi-top"><span className={`o-kpi-icon o-tone-${tone}`}><Icon name={icon} size={17}/></span><span className="o-kpi-label">{label}</span></div>
    <strong className="o-kpi-value">{value === null ? "—" : <CountUp value={value} format={format}/>}</strong>
    {detail && <div className="o-kpi-detail">{detail}</div>}
    {spark && <Sparkline data={spark} tone={tone}/>}
    {footer && <div className="o-kpi-footer">{footer}</div>}
  </>;
  return onClick ? <button type="button" className="o-kpi interactive" onClick={onClick}>{content}</button> : <article className="o-kpi">{content}</article>;
}

export function RangeBar({ p10, p50, p90, max = 60 }: { p10: number; p50: number; p90: number; max?: number }) {
  const at = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return <span className="o-range" title={`RUL p10 ${p10.toFixed(0)} · p50 ${p50.toFixed(0)} · p90 ${p90.toFixed(0)} days`} aria-hidden="true">
    <span className="o-range-band" style={{ left: at(p10), width: `calc(${at(p90)} - ${at(p10)})` }}/>
    <span className="o-range-mid" style={{ left: at(p50) }}/>
  </span>;
}
export function RiskBar({ value }: { value: number }) {
  const tone = value >= 0.7 ? "critical" : value >= 0.35 ? "degraded" : value >= 0.15 ? "watch" : "healthy";
  return <span className="o-riskbar" aria-hidden="true"><span className={`o-bg-${tone}`} style={{ width: `${Math.max(2, value * 100)}%` }}/></span>;
}
export function Ring({ value, size = 64, tone = "accent", label }: { value: number; size?: number; tone?: string; label?: string }) {
  const radius = size / 2 - 5, circumference = 2 * Math.PI * radius;
  return <span className={`o-ring o-tone-${tone}`} style={{ width: size, height: size }} role="img" aria-label={label ?? `${value.toFixed(0)} of 100`}>
    <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={radius} className="o-ring-track"/><circle cx={size / 2} cy={size / 2} r={radius} className="o-ring-value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}/></svg>
    <strong>{value.toFixed(0)}</strong>
  </span>;
}

export function Skeleton({ height = 16, width = "100%", radius = 8 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="o-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true"/>;
}
export function LoadingCard({ rows = 4 }: { rows?: number }) {
  return <div className="o-loading" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={i === 0 ? 22 : 14} width={i === 0 ? "40%" : `${90 - i * 12}%`}/>)}</div>;
}
export function ErrorState({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  return <div className="o-state-box error" role="alert"><Icon name="warning" size={22}/><div><strong>Couldn’t load this view</strong><p>{error?.message ?? "Unknown error"}</p></div>{onRetry && <button type="button" className="o-btn" onClick={onRetry}><Icon name="refresh" size={15}/>Retry</button>}</div>;
}
export function EmptyState({ title, children, icon = "check" }: { title: string; children?: ReactNode; icon?: IconName }) {
  return <div className="o-state-box empty"><span className="o-empty-icon"><Icon name={icon} size={20}/></span><div><strong>{title}</strong>{children && <p>{children}</p>}</div></div>;
}
type QueryLike<T> = { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => unknown };
export function Query<T>({ query, children, rows }: { query: QueryLike<T>; children: (data: T) => ReactNode; rows?: number }) {
  if (query.isLoading) return <LoadingCard rows={rows}/>;
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()}/>;
  if (query.data === undefined) return <LoadingCard rows={rows}/>;
  return <>{children(query.data)}</>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; label: string }) {
  return <div className="o-segmented" role="group" aria-label={label}>{options.map(([key, text]) => <button type="button" key={key} aria-pressed={value === key} className={value === key ? "on" : ""} onClick={() => onChange(key)}>{text}</button>)}</div>;
}
export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: readonly (readonly [T, string, IconName?])[]; onChange: (value: T) => void }) {
  return <div className="o-tabs" role="tablist">{tabs.map(([key, text, icon], index) => <button type="button" role="tab" key={key} tabIndex={value === key ? 0 : -1} aria-selected={value === key} className={value === key ? "on" : ""} onClick={() => onChange(key)} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
    onChange(tabs[next][0]);
  }}>{icon && <Icon name={icon} size={15}/>}{text}</button>)}</div>;
}

export function Drawer({ open, onOpenChange, title, subtitle, children, width = 560, className = "", overlayClassName = "" }: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number; className?: string; overlayClassName?: string }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className={`o-overlay ${overlayClassName}`}/><Dialog.Content className={`o-drawer ${className}`} style={{ width: `min(${width}px, 100vw)` }} aria-describedby={undefined}>
    <header className="o-drawer-head"><div><Dialog.Title>{title}</Dialog.Title>{subtitle && <p>{subtitle}</p>}</div><Dialog.Close asChild><button type="button" className="o-icon-btn" aria-label="Close"><Icon name="close" size={18}/></button></Dialog.Close></header>
    <div className="o-drawer-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Modal({ open, onOpenChange, title, children, width = 520 }: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; children: ReactNode; width?: number }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="o-modal" style={{ width: `min(${width}px, calc(100vw - 32px))` }} aria-describedby={undefined}>
    <header className="o-drawer-head"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button type="button" className="o-icon-btn" aria-label="Close"><Icon name="close" size={18}/></button></Dialog.Close></header>
    <div className="o-modal-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

type Toast = { id: number; tone: "success" | "error" | "info"; title: string; body?: string };
const ToastContext = createContext<(toast: Omit<Toast, "id">) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts(items => [...items.slice(-3), { ...toast, id }]);
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 5200);
  }, []);
  return <ToastContext.Provider value={push}>{children}<div className="o-toasts" role="status" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`o-toast ${toast.tone}`}><Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "warning" : "info"} size={18}/><div><strong>{toast.title}</strong>{toast.body && <p>{toast.body}</p>}</div><button type="button" className="o-icon-btn" aria-label="Dismiss notification" onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))}><Icon name="close" size={14}/></button></div>)}</div></ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }

export function PageHead({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return <header className="o-page-head"><div>{eyebrow && <span className="o-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}{children}</div>{actions && <div className="o-page-actions">{actions}</div>}<HeadingReplay/></header>;
}
