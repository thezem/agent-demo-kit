import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const temp = await mkdtemp(join(tmpdir(), "agent-demo-e2e-"));
const resultPath = join(temp, "result.json");
const openedUrlPath = join(temp, "opened-url.txt");
const devPort = await freePort();
let resultPort = await freePort();
while (resultPort === devPort) resultPort = await freePort();
const appUrl = `http://localhost:${devPort}/`;
const dev = spawn("node", ["node_modules/vite/bin/vite.js", "--config", "example/vite.config.ts", "--port", String(devPort)], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VITE_AGENT_DEMO_PORT: String(resultPort) } });
let browser;
let listener;
const output = [];
try {
  await waitForHttp(appUrl);
  const testOpener = process.platform === "linux";
  if (testOpener) {
    const fakeOpener = join(temp, "xdg-open");
    await writeFile(fakeOpener, "#!/bin/sh\nprintf '%s' \"$1\" > \"$AGENT_DEMO_OPEN_URL_FILE\"\n");
    await chmod(fakeOpener, 0o755);
  }
  listener = spawn("node", ["dist/cli.js", testOpener ? "run" : "listen", "--demo", "launch-review", "--url", appUrl, "--port", String(resultPort), "--json", resultPath, "--timeout", "45"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: testOpener ? { ...process.env, PATH: `${temp}:${process.env.PATH}`, AGENT_DEMO_OPEN_URL_FILE: openedUrlPath } : process.env });
  const listenerExit = new Promise(resolve => listener.once("exit", resolve));
  listener.stdout.on("data", chunk => output.push(chunk.toString()));
  listener.stderr.on("data", chunk => output.push(chunk.toString()));
  const demoUrl = testOpener ? await waitForOpenedUrl(openedUrlPath) : await waitForUrl(output, devPort);
  browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", error => output.push(`PAGE ERROR: ${error.message}\n`));
  await page.goto(demoUrl);
  const speed = page.getByRole("slider", { name: "Delay before each action" });
  await speed.focus();
  await page.keyboard.press("Home");
  if (await speed.inputValue() !== "0") throw new Error("Speed control did not change to instant");
  await page.locator("[data-demo-cursor]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-demo-cursor][data-mode="text"]').waitFor({ state: "visible", timeout: 15000 });
  try { await page.getByText("Demo passed").waitFor({ timeout: 25000 }); }
  catch (error) { throw new Error(`${error.message}\nURL: ${page.url()}\nBODY: ${(await page.locator("body").innerText()).slice(0, 2000)}\nOUTPUT: ${output.join("")}`); }
  const code = await listenerExit;
  if (code !== 0) throw new Error(`CLI exited ${code}: ${output.join("")}`);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  if (result.status !== "passed" || result.steps.length < 30 || !result.steps.some(step => step.kind === "assertion") || !result.steps.some(step => step.label === "Open /workspace")) throw new Error(`Invalid result: ${JSON.stringify(result)}`);
  if (new URL(page.url()).pathname !== "/workspace/apollo") throw new Error(`Unexpected final route: ${page.url()}`);
  const withoutCursor = await context.newPage();
  await withoutCursor.goto(`${appUrl}?demo=launch-review-no-cursor`);
  if (await withoutCursor.locator("[data-demo-cursor]").count()) throw new Error("Cursor opt-out rendered a cursor");
  await withoutCursor.getByText("Demo passed").waitFor({ timeout: 25000 });
  if (await withoutCursor.locator("[data-demo-cursor]").count()) throw new Error("Cursor opt-out rendered a cursor after navigation");
  await writeFile(join(root, "example/e2e-result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`PASS: ${result.steps.length} steps, animated cursor, cursor opt-out, browser opening, full navigation, CLI JSON and zero exit code`);
  console.log("Repeatable result: example/e2e-result.json");
} finally {
  await browser?.close();
  listener?.kill();
  dev.kill();
  await rm(temp, { recursive: true, force: true });
}
async function waitForHttp(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Dev server did not start");
}
async function waitForUrl(chunks, port) {
  const pattern = new RegExp(`http://localhost:${port}/\\?demo=launch-review&demoRun=[a-f0-9-]+`);
  for (let i = 0; i < 100; i++) {
    const match = chunks.join("").match(pattern);
    if (match) return match[0];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Listener did not print a URL: ${chunks.join("")}`);
}
async function waitForOpenedUrl(path) {
  for (let i = 0; i < 100; i++) {
    try { const url = await readFile(path, "utf8"); if (url.startsWith("http://")) return url; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The CLI did not open the demo URL");
}
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
