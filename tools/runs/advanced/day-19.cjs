// Course 3, day 19 (project day: an observable store on Proxy and Reflect), in Chrome. Two kinds of blocks in the lecture:
// a block that starts with "use strict" is an experiment — it runs as the only <script> in the <body> of a clean page and
// its output must equal the result-box after it (as in the other days of course 3); every other block is a piece of the
// project — store.js ("// store.js — наблюдаемое хранилище"), index.html (data-file), the parts of main.js in sections
// 11–12 and the whole main.js of section 15 (the parts must give the whole line by line), the temporary main.js of
// section 9 (runs against its result-box), the console checks of sections 11–12 (run on the board page; the output must
// equal the comment under the console.log line) and the fragment of section 13 (put into a copy of store.js). The project
// runs as Live Server would, on http://127.0.0.1:5500/, each time in a fresh browser context (a clean localStorage).
// On the finished project: the scenario table of section 15 step by step (typing, Enter, clicks, a reload, the console),
// one redraw per action (a MutationObserver on #summary), the edge cases, the bugs of sections 13–14 on patched copies,
// the two experiments; the experiments the lecture only tells about (two notifications from set + defineProperty, push
// and splice through the store, the layers of wrappers without the unwrapping, the MDN example with _secret, a Map in the
// store, a trap without return in sloppy code); what it says about the text of ECMA-262 2026 (every step number it gives)
// is checked against tools/.cache/ecma262-2026.html; the MDN pages it quotes are in tools/.cache/mdn-content.git and say
// what it quotes; the days it points to say what it says; every tc39.es anchor exists and every link whose text starts
// with a number names that section; the cheatsheet runs without an error.
// The notes: the map of the program is comments only and names what the files have; the table «Куда приходит запись»
// gives the number of notifications Chrome gives; console.count of the checklist grows by one a click; homework 2 —
// «✕» at the second of five; the MDN quote, the anchors and the footer.
//   node tools/runs/advanced/day-19.cjs            every run: code head, output; checks below
//   node tools/runs/advanced/day-19.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-19');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const ORIGIN = 'http://127.0.0.1:5500';
const LF = String.fromCharCode(10);
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.type === 'object' && p.subtype !== 'array' ? '{…}' : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1');
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
const hasAll = (text, words) => words.every((w) => text.includes(w));
// MDN markdown as text: {{jsxref("X")}} macros, links and backticks dropped
const plainMd = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
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
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // run code as the only <script> in the <body> of a clean page; console lines and uncaught errors in order
  const runScript = async (code) => {
    const ctx = await b.newContext(MAIN);
    const html = `<!doctype html><meta charset="utf-8"><title>run</title><body><script>${code}\n</script></body>`;
    await ctx.route('http://day.test/run.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const out = [];
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => { const d = e.exceptionDetails; out.push(`Uncaught ${(d.exception?.description ?? d.text).split(LF)[0]}`); });
    await cdp.send('Runtime.enable');
    await p.goto('http://day.test/run.html');
    await p.waitForTimeout(150);
    await ctx.close();
    return out;
  };
  // open a folder on 127.0.0.1:5500; the page stays open, out collects the console as DevTools shows it
  const open = async (files) => {
    const page = files['index.html'] ? `<meta charset="utf-8">${LF}${files['index.html']}` : DEFAULT_PAGE;
    const ctx = await b.newContext(MAIN);
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      if (name === 'index.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (!(name in files)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `Cannot GET /${name}` });
      return r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: files[name] });
    });
    const p = await ctx.newPage();
    const out = [];
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => { const d = e.exceptionDetails; out.push(`Uncaught ${(d.exception?.description ?? d.text).split(LF)[0]}`); });
    await p.goto(`${ORIGIN}/index.html`);
    await p.waitForTimeout(400);
    // every redraw writes #summary once
    const watch = () => p.evaluate(() => {
      globalThis.__redraws = 0;
      new MutationObserver(() => globalThis.__redraws++).observe(document.querySelector('#summary'), { childList: true });
    });
    if (files['index.html']) await watch();
    return { p, out, watch, close: () => ctx.close() };
  };
  const run = async (files) => { const page = await open(files); await page.close(); return page.out; };
  // what the board shows: the cards of every column as "title — who"
  const view = (p) => p.evaluate(() => ({
    heading: document.querySelector('#heading').textContent,
    summary: document.querySelector('#summary').textContent,
    error: document.querySelector('#error').textContent,
    todo: [...document.querySelectorAll('[data-status="todo"] li')].map((li) => li.firstChild.textContent.trim()),
    doing: [...document.querySelectorAll('[data-status="doing"] li')].map((li) => li.firstChild.textContent.trim()),
    done: [...document.querySelectorAll('[data-status="done"] li')].map((li) => li.firstChild.textContent.trim()),
    redraws: globalThis.__redraws,
  }));
  const titles = (cards) => cards.map((c) => c.split(' — ')[0]);
  const settle = (p) => p.waitForTimeout(80);
  const addTask = async (p, title, who) => { await p.fill('input[name=title]', title); await p.fill('input[name=who]', who); await p.press('input[name=who]', 'Enter'); await settle(p); };
  const press = async (p, card, label) => { await p.locator('#columns li', { hasText: card }).locator('button', { hasText: label }).click(); await settle(p); };
  const filterBy = async (p, text) => { await p.fill('#filter', text); await settle(p); };
  // a statement typed into the console of the page (module variables are not seen there, board is)
  const console_ = async (page, code) => {
    const from = page.out.length;
    await page.p.evaluate((c) => (0, eval)(c), code);
    await settle(page.p);
    return page.out.slice(from);
  };
  const tryConsole = (page, code) => page.p.evaluate((c) => { try { (0, eval)(c); return 'ok'; } catch (e) { return `${e.name}: ${e.message}`; } }, code);

  // the lecture
  const all = {};
  {
    const ctx = await b.newContext(MAIN);
    const src = await ctx.newPage();
    await src.goto('file:///' + path.join(DAY, 'lecture.html').replace(/\\/g, '/'));
    Object.assign(all, await src.evaluate(() => ({
      blocks: [...document.querySelectorAll('pre.code')].map((pre) => {
        const next = pre.nextElementSibling;
        return {
          code: pre.textContent,
          file: pre.dataset.file ?? null,
          box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          cheat: !!pre.closest('.cheatsheet'),
        };
      }),
      scenario: [...document.querySelectorAll('table.scenario tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())),
      edges: [...document.querySelectorAll('#whole ~ table')][1].querySelectorAll('tbody tr').length
        ? [...[...document.querySelectorAll('#whole ~ table')][1].querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())) : [],
      tryIt: document.querySelector('.try-it code').textContent,
      text: document.querySelector('.container').innerText,
    })));
    await src.goto('file:///' + path.join(DAY, 'student.html').replace(/\\/g, '/'));
    all.notes = await src.evaluate(() => ({
      blocks: [...document.querySelectorAll('pre.code')].map((pre) => pre.textContent),
      writes: [...[...document.querySelectorAll('table')][0].querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())),
      text: document.querySelector('.container').innerText,
    }));
    await ctx.close();
  }
  const L = all.blocks;
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  const kind = (blk) => {
    if (blk.cheat) return 'cheat';
    if (blk.file === 'index.html') return 'index';
    const first = blk.code.split(LF)[0];
    if (first === '"use strict";') return 'experiment';
    if (first.startsWith('// store.js — наблюдаемое хранилище')) return 'store';
    if (first.startsWith('// store.js — в handler добавили ловушку')) return 'fragment';
    if (first === '// main.js — проверка шага') return 'check';
    if (first === '// main.js — доска заданий группы') return 'main';
    if (first.startsWith('console.log(board.')) return 'console';
    if (['const heading = ', 'function button(', 'subscribe(render);', 'form.addEventListener('].some((s) => first.startsWith(s))) return 'part';
    return null;
  };
  const kinds = L.map(kind);
  check(kinds.every(Boolean), `lecture: every block is an experiment, a file, a part, a console check or the fragment ${JSON.stringify(kinds)}`);
  const count = (k) => kinds.filter((x) => x === k).length;
  check(count('experiment') === 9 && count('store') === 1 && count('index') === 1 && count('check') === 1 && count('main') === 2 && count('part') === 4 && count('console') === 2 && count('fragment') === 1 && count('cheat') === 1,
    `lecture: 9 experiments, store.js, index.html, the step check, main.js twice (the start and the whole), 4 parts, 2 console checks, the fragment, the cheatsheet`);

  // 1. the experiments: a clean page each, output = result-box
  for (const [i, blk] of L.entries()) {
    if (kinds[i] !== 'experiment' && kinds[i] !== 'cheat') continue;
    const out = await runScript(blk.code);
    if (!quiet) { console.log(`\n--- lecture #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${blk.code.split(LF)[1]}`); for (const l of out) console.log(`    > ${l}`); }
    if (blk.cheat) check(out.length === 0, `lecture #${i} (cheatsheet) runs without an error`);
    else check(blk.box && same(out, blk.box), `lecture #${i}: result-box = output ${JSON.stringify(out)}`);
  }

  // 2. the project: the parts of main.js give the whole
  const STORE = L[kinds.indexOf('store')].code;
  const HTML = L[kinds.indexOf('index')].code;
  const mains = L.filter((x, i) => kinds[i] === 'main');
  const WHOLE = mains[1].code;
  const parts = L.filter((x, i) => kinds[i] === 'part').map((x) => x.code);
  {
    const lines = (code) => code.split(LF).filter((l) => l.trim() !== '' && !/^\/\/ \d\. /.test(l));
    const [elements, showPart, subscribers, actions] = parts;
    const [subs, firstShow] = subscribers.split(`${LF}${LF}`);
    const expected = [mains[0].code, elements, showPart, subs, actions, firstShow].flatMap(lines);
    check(same(lines(WHOLE), expected), `section 15: the whole main.js = the parts of sections 11–12 line by line (${expected.length} lines), the first show at the end`);
  }
  const APP = { 'store.js': STORE, 'index.html': HTML, 'main.js': WHOLE };
  const patch = (files, name, from, to) => {
    check(files[name].includes(from), `patch ${name}: «${from.slice(0, 50)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };

  // section 9: the temporary main.js
  {
    const blk = L[kinds.indexOf('check')];
    const out = await run({ 'store.js': STORE, 'main.js': blk.code });
    if (!quiet) { console.log('\n--- section 9: store.js + main.js — проверка шага'); for (const l of out) console.log(`    > ${l}`); }
    check(same(out, blk.box), `section 9: result-box = output ${JSON.stringify(out)}`);
  }
  // the finished project loads without a word in the console
  const FIRST = { summary: 'Заданий: 4 · готово: 1', todo: ['Проверки tests.js — Мерет', 'Сохранение storage.js — Аман'], doing: ['Модуль card.js — Аман'], done: ['Разметка страницы — Айна'] };
  {
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && v.heading === 'Доска JS-1: Карточки 2.0' && v.summary === FIRST.summary && same(v.todo, FIRST.todo) && same(v.doing, FIRST.doing) && same(v.done, FIRST.done) && v.error === '',
      `the project loads silently, the board of the scheme of section 2: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    const buttons = await page.p.evaluate(() => [...document.querySelectorAll('#columns li')].map((li) => [...li.querySelectorAll('button')].map((x) => x.textContent).join('')).join(' '));
    check(buttons === '→✕ →✕ ←→✕ ←✕', `section 2: only the possible moves on the cards (${buttons})`);
    await page.close();
  }
  // section 11: the console check and the two writes
  {
    const blk = L.filter((x, i) => kinds[i] === 'console')[0].code.split(LF);
    const page = await open(APP);
    const out = await console_(page, blk[0]);
    check(same(out, [blk[1].replace(/^\/\/ /, '')]), `section 11: ${blk[0].slice(0, 40)}… = ${JSON.stringify(out)}`);
    await page.p.evaluate(() => { globalThis.__redraws = 0; });
    await console_(page, `${blk[2]}${LF}${blk[3]}`);
    const v = await view(page.p);
    check(v.doing.includes('Проверки tests.js — Мерет') && v.todo.includes('Сохранение storage.js — Сапар') && v.redraws === 1 && blk[4].includes('«Проверки tests.js» — в «Делаю»') && blk[4].includes('«Сохранение storage.js — Сапар»'),
      `section 11: two writes from the console — the page rebuilt itself, once: ${JSON.stringify(v)}`);
    await page.p.reload();
    await settle(page.p);
    const after = await view(page.p);
    await page.p.evaluate(() => localStorage.clear());
    await page.p.reload();
    await settle(page.p);
    const cleared = await view(page.p);
    check(same(after.doing, v.doing) && same(after.todo, v.todo) && cleared.summary === FIRST.summary && same(cleared.todo, FIRST.todo) && page.out.length === 1,
      `section 11: after a reload the board is saved; localStorage.clear() and a reload — the first data ${JSON.stringify([after.todo, cleared.todo])}`);
    await page.close();
  }
  // section 12: the actions, one redraw each, then the console check
  {
    const blk = L.filter((x, i) => kinds[i] === 'console')[1].code.split(LF);
    const page = await open(APP);
    const p = page.p;
    const redraws = [];
    await addTask(p, '  Тесты в Chrome ', 'Сапар'); redraws.push((await view(p)).redraws);
    await press(p, 'Проверки tests.js', '→'); redraws.push((await view(p)).redraws);
    await press(p, 'Разметка страницы', '✕'); redraws.push((await view(p)).redraws);
    const out = await console_(page, blk[0]);
    check(same(out, [blk[1].replace(/^\/\/ /, '')]) && same(redraws, [1, 2, 3]) && all.text.includes('Тесты в Chrome'),
      `section 12: ${JSON.stringify(out)}; the form (three writes), → and ✕ (six notifications) — one redraw each ${JSON.stringify(redraws)}`);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('board-js-1')));
    check(Array.isArray(saved.tasks) && saved.nextId === 6 && saved.tasks.length === 4, `section 6, 11: JSON.stringify of the store saved tasks as an array, nextId 6 (${JSON.stringify(saved).slice(0, 60)}…)`);
    await page.close();
  }
  // the scenario of section 15 on one page
  {
    const page = await open(APP);
    const p = page.p;
    let before;
    const steps = [
      async () => (await view(p)).summary,
      async () => { await p.click('#new-task button'); await settle(p); return (await view(p)).error; },
      async () => { await addTask(p, '  Тесты в Chrome ', 'Сапар'); return (await view(p)).summary; },
      async () => { await press(p, 'Проверки tests.js', '→'); return `в «Делаю»: ${titles((await view(p)).doing).join(', ')}`; },
      async () => { await press(p, 'Разметка страницы', '✕'); return (await view(p)).summary; },
      async () => { await filterBy(p, 'аман'); before = await view(p); return `видны: ${titles([...before.todo, ...before.doing, ...before.done]).join(', ')}`; },
      async () => {
        await p.reload(); await settle(p);
        const v = await view(p);
        const kept = same([v.todo, v.doing, v.done], [before.todo, before.doing, before.done]);
        return kept ? `та же доска, в фильтре «${await p.inputValue('#filter')}»` : 'другая доска';
      },
      async () => { await console_(page, 'board.tasks[0].status = "done"'); return (await view(p)).summary; },
    ];
    check(all.scenario.length === steps.length, `scenario: ${all.scenario.length} rows, ${steps.length} steps`);
    for (const [i, [did, want]] of all.scenario.entries()) {
      const got = await steps[i]();
      check(got === want, `scenario ${i + 1} «${did}»: ${got}`);
    }
    check(page.out.length === 0, `scenario: no console output ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // the edge cases: in the console of an open board
  {
    check(all.edges.length === 3, `edge cases: ${all.edges.length} rows`);
    for (const [code, want] of all.edges.slice(0, 2)) {
      const page = await open(APP);
      const got = await tryConsole(page, code);
      check(got === want, `edge «${code}»: ${got}`);
      await page.close();
    }
    const [code, want] = all.edges[2];
    const page = await open(APP);
    const got = await tryConsole(page, code);
    await settle(page.p);
    const v = await view(page.p);
    const cards = await page.p.evaluate(() => document.querySelectorAll('#columns li').length);
    check(got === 'ok' && v.summary === 'Заданий: 5 · готово: 1' && cards === 4 && want === 'принято: «Заданий» +1, карточки нет ни в одной колонке', `edge «${code}»: ${got}, ${v.summary}, ${cards} cards`);
    await page.close();
  }
  // try-it 1: a third subscriber — no listener changed
  {
    const page = await open(patch(APP, 'main.js', `subscribe(render);${LF}`, `subscribe(render);${LF}${all.tryIt}${LF}`));
    const t0 = await page.p.title();
    await press(page.p, 'Разметка страницы', '✕');
    const t1 = await page.p.title();
    check(t0 === 'Доска заданий' && t1 === 'Доска: 3' && page.out.length === 0, `try-it 1: the tab title follows the board — «${t0}», then «${t1}»`);
    await page.close();
  }

  // section 13: a set trap without receiver
  const FRAG = L[kinds.indexOf('fragment')].code.split(LF).slice(1).map((l) => `    ${l}`).join(LF);
  {
    const broken = patch(APP, 'store.js', `  const handler = {${LF}`, `  const handler = {${LF}${FRAG}${LF}`);
    const page = await open(broken);
    const p = page.p;
    await addTask(p, 'Тесты в Chrome', 'Сапар');
    await press(p, 'Проверки tests.js', '→');
    await filterBy(p, 'аман');
    const silent = await view(p);
    await press(p, 'Разметка страницы', '✕');
    const all1 = await view(p);
    check(silent.summary === FIRST.summary && same(silent.todo, FIRST.todo) && same(silent.doing, FIRST.doing) && silent.redraws === 0 && page.out.includes('запись status doing') && page.out.includes('запись filter аман'),
      `section 13: adding, moving and the filter are silent, the console says «запись status doing» ${JSON.stringify(silent)}`);
    check(all1.summary === 'Заданий: 4 · готово: 0' && same(all1.todo, ['Сохранение storage.js — Аман']) && same(all1.doing, ['Модуль card.js — Аман']) && all1.redraws === 1,
      `section 13: ✕ shows every missed change at once (the filter too) ${JSON.stringify(all1)}`);
    await page.close();
    const fixed = patch(patch(broken, 'store.js', 'set(target, key, value) {', 'set(target, key, value, receiver) {'), 'store.js', 'return Reflect.set(target, key, value);', 'return Reflect.set(target, key, value, receiver);');
    const page2 = await open(fixed);
    await addTask(page2.p, 'Тесты в Chrome', 'Сапар');
    await press(page2.p, 'Проверки tests.js', '→');
    const v2 = await view(page2.p);
    check(v2.summary === 'Заданий: 5 · готово: 1' && v2.doing.includes('Проверки tests.js — Мерет') && v2.redraws === 2 && all.text.includes('Reflect.set(target, key, value, receiver)'), `section 13, step 3: with receiver the log does not stop the notifications ${JSON.stringify(v2)}`);
    await page2.close();
  }
  // section 14: no cache, no return, frozen data
  {
    const page = await open(patch(APP, 'store.js', '? wrap(value) : value;   // функции — как есть', '? new Proxy(value, handler) : value;'));
    await press(page.p, 'Разметка страницы', '✕');
    const v = await view(page.p);
    check(same(v.done, ['Разметка страницы — Айна']) && !v.todo.includes('Сохранение storage.js — Аман') && v.summary === 'Заданий: 3 · готово: 1', `section 14: without the WeakMap ✕ at «Разметка» removes the last task ${JSON.stringify(v)}`);
    await page.close();
  }
  {
    const page = await open(patch(APP, 'store.js', `      return ok;   // false → TypeError в строгом коде (6.2.5.6, шаг 3.e)${LF}`, ''));
    await press(page.p, 'Проверки tests.js', '→');
    const v = await view(page.p);
    check(v.doing.includes('Проверки tests.js — Мерет') && same(page.out, ["Uncaught TypeError: 'defineProperty' on proxy: trap returned falsish for property 'status'"]), `section 14: without return — the card moved and the console has the TypeError ${JSON.stringify(page.out)}`);
    await page.close();
  }
  {
    const page = await open(patch(APP, 'main.js', '?? first,', '?? Object.freeze(first),'));
    const box = L.filter((x, i) => kinds[i] === 'experiment').at(-1).box;
    check(page.out.length === 1 && page.out[0] === `Uncaught ${box[0]}`, `section 14: Object.freeze(first) — the TypeError of the experiment above ${JSON.stringify(page.out)}`);
    await page.close();
  }

  // what the lecture only tells about (probes d19_a.txt, d19_b.txt before writing)
  const told = async (code, want, text) => { const out = await runScript(code); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  const OBSERVE = `function observe(obj, onChange, withSet) {
  const handler = {
    defineProperty(target, key, desc) { const ok = Reflect.defineProperty(target, key, desc); onChange("define " + key); return ok; },
    deleteProperty(target, key) { const ok = Reflect.deleteProperty(target, key); onChange("delete " + key); return ok; },
  };
  if (withSet) handler.set = (target, key, value, receiver) => { const ok = Reflect.set(target, key, value, receiver); onChange("set " + key); return ok; };
  return new Proxy(obj, handler);
}
`;
  await told(`"use strict";
${OBSERVE}const changes = [];
const state = observe({ filter: "" }, (k) => changes.push(k), true);
state.filter = "Аман";
console.log(changes.join(", "));`, ['define filter, set filter'], 'lecture 5: set and defineProperty both notify — one assignment, two notifications, define first');
  await told(`"use strict";
${OBSERVE}const changes = [];
const tasks = observe(["Разметка", "Модуль", "Тесты"], (k) => changes.push(k));
tasks.push("Сохранение");
console.log(changes.join(", "));
changes.length = 0;
tasks.splice(0, 1);
console.log(changes.join(", "), tasks.length);`, ['define 3, define length', 'define 0, define 1, define 2, delete 3, define length 3'],
  'lecture 7: push — two notifications (the index and length); splice(0, 1) of four — five (three moves, a delete, length)');
  await told(`"use strict";
let calls = 0;
const proxies = new WeakMap();
const targets = new WeakMap();
const make = (unwrap) => {
  const handler = {
    get(target, key, receiver) { const v = Reflect.get(target, key, receiver); return typeof v === "object" && v !== null ? wrap(v) : v; },
    defineProperty(target, key, desc) { calls++; if (unwrap && "value" in desc && targets.has(desc.value)) desc = { ...desc, value: targets.get(desc.value) }; return Reflect.defineProperty(target, key, desc); },
  };
  function wrap(obj) { if (!proxies.has(obj)) { const p = new Proxy(obj, handler); proxies.set(obj, p); targets.set(p, obj); } return proxies.get(obj); }
  return wrap;
};
for (const unwrap of [false, true]) {
  const state = make(unwrap)({ tasks: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] });
  const seen = [];
  for (let i = 0; i < 4; i++) { calls = 0; state.tasks.at(-1).n += 10; seen.push(calls); if (i < 3) state.tasks.splice(0, 1); }
  console.log(unwrap, seen.join(" "));
}`, ['false 1 2 3 4', 'true 1 1 1 1'], 'lecture 7: without unwrapping every deletion of the first task adds a layer — 4 traps per write after three; with it — 1');
  await told(`"use strict";
const p = new Proxy({ x: 0 }, { defineProperty(t, k, d) { Reflect.defineProperty(t, k, d); } });
try { p.x = 1; } catch (e) { console.log(e.name); }
console.log(p.x);`, ['TypeError', '1'], 'lecture 14: a trap without return — TypeError in strict code, the value is written');
  await told(`const p = new Proxy([], { defineProperty(t, k, d) { Reflect.defineProperty(t, k, d); } });
p.x = 1;
try { p.push(1); } catch (e) { console.log(e.name + ": " + e.message); }
console.log(p.x, p.length);`, ["TypeError: 'defineProperty' on proxy: trap returned falsish for property '0'", '1 1'], 'lecture 14: in sloppy code the assignment is silent, push throws — its Set has Throw = true');
  {
    const mdnExample = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/global_objects/proxy/proxy/defineproperty/index.md'], { encoding: 'utf8' })
      .match(/```js interactive-example\n([\s\S]*?)```/)[1];
    const out = await runScript(mdnExample);
    check(same(out, ['Uncaught Error: Invalid attempt to define private "_secret" property']) && mdnExample.includes('proxy._secret = "easily scared"') && !mdnExample.includes('set('),
      `lecture 5: the MDN example of handler.defineProperty() — the assignment lands in the defineProperty trap (no set trap there) ${JSON.stringify(out)}`);
  }
  {
    const out = await run({ 'store.js': STORE, 'main.js': `import { createStore } from "./store.js";
const data = { tasks: [{ a: 1 }, { a: 2 }, { a: 3 }], m: new Map([[1, 2]]) };
const second = data.tasks[1];
const { state } = createStore(data);
state.tasks.splice(0, 1);
console.log(data.tasks[0] === second, data.tasks.length, state.tasks[0] === state.tasks[0]);
try { state.m.get(1); } catch (e) { console.log(e.name + ": " + e.message); }` });
    check(same(out, ['true 2 true', 'TypeError: Method Map.prototype.get called on incompatible receiver #<Map>']),
      `lecture 7, 16, try-it 2: after splice the target holds the tasks, not wrappers; a Map in the store does not work ${JSON.stringify(out)}`);
  }

  // the notes
  {
    const N = all.notes;
    check(N.blocks.length === 1 && N.blocks[0].split(LF).every((l) => l.startsWith('//')), 'notes: one block — the map of the program in comments');
    check(hasAll(STORE, ['export function createStore(data, allowed = {})', 'return () => listeners.delete(listener);', 'const proxies = new WeakMap();', 'Promise.resolve().then(', 'if (planned) return;'])
      && hasAll(HTML, ['<section data-status="todo">', '<form id="new-task">', '<input id="filter"', '<p id="error"'])
      && hasAll(WHOLE, ['JSON.parse(localStorage.getItem(SAVED)) ?? first', 'globalThis.board = state;', 'subscribe(render);', 'state.tasks.push(', 'task.status = STATUSES[at + 1];', 'state.tasks.splice(', 'state.filter = filter.value.trim();']),
    'notes: the map names what store.js, index.html and main.js have');
    const out = await runScript(`"use strict";
${OBSERVE}const n = (make, act) => { const changes = []; const o = observe(make(), (k) => changes.push(k)); act(o); return changes; };
const rows = [
  n(() => ({ key: 0 }), (o) => { o.key = 1; }),
  n(() => ({}), (o) => { Object.defineProperty(o, "key", { value: 1 }); }),
  n(() => ({ key: 0 }), (o) => { delete o.key; }),
  n(() => ["a", "b", "c"], (o) => { o.push("d"); }),
  n(() => ["a", "b", "c", "d"], (o) => { o.splice(0, 1); }),
  n(() => ({ tasks: [{ a: 1 }] }), (o) => { JSON.stringify(o); }),
];
console.log(rows.map((r) => r.length).join(" "));
console.log(n(() => ["a", "b", "c", "d", "e"], (o) => { o.splice(1, 1); }).join(", "));`);
    check(N.writes.length === 6 && same(out[0], N.writes.map((r) => r[2]).join(' ')), `notes: the table «Куда приходит запись» — notifications in Chrome ${out[0]}, in the table ${N.writes.map((r) => r[2]).join(' ')}`);
    check(out[1] === 'define 1, define 2, define 3, delete 4, define length', `notes, homework 2: «✕» at the second of five — five notifications: ${out[1]}`);
    const page = await open(patch(APP, 'main.js', `function render() {${LF}`, `function render() {${LF}  console.count("render");${LF}`));
    const seen = [page.out.join()];
    await press(page.p, 'Проверки tests.js', '→'); seen.push(page.out.at(-1));
    await press(page.p, 'Модуль card.js', '←'); seen.push(page.out.at(-1));
    await press(page.p, 'Разметка страницы', '✕'); seen.push(page.out.at(-1));
    await addTask(page.p, 'Тесты', 'Сапар'); seen.push(page.out.at(-1));
    check(same(seen, ['render: 1', 'render: 2', 'render: 3', 'render: 4', 'render: 5']) && N.text.includes('console.count("render")'), `notes, checklist: console.count grows by one a click ${JSON.stringify(seen)}`);
    await page.close();
    const dpText = plainMd(execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/global_objects/proxy/proxy/defineproperty/index.md'], { encoding: 'utf8' }));
    check(dpText.includes('The defineProperty() method must return a Boolean') && N.text.includes('«must return a Boolean»'), 'notes: MDN handler.defineProperty() — «must return a Boolean»');
    check(hasAll(N.text, ['Заданий: 4 · готово: 1', 'Напишите задание и кто его делает']) && hasAll(all.text, ['Заданий: 4 · готово: 1', 'Напишите задание и кто его делает']),
      'notes, checklist: the texts of the first show and the form are those of the lecture and the project');
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const steps = [
    ['sec-putvalue', 'Let succeeded be ? baseObj. [[Set]] (V. [[ReferencedName]], W, GetThisValue (V))', '3.d'],
    ['sec-putvalue', 'If succeeded is false and V. [[Strict]] is true, throw a TypeError exception', '3.e'],
    ['sec-reflect.set', 'Set receiver to target', '3.a'],
    ['sec-reflect.set', 'Return ? target. [[Set]] (key, V, receiver)', '4'],
    ['sec-proxy-object-internal-methods-and-internal-slots-set-p-v-receiver', 'Return ? target. [[Set]] (P, V, Receiver)', '6.a'],
    ['sec-ordinarysetwithowndescriptor', 'Let existingDescriptor be ? Receiver. [[GetOwnProperty]] (P)', '2.c'],
    ['sec-ordinarysetwithowndescriptor', 'Return ? CreateDataProperty (Receiver, P, V)', '2.d.ii'],
    ['sec-ordinarysetwithowndescriptor', 'Return ? Receiver. [[DefineOwnProperty]] (P, valueDesc)', '2.h'],
    ['sec-proxy-object-internal-methods-and-internal-slots-defineownproperty-p-desc', 'Let booleanTrapResult be ToBoolean (? Call (trap, handler, «target, P, descObj»))', '8'],
    ['sec-proxy-object-internal-methods-and-internal-slots-defineownproperty-p-desc', 'If booleanTrapResult is false, return false', '9'],
    ['sec-proxy-object-internal-methods-and-internal-slots-get-p-receiver', 'If SameValue (trapResult, targetDesc. [[Value]]) is false, throw a TypeError exception', '9.a.i'],
    ['sec-isarray', 'If argument is a Proxy exotic object, then', '3'],
    ['sec-isarray', 'Return ? IsArray (proxyTarget)', '3.c'],
    ['sec-array.prototype.push', 'Let len be ? LengthOfArrayLike (O)', '2'],
    ['sec-array.prototype.push', 'Perform ? Set (O, ! ToString (𝔽 (len)), E, true)', '5.a'],
    ['sec-array.prototype.push', 'Perform ? Set (O, "length", 𝔽 (len), true)', '6'],
    ['sec-set-o-p-v-throw', 'If success is false and Throw is true, throw a TypeError exception', '2'],
    ['sec-array-exotic-objects-defineownproperty-p-desc', 'If index ≥ length, then', '2.k'],
    ['sec-tostring', 'If argument is a Symbol, throw a TypeError exception', '2'],
    ['sec-array.prototype.splice', 'Else if relativeStart < 0, let actualStart be max (len + relativeStart, 0)', '5'],
    ['sec-array.prototype.splice', 'Perform ? DeletePropertyOrThrow (O, ! ToString (𝔽 (k - 1)))', '16.d.i'],
    ['sec-array.prototype.splice', 'Perform ? Set (O, "length", 𝔽 (len - actualDeleteCount + itemCount), true)', '20'],
    ['sec-serializejsonobject', 'Let K be ? EnumerableOwnProperties (value, key)', '6.a'],
    ['sec-serializejsonarray', 'Let len be ? LengthOfArrayLike (value)', '6'],
    ['sec-ordinaryget', 'Return ? Call (getter, Receiver)', '7'],
  ];
  const wrong = steps.filter(([id, needle, n]) => !same(at(id, needle), [n])).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 30)}» ${JSON.stringify(at(id, needle))}≠${n}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture names (6.2.5.6 3.d/3.e, 28.1.12 3.a/4, 10.5.9 6.a, 10.1.9.2 2.c/2.d.ii/2.h, 10.5.6 8–9, 10.5.8 9.a.i, 7.2.2 3, 23.1.3.23 2/5.a/6, 7.3.4 2, 10.4.2.1 2.k, 7.1.17 2, 23.1.3.31 5/16.d.i/20, 25.5.4.5 6.a, 25.5.4.6 6, 10.1.8.1 7): ${wrong.join('; ') || 'all right'}`);
  check(at('sec-array.prototype.splice', 'Let fromValue be ? Get (O, from)').includes('16.b.iii.1') && at('sec-array.prototype.splice', 'Perform ? Set (O, to, fromValue, true)').includes('16.b.iii.2')
    && f('sec-array.prototype.splice').includes('If itemCount < actualDeleteCount, then'),
  'ECMA-262: splice — Get in 16.b.iii.1, Set of what was read in 16.b.iii.2 (the branch itemCount < actualDeleteCount of splice(0, 1))');
  check(f('sec-ordinaryset').includes('Return ? OrdinarySetWithOwnDescriptor (O, P, V, Receiver, ownDesc)') && f('sec-createdataproperty').includes('Return ? O. [[DefineOwnProperty]] (P, newDesc)')
    && f('sec-lengthofarraylike').includes('? Get (obj, "length")') && f('sec-topropertykey').includes('Return ! ToString (key)')
    && f('sec-array.prototype.indexof').includes('IsStrictlyEqual (searchElement, elementK)') && f('sec-proxy-object-internal-methods-and-internal-slots-defineownproperty-p-desc').includes('Let descObj be FromPropertyDescriptor (Desc)'),
  'ECMA-262: OrdinarySet goes to OrdinarySetWithOwnDescriptor, CreateDataProperty to [[DefineOwnProperty]], LengthOfArrayLike to Get, ToPropertyKey to ToString, indexOf compares with IsStrictlyEqual, the trap gets a descriptor object');
  check(f('sec-performpromisethen').includes('Else if promise. [[PromiseState]] is fulfilled, then') && /fulfilled, then .{0,200}HostEnqueuePromiseJob/.test(f('sec-performpromisethen')) && spec.includes('id="sec-hostenqueuepromisejob"'),
    'ECMA-262: PerformPromiseThen of a fulfilled promise hands the job to HostEnqueuePromiseJob at once');
  check(num('sec-proxy-object-internal-methods-and-internal-slots') === '10.5' && num('sec-reflect-object') === '28.1' && num('sec-ordinarysetwithowndescriptor') === '10.1.9.2' && num('sec-array.prototype.splice') === '23.1.3.31'
    && num('sec-performpromisethen') === '27.2.5.4.1' && num('sec-hostenqueuepromisejob') === '9.5.5' && num('sec-ordinaryget') === '10.1.8.1' && num('sec-putvalue') === '6.2.5.6' && num('sec-tostring') === '7.1.17',
  'ECMA-262: the numbers in the comments of store.js — 10.5, 28.1, 10.1.9.2, 23.1.3.31, 27.2.5.4.1, 9.5.5, 10.1.8.1, 6.2.5.6, 7.1.17');
  check(hasAll(STORE, ['(10.5)', '(28.1)', '(23.1.3.31, шаг 16.b.iii)', '(27.2.5.4.1 → 9.5.5)', '(7.1.17, шаг 2)', '(10.1.8.1, шаг 7)', '(10.5.9, шаг 6.a → 10.1.9.2, шаги 2.d.ii и 2.h)', '(6.2.5.6, шаг 3.e)']) && !STORE.includes('set(target'),
    'store.js: the unusual places carry their sections (10.5, 28.1, 10.1, chapter 7, 23.1.3.31, 27.2.5.4.1, 6.2.5.6); no set trap');

  // the MDN pages the lecture quotes
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/global_objects/${p}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
  {
    const dp = plain(mdn('proxy/proxy/defineproperty'));
    const inter = dp.slice(dp.indexOf('### Interceptions'), dp.indexOf('### Invariants'));
    const items = inter.split(LF).filter((l) => l.startsWith('- '));
    check(inter.includes('Or any other operation that invokes the [[DefineOwnProperty]] internal method') && items.length === 2 && !/assign|set\(/i.test(inter) && hasAll(inter, ['Object.defineProperty()', 'Object.defineProperties()', 'Reflect.defineProperty()']),
      `lecture 5: MDN handler.defineProperty() — Interceptions names defineProperty, defineProperties and Reflect, not the assignment; «any other operation that invokes the [[DefineOwnProperty]] internal method» ${JSON.stringify(items)}`);
    const px = mdn('proxy');
    const val = px.slice(px.indexOf('### Validation'), px.indexOf('### Manipulating DOM nodes'));
    check(hasAll(val, ['set(obj, prop, value) {', 'throw new TypeError("The age is not an integer")', 'throw new RangeError("The age seems invalid")', 'obj[prop] = value;']),
      'lecture 9, 13: MDN Proxy, Validation — TypeError for the type, RangeError for the value, and obj[prop] = value inside set (the receiver is the target)');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const page = (p) => flat(read(p));
  check(page('advanced/day-16/lecture.html').includes('Проверка записи — это две ловушки: set и defineProperty') && page('advanced/day-16/lecture.html').includes('5. Receiver, приватные поля и слоты')
    && page('advanced/day-16/lecture.html').includes('incompatible receiver #<Map>') && read('advanced/day-16/lecture.html').includes('typeof value !== typeof t[key]) throw new TypeError')
    && hasAll(page('advanced/day-16/tasks.html'), ['8. Отзыв по всему дереву', 'lend(target)', 'WeakMap', '10.5.8']),
  'lecture 4, 6, 9, 14, 16: day 16 — section 8 «две ловушки», section 5 (slots, a Map behind a proxy), the typeof check of the settings, task 8 lend with WeakMap and 10.5.8');
  check(read('advanced/day-17/lecture.html').includes('Reflect[trap](...args)') && page('advanced/day-17/lecture.html').includes('5. Практика: прокси с верной пересылкой')
    && hasAll(page('advanced/day-14/lecture.html'), ['6. [[Set]] по шагам', 'OrdinarySetWithOwnDescriptor', 'OrdinaryGet', '5. [[Get]] и Receiver'])
    && read('advanced/day-15/lecture.html').includes('#sec-array-exotic-objects-defineownproperty-p-desc') && page('advanced/day-15/lecture.html').includes('6. Практика: запись за концом массива')
    && hasAll(page('advanced/day-09/lecture.html'), ['12. Задания', 'HostEnqueuePromiseJob']) && hasAll(page('advanced/day-07/lecture.html'), ['3. Set и флажок Throw', 'CreateDataProperty']),
  'lecture: day 17 — the log of all traps (section 5); day 14 — [[Set]] and [[Get]] by steps; day 15 — writing past the end; day 9 — jobs; day 7 — Set and Throw, CreateDataProperty');
  const anchorIn = (p, id) => read(p).includes(`#${id}"`);
  const refDays = [['sec-putvalue', [4, 9]], ['sec-tostring', [5]], ['sec-topropertykey', [5]], ['sec-isarray', [5, 9]], ['sec-isstrictlyequal', [5]], ['sec-set-o-p-v-throw', [7]], ['sec-createdataproperty', [7]],
    ['sec-hostenqueuepromisejob', [9]], ['sec-ordinarysetwithowndescriptor', [7]], ['sec-array-exotic-objects-defineownproperty-p-desc', [15]], ['sec-proxy-object-internal-methods-and-internal-slots-defineownproperty-p-desc', [16]],
    ['sec-proxy-object-internal-methods-and-internal-slots-get-p-receiver', [16]], ['sec-proxy-object-internal-methods-and-internal-slots-set-p-v-receiver', [16]], ['sec-proxy-object-internal-methods-and-internal-slots-delete-p', [16]],
    ['sec-reflect.defineproperty', [17]], ['sec-reflect.deleteproperty', [17]], ['sec-reflect.get', [17]], ['sec-reflect.set', [17]]];
  const missingDays = refDays.flatMap(([id, days]) => days.filter((d) => !anchorIn(`advanced/day-${String(d).padStart(2, '0')}/lecture.html`, id)).map((d) => `${id} @ ${d}`));
  check(missingDays.length === 0 && anchorIn('intermediate/day-28/lecture.html', 'sec-performpromisethen') && page('intermediate/day-31/lecture.html').includes('SerializeJSON') && page('advanced/day-14/lecture.html').includes('OrdinaryGet'),
    `reference table: every section links from the days it names (course 2: PerformPromiseThen — 28, SerializeJSON — 31; OrdinaryGet named on day 14) ${missingDays.join(', ')}`);
  check(page('intermediate/day-30/lecture.html').includes('не видны — только то, что модуль положил в globalThis') && page('intermediate/day-14/lecture.html').includes('WeakMap')
    && hasAll(page('intermediate/day-16/lecture.html'), ['deepFreeze', 'render()']) && page('intermediate/day-28/lecture.html').includes('микрозадач'),
  'lecture: course 2 — modules and the console (30), WeakMap (14), deepFreeze and render() (16), microtasks (28)');
  check(page('essentials/day-26/lecture.html').includes('Всё, что не узел, append превращает в текст') && page('essentials/day-25/lecture.html').includes('textContent')
    && page('essentials/day-27/lecture.html').includes('елегирован') && page('essentials/day-29/lecture.html').includes('render') && page('essentials/day-31/lecture.html').includes('localStorage'),
  'lecture: Essentials — textContent (25), append turns a string into text (26), delegation (27), render (29), localStorage (31)');
  {
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    check(hasAll(plan, ['**19. Мини-проект: наблюдаемое хранилище на Proxy и Reflect.**', 'Разбор по шагам спецификации — что вызывает у прокси `push` массива', 'У каждого необычного места — комментарий со ссылкой на раздел (10.5, 28.1, внутренние методы 10.1, преобразования главы 7)', '**20. ArrayBuffer и типизированные массивы.**'])
      && read('docs/plan-0-overview.md').includes('A5 Двоичные данные и модель памяти'),
    'plan: day 19 as the plan says it; day 20 and the module A5 as section 16 names them');
    const csvLine = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine).filter((c) => c[6] === '3' && c[7] === '19');
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine).filter((c) => c[5] === '3' && c[6] === '19');
    check(spRows.length === 0 && mdRows.length === 0, `plan: the project day has no rows of its own (${spRows.length} of ECMA-262, ${mdRows.length} of MDN)`);
  }

  // links
  {
    const lecture = read('advanced/day-19/lecture.html');
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    check(['Proxy, handler.defineProperty()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && (lecture.match(/developer\.mozilla\.org/g) || []).length === 3,
      'links: the footer names the two MDN pages the text uses and ECMA-262 2026; MDN is linked at the two places and in the footer');
    const notes = read('advanced/day-19/student.html');
    const nAnchors = [...new Set([...notes.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]))];
    const nNamed = [...notes.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const nWrong = [...nAnchors.filter((a) => !spec.includes(`id="${a}"`)), ...nNamed.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)}`)];
    const nFooter = notes.slice(notes.indexOf('<div class="sources">'));
    check(nAnchors.length === 5 && nNamed.length === 5 && nWrong.length === 0 && ['handler.defineProperty()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 2,
      `notes: ${nAnchors.length} anchors of tc39.es with the right numbers, the footer names handler.defineProperty() (quoted in «запомни») and ECMA-262 2026 ${nWrong.join(', ')}`);
    check(stepPaths(clause(spec, 'sec-ordinarysetwithowndescriptor'), 'Return ? CreateDataProperty (Receiver, P, V)')[0] === '2.d.ii' && notes.includes('шаги 2.d.ii и 2.h') && notes.includes('шаг 6.a') && notes.includes('шаги 5.a и 6') && notes.includes('шаг 3.a'),
      'notes: the step numbers of the table and of «запомни» are those the lecture checked');
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
