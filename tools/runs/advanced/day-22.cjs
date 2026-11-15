// Course 3, day 22, in Chrome: SharedArrayBuffer and Atomics. Every page is cross-origin isolated: the headers
// Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp go with every response (as Live
// Server sends them with liveServer.settings.headers), the address is http://127.0.0.1 (a secure context). The page is
// the lecture's own index.html (it loads main.js as a module): a ```js block without a file name is main.js, the way the
// lecture tells the student to run it; the blocks with file="…" of one section make a folder (a later file of the same
// name replaces the earlier one); in section 7 main.js is the one of section 6 with the two changes the text asks for.
// Console output is rebuilt from Chrome's preview objects; an uncaught error is printed as "Uncaught TypeError: …". Output
// is awaited up to the number of lines of the result-box (threads answer late), then a little longer for extra lines.
// The context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-22.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-22.cjs --quiet    only the checks
// Checks: a result-box right after a block (or a folder) equals its output; the race counts (sections 6 and 14) are
// checked by shape — a number under the bound, the rest exactly; the cheatsheet runs without output; the blocks without
// a result-box (the lock of section 9, until of section 13) are the code the practice runs; .vscode/settings.json is JSON
// with the two headers, and Live Server itself (the extension's live-server, started with these headers) gives an
// isolated page; what the extension's code does with the setting; the experiments the lecture only tells about (no
// headers — no SharedArrayBuffer; an image from another origin without Cross-Origin-Resource-Policy under COEP; the late
// promise of waitAsync — Chrome against NotifyWaiter step 3.b; a wait after the signal — "not-equal"); every message of
// the table of errors is printed by some block; what the lecture says about the text of ECMA-262 2026 (every step it
// names in 25.2, 25.4, 9.6.2, 10.4.5, 25.1.6.1; no Atomics.pause) is checked against tools/.cache/ecma262-2026.html; the
// MDN pages it quotes are in tools/.cache/mdn-content.git and say what it says; the days it points to say what it says;
// the reference table holds all 49 rows of the day's plan (23 of MDN, 26 of ECMA-262) as links with their marks, every
// tc39.es anchor exists and every link whose text starts with a number names the section of that number. The notes: each
// of their 3 blocks prints what the comments of its console.log lines say; the table of wait and waitAsync and the
// homework answers in Chrome; the steps they name; the 3 MDN pages they quote; the footer and the links.
// Playwright and live-server come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const ORIGIN = 'http://127.0.0.1:5590';
const OTHER = 'http://127.0.0.1:5591';
const LIVE_PORT = 5596;
const ISOLATE = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
// result-boxes whose first number is a race count: [section, the bound it stays under]
const RACE = { 6: 2000000, 14: 400000 };
const quiet = process.argv.includes('--quiet');

const LF = String.fromCharCode(10);
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.type === 'function' ? 'ƒ' : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.subtype !== 'typedarray' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a folder of files on ORIGIN (index.html must be there), every response with the headers; returns console lines and
// uncaught errors in order. A fresh context each time: workers of the page before are gone.
async function runFolder(b, files, { lines = 0, ms = 10000, headers = ISOLATE, settle = 150 } = {}) {
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html';
    if (!(name in files)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found', headers });
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/plain';
    return route.fulfill({ contentType: `${type}; charset=utf-8`, body: files[name], headers });
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const out = [];
  cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails;
    out.push(`Uncaught ${(d.exception?.description ?? d.text).split(LF)[0]}`);
  });
  await cdp.send('Runtime.enable');
  const t0 = Date.now();
  await p.goto(`${ORIGIN}/index.html`);
  while (out.length < lines && Date.now() - t0 < ms) await p.waitForTimeout(20);
  await p.waitForTimeout(settle);
  await ctx.close();
  return out;
}

