import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { api, apiStream, ApiError } from "../../shared/api/client";
import type { components } from "../../shared/api/generated/schema";
import { useAsOf } from "../ops/AsOf";

type S = components["schemas"];
export type ChatResponse = S["AssistantChatResponse"];
export type AssistantStatus = S["AssistantStatusResponse"];
export type Selection = { aircraft_id?: string; component_id?: string; advisory_id?: string; part_number?: string; scenario_id?: string };
export type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string;
  response?: ChatResponse; error?: { message: string; unavailable: boolean }; pending?: boolean; cancelled?: boolean;
  context: Selection & { as_of?: string | null };
};

const KEYS = ["aircraft_id", "component_id", "advisory_id", "part_number", "scenario_id"] as const;
const STORE = "fleet:assistant:conversation";

/** What the current page is about (aircraft, component, part), derived from the URL only. */
export function pageSelection(pathname: string, search: string): Selection {
  const params = new URLSearchParams(search);
  const component = /^\/health\/([^/]+)/.exec(pathname)?.[1];
  const registration = /^\/aircraft\/registered\/(REG-[a-f0-9]{20})/.exec(pathname)?.[1];
  const aircraft = registration ?? /^\/aircraft\/(AC-\d{3})/.exec(pathname)?.[1] ?? component?.match(/^(AC-\d{3})-/)?.[1] ?? params.get("aircraft") ?? undefined;
  const part = params.get("part") ?? undefined;
  return { aircraft_id: aircraft, component_id: component ? decodeURIComponent(component) : params.get("component") ?? undefined, part_number: pathname.startsWith("/spares") ? part : undefined };
}

export function suggestionsFor(pathname: string, selection: Selection): string[] {
  if (pathname.startsWith("/aircraft/registered/")) return ["Summarise this aircraft.", "Why is my prediction unavailable?", "What maintenance is open for this aircraft?"];
  if (selection.advisory_id || pathname.startsWith("/health/")) return ["Explain this finding with evidence.", "Show the recent sensor trends behind this alert.", "Compare starting the replacement now, in 7 or in 14 days.", "Is the spare for this finding available?"];
  if (pathname.startsWith("/aircraft/")) return ["Show the evidence behind this aircraft's alert.", "Which findings on this aircraft need attention first, and why?", "What maintenance is open for this aircraft?"];
  if (pathname.startsWith("/spares")) return selection.part_number
    ? ["What is the stock level?", "What changes if this spare arrives two days late?", "Which planned work depends on this part?"]
    : ["Which spare shortages affect the current plan?", "What changes if FUE-220 arrives two days late?"];
  if (pathname.startsWith("/maintenance")) return ["Compare feasible maintenance schedules for the top finding.", "Which spare shortages affect the current plan?", "What if we add one bay at AG-BASE?"];
  if (pathname.startsWith("/simulator")) return ["What changes if FUE-220 arrives two days late?", "What if we add one bay at AG-BASE?", "What if all open P1 findings are replaced early?"];
  if (pathname.startsWith("/advisories")) return ["Which findings need attention first, and why?", "Which spare shortages affect the current plan?"];
  return ["What is the current availability?", "How many aircraft are in the fleet?", "Explain the drop in fleet availability.", "Which findings need attention first, and why?"];
}

type Value = {
  enabled: boolean; status: AssistantStatus | undefined; statusError: boolean; refreshStatus: () => void;
  open: boolean; setOpen: (open: boolean) => void;
  messages: ChatMessage[]; busy: boolean;
  selection: Selection & { as_of?: string | null }; pageContext: Selection; pinned: Selection | null;
  draft: string; setDraft: (text: string) => void;
  ask: (text: string) => void; cancel: () => void; retry: () => void; clearConversation: () => void;
  explain: (selection: Selection, question?: string) => void;
  removeContext: (key: keyof Selection) => void; followPage: () => void; resetScenario: (scenarioId: string) => void;
};
const AssistantContext = createContext<Value | null>(null);

