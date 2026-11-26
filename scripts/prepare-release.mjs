import { readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const source = path.resolve(process.argv[2] ?? "artifacts");
const destination = path.resolve(process.argv[3] ?? "release");
mkdirSync(destination, { recursive: true });
const names = new Set();
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else {
      if (names.has(entry.name)) throw new Error(`Duplicate release asset: ${entry.name}`);
      names.add(entry.name);
      copyFileSync(file, path.join(destination, entry.name));
    }
  }
}
collect(source);
if (names.size !== 12) throw new Error(`Expected 12 platform packages, found ${names.size}`);
copyFileSync("compose.yaml", path.join(destination, "compose.yaml"));
copyFileSync("docs/INSTALL.md", path.join(destination, "INSTALL.md"));
const sums = readdirSync(destination).filter(name => name !== "SHA256SUMS.txt").sort().map(name => {
  return `${createHash("sha256").update(readFileSync(path.join(destination, name))).digest("hex")}  ${name}`;
});
writeFileSync(path.join(destination, "SHA256SUMS.txt"), sums.join("\n") + "\n");
console.log(`Prepared ${names.size} packages, installation instructions, Compose, and checksums.`);
