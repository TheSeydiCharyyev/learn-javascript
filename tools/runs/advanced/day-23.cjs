// Course 3, day 23, in Chrome: the memory model (chapter 29 of ECMA-262). The day has little code of its own: every block
// is a file of a folder (two threads and the page), run the way day 22 runs them — every response with
// Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, on http://127.0.0.1, the page is
// the index.html of the lecture of day 22 (section 2 there; the lecture of day 23 sends the student to that folder), it
// loads main.js as a module; the blocks with file="…" of one section make a folder, a later file of the same name replaces
// the earlier one. Output is awaited up to the number of lines of the result-box. The context is Ashgabat time, Russian.
//   node tools/runs/advanced/day-23.cjs            every block: folder, output; checks below
//   node tools/runs/advanced/day-23.cjs --quiet    only the checks
// Checks: a result-box after a folder equals its output — a count after "обычные: ", "DataView: " or "обычный флаг: "
// (store buffering, tearing, message passing: it differs from run to run) must be a number above 0, the rest exactly;
// the cheatsheet runs without output; report() of section 15 reads both cells with Atomics.load and works; a torn value of
// DataView is made of the bytes of the two writes (the scheme: FF FF FF FF 00 00 00 00); the lecture of day 22 has the
// folder the lecture of day 23 points to; every English quote of the lecture («…») is in the text of ECMA-262 2026 or of
// the MDN pages it names; every step it names (29.7.2, 29.7.3, 29.8, 29.9; 25.1.3.13, 25.1.3.15, 25.1.3.18, 6.2.9.2,
// 25.4.3.6, 25.4.3.11, 10.4.5.17, 25.3.1.5) is checked against tools/.cache/ecma262-2026.html, and so are the texts it
// retells (29, 29.1, 29.6.4–29.6.6, 29.7.3–29.7.5, 29.10, 29.11); the days it points to say what it says; the reference
// table holds all 28 rows of the day's plan (all of ECMA-262) with their marks, every tc39.es anchor exists and every
// link whose text starts with a number names the section of that number; the footer. The notes: each of their 3 blocks
// prints what the comments of its console.log lines say; homework 1 and 2 with the notes' own race/dataRace and
// interleavings; homework 3 by IsNoTearConfiguration; their English quotes; the footer and the links.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-23');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const ORIGIN = 'http://127.0.0.1:5590';
const ISOLATE = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
// a count that differs from run to run: after these words, a number above 0
const VARY = /^(обычные: |DataView: |обычный флаг: )(\d+)(.*)$/;
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

