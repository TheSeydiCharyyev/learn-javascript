// The built site (site/out) for the checks — stage 4 of the move to Next.js (HANDOFF, section 1): the tools read the
// pages as the site builds them, not the HTML files they were made from.
//
//   const site = require('./lib/site.cjs');                 (from .mjs: import site from './lib/site.cjs')
//   site.builtFile('essentials/day-01/lecture.html')        the built file; throws if it is missing or older than its
//                                                           sources (run `pnpm build` in site/)
//   const p = site.page('essentials/day-01/lecture.html')   the page's <body> as a tree (parse5), without Next's nodes:
//   p.all('pre.code.js'), p.first('div.sources a'), p.text(node), p.attr(node, 'href'), p.lang, p.title,
//   p.inner(node) / p.outer(node) (the node as HTML again)
//   site.dayPages('essentials/day-01/en')                   the written pages of a day folder (MDX or HTML)
//   const { base, close } = await site.serve()              a local server of site/out for a browser (the built pages
//                                                           load their CSS and scripts from /_next/…, so file:// will
//                                                           not do): page(base + 'essentials/day-01/lecture.html')
//
// A page is named by its old path, "<course>/day-NN/[en/]<page>.html" or "index.html": the export writes each route
// back as that file.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'site', 'out');

// ---------- the build must be there and newer than its sources ----------

// what every page is made with: the site's code, the course CSS, and for the home page the plans
const SHARED = [
  ['site/lib', /\.(ts|tsx)$/], ['site/app', /\.(ts|tsx|css)$/], ['css', /\.css$/],
  ['tools', /^(plan-days|plan-modules|plan-en|home-data)\.mjs$/],
];
let sharedNewest = null;
function sharedMtime() {
  if (sharedNewest !== null) return sharedNewest;
  sharedNewest = 0;
  for (const [dir, re] of SHARED) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (re.test(e.name)) sharedNewest = Math.max(sharedNewest, fs.statSync(p).mtimeMs);
      }
    };
    walk(path.join(ROOT, dir));
  }
  return sharedNewest;
}

// a page's own sources: its MDX file and the schemes next to it, or its HTML file (a day not moved yet)
function sourcesOf(rel) {
  const out = [];
  const mdx = path.join(ROOT, rel.replace(/\.html$/, '.mdx'));
  if (fs.existsSync(mdx)) {
    out.push(mdx);
    for (const n of fs.readdirSync(path.dirname(mdx))) if (n.endsWith('.svg')) out.push(path.join(path.dirname(mdx), n));
  } else if (rel !== 'index.html' && fs.existsSync(path.join(ROOT, rel))) out.push(path.join(ROOT, rel));
  return out;
}

const fresh = new Set();
function builtFile(rel) {
  const file = path.join(OUT, rel);
  if (fresh.has(rel)) return file;
  if (!fs.existsSync(file)) throw new Error(`site/out/${rel} is missing: run \`pnpm build\` in site/ first`);
  const built = fs.statSync(file).mtimeMs;
  const newer = sourcesOf(rel).find((s) => fs.statSync(s).mtimeMs > built);
  if (newer) throw new Error(`site/out/${rel} is older than ${path.relative(ROOT, newer).replace(/\\/g, '/')}: run \`pnpm build\` in site/ first`);
  if (sharedMtime() > built) throw new Error(`site/out/${rel} is older than the site's code, the course CSS or the plans: run \`pnpm build\` in site/ first`);
  fresh.add(rel);
  return file;
}

// ---------- a built page as a tree ----------

let parse5 = null;
const parser = () => (parse5 ??= require(path.join(ROOT, 'site', 'node_modules', 'parse5', 'dist', 'index.js')));

const isElement = (n) => n && typeof n.tagName === 'string';
const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const classes = (n) => (attr(n, 'class') ?? '').split(/\s+/).filter(Boolean);
const text = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join(''));

