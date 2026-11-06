// Reads the course pages from the repository at build time. The HTML files (index.html and the days in
// essentials/, intermediate/, advanced/) stay the only source of the text: the site takes the <head> resources and
// the top-level elements of <body> as written — the inner HTML of each is cut from the file by parser offsets, not
// re-serialized, so inline handlers, inline scripts and entities inside them reach the browser byte for byte.
//
// <body> itself must hold React's children: Next.js puts its own nodes there (a hidden metadata <div> first), and
// hydration fails if the file's text takes their place (tried 05.11.2026: React error 418, the whole page re-rendered
// on the client, highlight.js and lang.js work lost).
import fs from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import Title from "./title";
import { highlightCode } from "./highlight";

type Element = DefaultTreeAdapterTypes.Element;

// site/ sits inside the repository; `next build` runs in site/.
export const REPO = path.join(process.cwd(), "..");
const COURSES = ["essentials", "intermediate", "advanced", "web-apis"];

// One element of <head> or of the top level of <body>: tag, attributes and inner HTML as written.
export type Piece = { tag: string; attrs: Record<string, string>; html: string };
// An inline handler (onclick="…") on a top-level <body> element: React never renders string handlers, so the site
// puts it back by the element's id (see handlersScript).
export type Handler = [id: string, name: string, code: string];
export type SourcePage = { lang: string; head: Piece[]; body: Piece[]; handlers: Handler[] };

// Every page the site builds, as paths from the repository root: the home page and each day page, Russian and en/.
export function pagePaths(): string[] {
  const out = ["index.html"];
  for (const course of COURSES) {
    const dir = path.join(REPO, course);
    if (!fs.existsSync(dir)) continue;
    for (const day of fs.readdirSync(dir).filter((d) => /^day-\d+$/.test(d)).sort()) {
      for (const sub of ["", "en/"]) {
        const at = path.join(dir, day, sub);
        if (!fs.existsSync(at)) continue;
        for (const f of fs.readdirSync(at).filter((f) => f.endsWith(".html")).sort()) out.push(`${course}/${day}/${sub}${f}`);
      }
    }
  }
  return out;
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
  let source = fs.readFileSync(path.join(REPO, rel), "utf8");
  let { html, head, body } = documentParts(rel, source);
  const highlighted = head.childNodes.some((n) => isElement(n) && n.tagName === "script" && HIGHLIGHT_SCRIPT.test(n.attrs.find((a) => a.name === "src")?.value ?? ""));
  if (highlighted) {
    source = highlightBlocks(rel, source, body);
    ({ html, head, body } = documentParts(rel, source));
  }
  if (html.attrs.some((a) => a.name !== "lang")) throw new Error(`${rel}: <html> has attributes besides lang`);
  if (body.attrs.length) throw new Error(`${rel}: <body> has attributes, the site does not carry them yet`);

  const kept = head.childNodes.filter(isElement).map((el) => piece(source, el))
    .filter((p) => p.tag !== "meta" && !(p.tag === "script" && HIGHLIGHT_SCRIPT.test(p.attrs.src ?? "")));
  const unknown = kept.filter((p) => !HEAD_KEPT.has(p.tag));
  if (unknown.length) throw new Error(`${rel}: unexpected in <head>: ${unknown.map((p) => p.tag).join(", ")}`);

  // At the top level of <body> only elements and whitespace are carried; anything else would be lost silently.
  for (const n of body.childNodes) {
    if (isElement(n)) continue;
    if ("value" in n && n.nodeName === "#text" && !n.value.trim()) continue;
    throw new Error(`${rel}: a ${n.nodeName} at the top level of <body>, the site does not carry it yet`);
  }
  const pieces = body.childNodes.filter(isElement).map((el) => piece(source, el));
  const handlers: Handler[] = [];
  for (const p of pieces) {
    for (const [name, code] of Object.entries(p.attrs)) {
      if (!isHandler(name)) continue;
      if (!p.attrs.id) throw new Error(`${rel}: <${p.tag} ${name}="…"> at the top level of <body> needs an id`);
      handlers.push([p.attrs.id, name, code]);
    }
  }

  const page: SourcePage = { lang: html.attrs.find((a) => a.name === "lang")?.value ?? "", head: kept, body: pieces, handlers };
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

// An element as written: same tag, same attributes, the original inner HTML. The <title> goes through Title:
// lang.js rewrites it for English and React would write the file's text back when it hydrates.
export function render(p: Piece, key: number): ReactElement {
  if (p.tag === "title") return createElement(Title, { key, html: p.html, attrs: props(p) as Record<string, string> });
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
