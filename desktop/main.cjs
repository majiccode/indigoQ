const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const readline = require("node:readline");

let backend;
let origin;
let quitting = false;
let log;
const smokeTest = process.argv.includes("--smoke-test");
if (smokeTest) {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

function localUrl(value) {
  try { return new URL(value).origin === origin; } catch { return false; }
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 800, minHeight: 600,
    title: "indigoQ", show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (localUrl(target)) {
      createWindow(target);
    } else if (/^https?:/.test(target)) {
      void shell.openExternal(target);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    if (!localUrl(target)) {
      event.preventDefault();
      if (/^https?:/.test(target)) void shell.openExternal(target);
    }
  });
  void window.loadURL(url);
  return window;
}

async function startBackend() {
  const executable = process.platform === "win32" ? "indigoq-server.exe" : "indigoq-server";
  const root = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "dist", "server", "indigoq-server");
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  log = fs.createWriteStream(path.join(app.getPath("userData"), "server.log"), { flags: "a" });
  backend = spawn(path.join(root, executable), ["--port", "0", "--no-browser", "--parent-pid", String(process.pid)], {
    windowsHide: true,
    env: { ...process.env, INDIGOQ_DATA_FILE: path.join(app.getPath("userData"), "graph.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stderr.pipe(log);
  backend.stdout.pipe(log);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The local server did not start within 60 seconds.")), 60000);
    backend.once("error", (error) => { clearTimeout(timer); reject(error); });
    backend.once("exit", (code) => {
      clearTimeout(timer);
      if (!origin) reject(new Error(`The local server exited (${code}). See server.log in ${app.getPath("userData")}.`));
      else if (!quitting) {
        if (!smokeTest) dialog.showErrorBox("indigoQ server stopped", "Please restart indigoQ. Your saved graph is preserved.");
        app.exit(1);
      }
    });
    readline.createInterface({ input: backend.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.event === "ready" && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) {
          origin = message.url;
          clearTimeout(timer);
          resolve(origin);
        }
      } catch { /* Server logs need not be JSON. */ }
    });
  });
}

async function verifyDesktop(window) {
  const errors = [];
  const download = new Promise((resolve, reject) => {
    window.webContents.session.once("will-download", (_event, item) => {
      item.setSavePath(path.join(app.getPath("userData"), "smoke-download.json"));
      item.once("done", (_event, state) => state === "completed" ? resolve() : reject(new Error(`Download ${state}`)));
    });
  });
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  await new Promise((resolve, reject) => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.once("did-fail-load", (_event, code, message) => reject(new Error(`${code}: ${message}`)));
  });
  // Wait for React hydration and its first API load, then exercise the static fullscreen route.
  const result = await window.webContents.executeJavaScript(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    if (!document.body.innerText.includes('indigoQ')) throw new Error('Canvas failed to render');
    const graph = await fetch('/examples/oscillator-lab.json').then(r => r.json());
    const response = await fetch('/api/graph/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(graph.graph ?? graph) });
    if (!response.ok) throw new Error('Example import failed');
    const saved = await response.json();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(saved)], { type: 'application/json' }));
    link.download = 'smoke-download.json';
    link.click();
    return saved.workspaces[0].id;
  })()`);
  await download;
  await window.loadURL(`${origin}/workspace/?id=${encodeURIComponent(result)}`);
  await window.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 50; i++) {
      if (document.querySelector('.workspace-fullscreen')) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Fullscreen workspace failed to render');
  })()`);
  if (errors.length) throw new Error(errors.join("\n"));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { window.restore(); window.focus(); }
  });
  app.whenReady().then(async () => {
    if (smokeTest) {
      if (!process.env.INDIGOQ_SMOKE_DATA) throw new Error("Set INDIGOQ_SMOKE_DATA to an isolated test directory.");
      fs.mkdirSync(process.env.INDIGOQ_SMOKE_DATA, { recursive: true });
      app.setPath("userData", process.env.INDIGOQ_SMOKE_DATA);
      setTimeout(() => { console.error("Desktop smoke test timed out"); backend?.kill(); app.exit(1); }, 80000).unref();
    }
    const url = await startBackend();
    const window = createWindow(url);
    if (smokeTest) {
      await verifyDesktop(window);
      console.log("Desktop smoke test passed");
      app.quit();
    }
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(origin); });
  }).catch((error) => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox("Could not start indigoQ", error.message);
    quitting = true;
    backend?.kill();
    app.exit(1);
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin" || smokeTest) app.quit(); });
  app.on("before-quit", () => {
    quitting = true;
    backend?.kill();
  });
}
