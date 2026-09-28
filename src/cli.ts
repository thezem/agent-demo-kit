#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { DemoResult } from "./index.js";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
if (args[0] !== "listen" || !option("--demo")) {
  console.error("Usage: agent-demo listen --demo ID [--url http://localhost:5173/] [--port 4179] [--timeout 120] [--json FILE]");
  process.exit(2);
}
const id = option("--demo")!;
const port = Number(option("--port") ?? "4179");
const timeout = Number(option("--timeout") ?? "120");
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeout) || timeout <= 0) {
  console.error("Invalid port or timeout"); process.exit(2);
}
const token = randomUUID();
const target = new URL(option("--url") ?? "http://localhost:5173/");
target.searchParams.set("demo", id);
target.searchParams.set("demoRun", token);
let finished = false;
const server = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type,x-agent-demo-token");
  response.setHeader("access-control-allow-methods", "POST,OPTIONS");
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  if (request.method !== "POST" || request.url !== "/result" || request.headers["x-agent-demo-token"] !== token) { response.writeHead(404).end(); return; }
  const chunks: Buffer[] = [];
  let size = 0;
  request.on("data", chunk => {
    size += chunk.length;
    if (size > 1024 * 1024) request.destroy();
    else chunks.push(chunk);
  });
  request.on("end", () => {
    if (finished) { response.writeHead(409).end(); return; }
    let result: DemoResult;
    try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { response.writeHead(400).end(); return; }
    if (result.version !== 1 || result.id !== id || !["passed", "failed", "stopped"].includes(result.status) || !Array.isArray(result.steps)) { response.writeHead(400).end(); return; }
    finished = true;
    response.writeHead(204).end();
    void finish(result);
  });
});
async function finish(result: DemoResult) {
  clearTimeout(timer);
  for (const step of result.steps) console.log(`${step.status === "passed" ? "✓" : "✕"} ${step.label}${step.error ? ` — ${step.error}` : ""}`);
  console.log(`${result.status.toUpperCase()} · ${(result.durationMs / 1000).toFixed(1)}s · ${result.url}`);
  if (result.error) console.error(result.error);
  const output = option("--json");
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  server.close();
  process.exitCode = result.status === "passed" ? 0 : 1;
}
const timer = setTimeout(() => { console.error(`Timed out waiting for demo ${id}`); server.close(); process.exitCode = 1; }, timeout * 1000);
server.on("error", error => { console.error(error.message); process.exitCode = 2; });
server.listen(port, "127.0.0.1", () => { console.log(`Open this URL to run the demo:\n${target.href}\nWaiting for ${id}...`); });