// one line of docs/coverage/*.csv: a title with a comma is in double quotes
const csvLine = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
const hasAll = (text, words) => words.every((w) => text.includes(w));
// the numbers of every step whose own text holds the words, as the spec writes them: 1, a, i, 1, a, i, …
const stepPaths = (html, needle) => {
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const fmt = (p) => p.map((n, i) => (i % 3 === 0 ? n : i % 3 === 1 ? String.fromCharCode(96 + n) : roman[n - 1])).join('.');
  const re = /<(\/?)(ol|li)\b[^>]*>/g;
  let depth = -1;
  const counts = [], cur = [], found = [];
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === 'ol') { if (m[1]) depth--; else { depth++; counts[depth] = 0; } continue; }
    if (m[1]) continue;
    counts[depth]++; cur[depth] = counts[depth]; cur.length = depth + 1;
    const rest = html.slice(re.lastIndex);
    if (flat(rest.slice(0, rest.search(/<ol\b|<\/li>/))).includes(needle)) found.push(fmt(cur));
  }
  return found;
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  console.log(`chrome ${b.version()}`);
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
  const printed = []; // every line any block printed — for the table of errors

  // the blocks of the lecture in page order, with the section each one is in
  const ctx0 = await b.newContext();
  const src = await ctx0.newPage();
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'lecture.html')));
  const items = await src.evaluate(() => [...document.querySelectorAll('h2, pre.code, .result-box')].map((el) => {
    if (el.tagName === 'H2') return { kind: 'h2', section: Number((el.textContent.match(/^(\d+)\./) || [])[1] || 0) };
    if (el.matches('.result-box')) return { kind: 'box', lines: el.innerText.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { kind: 'code', lang: el.classList.contains('js') ? 'js' : 'html', file: el.dataset.file || null, code: el.textContent, cheat: !!el.closest('.cheatsheet'), boxNext: !!(el.nextElementSibling && el.nextElementSibling.matches('.result-box')) };
  }));
  const lectureText = await src.evaluate(() => document.querySelector('.container').innerText);
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const codes = items.filter((x) => x.kind === 'code');
  const js = codes.filter((x) => x.lang === 'js');
  const indexHtml = codes.find((x) => x.lang === 'html' && x.file === 'index.html');
  check(js.length === 27 && js.filter((x) => x.file).length === 10 && js.filter((x) => x.cheat).length === 1 && !!indexHtml && items.filter((x) => x.kind === 'box').length === 19,
    `lecture: 27 js blocks (10 with a file name, the cheatsheet), index.html, 19 result-boxes (${js.length}, ${js.filter((x) => x.file).length}, ${items.filter((x) => x.kind === 'box').length})`);
  check(indexHtml && indexHtml.code.includes('<script type="module" src="main.js"></script>'), 'lecture 2: index.html loads main.js as a module');
  const page = (files) => ({ 'index.html': indexHtml.code, ...files });

  // the result-boxes: the block or the folder before each one
  let folder = {}, folderSection = -1, last = null, n = 0;
  const mains = {};
  for (const it of items) {
    if (it.kind === 'h2') continue;
    if (it.kind === 'code') {
      if (it.section !== folderSection) { folder = {}; folderSection = it.section; }
      if (it.lang === 'js' && it.file && !it.file.startsWith('.vscode')) { folder[it.file] = it.code; if (it.file === 'main.js') mains[it.section] = it.code; }
      if (it.lang === 'js') last = it;
      continue;
    }
    n++;
    let files, label;
    if (last && !last.file) { files = page({ 'main.js': last.code }); label = `lecture ${it.section}, box ${n}: ${last.code.split(LF)[0].slice(0, 70)}`; }
    else {
      files = page(folder);
      if (it.section === 7 && !folder['main.js']) {
        files['main.js'] = mains[6].replace('new SharedArrayBuffer(4)', 'new SharedArrayBuffer(8)')
          .replace('console.log(counts[0], counts[0] < 2 * n)', 'console.log(counts[0] < 2 * n, counts[1])');
      }
      label = `lecture ${it.section}, box ${n}: folder ${Object.keys(files).filter((f) => f !== 'index.html').join(' ')}`;
    }
    const out = await runFolder(b, files, { lines: it.lines.length });
    printed.push(...out);
    if (!quiet) { console.log(`\n--- ${label}`); for (const l of out) console.log(`    > ${l}`); }
    const bound = RACE[it.section];
    const ok = bound
      ? out.length === it.lines.length && out.every((l, i) => {
        if (i > 0) return l === it.lines[i];
        const [num, ...rest] = l.split(' ');
        const [, ...want] = it.lines[0].split(' ');
        return /^\d+$/.test(num) && Number(num) > 0 && Number(num) < bound && same(rest, want);
      })
      : same(out, it.lines);
    check(ok, `${label}: ${bound ? `race count under ${bound}, the rest = result-box` : 'result-box = output'} ${JSON.stringify(out)}`);
    last = null;
  }
  check(n === 19, `lecture: every result-box had a block or a folder before it (${n})`);

  // the notes: every console.log line writes its output in its comment, "console.log(x);   // 3 — why"
  {
    const commented = (code) => code.split(LF).filter((l) => l.includes('console.log(') && l.includes('//'))
      .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
    const ctx1 = await b.newContext();
    const sp = await ctx1.newPage();
    await sp.goto(builtSite.urlOfFile(path.join(DAY, 'student.html')));
    const sblocks = await sp.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => ({ js: pre.matches('.js'), file: pre.dataset.file || null, code: pre.textContent })));
    await ctx1.close();
    check(sblocks.length === 3 && sblocks.every((x) => x.js && !x.file), `student: 3 js blocks without a file name (${sblocks.length})`);
    for (const [i, blk] of sblocks.entries()) {
      const want = commented(blk.code);
      const out = await runFolder(b, page({ 'main.js': blk.code }), { lines: want.length });
      printed.push(...out);
      if (!quiet) { console.log(`\n--- student #${i}: ${blk.code.split(LF)[1]}`); for (const l of out) console.log(`    > ${l}`); }
      check(want.length > 0 && same(out, want), `student #${i}: output = comments ${JSON.stringify(out)}`);
    }
  }

  // section 7 tells the two changes of main.js in words: they are the ones the run made
  check(lectureText.includes('буфер new SharedArrayBuffer(8) и вывод') && lectureText.includes('console.log(counts[0] < 2 * n, counts[1])'),
    'lecture 7: the text asks for new SharedArrayBuffer(8) and console.log(counts[0] < 2 * n, counts[1]) in main.js of section 6');

  // the cheatsheet; the blocks without a result-box are the code of the practice
  {
    const cheat = js.find((x) => x.cheat);
    const out = await runFolder(b, page({ 'main.js': cheat.code }));
    check(out.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out)}`);
    const count = js.find((x) => x.file === 'count.js').code;
    const lock = js.find((x) => !x.file && x.section === 9 && !x.boxNext && x.code.startsWith('const lock'));
    check(lock && lock.code.split(LF).every((l) => count.includes(l)), 'lecture 9: the lock and unlock of the text are the first two lines of count.js of the practice');
    const until = js.find((x) => !x.file && x.section === 13 && x.code.startsWith('async function until'));
    const practiceMain = mains[14];
    check(until && practiceMain.includes(until.code.replace('async function until(s, i, value)', 'async function until(i, value)')),
      'lecture 13: until of the text is the one main.js of the practice runs (there s comes from the module)');
  }

  // .vscode/settings.json: JSON, the two headers; Live Server with them gives an isolated page
  {
    const block = js.find((x) => x.file === '.vscode/settings.json');
    let settings = null;
    try { settings = JSON.parse(block.code); } catch {}
    const headers = settings && settings['liveServer.settings.headers'];
    check(settings && Object.keys(settings).length === 1 && same(headers, ISOLATE), `lecture 2: .vscode/settings.json is JSON with liveServer.settings.headers = COOP same-origin, COEP require-corp ${JSON.stringify(settings)}`);
    const pkgDir = path.dirname(require.resolve('live-server/package.json'));
    const ext = path.join(pkgDir, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
    const prop = pkg.contributes.configuration.properties['liveServer.settings.headers'];
    const read = (f) => fs.readFileSync(path.join(ext, 'out/src', f), 'utf8');
    const helper = read('Helper.js');
    const params = helper.slice(helper.indexOf('static generateParams'), helper.indexOf('static getHttpsSetup'));
    check(prop && prop.type === 'object' && read('Config.js').includes("getConfiguration('liveServer.settings')") && read('Config.js').includes("getSettings('headers')")
      && params.includes('const headers = Config_1.Config.getHeaders') && params.includes('headers: headers') && read('appModel.js').includes('Helper_1.Helper.generateParams(')
      && fs.readFileSync(path.join(pkgDir, 'index.js'), 'utf8').includes('app.use(setHeadersMiddleware(headers))') && read('StatusbarUi.js').includes('Port : ${port}'),
    `lecture 2: Live Server ${pkg.version} — the setting liveServer.settings.headers (an object), read from the workspace configuration when the server starts (generateParams in goOnline) and set on every response; the status bar says «Port : 5500»`);
    // the extension's own live-server, started as the extension starts it, with these headers
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'day22-live-'));
    const check2 = js.find((x) => !x.file && x.section === 2);
    fs.writeFileSync(path.join(dir, 'index.html'), indexHtml.code);
    fs.writeFileSync(path.join(dir, 'main.js'), check2.code);
    const liveServer = require('live-server');
    liveServer.start({ port: LIVE_PORT, host: '0.0.0.0', root: dir, open: false, disableGlobbing: true, wait: 100, logLevel: 0, headers });
    await new Promise((r) => setTimeout(r, 1200));
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    const out = [];
    // live-server's own script in the page says "Live reload enabled."; Chrome's 404 of /favicon.ico is an error message
    p.on('console', (m) => { if (m.type() === 'log' && m.text() !== 'Live reload enabled.') out.push(m.text()); });
    const resp = await p.goto(`http://127.0.0.1:${LIVE_PORT}/index.html`);
    for (let i = 0; i < 100 && !out.length; i++) await p.waitForTimeout(20);
    await p.waitForTimeout(150);
    const h = resp.headers();
    await ctx.close();
    liveServer.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
    check(h['cross-origin-opener-policy'] === 'same-origin' && h['cross-origin-embedder-policy'] === 'require-corp' && same(out, ['true function object']),
      `lecture 2: Live Server with these headers — the page through it is isolated: ${JSON.stringify(out)}`);
  }

  // what the lecture only tells about
  const told = async (files, want, text, opts = {}) => { const out = await runFolder(b, files, { lines: want.length, ...opts }); printed.push(...out); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  {
    const check2 = js.find((x) => !x.file && x.section === 2);
    await told(page({ 'main.js': `${check2.code}\nnew SharedArrayBuffer(8);` }), ['false undefined object', 'Uncaught ReferenceError: SharedArrayBuffer is not defined'],
      'lecture 2: without the headers — false undefined object, and new SharedArrayBuffer(8) is a ReferenceError', { headers: {} });
  }
  {
    // both origins are real servers here: an answer made up by ctx.route is not held to COEP, and a page made up by it is
    // not on the loopback address, so Chrome blocks its requests to 127.0.0.1 (local network access) whatever the headers
    const files = page({ 'main.js': `const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res("load"); i.onerror = () => res("error"); i.src = src; });
console.log(crossOriginIsolated, await load("${OTHER}/plain.svg"), await load("${OTHER}/corp.svg"));` });
    const pageServer = http.createServer((req, res) => {
      const name = req.url.slice(1) || 'index.html';
      if (!(name in files)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', ...ISOLATE }).end(files[name]);
    });
    const other = http.createServer((req, res) => {
      const headers = { 'content-type': 'image/svg+xml' };
      if (req.url.includes('corp')) headers['cross-origin-resource-policy'] = 'cross-origin';
      res.writeHead(200, headers).end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
    });
    await new Promise((r) => other.listen(Number(new URL(OTHER).port), '127.0.0.1', r));
    await new Promise((r) => pageServer.listen(0, '127.0.0.1', r));
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    const out = [];
    p.on('console', (m) => { if (m.type() === 'log') out.push(m.text()); });
    await p.goto(`http://127.0.0.1:${pageServer.address().port}/index.html`);
    for (let i = 0; i < 100 && !out.length; i++) await p.waitForTimeout(20);
    await ctx.close();
    for (const s of [other, pageServer]) await new Promise((r) => { s.close(r); s.closeAllConnections(); });
    check(same(out, ['true error load']), `lecture 2: under COEP require-corp an image from another origin without Cross-Origin-Resource-Policy does not load, with it — loads ${JSON.stringify(out)}`);
  }
  await told(page({ 'main.js': `const a = new Int32Array(new SharedArrayBuffer(4));
const order = [];
Atomics.waitAsync(a, 0, 0).value.then((v) => order.push("then:" + v));
setTimeout(() => order.push("task set before notify"), 0);
Atomics.notify(a, 0);
order.push("after notify");
queueMicrotask(() => order.push("microtask"));
for (let i = 0; i < 50; i++) await null;
order.push("after 50 awaits");
await new Promise((r) => setTimeout(r, 0));
order.push("after a task");
console.log(order.join(" | "));` }), ['after notify | microtask | after 50 awaits | task set before notify | then:ok | after a task'],
  'lecture 12, Chrome against the text: the same agent notifies its own waitAsync — by NotifyWaiter step 3.b the promise is resolved at once (then before any task); Chrome resolves it in a task, after a timer set before notify and after 50 awaits');
  await told(page({ 'w.js': 'onmessage = (e) => postMessage(Atomics.wait(new Int32Array(e.data), 0, 0));',
    'main.js': `const s = new Int32Array(new SharedArrayBuffer(4));
Atomics.store(s, 0, 1);
console.log(Atomics.notify(s, 0));
const w = new Worker("w.js");
w.onmessage = (e) => console.log(e.data);
w.postMessage(s.buffer);` }), ['0', 'not-equal'],
  'lecture 14: a signal that came before the thread went to sleep is not lost — notify woke nobody (0), the later wait sees 1 and returns "not-equal"');

  // the notes: the table of wait and waitAsync, the homework in Chrome
  await told(page({ 'w.js': `onmessage = (e) => {
  const a = new Int32Array(e.data);
  postMessage([Atomics.wait(a, 0, 0, 0), Atomics.wait(a, 0, 0, -5), Atomics.wait(a, 0, 1)].join(" "));
};`, 'main.js': `const a = new Int32Array(new SharedArrayBuffer(4));
const w = new Worker("w.js");
w.onmessage = (e) => console.log(e.data, Atomics.waitAsync(a, 0, 0, -5).value);
w.postMessage(a.buffer);` }), ['timed-out timed-out not-equal timed-out'],
  'student, the table: wait in a thread with timeout 0 or less — "timed-out", a wrong value — "not-equal"; waitAsync with a negative timeout — "timed-out" at once');
  await told(page({ 'main.js': `const u16 = new Uint16Array(new SharedArrayBuffer(4));
console.log(Atomics.add(u16, 0, 70000), u16[0], Atomics.exchange(u16, 1, -1), u16[1], Atomics.store(u16, 1, -1), u16[1]);` }), ['0 4464 0 65535 -1 65535'],
  'student homework 1: add returns the old 0, 70000 lies as 4464; exchange returns 0, −1 lies as 65535; store returns −1 (step 8), the cell holds 65535');
  await told(page({ 'main.js': 'console.log([1, 2, 3, 4, 5, 6, 7, 8].map((n) => Atomics.isLockFree(n)).join(" "));' }), ['true true false true false false false true'],
    'student homework 2: isLockFree 1–8 in Chrome — true true false true false false false true (4 by the standard, 1, 2, 8 from the agent record, the rest false)');
  await told(page({ 'main.js': `const run = (f) => { try { return f(); } catch (e) { return e.name + ": " + e.message; } };
const a = new Int32Array(new SharedArrayBuffer(4));
console.log(Atomics.waitAsync(a, 0, "0", NaN).async, Atomics.waitAsync(a, 0, 0, -1).value, Atomics.waitAsync(a, 0, 2 ** 32).async, Atomics.waitAsync(a, 0, 2 ** 32 + 1).value);
console.log(run(() => Atomics.waitAsync(a, 0, 0n)), "|", run(() => Atomics.waitAsync(new BigInt64Array(new SharedArrayBuffer(8)), 0, 0)));` }),
  ['true timed-out true not-equal', 'TypeError: Cannot convert a BigInt value to a number | TypeError: Cannot convert 0 to a BigInt'],
  'student homework 3: "0" and NaN — waits (ToInt32, NaN → ∞); −1 — "timed-out" at once; 2 ** 32 is 0 by ToInt32 — waits, 2 ** 32 + 1 is 1 — "not-equal"; 0n — ToInt32 throws, 0 for BigInt64Array — ToBigInt64 throws');
  await told(page({ 'main.js': `const run = (f) => { try { return f(); } catch (e) { return e.name + ": " + e.message; } };
const a = new Int32Array(new SharedArrayBuffer(4));
for (let k = 0; k < 3; k++) Atomics.waitAsync(a, 0, 0);
console.log(Atomics.notify(new Int32Array(4), 0), run(() => Atomics.notify(new Int16Array(new SharedArrayBuffer(4)), 0)), Atomics.notify(a, 0, 2.9), Atomics.notify(a, 0, Infinity));` }),
  ['0 TypeError: [object Int16Array] is not an int32 or BigInt64 typed array. 2 1'],
  'student homework 4: notify on a non-shared Int32Array — 0; on Int16Array — TypeError; count 2.9 wakes 2 of the 3, Infinity — the one left');
  await b.close();

  // every message of the table of errors is printed by some block or experiment
  {
    const lecture = builtSite.htmlOfFile(path.join(DAY, 'lecture.html'));
    const table = lecture.slice(lecture.indexOf('id="errors"'), lecture.indexOf('id="cards"'));
    const msgs = [...table.matchAll(/<tr><td>.*?<\/td><td><code>([^<]*(?:&lt;[^<]*)?)<\/code><\/td>/g)].map((m) => textOf(m[1]).trim());
    const missing = msgs.filter((m) => !printed.some((l) => l.includes(m.replace(/\.$/, ''))));
    check(msgs.length === 7 && missing.length === 0, `lecture 15: the ${msgs.length} messages of the table of errors are all printed above; missing: ${missing.join(' | ') || 'none'}`);
  }

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  // [id, words of the step, its numbers joined — a step the clause repeats has more]
  const steps = [
    ['sec-sharedarraybuffer-length', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-sharedarraybuffer-length', 'Let byteLength be ? ToIndex (length)', '2'],
    ['sec-sharedarraybuffer-length', 'Let requestedMaxByteLength be ? GetArrayBufferMaxByteLengthOption (options)', '3'],
    ['sec-sharedarraybuffer-length', 'Return ? AllocateSharedArrayBuffer (NewTarget, byteLength, requestedMaxByteLength)', '4'],
    ['sec-allocatesharedarraybuffer', 'If byteLength > maxByteLength, throw a RangeError exception', '3.a'],
    ['sec-allocatesharedarraybuffer', 'If allocatingGrowableBuffer is true, let allocLength be maxByteLength', '6'],
    ['sec-allocatesharedarraybuffer', 'Let block be ? CreateSharedByteDataBlock (allocLength)', '7'],
    ['sec-issharedarraybuffer', 'If obj. [[ArrayBufferData]] is a Shared Data Block, return true', '1'],
    ['sec-get-arraybuffer.prototype.bytelength', 'If IsSharedArrayBuffer (O) is true, throw a TypeError exception', '3'],
    ['sec-sharedarraybuffer.prototype.grow', 'Perform ? RequireInternalSlot (O, [[ArrayBufferMaxByteLength]])', '2'],
    ['sec-sharedarraybuffer.prototype.grow', 'This is a compare-and-exchange loop', '12.a'],
    ['sec-sharedarraybuffer.prototype.grow', 'If newByteLength = currentByteLength, return undefined', '12.c'],
    ['sec-sharedarraybuffer.prototype.grow', 'If newByteLength < currentByteLength or newByteLength > O. [[ArrayBufferMaxByteLength]], throw a RangeError exception', '12.d'],
    ['sec-sharedarraybuffer.prototype.slice', 'If new. [[ArrayBufferData]] is O. [[ArrayBufferData]], throw a TypeError exception', '18'],
    ['sec-atomics.add', 'performs the following steps atomically when called', '1'],
    ['sec-atomics.add', 'Return ? AtomicReadModifyWrite (typedArray, index, value, add)', '2'],
    ['sec-atomicreadmodifywrite', 'Let byteIndexInBuffer be ? ValidateAtomicAccessOnIntegerTypedArray (typedArray, index)', '1'],
    ['sec-atomicreadmodifywrite', 'let v be ? ToBigInt (value)', '2'],
    ['sec-atomicreadmodifywrite', '? ToIntegerOrInfinity (value)', '3'],
    ['sec-atomicreadmodifywrite', 'Return GetModifySetValueInBuffer (buffer, byteIndexInBuffer, elementType, v, op)', '7'],
    ['sec-validateintegertypedarray', 'If typedArray. [[TypedArrayName]] is neither "Int32Array" nor "BigInt64Array", throw a TypeError exception', '3.a'],
    ['sec-validateintegertypedarray', 'If IsUnclampedIntegerElementType (type) is false and IsBigIntElementType (type) is false, throw a TypeError exception', '4.b'],
    ['sec-validateatomicaccess', 'If accessIndex ≥ length, throw a RangeError exception', '4'],
    ['sec-atomics.store', '? ToIntegerOrInfinity (value)', '3'],
    ['sec-atomics.store', 'Perform SetValueInBuffer (buffer, byteIndexInBuffer, elementType, v, true, seq-cst)', '7'],
    ['sec-atomics.store', 'Return v', '8'],
    ['sec-atomics.load', 'Return GetValueFromBuffer (buffer, byteIndexInBuffer, elementType, true, seq-cst)', '5'],
    ['sec-typedarraygetelement', 'Return GetValueFromBuffer (O. [[ViewedArrayBuffer]], byteIndexInBuffer, elementType, true, unordered)', '6'],
    ['sec-typedarraysetelement', 'Perform SetValueInBuffer (O. [[ViewedArrayBuffer]], byteIndexInBuffer, elementType, numValue, true, unordered)', '3.e'],
    ['sec-atomics.compareexchange', 'Let rawBytesRead be AtomicCompareExchangeInSharedBlock (block, byteIndexInBuffer, elementSize, expectedBytes, replacementBytes)', '13.a'],
    ['sec-atomics.compareexchange', 'Return RawBytesToNumeric (elementType, rawBytesRead, isLittleEndian)', '15'],
    ['sec-atomics.islockfree', 'If n = 1, return AR. [[IsLockFree1]]', '3'],
    ['sec-atomics.islockfree', 'If n = 2, return AR. [[IsLockFree2]]', '4'],
    ['sec-atomics.islockfree', 'If n = 4, return true', '5'],
    ['sec-atomics.islockfree', 'If n = 8, return AR. [[IsLockFree8]]', '6'],
    ['sec-atomics.islockfree', 'Return false', '7'],
    ['sec-dowait', 'Let taRecord be ? ValidateIntegerTypedArray (typedArray, true)', '1'],
    ['sec-dowait', 'If IsSharedArrayBuffer (buffer) is false, throw a TypeError exception', '3'],
    ['sec-dowait', 'Let byteIndexInBuffer be ? ValidateAtomicAccess (taRecord, index)', '4'],
    ['sec-dowait', 'Let q be ? ToNumber (timeout)', '8'],
    ['sec-dowait', 'If q is either NaN or +∞', '9'],
    ['sec-dowait', 'let t be max', '11'],
    ['sec-dowait', 'If mode is sync and AgentCanSuspend () is false, throw a TypeError exception', '12'],
    ['sec-dowait', 'Perform EnterCriticalSection (WL)', '17'],
    ['sec-dowait', 'Let w be GetValueFromBuffer (buffer, byteIndexInBuffer, elementType, true, seq-cst)', '19'],
    ['sec-dowait', 'If v ≠ w, then', '20'],
    ['sec-dowait', 'Perform ! CreateDataPropertyOrThrow (resultObject, "async", false)', '20.c,21.c'],
    ['sec-dowait', 'Perform ! CreateDataPropertyOrThrow (resultObject, "value", "not-equal")', '20.d'],
    ['sec-dowait', 'If t = 0 and mode is async, then', '21'],
    ['sec-dowait', 'Asynchronous immediate timeouts have special handling in order to fail fast', '21.a'],
    ['sec-dowait', 'Perform ! CreateDataPropertyOrThrow (resultObject, "value", "timed-out")', '21.d'],
    ['sec-dowait', 'Let waiterRecord be a new Waiter Record', '27'],
    ['sec-dowait', 'Perform AddWaiter (WL, waiterRecord)', '28'],
    ['sec-dowait', 'Perform SuspendThisAgent (WL, waiterRecord)', '29.a'],
    ['sec-dowait', 'Perform LeaveCriticalSection (WL)', '20.a,21.b,31'],
    ['sec-dowait', 'If mode is sync, return waiterRecord. [[Result]]', '32'],
    ['sec-dowait', 'Perform ! CreateDataPropertyOrThrow (resultObject, "async", true)', '33'],
    ['sec-dowait', 'Perform ! CreateDataPropertyOrThrow (resultObject, "value", promiseCapability. [[Promise]])', '34'],
    ['sec-dowait', 'Return resultObject', '20.e,21.e,35'],
    ['sec-atomics.notify', 'If count is undefined, then', '3'],
    ['sec-atomics.notify', 'Let c be max (intCount, 0)', '4.b'],
    ['sec-atomics.notify', 'Let WL be GetWaiterList (block, byteIndexInBuffer)', '8'],
    ['sec-atomics.notify', 'Let S be RemoveWaiters (WL, c)', '10'],
    ['sec-atomics.notify', 'Return 𝔽 (n)', '14'],
    ['sec-removewaiters', 'Let L be a List whose elements are the first n elements of WL. [[Waiters]]', '4'],
    ['sec-notifywaiter', 'Else if AgentSignifier () is waiterRecord. [[AgentSignifier]], then', '3'],
    ['sec-notifywaiter', 'Perform ! Call (promiseCapability. [[Resolve]], undefined, «waiterRecord. [[Result]]»)', '3.b'],
    ['sec-notifywaiter', 'Perform EnqueueResolveInAgentJob (waiterRecord. [[AgentSignifier]], waiterRecord. [[PromiseCapability]], waiterRecord. [[Result]])', '4.a'],
    ['sec-agentcansuspend', 'Return AR. [[CanBlock]]', '2'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture names (25.2.3.1 1–4, 25.2.2.1 3.a/6–7, 25.2.2.2 1, 25.1.6.1 3, 25.2.5.3 2/12/12.c/12.d, 25.2.5.6 18, 25.4.4 1–2, 25.4.3.17 1–3/7, 25.4.3.1 3.a/4.b, 25.4.3.2 4, 25.4.11 3/7/8, 25.4.9 5, 10.4.5.17–18 unordered, 25.4.6 13.a/15, 25.4.8 3–7, DoWait 1/3/4/8–12/17/19–21/21.a/27–35, 25.4.15 3/4.b/8/10/14, 25.4.3.10 4, 25.4.3.12 3/3.b/4, 9.6.2 2): ${wrong.join('; ') || 'all right'}`);
  check(num('sec-sharedarraybuffer-objects') === '25.2' && num('sec-atomics-object') === '25.4' && num('sec-dataview-objects') === '25.3' && num('sec-arraybuffer-objects') === '25.1'
    && num('sec-dowait') === '25.4.3.14' && num('sec-notifywaiter') === '25.4.3.12' && num('sec-agentcansuspend') === '9.6.2' && num('sec-typedarraygetelement') === '10.4.5.17',
  'ECMA-262: SharedArrayBuffer 25.2 and Atomics 25.4 next to ArrayBuffer 25.1 and DataView 25.3; DoWait 25.4.3.14, NotifyWaiter 25.4.3.12, AgentCanSuspend 9.6.2');
  {
    const heads = [...spec.matchAll(/<h1><span class="secnum">25\.4\.\d+<\/span>\s*Atomics\.(\w+)/g)].map((m) => m[1]);
    check(f('sec-properties-of-the-sharedarraybuffer-instances').includes('SharedArrayBuffer instances, unlike ArrayBuffer instances, are never detached')
      && hasAll(f('sec-growable-sharedarraybuffer-guidelines'), ['the smallest possible size for the application be chosen', 'does not exceed 1073741824, or 1GiB'])
      && hasAll(f('sec-atomics-object'), ['does not have a [[Construct]] internal method', 'does not have a [[Call]] internal method'])
      && f('sec-waiterlist-records').includes('will result in the same WaiterList Record in any agent in the agent cluster')
      && hasAll(f('sec-waiter-record'), ['[[AgentSignifier]]', '[[TimeoutTime]]', '[[Result]]'])
      && heads.length === 13 && !heads.includes('pause') && !spec.includes('Atomics.pause'),
    `ECMA-262: 25.2.6 «never detached»; 25.2.7 — the smallest maxByteLength, not over 1073741824 (1 GiB); 25.4 — no [[Construct]], no [[Call]]; 25.4.2 — one WaiterList for the whole cluster; 25.4.1 — agent, time, result; 13 functions of Atomics, no Atomics.pause (${heads.length})`);
  }

  // the MDN pages the lecture quotes
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').replace(/\*\*/g, '');
  const says = (text, quote) => text.includes(quote) && lectureText.includes(`«${quote}»`);
  {
    const sab = plain(mdn('reference/global_objects/sharedarraybuffer'));
    const quotes = ['a side effect to the block in one agent will eventually become visible in the other agent', 'To use shared memory your document must be in a secure context and cross-origin isolated',
      'the constructor on the global object is hidden', 'a new, private SharedArrayBuffer object', 'the shared data block referenced by the two SharedArrayBuffer objects is the same data block',
      'For security reasons, SharedArrayBuffers cannot be reduced in size, only grown'];
    const wrongQ = quotes.filter((x) => !says(sab, x));
    check(wrongQ.length === 0 && sab.includes('disabled at the start of 2018') && sab.includes('Spectre'),
      `lecture 1–3, 5: MDN SharedArrayBuffer — ${quotes.length} quotes as MDN writes them, shared memory disabled in 2018 after Spectre ${wrongQ.join(' | ')}`);
    const atomics = plain(mdn('reference/global_objects/atomics'));
    const cas = plain(mdn('reference/global_objects/atomics/compareexchange'));
    const wait = plain(mdn('reference/global_objects/atomics/wait'));
    const wa = plain(mdn('reference/global_objects/atomics/waitasync'));
    const adder = js.find((x) => !x.file && x.section === 9 && x.code.includes('let done = false')).code;
    const adderFn = adder.slice(adder.indexOf('function add'), adder.indexOf('const mem'));
    check(says(atomics, 'used with SharedArrayBuffer and ArrayBuffer objects') && atomics.includes('Experts only') && plain(mdn('reference/global_objects/atomics/islockfree')).length > 0
      && says(cas, 'whether it was equal to the expected value or not') && cas.includes(adderFn.trim())
      && says(wait, 'regardless of whether the expected value has changed') && says(wa, 'The promise is never rejected'),
    'lecture 7, 9, 10, 11, 13: MDN Atomics — «used with SharedArrayBuffer and ArrayBuffer objects», «Experts only»; compareExchange — «whether it was equal…», the atomic adder exactly as the lecture copies it; wait — «regardless of whether the expected value has changed»; waitAsync — «The promise is never rejected»');
  }

  // the notes: the steps and sections they name, the MDN pages they quote, the footer
  {
    const nsteps = [
      ['sec-dowait', 'If arrayTypeName is "BigInt64Array", let v be ? ToBigInt64 (value)', '6'],
      ['sec-dowait', 'Else, let v be ? ToInt32 (value)', '7'],
      ['sec-atomics.notify', 'Let taRecord be ? ValidateIntegerTypedArray (typedArray, true)', '1'],
      ['sec-atomics.notify', 'Let intCount be ? ToIntegerOrInfinity (count)', '4.a'],
      ['sec-atomics.notify', 'If IsSharedArrayBuffer (buffer) is false, return +0', '7'],
    ];
    const nwrong = nsteps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
    check(nwrong.length === 0 && num('sec-atomics.store') === '25.4.11' && num('sec-atomics.islockfree') === '25.4.8' && num('sec-atomics.notify') === '25.4.15'
      && num('sec-atomicreadmodifywrite') === '25.4.3.17' && num('sec-validateintegertypedarray') === '25.4.3.1' && num('sec-allocatesharedarraybuffer') === '25.2.2.1',
    `student: ECMA-262 — DoWait 6–7 (homework 3: ToBigInt64, ToInt32), notify 1/4.a/7 (homework 4; 3–4 — above), 25.4.11 step 8, 25.4.8, 25.4.3.17 step 7, 25.4.3.1 step 4.b, 25.2.2.1 steps 6–7, 25.4.3.12 step 3.b (above) ${nwrong.join('; ')}`);
    const notes = builtSite.htmlOfFile(path.join(DAY, 'student.html')); // read() is declared below
    const nflat = flat(notes);
    const nFooter = notes.slice(notes.indexOf('<div class="sources">'));
    const sab = plain(mdn('reference/global_objects/sharedarraybuffer'));
    const wait = plain(mdn('reference/global_objects/atomics/wait'));
    const notify = plain(mdn('reference/global_objects/atomics/notify'));
    const nq = [[sab, 'To use shared memory your document must be in a secure context and cross-origin isolated'], [wait, 'regardless of whether the expected value has changed'], [notify, 'will return 0 on non-shared ArrayBuffer objects']];
    check(nq.every(([text, quote]) => text.includes(quote) && nflat.includes(`«${quote}»`)) && notify.includes('Defaults to Infinity')
      && ['SharedArrayBuffer, Atomics.wait(), Atomics.notify()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 4
      && !/tc39\.es\/ecma262\/2026\/#/.test(notes),
    'student: the quotes of MDN SharedArrayBuffer, Atomics.wait() and Atomics.notify() as MDN writes them, count defaults to Infinity; the footer names the three and ECMA-262 2026; MDN is linked there and three times in the text; section numbers without links');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p));
  check(pageText('advanced/day-09/lecture.html').includes('агенты и кластеры агентов') && pageText('advanced/day-01/lecture.html').includes('хозяин')
    && pageText('advanced/day-06/lecture.html').includes('побитовые операторы'),
  'lecture 1, 2, 7: day 9 — agents and agent clusters; day 1 — the host (хозяин); day 6 — the bitwise operators');
  {
    const l20 = pageText('advanced/day-20/lecture.html');
    check(hasAll(l20, ['13. Изменяемый буфер', '14. transfer и отсоединённый буфер', 'ToUint8', '«Карточки 2.0»: счётчики в байтах', 'нужен Uint8ClampedArray', 'он остановится на 255']),
      'lecture 1, 5, 7, 16: day 20 — the resizable buffer, transfer and the detached buffer, ToUint8, the counters of «Карточки 2.0» that stop at 255 with Uint8ClampedArray');
  }
  {
    const i30 = read('intermediate/day-30/lecture.html');
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    const ahead = read('tools/check-ahead.mjs');
    check(flat(i30).includes('Live Server') && textOf(i30).includes('<script type="module" src="main.js"></script>')
      && hasAll(plan, ['**22. SharedArrayBuffer и Atomics.**', '**23. Модель памяти: гонки данных и happens-before.**', 'второй поток — `Worker`: это Web API курса 4'])
      && ahead.includes("where: 'курс 4', re: /\\bnew\\s+(?:Worker|"),
    'lecture 1, 2, 17: day 30 of course 2 — modules through Live Server, <script type="module" src="main.js">; the plan — day 23 is the memory model, Worker is a tool of course 4 (check-ahead wants «// курс 4»)');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
  {
    const lecture = read('advanced/day-22/lecture.html');
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine);
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '22').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '22').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 26 && mdnRows.length === 23 && refSpec.length === 26 && refMdn.length === 23 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 22, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '22' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '22' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 2 && fullMdn.length === 10 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 12 rows "подробно" (2 + 10) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const titles = mdRows.filter((c) => c[5] === '3' && c[6] === '22').map((c) => [c[0], c[1]]);
    const wrongTitle = titles.filter(([p, t]) => !refTable.includes(`${p}">MDN: ${t.replace(/&/g, '&amp;')}</a>`)).map(([p]) => p);
    check(wrongTitle.length === 0, `plan: every MDN row is named by its title from the map ${wrongTitle.join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['SharedArrayBuffer и его методы, Atomics и его методы', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 26,
      `links: the footer names the MDN pages and ECMA-262 2026; MDN is linked 26 times — 23 rows, SharedArrayBuffer and Atomics in section 1, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
