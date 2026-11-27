import { readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const source = path.resolve(process.argv[2] ?? "artifacts");
const destination = path.resolve(process.argv[3] ?? "release");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const expected = [
  `indigoQ-${version}-darwin-arm64-server.tar.gz`,
  `indigoQ-${version}-darwin-x64-server.tar.gz`,
  `indigoQ-${version}-linux-x64-server.tar.gz`,
  `indigoQ-${version}-win32-x64-server.zip`,
];
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
for (const name of expected) if (!names.has(name)) throw new Error(`Missing release asset: ${name}`);
for (const name of names) if (!expected.includes(name)) throw new Error(`Unexpected release asset: ${name}`);
copyFileSync("scripts/install.sh", path.join(destination, "install.sh"));
copyFileSync("scripts/install.ps1", path.join(destination, "install.ps1"));
copyFileSync("docs/INSTALL.md", path.join(destination, "INSTALL.md"));
const sums = readdirSync(destination).filter(name => name !== "SHA256SUMS.txt").sort().map(name => {
  return `${createHash("sha256").update(readFileSync(path.join(destination, name))).digest("hex")}  ${name}`;
});
writeFileSync(path.join(destination, "SHA256SUMS.txt"), sums.join("\n") + "\n");
console.log(`Prepared ${expected.length} bundles, installers, installation instructions, and checksums.`);
