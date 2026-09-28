export type DemoStatus = "running" | "passed" | "failed" | "stopped";
export type StepResult = { label: string; kind: "action" | "assertion" | "note"; status: "passed" | "failed"; durationMs: number; error?: string };
export type DemoResult = { version: 1; id: string; status: DemoStatus; url: string; durationMs: number; steps: StepResult[]; error?: string };
export type Demo = { id: string; run: (context: DemoContext) => Promise<void> };
export type DemoVisuals = {
  moveTo(element: Element, mode: "pointer" | "text", signal: AbortSignal): Promise<void>;
  press(signal: AbortSignal): Promise<void>;
  type(signal: AbortSignal): Promise<void>;
  navigate(path: string, signal: AbortSignal): Promise<void>;
};

export type Locator = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  expectVisible(): Promise<void>;
  expectText(text: string): Promise<void>;
};
export type DemoContext = {
  page: {
    goto(path: string): Promise<void>;
    getByRole(role: string, options?: { name?: string }): Locator;
    getByPlaceholder(text: string): Locator;
    getByText(text: string): Locator;
    locator(selector: string): Locator;
  };
  show(message: string): Promise<void>;
};

export function demo(id: string, run: Demo["run"]): Demo {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error("Demo id must contain only letters, digits, _ or -");
  return { id, run };
}

type Progress = { next: number; steps: StepResult[]; startedAt: number; assertions: number };
type Update = (result: DemoResult, message: string) => void;
const DEFAULT_TIMEOUT = 5000;
const ROLES: Record<string, string> = { button: "button", link: "a", heading: "h1,h2,h3,h4,h5,h6", textbox: "input,textarea,[contenteditable='true']", checkbox: "input[type='checkbox']" };

