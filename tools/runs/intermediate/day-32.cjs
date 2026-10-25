// Course 2, day 32 (project day: a weekly schedule on modules), in Chrome. The project is a folder of files written in
// the lecture: a block is a file when its first line is "// name.js" (or "// main.js — проверка шага", a temporary
// main.js that checks one step) or when it has data-file="…" (the JSON files and index.html). The folder is one for the
// whole lecture — files pile up from the top, a later file with the same name replaces the earlier one — and a
// result-box after a block runs the folder as Live Server would, on http://127.0.0.1:5500/ (.js as text/javascript,
// .json as application/json, a missing file as 404 text/html), in a fresh browser context. Before index.html is written
// (section 9) the page is a default one with <script type="module" src="main.js">. The finished project is the folder
// after the last block: the scenario of section 14 runs on it step by step (typing and clicks), with the edge cases,
// the bugs of sections 12–13 on patched copies, the two experiments and reference solutions of tasks 1–9. Output is the
// console as DevTools shows it: console calls, uncaught errors and the browser's own messages of the "javascript"
// source (network 404 messages are left out, the prose mentions them).
//   node tools/runs/intermediate/day-32.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-32.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const DAY = path.join(__dirname, '../../../intermediate/day-32');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const ORIGIN = 'http://127.0.0.1:5500';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'error') return `<error object ${a.description.split(LF)[0]}>`;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    return `${name === 'Array' ? '' : name}(${n}) [${a.preview.properties.map(inner).join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.preview) return `<object ${a.className}>`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

