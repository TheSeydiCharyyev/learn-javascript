// Reads the course pages from the repository at build time. A day page is written in MDX (lecture.mdx next to
// lecture.html — stage 2 of the move, 08.11.2026; see lib/mdx.ts) or still in HTML; the MDX file wins when both
// are there. The home page is drawn by lib/Home.tsx from the plans (stage 3, 09.11.2026); index.html is not read.
// For an HTML page (a day not moved yet: the lecture of day 21 of Advanced) the site takes the <head> resources and the
// top-level elements of <body> as written — the inner HTML of each is cut from the file by parser offsets, not
// re-serialized, so inline handlers, inline scripts and entities inside them reach the browser byte for byte.
//
// <body> itself must hold React's children: Next.js puts its own nodes there (a hidden metadata <div> first), and
// hydration fails if the file's text takes their place (tried 05.11.2026: React error 418, the whole page re-rendered
// on the client, highlight.js and lang.js work lost).
import fs from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { highlightCode } from "./highlight";
import { navInnerHtml, navModel, type NavModel } from "./nav";
import { splitFrontmatter, type Frontmatter } from "./mdx";

type Element = DefaultTreeAdapterTypes.Element;

// site/ sits inside the repository; `next build` runs in site/.
export const REPO = path.join(process.cwd(), "..");
const COURSES = ["essentials", "intermediate", "advanced", "web-apis"];

// One element of <head> or of the top level of <body>: tag, attributes and inner HTML as written.
export type Piece = { tag: string; attrs: Record<string, string>; html: string };
// An inline handler (onclick="…") on a top-level <body> element: React never renders string handlers, so the site
// puts it back by the element's id (see handlersScript).
export type Handler = [id: string, name: string, code: string];
export type PageKind = "lecture" | "student" | "tasks";
export type SourcePage = {
  lang: string;
  head: Piece[];
  body: Piece[];
  handlers: Handler[];
  nav: NavModel | null;
  kind: PageKind | null; // a day page: lecture, notes (student) or tasks
  // A day page's own CSS, in cascade order: css/<kind>.css, css/book.css, then its <style> (the colours of the day);
  // the home page's: css/home.css.
  pageCss: string[];
  // A day page's <title> as text: given to Next.js as metadata (see page.tsx); null on the home page (lib/home-lists.ts).
  title: string | null;
  // A page written in MDX: its frontmatter and the MDX after it (head, body and handlers are empty then).
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
// A page is named by its .html path whether it is written in HTML or MDX (its address stays the same).
export function pagePaths(): string[] {
  const out = ["index.html"];
  for (const course of COURSES) {
    const dir = path.join(REPO, course);
    if (!fs.existsSync(dir)) continue;
    for (const day of fs.readdirSync(dir).filter((d) => /^day-\d+$/.test(d)).sort()) {
      for (const sub of ["", "en/"]) {
        const at = path.join(dir, day, sub);
        if (!fs.existsSync(at)) continue;
        const names = new Set(fs.readdirSync(at).filter((f) => /\.(html|mdx)$/.test(f)).map((f) => f.replace(/\.mdx$/, ".html")));
        for (const f of [...names].sort()) out.push(`${course}/${day}/${sub}${f}`);
      }
    }
  }
  return out;
}

// A day page written in MDX: everything but its text comes from where it lies (kind, language, navigation bar) and
// from its frontmatter (title, the lecture's head, the colours of the day).
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
    head: [],
    body: [],
    handlers: [],
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

const isElement = (n: DefaultTreeAdapterTypes.ChildNode): n is Element => "tagName" in n;

function inner(source: string, el: Element): string {
  const loc = el.sourceCodeLocation;
  if (!loc?.startTag) throw new Error(`<${el.tagName}> is not written in the file`);
  if (!loc.endTag) return "";
  return source.slice(loc.startTag.endOffset, loc.endTag.startOffset);
}

function piece(source: string, el: Element): Piece {
  return {
    tag: el.tagName,
    attrs: Object.fromEntries(el.attrs.map((a) => [a.name, a.value])),
    html: inner(source, el),
  };
}

// <meta charset> and <meta name="viewport"> come from Next.js itself.
const HEAD_KEPT = new Set(["title", "link", "script", "style"]);
const isHandler = (name: string) => /^on/i.test(name);
const HIGHLIGHT_SCRIPT = /(^|\/)js\/highlight\.js$/;

const cache = new Map<string, SourcePage>();

function textOf(n: DefaultTreeAdapterTypes.ChildNode): string {
  if (n.nodeName === "#text" && "value" in n) return n.value;
  return isElement(n) ? n.childNodes.map(textOf).join("") : "";
}

function documentParts(rel: string, source: string) {
  const doc = parse(source, { sourceCodeLocationInfo: true });
  const html = doc.childNodes.filter(isElement).find((n) => n.tagName === "html");
  if (!html) throw new Error(`${rel}: no <html>`);
  const [head, body] = ["head", "body"].map((t) => html.childNodes.filter(isElement).find((n) => n.tagName === t));
  if (!head || !body) throw new Error(`${rel}: no <head> or <body>`);
  return { html, head, body };
}

// Highlighting at build time: the same change js/highlight.js makes in the browser on DOMContentLoaded — every
// <pre class="code …"> gets its text as highlighted spans (html when the class has "html", js otherwise) and
// data-highlighted="1" as its last attribute (as dataset adds it). The parser drops a newline right after <pre>,
// innerHTML in the browser keeps it — hence the extra "\n" in front.
function highlightBlocks(rel: string, source: string, body: Element): string {
  const edits: [from: number, to: number, text: string][] = [];
  const walk = (el: Element) => {
    for (const c of el.childNodes) {
      if (!isElement(c)) continue;
      const classes = c.attrs.find((a) => a.name === "class")?.value.split(/\s+/) ?? [];
      if (c.tagName !== "pre" || !classes.includes("code")) { walk(c); continue; }
      const loc = c.sourceCodeLocation;
      if (!loc?.startTag || !loc.endTag || source[loc.startTag.endOffset - 1] !== ">") throw new Error(`${rel}: a <pre class="code"> not written as <pre …>…</pre>`);
      if (c.attrs.some((a) => a.name === "data-highlighted")) throw new Error(`${rel}: <pre data-highlighted> in the file`);
      const at = loc.startTag.endOffset - 1;
      edits.push([at, at, ' data-highlighted="1"']);
      edits.push([loc.startTag.endOffset, loc.endTag.startOffset, "\n" + highlightCode(textOf(c), classes.includes("html") ? "html" : "js")]);
    }
  };
  walk(body);
  let out = source;
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])) out = out.slice(0, from) + text + out.slice(to);
  return out;
}

