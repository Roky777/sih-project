import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useSearchParams } from "react-router-dom";

type AsOfValue = { asOf: string | null; setAsOf: (value: string | null) => void };
const AsOfContext = createContext<AsOfValue>({ asOf: null, setAsOf: () => {} });
const storageKey = "ops:replay-as-of";

function readStored(): string | null {
  try { return window.sessionStorage.getItem(storageKey); } catch { return null; }
}

/** Replay date shared by every fleet-health screen. ``null`` means the latest engine state. */
export function AsOfProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const incoming = params.get("as_of");
  const validIncoming = incoming && /^\d{4}-\d{2}-\d{2}$/.test(incoming) && Number.isFinite(Date.parse(incoming)) ? incoming : null;
  const [asOf, setState] = useState<string | null>(() => validIncoming ?? readStored());
  useEffect(() => {
    if (validIncoming) {
      setState(validIncoming);
      try { window.sessionStorage.setItem(storageKey, validIncoming); } catch { /* optional storage */ }
    }
  }, [validIncoming]);
  const setAsOf = useCallback((value: string | null) => {
    setState(value);
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set("as_of", value); else next.delete("as_of");
      return next;
    }, { replace: true });
    try {
      if (value) window.sessionStorage.setItem(storageKey, value);
      else window.sessionStorage.removeItem(storageKey);
    } catch { /* storage unavailable: replay still works for this page view */ }
  }, [setParams]);
  const value = useMemo(() => ({ asOf, setAsOf }), [asOf, setAsOf]);
  return <AsOfContext.Provider value={value}>{children}</AsOfContext.Provider>;
}

export function useAsOf() { return useContext(AsOfContext); }

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function dayDiff(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
