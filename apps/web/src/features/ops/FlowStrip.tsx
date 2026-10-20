import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAdvisories, useSummary } from "./api";
import { pct } from "./format";
import { roleById, stageCounts, stages, useRole } from "./roles";

/** The shared decision flow. Every role sees where work sits and which step is theirs. */
export function FlowStrip({ compact = false }: { compact?: boolean }) {
  const location = useLocation();
  const advisories = useAdvisories();
  const summary = useSummary();
  const { role } = useRole();
  const counts = stageCounts(advisories.data);
  const forecast = summary.data?.forecast_30d.availability_mean as number | undefined;
  const scoped = (destination: string) => {
    const next = new URL(destination, window.location.origin);
    const current = new URLSearchParams(location.search);
    for (const key of ["aircraft", "component", "case", "as_of"]) {
      const value = current.get(key);
      if (value) next.searchParams.set(key, value);
    }
    return `${next.pathname}${next.search}${next.hash}`;
  };
  return <nav className={`o-flow-strip${compact ? " compact" : ""}`} aria-label="Maintenance decision flow">
    {stages.map(stage => {
      const mine = stage.owner === role.id;
      const current = stage.id === "review" ? location.pathname === "/advisories" : stage.id === "parts" ? location.pathname === "/spares" : location.pathname === "/maintenance" && (stage.id === "ready" ? location.hash === "#scheduled-work" : location.hash !== "#scheduled-work");
      return <Link key={stage.id} to={scoped(stage.to)} data-stage={stage.id} aria-current={current ? "step" : undefined} className={`o-flow-step${mine ? " mine" : ""}${counts[stage.id] ? " busy" : ""}`}>
        <span className="o-flow-num">{stage.step}</span>
        <span className="o-flow-text"><strong>{stage.label}</strong><small>{roleById[stage.owner].short}{mine ? " · you" : ""}</small></span>
        <b className="o-flow-count" data-active={Boolean(advisories.data && counts[stage.id])}>{advisories.data ? counts[stage.id] : "–"}</b>
        {!compact && <span className="o-flow-hint">{stage.hint}</span>}
      </Link>;
    })}
    <Link to="/dashboard" data-stage="availability" aria-current={location.pathname === "/dashboard" ? "step" : undefined} className={`o-flow-step outcome${role.id === "fleet_manager" ? " mine" : ""}`}>
      <span className="o-flow-num"><Icon name="aircraft" size={14}/></span>
      <span className="o-flow-text"><strong>30-day availability</strong><small>Fleet manager{role.id === "fleet_manager" ? " · you" : ""}</small></span>
      <b className="o-flow-count o-availability-value" data-active={forecast !== undefined} title="Simulated 30-day availability forecast">
        {forecast !== undefined ? pct(forecast) : "–"}
        {forecast !== undefined && <span className="o-availability-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, forecast)) * 100}%` }}/></span>}
      </b>
      {!compact && <span className="o-flow-hint">Expected over the next 30 days</span>}
    </Link>
  </nav>;
}