// Next.js's own nodes in <body> (as compare-site skips them): its scripts, a hidden <div> of comments, the route
// announcer
const isNext = (n) => n.tagName === 'next-route-announcer'
  || (n.tagName === 'script' && (/\/_next\//.test(attr(n, 'src') ?? '') || /self\.__next_f|globalThis\["TURBOPACK"\]/.test(text(n))))
  || (n.tagName === 'div' && attr(n, 'hidden') !== undefined && (n.childNodes ?? []).every((c) => c.nodeName === '#comment'));

// Selectors: compounds of tag, .class, [attr], [attr=value] (value quoted or not), joined by spaces (descendant).
function compile(selector) {
  return selector.trim().split(/\s+/).map((part) => {
    const m = /^([a-z][a-z0-9-]*)?((?:\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]*))?\])*)$/i.exec(part);
    if (!m) throw new Error(`selector not supported: "${selector}"`);
    const tag = m[1]?.toLowerCase();
    const cls = [...m[2].matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
    const attrs = [...m[2].matchAll(/\[([\w-]+)(?:=("[^"]*"|'[^']*'|[^\]]*))?\]/g)].map((x) => [x[1], x[2]?.replace(/^["']|["']$/g, '')]);
    return (n) => (!tag || n.tagName === tag) && cls.every((c) => classes(n).includes(c))
      && attrs.every(([k, v]) => (v === undefined ? attr(n, k) !== undefined : attr(n, k) === v));
  });
}
function matches(n, chain) {
  if (!chain.at(-1)(n)) return false;
  let i = chain.length - 2;
  for (let p = n.parentNode; i >= 0 && p && isElement(p); p = p.parentNode) if (chain[i](p)) i--;
  return i < 0;
}

function page(rel) {
  const html = fs.readFileSync(builtFile(rel), 'utf8');
  const doc = parser().parse(html);
  const root = doc.childNodes.find((n) => n.tagName === 'html');
  const body = root.childNodes.find((n) => n.tagName === 'body');
  body.childNodes = body.childNodes.filter((n) => !isNext(n));
  const all = (selector, from = body) => {
    const chain = compile(selector), out = [];
    const walk = (n) => { for (const c of n.childNodes ?? []) if (isElement(c)) { if (matches(c, chain)) out.push(c); walk(c.content ?? c); } };
    walk(from);
    return out;
  };
  const head = root.childNodes.find((n) => n.tagName === 'head');
  const title = head.childNodes.find((n) => n.tagName === 'title');
  return {
    rel, html, body, head, lang: attr(root, 'lang'), title: title ? text(title) : null,
    all, first: (selector, from) => all(selector, from)[0] ?? null, text, attr, classes,
    // a node as HTML again (parse5's serializer: attributes in double quotes, & < > " escaped where HTML needs it)
    inner: (n) => parser().serialize(n), outer: (n) => parser().serializeOuter(n),
  };
}

// ---------- the pages of a day ----------

const PAGE_NAMES = ['lecture', 'student', 'tasks'];
// a page is written when its MDX file is, or its HTML file (a day not moved yet)
const written = (rel) => fs.existsSync(path.join(ROOT, rel.replace(/\.html$/, '.mdx'))) || fs.existsSync(path.join(ROOT, rel));
// the written pages of a day folder ("essentials/day-01" or "essentials/day-01/en"), as page paths
const dayPages = (dir) => PAGE_NAMES.map((n) => `${dir}/${n}.html`).filter(written);

// ---------- a local server of site/out ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// an address -> a file of site/out: the file itself, a folder's index.html, or "<address>.html" (a route of the site,
// "…/day-01/student", is also a folder of Next's data files)
function resolveOut(urlPath) {
  const file = path.join(OUT, urlPath);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (fs.existsSync(path.join(file, 'index.html'))) return path.join(file, 'index.html');
  if (fs.existsSync(file + '.html')) return file + '.html';
  return null;
}

function serve() {
  builtFile('index.html');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = resolveOut(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    // close: open keep-alive connections (a browser's) are dropped, or the server would wait for them
    const close = () => new Promise((ok) => { server.close(ok); server.closeAllConnections(); });
    server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, close }));
  });
}

module.exports = { ROOT, OUT, builtFile, page, serve, written, dayPages };
