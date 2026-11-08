// The Next.js site (site/out) against the HTML files of the course — page for page, as the reader sees them. A page
// the site builds from MDX (lecture.mdx next to lecture.html, stage 2 of the move) is held against its HTML file.
//
//   cd site && pnpm build && cd ..
//   NODE_PATH=C:/Users/seydi/goose/ui/node_modules node tools/compare-site.cjs                  every page + home
//   NODE_PATH=... node tools/compare-site.cjs intermediate 3 4     days 3 and 4 of course 2 (RU and en/)
//   NODE_PATH=... node tools/compare-site.cjs home                 only the home page, in RU, EN, TM, TR
//   NODE_PATH=... node tools/compare-site.cjs --sizes=1280x900 essentials
//   NODE_PATH=... node tools/compare-site.cjs --styles advanced   also boxes and computed styles of every element
//
// The old page is opened as file:// (as check-pages does), the new one from site/out over a local http server (Next's
// scripts sit at /_next/…). At the five check-pages sizes, for every page:
//   - full-page screenshots, byte for byte; on a mismatch the pair is shot again (at most twice);
//   - <body> after the page's scripts ran (highlight.js, lang.js): every top-level element as markup; Next's own
//     nodes are dropped (a hidden <div> of comments, its data scripts, the route announcer); the onclick attribute
//     of the RU/EN button is not compared (React attaches that click as a listener) — the click tests check it; in
//     the navigation bar the new site links to routes ("student", not "student.html" — 07.11.2026), so there its
//     page links are compared with ".html" added. The markup is compared as the browser lays it out (08.11.2026 —
//     MDX does not keep the HTML files' line breaks and indentation): runs of spaces and line breaks in text are one
//     space, and none next to a block-level element or a <br> (SVG too: its schemes are files now, without the HTML page's
//     indentation); inside <pre> (white-space kept) everything as is;
//     comments are skipped (React writes <!-- --> between some texts); attributes in name order, style as the
//     browser normalizes it;
//   - title, <html lang>, highlighted tokens, page height (the list of stylesheets is not compared: the site bundles
//     the course CSS, scoped to the kind of page, into one file — 06.11.2026);
//   - JS errors and failed requests on both pages (/favicon.ico is skipped: Chrome asks every http site for it);
//   - hydration probe: from the first byte a MutationObserver records nodes removed from <body> — a client re-render
//     by React would remove them all (05.11.2026: that is how the "whole <body> as one string" layout failed).
// If screenshots still differ after the retakes, the render inputs are compared: DOM, every box to full float
// precision, the whole computed style of every element and its ::before/::after, the declared fonts. A difference
// there is a failure; if all are identical, the pixels are rasterization noise (e.g. the header's backdrop-filter
// blur over the open menu gives ±1 per channel, and the old page differs from itself there too) — printed as
// "noise", not a failure. A one-step colour change of a text is caught as a failure (mutant, 05.11.2026).
// Once per page: every link of the page (a[href], link[href], script[src]) leads to an existing file in the old
// site exactly when it does in the new one (a route "student" of the new site stands for the file "student.html").
// At 1280x900, on a day page, every link of the navigation bar whose page exists is clicked (lecture / notes /
// tasks, RU/EN; and the first of them once more from the bottom of the page — the bar is sticky): the old page loads
// the next file, the new one must move by Next's router without reloading the document; the page reached is
// compared like any page state, and also: the address (the old one without ".html"), the language saved in
// localStorage, the scroll position, the page's <style>s against the same page opened directly; after the first
// click the browser's Back must bring the page before it back, still without a reload.
// The home page: with the language chosen beforehand (none, en, tk, tr) and after each of: the EN button, the menu
// button on a phone, closing the menu on the overlay (an inline onclick at the top level of <body>).
// Google Fonts (the home page imports Inter) are served from a local copy in tools/.cache/fonts/: over a slow network
// the font subsets arrive at different moments and even the old page differs from itself by 1/64 px of text width.
// Screenshots of differences go to tools/.cache/compare-site/. Playwright from the goose folder, the installed Chrome.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'out');
const CACHE = path.join(__dirname, '.cache');
const SHOTS = path.join(CACHE, 'compare-site');
const COURSES = ['essentials', 'intermediate', 'advanced', 'web-apis'];
const ALL_SIZES = [[360, 780], [414, 800], [768, 1024], [1280, 900], [640, 360]];
const LANG_KEY = 'javascript-essentials-lang';
const HOME_LANGS = ['', 'en', 'tk', 'tr'];
const FAVICON = /\/favicon\.ico$/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain; charset=utf-8' };

