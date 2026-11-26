#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const argv = process.argv.slice(2);
const help = `Usage:
  node scripts/build-release.mjs --build-only [--desktop]
  node scripts/build-release.mjs <version> [--wait]

Build-only: install dependencies, check, and build packages for this machine.
Release: require a clean main branch, run checks, update versions, commit,
push main and v<version>, then trigger cross-platform builds on GitHub Actions.
The release is published only after all platform builds and Docker checks pass.
Use --wait to wait for the workflow and report its result.
Requirements: Node 22+, pnpm 10.33.2, uv 0.11+, Git, authenticated gh.
`;
if (argv.includes("--help") || !argv.length) { console.log(help); process.exit(0); }
function run(command, args, capture = false, env = {}) {
  const result = spawnSync(command, args, { env: { ...process.env, ...env }, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", shell: command.endsWith(".cmd") });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout?.trim();
}
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
if (argv.includes("--build-only")) {
  if (argv.some(arg => !["--build-only", "--desktop"].includes(arg))) throw new Error(help);
  run(process.execPath, ["scripts/build.mjs", "--check", ...(argv.includes("--desktop") ? ["--desktop"] : [])]);
  run(process.execPath, ["scripts/smoke-test.mjs"]);
  if (argv.includes("--desktop")) run(process.execPath, ["scripts/desktop-smoke.mjs"]);
  process.exit(0);
}
const version = argv[0].replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version) || argv.slice(1).some(arg => arg !== "--wait")) throw new Error(help);
if (run("git", ["status", "--porcelain"], true)) throw new Error("Commit or stash local changes before releasing.");
if (run("git", ["branch", "--show-current"], true) !== "main") throw new Error("Releases must be made from main.");
run("gh", ["auth", "status"]);
const repo = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner"], true)).nameWithOwner;
run("git", ["fetch", "origin", "main", "--tags"]);
if (run("git", ["rev-parse", "HEAD"], true) !== run("git", ["rev-parse", "origin/main"], true)) throw new Error("main must match origin/main before releasing.");
const tags = run("git", ["tag", "--list", `v${version}`], true);
if (tags) throw new Error(`Tag v${version} already exists. Choose a new version.`);
run(pnpm, ["install", "--frozen-lockfile"]);
run(pnpm, ["--dir", "frontend", "install", "--ignore-workspace", "--frozen-lockfile"]);
run("uv", ["sync", "--frozen", "--project", "backend"]);
run(pnpm, ["--dir", "frontend", "test"]);
run(pnpm, ["--dir", "frontend", "typecheck"]);
run(pnpm, ["--dir", "frontend", "lint"]);
run("uv", ["run", "--directory", "backend", "pytest"]);
run("uv", ["run", "--project", "backend", "ruff", "check", "backend"]);
const files = ["package.json", "frontend/package.json", "backend/pyproject.toml", "backend/app/main.py"];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const updated = file.endsWith(".json") ? text.replace(/"version": "[^"]+"/, `"version": "${version}"`)
    : file.endsWith(".toml") ? text.replace(/^version = "[^"]+"/m, `version = "${version}"`)
    : text.replace(/^APP_VERSION = "[^"]+"/m, `APP_VERSION = "${version}"`);
  writeFileSync(file, updated);
}
run("uv", ["lock", "--project", "backend"]);
run(pnpm, ["--dir", "frontend", "build"], false, { INDIGOQ_STATIC_EXPORT: "1", NEXT_PUBLIC_API_URL: "" });
run("git", ["add", ...files, "backend/uv.lock"]);
const changes = run("git", ["diff", "--cached", "--name-only"], true);
if (changes) {
  run("git", ["status", "--short"]);
  run("git", ["diff", "--cached", "--stat"]);
  run("git", ["log", "--oneline", "-10"]);
  run("git", ["commit", "-m", `Release v${version}`]);
}
run("git", ["tag", "-a", `v${version}`, "-m", `indigoQ v${version}`]);
run("git", ["push", "--atomic", "origin", "main", `v${version}`]);
console.log(`Release builds: https://github.com/${repo}/actions/workflows/release.yml`);
if (argv.includes("--wait")) {
  let id;
  for (let attempt = 0; attempt < 30 && !id; attempt++) {
    const runs = JSON.parse(run("gh", ["run", "list", "--workflow", "release.yml", "--branch", `v${version}`, "--json", "databaseId", "--limit", "1"], true));
    id = runs[0]?.databaseId;
    if (!id) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!id) throw new Error("Tag pushed, but workflow not found yet. Check GitHub Actions.");
  run("gh", ["run", "watch", String(id), "--exit-status"]);
  console.log(run("gh", ["release", "view", `v${version}`, "--json", "url", "--jq", ".url"], true));
}
