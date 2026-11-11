// Reads the course pages from the repository at build time. A day page is written in MDX (lecture.mdx — stage 2 of
// the move to Next.js, 08.11.2026; see lib/mdx.ts); the home page is drawn by lib/Home.tsx from the plans (stage 3,
// 09.11.2026). The HTML files the pages were made from went at stage 4 (11.11.2026), and with them the site's reading
// of an HTML page: its <head> resources and the top-level elements of its <body> cut from the file, its inline
// handlers put back by a script, its navigation bar checked against <LessonNav>, its code highlighted at build time
// (git history of this file, before 11.11.2026).
import fs from "node:fs";
import path from "node:path";
import { navModel, type NavModel } from "./nav";
import { splitFrontmatter, type Frontmatter } from "./mdx";

// site/ sits inside the repository; `next build` runs in site/.
export const REPO = path.join(process.cwd(), "..");
const COURSES = ["essentials", "intermediate", "advanced", "web-apis"];

export type PageKind = "lecture" | "student" | "tasks";
export type SourcePage = {
  lang: string;
  nav: NavModel | null;
  kind: PageKind | null; // a day page: lecture, notes (student) or tasks
  // A day page's own CSS, in cascade order: css/<kind>.css, css/book.css, then the colours of the day (its
  // frontmatter's css); the home page's: css/home.css.
  pageCss: string[];
  // A day page's <title> as text: given to Next.js as metadata (see page.tsx); null on the home page (lib/home-lists.ts).
  title: string | null;
  // A day page: its frontmatter and the MDX after it; null on the home page.
  mdx: { front: Frontmatter; body: string; firstLine: number; dir: string; up: string } | null;
};

// lecture.css, student.css and tasks.css set the same selectors differently (body, h1, h2, .container, pre…), so a
// page carries the CSS of its kind itself instead of all of it being global. Scoping them to the kind with
// :where(html:has(.page-<kind>)) was tried 06.11.2026 and dropped: computed styles stayed the same, but the mere
// :has() on <html> made Chrome rasterize gradients and SVG edges differently (up to 218 per channel).
const courseCss = new Map<string, string>();
function readCourseCss(file: string): string {
  if (!courseCss.has(file)) courseCss.set(file, fs.readFileSync(path.join(REPO, "css", file), "utf8"));
  return courseCss.get(file)!;
}

// Every page the site builds, as paths from the repository root: the home page and each day page, Russian and en/.
// A page is named by its .html path (its address, as it was when the pages were HTML files).
export function pagePaths(): string[] {
  const out = ["index.html"];
  for (const course of COURSES) {
    const dir = path.join(REPO, course);
    if (!fs.existsSync(dir)) continue;
    for (const day of fs.readdirSync(dir).filter((d) => /^day-\d+$/.test(d)).sort()) {
      for (const sub of ["", "en/"]) {
        const at = path.join(dir, day, sub);
        if (!fs.existsSync(at)) continue;
        for (const f of fs.readdirSync(at).filter((n) => n.endsWith(".mdx")).sort()) out.push(`${course}/${day}/${sub}${f.replace(/\.mdx$/, ".html")}`);
      }
    }
  }
  return out;
}

// A day page: everything but its text comes from where it lies (kind, language, navigation bar) and from its
// frontmatter (title, the lecture's head, the colours of the day).
function readMdxPage(rel: string, mdxRel: string): SourcePage {
  const kind = /\/(lecture|student|tasks)\.html$/.exec(rel)?.[1] as PageKind | undefined;
  const nav = navModel(rel, REPO);
  if (!kind || !nav) throw new Error(`${mdxRel}: an MDX page must be a day page (…/day-NN/[en/]lecture|student|tasks.mdx)`);
  const { data: front, body, firstLine } = splitFrontmatter(mdxRel, fs.readFileSync(path.join(REPO, mdxRel), "utf8"));
  const lecture = front.day !== undefined || front.heading !== undefined || front.lead !== undefined;
  if (lecture && !(front.day && front.heading && front.lead)) throw new Error(`${mdxRel}: the day head needs day, heading and lead together`);
  const en = /\/en\//.test(rel);
  return {
    lang: en ? "en" : "ru",
    nav,
    kind,
    pageCss: [readCourseCss(`${kind}.css`), readCourseCss("book.css"), ...(front.css ? [front.css] : [])],
    title: front.title,
    mdx: { front, body, firstLine, dir: path.join(REPO, path.dirname(rel)), up: en ? "../../../" : "../../" },
  };
}

// "essentials/day-01/lecture.html" <-> ["essentials", "day-01", "lecture"], "index.html" <-> []; the export writes
// each route back as the same file in out/, so every address stays as it was.
export const toSlug = (rel: string) => (rel === "index.html" ? [] : rel.replace(/\.html$/, "").split("/"));
export const fromSlug = (slug: string[] | undefined) => (slug?.length ? `${slug.join("/")}.html` : "index.html");

const cache = new Map<string, SourcePage>();

export function readPage(rel: string): SourcePage {
  const hit = cache.get(rel);
  if (hit) return hit;
  let page: SourcePage;
  // The home page is drawn by <Home> from the plans (lib/Home.tsx): here only its CSS, css/home.css, after common.css
  // (its title: lib/HomeState.tsx).
  if (rel === "index.html") page = { lang: "ru", nav: null, kind: null, pageCss: [readCourseCss("home.css")], title: null, mdx: null };
  else {
    const mdxRel = rel.replace(/\.html$/, ".mdx");
    if (!fs.existsSync(path.join(REPO, mdxRel))) throw new Error(`${rel}: no ${mdxRel}`);
    page = readMdxPage(rel, mdxRel);
  }
  cache.set(rel, page);
  return page;
}
