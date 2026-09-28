import { useEffect, useRef, useState } from "react";
import { runDemo, type Demo, type DemoResult } from "./index.js";

export type DemoRunnerProps = {
  demos: Demo[];
  enabled?: boolean;
  /** Initial delay before each action, in milliseconds. Viewers can change it on the card. */
  paceMs?: number;
  port?: number;
};

const SPEED_KEY = "agent-demo:action-delay";
const clamp = (value: number) => Math.max(0, Math.min(5000, Math.round(value / 100) * 100));

/** Mount once near the app root. Demo execution is explicitly opt-in. */
export function DemoRunner({ demos, enabled = false, paceMs = 800, port = 4179 }: DemoRunnerProps) {
  const [state, setState] = useState<{ result: DemoResult; message: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [delayMs, setDelayMs] = useState(() => {
    try { const saved = Number(localStorage.getItem(SPEED_KEY)); return localStorage.getItem(SPEED_KEY) === null || !Number.isFinite(saved) ? clamp(paceMs) : clamp(saved); }
    catch { return clamp(paceMs); }
  });
  const delayRef = useRef(delayMs);
  const controllerRef = useRef<AbortController | null>(null);
  const changeDelay = (value: number) => {
    const next = clamp(value);
    delayRef.current = next;
    setDelayMs(next);
    try { localStorage.setItem(SPEED_KEY, String(next)); } catch { /* Private browsing can disable storage. */ }
  };
  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(location.search);
    const id = params.get("demo");
    if (!id) return;
    const chosen = demos.find(item => item.id === id);
    if (!chosen) {
      setState({ result: { version: 1, id, status: "failed", url: location.href, durationMs: 0, steps: [], error: `Unknown demo: ${id}` }, message: "Unknown demo" });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const onUpdate = (result: DemoResult, message: string) => {
      setState({ result, message });
      document.dispatchEvent(new CustomEvent("agent-demo:result", { detail: result }));
      if (result.status !== "running") {
        const token = params.get("demoRun");
        if (token) {
          void fetch(`http://127.0.0.1:${port}/result`, {
            method: "POST", headers: { "content-type": "application/json", "x-agent-demo-token": token },
            body: JSON.stringify(result), keepalive: true
          }).catch(() => {});
        }
      }
    };
    runDemo(chosen, onUpdate, controller.signal, () => delayRef.current);
    return () => { controller.abort(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [demos, enabled, paceMs, port]);
  if (!enabled || !state) return null;
  const { result, message } = state;
  return <aside aria-label="Agent demo" style={{ position: "fixed", zIndex: 2147483647, bottom: 20, right: 20, width: collapsed ? "auto" : "min(330px, calc(100vw - 40px))", padding: 16, border: "1px solid #3a3d45", borderRadius: 12, background: "#17191d", color: "#f1f0ed", boxShadow: "0 12px 36px #0006", font: "13px/1.5 system-ui, sans-serif" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <strong>{result.status === "running" ? "▶" : result.status === "passed" ? "✓" : "✕"} {result.id}</strong>
      <button type="button" onClick={() => setCollapsed(!collapsed)} style={buttonStyle} aria-label={collapsed ? "Expand demo" : "Collapse demo"}>{collapsed ? "+" : "−"}</button>
    </div>
    {!collapsed && <>
      <p style={{ margin: "10px 0" }}>{result.status === "failed" ? result.error : result.status === "passed" ? "Demo passed" : message}</p>
      <div style={{ color: "#a9abb2" }}>{result.steps.length} steps · {result.steps.filter(step => step.kind === "assertion").length} checks · {(result.durationMs / 1000).toFixed(1)}s</div>
      <label style={{ display: "block", marginTop: 14, color: "#f1f0ed" }} htmlFor="agent-demo-delay">Delay before each action <strong style={{ float: "right" }}>{delayMs === 0 ? "Instant" : `${(delayMs / 1000).toFixed(1)}s`}</strong></label>
      <input id="agent-demo-delay" aria-label="Delay before each action" type="range" min="0" max="5000" step="100" value={delayMs} onChange={event => changeDelay(Number(event.target.value))} style={{ display: "block", width: "100%", margin: "9px 0 0", accentColor: "#c6bfdf" }} />
      <div style={{ display: "flex", justifyContent: "space-between", color: "#a9abb2", fontSize: 11 }}><span>Instant</span><span>5 seconds</span></div>
      {result.status === "running" && <button type="button" onClick={() => { controllerRef.current?.abort("user"); const url = new URL(location.href); url.searchParams.delete("demo"); url.searchParams.delete("demoRun"); history.replaceState(history.state, "", url); }} style={{ ...buttonStyle, marginTop: 10 }}>Stop demo</button>}
    </>}
  </aside>;
}
const buttonStyle: React.CSSProperties = { color: "#f1f0ed", background: "#3a3d45", border: 0, borderRadius: 5, cursor: "pointer", padding: "3px 8px" };
