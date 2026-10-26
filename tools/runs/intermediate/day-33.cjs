// Course 2, day 33 (the final project, day 1 of 4: idea and plan; the example is "Карточки 2.0"), in Chrome. The project
// is a folder of files written in the lecture, top to bottom. What a block does to the folder is told by its first line:
//   "// name.js"                      the whole file (also data-file="…" — the JSON files and the HTML pages)
//   "// name.js, продолжение"          appended to the file; lines marked "потом удалить" go away
//   "// name.js: импорты"              the leading import lines of the file replaced (or put after its first line)
//   "// name.js: замена строки"        each line replaces the line of the file that starts the same way up to " = "
//   "// name.js: настоящий …" / "настоящие …"   methods or functions of the file replaced by name (stub → real)
//   "// name.js: опечатка"             like "замена строки", but only for the next run
//   "// name.js: заглушка без return"  like "настоящий …", but only for the next run
// storage.js is not a block: section 8 copies it from day 31, so the run takes the block of day 31.
//   "// name.js — …"                   a temporary whole file, only for the next run
//   "// в конец name.js — …"           a temporary tail of the file, only for the next run
//   "// в консоли…"                    typed in the console of the open page (CDP Runtime.evaluate, REPL mode); the
//                                      page stays open between console blocks until a file changes, as with Live Server
// A result-box after a block runs the folder as Live Server would, on http://127.0.0.1:5500/ (.js as text/javascript,
// .json as application/json, a missing file as 404), in a fresh browser context: the page is data-page of the block, or
// index.html, or (before index.html is written) a default page with <script type="module" src="main.js">. Output is the
// console as DevTools shows it: console calls ("Assertion failed: …" for console.assert), uncaught errors and browser
// messages except network ones. A box that starts with "консоль пуста" means no output at all. The finished project is
// the folder after the last block: edge cases, the claims of the text, the js/ folder of section 12, the notes, the
// cheat sheet and the examples of the tasks run on it.
//   node tools/runs/intermediate/day-33.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-33.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'intermediate/day-33');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const ORIGIN = 'http://127.0.0.1:5500';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.type === 'object' && p.subtype === 'null' ? 'null' : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `<array ${a.description} [${(a.preview?.properties ?? []).map(inner).join(', ')}]>`;
  if (a.type === 'object') return `<object ${a.className}>`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// the kind of a block, from its first line
