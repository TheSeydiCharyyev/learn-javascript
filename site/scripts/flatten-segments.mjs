// After `next build`: puts the router's data files where the browser asks for them.
//
// For every route the export writes one data file per segment, "__next<segment path with / as .>.txt", e.g.
// essentials/day-01/student/__next.$oc$slug.__PAGE__.txt — the client router fetches exactly that name to move to a
// page without a reload (and to prefetch it). Next.js 16.4.5 builds the name from path.relative(), which on Windows
// gives "\" instead of "/", and only "/" becomes "." — so on Windows the file lands in a folder,
// __next.$oc$slug/__PAGE__.txt, and the browser gets 404 (seen 07.11.2026; the router then falls back to the whole
// page's data). This moves each such file to the name a Linux build gives; with nothing to move it does nothing.
// Known upstream: vercel/next.js issue #85374 (open; fix PRs #92340, #99058 not merged as of 07.11.2026, canary
// 16.5.0-canary.43 still has it). When a release fixes it, the build moves nothing and this script can go.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out");

function filesUnder(dir, rel = []) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(path.join(dir, e.name), [...rel, e.name]) : [[...rel, e.name]],
  );
}

let moved = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const at = path.join(dir, e.name);
    if (!e.name.startsWith("__next.")) {
      walk(at);
      continue;
    }
    // a folder "__next.<first segment>": every file in it becomes "__next.<first segment>.<rest joined by .>"
    for (const parts of filesUnder(at)) {
      const target = path.join(dir, [e.name, ...parts].join("."));
      if (!parts[parts.length - 1].endsWith(".txt")) throw new Error(`unexpected file in ${at}: ${parts.join("/")}`);
      if (fs.existsSync(target)) throw new Error(`${target} exists already`);
      fs.renameSync(path.join(at, ...parts), target);
      moved++;
    }
    fs.rmSync(at, { recursive: true });
  }
}

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.log("site/out is not built");
  process.exit(1);
}
walk(OUT);
console.log(moved ? `moved ${moved} router data files to their flat names (Next.js on Windows)` : "router data files: nothing to move");
