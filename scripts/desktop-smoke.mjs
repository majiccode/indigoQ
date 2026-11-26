import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), "indigoq-desktop-"));
const output = path.join(root, "dist/desktop");
let executable;
if (process.platform === "darwin") {
  executable = path.join(output, process.arch === "arm64" ? "mac-arm64" : "mac", "indigoQ.app/Contents/MacOS/indigoQ");
} else if (process.platform === "win32") {
  executable = path.join(output, "win-unpacked/indigoQ.exe");
} else {
  const directory = path.join(output, "linux-unpacked");
  executable = path.join(directory, readdirSync(directory).find(name => ["indigoq-desktop", "indigoq", "indigoQ"].includes(name)) ?? "indigoq-desktop");
}
const child = spawn(executable, ["--smoke-test"], { env: { ...process.env, INDIGOQ_SMOKE_DATA: temp }, stdio: "inherit" });
const timer = setTimeout(() => { child.kill("SIGKILL"); }, 90000);
try {
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Packaged desktop exited ${code}`)));
  });
} finally {
  clearTimeout(timer);
  // The backend exits asynchronously after its desktop parent on Windows.
  await new Promise(resolve => setTimeout(resolve, 2000));
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
