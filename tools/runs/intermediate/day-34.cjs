// Course 2, day 34 (the final project, day 2 of 4: implementation of "Карточки 2.0"), in Chrome. The folder of day 33 is
// built first from the lecture of day 33 (its blocks applied in order, temporary ones skipped; storage.js is the block of
// day 31), then the blocks of day 34 change it. What a block does is told by its first line, as on day 33:
//   "// name.js"                         the whole file (in section 11 it must equal the file the pieces made)
//   "// name.js: замена …" / "настоящий …"  functions, methods or listeners of the file replaced by name
//   "// name.js: новый метод после X"     a method put after method X
//   "// name.js: новая функция перед X"   a function put before function X (and the comment above it)
//   "// name.js, перед «text»"            lines put before the line that holds the text
//   "// name.js, в конец X"               lines put at the end of the body of function X
//   "// name.js: конец"                   the last line of the file replaced by the lines
//   "// name.js: так НЕ надо"             like "замена", but only for the next run (or for the check written below)
//   "// в консоли…"                       typed in the console of the student's browser (CDP Runtime.evaluate, REPL
//                                         mode): one browser context for the whole lecture, so localStorage lives on;
//                                         after a file changes the page reloads, as with Live Server
// A result-box after a block runs the folder in a fresh context (data-page of the block, or index.html). A result-box
// with a table.scenario is done by hand: the actions of the first column (split by ", ") on a fresh page, then the
// card and the counter are compared with the other two columns. "консоль пуста" means no output at all.
//   node tools/runs/intermediate/day-34.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-34.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'intermediate/day-34');
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
  if (first.startsWith('// в консоли')) return { op: 'console', plan: first.includes('plan из дня 33') };
  if (first.startsWith('// так НЕ надо — ')) return { op: 'fragment' };   // a wrong line, checked below
  if ((m = first.match(/^\/\/ в конец ([\w./-]+) — /))) return { op: 'tail', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+), продолжение$/))) return { op: 'append', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+), перед «(.+)»$/))) return { op: 'beforeText', name: m[1], text: m[2] };
  if ((m = first.match(/^\/\/ ([\w./-]+), в конец (\w+)$/))) return { op: 'endOf', name: m[1], fn: m[2] };
  if ((m = first.match(/^\/\/ ([\w./-]+): импорты$/))) return { op: 'imports', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): замена строки$/))) return { op: 'lines', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): опечатка$/))) return { op: 'typo', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): заглушка без return$/))) return { op: 'stub', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): так НЕ надо$/))) return { op: 'stub', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): новый метод после (\w+)$/))) return { op: 'after', name: m[1], fn: m[2] };
  if ((m = first.match(/^\/\/ ([\w./-]+): новая функция перед (\w+)$/))) return { op: 'before', name: m[1], fn: m[2] };
  if ((m = first.match(/^\/\/ ([\w./-]+): конец$/))) return { op: 'last', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): (настоящи[йе]|замена) /))) return { op: 'real', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+) — /))) return { op: 'variant', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+\.js)$/))) return { op: 'whole', name: m[1] };
  return { op: null };
};
const body = (code) => code.split(LF).slice(1).join(LF);
// a chunk (function, method, listener) is named by its first line up to "(", without "async"
const keyOf = (line) => line.slice(0, line.indexOf('(')).replace(/^(\s*)async /, '$1');
const isEnd = (line, indent) => line === `${indent}}` || line === `${indent}});`;

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
  const replaceImports = (text, imports, label) => {
    const lines = text.split(LF);
    const from = lines.findIndex((l) => l.startsWith('import '));
    check(from !== 0 && lines[0].startsWith('// '), `${label}: the file starts with its name`);
    if (from < 0) return [lines[0], ...imports.split(LF), '', ...lines.slice(1)].join(LF);
    let to = from;
    while (to < lines.length && lines[to].startsWith('import ')) to++;
    return [...lines.slice(0, from), ...imports.split(LF), ...lines.slice(to)].join(LF);
  };
  const chunksOf = (code) => {
    const lines = code.split(LF);
    const chunks = [];
    let lead = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      if (lines[i].trim().startsWith('//')) { lead.push(lines[i]); continue; }
      const indent = lines[i].match(/^ */)[0];
      let j = i;
      while (!isEnd(lines[j], indent)) j++;
      chunks.push({ lead, lines: lines.slice(i, j + 1) });
      lead = [];
      i = j;
    }
    return chunks;
  };
  const findChunk = (lines, key) => {
    const start = lines.findIndex((l) => l.includes('(') && keyOf(l) === key);
    if (start < 0) return null;
    const indent = lines[start].match(/^ */)[0];
    let end = start;
    while (end < lines.length && !isEnd(lines[end], indent)) end++;
    return { start, end };
  };
  const replaceChunks = (text, code, label) => {
    let out = text.split(LF);
    for (const chunk of chunksOf(code)) {
      const at = findChunk(out, keyOf(chunk.lines[0]));
      check(at !== null, `${label}: «${keyOf(chunk.lines[0]).trim()}» found`);
      if (at) out = [...out.slice(0, at.start), ...chunk.lines, ...out.slice(at.end + 1)];
    }
    return out.join(LF);
  };
  const insertAfter = (text, code, fn, label) => {
    const out = text.split(LF);
    const at = findChunk(out, `  ${fn}`);
    check(at !== null, `${label}: method «${fn}» found`);
    return [...out.slice(0, at.end + 1), '', ...code.split(LF), ...out.slice(at.end + 1)].join(LF);
  };
  const insertBefore = (text, code, fn, label) => {
    const out = text.split(LF);
    const at = findChunk(out, `function ${fn}`);
    check(at !== null, `${label}: function «${fn}» found`);
    let start = at.start;
    while (start > 0 && out[start - 1].startsWith('//')) start--;
    return [...out.slice(0, start), ...code.split(LF), '', ...out.slice(start)].join(LF);
  };
  const insertBeforeText = (text, code, needle, label) => {
    const out = text.split(LF);
    const at = out.findIndex((l) => l.includes(needle));
    check(at > 0, `${label}: a line with «${needle}»`);
    return [...out.slice(0, at), ...code.split(LF), '', ...out.slice(at)].join(LF);
  };
  const insertEndOf = (text, code, fn, label) => {
    const out = text.split(LF);
    const at = findChunk(out, `function ${fn}`);
    check(at !== null, `${label}: function «${fn}» found`);
    return [...out.slice(0, at.end), ...code.split(LF), ...out.slice(at.end)].join(LF);
  };
  const replaceLast = (text, code, label) => {
    const out = text.split(LF);
    const lines = code.split(LF);
    check(out.at(-1) === lines.at(-1), `${label}: the file ends with «${lines.at(-1)}»`);
    return [...out.slice(0, -1), ...lines].join(LF);
  };
  // apply a block to the folder; returns false for blocks that only run (console)
  const apply = (site, overlay, blk, kind, label) => {
    const n = kind.name;
    if (kind.op === 'whole') site[n] = blk.code;
    else if (kind.op === 'append') site[n] = `${site[n].split(LF).filter((l) => !l.includes('потом удалить')).join(LF)}${LF}${LF}${body(blk.code)}`;
    else if (kind.op === 'imports') site[n] = replaceImports(site[n], body(blk.code), label);
    else if (kind.op === 'lines') site[n] = replaceLines(site[n], body(blk.code), label);
    else if (kind.op === 'real') site[n] = replaceChunks(site[n], body(blk.code), label);
    else if (kind.op === 'after') site[n] = insertAfter(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'before') site[n] = insertBefore(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'beforeText') site[n] = insertBeforeText(site[n], body(blk.code), kind.text, label);
    else if (kind.op === 'endOf') site[n] = insertEndOf(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'last') site[n] = replaceLast(site[n], body(blk.code), label);
    else if (kind.op === 'typo') overlay[n] = replaceLines(site[n], body(blk.code), label);
    else if (kind.op === 'stub') overlay[n] = replaceChunks(site[n], body(blk.code), label);
    else if (kind.op === 'variant') overlay[n] = blk.code;
    else if (kind.op === 'tail') overlay[n] = `${site[n]}${LF}${blk.code}`;
    else return false;
    return true;
  };

  // a browser context serving a folder (a function, so the folder may change while the page is open)
  const open = async (files, start) => {
    const folder = typeof files === 'function' ? files : () => files;
    const ctx = await b.newContext(MAIN);
    const requests = [];
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const site = folder();
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      requests.push(name);
      if (name === '' && !site['index.html']) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: DEFAULT_PAGE });
      if (!(name in site) || site[name] === undefined) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
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
    const first = folder();
    await p.goto(`${ORIGIN}/${start ?? (first['index.html'] ? 'index.html' : '')}`);
    await p.waitForTimeout(600);
    const repl = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true });
      if (r.exceptionDetails) out.push(`Uncaught ${(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split(LF)[0]}`);
      if (expression.includes('location.reload()')) {
        await p.waitForLoadState('load');
        await p.waitForTimeout(600);
      }
    };
    const reload = async () => { await p.reload(); await p.waitForTimeout(600); };
    return { p, ctx, out, requests, repl, reload, close: () => ctx.close() };
  };
  // what the page shows
  const view = (p) => p.evaluate(() => ({
    card: document.querySelector('#card')?.textContent ?? null,
    counter: document.querySelector('#counter')?.textContent ?? null,
    know: document.querySelector('#know') ? !document.querySelector('#know').hidden : null,
    again: document.querySelector('#again') ? !document.querySelector('#again').hidden : null,
    active: [...document.querySelectorAll('.decks .active')].map((x) => x.textContent).join(),
    buttons: [...document.querySelectorAll('.decks button')].map((x) => x.textContent).join(),
    loading: document.querySelector('#loading') ? !document.querySelector('#loading').hidden : null,
    error: document.querySelector('#error')?.textContent ?? null,
  }));
  // the actions of a scenario row, as a student does them
  const act = async (page, phrase) => {
    const p = page.p;
    let m;
    if (phrase === 'открыли') return true;
    if (phrase === 'щелчок по карточке') await p.click('#card');
    else if (phrase === '«Знаю»') await p.click('#know');
    else if (phrase === '«Повторить»') await p.click('#again');
    else if ((m = phrase.match(/^колода «(.+)»$/))) await p.click(`.decks button:text-is("${m[1]}")`);
    else if (phrase === 'обновили страницу') { await page.reload(); return true; }
    else if (phrase === '«Начать сначала» → Отмена') { p.once('dialog', (d) => d.dismiss()); await p.click('#reset'); }
    else if (phrase === '«Начать сначала» → OK') { p.once('dialog', (d) => d.accept()); await p.click('#reset'); }
    else return false;
    await p.waitForTimeout(250);
    return true;
  };
  const scenario = async (files, rows, label) => {
    const page = await open(files);
    for (const [i, [did, cardWant, counterWant]] of rows.entries()) {
      let known = true;
      for (const phrase of did.split(', ')) known = (await act(page, phrase)) && known;
      const v = await view(page.p);
      check(known && v.card === cardWant && v.counter === counterWant, `${label}, row ${i + 1} «${did}»: ${v.card} | ${v.counter}`);
    }
    check(page.out.length === 0, `${label}: no console output ${JSON.stringify(page.out)}`);
    await page.close();
  };
  const blocksOf = async (file) => {
    const ctx = await b.newContext(MAIN);
    const src = await ctx.newPage();
    await src.goto('file:///' + file.replace(/\\/g, '/'));
    const r = await src.evaluate(() => ({
      blocks: [...document.querySelectorAll('pre.code')].map((pre) => {
        const next = pre.nextElementSibling;
        const box = next && next.matches('.result-box') ? next : null;
        return {
          code: pre.textContent,
          file: pre.dataset.file ?? null,
          page: pre.dataset.page ?? null,
          box: box && !box.querySelector('table') ? box.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          scenario: box && box.querySelector('table.scenario') ? [...box.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())) : null,
          cheat: !!pre.closest('.cheatsheet'),
        };
      }),
      text: document.querySelector('.container').innerText,
    }));
    await ctx.close();
    return r;
  };

  // the folder of day 33: its lecture applied block by block (console and temporary blocks skipped)
  const day31 = await blocksOf(path.join(ROOT, 'intermediate/day-31/lecture.html'));
  const day33 = await blocksOf(path.join(ROOT, 'intermediate/day-33/lecture.html'));
  const BASE = { 'storage.js': day31.blocks.find((x) => x.code.startsWith('// storage.js')).code };
  for (const blk of day33.blocks) {
    if (blk.cheat || blk.code.startsWith('// js/')) continue;
    const kind = kindOf(blk);
    apply(BASE, {}, blk, kind, `day 33 (${blk.code.split(LF)[0]})`);
    if (kind.name && kind.name.startsWith('data-bad/') && !('data-bad/school.json' in BASE)) {
      BASE['data-bad/school.json'] = BASE['data/school.json'];
      BASE['data-bad/home.json'] = BASE['data/home.json'];
    }
  }
  const PLAN = day33.blocks.find((x) => x.code.includes('const plan = [')).code;
  const PLAN_DATA = PLAN.slice(0, PLAN.indexOf('];') + 2);
  const HAND = day33.blocks.find((x) => x.code.includes('localStorage.setItem("cards2:progress"')).code.match(/'(\{.*\})'/)[1];
  {
    const page = await open(BASE);
    const v = await view(page.p);
    check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && page.out.length === 0 && BASE['deck.js'].includes('// день 34'), `the folder of day 33: ${JSON.stringify(v)}`);
    await page.close();
  }

  const all = {};
  for (const name of PAGES) all[name] = await blocksOf(path.join(DAY, `${name}.html`));
  const lec = all.lecture.text;

  // the lecture of day 34
  const site = { ...BASE };
  let version = 0;
  let overlay = {};
  let student = null, studentVersion = -1;   // the student's browser: one context, console blocks
  const used = new Set();
  let pending = [];
  const L = all.lecture.blocks;
  const late = [];                           // temporary blocks without a box: checked below, by their index
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  for (const [i, blk] of L.entries()) {
    if (blk.cheat) continue;
    const kind = kindOf(blk);
    const label = `lecture #${i} (${blk.code.split(LF)[0]})`;
    check(kind.op !== null, `${label}: the block says what it does`);
    if (kind.op === null) continue;
    if (kind.op === 'whole' && kind.name === 'main.js') check(site['main.js'] === blk.code, `${label}: the pieces add up to the whole main.js`);
    const before = JSON.stringify(site);
    if (kind.op !== 'console') apply(site, overlay, blk, kind, label);
    if (JSON.stringify(site) !== before) version++;
    pending.push(i);
    let out = null;
    if (kind.op === 'console') {
      if (!student) { student = await open(() => site); studentVersion = version; }
      if (studentVersion !== version) { await student.reload(); studentVersion = version; }
      await student.repl(kind.plan ? `${PLAN_DATA}${LF}${blk.code}` : blk.code);
      if (blk.box) out = student.out.splice(0);
    } else if (blk.box) {
      const page = await open({ ...site, ...overlay }, blk.page ?? undefined);
      await page.close();
      out = page.out;
      overlay = {};
    } else if (blk.scenario) {
      await scenario({ ...site }, blk.scenario, label);
      for (const k of pending) used.add(k);
      pending = [];
    } else if (Object.keys(overlay).length) {
      late.push({ i, overlay });
      overlay = {};
    }
    if (out) {
      if (!quiet) {
        console.log(`\n--- ${label}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      const silent = blk.box[0].startsWith('консоль пуста');
      check(!out.some((l) => l.includes('<object') || l.includes('<array')), `${label}: no object printed`);
      check(silent ? out.length === 0 : same(out, blk.box), `${label}: result-box = output (${out.length} lines)${(silent ? out.length === 0 : same(out, blk.box)) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      for (const k of pending) used.add(k);
      pending = [];
    }
  }
  for (const k of pending) used.add(k);
  if (student) await student.close();
  const APP = { ...site };

  const patch = (files, name, from, to) => {
    check(files[name].includes(from), `patch ${name}: «${from.slice(0, 40)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };
  const clicks = async (files, phrases, label, want) => {
    const page = await open(files);
    for (const phrase of phrases) check(await act(page, phrase), `${label}: «${phrase}» is an action`);
    const v = await view(page.p);
    const ok = await want(v, page);
    check(ok, `${label}: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
  };

  // section 10: the reset that did not reset (the "так НЕ надо" block without a box)
  {
    const wrong = late.find((x) => x.overlay['main.js'] && x.overlay['main.js'].includes('progress = new Map();'));
    check(!!wrong && late.length === 1, `section 10: one temporary block without a box (${late.length})`);
    const files = { ...APP, ...wrong.overlay };
    await clicks(files, ['«Знаю»', '«Начать сначала» → OK'], 'section 10, step 1: const', (v, page) => v.card === 'teacher' && v.counter === 'На сегодня: 2 из 3' && same(page.out, ['Uncaught TypeError: Assignment to constant variable.']) && lec.includes('Uncaught TypeError: Assignment to constant variable.'));
    const withLet = patch(files, 'main.js', 'const progress = ', 'let progress = ');
    await clicks(withLet, ['«Знаю»', '«Начать сначала» → OK'], 'section 10, step 2: let — the screen is as before, the storage is empty', async (v, page) => v.card === 'teacher' && v.counter === 'На сегодня: 2 из 3' && page.out.length === 0 && (await page.p.evaluate(() => localStorage.getItem('cards2:progress'))) === '{"$map":[]}');
    await clicks(withLet, ['«Знаю»', '«Начать сначала» → OK', 'обновили страницу'], 'section 10, step 2: after a reload all three are back', (v) => v.card === 'book' && v.counter === 'На сегодня: 3 из 3');
  }

  // the finished project
  check(APP['main.js'] === L.find((x) => x.code.startsWith('// main.js\n')).code, 'main.js of the folder is the whole program of section 11');
  check(APP['deck.js'].includes('cardAt(position, today) {') && !APP['deck.js'].includes('// день 34') && APP['deck.js'].includes('today.add({ days: step * 2 })'), 'deck.js: cardAt, the real know');
  for (const name of ['card.js', 'load.js', 'errors.js', 'storage.js', 'index.html', 'test.html']) check(APP[name] === BASE[name], `${name}: not changed since day 33`);
  {
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && same(v, { card: 'book', counter: 'На сегодня: 3 из 3', know: true, again: true, active: 'школа', buttons: 'школа,еда,дом', loading: false, error: '' }), `the project loads without a word in the console: ${JSON.stringify(v)}`);
    await page.close();
    const tests = await open(APP, 'test.html');
    check(same(tests.out, ['проверки закончены']), `the page of checks: ${JSON.stringify(tests.out)}`);
    await tests.close();
  }

  // section 5: the wrong know on the page — the card stays; without flipped = false the next card shows its translation
  {
    const wrongKnow = L.find((x) => x.code.startsWith('// deck.js: так НЕ надо') && x.code.includes('state.next.add'));
    await clicks({ ...APP, 'deck.js': replaceChunks(APP['deck.js'], body(wrongKnow.code), 'section 5 on the page') }, ['«Знаю»'], 'section 5: the wrong know — «Знаю» and the card stays', (v) => v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && lec.includes('«Знаю» — и карточка на месте'));
    await clicks(patch(APP, 'main.js', '  opened.get(chosen).know(word.id, today);\n  flipped = false;\n', '  opened.get(chosen).know(word.id, today);\n'), ['щелчок по карточке', '«Знаю»'], 'section 5: without flipped = false the next card opens with its translation', (v) => v.card === 'учитель');
  }
  // section 6: without % the page does not fail — «На сегодня всё» with «3 из 3», the buttons gone
  {
    const noRest = L.find((x) => x.code.startsWith('// deck.js: так НЕ надо') && x.code.includes('cards[position];'));
    await clicks({ ...APP, 'deck.js': replaceChunks(APP['deck.js'], body(noRest.code), 'section 6 on the page') }, ['«Повторить»', '«Повторить»', '«Повторить»'], 'section 6: three «Повторить» without %', (v, page) => v.card === 'На сегодня всё' && v.counter === 'На сегодня: 3 из 3' && !v.know && !v.again && page.out.length === 0 && lec.includes('хотя счётчик пишет «На сегодня: 3 из 3»'));
    await clicks(APP, ['«Знаю»', '«Повторить»', '«Повторить»'], 'section 6: after «Знаю» on book — teacher, lesson, teacher again', (v) => v.card === 'teacher');
  }
  // section 7: the buttons in the order of decks.json; food.json once — with opened and even without it
  {
    const page = await open(APP);
    for (const phrase of ['колода «еда»', 'колода «школа»', 'колода «еда»', 'колода «еда»']) await act(page, phrase);
    const v = await view(page.p);
    check(v.active === 'еда' && v.buttons === 'школа,еда,дом' && page.requests.filter((r) => r === 'data/food.json').length === 1, `section 7: buttons, the active one, food.json once: ${JSON.stringify(v)} ${page.requests.filter((r) => r === 'data/food.json').length}`);
    await page.close();
    const noCache = patch(APP, 'main.js', '    if (!opened.has(chosen)) opened.set(', '    opened.set(');
    const page2 = await open(noCache);
    for (const phrase of ['колода «еда»', 'колода «школа»', 'колода «еда»']) await act(page2, phrase);
    check(page2.requests.filter((r) => r === 'data/food.json').length === 1 && (await view(page2.p)).card === 'bread', 'section 7: without opened import() still asks for food.json once (day 31)');
    await page2.close();
  }
  // section 8: the string in storage is the one typed by hand on day 33; «сегодня» = 28 October brings book back
  {
    check(lec.includes(HAND) && HAND === '{"$map":[[1,{"next":{"$date":"2026-10-28"},"step":2}]]}', 'section 8: the saved string is the string of day 33');
    let served = APP;
    const page = await open(() => served);
    await act(page, '«Знаю»');
    served = patch(APP, 'main.js', '"2026-10-26"', '"2026-10-28"');
    await page.reload();
    const v = await view(page.p);
    await act(page, '«Знаю»');
    const saved = await page.p.evaluate(() => localStorage.getItem('cards2:progress'));
    check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && saved === '{"$map":[[1,{"next":{"$date":"2026-11-01"},"step":4}]]}' && lec.includes('отложит её') && lec.includes('до 1 ноября'), `section 8: on 28 October book is back, «Знаю» — to 1 November: ${JSON.stringify(v)} ${saved}`);
    await page.close();
  }
  // section 8: JSON.stringify instead of save — "{}" in storage, after a reload the error comes up in deck.js
  {
    const frag = L.find((x) => x.code.startsWith('// так НЕ надо — последняя строка render'));
    const line = frag.code.split(LF)[1];
    const files = patch(APP, 'main.js', '  localStorage.setItem(KEY, save(progress));', line);
    const page = await open(files);
    await act(page, '«Знаю»');
    const v1 = await view(page.p);
    const saved = await page.p.evaluate(() => localStorage.getItem('cards2:progress'));
    await page.reload();
    const v2 = await view(page.p);
    check(v1.card === 'teacher' && saved === '{}' && v2.card === '' && v2.counter === '' && same(page.out, ['Uncaught TypeError: this[#progress].get is not a function']) && lec.includes('Uncaught TypeError: this[#progress].get is not a function'), `section 8: JSON.stringify — "{}", then an empty card and the error of deck.js: ${JSON.stringify([v1.card, saved, v2, page.out])}`);
    await page.close();
  }
  // section 5: a missed week — «Знаю» on 5 November puts the card to 13 November
  {
    const page = await open({ ...APP, 'index.html': undefined, 'main.js': 'import { Deck } from "./deck.js";\nimport { Card } from "./card.js";\nconst progress = new Map();\nconst deck = new Deck([new Card({ id: 1, word: "book", translation: "книга" })], progress);\nconst day = (s) => Temporal.PlainDate.from(s);\ndeck.know(1, day("2026-10-26"));\ndeck.know(1, day("2026-10-28"));\nconsole.log(String(progress.get(1).next), deck.due(day("2026-11-05")).length);\ndeck.know(1, day("2026-11-05"));\nconsole.log(String(progress.get(1).next), progress.get(1).step);' });
    check(same(page.out, ['2026-11-01 1', '2026-11-13 8']) && lec.includes('отложит её до 13 ноября'), `section 5: a missed week: ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // section 7: «еда» and «дом» clicked at once — «дом» on the page, each file once
  {
    const page = await open(APP);
    await page.p.evaluate(() => { document.querySelector('[data-deck="food"]').click(); document.querySelector('[data-deck="home"]').click(); });
    await page.p.waitForTimeout(500);
    const v1 = await view(page.p);
    await act(page, 'колода «еда»');
    const v2 = await view(page.p);
    check(v1.card === 'house' && v1.active === 'дом' && v2.card === 'bread' && page.out.length === 0 && ['data/food.json', 'data/home.json'].every((f) => page.requests.filter((r) => r === f).length === 1), `section 7: two decks at once: ${JSON.stringify([v1, v2.card])}`);
    await page.close();
  }
  // section 12: what makes the page of checks red
  {
    const red = async (files, label) => {
      const page = await open(files, 'test.html');
      check(page.out.some((l) => l.startsWith('Assertion failed: ')) && !page.out.some((l) => l.startsWith('Uncaught')) && page.out.at(-1) === 'проверки закончены', `section 12, the page of checks is red: ${label} ${JSON.stringify(page.out)}`);
      await page.close();
    };
    await red(patch(APP, 'data/home.json', '"translation": "окно"', '"translaton": "окно"'), 'a deck file with a typo');
    await red(patch(APP, 'card.js', '    if (!word || !translation) throw', '    if (false) throw'), 'the guard of Card removed');
    await red(patch(APP, 'deck.js', 'Temporal.PlainDate.compare(state.next, today) <= 0', 'Temporal.PlainDate.compare(state.next, today) < 0'), 'the comparison of dates broken');
  }
  // section 9: on «На сегодня всё» the buttons are hidden, and a click() from the console does nothing bad
  {
    const page = await open(APP);
    for (const phrase of ['колода «дом»', '«Знаю»', '«Знаю»']) await act(page, phrase);
    await page.repl('document.querySelector("#know").click(); document.querySelector("#again").click();');
    const v = await view(page.p);
    check(v.card === 'На сегодня всё' && !v.know && !v.again && page.out.length === 0, `section 9: hidden buttons, click() — no red line: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
  }
  // section 12: the edge cases
  await clicks(APP, ['колода «дом»', '«Знаю»', '«Повторить»'], 'edge: one card today, «Повторить» — the same card', (v) => v.card === 'window');
  await clicks(APP, ['«Повторить»', '«Повторить»', '«Знаю»'], 'edge: «Знаю» on the last card of the circle — the first again', (v) => v.card === 'book');
  {
    const page = await open(APP);
    await page.p.evaluate(() => localStorage.setItem('cards2:progress', 'сломано'));
    await page.reload();
    const v = await view(page.p);
    check(v.loading && v.card === '' && v.buttons === '' && page.out.length === 1 && page.out[0].startsWith('Uncaught SyntaxError: ') && page.out[0].includes('is not valid JSON'), `edge: a broken string in storage — main.js fails on load, «Загрузка…» stays: ${JSON.stringify(page.out)}`);
    await page.close();
  }
  {
    const city = patch(APP, 'data/decks.json', '{ "id": "home", "name": "дом" }', '{ "id": "home", "name": "дом" },\n  { "id": "city", "name": "город" }');
    const page = await open(city);
    await act(page, 'колода «город»');
    const v1 = await view(page.p);
    await page.p.click('#again');
    await page.p.waitForTimeout(250);
    const v2 = await view(page.p);
    check(v1.card === 'book' && v1.error.startsWith('Не удалось загрузить колоду «город»') && v2.card === 'На сегодня всё' && same(page.out, ["Uncaught TypeError: Cannot read properties of undefined (reading 'due')"]), `edge: a deck without a file, «Повторить» — the old word, then «На сегодня всё» and a red line: ${JSON.stringify([v1.card, v2.card, page.out])}`);
    await page.close();
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

  // task 8: the three complaints, each on its own copy (progress is declared with let)
  {
    const T = all.tasks.blocks;
    check(T.length === 1 && T[0].code.includes('cards[position];') && T[0].code.includes('progress = new Map();'), 'tasks: one block — the fragments of task 8');
    const one = { ...APP, 'deck.js': APP['deck.js'].replace('cards[position % cards.length]', 'cards[position]') };
    await clicks(one, ['«Повторить»', '«Повторить»', '«Повторить»'], 'task 8, complaint 1: «На сегодня всё» and «3 из 3»', (v) => v.card === 'На сегодня всё' && v.counter === 'На сегодня: 3 из 3');
    const tests = await open(one, 'test.html');
    check(same(tests.out, ['Assertion failed: после последней — снова первая', 'проверки закончены']), `task 8, complaint 1: one red line on the page of checks: ${JSON.stringify(tests.out)}`);
    await tests.close();
    await clicks(patch(APP, 'main.js', '  opened.get(chosen).know(word.id, today);\n  flipped = false;\n', '  opened.get(chosen).know(word.id, today);\n'), ['щелчок по карточке', '«Знаю»'], 'task 8, complaint 2: the next card with its translation', (v) => v.card === 'учитель');
    const three = patch(patch(APP, 'main.js', '  progress.clear();', '  progress = new Map();'), 'main.js', 'const progress = ', 'let progress = ');
    await clicks(three, ['«Знаю»', '«Начать сначала» → OK'], 'task 8, complaint 3: nothing reset, storage empty', async (v, page) => v.card === 'teacher' && (await page.p.evaluate(() => localStorage.getItem('cards2:progress'))) === '{"$map":[]}');
  }

  // every block of the lecture is used: by a run, a scenario, the finished project or a check above
  for (const [i, blk] of L.entries()) if (!blk.cheat) check(used.has(i) || late.some((x) => x.i === i), `lecture #${i} (${blk.code.split(LF)[0]}) is used`);

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
