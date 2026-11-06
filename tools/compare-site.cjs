// The Next.js site (site/out) against the HTML files it is built from — page for page, as the reader sees them.
//
//   cd site && pnpm build && cd ..
//   NODE_PATH=C:/Users/seydi/goose/ui/node_modules node tools/compare-site.cjs                  every page + home
//   NODE_PATH=... node tools/compare-site.cjs intermediate 3 4     days 3 and 4 of course 2 (RU and en/)
//   NODE_PATH=... node tools/compare-site.cjs home                 only the home page, in RU, EN, TM, TR
//   NODE_PATH=... node tools/compare-site.cjs --sizes=1280x900 essentials
//
// The old page is opened as file:// (as check-pages does), the new one from site/out over a local http server (Next's
// scripts sit at /_next/…). At the five check-pages sizes, for every page:
//   - full-page screenshots, byte for byte; on a mismatch the pair is shot again (at most twice);
//   - <body> after the page's scripts ran (highlight.js, lang.js): every top-level element's outerHTML; Next's own
//     nodes are dropped (a hidden <div> of comments, its data scripts, the route announcer); the onclick attribute
//     of the RU/EN button is not compared (React attaches that click as a listener) — the click test checks it;
//   - title, <html lang>, highlighted tokens, stylesheets, page height;
//   - JS errors and failed requests on both pages (/favicon.ico is skipped: Chrome asks every http site for it);
//   - hydration probe: from the first byte a MutationObserver records nodes removed from <body> — a client re-render
//     by React would remove them all (05.11.2026: that is how the "whole <body> as one string" layout failed).
// If screenshots still differ after the retakes, the render inputs are compared: DOM, every box to full float
// precision, the whole computed style of every element and its ::before/::after, the declared fonts. A difference
// there is a failure; if all are identical, the pixels are rasterization noise (e.g. the header's backdrop-filter
// blur over the open menu gives ±1 per channel, and the old page differs from itself there too) — printed as
// "noise", not a failure. A one-step colour change of a text is caught as a failure (mutant, 05.11.2026).
// Once per page: every link of the page (a[href], link[href], script[src]) leads to an existing file in the old
// site exactly when it does in the new one. At 1280x900 the RU/EN button of a day page is clicked: same address,
// same language saved in localStorage.
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
const stale = files.filter((f) => !fs.existsSync(path.join(OUT, f)) || fs.statSync(path.join(ROOT, f)).mtimeMs > fs.statSync(path.join(OUT, f)).mtimeMs);
if (stale.length) { console.log(`site/out is older than ${stale.length} page(s), e.g. ${stale[0]}: run \`pnpm build\` in site/ first`); process.exit(1); }

// ---------- helpers ----------
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
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