// ---------- arguments ----------
const args = process.argv.slice(2);
const sizesArg = args.find((a) => a.startsWith('--sizes='));
// --styles: compare the render inputs (boxes, computed styles, fonts) of every page state, not only when pixels differ
const STYLES = args.includes('--styles');
const SIZES = sizesArg ? ALL_SIZES.filter(([w, h]) => sizesArg.slice(8).split(',').includes(`${w}x${h}`)) : ALL_SIZES;
const words = args.filter((a) => !a.startsWith('--'));
const wrong = words.filter((a) => a !== 'home' && !COURSES.includes(a) && !/^\d+$/.test(a));
if (wrong.length || !SIZES.length) {
  console.log(`unknown argument: ${wrong.join(' ') || sizesArg} (home, a course folder: ${COURSES.join(', ')}, day numbers, --sizes=WxH,…)`);
  process.exit(1);
}
const courses = words.filter((a) => COURSES.includes(a));
const days = words.filter((a) => /^\d+$/.test(a)).map(Number);
const wantHome = !words.length || words.includes('home');
const wantCourses = !words.length ? COURSES : courses;

const pages = [];
for (const course of wantCourses) {
  const dir = path.join(ROOT, course);
  if (!fs.existsSync(dir)) continue;
  for (const day of fs.readdirSync(dir).filter((d) => /^day-\d+$/.test(d)).sort()) {
    if (days.length && !days.includes(Number(day.slice(4)))) continue;
    for (const sub of ['', 'en/']) {
      const at = path.join(dir, day, sub);
      if (!fs.existsSync(at)) continue;
      for (const f of fs.readdirSync(at).filter((f) => f.endsWith('.html')).sort()) pages.push(`${course}/${day}/${sub}${f}`);
    }
  }
}
// a spec is "file" or "file@lang" (the language saved before the page loads)
const specs = [...(wantHome ? HOME_LANGS.map((l) => (l ? `index.html@${l}` : 'index.html')) : []), ...pages];
if (!specs.length) { console.log('no pages selected'); process.exit(1); }

// ---------- the build must be there and newer than its sources ----------
if (!fs.existsSync(path.join(OUT, 'index.html'))) { console.log('site/out/index.html is missing: run `pnpm build` in site/ first'); process.exit(1); }
const files = [...new Set(specs.map((s) => s.split('@')[0]))];
// a page's sources: its HTML file, and its MDX file with the schemes next to it when the page is written in MDX
const sourcesOf = (f) => {
  const out = [path.join(ROOT, f)];
  const mdx = path.join(ROOT, f.replace(/\.html$/, '.mdx'));
  if (fs.existsSync(mdx)) {
    out.push(mdx);
    for (const n of fs.readdirSync(path.dirname(mdx))) if (n.endsWith('.svg')) out.push(path.join(path.dirname(mdx), n));
  }
  return out.filter((x) => fs.existsSync(x));
};
const stale = files.filter((f) => !fs.existsSync(path.join(OUT, f)) || sourcesOf(f).some((x) => fs.statSync(x).mtimeMs > fs.statSync(path.join(OUT, f)).mtimeMs));
if (stale.length) { console.log(`site/out is older than ${stale.length} page(s), e.g. ${stale[0]}: run \`pnpm build\` in site/ first`); process.exit(1); }

