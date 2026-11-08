// The course's components for MDX pages (see lib/mdx.ts). Each draws exactly the markup the HTML pages wrote for that
// block, so the CSS of the course applies unchanged and compare-site can hold the MDX page against the HTML one.
//
// Two kinds of boxes, as the HTML pages have them (counted over all 385 pages, 08.11.2026):
//   - text boxes (Analogy, Mistake, ProTip, …): the text lies right in the <div>, sometimes followed by a code block
//     or a list. MDX wraps text written on its own lines in <p>; these boxes take that <p> off again.
//   - block boxes (Goals, Ref, Step, …): their content is blocks (<p>, lists, tables) and stays as MDX gives it.
import fs from "node:fs";
import path from "node:path";
import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { highlightCode } from "./highlight";

export type PageContext = {
  lang: "ru" | "en";
  dir: string; // the page's folder on disk (its schemes lie there)
  up: string; // from the page to the repository root: "../../" or "../../../"
};

const LABELS = {
  ru: { toc: "Содержание главы", answer: "Ответ", ref: "Справочник дня", full: "подробно", brief: "кратко", review: "повторение" },
  en: { toc: "Contents", answer: "Answer", ref: "Reference of the day", full: "in depth", brief: "briefly", review: "review" },
};

type Kids = { children?: ReactNode };

// The <p>s MDX put around a text box's text come off; two paragraphs in a row keep a line break between them (it
// renders as the space the HTML had).
function unwrap(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let lastWasParagraph = false;
  Children.toArray(children).forEach((c) => {
    const isParagraph = isValidElement(c) && c.type === "p";
    if (isParagraph && lastWasParagraph) out.push("\n");
    out.push(isParagraph ? <Fragment key={(c as ReactElement).key}>{(c as ReactElement<Kids>).props.children}</Fragment> : c);
    lastWasParagraph = isParagraph;
  });
  return out;
}

const textBox = (className: string) => {
  const Box = ({ children }: Kids) => <div className={className}>{unwrap(children)}</div>;
  Box.displayName = className;
  return Box;
};
const blockBox = (className: string) => {
  const Box = ({ children }: Kids) => <div className={className}>{children}</div>;
  Box.displayName = className;
  return Box;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A code block. (The HTML parser drops a newline right after <pre>; React's server rendering already writes an extra
// one when the content starts with a newline — so no "\n" of our own here, unlike the raw HTML in lib/source.ts.)
function Code({ lang, code, file, page }: { lang: string; code: string; file?: string; page?: string }) {
  const data = { ...(file !== undefined && { "data-file": file }), ...(page !== undefined && { "data-page": page }) };
  if (lang === "js" || lang === "html") {
    return <pre className={`code ${lang}`} {...data} data-highlighted="1" dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />;
  }
  if (lang === "plain-out" || lang === "grammar") {
    return <pre className={lang} {...data} dangerouslySetInnerHTML={{ __html: escapeHtml(code) }} />;
  }
  throw new Error(`a code block with lang "${lang}": the course has js, html, plain-out, grammar`);
}

// A scheme: the SVG file next to the page, put into the page as the HTML pages had it inline (the file keeps
// xmlns so that it opens on its own; inline it is not written).
const SVG_ROOT_ATTRS: Record<string, string> = { viewBox: "viewBox", role: "role", "aria-label": "aria-label", width: "width", height: "height" };
function scheme(ctx: PageContext) {
  const Scheme = ({ src, children }: { src: string } & Kids) => {
    const text = fs.readFileSync(path.join(ctx.dir, src), "utf8");
    const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(text);
    if (!m) throw new Error(`${src}: not a single <svg> element`);
    const props: Record<string, string> = {};
    for (const [, name, value] of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      if (name === "xmlns") continue;
      if (!SVG_ROOT_ATTRS[name]) throw new Error(`${src}: <svg ${name}="…"> is not carried yet`);
      props[SVG_ROOT_ATTRS[name]] = value;
    }
    return (
      <figure className="scheme">
        <svg {...props} dangerouslySetInnerHTML={{ __html: m[2] }} />
        <figcaption>{unwrap(children)}</figcaption>
      </figure>
    );
  };
  return Scheme;
}

// The licence line at the bottom of every page: the usual text from the MDN page it is based on, or the page's own
// text (some pages name the MDN articles) as children.
function sources(ctx: PageContext) {
  const Sources = ({ mdn, children }: { mdn?: string } & Kids) => {
    if (children) return <div className="sources">{unwrap(children)}</div>;
    if (!mdn) throw new Error("<Sources> needs mdn=\"…\" or its own text");
    const cc25 = <a href="https://creativecommons.org/licenses/by-sa/2.5/">CC BY-SA 2.5</a>;
    const cc40 = <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>;
    const license = <a href={`${ctx.up}LICENSE`}>LICENSE</a>;
    return ctx.lang === "ru" ? (
      <div className="sources">
        По материалам <a href={mdn}>MDN Web Docs</a> (авторы — Mozilla Contributors), лицензия {cc25}. Эта страница — {cc40}, условия целиком в {license}.
      </div>
    ) : (
      <div className="sources">
        Based on <a href={mdn}>MDN Web Docs</a> (authors: Mozilla Contributors), licensed under {cc25}. This page is licensed under {cc40}; full terms are in {license}.
      </div>
    );
  };
  return Sources;
}

export function courseComponents(ctx: PageContext) {
  const L = LABELS[ctx.lang];
  return {
    Code,
    Scheme: scheme(ctx),
    Sources: sources(ctx),
    Toc: ({ children }: Kids) => (
      <div className="toc">
        <div className="toc-title">{L.toc}</div>
        {children}
      </div>
    ),
    Ref: ({ children }: Kids) => (
      <div className="ref">
        <div className="ref-title">{L.ref}</div>
        {children}
      </div>
    ),
    Answer: ({ children }: Kids) => (
      <details className="answer">
        <summary>{L.answer}</summary>
        {unwrap(children)}
      </details>
    ),
    Full: () => <span className="mark mark-full">{L.full}</span>,
    Brief: () => <span className="mark mark-brief">{L.brief}</span>,
    Review: () => <span className="mark mark-brief">{L.review}</span>,
    Kbd: ({ children }: Kids) => <span className="kbd">{children}</span>,
    Step: ({ n, children }: { n: string } & Kids) => (
      <div className="step">
        <div className="step-number">{n}</div>
        <div>{children}</div>
      </div>
    ),
    Timeline: blockBox("timeline"),
    Event: ({ year, children }: { year: string } & Kids) => (
      <div className="timeline-item">
        <div className="timeline-year">{year}</div>
        {unwrap(children)}
      </div>
    ),
    Goals: blockBox("goals"),
    Cheatsheet: blockBox("cheatsheet"),
    Selfcheck: blockBox("selfcheck"),
    Analogy: textBox("analogy"),
    TryIt: textBox("try-it"),
    Why: textBox("why"),
    FunFact: textBox("fun-fact"),
    RealWorld: textBox("real-world"),
    Mistake: textBox("mistake"),
    Important: textBox("important"),
    ProTip: textBox("pro-tip"),
    Highlight: textBox("highlight"),
  };
}

// The head of a lecture, from its frontmatter: the day and lesson, the title, one line about the lesson.
export function DayHead({ day, heading, lead }: { day: string; heading: string; lead: string }) {
  return (
    <div className="day-head">
      <span className="day-no">{day}</span>
      <h1>{heading}</h1>
      <p>{lead}</p>
    </div>
  );
}
