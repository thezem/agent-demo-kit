import { useEffect, useRef, useState } from "react";
import { runDemo, type Demo, type DemoResult, type DemoVisuals } from "./index.js";

export type DemoRunnerProps = {
  demos: Demo[];
  enabled?: boolean;
  /** Initial delay before each action. The viewer can change it on the card. */
  paceMs?: number;
  /** Show an animated in-page collaborator cursor. Defaults to true. */
  showCursor?: boolean;
  port?: number;
};

const SPEED_KEY = "agent-demo:action-delay";
const clamp = (value: number) => Math.max(0, Math.min(5000, Math.round(value / 100) * 100));
const formatDelay = (value: number) => value === 0 ? "Instant" : `${(value / 1000).toFixed(1)}s`;
type CursorState = { visible: boolean; x: number; y: number; mode: "pointer" | "text" | "navigate"; label: string; pressed: boolean; pressId: number };
const initialCursor: CursorState = { visible: false, x: 28, y: 28, mode: "pointer", label: "agent demo", pressed: false, pressId: 0 };

function waitForMotion(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Demo stopped"));
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(new Error("Demo stopped")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Mount once near the app root. Demo execution is explicitly opt-in. */
export function DemoRunner({ demos, enabled = false, paceMs = 800, showCursor = true, port = 4179 }: DemoRunnerProps) {
  const [state, setState] = useState<{ result: DemoResult; message: string } | null>(null);
  const [cursor, setCursor] = useState<CursorState>(initialCursor);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [delayMs, setDelayMs] = useState(() => {
    try {
      const saved = localStorage.getItem(SPEED_KEY);
      return saved === null || !Number.isFinite(Number(saved)) ? clamp(paceMs) : clamp(Number(saved));
    } catch { return clamp(paceMs); }
  });
  const delayRef = useRef(delayMs);
  const controllerRef = useRef<AbortController | null>(null);
  const changeDelay = (value: number) => {
    const next = clamp(value);
    delayRef.current = next;
    setDelayMs(next);
    try { localStorage.setItem(SPEED_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
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
    setCursor(initialCursor);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visuals: DemoVisuals | undefined = showCursor ? {
      moveTo: async (element, mode, signal) => {
        await waitForMotion(reducedMotion ? 0 : 120, signal);
        const rect = element.getBoundingClientRect();
        const x = mode === "text" ? rect.left + Math.min(22, rect.width / 2) : rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        setCursor(current => ({ ...current, visible: true, x, y, mode, label: mode === "text" ? "typing" : "agent demo", pressed: false }));
        await waitForMotion(reducedMotion ? 0 : 320, signal);
      },
      press: async signal => {
        setCursor(current => ({ ...current, mode: "pointer", label: "click", pressed: true, pressId: current.pressId + 1 }));
        await waitForMotion(reducedMotion ? 0 : 150, signal);
        setCursor(current => ({ ...current, label: "agent demo", pressed: false }));
      },
      type: async signal => {
        setCursor(current => ({ ...current, mode: "text", label: "typing", pressed: false }));
        await waitForMotion(reducedMotion ? 0 : 80, signal);
      },
      navigate: async (path, signal) => {
        setCursor(current => ({ ...current, visible: true, x: Math.min(innerWidth - 52, Math.max(52, innerWidth / 2)), y: 58, mode: "navigate", label: `opening ${path}`, pressed: false }));
        await waitForMotion(reducedMotion ? 0 : 420, signal);
      }
    } : undefined;
    const onUpdate = (result: DemoResult, message: string) => {
      setState({ result, message });
      document.dispatchEvent(new CustomEvent("agent-demo:result", { detail: result }));
      if (result.status !== "running") {
        const token = params.get("demoRun");
        if (token) void fetch(`http://127.0.0.1:${port}/result`, {
          method: "POST", headers: { "content-type": "application/json", "x-agent-demo-token": token },
          body: JSON.stringify(result), keepalive: true
        }).catch(() => {});
      }
    };
    runDemo(chosen, onUpdate, controller.signal, () => delayRef.current, visuals);
    return () => { controller.abort(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [demos, enabled, paceMs, showCursor, port]);
  if (!enabled || !state) return null;

  const { result, message } = state;
  const running = result.status === "running";
  const checks = result.steps.filter(step => step.kind === "assertion").length;
  const recent = result.steps.slice(-3).reverse();
  const stop = () => {
    controllerRef.current?.abort("user");
    const url = new URL(location.href);
    url.searchParams.delete("demo");
    url.searchParams.delete("demoRun");
    history.replaceState(history.state, "", url);
  };
  const replay = () => {
    const url = new URL(location.href);
    url.searchParams.set("demo", result.id);
    url.searchParams.delete("demoRun");
    location.assign(url);
  };
  const copyResult = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };

  return <>
    <style>{CARD_CSS}</style>
    {showCursor && cursor.visible && running && <div className={`adk-cursor adk-cursor-${cursor.mode}${cursor.pressed ? " adk-cursor-pressed" : ""}`} data-demo-cursor data-mode={cursor.mode} style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }} aria-hidden="true">
      {cursor.mode === "text" ? <svg className="adk-cursor-glyph" viewBox="0 0 20 26" width="20" height="26"><path d="M9 2v22M4 2h10M4 24h10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg> : <svg className="adk-cursor-glyph" viewBox="0 0 24 28" width="24" height="28"><path d="M2 2v21l5.7-6 4.6 9 3.3-1.7-4.5-8.7 8.5-.8L2 2Z" fill="#f5f3f0" stroke="#242424" strokeWidth="1.8" strokeLinejoin="round"/></svg>}
      {cursor.pressed && <span key={cursor.pressId} className="adk-cursor-ring"/>}
      <span className="adk-cursor-label">{cursor.label}</span>
    </div>}
    <aside className={`adk-card${collapsed ? " adk-collapsed" : ""}`} aria-label="Agent demo">
      <div className="adk-head">
        <span className="adk-mark" aria-hidden="true"><i/><i/><i/></span>
        <span className="adk-brand">agent demo <small>IN YOUR BROWSER</small></span>
        <span className={`adk-state adk-${result.status}`}><i/>{result.status}</span>
        <button className="adk-icon" type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand demo" : "Collapse demo"} title={collapsed ? "Expand demo" : "Collapse demo"}>{collapsed ? "+" : "−"}</button>
      </div>
      {!collapsed && <>
        <div className="adk-main" aria-live="polite">
          <div className="adk-overline">{running ? `STEP ${result.steps.length + 1}` : "RUN RESULT"}</div>
          <div className="adk-current">{running ? message : result.status === "passed" ? "Demo passed" : result.error ?? message}</div>
          <div className="adk-demo-id">{result.id}</div>
        </div>
        <div className="adk-metrics"><span><b>{result.steps.length}</b><small>steps done</small></span><span><b>{checks}</b><small>checks</small></span><span><b>{(result.durationMs / 1000).toFixed(1)}s</b><small>elapsed</small></span></div>
        {recent.length > 0 && <div className="adk-recent"><span className="adk-section-name">RECENT</span>{recent.map((step, index) => <div className="adk-row" key={`${result.steps.length - index}-${step.label}`}><span aria-hidden="true" className={step.status === "passed" ? "adk-ok" : "adk-bad"}>{step.status === "passed" ? "✓" : "×"}</span><span>{step.label}</span></div>)}</div>}
        <div className="adk-speed"><label htmlFor="agent-demo-delay">Delay before each action <strong>{formatDelay(delayMs)}</strong></label><input id="agent-demo-delay" aria-label="Delay before each action" type="range" min="0" max="5000" step="100" value={delayMs} onChange={event => changeDelay(Number(event.target.value))}/><div className="adk-scale"><span>Instant</span><span>5 seconds</span></div></div>
        <div className="adk-actions">{running ? <button type="button" onClick={stop}>Stop demo</button> : <><button type="button" onClick={replay}>Replay</button><button type="button" onClick={copyResult}>{copied ? "Copied" : "Copy result"}</button></>}</div>
      </>}
    </aside>
  </>;
}

const CARD_CSS = `
.adk-cursor{position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none;will-change:transform;transition:transform .32s cubic-bezier(.2,.8,.2,1)}.adk-cursor-glyph{display:block;filter:drop-shadow(0 2px 2px #0008)}.adk-cursor-text .adk-cursor-glyph{transform:translate(-9px,-13px)}.adk-cursor-label{position:absolute;top:21px;left:19px;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#d2c8dd;color:#252229;border:1px solid #eee6f2;border-radius:5px;padding:4px 7px;font:600 11px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 3px 9px #0004}.adk-cursor-text .adk-cursor-label{top:15px;left:8px}.adk-cursor-ring{position:absolute;top:-10px;left:-10px;width:23px;height:23px;border:2px solid #d9cde3;border-radius:50%;animation:adk-click .28s ease-out forwards}@keyframes adk-click{from{transform:scale(.45);opacity:1}to{transform:scale(1.6);opacity:0}}
.adk-card{position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(370px,calc(100vw - 40px));color:#ecebe8;background:#252525;border:1px solid #464646;border-radius:14px;box-shadow:0 18px 48px #0007;font:13px/1.45 system-ui,-apple-system,sans-serif;overflow:hidden;text-align:left}
.adk-card *{box-sizing:border-box}.adk-card button,.adk-card input{font:inherit}.adk-card button{cursor:pointer}.adk-card button:focus-visible,.adk-card input:focus-visible{outline:2px solid #d9d4e4;outline-offset:3px}
.adk-head{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid #414141}.adk-mark{width:22px;height:22px;border:1px solid #aaa9a6;border-radius:5px;display:flex;flex-direction:column;justify-content:center;gap:3px;padding:4px}.adk-mark i{display:block;height:1px;background:#e2e1de}.adk-mark i:nth-child(2){width:70%}.adk-mark i:nth-child(3){width:45%}.adk-brand{font-weight:650;letter-spacing:-.025em;line-height:1.12;flex:1}.adk-brand small{display:block;color:#999996;font-size:8px;font-weight:500;letter-spacing:.13em;margin-top:3px}.adk-state{font-size:11px;color:#b6b5b1;text-transform:capitalize;display:flex;align-items:center;gap:6px}.adk-state i{width:6px;height:6px;border-radius:50%;background:#d1cadd}.adk-state.adk-passed i{background:#a9c9b2}.adk-state.adk-failed i,.adk-state.adk-stopped i{background:#dfa79e}.adk-icon{width:25px;height:25px;display:grid;place-items:center;border:0;background:transparent;color:#b8b8b5;font-size:17px;padding:0}.adk-icon:hover{color:#fff}
.adk-main{padding:20px 18px 18px;min-height:100px}.adk-overline,.adk-section-name{color:#bdb4cc;font-size:9px;font-weight:700;letter-spacing:.15em}.adk-current{font-size:18px;line-height:1.27;letter-spacing:-.02em;margin:9px 0 8px;overflow-wrap:anywhere}.adk-demo-id{font:10px/1.3 ui-monospace,SFMono-Regular,monospace;color:#92928e}.adk-metrics{display:grid;grid-template-columns:repeat(3,1fr);border-block:1px solid #414141}.adk-metrics span{padding:12px 15px}.adk-metrics span+span{border-left:1px solid #414141}.adk-metrics b{font-size:14px;font-weight:600;display:block}.adk-metrics small{font-size:10px;color:#aaa9a5}.adk-recent{padding:15px 18px 13px;border-bottom:1px solid #414141}.adk-row{display:flex;gap:9px;color:#adada9;font-size:11px;line-height:1.35;margin-top:9px;white-space:nowrap;overflow:hidden}.adk-row span:last-child{overflow:hidden;text-overflow:ellipsis}.adk-ok{color:#aec7b1}.adk-bad{color:#dfa79e}.adk-speed{padding:16px 18px 14px}.adk-speed label{display:flex;justify-content:space-between;gap:10px;color:#cececb;font-size:12px}.adk-speed label strong{color:#f0efec;font-weight:600}.adk-speed input{width:100%;margin:15px 0 5px;accent-color:#c4bccf;display:block}.adk-scale{display:flex;justify-content:space-between;color:#92928e;font-size:10px}.adk-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 18px 17px}.adk-actions button{background:#393939;color:#e6e5e1;border:1px solid #565656;border-radius:7px;padding:7px 11px;font-size:11px}.adk-actions button:hover{background:#494949}.adk-actions button:first-child:last-child{margin-left:auto}.adk-collapsed{width:min(270px,calc(100vw - 40px))}.adk-collapsed .adk-head{border-bottom:0}
@media(max-width:480px){.adk-card{right:10px;bottom:10px;width:min(370px,calc(100vw - 20px))}}
@media(prefers-reduced-motion:reduce){.adk-cursor{transition:none}.adk-cursor-ring{animation:none}.adk-card *{scroll-behavior:auto!important;transition:none!important}}
`;
