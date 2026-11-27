import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import readline from "node:readline";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), "indigoq-smoke-"));
const version = JSON.parse(readFileSync(path.join(root, "package.json"))).version;
const exeName = process.platform === "win32" ? "indigoq-server.exe" : "indigoq-server";
const bundleName = `indigoQ-${version}-${process.platform}-${process.arch}-server`;
const archive = path.join(root, "dist", `${bundleName}.${process.platform === "win32" ? "zip" : "tar.gz"}`);
const executable = path.join(temp, bundleName, exeName);
let child;
async function start() {
  child = spawn(executable, ["--port", "0", "--no-browser"], { env: { ...process.env, INDIGOQ_DATA_FILE: path.join(temp, "graph.json") }, stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server readiness timeout")), 60000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      try { const event = JSON.parse(line); if (event.event === "ready") { clearTimeout(timer); resolve(event.url); } } catch { /* logs */ }
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exit;
  clearTimeout(timer);
}
try {
  execFileSync("tar", ["-xf", archive, "-C", temp]);
  console.log(`Testing relocated archive ${path.basename(archive)}`);
  let url = await start();
  assert.equal((await fetch(`${url}/api/health`).then(r => r.json())).status, "ok");
  for (const route of ["/", "/workspace/?id=smoke", "/examples/oscillator-lab.json"]) {
    const response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200, route);
  }
  const html = await fetch(url).then(r => r.text());
  const asset = html.match(/src="([^\"]+\.js[^\"]*)"/)[1];
  assert.equal((await fetch(`${url}${asset}`)).status, 200);
  assert.equal((await fetch(`${url}/api/not-a-route`)).status, 404);
  assert.equal((await fetch(`${url}/not-a-route`)).status, 404);
  const envelope = JSON.parse(readFileSync(path.join(root, "frontend/public/examples/oscillator-lab.json")));
  const graph = envelope.graph ?? envelope;
  const response = await fetch(`${url}/api/graph/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(graph) });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(readFileSync(path.join(temp, "graph.json"))).graph.workspaces.length, graph.workspaces.length);
  await stop();
  url = await start();
  assert.equal((await fetch(`${url}/api/graph`).then(r => r.json())).workspaces.length, graph.workspaces.length);
  console.log("Packaged server smoke test passed (UI, assets, API, import, persistence, restart).");
} finally {
  await stop();
  rmSync(temp, { recursive: true, force: true });
}
