// A day page written in MDX (essentials/day-01/lecture.mdx next to lecture.html — stage 2 of the move, 08.11.2026):
// Markdown for the text, the course's components (lib/course.tsx) for its blocks, YAML frontmatter for the page head.
//
//   ---
//   title: День 1 — Что такое JavaScript и где он работает      <title>
//   day: День 1 • урок 1                                        the day head of a lecture: span.day-no,
//   heading: Что такое JavaScript и где он работает             h1,
//   lead: Первая лекция курса Essentials. 45 минут.             and its paragraph
//   css: |                                                      the colours of the day (the page's <style>)
//     h1 { border-bottom-color: #f59e0b; }
//   ---
//
// Notes and tasks pages have no day head: they start with "# День 1. Задания" and <Subtitle>…</Subtitle> in the text.
// The pages are made from the HTML ones by tools/html-to-mdx.mjs.
//
// Syntax the course adds to MDX, each turned into what the HTML pages had:
//   ## 1. Что такое JavaScript {#what}     a heading with its id (MDX itself would read {#what} as an expression)
//   ```js file="config.json"               a code block: <pre class="code js" data-file="config.json">, highlighted
//                                          at build time (lang js, html, plain-out, grammar; file, page); in a
//                                          grammar block *WhileStatement* is a nonterminal, in italics
//   <Toc />                                the table of contents, made from the page's ## headings (the number in
//                                          front dropped); <Toc> with its own list where the two differ
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import YAML from "yaml";
import type { ComponentType } from "react";

export type Frontmatter = {
  title: string;
  day?: string;
  heading?: string;
  lead?: string;
  css?: string;
};

// mdast nodes, as far as the plugins below look into them
type Node = { type: string; children?: Node[]; value?: string; depth?: number; lang?: string | null; meta?: string | null; name?: string; attributes?: unknown[]; url?: string; data?: Record<string, unknown>; [k: string]: unknown };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
// an id may start with a digit ("{#404}", day 31 of Essentials) — HTML allows it
const HEADING_ID = /^(#{1,6} .*?)[ \t]+\{#([\w-]+)\}[ \t]*$/gm;

// firstLine: the file's line number where the text after the frontmatter starts (for messages)
export function splitFrontmatter(rel: string, source: string): { data: Frontmatter; body: string; firstLine: number } {
  const m = FRONTMATTER.exec(source);
  if (!m) throw new Error(`${rel}: no frontmatter (--- … ---) at the top`);
  const data = YAML.parse(m[1]) as Frontmatter;
  if (!data || typeof data.title !== "string") throw new Error(`${rel}: frontmatter needs a title`);
  const known = new Set(["title", "day", "heading", "lead", "css"]);
  const unknown = Object.keys(data).filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`${rel}: unknown frontmatter keys: ${unknown.join(", ")}`);
  return { data, body: source.slice(m[0].length), firstLine: m[0].split("\n").length };
}

function walk(node: Node, visit: (n: Node, parent: Node | null, index: number) => void, parent: Node | null = null, index = 0) {
  visit(node, parent, index);
  node.children?.forEach((c, i) => walk(c, visit, node, i));
}

// "## Title {#id}": the id was escaped before parsing (\{#id\} is literal text for MDX); here it leaves the text and
// becomes the heading's id.
function remarkHeadingIds() {
  return (tree: Node) =>
    walk(tree, (n) => {
      if (n.type !== "heading" || !n.children?.length) return;
      const last = n.children[n.children.length - 1];
      if (last.type !== "text") return;
      const m = /[ \t]*\{#([\w-]+)\}$/.exec(last.value ?? "");
      if (!m) return;
      last.value = last.value!.slice(0, m.index);
      n.data = { ...n.data, hProperties: { ...((n.data?.hProperties as object) ?? {}), id: m[1] } };
    });
}

// Of GFM only its tables (| a | b |). The rest of remark-gfm the course does not use, and one part of it does harm:
// it makes links of bare addresses and emails in the text — "http://127.0.0.1:5500/missing.js" in a result box,
// «aman@mail.tm» in a task (Intermediate, 08.11.2026) — even escaped (it looks for them after the escapes are read),
// and with a line break right after the address it takes the "\" of the break into the link. The HTML pages have no
// such links: a link is [text](url). Checked: all 216 pages of Essentials compile to the same code as with remark-gfm.
function remarkTables(this: { data(): object }) {
  const data = this.data() as { micromarkExtensions?: unknown[]; fromMarkdownExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

const jsxAttr = (name: string, value: string) => ({ type: "mdxJsxAttribute", name, value });

// A fenced code block becomes <Code lang="js" file="…" code="…" />: the component highlights it the way the HTML
// pages were highlighted, with their classes and data- attributes.
function remarkCodeBlocks() {
  return (tree: Node) =>
    walk(tree, (n, parent, i) => {
      if (n.type !== "code" || !parent) return;
      const attributes = [jsxAttr("lang", n.lang ?? ""), jsxAttr("code", n.value ?? "")];
      for (const [, k, v] of (n.meta ?? "").matchAll(/([\w-]+)="([^"]*)"/g)) attributes.push(jsxAttr(k, v));
      parent.children![i] = { type: "mdxJsxFlowElement", name: "Code", attributes, children: [] };
    });
}

// <Toc /> without children gets the list of the page's ## headings: a link to each id, the heading's text as plain
// text (the HTML pages' tables of contents drop the <code> of their headings — 159 times, 08.11.2026; two items that
// keep it are written out as <Toc> with a list) with the number in front ("1. ") dropped.
const plainText = (n: Node): string => (n.type === "text" || n.type === "inlineCode" ? n.value ?? "" : (n.children ?? []).map(plainText).join(""));
function remarkToc() {
  return (tree: Node) => {
    const items: Node[] = [];
    walk(tree, (n) => {
      if (n.type !== "heading" || n.depth !== 2) return;
      const id = (n.data?.hProperties as { id?: string } | undefined)?.id;
      if (!id) return;
      const text = plainText(n).replace(/^\d+\.\s*/, "");
      items.push({ type: "listItem", spread: false, children: [{ type: "paragraph", children: [{ type: "link", url: `#${id}`, children: [{ type: "text", value: text }] }] }] });
    });
    walk(tree, (n) => {
      if ((n.type === "mdxJsxFlowElement" && n.name === "Toc") && !n.children?.length) {
        n.children = [{ type: "list", ordered: true, start: 1, spread: false, children: items }];
      }
    });
  };
}

const compiled = new Map<string, Promise<ComponentType<{ components?: Record<string, unknown> }>>>();

// The page's MDX as a React component (compiled once per build).
export function mdxContent(rel: string, body: string, firstLine = 1) {
  if (!compiled.has(rel)) {
    const escaped = body.replace(HEADING_ID, "$1 \\{#$2\\}");
    compiled.set(
      rel,
      evaluate(escaped, { ...runtime, remarkPlugins: [remarkTables, remarkHeadingIds, remarkCodeBlocks, remarkToc], development: false })
        .then((m) => m.default as ComponentType<{ components?: Record<string, unknown> }>)
        .catch((e: Error & { line?: number; column?: number }) => {
          // MDX names the place in the text after the frontmatter (escaping heading ids keeps the lines)
          const at = e.line ? `:${e.line + firstLine - 1}:${e.column}` : "";
          throw new Error(`${rel.replace(/\.html$/, ".mdx")}${at}: ${e.message}`);
        }),
    );
  }
  return compiled.get(rel)!;
}
