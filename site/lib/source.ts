// Reads the course pages from the repository at build time. The HTML files in essentials/, intermediate/ and
// advanced/ stay the only source of the text: the site takes their <head> resources and the top-level elements of
// <body> exactly as written (the inner HTML is cut from the file by parser offsets, not re-serialized).
import fs from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Element = DefaultTreeAdapterTypes.Element;

// site/ sits inside the repository; `next build` runs in site/.
export const REPO = path.join(process.cwd(), "..");

// One top-level element of <head> or <body>: its tag, its attributes and its inner HTML as written in the file.
export type Piece = { tag: string; attrs: Record<string, string>; html: string };
export type SourcePage = { lang: string; title: string; head: Piece[]; body: Piece[] };

// The pages the site builds, as paths from the repository root.
export function pagePaths(): string[] {
  return ["essentials/day-01/lecture.html"];
}

// "essentials/day-01/lecture.html" <-> ["essentials", "day-01", "lecture"]; the export writes the route back as
// out/essentials/day-01/lecture.html, so the address stays the same.
export const toSlug = (rel: string) => rel.replace(/\.html$/, "").split("/");
export const fromSlug = (slug: string[]) => `${slug.join("/")}.html`;

const isElement = (n: DefaultTreeAdapterTypes.ChildNode): n is Element => "tagName" in n;

function inner(source: string, el: Element): string {
  const loc = el.sourceCodeLocation;
  if (!loc?.startTag) throw new Error(`<${el.tagName}> has no source location`);
  if (!loc.endTag) return "";
  return source.slice(loc.startTag.endOffset, loc.endTag.startOffset);
}

function piece(source: string, el: Element): Piece {
  return { tag: el.tagName, attrs: Object.fromEntries(el.attrs.map((a) => [a.name, a.value])), html: inner(source, el) };
}

// <meta charset> and <meta name="viewport"> come from Next.js itself, <title> from the page metadata.
const HEAD_FROM_NEXT = (p: Piece) => p.tag === "meta" || p.tag === "title";
const HEAD_KEPT = new Set(["link", "script", "style"]);

const cache = new Map<string, SourcePage>();

export function readPage(rel: string): SourcePage {
  const hit = cache.get(rel);
  if (hit) return hit;
  const source = fs.readFileSync(path.join(REPO, rel), "utf8");
  const doc = parse(source, { sourceCodeLocationInfo: true });
  const html = doc.childNodes.filter(isElement).find((n) => n.tagName === "html");
  if (!html) throw new Error(`${rel}: no <html>`);
  const [head, body] = ["head", "body"].map((t) => html.childNodes.filter(isElement).find((n) => n.tagName === t));
  if (!head || !body) throw new Error(`${rel}: no <head> or <body>`);
  if (body.attrs.length) throw new Error(`${rel}: <body> has attributes, the site does not carry them yet`);

  const headPieces = head.childNodes.filter(isElement).map((el) => piece(source, el));
  const titleEl = head.childNodes.filter(isElement).find((n) => n.tagName === "title");
  const title = titleEl?.childNodes.map((n) => ("value" in n ? n.value : "")).join("") ?? "";
  const kept = headPieces.filter((p) => !HEAD_FROM_NEXT(p));
  const unknown = kept.filter((p) => !HEAD_KEPT.has(p.tag));
  if (unknown.length) throw new Error(`${rel}: unexpected in <head>: ${unknown.map((p) => p.tag).join(", ")}`);

  const page: SourcePage = {
    lang: html.attrs.find((a) => a.name === "lang")?.value ?? "",
    title,
    head: kept,
    body: body.childNodes.filter(isElement).map((el) => piece(source, el)),
  };
  cache.set(rel, page);
  return page;
}

// HTML attributes -> React props for the few tags that occur at the top level of the pages.
function props(p: Piece): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(p.attrs)) {
    if (name === "class") out.className = value;
    else if (name === "defer" || name === "async") out[name] = true;
    else if (name === "style") throw new Error(`<${p.tag} style="…"> at the top level is not supported yet`);
    else out[name] = value;
  }
  return out;
}

const VOID = new Set(["link", "meta", "br", "hr", "img", "input"]);

// The element as written: same tag, same attributes, the original inner HTML.
export function render(p: Piece, key: number): ReactElement {
  const own = { ...props(p), key };
  if (VOID.has(p.tag) || (p.tag === "script" && !p.html)) return createElement(p.tag, own);
  return createElement(p.tag, { ...own, dangerouslySetInnerHTML: { __html: p.html } });
}