const fileName = (blk) => {
  if (blk.file) return blk.file;
  const first = blk.code.split(LF)[0].trim();
  const m = first.match(/^\/\/ ([\w./-]+\.js)(?: — .*)?$/);
  return m ? m[1] : null;
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // open a folder; returns the page (still open), its console output and the list of requested files
  const open = async (files) => {
    const site = { ...files };
    const page = site['index.html'] ? `<meta charset="utf-8">${LF}${site['index.html']}` : DEFAULT_PAGE;
    const ctx = await b.newContext(MAIN);
    const requests = [];
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      requests.push(name);
      if (name === 'index.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (!(name in site)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/plain';
      return r.fulfill({ contentType: `${type}; charset=utf-8`, body: site[name] });
    });
    const p = await ctx.newPage();
    const out = [];
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => {
      const d = e.exceptionDetails;
      const what = d.exception ? (d.exception.description ?? JSON.stringify(d.exception.value)).split(LF)[0] : '';
      out.push(`${d.text} ${what}`.trim());
    });
    cdp.on('Log.entryAdded', (e) => { if (e.entry.level === 'error' && e.entry.source !== 'network') out.push(e.entry.text); });
    await p.goto(`${ORIGIN}/index.html`);
    await p.waitForTimeout(600);
    return { p, ctx, out, requests, close: () => ctx.close() };
  };
  const run = async (files) => {
    const page = await open(files);
    await page.close();
    return page.out;
  };
  // what the page shows
  const view = (p) => p.evaluate(() => ({
    heading: document.querySelector('#heading')?.textContent ?? null,
    summary: document.querySelector('#summary')?.textContent ?? null,
    items: [...document.querySelectorAll('#lessons li')].map((li) => li.textContent),
    past: document.querySelectorAll('#lessons li.past').length,
    empty: document.querySelector('#empty') && !document.querySelector('#empty').hidden ? document.querySelector('#empty').textContent : null,
    error: document.querySelector('#error')?.textContent ?? null,
  }));
  const type = async (p, text) => { await p.fill('#search', text); await p.waitForTimeout(150); };
  const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(300); };

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
            box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
            cheat: !!pre.closest('.cheatsheet'),
          };
        }),
        scenario: [...document.querySelectorAll('table.scenario tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())),
        text: document.querySelector('.container').innerText,
      }));
      await src.close();
    }
    await ctx.close();
  }

  // the lecture: one folder, a run at every result-box
  const site = {};
  const used = new Set();
  let pending = [];
  const L = all.lecture.blocks;
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  // "// в конец main.js — …" is a temporary fragment: checked on the finished project, not part of it
  const tails = L.filter((x) => x.code.startsWith('// в конец main.js'));
  for (const [i, blk] of L.entries()) {
    if (blk.cheat || tails.includes(blk)) continue;
    const file = fileName(blk);
    check(!!file, `lecture #${i}: the block names its file (${blk.code.split(LF)[0]})`);
    if (!file) continue;
    site[file] = blk.code;
    pending.push(i);
    if (blk.box) {
      const out = await run(site);
      if (!quiet) {
        console.log(`\n--- lecture #${i} (${file}): ${Object.keys(site).join(', ')}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      check(!out.some((l) => l.startsWith('<')), `lecture #${i}: no object printed`);
      check(same(out, blk.box), `lecture #${i}: result-box = output (${out.length} lines)${same(out, blk.box) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      for (const k of pending) used.add(k);
      pending = [];
    }
  }
  // the blocks after the last result-box (index.html, the real main.js) are the finished project
  for (const k of pending) used.add(k);
  for (const [i, blk] of L.entries()) if (!blk.cheat && !tails.includes(blk) && fileName(blk)) check(used.has(i), `lecture #${i} (${fileName(blk)}) is used by a run or by the finished project`);
  for (const blk of L.filter((x) => x.file && x.file.endsWith('.json'))) {
    let ok = true;
    try { JSON.parse(blk.code); } catch { ok = false; }
    check(ok, `lecture: ${blk.file} is valid JSON`);
  }
  const APP = Object.fromEntries(Object.entries(site));
  check(APP['main.js'].includes('await loadSchedule(groups)') && 'index.html' in APP && Object.keys(APP).length === 11, `the finished project: ${Object.keys(APP).join(', ')}`);

  // the finished project: no output at all on load
  {
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && v.heading === 'Расписание на неделю' && v.items.length === 6 && v.error === '', `the project loads without a word in the console: ${JSON.stringify(page.out)} ${JSON.stringify(v)}`);
    await page.close();
  }
  // section 11: the debug fragment at the end of main.js, read the way the console reads it
  {
    check(tails.length === 1, `section 11: one debug fragment (${tails.length})`);
    const page = await open({ ...APP, 'main.js': `${APP['main.js']}\n${tails[0].code}` });
    const p = page.p;
    const before = await p.evaluate(() => [JSON.stringify(debug.state), debug.lessons[0].end.toString()]);
    await type(p, 'c++');
    const after = await p.evaluate(() => debug.state.visible);
    check(same(before, ['{"locale":"ru-RU","query":"","visible":6}', '2026-10-26T15:30:00']) && after === 2 && page.out.length === 0,`section 11: debug.state, debug.lessons: ${JSON.stringify([before, after, page.out])}`);
    await page.close();
    // a plain property keeps the old array: written before the load, it stays empty
    const plain = APP['main.js'].replace('try {\n  lessons = await loadSchedule(groups);', 'globalThis.debug = { lessons };\ntry {\n  lessons = await loadSchedule(groups);');
    check(plain !== APP['main.js'], 'section 11: a plain property before the load');
    const page2 = await open({ ...APP, 'main.js': plain });
    check(await page2.p.evaluate(() => debug.lessons.length) === 0, 'section 11: a plain { lessons } shows the array it was given — empty');
    await page2.close();
  }
  // the scenario of section 14, step by step on one page
  {
    const page = await open(APP);
    const p = page.p;
    const steps = [
      async () => (await view(p)).summary,
      async () => (await view(p)).items[0],
      async () => String((await view(p)).past),
      async () => { await type(p, 'c++'); return (await view(p)).summary; },
      async () => { await click(p, '[data-locale="en-US"]'); return (await view(p)).summary; },
      async () => { await type(p, '(regexp)'); return (await view(p)).summary; },
      async () => { await type(p, 'xyz'); return (await view(p)).empty; },
      async () => { await type(p, ''); await click(p, '[data-locale="ru-RU"]'); return (await view(p)).summary; },
    ];
    check(all.lecture.scenario.length === steps.length, `scenario: ${all.lecture.scenario.length} rows, ${steps.length} steps`);
    for (const [i, [did, want]] of all.lecture.scenario.entries()) {
      const got = await steps[i]();
      check(got === want, `scenario ${i + 1} «${did}»: ${got}`);
    }
    // task 3: after the scenario, EN and «шаблоны»
    await click(p, '[data-locale="en-US"]');
    await type(p, 'шаблоны');
    check((await view(p)).summary === 'Lessons: 1 · hours: 1.5 · next in 3 days, 21 hr', `task 3: after the scenario, EN and «шаблоны»: ${(await view(p)).summary}`);
    check(page.out.length === 0, `scenario: no console output: ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // the edge cases of section 14
  const edge = async (files, act, want, label) => {
    const page = await open(files);
    if (act) await act(page.p);
    const v = await view(page.p);
    const ok = want(v, page);
    check(ok, `${label}: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
  };
  const patch = (files, name, from, to) => {
    check(files[name].includes(from), `patch ${name}: «${from.slice(0, 40)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };
  const lec = all.lecture.text;
  await edge(APP, (p) => type(p, '   '), (v) => v.items.length === 6, 'edge: a search of spaces — all six');
  await edge(APP, (p) => type(p, '.*'), (v) => v.empty === 'Ничего не нашлось' && lec.includes('«Ничего не нашлось»'), 'edge: «.*» — nothing found');
  await edge(APP, (p) => type(p, 'МОДУЛИ'), (v) => v.summary === 'Занятий: 1 · часов: 1,5' && lec.includes('Занятий: 1 · часов: 1,5'), 'edge: «МОДУЛИ» — flag i');
  const PY = patch(APP, 'data/groups.json', '{ "id": "cpp-1", "name": "C++-1" }', '{ "id": "cpp-1", "name": "C++-1" },\n  { "id": "py-1", "name": "PY-1" }');
  await edge(PY, null, (v) => v.error === `Не удалось загрузить расписание PY-1: Failed to fetch dynamically imported module: ${ORIGIN}/data/py-1.json` && v.items.length === 0 && v.summary === 'Занятий: 0 · часов: 0', 'edge: a group without a file — the error and its cause, an empty list');

  // section 12: no RegExp.escape — «c», «c+», «c++»
  {
    const page = await open(patch(APP, 'search.js', 'RegExp.escape(clean)', 'clean'));
    const rows = [];
    for (const text of ['c', 'c+', 'c++']) { await type(page.p, text); rows.push((await view(page.p)).summary); }
    check(same(rows, Array(3).fill('Занятий: 2 · часов: 2,5 · ближайшее через 3 дн. 21 ч')) && same(page.out, ['Uncaught SyntaxError: Invalid regular expression: /c++/i: Nothing to repeat']), `section 12: c, c+, c++ without escape: ${JSON.stringify(rows)} ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // section 13: hours without the locale; a non-ISO date in js-2.json; groups.json without with
  await edge(patch(APP, 'main.js', 'hours(visible, locale)', 'hours(visible)'), (p) => click(p, '[data-locale="en-US"]'), (v) => v.summary === 'Lessons: 6 · hours: 9,5 · next in 1 day, 2 hr', 'section 13: EN with Russian hours');
  await edge(patch(APP, 'data/js-2.json', '"2026-10-27T10:00"', '"27.10.2026 10:00"'), null, (v) => v.error === 'Не удалось загрузить расписание JS-2: Temporal error: Invalid character while parsing year value.' && v.summary === 'Занятий: 0 · часов: 0' && v.items.length === 0, 'section 13: a non-ISO date — all groups gone');
  await edge(patch(APP, 'main.js', 'import groups from "./data/groups.json" with { type: "json" };', 'import groups from "./data/groups.json";'), null, (v, page) => v.heading === '' && v.summary === '' && same(page.out, ['Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/json". Strict MIME type checking is enforced for module scripts per HTML spec.']), 'section 13: no with — a blank page');
  // the two experiments
  await edge(patch(APP, 'main.js', '"2026-10-27T12:00"', '"2026-11-01T00:00"'), null, (v) => v.summary === 'Занятий: 6 · часов: 9,5' && v.past === 6, 'experiment 1: after the week — no «ближайшее», six grey lines');
  const PYOK = { ...PY, 'data/py-1.json': '{\n  "lessons": [\n    { "title": "Python: функции", "start": "2026-10-28T09:00", "duration": "PT1H", "room": "302" },\n    { "title": "Python: словари", "start": "2026-10-30T09:00", "duration": "PT1H", "room": "302" }\n  ]\n}' };
  await edge(PYOK, null, (v) => v.items.length === 8 && v.summary === 'Занятий: 8 · часов: 11,5 · ближайшее через 21 ч', 'experiment 2: a fourth group — data only');
  // section 6 and 8: a promise of Promise.all is in group order; the path of import() is relative to load.js
  check(APP['load.js'].includes('import(`./data/${group.id}.json`'), 'section 6: import() of ./data/… in load.js');

  // the notes: only comments
  for (const blk of all.student.blocks) check(blk.code.split(LF).every((l) => l.startsWith('//')), `notes: the block is a map in comments (${blk.code.split(LF)[0].slice(0, 30)})`);

  // tasks
  const T = all.tasks.blocks;
  check(T.length === 1 && T[0].code.includes('sum + lesson.duration'), 'tasks: one block — the fragments of task 9');
  // task 1
  {
    const out = await run({ ...APP, 'index.html': undefined, 'main.js': 'import { Lesson } from "./lesson.js";\nimport { loadGroup } from "./load.js";\nimport data from "./data/cpp-1.json" with { type: "json" };\nconst now = Temporal.PlainDateTime.from("2026-10-27T12:00");\nconst lesson = new Lesson(data.lessons[1], "C++-1");\nconsole.log(lesson.title, lesson.end.toString(), lesson.isPast(now), lesson.start.dayOfWeek);\nconst js2 = await loadGroup({ id: "js-2", name: "JS-2" });\nconsole.log(js2.length, js2.every((l) => l.group === "JS-2"));\ntry { await loadGroup({ id: "py-1", name: "PY-1" }); } catch (e) { console.log(e instanceof Error, Error.isError(e), e.cause.name); }' });
    check(same(out, ['C++ и шаблоны 2026-10-31T10:30:00 false 6', '2 true', 'true true TypeError']), `task 1: ${JSON.stringify(out)}`);
  }
  // task 2
  {
    const out = await run({ ...APP, 'index.html': undefined, 'main.js': 'import groups from "./data/groups.json" with { type: "json" };\nimport { loadSchedule } from "./load.js";\nimport { line, hours, when } from "./format.js";\nconst now = Temporal.PlainDateTime.from("2026-10-27T12:00");\nconst lessons = await loadSchedule(groups);\nconst last = lessons.at(-1);\nfor (const locale of ["ru-RU", "en-US"]) console.log(line(last, locale), "|", hours(lessons, locale), "|", now.until(last.start).toLocaleString(locale));\nconsole.log(when(last, "tk"));\ntry { line(last, "tk"); } catch (e) { console.log(e.name, e.message); }' });
    check(same(out, ['сб, 31 окт., 09:00–10:30 · C++-1 · C++ и шаблоны · ауд. 301 | 9,5 | 3 дн. 21 ч', 'Sat, Oct 31, 9:00 – 10:30 AM · C++-1 · C++ и шаблоны · room 301 | 9.5 | 3 days, 21 hr', 'сб, 31 окт., 09:00–10:30', "TypeError Cannot read properties of undefined (reading 'room')"]), `task 2: ${JSON.stringify(out)}`);
  }
  // task 4
  {
    const main = APP['main.js']
      .replace('let lessons = [];', 'let lessons = [];\nlet group = null;')
      .replace('const search = document.querySelector("#search");', 'const search = document.querySelector("#search");\nconst groupButtons = document.querySelector(".groups");')
      .replace('const visible = lessons.filter(matcher(query));', 'const visible = lessons.filter(matcher(query)).filter((lesson) => group === null || lesson.group === group);')
      .replace('  languages.querySelectorAll("button")', '  groupButtons.querySelectorAll("button").forEach((b) => b.classList.toggle("active", (b.dataset.group || null) === group));\n  languages.querySelectorAll("button")')
      .replace('search.addEventListener("input"', 'for (const name of [null, ...groups.map((g) => g.name)]) {\n  const button = document.createElement("button");\n  button.textContent = name ?? "Все";\n  button.dataset.group = name ?? "";\n  groupButtons.append(button, " ");\n}\n\ngroupButtons.addEventListener("click", (event) => {\n  const button = event.target.closest("button");\n  if (!button) return;\n  group = button.dataset.group || null;\n  render();\n});\n\nsearch.addEventListener("input"');
    const files = { ...APP, 'main.js': main, 'index.html': APP['index.html'].replace('  <input id="search"', '  <p class="groups"></p>\n  <input id="search"') };
    const page = await open(files);
    const p = page.p;
    await click(p, '[data-group="JS-2"]');
    const js2 = (await view(p)).summary;
    const active = await p.evaluate(() => [...document.querySelectorAll('.groups .active')].map((b) => b.textContent).join());
    await click(p, '[data-group="JS-1"]');
    await type(p, 'c++');
    const none = (await view(p)).empty;
    await click(p, '[data-group=""]');
    const back = (await view(p)).items.length;
    check(js2 === 'Занятий: 2 · часов: 4 · ближайшее через 1 дн. 22 ч' && active === 'JS-2' && none === 'Ничего не нашлось' && back === 2 && page.out.length === 0, `task 4: ${JSON.stringify([js2, active, none, back, page.out])}`);
    await page.close();
    const more = await open({ ...PYOK, 'main.js': main, 'index.html': files['index.html'] });
    check(await more.p.evaluate(() => document.querySelectorAll('.groups button').length) === 5, 'task 4: a group in groups.json — a new button');
    await more.close();
  }
  // task 5
  {
    const load = APP['load.js'].replace(/export async function loadSchedule[\s\S]*$/, 'export async function loadSchedule(groups) {\n  const results = await Promise.allSettled(groups.map(loadGroup));\n  const lessons = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value).toSorted(Lesson.compare);\n  const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);\n  return { lessons, errors };\n}\n');
    const main = APP['main.js'].replace(/try \{\n  lessons = await loadSchedule\(groups\);\n\} catch \(e\) \{\n  error\.textContent = `\$\{e\.message\}: \$\{e\.cause\.message\}`;\n\}/, 'const result = await loadSchedule(groups);\nlessons = result.lessons;\nerror.replaceChildren(...result.errors.map((e) => {\n  const p = document.createElement("p");\n  p.textContent = `${e.message}: ${e.cause.message}`;\n  return p;\n}));\nerror.hidden = result.errors.length === 0;');
    check(main !== APP['main.js'], 'task 5: the try at the end of main.js replaced');
    const html = APP['index.html'].replace('<p id="error" class="error"></p>', '<div id="error" class="error"></div>');
    const base = { ...APP, 'load.js': load, 'main.js': main, 'index.html': html };
    const errorsOf = (p) => p.evaluate(() => ({ lines: [...document.querySelectorAll('#error p')].map((x) => x.textContent), hidden: document.querySelector('#error').hidden }));
    let page = await open({ ...base, 'data/groups.json': PY['data/groups.json'] });
    let e = await errorsOf(page.p);
    check((await view(page.p)).items.length === 6 && same(e.lines, [`Не удалось загрузить расписание PY-1: Failed to fetch dynamically imported module: ${ORIGIN}/data/py-1.json`]), `task 5: py-1 missing: ${JSON.stringify(e)}`);
    await page.close();
    page = await open({ ...base, 'data/groups.json': PY['data/groups.json'], 'data/js-2.json': APP['data/js-2.json'].replace('"2026-10-27T10:00"', '"27.10.2026 10:00"') });
    e = await errorsOf(page.p);
    check((await view(page.p)).summary === 'Занятий: 4 · часов: 5,5 · ближайшее через 1 дн. 2 ч' && e.lines.length === 2, `task 5: two failures — four lessons: ${(await view(page.p)).summary} ${JSON.stringify(e.lines)}`);
    await page.close();
    page = await open(base);
    e = await errorsOf(page.p);
    check(e.hidden && e.lines.length === 0, 'task 5: no errors — the list of errors is hidden');
    await page.close();
  }
  // task 6
  {
    const format = APP['format.js'].replace('export function line(lesson, locale) {\n  return `${when(lesson, locale)}', 'export function time(lesson, locale) {\n  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).formatRange(lesson.start, lesson.end);\n}\n\nexport function line(lesson, locale) {\n  return `${time(lesson, locale)}');
    const main = APP['main.js'].replace('  list.replaceChildren(...visible.map(makeItem));', '  const days = Map.groupBy(visible, (lesson) => lesson.start.toPlainDate().toString());\n  list.replaceChildren(...[...days].flatMap(([day, items]) => {\n    const title = document.createElement("li");\n    title.className = "day";\n    title.textContent = Temporal.PlainDate.from(day).toLocaleString(locale, { weekday: "long", day: "numeric", month: "long" });\n    return [title, ...items.map(makeItem)];\n  }));');
    const page = await open({ ...APP, 'format.js': format, 'main.js': main });
    const p = page.p;
    const days = () => p.evaluate(() => [...document.querySelectorAll('#lessons li.day')].map((x) => x.textContent));
    const ru = await days();
    const firstLesson = await p.evaluate(() => document.querySelector('#lessons li:not(.day)').textContent);
    await click(p, '[data-locale="en-US"]');
    const en = await days();
    await type(p, 'c++');
    const cpp = await days();
    check(same(ru, ['понедельник, 26 октября', 'вторник, 27 октября', 'среда, 28 октября', 'четверг, 29 октября', 'суббота, 31 октября']) && en[0] === 'Monday, October 26' && cpp.length === 2 && firstLesson === '14:00–15:30 · JS-1 · Модули: import и export · ауд. 201' && page.out.length === 0, `task 6: ${JSON.stringify([ru, en[0], cpp, firstLesson])}`);
    await page.close();
  }
  // task 7
  {
    const main = APP['main.js']
      .replace('import { TEXT, line, hours } from "./format.js";', 'import { TEXT, when, hours } from "./format.js";')
      .replace('function makeItem(lesson) {\n  const li = document.createElement("li");\n  li.textContent = line(lesson, locale);', 'function highlight(title) {\n  const clean = query.trim();\n  if (clean === "") return [title];\n  return title.split(new RegExp(`(${RegExp.escape(clean)})`, "i")).map((part, i) => {\n    if (i % 2 === 0) return part;\n    const mark = document.createElement("mark");\n    mark.textContent = part;\n    return mark;\n  });\n}\n\nfunction makeItem(lesson) {\n  const li = document.createElement("li");\n  li.append(`${when(lesson, locale)} · ${lesson.group} · `, ...highlight(lesson.title), ` · ${TEXT[locale].room} ${lesson.room}`);');
    check(!main.includes('innerHTML'), 'task 7: no innerHTML');
    const page = await open({ ...APP, 'main.js': main });
    const p = page.p;
    const marks = () => p.evaluate(() => [...document.querySelectorAll('#lessons mark')].map((m) => m.textContent));
    const none = await marks();
    await type(p, 'мод');
    const mod = await marks();
    await type(p, 'c++');
    const cpp = await marks();
    await type(p, '(regexp)');
    const re = await marks();
    const lineText = await p.evaluate(() => document.querySelector('#lessons li').textContent);
    check(none.length === 0 && same(mod, ['Мод']) && same(cpp, ['C++', 'C++']) && same(re, ['(RegExp)']) && lineText === 'вт, 27 окт., 10:00–12:00 · JS-2 · Регулярные выражения (RegExp) · ауд. 105' && page.out.length === 0, `task 7: ${JSON.stringify([none, mod, cpp, re, lineText])}`);
    await page.close();
  }
  // task 8
  {
    const groups = APP['data/groups.json'].replace('{ "id": "cpp-1", "name": "C++-1" }', '{ "id": "cpp-1", "name": "C++-1", "lazy": true }');
    const main = APP['main.js']
      .replace('import { loadSchedule } from "./load.js";', 'import { loadSchedule } from "./load.js";\nimport { Lesson } from "./lesson.js";')
      .replace(/try \{\n  lessons = await loadSchedule\(groups\);\n\} catch \(e\) \{\n  error\.textContent = `\$\{e\.message\}: \$\{e\.cause\.message\}`;\n\}\nrender\(\);/, 'const loaded = new Set();\nasync function show(list) {\n  const fresh = list.filter((g) => !loaded.has(g.id));\n  for (const g of fresh) loaded.add(g.id);\n  try {\n    lessons = [...lessons, ...(await loadSchedule(fresh))].toSorted(Lesson.compare);\n  } catch (e) {\n    error.textContent = `${e.message}: ${e.cause.message}`;\n  }\n  render();\n}\n\ndocument.querySelector("#more").addEventListener("click", () => show(groups.filter((g) => g.lazy)));\nawait show(groups.filter((g) => !g.lazy));');
    check(main.includes('show(groups.filter((g) => !g.lazy))'), 'task 8: the start replaced');
    const html = APP['index.html'].replace('  <p id="summary"></p>', '  <button id="more">Показать C++-1</button>\n  <p id="summary"></p>');
    const page = await open({ ...APP, 'data/groups.json': groups, 'main.js': main, 'index.html': html });
    const p = page.p;
    const start = await view(p);
    const before = page.requests.includes('data/cpp-1.json');
    await click(p, '#more');
    const after = await view(p);
    await click(p, '#more');
    const twice = await view(p);
    check(start.summary === 'Занятий: 4 · часов: 7 · ближайшее через 1 дн. 2 ч' && !before && after.items.length === 6 && after.summary.startsWith('Занятий: 6 · часов: 9,5') && twice.items.length === 6 && page.requests.filter((r) => r === 'data/cpp-1.json').length === 1 && page.out.length === 0, `task 8: ${JSON.stringify([start.summary, before, after.summary, twice.items.length, page.requests.filter((r) => r === 'data/cpp-1.json').length])}`);
    await page.close();
  }
  // task 9: the three fragments, each on its own copy
  {
    const frag = T[0].code;
    check(frag.includes('const total = lessons.reduce((sum, lesson) => sum + lesson.duration, 0);') && frag.includes('new RegExp(RegExp.escape(clean), "gi")') && frag.includes('locale = button.textContent;'), 'task 9: the three fragments');
    await edge(patch(APP, 'format.js', 'const total = lessons.reduce((sum, lesson) => sum.add(lesson.duration), new Temporal.Duration());', 'const total = lessons.reduce((sum, lesson) => sum + lesson.duration, 0);'), null, (v, page) => v.items.length === 6 && v.summary === '' && same(page.out, ['Uncaught TypeError: Do not use Temporal.Duration.prototype.valueOf; use Temporal.Duration.prototype.compare for comparison.']), 'task 9, complaint 1: a list and no summary');
    await edge(patch(APP, 'search.js', 'new RegExp(RegExp.escape(clean), "i")', 'new RegExp(RegExp.escape(clean), "gi")'), (p) => type(p, 'и'), (v) => v.summary.startsWith('Занятий: 4 ·'), 'task 9, complaint 2: «и» finds four of six');
    await edge(APP, (p) => type(p, 'и'), (v) => v.items.length === 6, 'task 9: «и» is in all six titles');
    await edge(patch(APP, 'main.js', 'locale = button.dataset.locale;', 'locale = button.textContent;'), (p) => click(p, '[data-locale="en-US"]'), (v, page) => v.heading === 'Расписание на неделю' && v.items.length === 6 && same(page.out, ["Uncaught TypeError: Cannot read properties of undefined (reading 'title')"]), 'task 9, complaint 3: EN changes nothing');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
