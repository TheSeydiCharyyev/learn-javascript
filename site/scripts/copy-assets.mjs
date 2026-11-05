// Copies the shared files the course pages link to (css/, js/, LICENSE) into site/public/, so the built site has
// them at the same relative paths as the repository. public/ is generated: edit the originals in the repository root.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.join(site, "..");
const pub = path.join(site, "public");

fs.rmSync(pub, { recursive: true, force: true });
for (const item of ["css", "js", "LICENSE"]) {
  fs.cpSync(path.join(repo, item), path.join(pub, item), { recursive: true });
}
console.log(`copied css/, js/, LICENSE to ${path.relative(repo, pub)}/`);