// a folder of files on ORIGIN (index.html must be there), every response with the headers; console lines and uncaught
// errors in order. A fresh context each time: workers of the page before are gone.
async function runFolder(b, files, { lines = 0, ms = 60000, settle = 150 } = {}) {
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html';
    if (!(name in files)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found', headers: ISOLATE });
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/plain';
    return route.fulfill({ contentType: `${type}; charset=utf-8`, body: files[name], headers: ISOLATE });
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
// flat text; "R. [[Order]]" (a tag between) is written "R.[[Order]]"
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1').replace(/\. \[\[/g, '.[[');
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

  // the blocks of the lecture in page order, with the section each one is in; the folder of day 22
  const ctx0 = await b.newContext();
  const src = await ctx0.newPage();
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'lecture.html')));
  const items = await src.evaluate(() => [...document.querySelectorAll('h2, pre.code, .result-box')].map((el) => {
    if (el.tagName === 'H2') return { kind: 'h2', section: Number((el.textContent.match(/^(\d+)\./) || [])[1] || 0) };
    if (el.matches('.result-box')) return { kind: 'box', lines: el.innerText.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { kind: 'code', lang: el.classList.contains('js') ? 'js' : 'html', file: el.dataset.file || null, code: el.textContent, cheat: !!el.closest('.cheatsheet') };
  }));
  const lectureText = await src.evaluate(() => document.querySelector('.container').innerText);
  await src.goto(builtSite.urlOfFile(path.join(DAY22, 'lecture.html')));
  const folder22 = await src.evaluate(() => Object.fromEntries([...document.querySelectorAll('pre.code[data-file]')].filter((pre) => ['index.html', '.vscode/settings.json'].includes(pre.dataset.file)).map((pre) => [pre.dataset.file, pre.textContent])));
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'student.html')));
  const notesBlocks = await src.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => ({ js: pre.matches('.js'), file: pre.dataset.file || null, code: pre.textContent })));
  const notesText = await src.evaluate(() => document.querySelector('.container').innerText);
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const js = items.filter((x) => x.kind === 'code' && x.lang === 'js');
  check(js.length === 14 && js.filter((x) => x.file).length === 12 && js.filter((x) => x.cheat).length === 1 && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && items.filter((x) => x.kind === 'box').length === 6,
    `lecture: 14 js blocks (12 files of 6 folders, report() and the cheatsheet), 6 result-boxes (${js.length}, ${items.filter((x) => x.kind === 'box').length})`);
  const indexHtml = folder22['index.html'];
  let settings = null;
  try { settings = JSON.parse(folder22['.vscode/settings.json']); } catch {}
  check(!!indexHtml && indexHtml.includes('<script type="module" src="main.js"></script>') && settings && same(settings['liveServer.settings.headers'], ISOLATE)
    && lectureText.includes('Все опыты дня — в изолированной папке дня 22 (раздел 2 его лекции: .vscode/settings.json и index.html)'),
  'lecture 2: the folder of day 22 it points to — section 2 there has .vscode/settings.json with COOP and COEP and index.html that loads main.js as a module');
  const page = (files) => ({ 'index.html': indexHtml, ...files });

  // the result-boxes: the folder before each one
  let folder = {}, folderSection = -1, last = null, n = 0;
  for (const it of items) {
    if (it.kind === 'h2') continue;
    if (it.kind === 'code') {
      if (it.section !== folderSection) { folder = {}; folderSection = it.section; }
      if (it.file) folder[it.file] = it.code;
      last = it;
      continue;
    }
    n++;
    const files = page(folder);
    const label = `lecture ${it.section}, box ${n}: folder ${Object.keys(folder).join(' ')}`;
    const out = await runFolder(b, files, { lines: it.lines.length });
    if (!quiet) { console.log(`\n--- ${label}`); for (const l of out) console.log(`    > ${l}`); }
    const ok = out.length === it.lines.length && it.lines.every((want, i) => {
      if (want === out[i]) return true;
      const w = want.match(VARY), g = (out[i] ?? '').match(VARY);
      return !!(w && g && w[1] === g[1] && Number(g[2]) > 0 && w[3] === g[3]);
    });
    check(ok && !!last && !!last.file, `${label}: result-box = output (a count after «обычные:», «DataView:», «обычный флаг:» — above 0) ${JSON.stringify(out)}`);
    last = null;
  }
  check(n === 6, `lecture: every result-box had a folder before it (${n})`);

  // the notes: every console.log line writes its output in its comment; the homework 1–2 with the notes' own functions
  {
    const commented = (code) => code.split(LF).filter((l) => l.includes('console.log(') && l.includes('//'))
      .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
    check(notesBlocks.length === 3 && notesBlocks.every((x) => x.js && !x.file), `student: 3 js blocks without a file name (${notesBlocks.length})`);
    for (const [i, blk] of notesBlocks.entries()) {
      const want = commented(blk.code);
      const out = await runFolder(b, page({ 'main.js': blk.code }), { lines: want.length });
      if (!quiet) { console.log(`\n--- student #${i}: ${blk.code.split(LF)[0]}`); for (const l of out) console.log(`    > ${l}`); }
      check(want.length > 0 && same(out, want), `student #${i}: output = comments ${JSON.stringify(out)}`);
    }
    const inter = notesBlocks[1].code.slice(0, notesBlocks[1].code.indexOf('const A ='));
    const out2 = await runFolder(b, page({ 'main.js': `${inter}
const A = [["data", 1], ["flag", 1]], B = [["f", "flag"], ["d", "data"]];
const results = interleavings(A, B).map((steps) => {
  const m = { data: 0, flag: 0 };
  for (const [k, v] of steps) m[k] = typeof v === "number" ? v : m[v];
  return m.f + " " + m.d;
});
console.log(results.length, [...new Set(results)].sort().join(" | "));` }), { lines: 1 });
    check(same(out2, ['6 0 0 | 0 1 | 1 1']), `student homework 2: interleavings of message passing — 0 0, 0 1, 1 1, never «1 0» (the lecture saw it with a plain flag) ${JSON.stringify(out2)}`);
    const defs = notesBlocks[2].code.slice(0, notesBlocks[2].code.indexOf('const a ='));
    const out1 = await runFolder(b, page({ 'main.js': `${defs}
const wa = { write: true, order: "unordered", start: 0, size: 4 };
const rb1 = { write: false, order: "seq-cst", start: 0, size: 4, from: wa };
const init = { write: true, order: "init", start: 0, size: 4 };
const rb0 = { write: false, order: "seq-cst", start: 0, size: 4, from: init };
const hbInit = (x, y) => x === init;
const w1 = { write: true, order: "unordered", start: 4, size: 4 }, r1 = { write: false, order: "unordered", start: 4, size: 4, from: w1 };
const chain = (x, y) => x === w1 && y === r1;
const addA = { write: true, order: "seq-cst", start: 0, size: 2 }, addB = { write: true, order: "seq-cst", start: 0, size: 2 };
const loadC = { write: false, order: "seq-cst", start: 0, size: 4, from: addB };
const wd = { write: true, order: "unordered", start: 0, size: 4 }, rd = { write: false, order: "unordered", start: 0, size: 4, from: wd };
const host = (x, y) => x === wd && y === rd;
console.log("a", race(wa, rb1, none), dataRace(wa, rb1, none), race(wa, rb0, hbInit), dataRace(wa, rb0, hbInit));
console.log("b", race(w1, r1, chain), dataRace(w1, r1, chain));
console.log("c", race(addA, addB, none), dataRace(addA, addB, none), race(addB, loadC, none), dataRace(addB, loadC, none));
console.log("d", race(wd, rd, host), dataRace(wd, rd, host));` }), { lines: 4 });
    check(same(out1, ['a true true false false', 'b false false', 'c true false true true', 'd false false']),
      `student homework 1 with race and dataRace of the notes: a) a data race where B read 1, none where B read the zero (init hb) — the program is not data race free; b) the chain — no race; c) the two Int16 adds race, not a data race, Int32 load against them — a data race; d) postMessage — no race ${JSON.stringify(out1)}`);
  }

  // the cheatsheet; report() of «Карточки 2.0»
  {
    const cheat = js.find((x) => x.cheat);
    const out = await runFolder(b, page({ 'main.js': cheat.code }));
    check(out.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out)}`);
    const report = js.find((x) => !x.file && !x.cheat);
    const out2 = await runFolder(b, page({ 'main.js': `${report.code}
