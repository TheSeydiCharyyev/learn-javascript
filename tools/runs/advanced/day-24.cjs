// Course 3, day 24, in Chrome: WeakRef and FinalizationRegistry, garbage collection. Every block of the lecture runs as
// main.js of a folder on http://127.0.0.1 — the index.html of the lecture of day 22 (section 2 there; the lecture of day 24
// sends the student to that folder, no isolation is needed), gc.js of section 3 next to it. A block that imports ./gc.js
// gets the garbage collector through CDP (HeapProfiler.collectGarbage) every 200 ms while the page runs, as a student
// presses "Collect garbage" in DevTools; the other blocks run without it. Output is awaited up to the number of lines of
// the result-box. The context is Ashgabat time, Russian.
//   node tools/runs/advanced/day-24.cjs            every block: output; checks below
//   node tools/runs/advanced/day-24.cjs --quiet    only the checks
// Checks: a result-box after a block equals its output — the second line of section 14 (the gap of the MDN cache) may be
// either outcome the lecture names, and the gap is seen at least once in 12 runs; the experiments behind the text: a
// registry nobody holds is silent while its target is gone (section 12) and so is nextGC without keep (section 3);
// [[KeptAlive]] without gc.js (section 7: the job's own allocations collect inside it, the target deref()-ed in the job
// stays, the other goes; without that first deref both go — 3 times each); which of the 1000 cards survive (section 16:
// number 999 with for…of at the top level of the module, none with an index loop or for…of in a function); the MDN cache
// without the deref() check in its registry loses the entry of a live value after two loads of one key at once (section
// 14); the constructors have only prototype; the label and icon of the button in DevTools of this Chrome (section 3); the
// cheatsheet runs without output; the folder of day 22; every English quote of the lecture («…») is in ECMA-262 2026
// (9.9–9.13, chapter 26), the 8 MDN pages of the day or the DevTools strings; the code of section 14 is the second cached
// of MDN; every step it names (26.1.1.1, 26.1.3.2, 26.1.4.1, 26.2.1.1, 26.2.3.2, 26.2.3.3, 9.10–9.13) is checked against
// tools/.cache/ecma262-2026.html, and so are the notes and texts it retells (9.9.1–9.9.4.1, 26.1.5, 26.2.4) and the MDN
// texts; the days it points to say what it says; the reference table holds all 29 rows of the day's plan (21 of ECMA-262,
// 8 of MDN) with their marks and titles, every tc39.es anchor exists and every link whose text starts with a number names
// the section of that number; the footer. The notes: each of their 3 blocks (2 with nextGC) prints what the comments of
// its console.log lines say; homework 1 — what survives a collection (а–г by experiment, д by the one of section 7);
// homework 2 — get that reads deref() first loads again after nextGC(), 5 times; homework 3 — five TypeErrors with the
// texts of Chrome; homework 4 — the places of the spec and the lecture; their English quotes, the steps of their tables,
// the footer and the links.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-24');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const ORIGIN = 'http://127.0.0.1:5590';
const DEVTOOLS_PORT = 9324; // Chrome serves its own DevTools frontend at /devtools/… of this port
const quiet = process.argv.includes('--quiet');
// section 14: the second line of the MDN cache — right after the collection, before or after its cleanup job
const GAP = ['undefined 1', "{word: 'kitap'} 2"];
const GAP_RUNS = 12;
// a block of the tasks without a result-box: its output by "tasks #index" (js blocks of the page); the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['- b - - e'],
  'tasks #1': ['true false false false'],
  'tasks #2': ['ok TypeError ok TypeError TypeError ok TypeError'],
  'tasks #8': ['Uncaught Error: сбой', 'c,микрозадача,b,a'],
};
// reference solutions of the tasks: every "expression;   // value" line of an example must give the comment; the check is
// awaited, so a line may await too. No template literals inside: Node reads these strings as templates first.
const SOLUTIONS = {
  makeCache: `function makeCache(load, keep = 0) {
  const map = new Map();
  const recent = [];
  const registry = new FinalizationRegistry((key) => {
    if (!map.get(key)?.deref()) map.delete(key);
  });
  return {
    get(key) {
      let value = map.get(key)?.deref();
      if (value === undefined) {
        value = load(key);
        map.set(key, new WeakRef(value));
        registry.register(value, key);
      }
      if (keep > 0) {
        const at = recent.indexOf(value);
        if (at !== -1) recent.splice(at, 1);
        recent.push(value);
        if (recent.length > keep) recent.shift();
      }
      return value;
    },
    get size() { return map.size; },
  };
}`,
  makeTracker: `function makeTracker() {
  const freed = [];
  let tracked = 0;
  const registry = new FinalizationRegistry((id) => freed.push(id));
  return {
    track(obj, id) { tracked++; registry.register(obj, id); },
    freed() { return [...freed].sort((x, y) => x - y); },
    alive() { return tracked - freed.length; },
  };
}`,
  openConnection: `const leaks = new FinalizationRegistry(({ name, log }) => log.push("утечка: " + name));
function openConnection(name, log) {
  const conn = {
    name,
    closed: false,
    close() {
      if (conn.closed) return;
      conn.closed = true;
      leaks.unregister(conn);
      log.push("закрыто: " + name);
    },
  };
  leaks.register(conn, { name, log }, conn);
  return conn;
}`,
  makeEmitter: `function makeEmitter() {
  let refs = [];
  return {
    on(listener) { refs.push(new WeakRef(listener)); },
    emit(msg) {
      refs = refs.filter((r) => r.deref() !== undefined);
      for (const r of refs) r.deref().handle(msg);
      return refs.length;
    },
    get size() { return refs.length; },
  };
}`,
  cachedOnce: `function cachedOnce(getter) {
  const cache = new Map(), pending = new Map();
  const registry = new FinalizationRegistry((key) => {
    if (!cache.get(key)?.deref()) cache.delete(key);
  });
  return async (key) => {
    const hit = cache.get(key)?.deref();
    if (hit !== undefined) return hit;
    if (pending.has(key)) return pending.get(key);
    const promise = (async () => {
      try {
        const value = await getter(key);
        cache.set(key, new WeakRef(value));
        registry.register(value, key);
        return value;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, promise);
    return promise;
  };
}`,
};
const checkable = (code) => {
  const names = Object.keys(SOLUTIONS).filter((n) => code.includes(`${n}(`));
  const lines = code.split('\n').map((line) => {
    const m = line.match(/^(?!const |let )(.+?);\s*\/\/\s*(.+?)(?:\s+—.*)?$/);
    return m ? `await __check(${JSON.stringify(m[1])}, async () => (${m[1]}), ${JSON.stringify(m[2])});` : line;
  });
  return `async function __check(text, fn, want) {
  const got = JSON.stringify(await fn()), exp = JSON.stringify((0, eval)("(" + want + ")"));
  console.log((got === exp ? "EX-OK " : "EX-BAD ") + text + " = " + got + (got === exp ? "" : ", comment: " + want));
}
${names.map((n) => SOLUTIONS[n]).join('\n')}
${lines.join('\n')}`;
};

