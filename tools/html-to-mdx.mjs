// An HTML day page -> MDX next to it (Markdown + the course's components, site/lib/course.tsx) and its schemes as
// .svg files — stage 2 of the move to Next.js (HANDOFF, section 1). The HTML file stays: it is the reference of
// compare-site until stage 4.
//
//   node tools/html-to-mdx.mjs essentials/day-01/student.html      one page -> student.mdx
//   node tools/html-to-mdx.mjs essentials/day-01                   every page of the day, RU and en/
//   node tools/html-to-mdx.mjs essentials/day-01 --dry             only report what would be written
//   node tools/html-to-mdx.mjs … --force                           overwrite an existing .mdx (and its schemes)
//
// Anything the converter does not know yet stops it with the file and line: nothing is dropped silently. The result
// is checked against the HTML page by compare-site (build the site first).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromSite = (p) => import(pathToFileURL(path.join(ROOT, 'site', 'node_modules', p)).href);
const { parse } = await fromSite('parse5/dist/index.js');
const YAML = (await fromSite('yaml/dist/index.js')).default;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length) { console.log('usage: node tools/html-to-mdx.mjs <page.html | day folder>… [--dry] [--force]'); process.exit(1); }

const pagesOf = (t) => {
  const abs = path.resolve(ROOT, t);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { recursive: true }).filter((f) => /(^|[\\/])(lecture|student|tasks)\.html$/.test(f)).sort().map((f) => path.join(abs, f));
};

const kids = (n) => n.childNodes ?? [];
const isEl = (n) => !!n.tagName;
const attr = (n, a) => n.attrs?.find((x) => x.name === a)?.value;
const cls = (n) => (attr(n, 'class') ?? '').split(/\s+/).filter(Boolean);
const find = (n, pred) => { if (pred(n)) return n; for (const c of kids(n)) { const r = find(c, pred); if (r) return r; } return null; };
const textOf = (n) => (n.nodeName === '#text' ? n.value : kids(n).map(textOf).join(''));
const elems = (n) => kids(n).filter(isEl);
const flat = (s) => s.replace(/\s+/g, ' ').trim();

const LABELS = {
  ru: { toc: 'Содержание главы', answer: 'Ответ', ref: 'Справочник дня', full: 'подробно', brief: 'кратко', review: 'повторение', easy: 'Легко', medium: 'Средне', hard: 'Сложно', min: 'мин' },
  en: { toc: 'Contents', answer: 'Answer', ref: 'Reference of the day', full: 'in depth', brief: 'briefly', review: 'review', easy: 'Easy', medium: 'Medium', hard: 'Hard', min: 'min' },
};
// boxes whose text lies right in the <div> (the component takes MDX's <p> off) and boxes of blocks
const TEXT_BOXES = {
  analogy: 'Analogy', 'try-it': 'TryIt', why: 'Why', 'fun-fact': 'FunFact', 'real-world': 'RealWorld', mistake: 'Mistake',
  important: 'Important', 'pro-tip': 'ProTip', highlight: 'Highlight', hint: 'Hint', 'write-box': 'WriteBox',
  definition: 'Definition', 'key-point': 'KeyPoint', remember: 'Remember', 'note-box': 'NoteBox', 'result-box': 'ResultBox',
  summary: 'Summary',
};
const BLOCK_BOXES = { goals: 'Goals', cheatsheet: 'Cheatsheet', selfcheck: 'Selfcheck', criteria: 'Criteria', example: 'Example', homework: 'Homework', compare: 'Compare' };
const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'pre', 'table', 'h1', 'h2', 'h3', 'h4', 'figure', 'details']);
const PUNCT = /[\p{P}\p{S}]/u;
const SPACE = /\s/u;