// ---------- helpers ----------
// The file for an address, as site/scripts/serve.mjs (and most hosts) find it: the file itself, index.html of a
// folder, or "<address>.html" — a route of the site ("…/day-01/student") is a folder of Next's data files as well.
function resolveOut(urlPath) {
  const file = path.join(OUT, urlPath);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (fs.existsSync(path.join(file, 'index.html'))) return path.join(file, 'index.html');
  if (fs.existsSync(file + '.html')) return file + '.html';
  return null;
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = resolveOut(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function useFontCache(ctx) {
  const dir = path.join(CACHE, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    const key = crypto.createHash('sha1').update(url).digest('hex');
    const body = path.join(dir, key + '.bin'), meta = path.join(dir, key + '.json');
    if (!fs.existsSync(body)) {
      const r = await route.fetch({ timeout: 120000 });
      const h = r.headers();
      fs.writeFileSync(body, await r.body());
      fs.writeFileSync(meta, JSON.stringify({ url, status: r.status(), headers: {
        'content-type': h['content-type'] ?? 'application/octet-stream',
        'access-control-allow-origin': h['access-control-allow-origin'] ?? '*',
      } }));
    }
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    await route.fulfill({ status: m.status, headers: m.headers, body: fs.readFileSync(body) });
  });
}

// From the first byte of every document: element nodes removed from <body> itself.
function probe() {
  window.__removed = [];
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.target !== document.body) continue;
      for (const n of m.removedNodes) if (n.nodeType === 1) window.__removed.push(n.tagName.toLowerCase() + (n.className ? '.' + n.className : ''));
    }
  }).observe(document, { childList: true, subtree: true });
}

// document.fonts.ready alone resolves before Chrome asks for the font subsets the text needs: force layout, wait for
// the network to go quiet, then until no face is loading.
async function settle(page) {
  await page.evaluate(() => { void document.body.offsetHeight; return document.fonts.ready; });
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    for (let i = 0; i < 100 && [...document.fonts].some((f) => f.status === 'loading'); i++) await new Promise((ok) => setTimeout(ok, 100));
    await document.fonts.ready;
  });
  await page.waitForTimeout(200);
}

// Next.js's own nodes in <body>: a hidden <div> of comments (metadata outlet), data scripts, the route announcer.
const NEXT_NODE = `(n) => n.tagName === 'NEXT-ROUTE-ANNOUNCER'
  || (n.tagName === 'SCRIPT' && (/\\/_next\\//.test(n.src) || /self\\.__next_f|globalThis\\["TURBOPACK"\\]/.test(n.textContent)))
  || (n.tagName === 'DIV' && n.hidden && [...n.childNodes].every((c) => c.nodeType === 8))`;

// The page's top-level elements. A day page of the site starts with its own CSS as <style> elements in <body> (its
// kind's CSS, book.css, the colours of the day — 06.11.2026); a top-level <style> is not compared as markup: what
// it does shows in the pixels and, with --styles, in the computed styles.
const TOP_ELEMENTS = `(isNext) => [...document.body.children].filter((c) => !isNext(c) && c.tagName !== 'STYLE')`;