const LF = String.fromCharCode(10);
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.type === 'function' ? 'ƒ' : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a folder of files on ORIGIN (index.html must be there); console lines and uncaught errors in order. With gc: true the
// garbage collector runs through CDP every `every` ms until the lines come. A fresh context each time.
async function runFolder(b, files, { lines = 0, ms = 30000, settle = 150, gc = false, every = 200 } = {}) {
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html';
    if (!(name in files)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/plain';
    return route.fulfill({ contentType: `${type}; charset=utf-8`, body: files[name] });
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
  let lastGc = 0;
  while (out.length < lines && Date.now() - t0 < ms) {
    if (gc && Date.now() - lastGc >= every) { await cdp.send('HeapProfiler.collectGarbage'); lastGc = Date.now(); }
    await p.waitForTimeout(20);
  }
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
// a piece of code with one place changed: the place must be there exactly once
const swap = (code, from, to) => (code.split(from).length === 2 ? code.replace(from, () => to) : null);

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome', args: [`--remote-debugging-port=${DEVTOOLS_PORT}`] });
  console.log(`chrome ${b.version()}`);
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
  let keptInJob = false; // section 7: a target deref()-ed in the job outlives a collection inside it (homework 1 д of the notes too)

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
  const indexHtml = await src.evaluate(() => [...document.querySelectorAll('pre.code[data-file]')].find((pre) => pre.dataset.file === 'index.html')?.textContent);
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'student.html')));
  const notesBlocks = await src.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => ({ js: pre.matches('.js'), file: pre.dataset.file || null, code: pre.textContent })));
  const notesText = await src.evaluate(() => document.querySelector('.container').innerText);
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'tasks.html')));
  const taskBlocks = await src.evaluate(() => [...document.querySelectorAll('pre.code.js')].map((pre) => ({ code: pre.textContent, file: pre.dataset.file || null, example: !!pre.closest('.example'), box: !!(pre.nextElementSibling && pre.nextElementSibling.matches('.result-box')) })));
  const tasksText = await src.evaluate(() => document.querySelector('.container').innerText);
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const js = items.filter((x) => x.kind === 'code' && x.lang === 'js');
  const blocks = js.filter((x) => !x.file && !x.cheat);
  check(js.length === 19 && js.filter((x) => x.file).length === 1 && js.filter((x) => x.cheat).length === 1 && blocks.length === 17
    && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && items.filter((x) => x.kind === 'box').length === 17,
  `lecture: 19 js blocks (gc.js, 17 blocks, the cheatsheet), 17 result-boxes (${js.length}, ${items.filter((x) => x.kind === 'box').length})`);
  const gcjs = js.find((x) => x.file === 'gc.js');
  check(!!indexHtml && indexHtml.includes('<script type="module" src="main.js"></script>') && gcjs.section === 3
    && lectureText.includes('файл gc.js в папке с index.html дня 22 (изоляция сегодня не нужна, но папка готовая)'),
  'lecture 3: gc.js goes to the folder of day 22 — section 2 there has index.html that loads main.js as a module');
  const page = (main, more = {}) => ({ 'index.html': indexHtml, 'gc.js': gcjs.code, 'main.js': main, ...more });
  const usesGc = (code) => code.includes('from "./gc.js"');

  // the result-boxes: the block before each one
  let last = null, n = 0;
  for (const it of items) {
    if (it.kind === 'h2') continue;
    if (it.kind === 'code') { last = it.file || it.cheat ? null : it; continue; }
    n++;
    const label = `lecture ${it.section}, box ${n}${last && usesGc(last.code) ? ' (gc)' : ''}`;
    if (!last) { check(false, `${label}: no block before it`); continue; }
    const out = await runFolder(b, page(last.code), { lines: it.lines.length, gc: usesGc(last.code) });
    if (!quiet) { console.log(`\n--- ${label}: ${last.code.split(LF).find((l) => !l.startsWith('import ')).slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
    const gapLine = it.section === 14 ? 1 : -1;
    const ok = out.length === it.lines.length && it.lines.every((want, i) => want === out[i] || (i === gapLine && GAP.includes(want) && GAP.includes(out[i])));
    check(ok, `${label}: result-box = output${gapLine > 0 ? ' (the second line — either outcome of the gap)' : ''} ${JSON.stringify(out)}`);
    last = null;
  }
  check(n === 17, `lecture: every result-box had a block before it (${n})`);

  // section 14: the gap of the MDN cache is seen at least once; the lecture names both outcomes
  const cacheBlock = blocks.find((x) => x.code.includes('function cached(getter)'));
  {
    const seen = {};
    let wrong = 0;
    for (let k = 0; k < GAP_RUNS; k++) {
      const out = await runFolder(b, page(cacheBlock.code), { lines: 3, gc: true });
      seen[out[1]] = (seen[out[1]] || 0) + 1;
      if (!(out.length === 3 && out[0] === 'true 1' && GAP.includes(out[1]) && out[2] === 'kitap 2')) wrong++;
    }
    check(cacheBlock.section === 14 && wrong === 0 && (seen[GAP[0]] || 0) > 0 && lectureText.includes("может выйти и {word: 'kitap'} 2"),
      `lecture 14: in ${GAP_RUNS} runs the second line is ${JSON.stringify(seen)} — the gap («undefined 1») at least once, nothing else; the lecture names the other outcome`);
  }

  // section 14: without the deref() check its registry deletes the entry of a live value — two loads of one key at once
  {
    const code = cacheBlock.code;
    const fn = code.slice(code.indexOf('function cached(getter) {'), code.indexOf(`${LF}}${LF}`, code.indexOf('function cached(getter) {')) + 2);
    const unchecked = swap(fn, `    if (!cache.get(key)?.deref()) {${LF}      cache.delete(key);${LF}    }`, '    cache.delete(key);');
    const twice = (cached) => `import { nextGC } from "./gc.js";
${cached}
let loads = 0;
const get = cached(async (word) => { loads++; await new Promise((r) => setTimeout(r, 10)); return { word }; });
const second = await (async () => {
  const [a, b] = await Promise.all([get("kitap"), get("kitap")]);
  console.log(loads, a !== b);
  return b;
})();
await nextGC();
await new Promise((r) => setTimeout(r, 50));
console.log((await get("kitap")) === second, loads);`;
    const withCheck = await runFolder(b, page(twice(fn)), { lines: 2, gc: true });
    const without = unchecked ? await runFolder(b, page(twice(unchecked)), { lines: 2, gc: true }) : [];
    check(same(withCheck, ['2 true', 'true 2']) && same(without, ['2 true', 'false 3'])
      && lectureText.includes('Функция реестра может прийти «after a new object has been added with this key»: например, два get загружали одно слово одновременно, и второй заменил запись первого.'),
    `lecture 14: two loads of «kitap» at once, the first value dropped — with the check the entry of the second stays ${JSON.stringify(withCheck)}, without it the registry deletes it and the word loads a third time ${JSON.stringify(without)}`);
  }

  // section 16: who survives — number 999 with for…of at the top level of the module; none otherwise
  {
    const first = blocks.find((x) => x.code.includes('let freed = 0;'));
    const ids = swap(swap(first.code, 'const registry = new FinalizationRegistry(() => { freed++; });',
      'const freedIds = new Set();' + LF + 'const registry = new FinalizationRegistry((id) => { freed++; freedIds.add(id); });') ?? '',
    'console.log("освобождено:", freed, "оставлено:", kept.length);',
    'const alive = [];' + LF + 'for (let i = 10; i < 1000; i++) if (!freedIds.has(i)) alive.push(i);' + LF + 'console.log(freed, alive.join() || "-");');
    const loop = 'for (const card of cards) registry.register(card, card.id);';
    const variants = [['for…of at the top level', loop, '989 999'], ['an index loop', 'for (let i = 0; i < cards.length; i++) registry.register(cards[i], cards[i].id);', '990 -'],
      ['for…of in a function', `(() => { ${loop} })();`, '990 -'], ['forEach', 'cards.forEach((card) => registry.register(card, card.id));', '990 -']];
    const got = [];
    for (const [name, to] of variants) {
      const code = ids && swap(ids, loop, to);
      const out = code ? await runFolder(b, page(code), { lines: 1, gc: true }) : ['(no code)'];
      got.push(`${name}: ${out.join(' | ')}`);
    }
    check(first.section === 16 && !!ids && variants.every(([name, , want], i) => got[i] === `${name}: ${want}`)
      && lectureText.includes('последняя карточка, номер 999 — последнее значение переменной цикла for…of на верхнем уровне модуля'),
    `lecture 16: freed and survivors of 10…999 — ${got.join('; ')}`);
  }

  // section 12: the object is gone, and still no call; section 3: nextGC without keep never comes
  {
    const silent = blocks.find((x) => x.code.includes('function watch(obj)'));
    const code = swap(swap(silent.code, 'watch(a);', 'watch(a);' + LF + 'const ra = new WeakRef(a);') ?? '', 'console.log(log.length);', 'console.log(log.length, ra.deref());');
    const out = code ? await runFolder(b, page(code), { lines: 1, gc: true }) : [];
    check(silent.section === 12 && same(out, ['0 undefined']), `lecture 12: the target is collected (its WeakRef is empty) and the registry nobody holds does not call ${JSON.stringify(out)}`);
    const unkept = swap(gcjs.code, '    keep.add(registry);' + LF, '');
    const main = 'import { nextGC } from "./gc.js";' + LF + 'await nextGC();' + LF + 'console.log("пришло");';
    const kept = await runFolder(b, page(main), { lines: 1, gc: true, ms: 5000 });
    const lost = unkept ? await runFolder(b, { ...page(main), 'gc.js': unkept }, { lines: 1, gc: true, ms: 3000 }) : ['(no code)'];
    check(same(kept, ['пришло']) && same(lost, []) && lectureText.includes('Сам реестр лежит в keep — зачем, станет видно в разделе 12'),
      `lecture 3: nextGC() comes after a collection ${JSON.stringify(kept)}; without keep its registry is garbage too and the promise never comes in 3 s of collections ${JSON.stringify(lost)}`);
  }

  // section 7: [[KeptAlive]] seen without gc.js — the job's own allocations collect inside it; the target deref()-ed in
  // the job stays, the other goes; without that first deref both go
  {
    const FIRST = 'console.log("начало задания:", ra.deref()?.name);';
    const kept = blocks.find((x) => x.code.includes(FIRST));
    const control = kept ? swap(kept.code, FIRST, 'console.log("начало задания");') : null;
    const runs = [], controls = [];
    for (let k = 0; kept && control && k < 3; k++) {
      runs.push((await runFolder(b, page(kept.code), { lines: 2 })).join(' / '));
      controls.push((await runFolder(b, page(control), { lines: 2 })).join(' / '));
    }
    keptInJob = kept?.section === 7 && !usesGc(kept.code) && runs.length === 3 && runs.every((r) => r === 'начало задания: a / конец задания: a undefined')
      && controls.every((r) => r === 'начало задания / конец задания: undefined undefined');
    check(keptInJob && !lectureText.includes('Увидеть это опытом нельзя') && lectureText.includes('Уберите первый deref — и пропадут обе.'),
      `lecture 7: no gc.js, a million objects in the job — 3 times ${JSON.stringify([...new Set(runs)])}; without the first deref ${JSON.stringify([...new Set(controls)])}`);
  }

  // the notes: every console.log line writes its output in its comment
  {
    const commented = (code) => code.split(LF).filter((l) => l.includes('console.log(') && l.includes('//'))
      .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
    check(notesBlocks.length === 3 && notesBlocks.every((x) => x.js && !x.file) && notesBlocks.filter((x) => usesGc(x.code)).length === 2
      && notesText.includes('Блоки с nextGC() запускайте в папке дня 22 рядом с gc.js лекции (раздел 3) и нажимайте «Collect garbage» (DevTools → Memory).'),
    `student: 3 js blocks without a file name, 2 of them import nextGC; the notes send them to the folder of day 22 with gc.js (${notesBlocks.length})`);
    for (const [i, blk] of notesBlocks.entries()) {
      const want = commented(blk.code);
      const out = await runFolder(b, page(blk.code), { lines: want.length, gc: usesGc(blk.code) });
      if (!quiet) { console.log(`\n--- student #${i}${usesGc(blk.code) ? ' (gc)' : ''}: ${blk.code.split(LF).find((l) => !l.startsWith('import ')).slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
      check(want.length > 0 && same(out, want), `student #${i}: output = comments ${JSON.stringify(out)}`);
    }
  }

  // the notes, homework 1: what survives a collection in Chrome — а) only a WeakRef, б) a closure, в) a WeakMap key its
  // value points to, г) a target whose held value points to it; д) a target deref()-ed in the job (the experiment of
  // section 7 above)
  {
    const out = await runFolder(b, page(`import { nextGC } from "./gc.js";
let only = { n: "а" };
const ra = new WeakRef(only);
only = null;
function makeReader() {
  const hidden = { n: "б" };
  return { read: () => hidden.n, ref: new WeakRef(hidden) };
}
const { read, ref: rb } = makeReader();
const map = new WeakMap();
let key = { n: "в" };
map.set(key, { key });
const rc = new WeakRef(key);
key = null;
const registry = new FinalizationRegistry(() => {});
let target = { n: "г" };
registry.register(target, { card: target });
const rd = new WeakRef(target);
target = null;
await nextGC();
console.log([ra, rb, rc, rd].map((r) => r.deref()?.n ?? "убран").join(" "), read());`), { lines: 1, gc: true });
    check(same(out, ['убран б убран г б']) && keptInJob, `student homework 1: а) убран, б) жив, в) убран, г) жив ${JSON.stringify(out)}; д) жив до конца задания — the experiment of section 7 (${keptInJob})`);
  }

  // the notes, homework 2: get of the MDN cache that reads deref() first never returns undefined after a collection
  {
    const code = cacheBlock.code;
    const fn = code.slice(code.indexOf('function cached(getter) {'), code.indexOf(`${LF}}${LF}`, code.indexOf('function cached(getter) {')) + 2);
    const fixed = swap(fn, `    if (cache.has(key)) {${LF}      return cache.get(key).deref();${LF}    }`, `    const hit = cache.get(key)?.deref();${LF}    if (hit !== undefined) return hit;`);
    const main = (cached) => `import { nextGC } from "./gc.js";
${cached}
let loads = 0;
const get = cached((word) => { loads++; return { word }; });
let card = await get("kitap");
console.log((await get("kitap")) === card, loads);
card = null;
await nextGC();
console.log((await get("kitap"))?.word, loads);`;
    const runs = [];
    for (let k = 0; fixed && k < 5; k++) runs.push((await runFolder(b, page(main(fixed)), { lines: 2, gc: true })).join(' / '));
    check(runs.length === 5 && runs.every((r) => r === 'true 1 / kitap 2'), `student homework 2: get that takes deref() first — after nextGC() it loads «kitap» again, 5 times ${JSON.stringify([...new Set(runs)])}`);
  }

  // the notes, homework 3: what each line throws (the steps — in the list of steps below)
  {
    const out = await runFolder(b, page(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name + ": " + e.message; } };
const registry = new FinalizationRegistry(() => {});
const card = {};
console.log([() => new WeakRef(Symbol.for("k")), () => FinalizationRegistry(() => {}), () => registry.register(card, card), () => registry.register(card, "k", 5), () => registry.unregister("k")].map(run).join(" | "));`), { lines: 1 });
    check(same(out, ["TypeError: WeakRef: invalid target | TypeError: Constructor FinalizationRegistry requires 'new' | TypeError: FinalizationRegistry.prototype.register: target and holdings must not be same | TypeError: Invalid unregisterToken ('5') | TypeError: Invalid unregisterToken ('k')"])
      && notesText.includes('registry.register(card, "k", 5); registry.unregister("k")?'),
    `student homework 3: five TypeErrors — 26.1.1.1 step 2, 26.2.1.1 step 1, 26.2.3.2 steps 4 and 5.a, 26.2.3.3 step 3 ${JSON.stringify(out)}`);
  }

  // the tasks: the warm-ups and task 9 print what EXPECT says, every line of an example holds with the reference solution
  {
    check(taskBlocks.length === 9 && taskBlocks.filter((x) => x.example).length === 5 && taskBlocks.every((x) => !x.file && !x.box)
      && taskBlocks.filter((x) => usesGc(x.code)).length === 6
      && tasksText.includes('Код пишем в папке дня 22 рядом с gc.js лекции (раздел 3): блок с nextGC() — это main.js, после запуска нажмите «Collect garbage».'),
    `tasks: 9 js blocks — 5 examples, 4 to predict, 6 of them import nextGC (1, 4–7, 9); no files, no result-box; the folder of day 22 with gc.js (${taskBlocks.length}, ${taskBlocks.filter((x) => usesGc(x.code)).length})`);
    for (const [i, blk] of taskBlocks.entries()) {
      const code = blk.example ? checkable(blk.code) : blk.code;
      const want = blk.example ? null : EXPECT[`tasks #${i}`];
      const out = await runFolder(b, page(code), { lines: want ? want.length : (code.match(/await __check\(/g) || []).length, gc: usesGc(blk.code) });
      if (!quiet) { console.log(`\n--- tasks #${i}${blk.example ? ' (example)' : ''}${usesGc(blk.code) ? ' (gc)' : ''}: ${blk.code.split(LF).find((l) => !l.startsWith('import ')).slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
      if (blk.example) {
        for (const l of out.filter((x) => x.startsWith('EX-'))) check(l.startsWith('EX-OK'), `tasks #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(out.length > 0 && out.every((l) => l.startsWith('EX-')) && out.length === (code.match(/await __check\(/g) || []).length, `tasks #${i} example runs with the reference solution: ${out.length} lines`);
      } else check(!!want && same(out, want), `tasks #${i} ${blk.code.split(LF).find((l) => !l.startsWith('import ')).slice(0, 60)}: ${JSON.stringify(out)}`);
    }
  }

  // the tasks: the experiments of the criteria, with the reference solutions
  {
    const G = 'import { nextGC } from "./gc.js";' + LF;
    const t4 = await runFolder(b, page(`${G}${SOLUTIONS.makeCache}
let loads = 0;
const cache = makeCache((word) => { loads++; return { word }; });
let card = cache.get("kitap");
console.log(cache.get("kitap") === card, loads, cache.size);
card = null;
await nextGC();
console.log(cache.get("kitap").word, loads, cache.size);`), { lines: 2, gc: true });
    check(same(t4, ['true 1 1', 'kitap 2 1']) && !SOLUTIONS.makeCache.includes('.has('), `task 4: with keep = 0 the cache is the one of section 15 — after a collection one more load, one entry ${JSON.stringify(t4)}; no has()`);
    const many = (loop) => `${G}${SOLUTIONS.makeTracker}
const tracker = makeTracker();
let cards = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
${loop}
const kept = cards.slice(0, 10);
cards = null;
await nextGC();
await new Promise((r) => setTimeout(r, 100));
console.log(tracker.freed().length, tracker.alive(), kept.length);`;
    const t5a = await runFolder(b, page(many('cards.forEach((card) => tracker.track(card, card.id));')), { lines: 1, gc: true });
    const t5b = await runFolder(b, page(many('for (const card of cards) tracker.track(card, card.id);')), { lines: 1, gc: true });
    check(same(t5a, ['990 10 10']) && same(t5b, ['989 11 10']), `task 5: 1000 cards, 10 kept — forEach ${JSON.stringify(t5a)}, for…of at the top level ${JSON.stringify(t5b)} (one more alive, section 16)`);
    const holding = swap(SOLUTIONS.openConnection, 'leaks.register(conn, { name, log }, conn);', 'leaks.register(conn, { name, log, conn }, conn);');
    const t6 = holding ? await runFolder(b, page(`${G}${holding}
const log = [];
let second = openConnection("galam", log);
second = null;
await nextGC();
await new Promise((r) => setTimeout(r, 100));
console.log(log.join() || "пусто");`), { lines: 1, gc: true }) : [];
    check(same(t6, ['пусто']), `task 6: a held value that points at the connection keeps it — no «утечка» after a collection ${JSON.stringify(t6)}`);
    const t7 = await runFolder(b, page(`${G}${SOLUTIONS.makeEmitter}
const emitter = makeEmitter();
const got = [];
const a = { handle: (m) => got.push("a:" + m) };
emitter.on(a);
emitter.on({ handle: (m) => got.push("c:" + m) });
console.log(emitter.emit("salam"));
await nextGC();
console.log(emitter.emit("sag bol"), got.join(), emitter.size);`), { lines: 2, gc: true });
    check(same(t7, ['2', '1 a:salam,c:salam,a:sag bol 1']), `task 7: a listener made right in the call of on() is gone after a collection ${JSON.stringify(t7)}`);
    const t8 = await runFolder(b, page(`${G}${SOLUTIONS.cachedOnce}
let loads = 0;
const get = cachedOnce(async (word) => { loads++; await new Promise((r) => setTimeout(r, 10)); return { word }; });
let [x, y] = await Promise.all([get("kitap"), get("kitap")]);
x = null;
y = null;
await nextGC();
const [p, q] = await Promise.all([get("kitap"), get("kitap")]);
console.log(p === q, loads, p.word);
let fails = 1;
const shaky = cachedOnce(async (word) => { loads++; if (fails-- > 0) throw new Error("сеть"); return { word }; });
const first = await shaky("galam").then(() => "ok", (e) => e.message);
console.log(first, (await shaky("galam")).word, loads);`), { lines: 2, gc: true });
    check(same(t8, ['true 2 kitap', 'сеть galam 4']), `task 8: after a collection two gets at once — one load, one object; a failed load is not kept, the next get loads again ${JSON.stringify(t8)}`);
    const t9 = swap(taskBlocks[8]?.code ?? '', '  if (calls.length === 1) { queueMicrotask(() => calls.push("микрозадача")); throw new Error("сбой"); }', '  if (calls.length === 1) queueMicrotask(() => calls.push("микрозадача"));');
    const t9out = t9 ? await runFolder(b, page(t9), { lines: 1, gc: true }) : [];
    check(same(t9out, ['c,b,a,микрозадача']), `task 9: without throw the three calls are one cleanup job — the microtask after all of them ${JSON.stringify(t9out)}`);
  }

  // the constructors have only prototype (26.1.2, 26.2.2); the cheatsheet runs without output
  {
    const out = await runFolder(b, page('console.log(Object.getOwnPropertyNames(WeakRef).join(), Object.getOwnPropertyNames(FinalizationRegistry).join(), WeakRef.prototype[Symbol.toStringTag], FinalizationRegistry.prototype[Symbol.toStringTag]);'), { lines: 1 });
    check(same(out, ['length,name,prototype length,name,prototype WeakRef FinalizationRegistry']), `26.1.2, 26.2.2: the constructors have only prototype (besides length and name) ${JSON.stringify(out)}`);
    const cheat = js.find((x) => x.cheat);
    const out2 = await runFolder(b, page(cheat.code));
    check(out2.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out2)}`);
  }

  // section 3: the button of the Memory panel in DevTools of this Chrome — its title and its icon
  let devtoolsLabel = null;
  {
    const get = async (p) => { try { const r = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/devtools/${p}`); return r.ok ? await r.text() : ''; } catch { return ''; } };
    const strings = JSON.parse((await get('core/i18n/locales/en-US.json')) || '{}');
    const profiler = await get('panels/profiler/profiler.js');
    const profilerMeta = await get('panels/profiler/profiler-meta.js');
    const perfMeta = await get('ui/legacy/components/perf_ui/perf_ui-meta.js');
    const title = strings['ui/legacy/components/perf_ui/perf_ui-meta.ts | collectGarbage']?.message;
    const action = (perfMeta.match(/actionId:"components\.collect-garbage"[^}]*/) || [''])[0];
    const ok = title === 'Collect garbage' && profiler.includes('createActionButton("components.collect-garbage")') && /title:\w+\(\w+\.collectGarbage\)/.test(action)
      && /IconClass\.MOP\b/.test(action) && /memory:"Memory"/.test(profilerMeta);
    if (ok) devtoolsLabel = title;
    check(ok && lectureText.includes('DevTools → вкладка Memory → значок метёлки «Collect garbage»') && lectureText.includes('DevTools → Memory → Collect garbage'),
      `lecture 3: DevTools of this Chrome — the Memory panel has the action button components.collect-garbage, title «${title}», icon ${(action.match(/IconClass\.(\w+)/) || [])[1]} (a broom)`);
  }
  await b.close();

  // every English quote of the lecture is in ECMA-262 2026 (9.9–9.13, chapter 26), the MDN pages of the day or DevTools
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  // the notes of a clause by their numbers: { 1: text, 2: text, … }; a single note is number 0
  const notes = (id) => Object.fromEntries([...clause(spec, id).matchAll(/<emu-note>\s*<span class="note">Note( \d+)?<\/span>([\s\S]*?)<\/emu-note>/g)].map((m) => [Number(m[1] || 0), flat(m[2])]));
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  // a comment of a code block that goes on in the next line is one sentence: "has been\n    // added" → "has been added"
  const plain = (md) => md.replace(/\n[ \t]*\/\/ /g, ' ').replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`/g, '').replace(/\*\*/g, '').replace(/\b_([^_]+)_\b/g, '$1').replace(/\s+/g, ' ');
  const PAGES = { memory: 'guide/memory_management', weakref: 'reference/global_objects/weakref', deref: 'reference/global_objects/weakref/deref',
    weakrefCtor: 'reference/global_objects/weakref/weakref', registry: 'reference/global_objects/finalizationregistry',
    registryCtor: 'reference/global_objects/finalizationregistry/finalizationregistry', register: 'reference/global_objects/finalizationregistry/register',
    unregister: 'reference/global_objects/finalizationregistry/unregister' };
  const md = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, mdn(p)]));
  const M = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, plain(v)]));
  {
    const ch9 = spec.slice(spec.indexOf('id="sec-weakref-processing-model"'), spec.indexOf('id="sec-ordinary-and-exotic-objects-behaviours"'));
    const ch26 = spec.slice(spec.indexOf('id="sec-managing-memory"'), spec.indexOf('id="sec-control-abstraction-objects"'));
    const corpus = [flat(ch9), flat(ch26), ...Object.values(M), devtoolsLabel ?? ''].join(' ');
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => m[1].replace(/\s+/g, ' '));
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length >= 30 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in ECMA-262 2026 (9.9–9.13, 26), the 8 MDN pages or DevTools: ${missing.join(' | ') || 'none'}`);
    const nquotes = [...notesText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => m[1].replace(/\s+/g, ' '));
    const nmissing = nquotes.filter((x) => !corpus.includes(x));
    check(nquotes.length >= 6 && nmissing.length === 0 && nquotes.includes('It should only be used for cleanup — and non-critical cleanup') && nquotes.includes('cleared at the same time or before any cleanup callback'),
      `student: ${nquotes.length} English quotes of the notes (MDN on non-critical cleanup and the cleared WeakRef among them); not found: ${nmissing.join(' | ') || 'none'}`);
  }

  // the notes: the steps of their tables are the ones the lecture names (checked in the list of steps below); homework 4
  {
    check(['26.1.1.1: 1, 2, 4, 5', '26.1.4.1: 2, 3', '9.13: 1, 2', '26.2.1.1: 1, 2, 7', '26.2.3.2: 3–7', '26.2.3.3: 3, 5, 6', '9.9.4.1, 9.12'].every((s) => notesText.includes(s))
      && notesText.includes('в лекции выжила карточка № 999 у for…of на верхнем уровне модуля'),
    'student: the tables name the steps of the lecture — 26.1.1.1: 1, 2, 4, 5; 26.1.4.1: 2, 3; 9.13: 1, 2; 26.2.1.1: 1, 2, 7; 26.2.3.2: 3–7; 26.2.3.3: 3, 5, 6; 9.9.4.1, 9.12; card 999 of the lecture');
    check(f('sec-weakref-invariants').includes('does not make any guarantees that any object or symbol will be garbage collected') && (notes('sec-weakref-execution')[1] ?? '').includes('Implementations may omit FinalizationRegistry callbacks for any reason')
      && lectureText.includes('Объект собрали, а вызова не было') && lectureText.includes('try…finally, завтра — using')
      && notesText.includes('(9.9.1 и заметка 1 раздела 9.9.3), и опыт лекции, где его не было'),
    'student homework 4: 9.9.1 — no guarantee, 9.9.3 note 1 — callbacks may be omitted; the lecture: section 12 (no call), section 17 (try…finally, tomorrow using)');
    const notesHtml = builtSite.htmlOfFile(path.join(DAY, 'student.html'));
    const nFooter = notesHtml.slice(notesHtml.indexOf('<div class="sources">'));
    check(['Memory management, WeakRef, FinalizationRegistry', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notesHtml.match(/developer\.mozilla\.org/g) || []).length === 1
      && !/tc39\.es\/ecma262\/2026\/#/.test(notesHtml),
    'student: the footer names MDN Memory management, WeakRef, FinalizationRegistry and ECMA-262 2026; MDN is linked once (the footer); section numbers without links');
  }

  // the tasks: their quotes, the steps they ask for (in the list of steps below), the link, the footer
  {
    const tq = [...tasksText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => m[1].replace(/\s+/g, ' '));
    // «Uncaught Error: сбой» is the console line of task 9 (EXPECT), the others come from MDN and DevTools
    const tmissing = tq.filter((x) => !M.memory.includes(x) && x !== devtoolsLabel && x !== EXPECT['tasks #8'][0]);
    check(tq.length === 3 && tmissing.length === 0 && tq.includes('It should only be used for cleanup — and non-critical cleanup') && tq.includes('Uncaught Error: сбой'),
      `tasks: ${tq.length} English quotes (MDN Memory management, the DevTools button, the console line of task 9) as written there ${tmissing.join(' | ')}`);
    check(['26.2.3.2, шаг 5.b', 'шаг 9.13 (1, 2 или 3)', '(шаг 3.a)', 'по шагу 3.c (знак ?) и шагу 2 раздела 9.9.4.1', '(9.9.2, заметка 5)', '(9.9.3, заметка 1;', '(9.11)', '(9.9.1)'].every((s) => tasksText.includes(s)),
      'tasks: they ask for 26.2.3.2 step 5.b, 9.13 steps 1–3, 9.12 steps 3.a and 3.c, 9.9.4.1 step 2, 9.9.2 note 5, 9.9.3 note 1, 9.11, 9.9.1');
    const tasksHtml = builtSite.htmlOfFile(path.join(DAY, 'tasks.html'));
    const tNamed = [...tasksHtml.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const tAnchors = [...new Set([...tasksHtml.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]))];
    const tFooter = tasksHtml.slice(tasksHtml.indexOf('<div class="sources">'));
    check(tAnchors.every((a) => spec.includes(`id="${a}"`)) && tNamed.length === 1 && tNamed.every(([id, k]) => num(id) === k)
      && ['FinalizationRegistry, WeakRef, Memory management', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => tFooter.includes(s)) && (tasksHtml.match(/developer\.mozilla\.org/g) || []).length === 1,
    'tasks: the tc39.es anchor exists with its number (9.12); the footer names MDN FinalizationRegistry, WeakRef, Memory management and ECMA-262 2026; MDN is linked once');
  }

  // the MDN texts the lecture retells
  {
    check(hasAll(M.memory, ['malloc()', 'free()', 'Allocate the memory you need', 'Use the allocated memory', 'Release the allocated memory', 'is undecidable', 'Reference-counting garbage collection', 'Mark-and-sweep algorithm', 'an object is unreachable', 'It is also not possible to programmatically trigger garbage collection in JavaScript', 'node --expose-gc --inspect index.js'])
      && hasAll(M.weakref, ['normative optional', 'all major engines do expose it by default', 'Avoid where possible', 'due to generational collection', 'may hold references to things which look like they are unreachable (e.g., in closures, or inline caches)', 'until the end of the current JavaScript job'])
      && hasAll(M.registry, ['Avoid where possible', 'If the held value is an object, the registry keeps a strong reference to it', 'the WeakRef\'s target is cleared at the same time or before any cleanup callback associated with the registry is called']),
    'MDN: Memory management — malloc() and free(), the three stages, undecidable, reference counting and mark-and-sweep, no way to trigger GC from code, node --expose-gc; WeakRef — normative optional constructor that all major engines expose, Avoid where possible, the proposal authors, the end of the job; FinalizationRegistry — the strong held value, the WeakRef cleared first');
    const raw = md.memory;
    const codes = [...raw.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).filter((c) => c.startsWith('function cached(getter)'));
    const bare = (c) => c.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\nconst getImage[\s\S]*$/, '').trim();
    const ours = cacheBlock.code.slice(cacheBlock.code.indexOf('function cached(getter) {'), cacheBlock.code.indexOf('\nlet loads')).trim();
    check(codes.length === 2 && codes[0].includes('if (dereferencedValue !== undefined)') && !codes[1].includes('dereferencedValue') && bare(codes[1]) === ours
      && M.memory.includes('the callback may be called after a new object has been added with this key, and that new, alive object gets deleted'),
    'lecture 14: MDN has two cached — the first checks deref() and loads again, the second (ours, without its comments) returns deref() after has(); its registry comment names a new object added with this key');
    check(raw.includes('If `key` is stored as an actual reference, it would create a cyclic reference and make both the key and value ineligible for garbage collection'),
      'lecture 8: MDN — a key stored «as an actual reference» would make a cycle and neither key nor value would be collected');
  }

  // the steps the lecture names
  const steps = [
    ['sec-weak-ref-target', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-weak-ref-target', 'If CanBeHeldWeakly (target) is false, throw a TypeError exception', '2'],
    ['sec-weak-ref-target', 'Perform AddToKeptObjects (target)', '4'],
    ['sec-weak-ref-target', 'Set weakRef.[[WeakRefTarget]] to target', '5'],
    ['sec-weak-ref.prototype.deref', 'Return WeakRefDeref (weakRef)', '3'],
    ['sec-weakrefderef', 'If target is not empty, then', '2'],
    ['sec-weakrefderef', 'Perform AddToKeptObjects (target)', '2.a'],
    ['sec-weakrefderef', 'Return target', '2.b'],
    ['sec-weakrefderef', 'Return undefined', '3'],
    ['sec-finalization-registry-cleanup-callback', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-finalization-registry-cleanup-callback', 'If IsCallable (cleanupCallback) is false, throw a TypeError exception', '2'],
    ['sec-finalization-registry-cleanup-callback', 'Set finalizationRegistry.[[Cells]] to a new empty List', '7'],
    ['sec-finalization-registry.prototype.register', 'If CanBeHeldWeakly (target) is false, throw a TypeError exception', '3'],
    ['sec-finalization-registry.prototype.register', 'If SameValue (target, heldValue) is true, throw a TypeError exception', '4'],
    ['sec-finalization-registry.prototype.register', 'If CanBeHeldWeakly (unregisterToken) is false, then', '5'],
    ['sec-finalization-registry.prototype.register', 'If unregisterToken is not undefined, throw a TypeError exception', '5.a'],
    ['sec-finalization-registry.prototype.register', 'Let cell be the Record', '6'],
    ['sec-finalization-registry.prototype.register', 'Append cell to finalizationRegistry.[[Cells]]', '7'],
    ['sec-finalization-registry.prototype.unregister', 'If CanBeHeldWeakly (unregisterToken) is false, throw a TypeError exception', '3'],
    ['sec-finalization-registry.prototype.unregister', 'Remove cell from finalizationRegistry.[[Cells]]', '5.a.i'],
    ['sec-finalization-registry.prototype.unregister', 'Return removed', '6'],
    ['sec-canbeheldweakly', 'If v is an Object, return true', '1'],
    ['sec-canbeheldweakly', 'If v is a Symbol and KeyForSymbol (v) is undefined, return true', '2'],
    ['sec-cleanup-finalization-registry', 'Remove cell from finalizationRegistry.[[Cells]]', '3.b'],
    ['sec-cleanup-finalization-registry', 'Perform ? HostCallJobCallback (callback, undefined, «cell.[[HeldValue]]»)', '3.c'],
    ['sec-clear-kept-objects', 'Set agentRecord.[[KeptAlive]] to a new empty List', '2'],
    ['sec-addtokeptobjects', 'Append value to agentRecord.[[KeptAlive]]', '2'],
    // the tasks: 2 (5.b), 3 (9.13 step 3), 9 (9.12 3.a, 9.9.4.1 step 2)
    ['sec-finalization-registry.prototype.register', 'Set unregisterToken to empty', '5.b'],
    ['sec-canbeheldweakly', 'Return false', '3'],
    ['sec-cleanup-finalization-registry', 'Choose any such cell', '3.a'],
    ['sec-host-cleanup-finalization-registry', 'If cleanupResult is an abrupt completion, perform any host-defined steps for reporting the error', '2'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture and the tasks name (26.1.1.1 1/2/4/5, 26.1.3.2 3, 26.1.4.1 2/2.a/2.b/3, 26.2.1.1 1/2/7, 26.2.3.2 3–7/5.b, 26.2.3.3 3/5/6, 9.13 1–3, 9.12 3.a–3.c, 9.9.4.1 2, 9.10 2, 9.11 2): ${wrong.join('; ') || 'all right'}`);
  check(num('sec-weak-ref-target') === '26.1.1.1' && num('sec-weak-ref.prototype.deref') === '26.1.3.2' && num('sec-weakrefderef') === '26.1.4.1' && num('sec-finalization-registry-cleanup-callback') === '26.2.1.1'
    && num('sec-finalization-registry.prototype.register') === '26.2.3.2' && num('sec-finalization-registry.prototype.unregister') === '26.2.3.3' && num('sec-host-cleanup-finalization-registry') === '9.9.4.1'
    && num('sec-clear-kept-objects') === '9.10' && num('sec-addtokeptobjects') === '9.11' && num('sec-cleanup-finalization-registry') === '9.12' && num('sec-canbeheldweakly') === '9.13'
    && spec.includes('id="sec-weak-ref.prototype.constructor" normative-optional=""'),
  'ECMA-262: WeakRef 26.1.1.1, deref 26.1.3.2, WeakRefDeref 26.1.4.1, FinalizationRegistry 26.2.1.1, register 26.2.3.2, unregister 26.2.3.3, HostEnqueueFinalizationRegistryCleanupJob 9.9.4.1, 9.10–9.13; WeakRef.prototype.constructor is marked normative optional');

  // the notes and texts the lecture retells
  {
    const live = notes('sec-liveness'), exec = notes('sec-weakref-execution');
    check(f('sec-weakref-invariants').includes('This specification does not make any guarantees that any object or symbol will be garbage collected')
      && f('sec-liveness').includes("Any element in S is included in any agent 's [[KeptAlive]] List") && f('sec-liveness').includes('that observes the identity of any value in S')
      && live[1]?.includes('which would be circular reasoning') && live[2]?.includes('defined on sets of objects or symbols instead of individual values to account for cycles')
      && live[4]?.includes('observing a strict equality comparison or observing the value being used as key in a Map')
      && hasAll(live[5] ?? '', ['keys in a WeakMap, members of a WeakSet, as well as the [[WeakRefTarget]] and [[UnregisterToken]] fields', 'if a key in a WeakMap is not live, then its corresponding value is not necessarily live either'])
      && hasAll(live[6] ?? '', ['Liveness as defined here is undecidable', 'engines use conservative approximations such as reachability']),
    'ECMA-262 9.9.1 — no guarantees; 9.9.2 — [[KeptAlive]] or an observed identity, note 1 circular reasoning, note 2 sets for cycles, note 4 === and Map keys, note 5 WeakMap keys, WeakSet members, the target and token of a cell, values of dead keys, note 6 undecidable, reachability');
    check(hasAll(f('sec-weakref-execution'), ['may perform the following steps atomically', 'Set ref.[[WeakRefTarget]] to empty', 'Set cell.[[WeakRefTarget]] to empty', 'Optionally, perform HostEnqueueFinalizationRegistryCleanupJob (fg)', 'Set r.[[Key]] to empty', 'Set r.[[Value]] to empty'])
      && exec[1]?.includes('Implementations may omit FinalizationRegistry callbacks for any reason, e.g., if the FinalizationRegistry itself becomes dead')
      && exec[2]?.includes('it empties WeakRefs for all values in S simultaneously')
      && f('sec-host-cleanup-finalization-registry').includes('schedules cleanupJob to be performed at some future time')
      && f('sec-clear-kept-objects').includes('when a synchronous sequence of ECMAScript executions completes')
      && hasAll(notes('sec-canbeheldweakly')[0] ?? '', ['does not have language identity', 'Well-known symbols are likely to never be collected']),
    'ECMA-262 9.9.3 — empty in WeakRefs, cells, WeakMap keys and values at once, the cleanup job optional, note 1 a dead registry, note 2 all WeakRefs of a value together; 9.9.4.1 — at some future time; 9.10 — the end of synchronous work; 9.13 note — Symbol.for and well-known symbols');
    check(f('sec-properties-of-weak-ref-instances').includes('WeakRef instances are ordinary objects that inherit properties from the WeakRef prototype object. WeakRef instances also have a [[WeakRefTarget]] internal slot')
      && f('sec-properties-of-finalization-registry-instances').includes('FinalizationRegistry instances also have [[Cells]] and [[CleanupCallback]] internal slots'),
    'ECMA-262 26.1.5, 26.2.4: ordinary objects with [[WeakRefTarget]]; with [[Cells]] and [[CleanupCallback]]');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p));
  {
    const i01 = pageText('intermediate/day-01/lecture.html');
    const i14 = pageText('intermediate/day-14/lecture.html');
    const i15 = pageText('intermediate/day-15/lecture.html');
    check(i01.includes('Как браузер решает, что можно выбросить из памяти, — тема курса 3') && i01.includes('Области видимости и замыкания')
      && lectureText.includes('На дне 1 курса 2 мы оставили вопрос: «Как браузер решает, что можно выбросить из памяти, — тема курса 3».'),
    'lecture 1, 4: day 1 of course 2 (scopes and closures) left the question «Как браузер решает, что можно выбросить из памяти, — тема курса 3»');
    check(i14.includes('Map и WeakMap') && i14.includes('CanBeHeldWeakly') && i14.includes('Symbol.for') && i15.includes('WeakSet'),
      'lecture 8, 9: day 14 of course 2 is WeakMap with CanBeHeldWeakly and Symbol.for, day 15 — WeakSet');
    const mods = read('tools/plan-modules.mjs');
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    check(mods.includes("['A6', 3, 2, 'Управление ресурсами и памятью']") && plan.includes('| 24 | A6 | WeakRef и FinalizationRegistry: сборка мусора |') && plan.includes('| 23 | A5 |')
      && plan.includes('| 25 | A6 | using, await using и DisposableStack |'),
    'lecture 1, 19: the plan — day 24 is the first day of module A6 «Управление ресурсами и памятью», day 25 is using, await using and DisposableStack');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
  {
    const lecture = read('advanced/day-24/lecture.html');
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine);
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '24').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '24').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 21 && mdnRows.length === 8 && refSpec.length === 21 && refMdn.length === 8 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 24, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '24' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '24' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 4 && fullMdn.length === 5 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 9 rows "подробно" (4 + 5) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const titles = mdRows.filter((c) => c[5] === '3' && c[6] === '24').map((c) => [c[0], c[1]]);
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
    check(['Memory management, WeakRef, FinalizationRegistry и их методы', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 12,
      `links: the footer names the MDN pages and ECMA-262 2026; MDN is linked 12 times — section 1, section 17 twice, 8 rows, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
