// Course 2, day 35 (the final project, day 3 of 4: "Карточки 2.0" on a phone, edge cases, someone else's code, search),
// in Chrome. The folder of day 34 is built first: the lecture of day 33 block by block (as day-34.cjs does), then the
// lasting blocks of the lecture of day 34. Then the blocks of day 35 change it. What a block does is told by its first
// line, as on days 33 and 34, plus:
//   "<!-- index.html, после «text» -->"            lines put after the line that holds the text
//   "<!-- index.html, в конец <tag> -->"           lines put before </tag>
//   "<!-- index.html: замена строки -->"           CSS rules replaced by their selector
//   "<!-- index.html: обернуть … -->"              the inner lines found in the file and wrapped
//   "<!-- index.html, перед «text» — на время опыта -->"   lines put before the text, for the next run only
//   "// name.js соседа"                            the neighbour's file, kept aside (checked below)
//   "// name.js соседа: catch"                     our file of day 34 with the neighbour's catch
//   "// name.js: программа целиком"                the whole file with the parts unchanged since day 34 folded into
//                                                  "… — без изменений с дня 34" lines: compared, not applied
//   "// name.js, после «text»"                     lines put after the line that holds the text
//   "// в консоли, режим телефона 360 …"           typed in the console of a second student's browser, a phone 360
//   "// замер …"                                   not run: the measurement is repeated by a check below
// A result-box with a table.scenario is done by hand; its columns (Карточка, Счётчик, Найдено) are read from the head,
// a box with data-phone runs on a phone 360.
//   node tools/runs/intermediate/day-35.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-35.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'intermediate/day-35');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const PHONE = { ...MAIN, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
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
  if ((m = first.match(/^<!-- ([\w./-]+), после «(.+)» -->$/))) return { op: 'htmlAfter', name: m[1], text: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+), перед «(.+)» — на время опыта -->$/))) return { op: 'htmlTemp', name: m[1], text: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+), в конец <(\w+)> -->$/))) return { op: 'htmlEnd', name: m[1], tag: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+): замена строки -->$/))) return { op: 'htmlLine', name: m[1] };
  if ((m = first.match(/^<!-- ([\w./-]+): обернуть .+ -->$/))) return { op: 'htmlWrap', name: m[1] };
  if (first.startsWith('// в консоли, режим телефона')) return { op: 'console', phone: true };
  if (first.startsWith('// в консоли')) return { op: 'console', plan: first.includes('plan из дня 33') };
  if (first.startsWith('// замер')) return { op: 'note' };
  if (first.startsWith('// так НЕ надо — ')) return { op: 'fragment' };
  if ((m = first.match(/^\/\/ ([\w./-]+) соседа$/))) return { op: 'neighbour', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+) соседа: catch$/))) return { op: 'neighbourCatch', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): программа целиком$/))) return { op: 'collapsed', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+), после «(.+)»$/))) return { op: 'afterText', name: m[1], text: m[2] };
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
const indentOf = (line) => line.match(/^ */)[0];

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // edits of a JS file (as on day 34; "legacy" — the blank lines of day 34 for the folder of day 34)
  const replaceLines = (text, lines, label) => {
    let out = text;
    for (const line of lines.split(LF)) {
      const key = line.includes(' = ') ? line.slice(0, line.indexOf(' = ') + 3) : line.slice(0, line.indexOf('(') + 1);
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
      const indent = indentOf(lines[i]);
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
    const indent = indentOf(lines[start]);
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
  // a function or a listener gets blank lines around it, single lines (const, console.assert) do not
  const insertBeforeText = (text, code, needle, label, legacy) => {
    const out = text.split(LF);
    const lines = code.split(LF);
    const at = out.findIndex((l) => l.includes(needle));
    check(at > 0, `${label}: a line with «${needle}»`);
    const chunk = lines.length > 1 && /^\}\)?;?$/.test(lines.at(-1).trim());
    const before = !legacy && chunk && out[at - 1].trim() !== '' ? [''] : [];
    const after = legacy || chunk ? [''] : [];
    return [...out.slice(0, at), ...before, ...lines, ...after, ...out.slice(at)].join(LF);
  };
  const insertAfterText = (text, code, needle, label) => {
    const out = text.split(LF);
    const at = out.findIndex((l) => l.includes(needle));
    check(at >= 0, `${label}: a line with «${needle}»`);
    return [...out.slice(0, at + 1), ...code.split(LF), ...out.slice(at + 1)].join(LF);
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
  // edits of index.html: the block's lines get the indentation of the place
  const htmlAt = (out, needle, label) => {
    const at = out.findIndex((l) => l.includes(needle));
    check(at >= 0, `${label}: a line with «${needle}»`);
    return at;
  };
  const htmlAfter = (text, code, needle, label) => {
    const out = text.split(LF);
    const at = htmlAt(out, needle, label);
    return [...out.slice(0, at + 1), ...code.split(LF).map((l) => indentOf(out[at]) + l), ...out.slice(at + 1)].join(LF);
  };
  const htmlBefore = (text, code, needle, label) => {
    const out = text.split(LF);
    const at = htmlAt(out, needle, label);
    return [...out.slice(0, at), ...code.split(LF).map((l) => indentOf(out[at]) + l), ...out.slice(at)].join(LF);
  };
  const htmlEnd = (text, code, tag, label) => {
    const out = text.split(LF);
    const at = out.findIndex((l) => l.trim() === `</${tag}>`);
    check(at >= 0, `${label}: </${tag}> found`);
    return [...out.slice(0, at), ...code.split(LF).map((l) => `${indentOf(out[at])}  ${l}`), ...out.slice(at)].join(LF);
  };
  const htmlLine = (text, code, label) => {
    const out = text.split(LF);
    for (const line of code.split(LF)) {
      const key = line.slice(0, line.indexOf(' {') + 2);
      const at = out.findIndex((l) => l.trim().startsWith(key));
      check(key.length > 2 && at >= 0, `${label}: a rule «${key}» in the file`);
      if (at >= 0) out[at] = indentOf(out[at]) + line;
    }
    return out.join(LF);
  };
  const htmlWrap = (text, code, label) => {
    const lines = code.split(LF);
    const wrapped = lines.slice(1, -1).map((l) => l.trim());
    const out = text.split(LF);
    const at = out.findIndex((l, i) => wrapped.every((x, k) => out[i + k] !== undefined && out[i + k].trim() === x));
    check(at >= 0, `${label}: the ${wrapped.length} wrapped lines stand together in the file`);
    return [...out.slice(0, at), ...lines.map((l) => indentOf(out[at]) + l), ...out.slice(at + wrapped.length)].join(LF);
  };
  // apply a block to the folder; returns false for blocks that only run (console) or are kept aside
  const apply = (site, overlay, blk, kind, label, legacy = false) => {
    const n = kind.name;
    if (kind.op === 'whole') site[n] = blk.code;
    else if (kind.op === 'append') site[n] = `${site[n].split(LF).filter((l) => !l.includes('потом удалить')).join(LF)}${LF}${LF}${body(blk.code)}`;
    else if (kind.op === 'imports') site[n] = replaceImports(site[n], body(blk.code), label);
    else if (kind.op === 'lines') site[n] = replaceLines(site[n], body(blk.code), label);
    else if (kind.op === 'real') site[n] = replaceChunks(site[n], body(blk.code), label);
    else if (kind.op === 'after') site[n] = insertAfter(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'before') site[n] = insertBefore(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'beforeText') site[n] = insertBeforeText(site[n], body(blk.code), kind.text, label, legacy);
    else if (kind.op === 'afterText') site[n] = insertAfterText(site[n], body(blk.code), kind.text, label);
    else if (kind.op === 'endOf') site[n] = insertEndOf(site[n], body(blk.code), kind.fn, label);
    else if (kind.op === 'last') site[n] = replaceLast(site[n], body(blk.code), label);
    else if (kind.op === 'htmlAfter') site[n] = htmlAfter(site[n], body(blk.code), kind.text, label);
    else if (kind.op === 'htmlEnd') site[n] = htmlEnd(site[n], body(blk.code), kind.tag, label);
    else if (kind.op === 'htmlLine') site[n] = htmlLine(site[n], body(blk.code), label);
    else if (kind.op === 'htmlWrap') site[n] = htmlWrap(site[n], body(blk.code), label);
    else if (kind.op === 'htmlTemp') overlay[n] = htmlBefore(site[n], body(blk.code), kind.text, label);
    else if (kind.op === 'typo') overlay[n] = replaceLines(site[n], body(blk.code), label);
    else if (kind.op === 'stub') overlay[n] = replaceChunks(site[n], body(blk.code), label);
    else if (kind.op === 'variant') overlay[n] = blk.code;
    else if (kind.op === 'tail') overlay[n] = `${site[n]}${LF}${blk.code}`;
    else return false;
    return true;
  };

  // a browser context serving a folder (a function, so the folder may change while the page is open)
  const open = async (files, start, opts = {}) => {
    const folder = typeof files === 'function' ? files : () => files;
    const ctx = await b.newContext(opts.phone ? PHONE : MAIN);
    if (opts.init) await ctx.addInitScript(opts.init);
    if (opts.storage !== undefined) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('cards2:progress', s); sessionStorage.setItem('seeded', '1'); } }, opts.storage);
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
    const net = [];
    const stacks = [];
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
      stacks.push(d.exception?.description ?? '');
    });
    cdp.on('Log.entryAdded', (e) => {
      if (e.entry.level !== 'error') return;
      if (e.entry.source === 'network') net.push(e.entry.text);
      else out.push(e.entry.text);
    });
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
    return { p, ctx, out, net, stacks, requests, repl, reload, close: () => ctx.close() };
  };
  // what the page shows
  const view = (p) => p.evaluate(() => ({
    card: document.querySelector('#card')?.textContent ?? null,
    counter: document.querySelector('#counter')?.textContent ?? null,
    know: document.querySelector('#know') ? !document.querySelector('#know').hidden : null,
    again: document.querySelector('#again') ? !document.querySelector('#again').hidden : null,
    trainer: document.querySelector('#trainer') ? !document.querySelector('#trainer').hidden : null,
    active: [...document.querySelectorAll('.decks .active')].map((x) => x.textContent).join(),
    buttons: [...document.querySelectorAll('.decks button')].map((x) => x.textContent).join(),
    loading: document.querySelector('#loading') ? !document.querySelector('#loading').hidden : null,
    error: document.querySelector('#error')?.textContent ?? null,
    found: [...document.querySelectorAll('#found li')].map((x) => x.textContent),
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
    else if ((m = phrase.match(/^поиск «(.*)»/))) await p.fill('#search', m[1]);
    else if (phrase === 'очистили поиск') await p.fill('#search', '');
    else if ((m = phrase.match(/^в хранилище «(.+)»$/))) { await p.evaluate((s) => localStorage.setItem('cards2:progress', s), m[1]); return true; }
    else return false;
    await p.waitForTimeout(300);
    return true;
  };
  const columns = { 'Карточка': (v) => v.card, 'Счётчик': (v) => v.counter, 'Найдено': (v) => (v.found.length ? v.found.join(LF) : '—') };
  const scenario = async (files, sc, phone, label) => {
    const page = await open(files, undefined, { phone });
    const cols = sc.head.slice(1);
    check(cols.every((c) => c in columns), `${label}: the columns are known (${cols.join(', ')})`);
    for (const [i, [did, ...want]] of sc.rows.entries()) {
      let known = true;
      for (const phrase of did.split(', ')) known = (await act(page, phrase)) && known;
      const v = await view(page.p);
      const got = cols.map((c) => columns[c](v));
      check(known && same(got, want), `${label}, row ${i + 1} «${did}»: ${JSON.stringify(got)}`);
    }
    check(page.out.length === 0, `${label}: no console output ${JSON.stringify(page.out)}`);
    await page.close();
    return page;
  };
  const blocksOf = async (file) => {
    const ctx = await b.newContext(MAIN);
    const src = await ctx.newPage();
    await src.goto('file:///' + file.replace(/\\/g, '/'));
    const r = await src.evaluate(() => {
      const scenarioOf = (box) => ({
        head: [...box.querySelectorAll('thead th')].map((c) => c.innerText.trim()),
        rows: [...box.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())),
      });
      const blocks = [];
      let last = null;
      // a scenario table after a paragraph belongs to the last block of code above it
      for (const el of document.querySelectorAll('pre.code, .result-box')) {
        if (el.matches('pre.code')) {
          const next = el.nextElementSibling;
          const box = next && next.matches('.result-box') ? next : null;
          last = {
            code: el.textContent,
            file: el.dataset.file ?? null,
            page: el.dataset.page ?? null,
            box: box && !box.querySelector('table') ? box.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
            scenario: box && box.querySelector('table.scenario') ? scenarioOf(box) : null,
            phone: !!(box && box.hasAttribute('data-phone')),
            cheat: !!el.closest('.cheatsheet'),
          };
          blocks.push(last);
        } else if (el.querySelector('table.scenario') && !el.previousElementSibling?.matches('pre.code')) {
          if (last && !last.box && !last.scenario) {
            last.scenario = scenarioOf(el);
            last.phone = el.hasAttribute('data-phone');
          } else blocks.push({ orphan: true });
        }
      }
      return {
        blocks,
        plain: [...document.querySelectorAll('pre.plain-out')].map((pre) => pre.textContent),
        scenarios: [...document.querySelectorAll('.result-box table.scenario')].length,
        text: document.querySelector('.container').innerText,
      };
    });
    check(!r.blocks.some((x) => x.orphan), `${path.basename(path.dirname(file))}/${path.basename(file)}: every scenario table belongs to a block of code`);
    r.blocks = r.blocks.filter((x) => !x.orphan);
    await ctx.close();
    return r;
  };

  // the folder of day 33 (its lecture block by block), then the lasting blocks of day 34
  const day31 = await blocksOf(path.join(ROOT, 'intermediate/day-31/lecture.html'));
  const day32 = await blocksOf(path.join(ROOT, 'intermediate/day-32/lecture.html'));
  const day33 = await blocksOf(path.join(ROOT, 'intermediate/day-33/lecture.html'));
  const day34 = await blocksOf(path.join(ROOT, 'intermediate/day-34/lecture.html'));
  const D33 = { 'storage.js': day31.blocks.find((x) => x.code.startsWith('// storage.js')).code };
  for (const blk of day33.blocks) {
    if (blk.cheat || blk.code.startsWith('// js/')) continue;
    const kind = kindOf(blk);
    apply(D33, {}, blk, kind, `day 33 (${blk.code.split(LF)[0]})`, true);
    if (kind.name && kind.name.startsWith('data-bad/') && !('data-bad/school.json' in D33)) {
      D33['data-bad/school.json'] = D33['data/school.json'];
      D33['data-bad/home.json'] = D33['data/home.json'];
    }
  }
  const D34 = { ...D33 };
  for (const blk of day34.blocks) {
    if (blk.cheat) continue;
    const kind = kindOf(blk);
    if (kind.op === 'console' || kind.op === 'fragment') continue;
    apply(D34, {}, blk, kind, `day 34 (${blk.code.split(LF)[0]})`, true);
  }
  check(D34['main.js'] === day34.blocks.find((x) => x.code.startsWith('// main.js\n')).code, 'the folder of day 34: main.js is the whole program of its section 11');
  const PLAN = day33.blocks.find((x) => x.code.includes('const plan = [')).code;
  const PUSH = day34.blocks.find((x) => x.code.includes('plan.push(')).code.split(LF).find((l) => l.startsWith('plan.push('));
  const PLAN_DATA = `${PLAN.slice(0, PLAN.indexOf('];') + 2)}${LF}${PUSH}`;
  {
    const page = await open(D34);
    const v = await view(page.p);
    check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && page.out.length === 0, `the folder of day 34: ${JSON.stringify(v)}`);
    await page.close();
  }

  const all = {};
  for (const name of PAGES) all[name] = await blocksOf(path.join(DAY, `${name}.html`));
  const lec = all.lecture.text;
  const L = all.lecture.blocks;

  // main.js with the parts unchanged since day 34 folded into the placeholder lines
  const collapse = (text, placeholders, label) => {
    const lines = text.split(LF);
    const from1 = lines.indexOf('// карточка на экране; null — на сегодня всё');
    const end1 = findChunk(lines, 'function makeDeckButtons');
    const from2 = lines.findIndex((l) => l.startsWith('deckButtons.addEventListener('));
    const end2 = findChunk(lines, 'resetButton.addEventListener');
    const ok = from1 > 0 && end1 !== null && from2 > 0 && end2 !== null;
    check(ok, `${label}: the unchanged parts found`);
    if (!ok) return { text: '', cut: [] };
    return {
      text: [...lines.slice(0, from1), placeholders[0], ...lines.slice(end1.end + 1, from2), placeholders[1], ...lines.slice(end2.end + 1)].join(LF),
      cut: [lines.slice(from1, end1.end + 1), lines.slice(from2, end2.end + 1)],
    };
  };

  // the lecture of day 35
  const site = { ...D34 };
  const neighbour = {};
  const snaps = [];                          // the folder after each block
  let version = 0;
  let overlay = {};
  const students = {};                       // the student's browsers: a computer and a phone
  const used = new Set();
  let pending = [];
  const late = [];                           // temporary blocks without a box: checked below
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  for (const [i, blk] of L.entries()) {
    if (blk.cheat) continue;
    const kind = kindOf(blk);
    const label = `lecture #${i} (${blk.code.split(LF)[0]})`;
    check(kind.op !== null, `${label}: the block says what it does`);
    if (kind.op === null) continue;
    if (kind.op === 'whole' && (kind.name === 'main.js' || kind.name === 'index.html')) check(site[kind.name] === blk.code, `${label}: the pieces add up to the whole ${kind.name}`);
    if (kind.op === 'collapsed') {
      const placeholders = blk.code.split(LF).filter((l) => l.endsWith('— без изменений с дня 34'));
      const mine = collapse(site[kind.name], placeholders, label);
      const theirs = collapse(D34[kind.name], placeholders, label);
      check(placeholders.length === 2 && same(mine.cut, theirs.cut), `${label}: what is folded is the same as on day 34`);
      check(mine.text.split(LF).slice(1).join(LF) === body(blk.code), `${label}: the folded ${kind.name} is the one the pieces made`);
    }
    const before = JSON.stringify(site);
    if (kind.op === 'neighbour') neighbour[kind.name] = blk.code;
    else if (kind.op === 'neighbourCatch') {
      const ours = '  } catch (cause) {\n    throw new CardsError(`Не удалось загрузить колоду «${info.name}»`, { cause });\n  }';
      check(D34[kind.name].includes(ours), `${label}: our catch is in ${kind.name}`);
      neighbour[kind.name] = D34[kind.name].replace(ours, body(blk.code));
    } else if (kind.op !== 'console' && kind.op !== 'collapsed') apply(site, overlay, blk, kind, label);
    if (JSON.stringify(site) !== before) version++;
    snaps.push({ i, first: blk.code.split(LF)[0], site: { ...site } });
    pending.push(i);
    let out = null;
    if (kind.op === 'console') {
      const who = kind.phone ? 'phone' : 'computer';
      if (!students[who]) students[who] = { page: await open(() => site, undefined, { phone: kind.phone }), version };
      const st = students[who];
      if (st.version !== version) { await st.page.reload(); st.version = version; }
      st.page.out.splice(0);
      await st.page.repl(kind.plan ? `${PLAN_DATA}${LF}${blk.code}` : blk.code);
      if (blk.box) out = st.page.out.splice(0);
    } else if (blk.box) {
      const page = await open({ ...site, ...overlay }, blk.page ?? undefined, { phone: blk.phone });
      await page.close();
      out = page.out;
      overlay = {};
    } else if (blk.scenario) {
      await scenario({ ...site }, blk.scenario, blk.phone, label);
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
  for (const st of Object.values(students)) await st.page.close();
  const APP = { ...site };
  const at = (first, nth = 0) => {
    const found = snaps.filter((s) => s.first.startsWith(first));
    check(found.length > nth, `a block «${first}» (${nth + 1})`);
    return found[nth]?.site ?? {};
  };
  const S_VP = at('<!-- index.html, после «<meta charset');
  const S_BTN = at('<!-- index.html, в конец <style>');
  const S_WRAP = at('<!-- index.html: замена строки');
  const S_FIX5 = at('// main.js: замена строки');
  const S_6 = at('// main.js: замена openDeck');
  const plainOut = all.lecture.plain;

  const patch = (files, name, from, to) => {
    check(files[name] !== undefined && files[name].includes(from), `patch ${name}: «${from.slice(0, 40)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };
  const clicks = async (files, phrases, label, want, opts) => {
    const page = await open(files, undefined, opts);
    for (const phrase of phrases) check(await act(page, phrase), `${label}: «${phrase}» is an action`);
    const v = await view(page.p);
    const ok = await want(v, page);
    check(ok, `${label}: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
  };
  const run = async (files) => {
    const page = await open({ 'index.html': undefined, ...files });
    await page.close();
    return page.out;
  };
  const LANDMARK = ['{ "id": 8, "word": "window", "translation": "окно" }', '{ "id": 8, "word": "landmark", "translation": "достопримечательность" }'];

  // section 2: the gaps between buttons, before the rule for buttons and after it
  {
    const gaps = async (files) => {
      const page = await open(files, undefined, { phone: true });
      const r = await page.p.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const decks = [...document.querySelectorAll('.decks button')].map(box);
        return {
          decks: decks.slice(1).map((x, k) => Math.round(x.left - decks[k].right)),
          know: Math.round(box(document.querySelector('#again')).left - box(document.querySelector('#know')).right),
          heights: [...document.querySelectorAll('button')].map((e) => e.offsetHeight),
        };
      });
      await page.close();
      return r;
    };
    const g1 = await gaps(S_VP);
    const g2 = await gaps(S_BTN);
    check(same(g1.decks, [0, 0]) && g1.know === 4 && same(g2.decks, [8, 8]) && g2.know === 12 && g2.heights.every((h) => h === 45)
      && lec.includes('Между «Знаю» и «Повторить» 4 пикселя') && lec.includes('промежуток 0') && lec.includes('промежуток теперь 8') && lec.includes('«Повторить» 12'), `section 2: the gaps ${JSON.stringify([g1, g2])}`);
  }
  // section 2: the long word — without overflow-wrap the page is 376 and so is innerWidth; with it, two lines and 360
  {
    const word = async (files) => {
      const page = await open(patch(files, 'data/home.json', ...LANDMARK), undefined, { phone: true });
      for (const phrase of ['колода «дом»', '«Повторить»', 'щелчок по карточке']) await act(page, phrase);
      const r = await page.p.evaluate(() => {
        const c = document.querySelector('#card');
        const range = document.createRange();
        range.selectNodeContents(c);
        const t = range.getBoundingClientRect();
        return { text: c.textContent, past: Math.round(t.right - c.getBoundingClientRect().right), lines: Math.round(t.height / 37), numbers: `${document.documentElement.scrollWidth} ${innerWidth} ${screen.width}` };
      });
      await page.close();
      return r;
    };
    const w1 = await word(S_BTN);
    const w2 = await word(S_WRAP);
    const note = L.find((x) => x.code.startsWith('// замер на телефоне'));
    check(w1.text === 'достопримечательность' && w1.past === 24 && w1.numbers === '376 376 360' && !!note && note.code.endsWith(`// ${w1.numbers}`) && lec.includes('на 24 пикселя'), `section 2: without overflow-wrap ${JSON.stringify(w1)}`);
    check(w2.lines === 2 && w2.past < 0 && w2.numbers === '360 360 360' && lec.includes('все три числа снова 360'), `section 2: with overflow-wrap ${JSON.stringify(w2)}`);
    used.add(L.indexOf(note));
  }
  // section 3: a browser without Temporal — main.js:7, «Загрузка…» stays, no buttons; Temporal can be deleted
  {
    const temp = L.find((x) => kindOf(x).op === 'htmlTemp');
    const files = { ...S_WRAP, 'index.html': htmlBefore(S_WRAP['index.html'], body(temp.code), kindOf(temp).text, 'section 3') };
    const page = await open(files);
    const v = await view(page.p);
    const desc = await page.p.evaluate(() => 'Temporal' in globalThis);
    check(v.loading && v.buttons === '' && page.stacks.length === 1 && page.stacks[0].includes('main.js:7:') && S_WRAP['main.js'].split(LF)[6].startsWith('const today = Temporal') && !desc && lec.includes('main.js:7'), `section 3: ${JSON.stringify([v, page.stacks])}`);
    await page.close();
    const page2 = await open(S_WRAP);
    const d = await page2.p.evaluate(() => Object.getOwnPropertyDescriptor(globalThis, 'Temporal').configurable);
    check(d === true, 'section 3: Temporal is a configurable property of the global object');
    await page2.close();
  }
  // section 4: the table of edge cases, on the folder as it is in section 4
  {
    const S4 = S_WRAP;
    const store = async (s) => { const page = await open(S4, undefined, { storage: s }); const v = await view(page.p); await page.close(); return { v, out: page.out, stacks: page.stacks }; };
    const r1 = await store('сломано');
    check(r1.v.loading && r1.v.buttons === '' && same(r1.out, ['Uncaught SyntaxError: Unexpected token \'с\', "сломано" is not valid JSON']), `section 4, row 1: ${JSON.stringify(r1)}`);
    for (const s of ['{}', '5', '[]']) {
      const r = await store(s);
      check(!r.v.loading && r.v.buttons === 'школа,еда,дом' && r.v.card === '' && r.v.counter === '' && same(r.out, ['Uncaught TypeError: this[#progress].get is not a function']), `section 4, row 2 (${s}): ${JSON.stringify(r)}`);
    }
    const r3 = await store('{"$map":[[1,{"next":{"$date":"вчера"},"step":2}]]}');
    check(r3.v.loading && r3.v.buttons === '' && same(r3.out, ['Uncaught RangeError: Temporal error: Invalid character while parsing year value.']), `section 4, row 3: ${JSON.stringify(r3)}`);
    const r4 = await store('{"$map":[[99,{"next":{"$date":"2026-10-28"},"step":2}]]}');
    check(r4.v.card === 'book' && r4.v.counter === 'На сегодня: 3 из 3' && r4.out.length === 0, `section 4, row 4: ${JSON.stringify(r4)}`);
    for (const [label, files] of [['no food.json', { ...S4, 'data/food.json': undefined }], ['a trailing comma', patch(S4, 'data/food.json', '"яблоко" }', '"яблоко" },')]]) {
      const page = await open(files);
      await act(page, 'колода «еда»');
      const v5 = await view(page.p);
      await act(page, '«Повторить»');
      const v6 = await view(page.p);
      const out6 = page.out.splice(0);
      await act(page, 'колода «школа»');
      const v7 = await view(page.p);
      check(v5.card === 'book' && v5.active === 'школа' && v5.error.startsWith('Не удалось загрузить колоду «еда»: ') && v6.card === 'На сегодня всё' && same(out6, ["Uncaught TypeError: Cannot read properties of undefined (reading 'due')"]) && v7.card === 'book' && v7.error === v5.error, `section 4, rows 5–7 (${label}): ${JSON.stringify([v5, v6.card, out6, v7.error])}`);
      await page.close();
    }
    await clicks({ ...S4, 'data/food.json': '[]' }, ['колода «еда»'], 'section 4, row 8: an empty deck', (v) => v.card === 'На сегодня всё' && v.counter === 'На сегодня: 0 из 0' && v.active === 'еда');
    // decks.json with a trailing comma: no module runs, and the page of checks fails on its first line
    const broken = patch(S4, 'data/decks.json', '"дом" }', '"дом" },');
    const p1 = await open(broken);
    const v = await view(p1.p);
    check(v.loading && v.buttons === '' && p1.out.length === 1 && p1.out[0].startsWith('Uncaught SyntaxError: '), `section 4: a broken decks.json ${JSON.stringify(p1.out)}`);
    await p1.close();
    const p2 = await open(broken, 'test.html');
    check(p2.out.length === 1 && p2.out[0].startsWith('Uncaught ') && !p2.out.includes('проверки закончены'), `section 4: the page of checks falls on a broken decks.json ${JSON.stringify(p2.out)}`);
    await p2.close();
  }
  // section 5: the stacks, and an entry with "next": 5 before the fix
  {
    const S4 = S_WRAP;
    const st = async (s) => { const page = await open(S4, undefined, { storage: s }); await page.close(); return page.stacks[0] ?? ''; };
    const empty = await st('{}');
    const order = ['deck.js:23:', 'at Deck.due', 'at Deck.cardAt', 'at current', 'at render', 'at openDeck'].map((x) => empty.indexOf(x));
    check(order.every((x, k) => x > 0 && (k === 0 || x > order[k - 1])) && S4['deck.js'].split(LF)[22].includes('this.#progress.get(card.id)') && lec.includes('deck.js:23'), `section 5: the stack of "{}" ${JSON.stringify(empty)}`);
    const broke = await st('сломано');
    const order2 = ['at JSON.parse', 'at load (http://127.0.0.1:5500/storage.js:11:', 'main.js:8:'].map((x) => broke.indexOf(x));
    check(order2.every((x, k) => x > 0 && (k === 0 || x > order2[k - 1])) && S4['main.js'].split(LF)[7].startsWith('const progress = load(') && lec.includes('storage.js:11') && lec.includes('main.js:8'), `section 5: the stack of "сломано" ${JSON.stringify(broke)}`);
    const page = await open(S4, undefined, { storage: '{"$map":[[1,{"next":5,"step":2}]]}' });
    check(same(page.out, ['Uncaught TypeError: Temporal error: Date argument must be object or string.']) && lec.includes('Temporal error: Date argument must be object or string.'), `section 5: an entry with "next": 5 ${JSON.stringify(page.out)}`);
    await page.close();
    // after the fix: every bad value — from scratch; a good entry next to a bad one stays
    for (const s of [null, 'сломано', '{}', '5', '[]', '{"$map":[[1,{"next":{"$date":"вчера"},"step":2}]]}', '{"$map":[[1,{"next":5,"step":2}]]}', '{"$map":[null]}']) {
      const pg = await open(S_FIX5, undefined, s === null ? {} : { storage: s });
      const v = await view(pg.p);
      const saved = await pg.p.evaluate(() => localStorage.getItem('cards2:progress'));
      check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && saved === '{"$map":[]}' && pg.out.length === 0, `section 5, after the fix: ${s} → ${v.card}, ${saved} ${JSON.stringify(pg.out)}`);
      await pg.close();
    }
    const mix = await open(S_FIX5, undefined, { storage: '{"$map":[[1,{"next":{"$date":"2026-10-28"},"step":2}],[2,{"next":5,"step":2}]]}' });
    const v = await view(mix.p);
    const saved = await mix.p.evaluate(() => localStorage.getItem('cards2:progress'));
    check(v.card === 'teacher' && saved === '{"$map":[[1,{"next":{"$date":"2026-10-28"},"step":2}]]}' && lec.includes('хорошая остаётся'), `section 5: a good entry next to a bad one stays ${saved}`);
    await mix.close();
  }
  // section 6: the table again, on the folder at the end of section 6
  {
    for (const s of ['сломано', '{}', '5', '{"$map":[[1,{"next":{"$date":"вчера"},"step":2}]]}', '{"$map":[[99,{"next":{"$date":"2026-10-28"},"step":2}]]}']) {
      const pg = await open(S_6, undefined, { storage: s });
      const v = await view(pg.p);
      check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && v.trainer && pg.out.length === 0, `section 6, storage ${s}: ${JSON.stringify(v)}`);
      await pg.close();
    }
    for (const [label, files] of [['no food.json', { ...S_6, 'data/food.json': undefined }], ['a trailing comma', patch(S_6, 'data/food.json', '"яблоко" }', '"яблоко" },')]]) {
      const page = await open(files);
      await act(page, 'колода «еда»');
      const v1 = await view(page.p);
      await page.repl('document.querySelector("#again").click(); document.querySelector("#know").click(); document.querySelector("#card").click();');
      await page.p.waitForTimeout(250);
      await act(page, 'колода «школа»');
      const v2 = await view(page.p);
      check(!v1.trainer && v1.active === 'еда' && v1.error.startsWith('Не удалось загрузить колоду «еда»: ') && v2.trainer && v2.card === 'book' && v2.error === '' && page.out.length === 0, `section 6 (${label}): ${JSON.stringify([v1, v2])} ${JSON.stringify(page.out)}`);
      if (label === 'no food.json') check(page.net.some((t) => t.startsWith('Failed to load resource')) && lec.includes('Failed to load resource'), 'section 6: the browser writes «Failed to load resource» about the 404');
      await page.close();
    }
    await clicks({ ...S_6, 'data/food.json': '[]' }, ['колода «еда»'], 'section 6: an empty deck file', (v) => !v.trainer && v.error === 'Не удалось загрузить колоду «еда»: в колоде нет карточек' && lec.includes('«Не удалось загрузить колоду «еда»: в колоде нет карточек»'));
    // a failed import() is remembered until the page reloads
    let served = { ...S_6, 'data/food.json': undefined };
    const page = await open(() => served);
    await act(page, 'колода «еда»');
    served = S_6;
    await act(page, 'колода «школа»');
    await act(page, 'колода «еда»');
    const v1 = await view(page.p);
    const asked1 = page.requests.filter((r) => r === 'data/food.json').length;
    await page.reload();
    await act(page, 'колода «еда»');
    const v2 = await view(page.p);
    check(!v1.trainer && v1.error.includes('Failed to fetch dynamically imported module') && asked1 === 1 && v2.card === 'bread' && page.requests.filter((r) => r === 'data/food.json').length === 2, `section 6: a failed import() is remembered: ${JSON.stringify([v1.error, asked1, v2.card])}`);
    await page.close();
    // day 34: two decks at once still end on «дом»
    const p2 = await open(S_6);
    await p2.p.evaluate(() => { document.querySelector('[data-deck="food"]').click(); document.querySelector('[data-deck="home"]').click(); });
    await p2.p.waitForTimeout(500);
    const v3 = await view(p2.p);
    check(v3.card === 'house' && v3.active === 'дом' && p2.out.length === 0, `section 6: two decks clicked at once — «дом» ${JSON.stringify(v3)}`);
    await p2.close();
  }
  // section 7: the neighbour's code
  {
    check(!!neighbour['deck.js'] && !!neighbour['load.js'], 'section 7: the neighbour has deck.js and load.js');
    const his = { ...D34, ...neighbour };
    const page = await open(his);
    for (const phrase of ['щелчок по карточке', '«Знаю»']) await act(page, phrase);
    const v = await view(page.p);
    const msg = plainOut[0];
    check(v.card === 'книга' && v.counter === 'На сегодня: 3 из 3' && same(page.out, [msg]) && msg.startsWith('Uncaught TypeError: Do not use Temporal.PlainDate.prototype.valueOf'), `section 7, pass 1: «Знаю» — nothing changes ${JSON.stringify([v, page.out])}`);
    await page.reload();
    const v2 = await view(page.p);
    const saved = await page.p.evaluate(() => localStorage.getItem('cards2:progress'));
    check(v2.card === 'book' && saved === '{"$map":[]}', `section 7: after a reload no progress ${saved}`);
    await page.close();
    await clicks({ ...his, 'data/food.json': undefined }, ['колода «еда»'], 'section 7, pass 1: his load.js swallows the 404', (x) => x.card === 'На сегодня всё' && x.counter === 'На сегодня: 0 из 0' && x.error === '');
    const sec6 = day33.blocks.find((x) => x.code.startsWith('// tests.js\nconst DIR'));
    const histests = `${sec6.code.split(LF).filter((l) => !l.includes('потом удалить')).join(LF)}${LF}${LF}console.log("проверки закончены");`;
    const t0 = await open({ ...his, 'tests.js': histests }, 'test.html');
    check(same(t0.out, ['проверки закончены']), `section 7: his page of checks is silent ${JSON.stringify(t0.out)}`);
    await t0.close();
    // our page of checks (as at the end of section 6) on his class
    const ours = { ...S_6, 'deck.js': neighbour['deck.js'] };
    const t1 = await open(ours, 'test.html');
    check(same(t1.out, plainOut[1].split(LF)), `section 7: our checks on his class ${JSON.stringify(t1.out)}`);
    await t1.close();
    const fixed = patch(ours, 'deck.js', 'this.progress.get(c.id).next <= today', 'Temporal.PlainDate.compare(this.progress.get(c.id).next, today) <= 0');
    const t2 = await open(fixed, 'test.html');
    check(same(t2.out, plainOut[2].split(LF)), `section 7: our checks on his class, the comparison fixed ${JSON.stringify(t2.out)}`);
    await t2.close();
    const twice = await run({ 'deck.js': fixed['deck.js'], 'card.js': D34['card.js'], 'errors.js': D34['errors.js'], 'main.js': 'import { Deck } from "./deck.js";\nimport { Card } from "./card.js";\nconst p = new Map();\nconst d = new Deck([new Card({ id: 1, word: "book", translation: "книга" })], p);\nconst day = (s) => Temporal.PlainDate.from(s);\nd.know(1, day("2026-10-26"));\nconsole.log(String(p.get(1).next));\nd.know(1, day("2026-10-28"));\nconsole.log(String(p.get(1).next), p.get(1).step);' });
    check(same(twice, ['2026-10-28', '2026-10-30 1']) && lec.includes('пауза всегда 2 дня'), `section 7: his know — the pause is always 2 days ${JSON.stringify(twice)}`);
    check(plainOut[3].includes('due(today).length === 2') && D34['tests.js'].includes('new Deck(school, later).due(today).length === 2'), 'section 7: the check named in the remark is a check of day 33');
  }
  // section 8: a getter without a setter in a module
  {
    const out = await run({ 'card.js': APP['card.js'], 'errors.js': APP['errors.js'], 'main.js': 'import { Card } from "./card.js";\nconst c = new Card({ id: 1, word: "bok", translation: "книга" });\ntry { c.word = "book"; } catch (e) { console.log(e.message); }' });
    check(same(out, ['Cannot set property word of #<Card> which has only a getter']) && lec.includes(out[0]), `section 8: ${JSON.stringify(out)}`);
  }
  // section 10: Promise.all in openAll — one missing file, nothing found, a red line «in promise»
  {
    const wrong = late.find((x) => x.overlay['main.js'] && x.overlay['main.js'].includes('await Promise.all('));
    check(!!wrong && late.length === 1, `section 10: one temporary block without a box (${late.length})`);
    const files = { ...APP, ...wrong.overlay, 'data/food.json': undefined };
    const page = await open(files);
    await act(page, 'поиск «w»');
    const v1 = await view(page.p);
    const out1 = page.out.splice(0);
    await act(page, 'поиск «wi»');
    const v2 = await view(page.p);
    check(v1.found.length === 0 && same(out1, ['Uncaught (in promise) CardsError: Не удалось загрузить колоду «еда»']) && v2.found.length === 0 && page.out.length === 1 && lec.includes(out1[0].replace('Uncaught (in promise) ', '')), `section 10: Promise.all ${JSON.stringify([v1.found, out1, page.out])}`);
    await page.close();
    await clicks({ ...APP, 'data/food.json': undefined }, ['поиск «w»'], 'section 10: allSettled — window is found, water is not', (v, pg) => same(v.found, ['window — окно (дом)']) && pg.out.length === 0);
    const ok = await open({ ...APP, ...wrong.overlay });
    await act(ok, 'поиск «w»');
    check(same((await view(ok.p)).found, ['water — вода (еда)', 'window — окно (дом)']), 'section 10: with all the files Promise.all finds the same');
    await ok.close();
  }

  // the finished project; the markup is not printed whole in the lecture, so it is compared here
  const INDEX = [
    '<!DOCTYPE html>', '<html lang="ru">', '<head>', '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">', '  <title>Карточки 2.0</title>', '  <style>',
    '    .card { border: 2px solid #eab308; border-radius: 12px; padding: 40px; text-align: center; font-size: 32px; cursor: pointer; overflow-wrap: anywhere; }',
    '    .decks .active { font-weight: bold; }', '    .error { color: #b91c1c; }',
    '    button { font-size: 18px; padding: 10px 16px; margin: 0 8px 8px 0; }', '    input { font-size: 18px; padding: 10px 16px; }',
    '  </style>', '  <script type="module" src="main.js"></script>', '</head>', '<body>', '  <h1>Карточки 2.0</h1>',
    '  <p class="decks"></p>', '  <p id="loading">Загрузка…</p>', '  <p id="error" class="error"></p>', '  <div id="trainer" hidden>',
    '    <div id="card" class="card"></div>', '    <p>', '      <button id="know">Знаю</button>', '      <button id="again">Повторить</button>',
    '    </p>', '    <p id="counter"></p>', '    <button id="reset">Начать сначала</button>', '  </div>',
    '  <p><input id="search" type="search" placeholder="Найти слово"></p>', '  <ul id="found"></ul>', '</body>', '</html>',
  ].join(LF);
  check(APP['index.html'] === INDEX, 'index.html: the frame of day 33 with the edits of sections 2, 6 and 9');
  for (const name of ['card.js', 'load.js', 'errors.js', 'storage.js', 'test.html']) check(APP[name] === D34[name], `${name}: not changed since day 34`);
  {
    const s32 = day32.blocks.find((x) => x.code.startsWith('// search.js')).code.split(LF);
    const s35 = APP['search.js'].split(LF);
    check(s32.length === s35.length && s35.filter((l, k) => l !== s32[k]).length === 1 && s35.at(-2).includes('card.translation'), 'search.js: the one of day 32 with its last line changed');
    check(APP['deck.js'].includes('if (this.#cards.size === 0) throw new CardsError("в колоде нет карточек");') && APP['deck.js'].includes('  filter(test) {'), 'deck.js: the guard of an empty deck and filter');
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && same(v, { card: 'book', counter: 'На сегодня: 3 из 3', know: true, again: true, trainer: true, active: 'школа', buttons: 'школа,еда,дом', loading: false, error: '', found: [] }), `the project loads without a word in the console: ${JSON.stringify(v)}`);
    await page.close();
    const tests = await open(APP, 'test.html');
    check(same(tests.out, ['проверки закончены']), `the page of checks: ${JSON.stringify(tests.out)}`);
    await tests.close();
  }
  // section 12: on a phone the buttons and the field are 45, the page is as wide as the screen; «еда» was opened by the search
  {
    const page = await open(APP, undefined, { phone: true });
    await act(page, 'поиск «w»');
    const r = await page.p.evaluate(() => ({ heights: [...document.querySelectorAll('button, input')].map((e) => e.offsetHeight), wide: document.documentElement.scrollWidth === screen.width, n: document.querySelectorAll('button, input').length }));
    const asked = page.requests.filter((x) => x === 'data/food.json').length;
    await act(page, 'колода «еда»');
    check(r.n === 7 && r.heights.every((h) => h === 45) && r.wide && asked === 1 && page.requests.filter((x) => x === 'data/food.json').length === 1, `section 12: ${JSON.stringify(r)}, food.json ${asked}`);
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

  // task 8: the neighbour's class in a copy of day 34 — two lines, then three red ones, then silence; the 404 is shown
  {
    check(all.tasks.blocks.length === 0, 'tasks: no code blocks');
    const his = { ...D34, ...neighbour };
    const t1 = await open(his, 'test.html');
    check(t1.out.length === 2, `task 8: before the fixes two lines ${JSON.stringify(t1.out)}`);
    await t1.close();
    const cmp = patch(his, 'deck.js', 'this.progress.get(c.id).next <= today', 'Temporal.PlainDate.compare(this.progress.get(c.id).next, today) <= 0');
    const t2 = await open(cmp, 'test.html');
    check(same(t2.out, ['Assertion failed: Deck пропустил повтор номера', 'Assertion failed: второе — ещё через 4 дня', 'Assertion failed: know пропустил чужой номер', 'проверки закончены']), `task 8: after the comparison three red lines ${JSON.stringify(t2.out)}`);
    await t2.close();
    let deck = cmp['deck.js'];
    deck = deck.replace('  constructor(cards, progress) {\n', '  constructor(cards, progress) {\n    if (new Set(cards.map((c) => c.id)).size !== cards.length) throw new Error("номер встречается дважды");\n');
    deck = deck.replace('  know(id, today) {\n', '  know(id, today) {\n    if (!this.cards.some((c) => c.id === id)) throw new Error(`в колоде нет карточки ${id}`);\n');
    deck = deck.replace('step * 2 }), step });', 'step * 2 }), step: step * 2 });');
    const load = cmp['load.js'].replace('  } catch {\n    return new Deck([], progress);\n  }', '  } catch (cause) {\n    throw new CardsError(`Не удалось загрузить колоду «${info.name}»`, { cause });\n  }');
    check(load !== cmp['load.js'] && load.includes('import { CardsError } from "./errors.js";'), 'task 8: his catch is replaced, CardsError is imported already');
    const done = { ...cmp, 'deck.js': deck, 'load.js': load };
    const t3 = await open(done, 'test.html');
    check(same(t3.out, ['проверки закончены']), `task 8: after all the fixes ${JSON.stringify(t3.out)}`);
    await t3.close();
    const sc34 = day34.blocks.filter((x) => x.scenario).at(-1).scenario;
    check(sc34.rows.length === 11 && sc34.rows[0][0] === 'открыли' && sc34.rows.at(-1)[0] === '«Начать сначала» → OK', `task 8: the scenario is the one of section 12 of day 34 (${sc34.rows.length} rows)`);
    await scenario(done, sc34, false, 'task 8: the scenario of section 12 of day 34');
    await clicks({ ...done, 'data/food.json': undefined }, ['колода «еда»'], 'task 8: without food.json an error, not «0 из 0»', (v) => v.error.startsWith('Не удалось загрузить колоду «еда»: ') && v.counter !== 'На сегодня: 0 из 0');
  }
  // task 9: search without the dots over «ё» (the fold of day 20)
  {
    const fold = 'const fold = (s) => s.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase();';
    const search = ['// search.js', fold, 'export function matcher(query) {', '  const clean = fold(query.trim());', '  if (clean === "") return () => true;', '  const pattern = new RegExp(RegExp.escape(clean), "i");', '  return (card) => pattern.test(fold(card.word)) || pattern.test(fold(card.translation));', '}'].join(LF);
    const home = APP['data/home.json'].replace('{ "id": 8, "word": "window", "translation": "окно" }', '{ "id": 8, "word": "window", "translation": "окно" },\n  { "id": 9, "word": "hedgehog", "translation": "ёж" },\n  { "id": 10, "word": "tea", "translation": "чай" }');
    const tasks = all.tasks.text;
    check(tasks.includes('{ "id": 9, "word": "hedgehog", "translation": "ёж" }') && tasks.includes('\\p{M}'), 'task 9: the card and the hint as written');
    const found = async (files, queries) => {
      const page = await open(files);
      const r = [];
      for (const qq of queries) { await act(page, `поиск «${qq}»`); r.push((await view(page.p)).found.join('; ')); }
      r.push(page.out.length);
      await page.close();
      return r;
    };
    const before = await found({ ...APP, 'data/home.json': home }, ['еж', 'ёж', 'ЁЖ', 'чаи']);
    check(same(before, ['', 'hedgehog — ёж (дом)', 'hedgehog — ёж (дом)', '', 0]), `task 9: before — «еж» finds nothing ${JSON.stringify(before)}`);
    const after = await found({ ...APP, 'data/home.json': home, 'search.js': search }, ['еж', 'ёж', 'ЁЖ', '(', 'чаи']);
    check(same(after, ['hedgehog — ёж (дом)', 'hedgehog — ёж (дом)', 'hedgehog — ёж (дом)', '', 'tea — чай (дом)', 0]), `task 9: after — ${JSON.stringify(after)}`);
  }

  // every block of the lecture is used: by a run, a scenario, the finished project or a check above
  const checkedAbove = new Set(L.map((x, k) => (['neighbour', 'neighbourCatch', 'htmlTemp'].includes(kindOf(x).op) ? k : -1)).filter((k) => k >= 0));
  for (const [i, blk] of L.entries()) if (!blk.cheat) check(used.has(i) || late.some((x) => x.i === i) || checkedAbove.has(i), `lecture #${i} (${blk.code.split(LF)[0]}) is used`);
  check(all.lecture.scenarios === 2 && L.filter((x) => x.scenario).length === 2 && plainOut.length === 4, `the lecture: two scenario tables, both run, four console texts (${all.lecture.scenarios}, ${plainOut.length})`);

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