function load(): ChatMessage[] {
  try { const raw = window.sessionStorage.getItem(STORE); return raw ? (JSON.parse(raw) as ChatMessage[]).filter(m => !m.pending) : []; } catch { return []; }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { asOf } = useAsOf();
  const status = useQuery({ queryKey: ["assistant", "status"], queryFn: () => api<AssistantStatus>("/assistant/status"), retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  // Shown while the first status check is in flight so the header does not shift; hidden as
  // soon as the server reports the feature off (or the endpoint is absent).
  const enabled = status.data ? status.data.enabled : !status.isError;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(load);
  const [pinned, setPinned] = useState<Selection | null>(null);
  const [cleared, setCleared] = useState<(keyof Selection)[]>([]);
  const [scenarioId, setScenarioId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const pageContext = useMemo(() => pageSelection(location.pathname, location.search), [location.pathname, location.search]);
  const selection = useMemo(() => {
    const base: Selection = { ...(pinned ?? pageContext), scenario_id: scenarioId };
    for (const key of cleared) delete base[key];
    return { ...Object.fromEntries(KEYS.filter(k => base[k]).map(k => [k, base[k]])), as_of: asOf } as Selection & { as_of?: string | null };
  }, [pinned, pageContext, scenarioId, cleared, asOf]);
  useEffect(() => {
    // Persist completed turns only, after streaming settles; synchronous storage must
    // not serialize the conversation for every generated token.
    const timer = window.setTimeout(() => {
      try { window.sessionStorage.setItem(STORE, JSON.stringify(messages.filter(m => !m.pending).slice(-40))); } catch { /* per-viewer convenience */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback((history: ChatMessage[], text: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const user: ChatMessage = { id: `u${Date.now()}`, role: "user", content: text, context: selection };
    const reply: ChatMessage = { id: `a${Date.now()}`, role: "assistant", content: "", pending: true, context: selection };
    setMessages([...history, user, reply]);
    const turns = [...history.filter(m => !m.pending && !m.error && !m.cancelled && m.content), user].map(m => ({ role: m.role, content: m.content })).slice(-12);
    const timeout = AbortSignal.timeout(300_000);
    let completed: ChatResponse | undefined;
    apiStream("/assistant/chat/stream", { method: "POST", body: JSON.stringify({ messages: turns, context: selection }), signal: AbortSignal.any([controller.signal, timeout]) }, event => {
      if (!event || typeof event !== "object" || !("type" in event)) throw new Error("Invalid answer event.");
      if (event.type === "delta") {
        if (!("text" in event) || typeof event.text !== "string") throw new Error("Invalid answer text.");
        const text = event.text;
        setMessages(list => list.map(m => m.id === reply.id ? { ...m, content: m.content + text } : m));
      } else if (event.type === "reset") {
        setMessages(list => list.map(m => m.id === reply.id ? { ...m, content: "" } : m));
      } else if (event.type === "error") {
        throw new ApiError("message" in event && typeof event.message === "string" ? event.message : "The answer failed.", 503);
      } else if (event.type === "done") {
        if (!("response" in event) || !isChatResponse(event.response)) throw new Error("Invalid completed answer.");
        completed = event.response;
      }
    }).then(() => {
      if (!completed) throw new Error("The answer stream ended before completion.");
      return completed;
    })
      .then(response => {
        if (response.context.scenario_id) setScenarioId(response.context.scenario_id);
        setMessages(list => list.map(m => m.id === reply.id ? { ...m, pending: false, content: response.reply, response } : m));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) { setMessages(list => list.map(m => m.id === reply.id ? { ...m, pending: false, cancelled: true } : m)); return; }
        const unavailable = error instanceof ApiError ? error.status === 503 || error.status === 404 : true;
        const message = timeout.aborted ? "The assistant did not answer within 5 minutes." : error instanceof Error ? error.message : "The request failed.";
        setMessages(list => list.map(m => m.id === reply.id ? { ...m, pending: false, error: { message, unavailable } } : m));
        if (unavailable) void status.refetch();
      })
      .finally(() => { if (abort.current === controller) abort.current = null; });
  }, [selection, status]);

  const value: Value = {
    enabled, status: status.data, statusError: status.isError, refreshStatus: () => void status.refetch(),
    open, setOpen, messages, busy: messages.some(m => m.pending), selection, pageContext, pinned, draft, setDraft,
    ask: text => { const trimmed = text.trim(); if (trimmed && !messages.some(m => m.pending)) { setDraft(""); send(messages, trimmed); } },
    cancel: () => abort.current?.abort(),
    retry: () => {
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (!lastUser) return;
      const index = messages.lastIndexOf(lastUser);
      send(messages.slice(0, index), lastUser.content);
    },
    clearConversation: () => { abort.current?.abort(); setMessages([]); setScenarioId(undefined); },
    explain: (next, question) => { setPinned(next); setCleared([]); setOpen(true); if (question) setDraft(question); },
    removeContext: key => { if (key === "scenario_id") setScenarioId(undefined); else setCleared(list => [...new Set([...list, key])]); },
    followPage: () => { setPinned(null); setCleared([]); },
    resetScenario: id => { if (scenarioId === id) setScenarioId(undefined); setMessages(list => list.map(m => ({ ...m, response: m.response && { ...m.response, artifacts: m.response.artifacts.map(a => a.scenario_id === id ? { ...a, reset: true } : a) } }))); },
  };
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

function isChatResponse(value: unknown): value is ChatResponse {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const nullableString = (v: unknown) => v == null || typeof v === "string";
  if (!record(value)) return false;
  const r = value;
  return typeof r.reply === "string" && typeof r.model === "string" && typeof r.data_label === "string"
    && record(r.context) && ["as_of", ...KEYS].every(key => nullableString(r.context && (r.context as Record<string, unknown>)[key]))
    && Array.isArray(r.tool_calls) && r.tool_calls.every(t => record(t) && typeof t.name === "string" && record(t.arguments) && typeof t.ok === "boolean" && nullableString(t.error))
    && Array.isArray(r.artifacts) && r.artifacts.every(a => record(a) && typeof a.type === "string")
    && Array.isArray(r.citations) && r.citations.every(c => record(c) && [c.id, c.kind, c.label, c.href].every(s => typeof s === "string") && typeof c.cited === "boolean" && typeof c.href === "string" && c.href.startsWith("/") && !c.href.startsWith("//"))
    && Array.isArray(r.warnings) && r.warnings.every(w => typeof w === "string");
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
/** Safe outside the provider (e.g. isolated page tests): returns null. */
export function useOptionalAssistant() { return useContext(AssistantContext); }
