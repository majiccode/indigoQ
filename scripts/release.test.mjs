import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const [major, minor, patch] = current.split(".").map(Number);
const invoke = (...args) => spawnSync(process.execPath, ["scripts/build-release.mjs", "--auto", ...args], { cwd: root, encoding: "utf8" });

test("release dry run selects patch, minor, major, and explicit versions", () => {
  for (const [args, expected] of [
    [[], `${major}.${minor}.${patch + 1}`],
    [["minor"], `${major}.${minor + 1}.0`],
    [["major"], `${major + 1}.0.0`],
    [[`v${major + 2}.2.3`], `${major + 2}.2.3`],
  ]) {
    const result = invoke(...args, "--dry-run");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`→ ${expected} (v${expected})`));
    assert.match(result.stdout, /wait for builds and print the release URL/);
  }
  assert.match(invoke("--no-wait", "--dry-run").stdout, /print the Actions URL/);
});

test("release rejects invalid, non-increasing, and conflicting arguments before making changes", () => {
  for (const args of [[current], ["0.0.0"], ["nonsense"], ["1.2"], ["minor", "major"], ["--unknown"], ["--wait", "--no-wait"]]) {
    assert.notEqual(invoke(...args, "--dry-run").status, 0, args.join(" "));
  }
  assert.equal(invoke("--help").status, 0);
});
