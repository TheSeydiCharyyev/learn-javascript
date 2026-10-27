// Course 2, day 36 (the final project, day 4 of 4: the defense of "Карточки 2.0"), in Chrome. The folder of day 35 is
// built first: the lecture of day 33 block by block, then the lasting blocks of days 34 and 35 (as day-35.cjs does).
// Then the blocks of day 36 change it. What a block does is told by its first line, as on days 33–35, plus:
//   "// name.js: от «a» до «b»"                    the lines from the one with a to the one with b replaced
//   "// name.js, две строки прогресса" / "// name.js, проверка дня N"   a quote: every line is in the file
//   "// I1 …"                                      the course in one program: every line of code is in the project
//   "// в консоли …"                               typed in the console of the student's browser (CDP, REPL mode)
//   node tools/runs/intermediate/day-36.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-36.cjs --quiet    only the checks
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'intermediate/day-36');
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
  if ((m = first.match(/^<!-- ([\w./-]+), после «(.+)» -->$/))) return { op: 'htmlAfter', name: m[1], text: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+), перед «(.+)» — на время опыта -->$/))) return { op: 'htmlTemp', name: m[1], text: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+), в конец <(\w+)> -->$/))) return { op: 'htmlEnd', name: m[1], tag: m[2] };
  if ((m = first.match(/^<!-- ([\w./-]+): замена строки -->$/))) return { op: 'htmlLine', name: m[1] };
  if ((m = first.match(/^<!-- ([\w./-]+): обернуть .+ -->$/))) return { op: 'htmlWrap', name: m[1] };
  if (first.startsWith('// в консоли, режим телефона')) return { op: 'console', phone: true };
  if (first.startsWith('// в консоли')) return { op: 'console', plan: first.includes('plan из дня 33') };
  if (first.startsWith('// замер')) return { op: 'note' };
  if (first.startsWith('// так НЕ надо — ')) return { op: 'fragment' };
  if (/^\/\/ I1 /.test(first)) return { op: 'tour' };
  if ((m = first.match(/^\/\/ ([\w./-]+), (две строки прогресса|проверка дня \d+)$/))) return { op: 'quote', name: m[1] };
  if ((m = first.match(/^\/\/ ([\w./-]+): от «(.+)» до «(.+)»$/))) return { op: 'region', name: m[1], from: m[2], to: m[3] };
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
// a line of code without its trailing comment
const strip = (l) => l.replace(/\s+\/\/ .*$/, '').trim();

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // edits of a JS file ("legacy" — the blank lines of day 34 for the folder of day 34)
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
  const replaceRegion = (text, code, from, to, label) => {
    const out = text.split(LF);
    const a = out.findIndex((l) => l.includes(from));
    const z = out.findIndex((l, i) => i >= a && l.includes(to));
    check(a >= 0 && z >= a, `${label}: the lines from «${from}» to «${to}»`);
    return [...out.slice(0, a), ...code.split(LF), ...out.slice(z + 1)].join(LF);
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
  // apply a block to the folder; returns false for blocks that only run, quote or are kept aside
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
    else if (kind.op === 'region') site[n] = replaceRegion(site[n], body(blk.code), kind.from, kind.to, label);
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
    const ctx = await b.newContext(MAIN);
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
    trainer: document.querySelector('#trainer') ? !document.querySelector('#trainer').hidden : null,
    active: [...document.querySelectorAll('.decks .active')].map((x) => x.textContent).join(),
    buttons: [...document.querySelectorAll('.decks button')].map((x) => x.textContent).join(),
    error: document.querySelector('#error')?.textContent ?? null,
  }));
  const act = async (page, phrase) => {
    const p = page.p;
    let m;
    if (phrase === 'щелчок по карточке') await p.click('#card');
    else if (phrase === '«Знаю»') await p.click('#know');
    else if (phrase === '«Повторить»') await p.click('#again');
    else if ((m = phrase.match(/^колода «(.+)»$/))) await p.click(`.decks button:text-is("${m[1]}")`);
    else if (phrase === '«Начать сначала» → OK') { p.once('dialog', (d) => d.accept()); await p.click('#reset'); }
    else if ((m = phrase.match(/^поиск «(.*)»/))) await p.fill('#search', m[1]);
    else return false;
    await p.waitForTimeout(300);
    return true;
  };
  const clicks = async (files, phrases, label, want) => {
    const page = await open(files);
    for (const phrase of phrases) check(await act(page, phrase), `${label}: «${phrase}» is an action`);
    const v = await view(page.p);
    const ok = await want(v, page);
    check(ok, `${label}: ${JSON.stringify(v)} ${JSON.stringify(page.out)}`);
    await page.close();
  };
  const store = (p) => p.evaluate(() => localStorage.getItem('cards2:progress'));
  const blocksOf = async (file) => {
    if (!fs.existsSync(file)) return null;
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
          cheat: !!pre.closest('.cheatsheet'),
        };
      }),
      plain: [...document.querySelectorAll('pre.plain-out')].map((pre) => pre.textContent),
      scenarios: document.querySelectorAll('table.scenario').length,
      text: document.querySelector('.container').innerText,
      source: document.documentElement.outerHTML,
    }));
    await ctx.close();
    return r;
  };

  // the folders of days 33, 34 and 35
  const day31 = await blocksOf(path.join(ROOT, 'intermediate/day-31/lecture.html'));
  const day33 = await blocksOf(path.join(ROOT, 'intermediate/day-33/lecture.html'));
  const day34 = await blocksOf(path.join(ROOT, 'intermediate/day-34/lecture.html'));
  const day35 = await blocksOf(path.join(ROOT, 'intermediate/day-35/lecture.html'));
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
  const lasting = (base, lecture, label, legacy) => {
    const folder = { ...base };
    for (const blk of lecture.blocks) {
      if (blk.cheat) continue;
      const kind = kindOf(blk);
      if (['console', 'fragment', 'note', 'neighbour', 'neighbourCatch', 'collapsed', 'quote', 'tour'].includes(kind.op)) continue;
      apply(folder, {}, blk, kind, `${label} (${blk.code.split(LF)[0]})`, legacy);
    }
    return folder;
  };
  const D34 = lasting(D33, day34, 'day 34', true);
  const D35 = lasting(D34, day35, 'day 35', false);
  check(D34['main.js'] === day34.blocks.find((x) => x.code.startsWith('// main.js\n')).code, 'the folder of day 34: main.js is the whole program of its section 11');
  check(D35['main.js'].includes('function readProgress() {') && D35['search.js'] && D35['index.html'].includes('<div id="trainer" hidden>'), 'the folder of day 35: readProgress, search.js, #trainer');
  const PLAN = day33.blocks.find((x) => x.code.includes('const plan = [')).code;
  const pushOf = (lecture) => lecture.blocks.find((x) => x.code.includes('plan.push(')).code.split(LF).find((l) => l.startsWith('plan.push('));
  const PLAN_DATA = [PLAN.slice(0, PLAN.indexOf('];') + 2), pushOf(day34), pushOf(day35)].join(LF);
  {
    const page = await open(D35);
    const v = await view(page.p);
    check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && v.trainer && page.out.length === 0, `the folder of day 35 opens: ${JSON.stringify(v)}`);
    await page.close();
    const tests = await open(D35, 'test.html');
    check(same(tests.out, ['проверки закончены']), `the folder of day 35: the page of checks ${JSON.stringify(tests.out)}`);
    await tests.close();
  }

  const all = {};
  for (const name of PAGES) all[name] = await blocksOf(path.join(DAY, `${name}.html`));
  const lec = all.lecture.text;
  const L = all.lecture.blocks;

  // the lecture of day 36
  const site = { ...D35 };
  const snaps = [];
  let version = 0;
  let overlay = {};
  let student = null, studentVersion = -1;   // the student's browser: one context, console blocks
  const used = new Set();
  let pending = [];
  const late = [];
  let chronoMs = null;
  if (!quiet) console.log(`\n===== lecture: ${L.length} blocks`);
  for (const [i, blk] of L.entries()) {
    if (blk.cheat) continue;
    const kind = kindOf(blk);
    const label = `lecture #${i} (${blk.code.split(LF)[0]})`;
    check(kind.op !== null, `${label}: the block says what it does`);
    if (kind.op === null) continue;
    if (kind.op === 'quote' || kind.op === 'tour') {
      const files = kind.op === 'quote' ? [site[kind.name]] : Object.values(site).filter((t) => typeof t === 'string');
      const known = new Set(files.flatMap((t) => t.split(LF)).map(strip));
      const lines = blk.code.split(LF).map(strip).filter((l) => l && !l.startsWith('//'));
      const missing = lines.filter((l) => !known.has(l));
      check(lines.length > 0 && missing.length === 0, `${label}: every line is in ${kind.op === 'quote' ? kind.name : 'the project'}${missing.length ? ` ${JSON.stringify(missing)}` : ''}`);
      used.add(i);
      continue;
    }
    const before = JSON.stringify(site);
    if (kind.op !== 'console') apply(site, overlay, blk, kind, label);
    if (JSON.stringify(site) !== before) version++;
    snaps.push({ i, first: blk.code.split(LF)[0], site: { ...site } });
    pending.push(i);
    let out = null;
    if (kind.op === 'console') {
      if (!student) { student = await open(() => site); studentVersion = version; }
      if (studentVersion !== version) { await student.reload(); studentVersion = version; }
      student.out.splice(0);
      const t0 = Date.now();
      await student.repl(kind.plan ? `${PLAN_DATA}${LF}${blk.code}` : blk.code);
      if (blk.code.includes('chronometer(defense, 1000)')) chronoMs = Date.now() - t0;
      if (blk.box) out = student.out.splice(0);
    } else if (blk.box) {
      const page = await open({ ...site, ...overlay }, blk.page ?? undefined);
      await page.close();
      out = page.out;
      overlay = {};
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
  const plainOut = all.lecture.plain;
  const patch = (files, name, from, to) => {
    check(files[name] !== undefined && files[name].includes(from), `patch ${name}: «${from.slice(0, 40)}» found`);
    return { ...files, [name]: files[name].replace(from, to) };
  };
  const run = async (files) => {
    const page = await open({ 'index.html': undefined, ...files });
    await page.close();
    return page.out;
  };

  // section 1: seven minutes; the rehearsal takes seven seconds and a fraction (7042 and 7102 ms seen); Essentials had
  // six setTimeout
  {
    check(chronoMs !== null && chronoMs >= 7000 && chronoMs < 7500 && lec.includes('доли секунды'), `section 1: the rehearsal took ${chronoMs} ms`);
    const e36 = fs.readFileSync(path.join(ROOT, 'essentials/day-36/lecture.html'), 'utf8');
    const parts = (e36.match(/\{ part: "/g) || []).length;
    check(parts === 5 && e36.includes('schedule(defense).forEach((s) =&gt; {') && e36.includes('setTimeout(() =&gt; console.log("7 мин: время вышло")') && lec.includes('шесть <code>setTimeout</code>'.replace(/<\/?code>/g, '')), `section 1: the chronometer of Essentials — five parts and one more timer (${parts})`);
  }
  // section 4: the reset with a new Map — const stops it; with let the screen and the storage part
  {
    const frag = L.find((x) => x.code.startsWith('// так НЕ надо — «Начать сначала»'));
    check(!!frag && frag.code.split(LF)[1] === 'progress = new Map();', 'section 4: the wrong line');
    const wrong = patch(APP, 'main.js', '  progress.clear();', '  progress = new Map();');
    await clicks(wrong, ['«Знаю»', '«Начать сначала» → OK'], 'section 4: with const — Assignment to constant variable', (v, page) => same(page.out, ['Uncaught TypeError: Assignment to constant variable.']));
    const withLet = patch(wrong, 'main.js', 'const progress = ', 'let progress = ');
    await clicks(withLet, ['«Знаю»', '«Начать сначала» → OK'], 'section 4: with let — teacher, 2 из 3, the storage empty', async (v, page) => v.card === 'teacher' && v.counter === 'На сегодня: 2 из 3' && (await store(page.p)) === '{"$map":[]}' && lec.includes('по-прежнему teacher и «На сегодня: 2 из 3»'));
    used.add(L.indexOf(frag));
  }
  // section 4: a new deck — a line in decks.json and a file; no markup, no code
  {
    const city = { ...patch(APP, 'data/decks.json', '{ "id": "home", "name": "дом" }', '{ "id": "home", "name": "дом" },\n  { "id": "city", "name": "город" }'), 'data/city.json': '[\n  { "id": 9, "word": "street", "translation": "улица" }\n]' };
    await clicks(city, ['колода «город»'], 'section 4: the deck «город»', (v) => v.buttons === 'школа,еда,дом,город' && v.card === 'street' && v.counter === 'На сегодня: 1 из 1');
    const tests = await open(city, 'test.html');
    check(same(tests.out, ['проверки закончены']) && lec.includes('{ "id": "city", "name": "город" }') && lec.includes('{ "id": 9, "word": "street", "translation": "улица" }'), `section 4: the page of checks is silent with the new deck ${JSON.stringify(tests.out)}`);
    await tests.close();
  }
  // section 5: readProgress has moved; the app still survives a broken storage
  {
    check(!APP['main.js'].includes('function readProgress') && APP['main.js'].includes('import { save, readProgress } from "./storage.js";') && APP['storage.js'].includes('export function readProgress(text) {'), 'section 5: readProgress is in storage.js, main.js imports it');
    check(!/\bload\(/.test(APP['main.js']), 'section 5: main.js does not call load any more');
    for (const s of ['сломано', '{}', '{"$map":[[1,{"next":5,"step":2}]]}']) {
      const page = await open(APP, undefined, { storage: s });
      const v = await view(page.p);
      check(v.card === 'book' && v.counter === 'На сегодня: 3 из 3' && page.out.length === 0, `section 5: storage ${s} — book ${JSON.stringify(v)}`);
      await page.close();
    }
    const e36 = fs.readFileSync(path.join(ROOT, 'essentials/day-36/lecture.html'), 'utf8');
    check(e36.includes('const saved = localStorage.getItem(KEY);') && e36.includes('localStorage.setItem(KEY, saved);   // вернуть как было') && lec.includes('сохранял ключ и возвращал его на место'), 'section 5: testInput of Essentials saved the key and put it back');
  }
  // section 7: questions
  {
    // one number in two decks
    const dup = patch(APP, 'data/food.json', '"id": 5, "word": "water"', '"id": 3, "word": "water"');
    const t = await open(dup, 'test.html');
    check(same(t.out, plainOut[0].split(LF)), `section 7: one number in two decks — the page of checks ${JSON.stringify(t.out)}`);
    await t.close();
    await clicks(dup, ['«Повторить»', '«Повторить»', '«Знаю»', 'колода «еда»'], 'section 7: «Знаю» on lesson hides water', async (v, page) => v.card === 'bread' && v.counter === 'На сегодня: 2 из 3' && page.out.length === 0);
    // knowButton is not seen from the console; ten clicks on a fresh page put away three cards
    const page = await open(APP);
    await page.repl('knowButton.click();');
    check(same(page.out.splice(0), ['Uncaught ReferenceError: knowButton is not defined']) && lec.includes('Uncaught ReferenceError: knowButton is not defined'), 'section 7: knowButton is not defined in the console');
    await page.repl('for (let i = 0; i < 10; i++) document.querySelector("#know").click();');
    const saved = JSON.parse(await store(page.p));
    check(saved.$map.length === 3 && page.out.length === 0 && lec.includes('Три щелчка отложили три карточки'), `section 7: ten clicks on a fresh page — three cards put away ${saved.$map.length}`);
    // import() from the console is the module of the page: card.js asked once; the experiment leaves the storage alone
    const before = await store(page.p);
    await page.repl('const { Card } = await import("./card.js");\nconst { Deck } = await import("./deck.js");\nconst progress = new Map();\nconst deck = new Deck([new Card({ id: 1, word: "book", translation: "книга" })], progress);\nlet day = Temporal.PlainDate.from("2026-10-26");\nfor (let i = 0; i < 10; i++) {\n  deck.know(1, day);\n  day = progress.get(1).next;\n}');
    await page.p.evaluate(() => document.querySelector('#again').click());   // hidden now: render runs and writes the storage
    await page.p.waitForTimeout(200);
    check(page.requests.filter((r) => r === 'card.js').length === 1 && (await store(page.p)) === before && page.out.length === 0, 'section 7: import() from the console takes the same module, the storage is untouched');
    await page.close();
    // at the start only school.json; food.json after a search
    const p2 = await open(APP);
    const atStart = [...p2.requests];
    await act(p2, 'поиск «w»');
    check(atStart.includes('data/school.json') && !atStart.includes('data/food.json') && !atStart.includes('data/home.json') && p2.requests.includes('data/food.json'), `section 7: at the start only school.json ${JSON.stringify(atStart)}`);
    await p2.close();
    // the second message of the guard (a typo in the field)
    const out = await run({ 'card.js': APP['card.js'], 'errors.js': APP['errors.js'], 'main.js': 'import { Card } from "./card.js";\ntry { new Card({ id: 6, word: "apple", translaton: "яблоко" }); } catch (err) { console.log(err.name, err.message); }' });
    check(same(out, ['CardsError у карточки 6 нет слова или перевода']), `section 7: the guard and a typo ${JSON.stringify(out)}`);
  }
  // section 11: two tabs — the last write wins
  {
    const page = await open(APP);
    const tabB = await page.ctx.newPage();
    await tabB.goto(`${ORIGIN}/index.html`);
    await tabB.waitForTimeout(500);
    await act(page, '«Знаю»');
    await act(page, '«Знаю»');
    await tabB.click('#know');
    await tabB.waitForTimeout(200);
    const saved = await store(page.p);
    await page.reload();
    const v = await view(page.p);
    check(saved === '{"$map":[[1,{"next":{"$date":"2026-10-28"},"step":2}]]}' && v.card === 'teacher' && lec.includes('только book из B'), `section 11: two tabs ${saved} ${v.card}`);
    await page.close();
  }

  // the finished project: loads quietly, the page of checks is silent
  {
    const page = await open(APP);
    const v = await view(page.p);
    check(page.out.length === 0 && v.card === 'book' && v.trainer, `the project loads without a word in the console: ${JSON.stringify(v)}`);
    await page.close();
    const tests = await open(APP, 'test.html');
    check(same(tests.out, ['проверки закончены']), `the page of checks: ${JSON.stringify(tests.out)}`);
    await tests.close();
    for (const name of ['card.js', 'deck.js', 'load.js', 'errors.js', 'search.js', 'index.html', 'test.html']) check(APP[name] === D35[name], `${name}: not changed since day 35`);
  }

  // the notes and the cheat sheet: every line of code, without its trailing comment, is a line of the lecture
  const lectureLines = new Set(L.filter((x) => !x.cheat).flatMap((x) => x.code.split(LF)).map(strip));
  const fromLecture = (blk, where) => {
    const lines = blk.code.split(LF).map(strip).filter((l) => l && !l.startsWith('//'));
    const missing = lines.filter((l) => !lectureLines.has(l));
    check(missing.length === 0, `${where}: every line is from the lecture (${blk.code.split(LF)[0].slice(0, 40)})${missing.length ? ` ${JSON.stringify(missing)}` : ''}`);
  };
  for (const blk of L.filter((x) => x.cheat)) fromLecture(blk, 'cheat sheet');
  if (all.student) for (const blk of all.student.blocks) fromLecture(blk, 'notes');
  else console.log('-- student.html is not written yet');
  if (!all.tasks) console.log('-- tasks.html is not written yet');

  // every block of the lecture is used: by a run, the finished project or a check above
  for (const [i, blk] of L.entries()) if (!blk.cheat) check(used.has(i) || late.some((x) => x.i === i), `lecture #${i} (${blk.code.split(LF)[0]}) is used`);
  check(all.lecture.scenarios === 0 && plainOut.length === 1 && late.length === 0, `the lecture: no scenario tables, one console text, no temporary block without a box (${all.lecture.scenarios}, ${plainOut.length}, ${late.length})`);

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
