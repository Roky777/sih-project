import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const eventName = "fleet:theme";
function current(): Theme {
  try { return localStorage.getItem("ops:theme") === "dark" ? "dark" : "light"; }
  catch { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => { if (!event.key || event.key === "ops:theme") notify(); };
  window.addEventListener(eventName, notify);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener("storage", storage); };
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("ops:theme", theme); } catch { /* The preference still applies for this session. */ }
  window.dispatchEvent(new Event(eventName));
}
export function useThemePreference() {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as const);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return [theme, setTheme] as const;
}
