import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = new Set(process.argv.slice(2));
const allowed = new Set(["--check", "--skip-install"]);
for (const arg of args) if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
function run(command, argv, cwd = root, env = {}) {
  console.log(`> ${command} ${argv.join(" ")}`);
  const result = spawnSync(command, argv, { cwd, env: { ...process.env, ...env }, stdio: "inherit", shell: command.endsWith(".cmd") });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!args.has("--skip-install")) {
  run(pnpm, ["install", "--frozen-lockfile"]);
  run(pnpm, ["--dir", "frontend", "install", "--ignore-workspace", "--frozen-lockfile"]);
  run("uv", ["sync", "--frozen", "--group", "packaging"], path.join(root, "backend"));
}
if (args.has("--check")) {
  run(pnpm, ["--dir", "frontend", "test"]);
  run(pnpm, ["--dir", "frontend", "typecheck"]);
  run(pnpm, ["--dir", "frontend", "lint"]);
  run("uv", ["run", "--frozen", "pytest"], path.join(root, "backend"));
  run("uv", ["run", "--frozen", "ruff", "check", "."], path.join(root, "backend"));
}
run(pnpm, ["--dir", "frontend", "build"], root, { INDIGOQ_STATIC_EXPORT: "1", NEXT_PUBLIC_API_URL: "" });
run("uv", ["run", "--frozen", "--group", "packaging", "pyinstaller", "--noconfirm", "--clean", "--onedir", "--name", "indigoq-server",
  "--distpath", "../dist/server", "--workpath", "../build/pyinstaller", "--specpath", "../build",
  "--add-data", `${path.join(root, "frontend/out")}${path.delimiter}frontend/out`,
  "--collect-submodules", "uvicorn", "--collect-submodules", "app", "launcher.py"], path.join(root, "backend"));
const version = JSON.parse(readFileSync(path.join(root, "package.json"))).version;
const name = `indigoQ-${version}-${process.platform}-${process.arch}-server`;
const bundle = path.join(root, "dist/portable", name);
mkdirSync(bundle, { recursive: true });
cpSync(path.join(root, "dist/server/indigoq-server"), bundle, { recursive: true });
cpSync(path.join(root, "docs/INSTALL.md"), path.join(bundle, "INSTALL.md"));
if (process.platform === "win32") {
  writeFileSync(path.join(bundle, "Start indigoQ.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nindigoq-server.exe\r\npause\r\n');
  run("tar", ["-a", "-cf", path.join(root, "dist", `${name}.zip`), "-C", path.dirname(bundle), name]);
} else {
  writeFileSync(path.join(bundle, "Start indigoQ.command"), '#!/bin/sh\ncd "$(dirname "$0")"\nexec ./indigoq-server "$@"\n', { mode: 0o755 });
  run("tar", ["-czf", path.join(root, "dist", `${name}.tar.gz`), "-C", path.dirname(bundle), name]);
}
console.log(`Built indigoQ ${version} for ${process.platform}/${process.arch} in dist/`);
