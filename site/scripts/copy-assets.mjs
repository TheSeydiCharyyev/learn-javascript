// Copies what the site takes from the repository root before `next dev` / `next build`:
//   LICENSE             -> site/public/        (the pages' licence footers link to it at the same relative path)
//   css/common.css      -> site/styles/course/ (imported by the layout: the CSS every page shares)
// The other course CSS (lecture/student/tasks.css, book.css, home.css) is read by lib/source.ts and goes into each page.
// Both folders are generated: edit the originals in the repository root. (js/ — highlight.js and lang.js of the HTML
// pages — went with them, stage 4 of the move to Next.js, 11.11.2026.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.join(site, "..");
const pub = path.join(site, "public");
const course = path.join(site, "styles", "course");

fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });
fs.copyFileSync(path.join(repo, "LICENSE"), path.join(pub, "LICENSE"));
fs.rmSync(course, { recursive: true, force: true });
fs.mkdirSync(course, { recursive: true });
fs.copyFileSync(path.join(repo, "css", "common.css"), path.join(course, "common.css"));
console.log("copied LICENSE to site/public/ and css/common.css to site/styles/course/");
