import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const temp = await mkdtemp(join(tmpdir(), "agent-demo-e2e-"));
const resultPath = join(temp, "result.json");
const devPort = await freePort();
const appUrl = `http://localhost:${devPort}/`;
const dev = spawn("node", ["node_modules/vite/bin/vite.js", "--config", "example/vite.config.ts", "--port", String(devPort)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let browser;
let listener;
const output = [];
try {
  await waitForHttp(appUrl);
  listener = spawn("node", ["dist/cli.js", "listen", "--demo", "launch-review", "--url", appUrl, "--json", resultPath, "--timeout", "45"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const listenerExit = new Promise(resolve => listener.once("exit", resolve));
  listener.stdout.on("data", chunk => output.push(chunk.toString()));
  listener.stderr.on("data", chunk => output.push(chunk.toString()));
  const demoUrl = await waitForUrl(output, devPort);
  browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", error => output.push(`PAGE ERROR: ${error.message}\n`));
  await page.goto(demoUrl);
  const speed = page.getByRole("slider", { name: "Delay before each action" });
  await speed.focus();
  await page.keyboard.press("Home");
  if (await speed.inputValue() !== "0") throw new Error("Speed control did not change to instant");
  try { await page.getByText("Demo passed").waitFor({ timeout: 25000 }); }
  catch (error) { throw new Error(`${error.message}\nURL: ${page.url()}\nBODY: ${(await page.locator("body").innerText()).slice(0, 2000)}\nOUTPUT: ${output.join("")}`); }
  const code = await listenerExit;
  if (code !== 0) throw new Error(`CLI exited ${code}: ${output.join("")}`);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  if (result.status !== "passed" || result.steps.length < 30 || !result.steps.some(step => step.kind === "assertion") || !result.steps.some(step => step.label === "Open /workspace")) throw new Error(`Invalid result: ${JSON.stringify(result)}`);
  if (new URL(page.url()).pathname !== "/workspace/apollo") throw new Error(`Unexpected final route: ${page.url()}`);
  await writeFile(join(root, "example/e2e-result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`PASS: ${result.steps.length} steps, full navigation, live speed control, visible assertions, CLI JSON and zero exit code`);
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
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