function convert(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const doc = parse(source, { sourceCodeLocationInfo: true });
  const where = (n) => `${rel}:${n.sourceCodeLocation?.startLine ?? '?'}`;
  const fail = (n, msg) => { throw new Error(`${where(n)}: ${msg}`); };
  const onlyAttrs = (n, allowed) => { for (const a of n.attrs ?? []) if (!allowed.includes(a.name)) fail(n, `<${n.tagName} ${a.name}="…"> not handled`); };

  const html = find(doc, (n) => n.tagName === 'html');
  const lang = attr(html, 'lang');
  const L = LABELS[lang];
  if (!L) throw new Error(`${rel}: <html lang="${lang}">`);
  const head = find(html, (n) => n.tagName === 'head');
  const body = find(html, (n) => n.tagName === 'body');
  const title = flat(textOf(find(head, (n) => n.tagName === 'title')));
  const styleEl = find(head, (n) => n.tagName === 'style');
  const container = elems(body).find((n) => cls(n).includes('container'));
  if (!container) throw new Error(`${rel}: no div.container`);
  const schemes = [];
  let section = 'top';

  // ---------- text ----------
  // Text for MDX: what Markdown or JSX would read as syntax is escaped; a no-break space is written &nbsp;.
  const escapeText = (t, { table = false } = {}) => {
    let s = t
      .replace(/\\/g, '\\\\')
      .replace(/([{}<`[\]*])/g, '\\$1')
      .replace(/&(?=[a-zA-Z0-9#]+;)/g, '&amp;')
      // each underscore not inside a word ("два __proto__": all four — escaping every other one left _proto_ italic)
      .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_')
      .replace(/~~/g, '\\~\\~')
      .replace(/(https?|ftp):\/\//g, '$1\\://')
      .replace(/\bwww\./g, 'www\\.')
      .replace(/@/g, '\\@')
      .replace(/ /g, '&nbsp;');
    if (table) s = s.replace(/\|/g, '\\|');
    return s;
  };
  const codeSpan = (text, { table = false } = {}) => {
    let t = text;
    if (table) t = t.replace(/\|/g, '\\|');
    const runs = t.match(/`+/g) ?? [];
    const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
    const pad = /^[ `]|[ `]$/.test(t) ? ' ' : '';
    return fence + pad + t + pad + fence;
  };
  const nextChar = (nodes, n) => { for (const m of nodes.slice(nodes.indexOf(n) + 1)) { const t = textOf(m); if (t) return t[0]; } return ''; };

  // inline nodes -> Markdown (the source's line breaks kept; paragraphText strips the indentation of each line)
  function inline(nodes, ctx = {}) {
    let out = '';
    for (const n of nodes) {
      if (n.nodeName === '#text') { out += escapeText(n.value, ctx); continue; }
      // a comment (e.g. "ahead-ok: day 17, course 2", read by check-ahead) stays a comment: {/* … */} draws nothing
      if (n.nodeName === '#comment') { if (n.data.includes('*/')) fail(n, 'a comment with */'); out += `{/* ${n.data.trim()} */}`; continue; }
      if (!isEl(n)) continue;
      const tag = n.tagName;
      const inner = () => inline(kids(n), ctx);
      if (tag === 'strong' || tag === 'em') {
        onlyAttrs(n, []);
        const mark = tag === 'strong' ? '**' : '*';
        const text = inner();
        // a delimiter next to punctuation needs space or punctuation on its other side (CommonMark flanking rules)
        const before = out.slice(-1), after = nextChar(nodes, n);
        const first = textOf(n)[0] ?? '', last = textOf(n).slice(-1);
        const okOpen = !SPACE.test(first) && (!PUNCT.test(first) || !before || SPACE.test(before) || PUNCT.test(before));
        const okClose = !SPACE.test(last) && (!PUNCT.test(last) || !after || SPACE.test(after) || PUNCT.test(after));
        out += okOpen && okClose && text ? mark + text + mark : `<${tag}>${text}</${tag}>`;
        continue;
      }
      if (tag === 'code') {
        onlyAttrs(n, []);
        // inline code with markup inside (<code><span lang="ru">арр</span>.js</code>): JSX, so the span stays
        out += elems(n).length ? `<code>${inline(kids(n), ctx)}</code>` : codeSpan(textOf(n), ctx);
        continue;
      }
      if (tag === 'a') {
        onlyAttrs(n, ['href']);
        const href = attr(n, 'href');
        out += `[${inner()}](${/[\s()<>]/.test(href) ? `<${href}>` : href})`;
        continue;
      }
      if (tag === 'br') { onlyAttrs(n, []); out += '\\\n'; continue; }
      if (tag === 'span' && cls(n).join(' ') === 'kbd') { onlyAttrs(n, ['class']); out += `<Kbd>${inner()}</Kbd>`; continue; }
      if (tag === 'span' && cls(n).includes('mark')) {
        const t = flat(textOf(n)), c = cls(n).join(' ');
        if (c === 'mark mark-full' && t === L.full) out += '<Full />';
        else if (c === 'mark mark-brief' && t === L.brief) out += '<Brief />';
        else if (c === 'mark mark-brief' && t === L.review) out += '<Review />';
        else fail(n, `a mark "${c}" "${t}"`);
        continue;
      }
      if (tag === 'span' || tag === 'sup' || tag === 'sub') {
        out += `<${tag}${jsxAttrs(n, ['class', 'style', 'lang'])}>${inner()}</${tag}>`;
        continue;
      }
      // pictures of a program's result (days 27 and 29 of Essentials): buttons and checkboxes that do nothing
      if (tag === 'button') { out += `<button${jsxAttrs(n, ['type', 'disabled'])}>${inner()}</button>`; continue; }
      if (tag === 'input') { out += `<input${jsxAttrs(n, ['type', 'checked', 'disabled'])} />`; continue; }
      fail(n, `inline <${tag}> not handled`);
    }
    return out;
  }

  // Markdown of a paragraph: each source line without its indentation; lines Markdown would read as a block (a list,
  // a heading, a quote, a rule) escaped.
  function paragraphText(text) {
    const lines = text.split('\n').map((l) => l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''));
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    // an empty line inside a paragraph is only whitespace in HTML, but would end the paragraph in Markdown
    return lines.filter(Boolean).map((l) => l
      .replace(/^([#>+=|])/, '\\$1')
      .replace(/^(-)(?=\s|$)/, '\\$1')
      .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2')
      .replace(/^(-{3,}|={3,})$/, (m) => '\\' + m)).join('\n');
  }
  const oneLine = (n) => paragraphText(inline(kids(n))).replace(/\n/g, ' ');

  // a run of children -> paragraphs (from runs of inline nodes) and blocks
  function flow(nodes) {
    const out = [];
    let run = [];
    const flush = () => { const t = inline(run); if (t.trim()) out.push(paragraphText(t)); run = []; };
    for (const n of nodes) {
      if (isEl(n) && BLOCK.has(n.tagName)) { flush(); out.push(block(n)); } else run.push(n);
    }
    flush();
    return out.join('\n\n');
  }

  // JSX attributes of an element Markdown cannot write (a style, a colspan): class -> className, colspan ->
  // colSpan, style="a-b: c;" -> style={{aB: "c"}} (React writes it back as the same declarations)
  const jsxAttrs = (n, allowed) => {
    onlyAttrs(n, allowed);
    return (n.attrs ?? []).map((a) => {
      if (a.name === 'style') {
        const decls = a.value.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
          const m = /^([a-z-]+)\s*:\s*(.+)$/.exec(d);
          if (!m || /["\\]/.test(m[2])) fail(n, `style "${a.value}"`);
          return `${m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())}: "${m[2]}"`;
        });
        return ` style={{${decls.join(', ')}}}`;
      }
      // boolean attributes: disabled as is; checked as React's defaultChecked (it renders the same checked="",
      // without React's warning about a checked box with no onChange)
      if (a.name === 'disabled' || a.name === 'checked') {
        if (a.value !== '') fail(n, `${a.name}="${a.value}"`);
        return a.name === 'checked' ? ' defaultChecked' : ' disabled';
      }
      const name = { class: 'className', colspan: 'colSpan', rowspan: 'rowSpan' }[a.name] ?? a.name;
      return ` ${name}="${a.value.replace(/"/g, '&quot;')}"`;
    }).join('');
  };

  // ---------- blocks ----------
  const indent = (s, by) => s.split('\n').map((l) => (l ? by + l : l)).join('\n');
  const jsx = (name, inner, props = '') => `<${name}${props}>\n${inner}\n</${name}>`;

  function codeBlock(n) {
    const c = cls(n).join(' ');
    const lang = { 'code js': 'js', 'code html': 'html', 'plain-out': 'plain-out', grammar: 'grammar' }[c];
    if (!lang) fail(n, `<pre class="${c}">`);
    onlyAttrs(n, ['class', 'data-file', 'data-page']);
    if (elems(n).length) fail(n, '<pre> with elements inside');
    if (kids(n).some((k) => k.nodeName === '#comment')) fail(n, '<pre> with a comment inside');
    const meta = ['data-file', 'data-page'].filter((a) => attr(n, a) !== undefined).map((a) => `${a.slice(5)}="${attr(n, a)}"`).join(' ');
    const text = textOf(n);
    const runs = text.match(/`{3,}/g) ?? [];
    const fence = '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
    return `${fence}${lang}${meta ? ' ' + meta : ''}\n${text}\n${fence}`;
  }

  function answerJsx(d) {
    const sum = elems(d)[0];
    if (!cls(d).includes('answer') || sum?.tagName !== 'summary' || flat(textOf(sum)) !== L.answer) fail(d, 'an answer without the usual <summary>');
    const after = kids(d).slice(kids(d).indexOf(sum) + 1);
    if (after.some((k) => isEl(k) && BLOCK.has(k.tagName))) fail(d, 'an answer with blocks inside');
    return `<Answer>${paragraphText(inline(after))}</Answer>`;
  }

  function list(n) {
    if ((n.attrs ?? []).length) {
      // a list with a style: JSX, one <li> per line (text only inside)
      const items = elems(n).map((li) => {
        onlyAttrs(li, []);
        if (elems(li).some((e) => BLOCK.has(e.tagName))) fail(li, 'a block inside an item of a styled list');
        return `<li>${paragraphText(inline(kids(li))).replace(/\n/g, ' ')}</li>`;
      });
      return `<${n.tagName}${jsxAttrs(n, ['style', 'type'])}>\n${items.join('\n')}\n</${n.tagName}>`;
    }
    const ordered = n.tagName === 'ol';
    if (kids(n).some((k) => k.nodeName === '#text' && k.value.trim())) fail(n, 'text right in a list');
    return elems(n).map((li, i) => {
      if (li.tagName !== 'li') fail(li, `<${li.tagName}> in a list`);
      onlyAttrs(li, []);
      const marker = ordered ? `${i + 1}. ` : '- ';
      const parts = [];
      let run = [];
      const flush = () => { const t = inline(run); if (t.trim()) parts.push(paragraphText(t)); run = []; };
      for (const k of kids(li)) {
        if (isEl(k) && k.tagName === 'details') {
          // the answer goes right after the question, in the same paragraph: the list stays tight (no <p>)
          const t = inline(run);
          run = [];
          parts.push((t.trim() ? paragraphText(t) + '\n' : '') + answerJsx(k));
        } else if (isEl(k) && BLOCK.has(k.tagName)) { flush(); parts.push(block(k)); } else run.push(k);
      }
      flush();
      return marker + indent(parts.join('\n'), ' '.repeat(marker.length)).trimStart();
    }).join('\n');
  }

  function table(n) {
    const parts = elems(n);
    const thead = parts.find((p) => p.tagName === 'thead'), tbody = parts.find((p) => p.tagName === 'tbody');
    if (!thead || !tbody || parts.length !== 2) fail(n, 'a table without exactly thead + tbody');
    const cellsOf = (sec) => elems(sec).flatMap((tr) => elems(tr));
    const plain = !(n.attrs ?? []).length && [thead, tbody].every((sec) => elems(sec).every((tr) => !(tr.attrs ?? []).length) && cellsOf(sec).every((c) => !(c.attrs ?? []).length));
    for (const c of [...cellsOf(thead), ...cellsOf(tbody)]) if (elems(c).some((e) => BLOCK.has(e.tagName))) fail(c, 'a block inside a table cell');
    if (!plain) {
      // a table with a style on a row, a colspan or a class: JSX, a line per row
      const row = (tr) => `<tr${jsxAttrs(tr, ['style'])}>${elems(tr).map((c) => `<${c.tagName}${jsxAttrs(c, ['colspan', 'rowspan', 'style'])}>${inline(kids(c)).replace(/\s*\n\s*/g, ' ').trim()}</${c.tagName}>`).join('')}</tr>`;
      const sec = (el) => `<${el.tagName}>\n${elems(el).map(row).join('\n')}\n</${el.tagName}>`;
      onlyAttrs(thead, []); onlyAttrs(tbody, []);
      return `<table${jsxAttrs(n, ['class'])}>\n${sec(thead)}\n${sec(tbody)}\n</table>`;
    }
    const rows = (sec) => elems(sec).map((tr) => elems(tr).map((c) => inline(kids(c), { table: true }).replace(/\s*\n\s*/g, ' ').trim()));
    const headRows = rows(thead), bodyRows = rows(tbody);
    if (headRows.length !== 1) fail(n, 'not one header row');
    if (bodyRows.some((r) => r.length !== headRows[0].length)) fail(n, 'rows of different width');
    const line = (cells) => `| ${cells.join(' | ')} |`;
    return [line(headRows[0]), line(headRows[0].map(() => '---')), ...bodyRows.map(line)].join('\n');
  }

  function scheme(fig) {
    onlyAttrs(fig, ['class']);
    const [svg, cap] = elems(fig);
    if (svg?.tagName !== 'svg' || cap?.tagName !== 'figcaption' || elems(fig).length !== 2) fail(fig, 'a scheme that is not svg + figcaption');
    const loc = svg.sourceCodeLocation;
    const lines = source.slice(loc.startOffset, loc.endOffset).split('\n');
    // the lines after the first carry the page's indentation: the common part goes
    const common = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    let raw = [lines[0], ...lines.slice(1).map((l) => l.slice(Math.min(common, l.match(/^ */)[0].length)))].join('\n');
    raw = raw.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/&nbsp;/g, '&#160;');
    if (/&(?!lt;|gt;|amp;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(raw)) fail(svg, 'a named entity inside the scheme');
    let name = `scheme-${section}.svg`;
    for (let k = 2; schemes.some((s) => s.name === name); k++) name = `scheme-${section}-${k}.svg`;
    schemes.push({ name, text: raw + '\n' });
    return `<Scheme src="${name}">${paragraphText(inline(kids(cap)))}</Scheme>`;
  }

  function toc(n, h2s) {
    const [titleEl, ol] = elems(n);
    if (flat(textOf(titleEl)) !== L.toc || ol?.tagName !== 'ol' || elems(n).length !== 2) fail(n, 'an unusual table of contents');
    // <Toc /> draws plain text: an item with markup (day 22: "Где <code>?.</code> не поможет") needs the list written out
    const items = elems(ol).map((li) => { const a = elems(li)[0]; return [attr(a, 'href'), flat(textOf(a)), elems(a).length]; });
    const auto = h2s.map((h) => [`#${attr(h, 'id')}`, flat(textOf(h)).replace(/^\d+\.\s*/, ''), 0]);
    return JSON.stringify(items) === JSON.stringify(auto) ? '<Toc />' : jsx('Toc', list(ol));
  }

  function sources(n) {
    const links = elems(n).filter((e) => e.tagName === 'a');
    const mdn = attr(links[0], 'href');
    const up = rel.includes('/en/') ? '../../../' : '../../';
    const std = lang === 'en'
      ? 'Based on MDN Web Docs (authors: Mozilla Contributors), licensed under CC BY-SA 2.5. This page is licensed under CC BY-SA 4.0; full terms are in LICENSE.'
      : 'По материалам MDN Web Docs (авторы — Mozilla Contributors), лицензия CC BY-SA 2.5. Эта страница — CC BY-SA 4.0, условия целиком в LICENSE.';
    const hrefs = links.map((a) => attr(a, 'href')).join(' ');
    const want = `${mdn} https://creativecommons.org/licenses/by-sa/2.5/ https://creativecommons.org/licenses/by-sa/4.0/ ${up}LICENSE`;
    if (flat(textOf(n)) === std && hrefs === want && elems(n).length === 4) return `<Sources mdn="${mdn}" />`;
    return jsx('Sources', paragraphText(inline(kids(n))));
  }

  function task(n) {
    const [header, goal, ...rest] = elems(n);
    const [titleEl, meta] = header ? elems(header) : [];
    if (!cls(header).includes('task-header') || !cls(titleEl).includes('task-title') || !cls(meta).includes('task-meta') || elems(header).length !== 2) fail(n, 'an unusual task header');
    if (elems(titleEl).length) fail(titleEl, 'markup in a task title');
    const [level, time] = elems(meta);
    const lv = ['easy', 'medium', 'hard'].find((k) => cls(level).join(' ') === `badge badge-${k}`);
    const minutes = new RegExp(`^(\\d+) ${L.min}$`).exec(flat(textOf(time ?? {})));
    if (!lv || flat(textOf(level)) !== L[lv] || cls(time).join(' ') !== 'badge badge-time' || !minutes || elems(meta).length !== 2) fail(meta, 'unusual task badges');
    if (goal?.tagName !== 'p' || cls(goal).join(' ') !== 'task-goal') fail(n, 'a task without p.task-goal second');
    const inner = kids(n).slice(kids(n).indexOf(goal) + 1);
    if (inner.some((k) => k.nodeName === '#text' && k.value.trim())) fail(n, 'text right in a task');
    const body = [`<Goal>${oneLine(goal)}</Goal>`, flow(inner)].filter(Boolean).join('\n\n');
    return jsx('Task', body, ` title="${flat(textOf(titleEl)).replace(/"/g, '&quot;')}" level="${lv}" time="${minutes[1]}"`);
  }

  function block(n) {
    const tag = n.tagName, c = cls(n), k = c.join(' ');
    if (tag === 'p') {
      if (k === 'subtitle') { onlyAttrs(n, ['class']); return `<Subtitle>${oneLine(n)}</Subtitle>`; }
      // a paragraph with a style: JSX, its text starting on the tag's line (so that MDX reads it as text, not as a
      // <p> inside the <p>)
      if ((n.attrs ?? []).length) return `<p${jsxAttrs(n, ['style'])}>${paragraphText(inline(kids(n)))}</p>`;
      return paragraphText(inline(kids(n)));
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      onlyAttrs(n, ['id']);
      if (tag === 'h2' && attr(n, 'id')) section = attr(n, 'id');
      const text = inline(kids(n)).replace(/\s*\n\s*/g, ' ').trim();
      return `${'#'.repeat(Number(tag[1]))} ${text}${attr(n, 'id') ? ` {#${attr(n, 'id')}}` : ''}`;
    }
    if (tag === 'ul' || tag === 'ol') return list(n);
    if (tag === 'pre') return codeBlock(n);
    if (tag === 'table') return table(n);
    if (tag === 'figure' && k === 'scheme') return scheme(n);
    if (tag === 'div') {
      if (TEXT_BOXES[k]) { onlyAttrs(n, ['class']); return jsx(TEXT_BOXES[k], flow(kids(n))); }
      if (BLOCK_BOXES[k]) { onlyAttrs(n, ['class']); return jsx(BLOCK_BOXES[k], flow(kids(n))); }
      if (k === 'toc') return toc(n, h2List);
      if (k === 'sources') return sources(n);
      if (k === 'task') return task(n);
      if (k === 'ref') {
        const [t, ...rest] = elems(n);
        if (!cls(t).includes('ref-title') || flat(textOf(t)) !== L.ref) fail(n, 'an unusual ref title');
        return jsx('Ref', rest.map(block).join('\n\n'));
      }
      if (k === 'step') {
        // the number is a <div> on some pages and a <span> on others
        const [num, inner] = elems(n);
        if (cls(num).join(' ') !== 'step-number' || !['div', 'span'].includes(num.tagName) || elems(n).length !== 2 || inner.tagName !== 'div' || cls(inner).length || elems(num).length) fail(n, 'an unusual step');
        return jsx('Step', flow(kids(inner)), ` n="${flat(textOf(num))}"${num.tagName === 'span' ? ' numberTag="span"' : ''}`);
      }
      if (k === 'wrong' || k === 'right') {
        const [label] = elems(n);
        if (cls(label).join(' ') !== 'label' || elems(label).length) fail(n, `an unusual ${k} box`);
        const rest = kids(n).slice(kids(n).indexOf(label) + 1);
        return jsx(k === 'wrong' ? 'Wrong' : 'Right', flow(rest), ` label="${flat(textOf(label)).replace(/"/g, '&quot;')}"`);
      }
      if (k === 'timeline') {
        return jsx('Timeline', elems(n).map((item) => {
          const [year] = elems(item);
          if (!cls(item).includes('timeline-item') || !cls(year).includes('timeline-year')) fail(item, 'an unusual timeline item');
          return jsx('Event', flow(kids(item).slice(kids(item).indexOf(year) + 1)), ` year="${flat(textOf(year))}"`);
        }).join('\n\n'));
      }
    }
    fail(n, `block <${tag}${c.length ? '.' + c.join('.') : ''}> not handled`);
  }

  // ---------- the page ----------
  const front = { title };
  const children = elems(container);
  let start = 0;
  if (children[0] && cls(children[0]).includes('day-head')) {
    // the head of a lecture -> frontmatter: day and lesson, title, one line about the lesson
    const dh = children[0];
    const [dayNo, h1, p] = elems(dh);
    if (!cls(dayNo).includes('day-no') || h1?.tagName !== 'h1' || p?.tagName !== 'p' || elems(dh).length !== 3) fail(dh, 'an unusual day head');
    for (const e of [dayNo, h1, p]) if (elems(e).length) fail(e, 'markup inside the day head');
    Object.assign(front, { day: flat(textOf(dayNo)), heading: flat(textOf(h1)), lead: flat(textOf(p)) });
    start = 1;
  }
  if (styleEl) front.css = textOf(styleEl).split('\n').map((l) => l.trim()).filter(Boolean).join('\n') + '\n';
  if (kids(container).some((k) => k.nodeName === '#text' && k.value.trim())) fail(container, 'text right in the container');
  const h2List = children.filter((e) => e.tagName === 'h2' && attr(e, 'id'));
  // the container's children after the day head, comments between blocks included
  const rest = start ? kids(container).slice(kids(container).indexOf(children[0]) + 1) : kids(container);
  const mdx = `---\n${YAML.stringify(front, { lineWidth: 0 })}---\n\n${flow(rest)}\n`;
  return { rel, mdx, schemes, lines: source.split('\n').length };
}

let failed = 0;
for (const file of targets.flatMap(pagesOf)) {
  const out = file.replace(/\.html$/, '.mdx');
  const relOut = path.relative(ROOT, out).replace(/\\/g, '/');
  try {
    const { rel, mdx, schemes, lines } = convert(file);
    const exists = fs.existsSync(out);
    const same = exists && fs.readFileSync(out, 'utf8') === mdx;
    let state = same ? 'unchanged' : exists && !FORCE ? 'EXISTS, differs (not written; --force to overwrite)' : DRY ? 'would write' : 'written';
    if (!DRY && (!exists || FORCE) && !same) {
      fs.writeFileSync(out, mdx);
      for (const s of schemes) fs.writeFileSync(path.join(path.dirname(out), s.name), s.text);
    }
    console.log(`${rel} -> ${relOut}: ${state} (${mdx.split('\n').length} lines from ${lines}${schemes.length ? `; schemes ${schemes.map((s) => s.name).join(', ')}` : ''})`);
  } catch (e) {
    failed++;
    console.log(`FAILED ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
