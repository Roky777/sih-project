import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
export function PageHeader({ eyebrow, title, description, actions, level = "page" }: { level?: "page" | "section"; eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className={`page-title${level === "section" ? " section-title" : ""}`}><div>{level === "page" && <span className="eyebrow">{eyebrow}</span>}{level === "section" ? <h2>{title}</h2> : <h1>{title}</h1>}<p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function StatCard({ label, value, detail, icon, tone = "neutral" }: { label: string; value: ReactNode; detail: string; icon: IconName; tone?: "neutral" | "warning" | "success" | "blue" }) {
  return <article className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={18}/></span></div><strong className="stat-value">{value}</strong><small>{detail}</small></article>;
}
export function RefreshButton({ fetching, onClick }: { fetching: boolean; onClick: () => void }) {
  return <button className="secondary" onClick={onClick} disabled={fetching}><Icon name="refresh" size={16}/>{fetching ? "Refreshing…" : "Refresh"}</button>;
}
export function Notice({ title, children, tone = "info" }: { title: string; children: ReactNode; tone?: "info" | "warning" | "success" }) {
  return <div className={`notice ${tone}`}><Icon name={tone === "warning" ? "warning" : tone === "success" ? "check" : "file"} size={20}/><div><strong>{title}</strong><p>{children}</p></div></div>;
}