// The RU/EN button of a day page: the HTML pages write its click as onclick="…", React attaches it as an event
// listener (06.11.2026, <LessonNav>) — so that attribute is not compared; what the click does is (the click tests).
// The bar's page links: the new site's go to routes — ".html" is added to them (only there: a link still ending in
// ".html" becomes "….html.html" and differs).
// The markup as laid out (see the top of the file): read from the live page, since whether a neighbour is
// block-level is its computed display.
const snapshot = (page) => page.evaluate(([nextNode, topElements]) => {
  const isNext = eval(nextNode);
  const isNew = location.protocol === 'http:';
  const isBlock = (n) => !!n && n.nodeType === 1 && !/^inline/.test(getComputedStyle(n).display);
  // spaces around a <br> are not drawn either (the end of a line, the start of the next): trimmed as next to a block
  const breaks = (n) => isBlock(n) || (!!n && n.nodeType === 1 && n.tagName === 'BR');
  const keepsSpaces = (el) => /^pre/.test(getComputedStyle(el).whiteSpace);
  const quote = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const attrs = (el) => {
    let at = [...el.attributes].map((a) => [a.name, a.value]);
    if (el.matches('a.lang-btn')) at = at.filter(([k]) => k !== 'onclick');
    if (isNew && el.matches('div.lesson-nav a.nav-link, div.lesson-nav a.lang-btn')) at = at.map(([k, v]) => [k, k === 'href' ? v + '.html' : v]);
    at = at.map(([k, v]) => [k, k === 'style' ? el.style.cssText : v]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    return at.map(([k, v]) => ` ${k}="${quote(v)}"`).join('');
  };
  const markup = (el) => {
    const tag = el.tagName.toLowerCase();
    const open = `<${tag}${attrs(el)}>`, close = `</${tag}>`;
    if (keepsSpaces(el)) return open + el.innerHTML + close;
    const parts = []; // elements, and texts merged across comments
    for (const k of el.childNodes) {
      if (k.nodeType === 1) { if (!isNext(k)) parts.push({ el: k }); }
      else if (k.nodeType === 3) {
        const last = parts[parts.length - 1];
        if (last && 'text' in last) last.text += k.data; else parts.push({ text: k.data });
      }
    }
    let inner = '';
    parts.forEach((p, i) => {
      if (p.el) { inner += markup(p.el); return; }
      let t = p.text.replace(/[ \t\n\r\f]+/g, ' ');
      if (i === 0 ? isBlock(el) : breaks(parts[i - 1].el)) t = t.replace(/^ /, '');
      if (i === parts.length - 1 ? isBlock(el) : breaks(parts[i + 1].el)) t = t.replace(/ $/, '');
      inner += t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, '&nbsp;');
    });
    return open + inner + close;
  };
  const top = eval(topElements)(isNext).map(markup);
  const text = [...document.body.childNodes].filter((n) => n.nodeType === 3 && n.data.trim()).map((n) => n.data);
  return {
    title: document.title,
    lang: document.documentElement.lang,
    body: top.join('\n') + (text.length ? `\n[text at top level: ${text.join(' | ')}]` : ''),
    tokens: document.querySelectorAll('pre [class^="tok-"]').length,
    height: document.documentElement.scrollHeight,
    removed: window.__removed ?? ['(no probe)'],
  };
}, [NEXT_NODE, TOP_ELEMENTS]);

