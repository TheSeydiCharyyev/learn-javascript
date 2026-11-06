// Copies what the site takes from the repository root before `next dev` / `next build`:
//   js/, LICENSE        -> site/public/        (the pages link to them at the same relative paths)
//   css/common.css      -> site/styles/course/ (imported by the layout: the CSS every page shares)
// The other course CSS (lecture/student/tasks.css, book.css) is read by lib/source.ts and goes into each day page.
// Both folders are generated: edit the originals in the repository root.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.join(site, "..");
const pub = path.join(site, "public");
const course = path.join(site, "styles", "course");

fs.rmSync(pub, { recursive: true, force: true });
for (const item of ["js", "LICENSE"]) {
  fs.cpSync(path.join(repo, item), path.join(pub, item), { recursive: true });
}
fs.rmSync(course, { recursive: true, force: true });
fs.mkdirSync(course, { recursive: true });
fs.copyFileSync(path.join(repo, "css", "common.css"), path.join(course, "common.css"));
console.log("copied js/, LICENSE to site/public/ and css/common.css to site/styles/course/");