function visible(el: Element): boolean {
  const html = el as HTMLElement;
  const style = getComputedStyle(html);
  return !!html.getClientRects().length && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0" && !html.closest("[hidden],[aria-hidden='true']");
}
function nameOf(el: Element): string {
  const aria = el.getAttribute("aria-label");
  const labelledBy = el.getAttribute("aria-labelledby");
  if (aria) return aria.trim();
  if (labelledBy) return labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ").trim();
  if (el instanceof HTMLInputElement) {
    if (el.labels?.length) return Array.from(el.labels).map(label => label.textContent ?? "").join(" ").trim();
    return el.value || el.placeholder;
  }
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}
async function findElement(find: () => Element[], description: string, signal: AbortSignal, timeout = DEFAULT_TIMEOUT): Promise<Element> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (signal.aborted) throw new Error("Demo stopped");
    const matches = find().filter(visible);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`${description} matched ${matches.length} visible elements; use a more specific locator`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${description} at ${location.pathname}`);
}

export function runDemo(selected: Demo, update: Update, signal: AbortSignal, getDelayMs: () => number = () => 400, visuals?: DemoVisuals): void {
  const key = `agent-demo:${selected.id}:${new URLSearchParams(location.search).get("demoRun") ?? "manual"}`;
  let progress: Progress;
  try { progress = JSON.parse(sessionStorage.getItem(key) ?? "null") || { next: 0, steps: [], startedAt: Date.now(), assertions: 0 }; }
  catch { progress = { next: 0, steps: [], startedAt: Date.now(), assertions: 0 }; }
  let index = 0;
  let message = "Starting demo";
  const result = (status: DemoStatus, error?: string): DemoResult => ({ version: 1, id: selected.id, status, url: location.href, durationMs: Date.now() - progress.startedAt, steps: progress.steps, ...(error ? { error } : {}) });
  const publish = (status: DemoStatus, error?: string) => update(result(status, error), message);
  signal.addEventListener("abort", () => {
    if (signal.reason === "user") {
      sessionStorage.removeItem(key);
      message = "Stopped by user";
      publish("stopped", "Stopped by user");
    }
  }, { once: true });
  const step = async (kind: StepResult["kind"], label: string, action: () => Promise<void | string>) => {
    const current = index++;
    if (current < progress.next) return;
    if (signal.aborted) throw new Error("Demo stopped");
    message = label;
    publish("running");
    const started = Date.now();
    try {
      if (kind === "action") {
        const waitingSince = Date.now();
        while (Date.now() - waitingSince < getDelayMs()) {
          if (signal.aborted) throw new Error("Demo stopped");
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      const destination = await action();
      progress.steps.push({ label, kind, status: "passed", durationMs: Date.now() - started });
      if (kind === "assertion") progress.assertions++;
      progress.next = current + 1;
      if (destination) sessionStorage.setItem(key, JSON.stringify(progress));
      publish("running");
      if (destination) {
        location.assign(destination);
        await new Promise<void>(() => {});
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      progress.steps.push({ label, kind, status: "failed", durationMs: Date.now() - started, error });
      throw cause;
    }
  };
  const makeLocator = (find: () => Element[], description: string): Locator => ({
    click: () => step("action", `Click ${description}`, async () => {
        const el = await findElement(find, description, signal);
        const anchor = el.closest("a[href]") as HTMLAnchorElement | null;
        const target = anchor && anchor.origin === location.origin ? anchor.href : null;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        await visuals?.moveTo(el, "pointer", signal);
        await visuals?.press(signal);
        if (target) {
          const url = new URL(target);
          url.searchParams.set("demo", selected.id);
          const run = new URLSearchParams(location.search).get("demoRun");
          if (run) url.searchParams.set("demoRun", run);
          return url.href;
        }
        (el as HTMLElement).click();
      }),
    fill: value => step("action", `Fill ${description}`, async () => {
      const el = await findElement(find, description, signal);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error(`${description} is not an input or textarea`);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      await visuals?.moveTo(el, "text", signal);
      await visuals?.type(signal);
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, "value")?.set;
      const write = (next: string) => { setter?.call(el, next); el.dispatchEvent(new Event("input", { bubbles: true })); };
      if (visuals && value.length > 0) {
        write("");
        const perCharacterMs = Math.min(28, Math.max(8, Math.floor(1600 / value.length)));
        for (let i = 1; i <= value.length; i++) {
          if (signal.aborted) throw new Error("Demo stopped");
          write(value.slice(0, i));
          await new Promise(resolve => setTimeout(resolve, perCharacterMs));
        }
      } else write(value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }),
    expectVisible: () => step("assertion", `Expect ${description} visible`, async () => { await findElement(find, description, signal); }),
    expectText: text => step("assertion", `Expect ${description} contains ${JSON.stringify(text)}`, async () => {
      await findElement(() => find().filter(el => (el.textContent ?? "").includes(text)), `${description} containing ${JSON.stringify(text)}`, signal);
    })
  });
  const context: DemoContext = {
    show: text => step("note", text, async () => {}),
    page: {
      goto: path => step("action", `Open ${path}`, async () => {
        const target = new URL(path, location.origin);
        if (target.origin !== location.origin) throw new Error("Demo navigation must stay on the current origin");
        target.searchParams.set("demo", selected.id);
        const run = new URLSearchParams(location.search).get("demoRun");
        if (run) target.searchParams.set("demoRun", run);
        await visuals?.navigate(target.pathname, signal);
        return target.href;
      }),
      getByRole: (role, options) => makeLocator(() => Array.from(document.querySelectorAll(`${ROLES[role] ?? ""}${ROLES[role] ? "," : ""}[role="${CSS.escape(role)}"]`)).filter(el => {
        if (role === "heading" && !/^H[1-6]$/.test(el.tagName) && el.getAttribute("role") !== role) return false;
        return options?.name === undefined || nameOf(el) === options.name;
      }), `${role}${options?.name ? ` named ${JSON.stringify(options.name)}` : ""}`),
      getByPlaceholder: text => makeLocator(() => Array.from(document.querySelectorAll("input,textarea")).filter(el => el.getAttribute("placeholder") === text), `placeholder ${JSON.stringify(text)}`),
      getByText: text => makeLocator(() => Array.from(document.querySelectorAll("body *")).filter(el => nameOf(el) === text && !Array.from(el.children).some(child => nameOf(child) === text)), `text ${JSON.stringify(text)}`),
      locator: selector => makeLocator(() => Array.from(document.querySelectorAll(selector)), `selector ${JSON.stringify(selector)}`)
    }
  };
  publish("running");
  void selected.run(context).then(() => {
    if (signal.aborted) return;
    sessionStorage.removeItem(key);
    if (progress.assertions === 0) publish("failed", "Demo has no assertions. Add expectVisible() or expectText().");
    else publish("passed");
  }).catch(cause => {
    if (signal.aborted) return;
    sessionStorage.removeItem(key);
    publish("failed", cause instanceof Error ? cause.message : String(cause));
  });
}
