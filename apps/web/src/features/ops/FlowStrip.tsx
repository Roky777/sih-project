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
  return <nav className={`o-flow-strip${compact ? " compact" : ""}`} aria-label="Maintenance decision flow">
    {stages.map(stage => {
      const mine = stage.owner === role.id;
      const current = stage.id === "review" ? location.pathname === "/advisories" : stage.id === "parts" ? location.pathname === "/spares" : location.pathname === "/maintenance" && (stage.id === "ready" ? location.hash === "#scheduled-work" : location.hash !== "#scheduled-work");
      return <Link key={stage.id} to={stage.to} aria-current={current ? "step" : undefined} className={`o-flow-step${mine ? " mine" : ""}${counts[stage.id] ? " busy" : ""}`}>
        <span className="o-flow-num">{stage.step}</span>
        <span className="o-flow-text"><strong>{stage.label}</strong><small>{roleById[stage.owner].short}{mine ? " · you" : ""}</small></span>
        <b className="o-flow-count">{advisories.data ? counts[stage.id] : "–"}</b>
        {!compact && <span className="o-flow-hint">{stage.hint}</span>}
      </Link>;
    })}
    <Link to="/dashboard" aria-current={location.pathname === "/dashboard" ? "step" : undefined} className={`o-flow-step outcome${role.id === "fleet_manager" ? " mine" : ""}`}>
      <span className="o-flow-num"><Icon name="aircraft" size={14}/></span>
      <span className="o-flow-text"><strong>30-day availability</strong><small>Fleet manager{role.id === "fleet_manager" ? " · you" : ""}</small></span>
      <b className="o-flow-count">{forecast !== undefined ? pct(forecast) : "–"}</b>
      {!compact && <span className="o-flow-hint">Expected over the next 30 days</span>}
    </Link>
  </nav>;
}