const kindOf = (blk) => {
  if (blk.file) return { op: 'whole', name: blk.file };
  const first = blk.code.split(LF)[0].trim();
  let m;
  if (first.startsWith('// в консоли')) return { op: 'console' };
  if ((m = first.match(/^\/\/ в конец ([\w./-]+) — /))) return { op: 'tail', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+), продолжение$/))) return { op: 'append', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): импорты$/))) return { op: 'imports', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): замена строки$/))) return { op: 'lines', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): опечатка$/))) return { op: 'typo', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): заглушка без return$/))) return { op: 'stub', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): настоящи[йе] /))) return { op: 'real', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+) — /))) return { op: 'variant', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+\.js)$/))) return { op: 'whole', name: m[1] };
  return { op: null };
};
const body = (code) => code.split(LF).slice(1).join(LF);

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // edits of a file
  const replaceLines = (text, lines, label) => {
    let out = text;
    for (const line of lines.split(LF)) {
      const key = line.slice(0, line.indexOf(' = ') + 3);
      const old = out.split(LF).find((l) => l.startsWith(key));
      check(key.length > 3 && old !== undefined, `${label}: a line «${key}» in the file`);
      if (old !== undefined) out = out.replace(old, line);
    }
    return out;
  };
  // a file without imports gets them after its first line (the comment with its name)
  const replaceImports = (text, imports, label) => {
    const lines = text.split(LF);
    const from = lines.findIndex((l) => l.startsWith('import '));
    check(from !== 0 && lines[0].startsWith('// '), `${label}: the file starts with its name`);
    if (from < 0) return [lines[0], ...imports.split(LF), '', ...lines.slice(1)].join(LF);
    let to = from;
    while (to < lines.length && lines[to].startsWith('import ')) to++;
    return [...lines.slice(0, from), ...imports.split(LF), ...lines.slice(to)].join(LF);
  };
  // a chunk is a method (indented) or a top-level function: its first line is found in the file, its end is the next
  // line with the same indent and "}"
  const replaceChunks = (text, code, label) => {
    const lines = code.split(LF);
    const chunks = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      const indent = lines[i].match(/^ */)[0];
      let j = i;
      while (lines[j] !== `${indent}}`) j++;
      chunks.push(lines.slice(i, j + 1));
      i = j;
    }
    let out = text.split(LF);
    for (const chunk of chunks) {
      const start = out.indexOf(chunk[0]);
      const indent = chunk[0].match(/^ */)[0];
      const end = out.indexOf(`${indent}}`, start);
      check(start >= 0 && end > start, `${label}: «${chunk[0].trim()}» found`);
      out = [...out.slice(0, start), ...chunk, ...out.slice(end + 1)];
    }
    return { text: out.join(LF), count: chunks.length };
  };

  // open a folder; returns the page (still open), its console output and the list of requested files
  const open = async (files, start) => {
    const site = { ...files };
    const ctx = await b.newContext(MAIN);
    const requests = [];
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      requests.push(name);
      if (name === '' && !site['index.html']) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: DEFAULT_PAGE });
      if (!(name in site)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html' : 'text/plain';
      return r.fulfill({ contentType: `${type}; charset=utf-8`, body: site[name] });
    });
    const p = await ctx.newPage();
    const out = [];
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => {
      const text = e.args.map(show).join(' ');
      out.push(e.type === 'assert' ? `Assertion failed: ${text}` : text);
    });
    cdp.on('Runtime.exceptionThrown', (e) => {
      const d = e.exceptionDetails;
      const what = d.exception ? (d.exception.description ?? JSON.stringify(d.exception.value)).split(LF)[0] : '';
      out.push(`${d.text} ${what}`.trim());
    });
    cdp.on('Log.entryAdded', (e) => { if (e.entry.level === 'error' && e.entry.source !== 'network') out.push(e.entry.text); });
    await p.goto(`${ORIGIN}/${start ?? (site['index.html'] ? 'index.html' : '')}`);
    await p.waitForTimeout(600);
    const repl = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true });
      if (r.exceptionDetails) out.push(`Uncaught ${(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split(LF)[0]}`);
      if (expression.includes('location.reload()')) {
        await p.waitForLoadState('load');
        await p.waitForTimeout(600);
      }
    };
    return { p, ctx, out, requests, repl, close: () => ctx.close() };
  };
  // what the page shows
  const view = (p) => p.evaluate(() => ({
    card: document.querySelector('#card')?.textContent ?? null,
    counter: document.querySelector('#counter')?.textContent ?? null,
    loading: document.querySelector('#loading') ? !document.querySelector('#loading').hidden : null,
    error: document.querySelector('#error')?.textContent ?? null,
  }));

  const all = {};
  {
    const ctx = await b.newContext(MAIN);
    for (const name of PAGES) {
      const src = await ctx.newPage();
      await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
      all[name] = await src.evaluate(() => ({
        blocks: [...document.querySelectorAll('pre.code')].map((pre) => {
          const next = pre.nextElementSibling;
          return {
            code: pre.textContent,
            file: pre.dataset.file ?? null,
            page: pre.dataset.page ?? null,
            box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
            cheat: !!pre.closest('.cheatsheet'),
          };
        }),
        tables: [...document.querySelectorAll('.container > table')].map((t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim()))),
        text: document.querySelector('.container').innerText,
      }));
      await src.close();
    }
    await ctx.close();
  }

  // storage.js is copied from day 31 without changes (section 8 says so); it is in the folder from the start
  let storage31;
  {
    const ctx = await b.newContext(MAIN);
    const p31 = await ctx.newPage();
    await p31.goto('file:///' + path.join(ROOT, 'intermediate/day-31/lecture.html').replace(/\\/g, '/'));
    const st = await p31.evaluate(() => [...document.querySelectorAll('pre.code')].map((x) => x.textContent).filter((c) => c.startsWith('// storage.js')));
    await ctx.close();
    check(st.length === 1, 'storage.js: one block of day 31');
    storage31 = st[0];
  }
  check(all.lecture.text.includes('storage.js дня 31 — копируем его в папку без изменений'), 'section 8: storage.js of day 31, copied without changes');

  // the lecture: one folder, a run at every result-box
  const site = { 'storage.js': storage31 };
  let version = 0;            // changes of the folder: the console page is reopened after one
  let overlay = {};           // temporary files of the next run
  let consolePage = null, consoleVersion = -1;
  const used = new Set();
  let pending = [];
  const views = [];
  const L = all.lecture.blocks;
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  for (const [i, blk] of L.entries()) {
    if (blk.cheat) continue;
    const kind = kindOf(blk);
    const label = `lecture #${i} (${blk.code.split(LF)[0]})`;
    check(kind.op !== null, `${label}: the block says what it does`);
    if (kind.op === null) continue;
    if (kind.name && kind.name.startsWith('js/')) continue;   // section 12, checked below
    const put = (name, text) => { site[name] = text; version++; };
    if (kind.op === 'whole') {
      put(kind.name, blk.code);
      // section 7: data-bad is a copy of data with two files changed
      if (kind.name.startsWith('data-bad/') && !('data-bad/school.json' in site)) {
        put('data-bad/school.json', site['data/school.json']);
        put('data-bad/home.json', site['data/home.json']);
      }
    } else if (kind.op === 'append') {
      const kept = site[kind.name].split(LF).filter((l) => !l.includes('потом удалить')).join(LF);
      put(kind.name, `${kept}${LF}${LF}${body(blk.code)}`);
    } else if (kind.op === 'imports') put(kind.name, replaceImports(site[kind.name], body(blk.code), label));
    else if (kind.op === 'lines') put(kind.name, replaceLines(site[kind.name], body(blk.code), label));
    else if (kind.op === 'real') put(kind.name, replaceChunks(site[kind.name], body(blk.code), label).text);
    else if (kind.op === 'typo') overlay[kind.name] = replaceLines(site[kind.name], body(blk.code), label);
    else if (kind.op === 'stub') overlay[kind.name] = replaceChunks(site[kind.name], body(blk.code), label).text;
    else if (kind.op === 'variant') overlay[kind.name] = blk.code;
    else if (kind.op === 'tail') overlay[kind.name] = `${site[kind.name]}${LF}${blk.code}`;
    pending.push(i);
    let out = null;
    if (kind.op === 'console') {
      if (!consolePage || consoleVersion !== version) {
        if (consolePage) await consolePage.close();
        consolePage = await open(site);
        consolePage.out.length = 0;
        consoleVersion = version;
      }
      await consolePage.repl(blk.code);
      if (blk.box) out = consolePage.out.splice(0);
    } else if (blk.box) {
      const page = await open({ ...site, ...overlay }, blk.page ?? undefined);
      if (!blk.page && site['index.html']) views.push({ i, box: blk.box, view: await view(page.p) });
      await page.close();
      out = page.out;
      overlay = {};
    }
    if (out) {
      if (!quiet) {
        console.log(`\n--- ${label}: ${Object.keys(site).join(', ')}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      const silent = blk.box[0].startsWith('консоль пуста');
      check(!out.some((l) => l.includes('<object') || l.includes('<array')), `${label}: no object printed`);
      check(silent ? out.length === 0 : same(out, blk.box), `${label}: result-box = output (${out.length} lines)${(silent ? out.length === 0 : same(out, blk.box)) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      for (const k of pending) used.add(k);
      pending = [];
    }
  }
  if (consolePage) await consolePage.close();
  for (const k of pending) used.add(k);
  const APP = { ...site };
  check(Object.keys(overlay).length === 0, 'no temporary file is left without a run');

  // what the walk saw on index.html
  const viewAt = (start) => views.find((v) => v.box[0].startsWith(start))?.view;
  check(same(viewAt('консоль пуста — каркас'), { card: '', counter: '', loading: true, error: '' }), `section 10: the skeleton — «Загрузка…» stays: ${JSON.stringify(viewAt('консоль пуста — каркас'))}`);
  check(same(viewAt('Uncaught SyntaxError'), { card: '', counter: '', loading: true, error: '' }), `section 10: no export — nothing runs, «Загрузка…» stays: ${JSON.stringify(viewAt('Uncaught SyntaxError'))}`);

  // the finished project
  const files = Object.keys(APP).toSorted();
  check(same(files, ['card.js', 'data-bad/decks.json', 'data-bad/food.json', 'data-bad/home.json', 'data-bad/school.json', 'data/decks.json', 'data/food.json', 'data/home.json', 'data/school.json', 'deck.js', 'errors.js', 'index.html', 'load.js', 'main.js', 'storage.js', 'test.html', 'tests.js']), `the finished project: ${files.join(', ')}`);
  for (const name of files.filter((f) => f.endsWith('.json'))) {
    let ok = true;
    try { JSON.parse(APP[name]); } catch { ok = false; }
    check(ok, `${name} is valid JSON`);
  }
  const main = APP['main.js'];
  check(!main.includes('потом удалить') && main.split(LF).filter((l) => l.startsWith('import ')).length === 3 && main.endsWith('await openDeck();') && !main.includes('// день 33, раздел 12'), 'main.js: three imports, no temporary line, no stub of day 33, ends with await openDeck()');
  check(!APP['deck.js'].includes('return [];') && APP['deck.js'].includes('// день 34'), 'deck.js: due is real, know is a stub for day 34');
  check(APP['tests.js'].includes('const DIR = "./data";') && !APP['tests.js'].includes('twins') && !APP['tests.js'].includes('для глаз') && APP['tests.js'].split(LF).slice(1, 3).every((l) => l.startsWith('import ')), 'tests.js: imports on top, DIR is ./data again, no temporary lines');
  {
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && same(v, { card: 'book', counter: 'На сегодня: 3 из 3', loading: false, error: '' }), `the project loads without a word in the console: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
    const tests = await open(APP, 'test.html');
    check(same(tests.out, ['проверки закончены']), `the page of checks: ${JSON.stringify(tests.out)}`);
    await tests.close();
  }
  const edge = async (files, want, label, act) => {
    const page = await open(files);
    if (act) await act(page);
    const v = await view(page.p);
    const ok = want(v, page);
    check(ok, `${label}: ${JSON.stringify(v)} ${JSON.stringify(page.out)} ${ok ? '' : JSON.stringify(page.requests)}`);
    await page.close();
  };
  const patch = (files, name, from, to) => {
    check(files[name].includes(from), `patch ${name}: «${from.slice(0, 40)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };
  const lec = all.lecture.text;
  // row 2 of the table: a renamed file — the name of the deck and the cause
  {
    const f = { ...APP, 'data/schol.json': APP['data/school.json'] };
    delete f['data/school.json'];
    await edge(f, (v, page) => v.error === `Не удалось загрузить колоду «школа»: Failed to fetch dynamically imported module: ${ORIGIN}/data/school.json` && !v.loading && v.card === '' && page.out.length === 0, 'edge: school.json renamed — the deck and the cause, «Загрузка…» gone');
  }
  // section 12: every failure of loadDeck is a CardsError — no file, bad JSON, the guards of Card and Deck
  await edge(patch(APP, 'data/school.json', '"translation": "учитель"', '"translaton": "учитель"'), (v) => v.error === 'Не удалось загрузить колоду «школа»: у карточки 2 нет слова или перевода', 'edge: a typo in a field — the guard of Card');
  await edge(patch(APP, 'data/school.json', '"id": 3, "word": "lesson"', '"id": 2, "word": "lesson"'), (v) => v.error === 'Не удалось загрузить колоду «школа»: номер 2 встречается дважды', 'edge: a repeated number in one file — the guard of Deck');
  await edge(patch(APP, 'data/school.json', '"урок" }\n]', '"урок" },\n]'), (v) => v.error.startsWith('Не удалось загрузить колоду «школа»: ') && v.error.length > 40, 'edge: bad JSON — a CardsError too');
  await edge(patch(APP, 'data/school.json', '"id": 3, "word": "lesson"', '"id": "3", "word": "lesson"'), (v) => v.error === 'Не удалось загрузить колоду «школа»: у карточки «lesson» нет номера', 'edge: a number as a string — Number.isInteger');
  // section 12: a deck already open is not loaded again
  {
    const page = await open(patch(APP, 'main.js', 'await openDeck();', 'await openDeck();\nawait openDeck();'));
    check(page.requests.filter((r) => r === 'data/school.json').length === 1, `section 12: openDeck twice — school.json requested once: ${JSON.stringify(page.requests)}`);
    await page.close();
  }
  // section 7: the symptoms of data-bad without the guards (know is the rule of day 34: step * 2 days, step doubles)
  {
    const know = '  know(id, today) {\n    const step = this.#progress.get(id)?.step ?? 1;\n    this.#progress.set(id, { next: today.add({ days: step * 2 }), step: step * 2 });\n  }';
    const deck34 = replaceChunks(APP['deck.js'], know, 'day 34 know').text;
    const noGuard = APP['card.js'].split(LF).filter((l) => !l.includes('throw new CardsError')).join(LF);
    const probe = 'import { loadDeck } from "./load.js";\nconst today = Temporal.PlainDate.from("2026-10-26");\nconst progress = new Map();\nconst school = await loadDeck({ id: "school", name: "школа" }, progress);\nconst food = await loadDeck({ id: "food", name: "еда" }, progress);\nconsole.log(food.due(today).map((c) => c.word).join());\nschool.know(3, today);\nconsole.log(food.due(today).map((c) => c.word).join());\nconst apple = food.due(today).find((c) => c.word === "apple");\nconst div = document.createElement("div");\ndiv.textContent = apple.translation;\nconsole.log(String(apple.translation), JSON.stringify(div.textContent));\nfor (let i = 0; i < 3; i++) school.know(1, today);\nconsole.log(progress.get(1).next.toString(), progress.get(1).step);';
    const page = await open({ ...APP, 'deck.js': deck34, 'card.js': noGuard, 'data/food.json': APP['data-bad/food.json'], 'index.html': undefined, 'main.js': probe });
    check(same(page.out, ['bread,water,apple', 'bread,apple', 'undefined ""', '2026-11-03 8']) && lec.includes('«Знаю» у lesson в колоде «школа» отложит и') && lec.includes('через 2 дня, потом 4, потом 8'), `section 7 and row 4: «Знаю» at lesson hides water; no translation — an empty card; 2, 4, 8 days: ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // section 12: the modules moved into js/
  {
    const blk = L.find((x) => x.code.startsWith('// js/load.js'));
    const line = blk.code.split(LF)[1];
    check(APP['load.js'].includes(line), 'section 12: the line of js/load.js is the line of load.js');
    const J = {};
    for (const [k, v] of Object.entries(APP)) J[k.endsWith('.js') && !k.startsWith('data') ? `js/${k}` : k] = v;
    J['index.html'] = APP['index.html'].replace('src="main.js"', 'src="js/main.js"');
    J['js/main.js'] = APP['main.js'].replace('"./data/decks.json"', '"../data/decks.json"');
    const said = lec.match(/Страница пишет: (Не удалось[^\n]*?school\.json)\./);
    await edge(J, (v) => said && v.error === said[1].replace(/\s+/g, ' ') && v.error.endsWith('/js/data/school.json'), 'section 12: js/load.js looks in js/data/ — the text says so');
    await edge({ ...J, 'js/main.js': APP['main.js'] }, (v, page) => v.loading && v.error === '' && page.out.length === 0, 'section 12: main.js not fixed either — the page does not start at all');
    await edge({ ...J, 'js/load.js': APP['load.js'].replace('`./data/', '`../data/') }, (v) => v.card === 'book' && v.error === '', 'section 12: ../data/ — the cure');
    const fetched = await open({ 'index.html': '<script type="module" src="js/x.js"></script>', 'js/x.js': 'const r = await fetch("data/school.json");\nconsole.log(r.status, r.url);', 'data/school.json': APP['data/school.json'] });
    check(same(fetched.out, [`200 ${ORIGIN}/data/school.json`]), `section 12: fetch from js/x.js is relative to the page: ${JSON.stringify(fetched.out)}`);
    await fetched.close();
  }
  // section 7: Number.isInteger lets neither undefined nor "6" through
  {
    const out = await (async () => {
      const page = await open({ ...APP, 'index.html': undefined, 'main.js': 'import { Card } from "./card.js";\nfor (const raw of [{ word: "apple", translation: "яблоко" }, { id: "6", word: "apple", translation: "яблоко" }, { id: 6, word: "apple", translation: "" }]) {\n  try {\n    new Card(raw);\n  } catch (e) {\n    console.log(e.name, e.message);\n  }\n}' });
      await page.close();
      return page.out;
    })();
    check(same(out, ['CardsError у карточки «apple» нет номера', 'CardsError у карточки «apple» нет номера', 'CardsError у карточки 6 нет слова или перевода']), `section 7: the guards of Card: ${JSON.stringify(out)}`);
  }
  // section 14: 380 minutes against 180
  check((380 / 180).toFixed(1) === '2.1' && lec.includes('в 2,1 раза больше 180 минут'), 'section 14: 380 is 2,1 times 180');
  // section 1: the table of day 36 Essentials and where course 2 tried each row on «Карточки»
  {
    const ctx = await b.newContext(MAIN);
    const e36 = await ctx.newPage();
    await e36.goto('file:///' + path.join(ROOT, 'essentials/day-36/lecture.html').replace(/\\/g, '/'));
    const rows36 = await e36.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Чего в «Карточках» нет'));
      let t = h.nextElementSibling;
      while (t.tagName !== 'TABLE') t = t.nextElementSibling;
      return [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].slice(0, 2).map((c) => c.innerText.trim()));
    });
    const ours = all.lecture.tables.find((t) => t.length === 5 && t[0][0] === 'быстро находить слово по номеру');
    check(ours && same(ours.map((r) => r.slice(0, 2)), rows36), 'section 1: the rows of day 36 Essentials word for word');
    for (const [, , where] of ours ?? []) {
      const m = where.match(/^день (\d+), (.+)$/);
      const page = await ctx.newPage();
      await page.goto('file:///' + path.join(ROOT, `intermediate/day-${m[1].padStart(2, '0')}/lecture.html`).replace(/\\/g, '/'));
      const h2 = await page.evaluate(() => [...document.querySelectorAll('h2')].map((x) => x.textContent).filter((x) => x.includes('Карточки')));
      await page.close();
      const want = m[2].replace(/^«(.*)»$/, '$1');
      check(h2.some((x) => x.includes(want)), `section 1: day ${m[1]} has «Карточки» with «${want}»`);
    }
    const e33 = await ctx.newPage();
    await e33.goto('file:///' + path.join(ROOT, 'essentials/day-33/lecture.html').replace(/\\/g, '/'));
    const e33code = await e33.evaluate(() => [...document.querySelectorAll('pre.code')].map((x) => x.textContent).join('\n'));
    check(e33code.includes('[34, 35].map(') && e33code.includes('function checkData()') && lec.includes('[34, 35].map(…)'), 'section 13: [34, 35].map of day 33 Essentials, checkData of section 7');
    await ctx.close();
  }

  // the notes and the cheat sheet: every line of code, without its trailing comment, is a line of the lecture
  const lectureLines = new Set(L.filter((x) => !x.cheat).flatMap((x) => x.code.split(LF)).map((l) => l.replace(/\s+\/\/ .*$/, '').trim()));
  const fromLecture = (blk, where) => {
    const lines = blk.code.split(LF).map((l) => l.replace(/\s+\/\/ .*$/, '').trim()).filter((l) => l && !l.startsWith('//'));
    const missing = lines.filter((l) => !lectureLines.has(l));
    check(missing.length === 0, `${where}: every line is from the lecture (${blk.code.split(LF)[0].slice(0, 40)})${missing.length ? ` ${JSON.stringify(missing)}` : ''}`);
  };
  for (const blk of all.student.blocks) fromLecture(blk, 'notes');
  for (const blk of L.filter((x) => x.cheat)) fromLecture(blk, 'cheat sheet');

  // tasks: the examples of tasks 4 and 8
  const T = all.tasks.blocks;
  check(T.length === 2, `tasks: two examples (${T.length})`);
  {
    const items = JSON.stringify([1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `x${id}`, category: id <= 4 ? 'книги' : 'тетради' })));
    const good = await open({ 'test.html': APP['test.html'], 'tests.js': T[0].code, 'data/items.json': items }, 'test.html');
    check(same(good.out, ['объектов: 6', 'книги: 4, тетради: 2']), `task 4: the example on six objects: ${JSON.stringify(good.out)}`);
    await good.close();
    const broken = await open({ 'test.html': APP['test.html'], 'tests.js': T[0].code, 'data/items.json': items.replace('"id":6', '"id":5') }, 'test.html');
    check(same(broken.out, ['объектов: 6', 'Assertion failed: номера повторяются', 'книги: 4, тетради: 2']), `task 4: a repeated number is caught: ${JSON.stringify(broken.out)}`);
    await broken.close();
  }
  {
    const page = await open({ 'index.html': '<p>x</p>' });
    await page.repl(T[1].code);
    check(same(page.out, ['34: 20, 35: 20']), `task 8: the example: ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // every block of the lecture is used: by a run, by the finished project or by a check above
  for (const [i, blk] of L.entries()) if (!blk.cheat && !blk.code.startsWith('// js/')) check(used.has(i), `lecture #${i} (${blk.code.split(LF)[0]}) is used`);

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