export function readPage(rel: string): SourcePage {
  const hit = cache.get(rel);
  if (hit) return hit;
  // The home page is drawn by <Home> from the plans (lib/Home.tsx — stage 3, 09.11.2026), not read from index.html:
  // here only its CSS, css/home.css, after common.css as the file had it (its title: page.tsx).
  if (rel === "index.html") {
    const page: SourcePage = { lang: "ru", head: [], body: [], handlers: [], nav: null, kind: null, pageCss: [readCourseCss("home.css")], title: null, mdx: null };
    cache.set(rel, page);
    return page;
  }
  const mdxRel = rel.replace(/\.html$/, ".mdx");
  if (mdxRel !== rel && fs.existsSync(path.join(REPO, mdxRel))) {
    const page = readMdxPage(rel, mdxRel);
    cache.set(rel, page);
    return page;
  }
  let source = fs.readFileSync(path.join(REPO, rel), "utf8");
  let { html, head, body } = documentParts(rel, source);
  const highlighted = head.childNodes.some((n) => isElement(n) && n.tagName === "script" && HIGHLIGHT_SCRIPT.test(n.attrs.find((a) => a.name === "src")?.value ?? ""));
  if (highlighted) {
    source = highlightBlocks(rel, source, body);
    ({ html, head, body } = documentParts(rel, source));
  }
  if (html.attrs.some((a) => a.name !== "lang")) throw new Error(`${rel}: <html> has attributes besides lang`);
  if (body.attrs.length) throw new Error(`${rel}: <body> has attributes, the site does not carry them yet`);

  let kept = head.childNodes.filter(isElement).map((el) => piece(source, el))
    .filter((p) => p.tag !== "meta" && !(p.tag === "script" && HIGHLIGHT_SCRIPT.test(p.attrs.src ?? "")));
  const unknown = kept.filter((p) => !HEAD_KEPT.has(p.tag));
  if (unknown.length) throw new Error(`${rel}: unexpected in <head>: ${unknown.map((p) => p.tag).join(", ")}`);

  // The file's <link>s to css/ go: common.css is imported by the layout, the rest the page carries itself (pageCss)
  // — but only if they are exactly the set expected for this kind of page.
  const kind = /\/(lecture|student|tasks)\.html$/.exec(rel)?.[1] as PageKind | undefined;
  const cssOf = (p: Piece) => (p.tag === "link" && p.attrs.rel === "stylesheet" ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), p.attrs.href ?? "")) : null);
  const linked = kept.map(cssOf).filter((c): c is string => c !== null);
  const expected = rel === "index.html" ? ["css/common.css"] : kind ? ["css/common.css", `css/${kind}.css`, "css/book.css"] : null;
  if (!expected || linked.join(" ") !== expected.join(" ")) throw new Error(`${rel}: stylesheets ${linked.join(", ")} — the scoped CSS expects ${expected?.join(", ") ?? "a known kind of page"}`);
  kept = kept.filter((p) => cssOf(p) === null);

  // A day page carries its CSS into the page, in the order the file loaded it: its kind's CSS, book.css, then its own
  // <style> (the colours of the day). It leaves with the page when the reader goes to another one.
  const pageCss: string[] = [];
  if (kind) {
    pageCss.push(readCourseCss(`${kind}.css`), readCourseCss("book.css"));
    const styles = kept.filter((p) => p.tag === "style");
    if (styles.length > 1) throw new Error(`${rel}: more than one <style> in <head>`);
    if (styles[0]) {
      if (Object.keys(styles[0].attrs).length) throw new Error(`${rel}: <style> with attributes`);
      pageCss.push(styles[0].html);
      kept = kept.filter((p) => p !== styles[0]);
    }
  }

  // A day page's title goes to Next.js as metadata, so that it changes with the page when the reader moves by a <Link>
  // (a <title> in the layout would keep the first page's — 06.11.2026).
  let title: string | null = null;
  if (kind) {
    const titles = head.childNodes.filter(isElement).filter((n) => n.tagName === "title");
    if (titles.length !== 1 || titles[0].attrs.length) throw new Error(`${rel}: a day page needs one <title> without attributes`);
    title = textOf(titles[0]);
    kept = kept.filter((p) => p.tag !== "title");
  }

  // At the top level of <body> only elements and whitespace are carried; anything else would be lost silently.
  for (const n of body.childNodes) {
    if (isElement(n)) continue;
    if ("value" in n && n.nodeName === "#text" && !n.value.trim()) continue;
    throw new Error(`${rel}: a ${n.nodeName} at the top level of <body>, the site does not carry it yet`);
  }
  const pieces = body.childNodes.filter(isElement).map((el) => piece(source, el));

  // The navigation bar of a day page is drawn by <LessonNav> from where the page lies; the file's own bar must be
  // exactly what that model gives, so nothing written in a bar is lost.
  let nav: NavModel | null = null;
  const isNav = (p: Piece) => p.tag === "div" && p.attrs.class === "lesson-nav";
  if (pieces.slice(1).some(isNav)) throw new Error(`${rel}: <div class="lesson-nav"> is not the first element of <body>`);
  if (pieces[0] && isNav(pieces[0])) {
    nav = navModel(rel, REPO);
    if (!nav) throw new Error(`${rel}: a navigation bar on a page that is not a day page`);
    const want = navInnerHtml(nav), have = pieces[0].html;
    if (want !== have) {
      let i = 0;
      while (i < want.length && want[i] === have[i]) i++;
      throw new Error(`${rel}: the navigation bar differs from the one <LessonNav> draws, at ${i}:\n  file:  ${JSON.stringify(have.slice(Math.max(0, i - 40), i + 60))}\n  model: ${JSON.stringify(want.slice(Math.max(0, i - 40), i + 60))}`);
    }
    if (Object.keys(pieces[0].attrs).length !== 1) throw new Error(`${rel}: the navigation bar has attributes besides class`);
    pieces.shift();
  }

  const handlers: Handler[] = [];
  for (const p of pieces) {
    for (const [name, code] of Object.entries(p.attrs)) {
      if (!isHandler(name)) continue;
      if (!p.attrs.id) throw new Error(`${rel}: <${p.tag} ${name}="…"> at the top level of <body> needs an id`);
      handlers.push([p.attrs.id, name, code]);
    }
  }

  const page: SourcePage = {
    lang: html.attrs.find((a) => a.name === "lang")?.value ?? "",
    head: kept,
    body: pieces,
    handlers,
    nav,
    kind: kind ?? null,
    pageCss,
    title,
    mdx: null,
  };
  cache.set(rel, page);
  return page;
}