const s = new Int32Array(new SharedArrayBuffer(8));
Atomics.store(s, 0, 3);
Atomics.store(s, 1, 1);
console.log(JSON.stringify(report(s)));` }), { lines: 1 });
    check(report.section === 15 && (report.code.match(/Atomics\.load\(s, [01]\)/g) || []).length === 2 && same(out2, ['{"done":3,"errors":1}']),
      `lecture 15: report() reads both cells with Atomics.load ${JSON.stringify(out2)}`);
  }

  // a torn value of DataView is made of the bytes of the two writes (the scheme of section 9)
  {
    const tear = js.find((x) => x.file === 'tear.js').code;
    const out = await runFolder(b, page({ 'tear.js': tear.replace('if (v !== values[0] && v !== values[1]) torn++;', 'if (v !== values[0] && v !== values[1]) { torn++; if (seen.size < 200) seen.add(BigInt.asUintN(64, v).toString(16).padStart(16, "0")); }')
      .replace('let torn = 0;', 'let torn = 0; const seen = new Set();').replace('postMessage(torn);', 'postMessage([torn, ...seen].join(" "));'),
    'main.js': `const shared = new SharedArrayBuffer(128);
new Worker("tear.js").postMessage({ shared, kind: "DataView", role: "writer" });
const reader = new Worker("tear.js");
reader.onmessage = (e) => console.log(e.data);
reader.postMessage({ shared, kind: "DataView", role: "reader" });` }), { lines: 1 });
    const [torn, ...values] = (out[0] || '').split(' ');
    const mixed = values.every((v) => /^(00|ff)+$/.test(v) && v !== '0'.repeat(16) && v !== 'f'.repeat(16));
    check(Number(torn) > 0 && values.length > 0 && mixed,
      `lecture 9, the scheme: every torn value of DataView is made of bytes 00 and FF of the two writes (${values.length} kinds, e.g. ${values.slice(0, 4).join(', ')}; ffffffff00000000 among them: ${values.includes('ffffffff00000000')})`);
  }
  await b.close();

  // every English quote of the lecture is in ECMA-262 2026 or in the MDN pages it names
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ');
  {
    const ch29 = spec.slice(spec.indexOf('id="sec-memory-model"'), spec.indexOf('<emu-annex'));
    const corpus = [flat(ch29), f('sec-getrawbytesfromsharedblock'), plain(mdn('reference/global_objects/sharedarraybuffer')), plain(mdn('reference/global_objects/atomics'))].join(' ');
    const norm = (s) => s.replace(/\s+/g, ' ').replace(/\. \[\[/g, '.[[');
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => norm(m[1]));
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length >= 20 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in ECMA-262 2026 (chapter 29, 25.1.3.15) or MDN SharedArrayBuffer and Atomics: ${missing.join(' | ') || 'none'}`);
    const sab = plain(mdn('reference/global_objects/sharedarraybuffer'));
    const atomics = plain(mdn('reference/global_objects/atomics'));
    check(sab.includes('will eventually become visible in the other agent') && atomics.includes('that operations are finished before the next operation starts')
      && lectureText.includes('«eventually»') && lectureText.includes('«that operations are finished before the next operation starts»'),
    'lecture 1, 2: MDN SharedArrayBuffer — the change «will eventually become visible», MDN Atomics — «that operations are finished before the next operation starts»');
    const nquotes = [...notesText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => norm(m[1]));
    const nmissing = nquotes.filter((x) => !corpus.includes(x));
    check(nquotes.length >= 6 && nmissing.length === 0 && nquotes.includes('Depending on the system (the CPU, the OS, the Browser) it can take a while until the change is propagated to all contexts. To synchronize, atomic operations are needed'),
      `student: ${nquotes.length} English quotes of the notes, the MDN one of homework 4 among them; not found in ECMA-262 2026 or MDN: ${nmissing.join(' | ') || 'none'}`);
  }

  // the notes: homework 3 by IsNoTearConfiguration (25.1.3.13; DataView reads with isTypedArray false), the footer and links
  {
    const noTear = (type, isTypedArray, order) => isTypedArray && (['Int8', 'Uint8', 'Int16', 'Uint16', 'Int32', 'Uint32'].includes(type) || (['BigInt64', 'BigUint64'].includes(type) && order !== 'init' && order !== 'unordered'));
    const answers = [noTear('Int16', true, 'unordered'), noTear('BigInt64', true, 'unordered'), noTear('BigInt64', true, 'seq-cst'), noTear('Float32', true, 'unordered'), noTear('Int16', false, 'unordered')]
      .map((t) => (t ? 'нельзя' : 'можно'));
    check(same(answers, ['нельзя', 'можно', 'нельзя', 'можно', 'можно']) && notesText.includes('IsNoTearConfiguration (25.1.3.13): целые виды — всегда, BigInt-виды — только с seq-cst, дробные — никогда'),
      `student homework 3: a torn value is ${answers.join(', ')} for Int16Array, BigInt64Array, Atomics on BigInt64Array, Float32Array, DataView (steps 1, 2, 2, 3; DataView — isTypedArray false); the notes state the rule`);
    const notes = builtSite.htmlOfFile(path.join(DAY, 'student.html'));
    const nFooter = notes.slice(notes.indexOf('<div class="sources">'));
    check(['SharedArrayBuffer', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 2
      && !/tc39\.es\/ecma262\/2026\/#/.test(notes),
    'student: the footer names MDN SharedArrayBuffer and ECMA-262 2026; MDN is linked there and once in the text; section numbers without links');
  }

  // the steps the lecture names
  const steps = [
    ['sec-setvalueinbuffer', 'If isTypedArray is true and IsNoTearConfiguration (type, order) is true, let noTear be true', '9.c'],
    ['sec-setvalueinbuffer', 'Append WriteSharedMemory', '9.d'],
    ['sec-getrawbytesfromsharedblock', 'If isTypedArray is true and IsNoTearConfiguration (type, order) is true, let noTear be true', '5'],
    ['sec-getrawbytesfromsharedblock', 'nondeterministically chosen byte values', '6'],
    ['sec-getrawbytesfromsharedblock', 'to describe observable behaviour of hardware with weak consistency', '7'],
    ['sec-getrawbytesfromsharedblock', 'Let readEvent be ReadSharedMemory', '8'],
    ['sec-getrawbytesfromsharedblock', 'Append readEvent to eventsRecord.[[EventList]]', '9'],
    ['sec-createsharedbytedatablock', 'Append WriteSharedMemory { [[Order]] : init', '6.a'],
    ['sec-isnotearconfiguration', 'If IsUnclampedIntegerElementType (type) is true, return true', '1'],
    ['sec-isnotearconfiguration', 'If IsBigIntElementType (type) is true and order is neither init nor unordered, return true', '2'],
    ['sec-isnotearconfiguration', 'Return false', '3'],
    ['sec-typedarraygetelement', 'Return GetValueFromBuffer (O.[[ViewedArrayBuffer]], byteIndexInBuffer, elementType, true, unordered)', '6'],
    ['sec-getviewvalue', 'Return GetValueFromBuffer (view.[[ViewedArrayBuffer]], bufferIndex, type, false, unordered, isLittleEndian)', '13'],
    ['sec-entercriticalsection', 'Append (WL.[[MostRecentLeaveEvent]], enterEvent) to eventsRecord.[[AgentSynchronizesWith]]', '3.g'],
    ['sec-suspendthisagent', 'Perform EnterCriticalSection (WL)', '8'],
    ['sec-races', 'If E and D are not the same Shared Data Block event, then', '1'],
    ['sec-races', 'If it is not the case that both E happens-before D in execution and D happens-before E in execution, then', '1.a'],
    ['sec-races', 'If E and D are both WriteSharedMemory or ReadModifyWriteSharedMemory events and E and D do not have disjoint memory ranges, then', '1.a.i'],
    ['sec-races', 'If E reads-from D in execution or D reads-from E in execution, then', '1.a.ii'],
    ['sec-data-races', 'If E and D are in a race in execution, then', '1'],
    ['sec-data-races', 'If E.[[Order]] is not seq-cst or D.[[Order]] is not seq-cst, then', '1.a'],
    ['sec-data-races', 'If E and D have overlapping memory ranges, then', '1.b'],
    ['sec-coherent-reads', 'If R happens-before W in execution, then', '1.c.i'],
    ['sec-coherent-reads', 'such that W happens-before V in execution and V happens-before R in execution, then', '1.c.ii'],
    ['sec-tear-free-aligned-reads', 'If R.[[NoTear]] is true, then', '1.a'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture names (25.1.3.18 9.c–9.d, 25.1.3.15 5–9, 6.2.9.2 6.a, 25.1.3.13 1–3, 10.4.5.17 6, 25.3.1.5 13, 25.4.3.6 3.g, 25.4.3.11 8, 29.8 1/1.a/1.a.i/1.a.ii, 29.9 1/1.a/1.b, 29.7.2 1.c.i/1.c.ii, 29.7.3 1.a): ${wrong.join('; ') || 'all right'}`);
  check(num('sec-memory-model') === '29' && num('sec-getrawbytesfromsharedblock') === '25.1.3.15' && num('sec-setvalueinbuffer') === '25.1.3.18' && num('sec-createsharedbytedatablock') === '6.2.9.2'
    && num('sec-isnotearconfiguration') === '25.1.3.13' && num('sec-entercriticalsection') === '25.4.3.6' && num('sec-suspendthisagent') === '25.4.3.11',
  'ECMA-262: chapter 29; GetRawBytesFromSharedBlock 25.1.3.15, SetValueInBuffer 25.1.3.18, CreateSharedByteDataBlock 6.2.9.2, IsNoTearConfiguration 25.1.3.13, EnterCriticalSection 25.4.3.6, SuspendThisAgent 25.4.3.11');

  // the texts the lecture retells
  {
    const hb = f('sec-happens-before');
    check(hasAll(f('sec-memory-model-fundamentals'), ['Table 92: ReadSharedMemory Event Fields', 'Table 93: WriteSharedMemory Event Fields', 'Table 94: ReadModifyWriteSharedMemory Event Fields', 'seq-cst, unordered, or init', 'Read-modify- write events are always sequentially consistent'])
      && f('sec-host-synchronizes-with').includes('such as postMessage between HTML workers')
      && hasAll(hb, ['E is-agent-order-before D in execution', 'E synchronizes-with D in execution', 'E.[[Order]] is init, and E and D have overlapping memory ranges', 'There is an event F such that E happens-before F and F happens-before D in execution'])
      && hasAll(f('sec-valid-executions'), ['execution admits a happens-before Relation that is a strict partial order', 'has valid chosen reads', 'has coherent reads', 'has tear free reads', 'has sequentially consistent atomics'])
      && f('sec-memory-order').includes('it is not the case that there is an infinite number of ReadSharedMemory or ReadModifyWriteSharedMemory events'),
    'ECMA-262: tables 92–94 and their [[Order]]; 29.6.4 — postMessage; 29.6.6 — the four ways of happens-before; 29.7.5 — a strict partial order and the four properties of 29.7.1–29.7.4; 29.7.4 — no infinite number of reads before a seq-cst write');
    const g = f('sec-shared-memory-guidelines');
    check(hasAll(g, ['Possible read values must be non-empty', 'Lock-free atomic read-modify-write accesses compile to a full fence', 'LOCK -prefixed instructions on x86'])
      && lectureText.includes('`Atomics.add` — LOCK-командой на x86'.replace(/`/g, '')),
    'ECMA-262 29.11: the fourth rule (possible read values non-empty), read-modify-write between full fences, LOCK-prefixed instructions on x86');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p));
  {
    const l22 = pageText('advanced/day-22/lecture.html');
    const sec = (title, next) => l22.slice(l22.indexOf(title), l22.indexOf(next));
    check(sec('6. Гонка: два потока и ++', '7. Atomics.add').includes('counts[0]++') && sec('7. Atomics.add', '8. load и store').includes('Atomics.add(counts, 1, 1)')
      && sec('11. wait по шагам', '12. notify').includes('flags[0]') && hasAll(sec('14. Практика', '15. Ошибки дня'), ['s[4]++', 's[6]++', 'lock(s, 3)', 'unlock(s, 3)', 'Atomics.compareExchange(s, i, 0, 1)', 'Atomics.store(s, i, 0)'])
      && l22.includes('async function until('),
    'lecture 7, 13: day 22 — counts[0]++ in section 6, Atomics.add in section 7, the waiter reads flags[0] in section 11, s[4]++ and s[6]++ under the lock of compareExchange and store in section 14, until');
    const t22 = pageText('advanced/day-22/tasks.html');
    const task7 = t22.slice(t22.indexOf('7. «Карточки 2.0»: проверка колоды в фоне'), t22.indexOf('8. Семафор'));
    check(hasAll(task7, ['Atomics.add(s, 1, 1)', 'Atomics.add(s, 0, 1)', 'watchProgress']), 'lecture 15: task 7 of day 22 — the checker counts errors and done with Atomics.add, the page watches with watchProgress');
    const l21 = pageText('advanced/day-21/lecture.html');
    const mods = read('tools/plan-modules.mjs');
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    check(l21.includes('GetViewValue') && mods.includes("['A6', 3, 2, 'Управление ресурсами и памятью']") && plan.includes('| 24 | A6 | WeakRef и FinalizationRegistry: сборка мусора |')
      && plan.includes('**23. Модель памяти: гонки данных и happens-before.**'),
    'lecture 9, 16: day 21 — GetViewValue (DataView reads with isTypedArray false); the plan — day 24 is WeakRef and FinalizationRegistry, module A6 «Управление ресурсами и памятью»');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
  {
    const lecture = read('advanced/day-23/lecture.html');
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine);
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '23').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '23').map((c) => c[0]);
    const missing = specRows.filter((id) => !refSpec.includes(id));
    check(specRows.length === 28 && mdnRows.length === 0 && refSpec.length === 28 && missing.length === 0 && !refTable.includes('MDN: '),
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 23, ${refSpec.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '23' && c[9] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 7 && same(fullSpec, markedSpec), `plan: the 7 rows "подробно" are marked so in the table ${JSON.stringify(markedSpec)}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['SharedArrayBuffer, Atomics', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 3,
      `links: the footer names MDN SharedArrayBuffer and Atomics and ECMA-262 2026; MDN is linked 3 times — sections 1 and 2, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