// Everything Chrome draws the page from; page addresses inside styles become <base> (file:// against http://).
const renderInputs = (page, base) => page.evaluate(([nextNode, topElements, base]) => {
  const isNext = eval(nextNode);
  const topOf = eval(topElements);
  const style = (cs) => { let s = ''; for (let i = 0; i < cs.length; i++) s += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';'; return s.split(base).join('<base>'); };
  const out = [];
  const walk = (el, at) => {
    const r = el.getBoundingClientRect();
    out.push([at + ' ' + el.tagName.toLowerCase(), r.x, r.y + scrollY, r.width, r.height,
      style(getComputedStyle(el)), style(getComputedStyle(el, '::before')), style(getComputedStyle(el, '::after'))]);
    (el === document.body ? topOf(isNext) : [...el.children].filter((c) => !isNext(c))).forEach((c, i) => walk(c, `${at}/${i}`));
  };
  out.push(['html', 0, 0, 0, 0, style(getComputedStyle(document.documentElement)), '', '']);
  walk(document.body, 'body');
  // declared faces, none loading or failed; loaded/unloaded is not compared: several FontFace objects share one
  // file and Chrome marks a varying part of them loaded — a different font would show in the boxes anyway
  const fonts = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.unicodeRange}${/loading|error/.test(f.status) ? ' ' + f.status : ''}`).sort().join(', ');
  return { out, fonts };
}, [NEXT_NODE, TOP_ELEMENTS, base]);

function firstInputDifference(a, b) {
  if (a.fonts !== b.fonts) return `fonts: ${a.fonts.slice(0, 200)} | ${b.fonts.slice(0, 200)}`;
  if (a.out.length !== b.out.length) return `element count ${a.out.length} | ${b.out.length}`;
  const names = ['x', 'y', 'width', 'height', 'style', '::before', '::after'];
  for (let i = 0; i < a.out.length; i++) {
    const x = a.out[i], y = b.out[i];
    if (x[0] !== y[0]) return `structure: ${x[0]} | ${y[0]}`;
    for (let k = 1; k < x.length; k++) {
      if (x[k] === y[k]) continue;
      if (k < 5) return `${x[0]} ${names[k - 1]}: ${x[k]} | ${y[k]}`;
      const pa = String(x[k]).split(';'), pb = String(y[k]).split(';');
      const j = pa.findIndex((v, t) => v !== pb[t]);
      return `${x[0]} ${names[k - 1]}: ${pa[j]} | ${pb[j]}`;
    }
  }
  return null;
}

async function pixelDiff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    const data = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = data(ia), db = data(ib);
    let n = 0, first = null, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
      if (d) { n++; max = Math.max(max, d); if (!first) first = { x: (i / 4) % ia.width, y: Math.floor(i / 4 / ia.width) }; }
    }
    return { pixels: n, first, max };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
}

// Steps on the home page: [name, action]; the menu steps only where the menu button is shown.
const HOME_STEPS = [
  ['click EN', (p) => p.click('.lang-opt[data-set-lang="en"]')],
  ['open menu', async (p) => { if (await p.isVisible('.sidebar-toggle')) await p.click('.sidebar-toggle'); else return 'skip'; }],
  // the overlay is the whole screen under the 280px menu: click the middle of the strip to the right of the menu
  ['close on overlay', async (p) => {
    if (!(await p.isVisible('#overlay'))) return 'skip';
    const position = await p.evaluate(() => {
      const s = document.querySelector('#sidebar').getBoundingClientRect(), o = document.querySelector('#overlay').getBoundingClientRect();
      return { x: Math.round((s.right + o.right) / 2 - o.left), y: Math.round(o.height / 2) };
    });
    await p.click('#overlay', { position });
  }],
];

// The CSS a page carries: the texts of its <style> elements (a day page of the site has its kind's CSS, book.css and
// the colours of the day in <body>).
const pageCss = (page) => page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent));

// A click on the navigation bar of a day page. The old page loads the next file; the new one should move by Next's
// router, the document staying the same (a mark on window survives). Returns what the checks after it need.
const navClick = (locate, fromBottom) => async (p) => {
  const isNew = p.url().startsWith('http:');
  const before = p.url();
  const origin = isNew ? { snap: await snapshot(p), css: await pageCss(p) } : null;
  if (fromBottom) { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(200); }
  await p.evaluate(() => { window.__mark = 1; });
  const box = await locate(p).boundingBox(); // the click goes to the middle of the link
  if (isNew) await Promise.all([p.waitForURL((u) => u.href !== before), locate(p).click()]);
  else await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), locate(p).click()]);
  // Chrome works out :hover in a new document only when the mouse moves; in the same document (a move by the router)
  // the element under the cursor is hovered at once (the RU/EN button stays under it). The reader's first mouse move
  // makes the two the same: move it by 1px on both sides.
  await p.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
  await p.evaluate(() => { window.__removed = []; }); // the previous page's elements leave <body> by design
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete || new Promise((ok) => { i.onload = i.onerror = ok; }))));
  await settle(p);
  return {
    before, origin, url: p.url(),
    kept: await p.evaluate(() => window.__mark === 1),
    saved: await p.evaluate((k) => localStorage.getItem(k), LANG_KEY),
    scrollY: await p.evaluate(() => scrollY),
    css: isNew ? await pageCss(p) : null,
  };
};

// The clicks of a day page's bar: [name, action] for each link whose page exists (a dead link — day 21 of Advanced —
// is reported by the link check), the first of them again from the bottom of the page, and RU/EN where it is.
function navSteps(file) {
  const m = /^(.+\/day-\d+\/)(en\/)?(lecture|student|tasks)\.html$/.exec(file);
  if (!m) return [];
  const [, dayDir, en, kind] = m;
  const others = ['lecture', 'student', 'tasks'].filter((k) => k !== kind); // the bar's a.nav-link, in order
  const link = (i) => (p) => p.locator('.lesson-nav a.nav-link').nth(i);
  const live = others.map((k, i) => [k, i]).filter(([k]) => fs.existsSync(path.join(ROOT, dayDir + (en ?? '') + k + '.html')));
  const steps = live.map(([k, i]) => [`click ${k}`, navClick(link(i), false)]);
  if (live.length) steps.push([`from the bottom, click ${live[0][0]}`, navClick(link(live[0][1]), true)]);
  if (fs.existsSync(path.join(ROOT, en ? `${dayDir}${kind}.html` : `${dayDir}en/${kind}.html`))) {
    steps.push(['click RU/EN', navClick((p) => p.locator('.lesson-nav a.lang-btn'), false)]);
  }
  return steps;
}

// ---------- run ----------
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const OLD_BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const started = Date.now();
  console.log(`chrome ${browser.version()} | ${specs.length} page(s) | sizes ${SIZES.map(([w, h]) => `${w}x${h}`).join(' ')}`);
  let problems = 0, checks = 0, retakes = 0, noise = 0;
  const say = (msg) => { problems++; console.log(`DIFF ${msg}`); };

  // links: once per page, in the new site's DOM; a target exists in the old site exactly when in the new one
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let dead = 0;
    for (const file of files) {
      await page.goto(BASE + file, { waitUntil: 'domcontentloaded' });
      const refs = await page.evaluate(() => [...document.querySelectorAll('a[href], link[href], script[src]')]
        .map((e) => e.getAttribute('href') ?? e.getAttribute('src'))
        .filter((h) => !/^(#|[a-z]+:|\/\/|\/_next\/)/i.test(h)));
      for (const ref of new Set(refs)) {
        const bare = ref.replace(/[?#].*$/, '');
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), bare));
        // a link to a route ("student", "../lecture") stands for the old site's file "student.html" — a path with no
        // extension that is not a file of the repository (LICENSE is one)
        const isRoute = !bare.endsWith('/') && !/\.[a-z0-9]+$/i.test(target) && !fs.existsSync(path.join(ROOT, target));
        const inOld = fs.existsSync(path.join(ROOT, isRoute ? target + '.html' : target)), inNew = resolveOut(target) !== null;
        if (inOld !== inNew) say(`link ${file} -> ${ref}: ${inOld ? 'exists' : 'missing'} in the repository, ${inNew ? 'exists' : 'missing'} in site/out`);
        else if (!inOld) { dead++; console.log(`dead link (in both, not a difference) ${file} -> ${ref}`); }
      }
    }
    console.log(`links checked on ${files.length} page(s)${dead ? `, ${dead} dead in both` : ''}`);
    await ctx.close();
  }

  const groups = [...new Set(specs.map((s) => s.split('@')[1] ?? ''))];
  for (const [w, h] of SIZES) {
    let done = 0;
    for (const lang of groups) {
      const mobile = w < 1024 || h < 500;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(probe);
      await useFontCache(ctx);
      if (lang) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [LANG_KEY, lang]);
      const page = await ctx.newPage();
      page.setDefaultTimeout(90000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !FAVICON.test(m.location()?.url ?? '')) errors.push(`console: ${m.text()} ${m.location()?.url ?? ''}`); });
      // Before prefetching a page the router asks for it with HEAD; Chrome reports every such fetch as net::ERR_ABORTED
      // right after its response, whatever the server sends (with or without Content-Length, 07.11.2026), and the
      // prefetch goes on. Such a HEAD — answered 2xx, then "aborted" — is not an error; any other failure is.
      const answered = new WeakSet();
      page.on('response', (r) => {
        if (r.status() < 300) answered.add(r.request());
        if (r.status() >= 400 && !FAVICON.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
      });
      page.on('requestfailed', (r) => {
        if (r.method() === 'HEAD' && r.failure()?.errorText === 'net::ERR_ABORTED' && answered.has(r)) return;
        errors.push(`failed ${r.method()} ${r.url()} ${r.failure()?.errorText}`);
      });
      const open = async (which, file) => {
        if (which === 'old') await page.goto(OLD_BASE + file, { waitUntil: 'load' });
        else await page.goto(BASE + file, { waitUntil: 'networkidle' });
        await settle(page);
      };

      for (const spec of specs.filter((s) => (s.split('@')[1] ?? '') === lang)) {
        const file = spec.split('@')[0];
        const tag = `${w}x${h} ${spec}`;
        // steps: [name, action] done in order up to `step`; afterNew(oldResult, newResult, where): more checks of the
        // step's results once the state is compared
        const compareState = async (step, fullPage, steps = HOME_STEPS, afterNew = null) => {
          const shot = async () => page.screenshot({ fullPage });
          const run = async (which) => {
            await open(which, file);
            if (step) for (const [name, act] of steps) { const r = await act(page); await page.waitForTimeout(500); await settle(page); if (name === step) return r; }
          };
          errors.length = 0;
          const oldResult = await run('old');
          if (oldResult === 'skip') return;
          checks++;
          const oldSnap = await snapshot(page); let oldShot = await shot(); const oldErrors = [...errors]; errors.length = 0;
          const oldInputs = STYLES ? await renderInputs(page, OLD_BASE) : null;
          const newResult = await run('new');
          const newSnap = await snapshot(page); let newShot = await shot(); const newErrors = [...errors];
          const newInputs = STYLES ? await renderInputs(page, BASE) : null;
          const where = step ? `${tag} [after: ${step}]` : tag;
          if (STYLES) {
            const why = firstInputDifference(oldInputs, newInputs);
            if (why) say(`${where}: render inputs differ (--styles): ${why.slice(0, 300)}`);
          }
          // (the list of stylesheets is not compared since 06.11.2026: the site bundles the course CSS into one file)
          for (const k of ['title', 'lang', 'body', 'tokens', 'height']) {
            if (JSON.stringify(oldSnap[k]) === JSON.stringify(newSnap[k])) continue;
            if (k !== 'body') { say(`${where}: ${k}: ${String(JSON.stringify(oldSnap[k])).slice(0, 100)} | ${String(JSON.stringify(newSnap[k])).slice(0, 100)}`); continue; }
            // the markup differs: say where, and keep both (an element per line) for a line diff
            let i = 0;
            while (i < oldSnap.body.length && oldSnap.body[i] === newSnap.body[i]) i++;
            const stem = path.join(SHOTS, `${w}x${h}-${spec.replace(/[\\/@]/g, '_')}${step ? '-' + step.replace(/\W+/g, '_') : ''}`);
            const lines = (b) => b.replace(/(?=<(?!\/)(?:p|div|li|ul|ol|h\d|pre|table|thead|tbody|tr|figure|figcaption|details|summary|svg)\b)/g, '\n');
            fs.writeFileSync(`${stem}-body-old.txt`, lines(oldSnap.body)); fs.writeFileSync(`${stem}-body-new.txt`, lines(newSnap.body));
            say(`${where}: body differs at ${i}: …${JSON.stringify(oldSnap.body.slice(Math.max(0, i - 60), i + 80))} | …${JSON.stringify(newSnap.body.slice(Math.max(0, i - 60), i + 80))} (both in ${path.basename(stem)}-body-*.txt)`);
          }
          if (newSnap.removed.length) say(`${where}: nodes removed from <body> on the new page: ${newSnap.removed.join(', ')}`);
          if (oldErrors.length) say(`${where}: errors on the old page: ${oldErrors.join('; ')}`);
          if (newErrors.length) say(`${where}: errors on the new page: ${newErrors.join('; ')}`);
          if (afterNew) await afterNew(oldResult, newResult, where);
          let same = Buffer.compare(oldShot, newShot) === 0, n = 0;
          while (!same && n < 2) {
            n++; retakes++;
            await run('old'); oldShot = await shot();
            await run('new'); newShot = await shot();
            same = Buffer.compare(oldShot, newShot) === 0;
          }
          if (!same) {
            const d = await pixelDiff(page, oldShot, newShot);
            const stem = path.join(SHOTS, `${w}x${h}-${spec.replace(/[\\/@]/g, '_')}${step ? '-' + step.replace(/\W+/g, '_') : ''}`);
            fs.writeFileSync(`${stem}-old.png`, oldShot); fs.writeFileSync(`${stem}-new.png`, newShot);
            const shotNote = d.size ? 'size ' + d.size : `${d.pixels} pixels differ (max channel ${d.max}), first at ${JSON.stringify(d.first)}`;
            if (d.size || d.pixels) {
              await run('old'); const oi = await renderInputs(page, OLD_BASE);
              await run('new'); const ni = await renderInputs(page, BASE);
              const why = firstInputDifference(oi, ni);
              if (why) say(`${where}: screenshot: ${shotNote}; render inputs differ: ${why.slice(0, 300)}`);
              else {
                // control: does the old page alone give two different screenshots?
                await run('old'); const o1 = await shot(); await run('old'); const o2 = await shot();
                noise++;
                console.log(`noise ${where}: ${shotNote}; DOM, boxes, computed styles (+ ::before/::after) and fonts identical over ${oi.out.length} elements; old page alone twice: ${Buffer.compare(o1, o2) === 0 ? 'same' : 'different too'}`);
              }
            }
          } else if (n) console.log(`note ${where}: equal after ${n} retake(s)`);
        };
        await compareState(null, true);
        if (file === 'index.html') for (const [step] of HOME_STEPS) await compareState(step, false);

        // the navigation bar of a day page, clicked (see the top of the file)
        if (w === 1280 && file !== 'index.html') {
          const rel = (u) => decodeURIComponent(u.startsWith('file:') ? u.slice(OLD_BASE.length) : u.slice(BASE.length));
          for (const [i, s] of navSteps(file).entries()) {
            const withBack = i === 0;
            await compareState(s[0], !s[0].startsWith('from the bottom'), [s], async (a, b, where) => {
              errors.length = 0;
              if (!b.kept) say(`${where}: the document was reloaded — not a move by the router`);
              if (rel(b.url) + '.html' !== rel(a.url)) say(`${where}: address ${rel(a.url)} | ${rel(b.url)} (expected the old one without .html)`);
              if (a.saved !== b.saved) say(`${where}: language saved ${a.saved} | ${b.saved}`);
              if (a.scrollY !== b.scrollY) say(`${where}: scrolled to ${a.scrollY} | ${b.scrollY}`);
              if (withBack) {
                checks++;
                await page.goBack();
                let back = null;
                for (let t = 0; t < 50; t++) { // the router brings the page back from its cache
                  back = await snapshot(page);
                  if (back.body === b.origin.snap.body && back.title === b.origin.snap.title) break;
                  await page.waitForTimeout(100);
                }
                await settle(page);
                back = await snapshot(page);
                for (const k of ['title', 'lang', 'body', 'tokens', 'height']) {
                  if (JSON.stringify(back[k]) !== JSON.stringify(b.origin.snap[k])) say(`${where} [back]: ${k}: ${String(JSON.stringify(b.origin.snap[k])).slice(0, 100)} | ${String(JSON.stringify(back[k])).slice(0, 100)}`);
                }
                if (page.url() !== b.before) say(`${where} [back]: address ${rel(b.before)} | ${rel(page.url())}`);
                if (!(await page.evaluate(() => window.__mark === 1))) say(`${where} [back]: the document was reloaded`);
                if (JSON.stringify(await pageCss(page)) !== JSON.stringify(b.origin.css)) say(`${where} [back]: the page's <style>s differ from the ones before the click`);
              }
              // the page's CSS after the move: exactly the one it has when opened directly (none of the previous left)
              await page.goto(b.url, { waitUntil: 'networkidle' });
              await settle(page);
              const direct = await pageCss(page);
              if (JSON.stringify(direct) !== JSON.stringify(b.css)) say(`${where}: the page's <style>s after the click (${b.css.length}) differ from the page opened directly (${direct.length})`);
              if (errors.length) say(`${where}: errors after the click (back, direct): ${errors.join('; ')}`);
            });
          }
        }
        done++;
        if (done % 25 === 0) console.log(`  ${w}x${h}: ${done} of ${specs.length} done, ${problems} problems, ${Math.round((Date.now() - started) / 60000)} min`);
      }
      await ctx.close();
    }
    console.log(`size ${w}x${h} done (${problems} problems so far, ${Math.round((Date.now() - started) / 60000)} min)`);
  }
  await browser.close();
  server.close();
  console.log(`${checks} page states compared, ${retakes} retakes, ${noise} with raster noise only; ${problems ? problems + ' problems' : 'all match'}`);
  process.exit(problems ? 1 : 0);
})();