// The RU/EN button of a day page: the HTML pages write its click as onclick="…", React attaches it as an event
// listener (06.11.2026, <LessonNav>) — so that attribute is not compared; what the click does is (the click test).
const snapshot = (page) => page.evaluate((nextNode) => {
  const isNext = eval(nextNode);
  const top = [...document.body.children].filter((n) => !isNext(n)).map((n) => {
    const c = n.cloneNode(true);
    c.querySelectorAll('a.lang-btn[onclick]').forEach((a) => a.removeAttribute('onclick'));
    return c.outerHTML;
  });
  const text = [...document.body.childNodes].filter((n) => n.nodeType === 3 && n.data.trim()).map((n) => n.data);
  return {
    title: document.title,
    lang: document.documentElement.lang,
    body: top.join('\n') + (text.length ? `\n[text at top level: ${text.join(' | ')}]` : ''),
    tokens: document.querySelectorAll('pre [class^="tok-"]').length,
    height: document.documentElement.scrollHeight,
    sheets: [...document.styleSheets].map((s) => (s.href ?? 'inline').replace(/^.*\/css\//, 'css/')),
    removed: window.__removed ?? ['(no probe)'],
  };
}, NEXT_NODE);

// Everything Chrome draws the page from; page addresses inside styles become <base> (file:// against http://).
const renderInputs = (page, base) => page.evaluate(([nextNode, base]) => {
  const isNext = eval(nextNode);
  const style = (cs) => { let s = ''; for (let i = 0; i < cs.length; i++) s += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';'; return s.split(base).join('<base>'); };
  const out = [];
  const walk = (el, at) => {
    const r = el.getBoundingClientRect();
    out.push([at + ' ' + el.tagName.toLowerCase(), r.x, r.y + scrollY, r.width, r.height,
      style(getComputedStyle(el)), style(getComputedStyle(el, '::before')), style(getComputedStyle(el, '::after'))]);
    [...el.children].filter((c) => !isNext(c)).forEach((c, i) => walk(c, `${at}/${i}`));
  };
  out.push(['html', 0, 0, 0, 0, style(getComputedStyle(document.documentElement)), '', '']);
  walk(document.body, 'body');
  // declared faces, none loading or failed; loaded/unloaded is not compared: several FontFace objects share one
  // file and Chrome marks a varying part of them loaded — a different font would show in the boxes anyway
  const fonts = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.unicodeRange}${/loading|error/.test(f.status) ? ' ' + f.status : ''}`).sort().join(', ');
  return { out, fonts };
}, [NEXT_NODE, base]);

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
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref.replace(/[?#].*$/, '')));
        const inOld = fs.existsSync(path.join(ROOT, target)), inNew = fs.existsSync(path.join(OUT, target));
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
      page.on('response', (r) => { if (r.status() >= 400 && !FAVICON.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
      page.on('requestfailed', (r) => errors.push(`failed ${r.url()} ${r.failure()?.errorText}`));
      const open = async (which, file) => {
        if (which === 'old') await page.goto(OLD_BASE + file, { waitUntil: 'load' });
        else await page.goto(BASE + file, { waitUntil: 'networkidle' });
        await settle(page);
      };

      for (const spec of specs.filter((s) => (s.split('@')[1] ?? '') === lang)) {
        const file = spec.split('@')[0];
        const tag = `${w}x${h} ${spec}`;
        const compareState = async (step, fullPage) => {
          const shot = async () => page.screenshot({ fullPage });
          const run = async (which) => {
            await open(which, file);
            if (step) for (const [name, act] of HOME_STEPS) { const r = await act(page); await page.waitForTimeout(500); await settle(page); if (name === step) return r; }
          };
          errors.length = 0;
          if ((await run('old')) === 'skip') return;
          checks++;
          const oldSnap = await snapshot(page); let oldShot = await shot(); const oldErrors = [...errors]; errors.length = 0;
          await run('new');
          const newSnap = await snapshot(page); let newShot = await shot(); const newErrors = [...errors];
          const where = step ? `${tag} [after: ${step}]` : tag;
          for (const k of ['title', 'lang', 'body', 'tokens', 'height', 'sheets']) {
            if (JSON.stringify(oldSnap[k]) !== JSON.stringify(newSnap[k])) say(`${where}: ${k}: ${String(JSON.stringify(oldSnap[k])).slice(0, 100)} | ${String(JSON.stringify(newSnap[k])).slice(0, 100)}`);
          }
          if (newSnap.removed.length) say(`${where}: nodes removed from <body> on the new page: ${newSnap.removed.join(', ')}`);
          if (oldErrors.length) say(`${where}: errors on the old page: ${oldErrors.join('; ')}`);
          if (newErrors.length) say(`${where}: errors on the new page: ${newErrors.join('; ')}`);
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

        // the RU/EN button of a day page: same address, same language saved
        if (w === 1280 && file !== 'index.html') {
          const click = async (which) => {
            await open(which, file);
            if (!(await page.$('.lang-btn'))) return null;
            await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.lang-btn')]);
            const at = page.url().startsWith('file:') ? page.url().slice(OLD_BASE.length) : page.url().slice(BASE.length);
            return `${decodeURIComponent(at)} saved=${await page.evaluate((k) => localStorage.getItem(k), LANG_KEY)}`;
          };
          const a = await click('old');
          if (a !== null) {
            const b = await click('new');
            checks++;
            if (a !== b) say(`${tag} [click RU/EN]: ${a} | ${b}`);
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
