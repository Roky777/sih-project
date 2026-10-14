import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAdvisories } from "./api";
import { LoadingCard } from "./ui";

/** Remembers the aircraft/component last opened so the sidebar's detail screens return to it. */
const keys = { aircraft: "ops:focus-aircraft", component: "ops:focus-component" } as const;
type Kind = keyof typeof keys;
function read(kind: Kind) { try { return window.sessionStorage.getItem(keys[kind]); } catch { return null; } }
export function useRememberFocus(kind: Kind, id: string | undefined) {
  useEffect(() => { if (id) { try { window.sessionStorage.setItem(keys[kind], id); } catch { /* convenience only */ } } }, [kind, id]);
}

/** Opens the remembered target, or the highest-priority open advisory when none is remembered. */
export function FocusRedirect({ kind }: { kind: Kind }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const explicit = params.get(kind === "component" ? "component" : "aircraft") ?? params.get(`${kind}Id`) ?? params.get("id");
  const remembered = explicit ?? read(kind);
  const suffix = `${location.search}${location.hash}`;
  const path = kind === "aircraft" ? "/aircraft" : params.get("dataset") === "research" ? "/components" : "/health";
  const advisories = useAdvisories(!remembered);
  if (remembered) return <Navigate to={`${path}/${encodeURIComponent(remembered)}${suffix}`} replace/>;
  if (advisories.isLoading) return <LoadingCard rows={6}/>;
  const top = advisories.data?.find(a => !["completed", "dismissed"].includes(a.status));
  if (!top) return <Navigate to={kind === "aircraft" ? "/aircraft" : "/advisories"} replace/>;
  return <Navigate to={kind === "aircraft" ? `/aircraft/${top.aircraft}` : `/health/${top.component_id}`} replace/>;
}