// HTML attributes -> React props. Inline handlers are skipped here and put back by handlersScript.
function props(p: Piece): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(p.attrs)) {
    if (name === "class") out.className = value;
    else if (name === "defer" || name === "async") out[name] = true;
    else if (isHandler(name)) continue;
    else if (name === "style") throw new Error(`<${p.tag} style="…"> at the top level is not supported yet`);
    else out[name] = value;
  }
  return out;
}

const VOID = new Set(["link", "meta", "br", "hr", "img", "input"]);

// An element as written: same tag, same attributes, the original inner HTML. (A <title> never comes here: a day
// page's is metadata; the home page's, which lang.js used to rewrite, is drawn by lib/HomeState.tsx since stage 3 —
// lib/title.tsx went with it, 09.11.2026.)
export function render(p: Piece, key: number): ReactElement {
  if (p.tag === "title") throw new Error("a <title> in the pieces of a page: a day page's title is metadata");
  const own = { ...props(p), key };
  if (VOID.has(p.tag) || (p.tag === "script" && !p.html)) return createElement(p.tag, own);
  return createElement(p.tag, { ...own, dangerouslySetInnerHTML: { __html: p.html } });
}

// A <head> script that puts the inline handlers back as the same attributes once the document is parsed — before
// the reader can reach them (on the home page the handler's function is defined at the very end of <body>).
export function handlersScript(handlers: Handler[]): string | null {
  if (!handlers.length) return null;
  const data = JSON.stringify(handlers);
  if (data.includes("<")) throw new Error(`an inline handler with "<" is not supported: ${data}`);
  return `document.addEventListener("DOMContentLoaded",function(){${data}.forEach(function(h){var el=document.getElementById(h[0]);if(el)el.setAttribute(h[1],h[2]);});});`;
}
