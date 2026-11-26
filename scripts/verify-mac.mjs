import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Run macOS signature verification on a Mac.");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist/desktop");
const temp = mkdtempSync(path.join(tmpdir(), "indigoq-signature-"));
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout;
}
function verify(app) {
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  // The Python executable is an extra resource, rather than a standard nested-code location.
  run("codesign", ["--verify", "--deep", "--strict", path.join(app, "Contents/Resources/server/indigoq-server")]);
}
try {
  verify(path.join(output, process.arch === "arm64" ? "mac-arm64" : "mac", "indigoQ.app"));
  const prefix = `indigoQ-${version}-mac-${process.arch}`;
  const zip = readdirSync(output).find(name => name === `${prefix}.zip`);
  const dmg = readdirSync(output).find(name => name === `${prefix}.dmg`);
  if (!zip || !dmg) throw new Error("Both DMG and ZIP must exist before signature verification.");
  run("ditto", ["-x", "-k", path.join(output, zip), path.join(temp, "zip")]);
  verify(path.join(temp, "zip/indigoQ.app"));
  const mount = path.join(temp, "mounted");
  run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, path.join(output, dmg)]);
  try { verify(path.join(mount, "indigoQ.app")); }
  finally { run("hdiutil", ["detach", mount]); }
  console.log("Mac signatures verified in app, ZIP, and DMG (including bundled server).");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
