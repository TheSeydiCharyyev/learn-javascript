// Course 3, day 26, in Chrome: ECMA-402 from the inside — language tags, canonicalization, the Intl object,
// supportedValuesOf, the internal slots of the service constructors, locale negotiation (lookup, best fit,
// ResolveLocale, ResolveOptions, GetOption). Every block of the lecture runs as main.js of a folder on http://127.0.0.1 —
// the index.html of the lecture of day 22 (the lecture sends the student there, as before). Output is awaited up to the
// number of lines of the result-box. The context is Ashgabat time, Russian: section 8 prints navigator.language, so the
// result-boxes are those of a Russian Chrome.
//   node tools/runs/advanced/day-26.cjs            every block: output; checks below
//   node tools/runs/advanced/day-26.cjs --quiet    only the checks
// The source of the day is ECMA-402 2026: tools/.cache/ecma402-2026.html; links go to https://tc39.es/ecma402/2026/#….
// Checks: a result-box after a block equals its output; the cheatsheet runs without output; the experiments behind the
// text — the message of "EN_US", Asia/Ashkhabad known but not listed, every list of supportedValuesOf sorted and without
// duplicates, PluralRules and Segmenter resolve "tk" while the others fall back, lookup and best fit agree on 120 pairs,
// a numbering system given as an option survives a missing language, NumberFormat alone would pick "tr" too; the folder
// of day 22; every English quote of the lecture («…») is in the clauses of ECMA-402 of the day, the 3 MDN pages or the
// output of Chrome, and the 10 quotes it gives to ECMA-402 stand in their places and in their own clauses; every step it
// names (6.2.1, 6.2.2, 8.3.2, 9.2.1, 9.2.3, 9.2.7, 9.2.8, 9.2.9, 9.2.10, 9.2.11) is checked against the text, and so are
// the section numbers it names without links and the texts it retells; the days it points to say what it says; the
// reference table holds all 75 rows of the day's plan (72 of ECMA-402, 3 of MDN) with their marks and titles, every
// anchor exists and every link whose text starts with a number names the section of that number; the footer. The notes:
// each of their 3 blocks prints what the comments of its console.log lines say; homework 1 — six canonicalizations;
// 2 — five errors with the texts of Chrome; 3 — the reference solution of pickLanguages with use, skipped and bad; 4 —
// lookup of tk-Latn-TM, az-Cyrl-XX-u-nu-arab, ru keeps the extension, a missing tk-TM loses it; their English quotes
// (the 4 of ECMA-402 in their places), the steps of their tables and the footer. The tasks: the 4 blocks to predict print
// what EXPECT says (task 2: Chrome keeps Europe/Kiev as the primary name, 6.5 recommends Europe/Kyiv after a waiting
// period); every line of the 5 examples holds with the reference solutions (SOLUTIONS, an awaited check); the
// experiments of the criteria — U+00A0 in a price, lookup hands back the whole extension, "xxxx" fits the grammar and is
// ignored; the descriptors of 11.2.3 and 16.2.3, table 2 of 6.6.2, 6.1 and 6.6.3; the steps of 9.2.3 and 6.6.1; the 2
// quotes of 6.5 in their place, the sections they ask for, the link 6.6.1 and the footer.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-26');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma402-2026.html');
const ORIGIN = 'http://127.0.0.1:5593';
const quiet = process.argv.includes('--quiet');
// a block of the tasks without an example: its output by "tasks #index" (js blocks of the page); the tasks ask to predict
// these (Chrome, Russian: task 2 prints what Chrome keeps as the primary time zone name)
const EXPECT = {
  'tasks #0': ['["zh-Hant-TW"] ["ro"] ["tk-TM"] ["ru-RU"] ["sr-Latn","sr-Latn-RS"]', '["en-u-ca-gregory-nu-latn"] ["tk-TM-x-ahal"] RangeError ["tk"] RangeError'],
  'tasks #1': ['true true false RangeError', 'tr-TR,ru-RU,en-ZZ 0 Europe/Kiev'],
  'tasks #2': ['sr-Latn-ME-u-nu-arab en-US uz-Arab-u-nu-latn ru-RU', 'az ru-u-nu-arab de-CH'],
  'tasks #8': ['ok ok RangeError RangeError RangeError RangeError', 'TypeError false'],
};
// reference solutions of the tasks: every "expression;   // value" line of an example must give the comment; the check is
// awaited, so a line may await too. No template literals inside: Node reads these strings as templates first (so \\s).
const SOLUTIONS = {
  formatPrice: `function formatPrice(amount, wanted, digits) {
  const tags = [];
  for (const raw of wanted.split(",")) {
    try { tags.push(...Intl.getCanonicalLocales(raw.trim())); } catch { }
  }
  const supported = Intl.NumberFormat.supportedLocalesOf(tags);
  const options = { style: "currency", currency: "TMT" };
  if (digits) options.numberingSystem = digits;
  const f = new Intl.NumberFormat(supported.length > 0 ? supported : navigator.language, options);
  return { locale: f.resolvedOptions().locale, text: f.format(amount).replace(/\\s/g, " ") };
}`,
  lookupLocale: `function lookupLocale(requested, available) {
  for (const tag of Intl.getCanonicalLocales(requested)) {
    const extension = (tag.split("-x-")[0].match(/-u(?:-[a-z0-9]{2,8})+/) || [""])[0];
    let prefix = tag.replace(extension, "");
    while (prefix !== "") {
      if (available.includes(prefix)) return { locale: prefix, extension };
      let pos = prefix.lastIndexOf("-");
      if (pos === -1) pos = 0;
      while (pos >= 2 && prefix[pos - 2] === "-") pos -= 2;
      prefix = prefix.slice(0, pos);
    }
  }
  return undefined;
}`,
  numberingSource: `function numberingSource(tag, options = {}) {
  const r = new Intl.NumberFormat(tag, options).resolvedOptions();
  const fromTag = (r.locale.match(/-u-(?:[a-z0-9-]*-)?nu-([a-z0-9]+)/) || [])[1];
  if (fromTag === r.numberingSystem) return r.numberingSystem + " из -u-";
  if (options.numberingSystem === r.numberingSystem) return r.numberingSystem + " из опции";
  return r.numberingSystem + " из данных языка";
}`,
  optionOrder: `function optionOrder(make) {
  const seen = [];
  make(new Proxy({}, { get(target, key) { if (typeof key === "string") seen.push(key); return undefined; } }));
  return seen;
}`,
  caseOnly: `function caseOnly(tag) {
  let afterSingleton = false;
  return tag.split("-").map((part, i) => {
    const p = part.toLowerCase();
    if (i === 0 || afterSingleton) return p;
    if (p.length === 1) { afterSingleton = true; return p; }
    if (p.length === 4 && /^[a-z]+$/.test(p)) return p[0].toUpperCase() + p.slice(1);
    if ((p.length === 2 && /^[a-z]+$/.test(p)) || /^[0-9]{3}$/.test(p)) return p.toUpperCase();
    return p;
  }).join("-");
}`,
};
const checkable = (code) => {
  const names = Object.keys(SOLUTIONS).filter((n) => code.includes(`${n}(`));
  const lines = code.split('\n').map((line) => {
    const m = line.match(/^(\s*)(?!const |let )(\S.*?);\s*\/\/\s*(.+?)(?:\s+—.*)?$/);
    return m ? `${m[1]}await __check(${JSON.stringify(m[2])}, async () => (${m[2]}), ${JSON.stringify(m[3])});` : line;
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

// a folder of files on ORIGIN (index.html must be there); console lines and uncaught errors in order. A fresh context
// each time, Russian, Ashgabat time.
async function runFolder(b, files, { lines = 0, ms = 15000, settle = 150 } = {}) {
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
// for comparing quotes: no space before ":" or "(" — the spec writes "[[locale]] : DefaultLocale ()"
const tight = (s) => s.replace(/\s+/g, ' ').replace(/ ([:(])/g, '$1');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  if (at === -1) return '';
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
    if (m[1] || depth < 0) continue;
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
  const boxes = items.filter((x) => x.kind === 'box');
  check(js.length === 17 && js.filter((x) => x.file).length === 0 && js.filter((x) => x.cheat).length === 1
    && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && boxes.length === 16,
  `lecture: 17 js blocks (16 with a result-box and the cheatsheet), 16 result-boxes (${js.length}, ${boxes.length})`);
  check(!!indexHtml && indexHtml.includes('<script type="module" src="main.js"></script>') && lectureText.includes('Блоки можно запускать в папке дня 22, как раньше.'),
    'lecture 1: the blocks run in the folder of day 22 — its index.html loads main.js');
  const page = (main) => ({ 'index.html': indexHtml, 'main.js': main });

  // the result-boxes: the block before each one
  let last = null, n = 0;
  for (const it of items) {
    if (it.kind === 'h2') continue;
    if (it.kind === 'code') { last = it.cheat ? null : it; continue; }
    n++;
    const label = `lecture ${it.section}, box ${n}`;
    if (!last) { check(false, `${label}: no block before it`); continue; }
    const out = await runFolder(b, page(last.code), { lines: it.lines.length });
    if (!quiet) { console.log(`\n--- ${label}: ${last.code.split(LF)[0].slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
    check(same(out, it.lines), `${label}: result-box = output ${JSON.stringify(out)}`);
    last = null;
  }
  check(n === 16, `lecture: every result-box had a block before it (${n})`);
  const outputs = boxes.flatMap((x) => x.lines);

  // the cheatsheet runs without output
  {
    const out = await runFolder(b, page(js.find((x) => x.cheat).code));
    check(out.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out)}`);
  }

  // the experiments behind the text
  const facts = await runFolder(b, page(`const run = (f) => { try { return f(); } catch (e) { return e.name + ": " + e.message; } };
console.log(run(() => Intl.getCanonicalLocales("EN_US")));
console.log(run(() => new Intl.DateTimeFormat("ru", { timeZone: "Asia/Ashkhabad" }).resolvedOptions().timeZone));
const keys = ["calendar", "collation", "currency", "numberingSystem", "timeZone", "unit"];
console.log(keys.every((k) => { const v = Intl.supportedValuesOf(k); return new Set(v).size === v.length && JSON.stringify(v) === JSON.stringify([...v].sort()); }));
console.log(["Collator", "DateTimeFormat", "DurationFormat", "ListFormat", "NumberFormat", "PluralRules", "RelativeTimeFormat", "Segmenter"].map((name) => name + " " + new Intl[name]("tk").resolvedOptions().locale).join(", "));
const f = new Intl.NumberFormat("tk-TM", { numberingSystem: "arab" });
console.log(f.format(1234.5), f.resolvedOptions().locale, f.resolvedOptions().numberingSystem);
console.log(new Intl.NumberFormat(["tk-TM", "tr", "ru"]).resolvedOptions().locale);
const tags = ["zh-HK", "zh-TW", "zh-MO", "zh-SG", "sr-ME", "sr-BA", "pa-PK", "az-IR", "uz-AF", "mo", "no-NO", "nn", "ms-Arab", "ks", "en-150", "es-MX", "pt-PT", "pt-MZ", "ca-ES-valencia", "fil", "tl", "he-IL", "iw-IL", "ar-001", "kk-Arab", "ky", "tg", "tt", "ba", "crh"];
let pairs = 0, diff = 0;
for (const name of ["NumberFormat", "DateTimeFormat", "Collator", "DisplayNames"]) for (const t of tags) {
  const make = (m) => new Intl[name](t, name === "DisplayNames" ? { type: "language", localeMatcher: m } : { localeMatcher: m }).resolvedOptions().locale;
  pairs++;
  if (make("lookup") !== make("best fit")) diff++;
}
console.log(pairs, diff);`), { lines: 8 });
  check(facts[0] === 'RangeError: Invalid language tag: EN_US' && lectureText.includes('у Chrome «Invalid language tag: EN_US», без кавычек и с заглавной'),
    `lecture 5: Chrome's message for "EN_US" — ${JSON.stringify(facts[0])}; MDN shows the one of Firefox`);
  check(!!facts[1] && !facts[1].startsWith('RangeError') && outputs.includes('true false true false'),
    `lecture 9: Asia/Ashkhabad is known (${JSON.stringify(facts[1])}) but not listed by supportedValuesOf`);
  check(facts[2] === 'true', `lecture 9: every list of supportedValuesOf is sorted and has no duplicates (MDN) ${JSON.stringify(facts[2])}`);
  check(facts[3] === 'Collator ru-RU, DateTimeFormat ru-RU, DurationFormat ru-RU, ListFormat ru-RU, NumberFormat ru-RU, PluralRules tk, RelativeTimeFormat ru-RU, Segmenter tk',
    `lecture 10: the constructors that list "tk" resolve it, the others fall back to ru-RU ${JSON.stringify(facts[3])}`);
  check(facts[4] === '١٬٢٣٤٫٥ ru-RU arab' && lectureText.includes('Нужна настройка независимо от языка — передавайте её опцией'),
    `lecture 15: a numbering system given as an option survives a missing language ${JSON.stringify(facts[4])}`);
  check(facts[5] === 'tr' && lectureText.includes('Без фильтра NumberFormat сам бы выбрал тот же tr'),
    `lecture 18: NumberFormat alone picks "tr" from tk-TM, tr, ru ${JSON.stringify(facts[5])}`);
  check(facts[6] === '120 0' && lectureText.includes('В Chrome best fit и lookup на этих тегах не разошлись ни разу'),
    `lecture 12: lookup and best fit agree on ${facts[6]?.split(' ')[0]} pairs of 30 tags and 4 constructors (differences: ${facts[6]?.split(' ')[1]})`);

  // the notes: every console.log line writes its output in its comment
  {
    const commented = (code) => code.split(LF).filter((l) => l.includes('console.log(') && l.includes('//'))
      .map((l) => l.slice(l.lastIndexOf('//') + 2).trim().split(' — ')[0]);
    check(notesBlocks.length === 3 && notesBlocks.every((x) => x.js && !x.file)
      && notesText.includes('Блоки конспекта — это main.js в папке дня 22, как в лекции.'),
    `student: 3 js blocks without a file name, main.js of the folder of day 22 (${notesBlocks.length})`);
    for (const [i, blk] of notesBlocks.entries()) {
      const want = commented(blk.code);
      const out = await runFolder(b, page(blk.code), { lines: want.length });
      if (!quiet) { console.log(`\n--- student #${i}: ${blk.code.split(LF)[0].slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
      check(want.length > 0 && same(out, want), `student #${i}: output = comments ${JSON.stringify(out)}`);
    }
  }

  // the notes, homework 1–4: by experiment
  {
    const hw1 = await runFolder(b, page(`const c = (x) => JSON.stringify(Intl.getCanonicalLocales(x));
console.log([c("EN-gb"), c("sh"), c("in-ID"), c("ru-u-nu-arab-nu-thai"), c(["tk", "TK", "tk-tm"]), c("en-US-u-fw-mon-x-u-ex-foobar")].join(" "));`), { lines: 1 });
    check(same(hw1, ['["en-GB"] ["sr-Latn"] ["id-ID"] ["ru-u-nu-arab"] ["tk","tk-TM"] ["en-US-u-fw-mon-x-u-ex-foobar"]'])
      && ['"EN-gb"', '"sh"', '"in-ID"', '"ru-u-nu-arab-nu-thai"', '["tk", "TK", "tk-tm"]', '"en-US-u-fw-mon-x-u-ex-foobar"'].every((s) => notesText.includes(s)),
    `student homework 1: case, old codes, the first of two nu, a duplicate after canonicalization, the private part untouched ${JSON.stringify(hw1)}`);
    const hw2 = await runFolder(b, page(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name + ": " + e.message; } };
console.log([run(() => Intl.getCanonicalLocales("en-GB-oed")), run(() => Intl.getCanonicalLocales([1])), run(() => Intl.supportedValuesOf("region")), run(() => new Intl.NumberFormat("ru", { localeMatcher: "exact" })), run(() => new Intl.NumberFormat("ru", { numberingSystem: "a" }))].join(" | "));`), { lines: 1 });
    check(same(hw2, ['RangeError: Invalid language tag: en-GB-oed | TypeError: Language ID should be string or object. | RangeError: Invalid key : region | RangeError: Value exact out of range for Intl.NumberFormat options property localeMatcher | RangeError: Invalid numberingSystem : a'])
      && notesText.includes('new Intl.NumberFormat("ru", { numberingSystem: "a" })') && notesText.includes('Intl.supportedValuesOf("region")'),
    `student homework 2: five errors — 6.2.1, 9.2.1 step 7.c.ii, 8.3.2 step 8.a, 9.2.11 step 5, 9.2.8 step 6.d.ii ${JSON.stringify(hw2)}`);
    const hw3 = await runFolder(b, page(`function pickLanguages(text, Ctor) {
  const good = [], bad = [];
  for (const raw of text.split(",")) {
    const t = raw.trim();
    try { good.push(...Intl.getCanonicalLocales(t)); } catch { bad.push(t); }
  }
  const supported = Ctor.supportedLocalesOf(good);
  return { use: supported.length > 0 ? supported : [navigator.language], skipped: good.filter((t) => !supported.includes(t)), bad };
}
const show = (r) => r.use.join() + " / " + r.skipped.join() + " / " + r.bad.join();
console.log(show(pickLanguages("TK-tm, tr_TR, tr, RU", Intl.NumberFormat)));
console.log(show(pickLanguages("tk, xx_YY", Intl.DateTimeFormat)));`), { lines: 2 });
    check(same(hw3, ['tr,ru / tk-TM / tr_TR', 'ru-RU / tk / xx_YY'])
      && notesText.includes('{ use, skipped, bad }') && notesText.includes('"TK-tm, tr_TR, tr, RU" с Intl.NumberFormat — tr,ru, tk-TM, tr_TR')
      && notesText.includes('"tk, xx_YY" с Intl.DateTimeFormat — язык браузера, tk, xx_YY'),
    `student homework 3: the reference solution — use, skipped, bad as the notes say ${JSON.stringify(hw3)}`);
    const hw4 = await runFolder(b, page(`const loc = (tag) => { const f = new Intl.NumberFormat(tag, { localeMatcher: "lookup" }); return f.resolvedOptions().locale + " " + f.resolvedOptions().numberingSystem + " " + f.format(12.5); };
console.log(Intl.NumberFormat.supportedLocalesOf(["tk-Latn-TM", "tk-Latn", "tk", "az-Cyrl-XX", "az-Cyrl"], { localeMatcher: "lookup" }).join());
console.log(loc(["tk-Latn-TM", "az-Cyrl-XX-u-nu-arab", "ru"]) + " | " + loc("tk-TM-u-nu-arab"));`), { lines: 2 });
    check(same(hw4, ['az-Cyrl-XX,az-Cyrl', 'az-Cyrl-u-nu-arab arab ١٢٫٥ | ru-RU latn 12,5'])
      && notesText.includes('new Intl.NumberFormat(["tk-Latn-TM", "az-Cyrl-XX-u-nu-arab", "ru"], { localeMatcher: "lookup" })'),
    `student homework 4: tk-Latn-TM, tk-Latn, tk have no pair, az-Cyrl-XX is cut to az-Cyrl and keeps -u-nu-arab; a missing tk-TM loses it ${JSON.stringify(hw4)}`);
  }

  // the tasks: the blocks to predict print what EXPECT says; every line of an example holds with the reference solution
  {
    check(taskBlocks.length === 9 && taskBlocks.filter((x) => x.example).length === 5 && taskBlocks.every((x) => !x.file && !x.box)
      && tasksText.includes('Код пишем в папке дня 22: блок — это main.js.'),
    `tasks: 9 js blocks — 5 examples, 4 to predict; no files, no result-box; the folder of day 22 (${taskBlocks.length})`);
    for (const [i, blk] of taskBlocks.entries()) {
      const code = blk.example ? checkable(blk.code) : blk.code;
      const want = blk.example ? null : EXPECT[`tasks #${i}`];
      const out = await runFolder(b, page(code), { lines: want ? want.length : (code.match(/await __check\(/g) || []).length });
      if (!quiet) { console.log(`\n--- tasks #${i}${blk.example ? ' (example)' : ''}: ${blk.code.split(LF)[0].slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
      if (blk.example) {
        for (const l of out.filter((x) => x.startsWith('EX-'))) check(l.startsWith('EX-OK'), `tasks #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(out.length > 0 && out.every((l) => l.startsWith('EX-')) && out.length === (code.match(/await __check\(/g) || []).length, `tasks #${i} example runs with the reference solution: ${out.length} lines`);
      } else check(!!want && same(out, want), `tasks #${i} ${blk.code.split(LF)[0].slice(0, 60)}: ${JSON.stringify(out)}`);
    }
  }

  // the tasks: the experiments of the criteria, with the reference solutions
  {
    const t4 = await runFolder(b, page(`${SOLUTIONS.formatPrice}
const raw = new Intl.NumberFormat("tr", { style: "currency", currency: "TMT" }).format(450);
console.log(raw === "TMT 450,00", raw.charCodeAt(3).toString(16), formatPrice(450, "tr").text === "TMT 450,00");`), { lines: 1 });
    check(same(t4, ['false a0 true']), `task 4: without the replacement the price does not equal "TMT 450,00" — Intl puts U+00A0 there ${JSON.stringify(t4)}`);
    const t5 = await runFolder(b, page(`${SOLUTIONS.lookupLocale}
console.log(JSON.stringify(lookupLocale("ru-u-zz-abc-nu-arab", ["ru"])), new Intl.NumberFormat("ru-u-zz-abc-nu-arab", { localeMatcher: "lookup" }).resolvedOptions().locale);`), { lines: 1 });
    check(same(t5, ['{"locale":"ru","extension":"-u-nu-arab-zz-abc"} ru-u-nu-arab']),
      `task 5: lookup hands back the whole extension (canonicalized, keys sorted), ResolveLocale keeps only the relevant supported key ${JSON.stringify(t5)}`);
    const t6 = await runFolder(b, page(`const ns = (v) => { try { return new Intl.NumberFormat("ru", { numberingSystem: v }).resolvedOptions().numberingSystem; } catch (e) { return e.name; } };
console.log(ns("xxxx"), ns("xx"), ns("arab"));`), { lines: 1 });
    check(same(t6, ['latn RangeError arab']), `task 6: "xxxx" fits the grammar of a type (3–8 letters) and is ignored, "xx" does not fit — RangeError ${JSON.stringify(t6)}`);
  }
  await b.close();

  // ECMA-402 2026 and the MDN pages of the day
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p.toLowerCase()}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\n[ \t]*\/\/ /g, ' ').replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`/g, '').replace(/\*\*/g, '').replace(/\b_([^_]+)_\b/g, '$1').replace(/\s+/g, ' ');
  const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
  const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma402.csv'), 'utf8').split('\n').map(csvLine);
  const dayMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '26');
  const daySpec = spRows.filter((c) => c[6] === '3' && c[7] === '26');
  const md = Object.fromEntries(dayMdn.map((c) => [c[0], mdn(c[0].replace(/^Web\/JavaScript\//, ''))]));
  const M = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, plain(v)]));
  const intlPage = M['Web/JavaScript/Reference/Global_Objects/Intl'];
  const canonPage = md['Web/JavaScript/Reference/Global_Objects/Intl/getCanonicalLocales'];
  const valuesPage = md['Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf'];

  // every English quote of the lecture is in the clauses of ECMA-402 of the day, the MDN pages or the output of Chrome;
  // the quotes it gives to ECMA-402 stand in their places and in their own clauses
  {
    const corpus = tight([...daySpec.map((c) => f(c[0])), ...Object.values(M), ...outputs, facts[0]].join(' '));
    // an English quote: starts with a Latin letter and has no Cyrillic (the name of the module «Intl целиком; …» is not one)
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => tight(m[1])).filter((x) => !/[а-яё]/i.test(x));
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length >= 14 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in ECMA-402 (the clauses of the day), the 3 MDN pages or the output of Chrome: ${missing.join(' | ') || 'none'}`);
    const fromSpec = [
      ['Всё собрано в одном объекте: «The Intl object is used to package all functionality defined in this specification in order to avoid name collisions»', 'sec-api-overview', 'The Intl object is used to package all functionality defined in this specification in order to avoid name collisions'],
      ['перечисляет, чем Intl не является: «is not a function object»', 'intl-object', 'is not a function object'],
      ['Локаль Intl называет тегом — «Unicode BCP 47 locale identifier»', 'sec-language-tags', 'Unicode BCP 47 locale identifier'],
      ['«tags like "en-GB-oed", "i-navajo", and "x-foo" are valid according to BCP 47 but are not Unicode BCP 47 locale identifiers»', 'sec-language-tags', 'tags like "en-GB-oed", "i-navajo", and "x-foo" are valid according to BCP 47 but are not Unicode BCP 47 locale identifiers'],
      ['Шаг 2 оставляет из повторов -u- только первый: «only the first keyword for a given key»', 'sec-canonicalizeunicodelocaleid', 'only the first keyword for a given key'],
      ['Заметка 2 про NaN («will not be interpreted as the language tag "nan"»)', 'sec-canonicalizelocalelist', 'will not be interpreted as the language tag "nan"'],
      ['Заметка к нему: это «a potential fingerprinting vector», и в браузере он «should match navigator.language»', 'sec-defaultlocale', 'should match navigator.language'],
      ['«If [[AvailableLocales]] contains "de-DE", then it must also contain "de"»', 'sec-internal-slots', 'If [[AvailableLocales]] contains "de-DE", then it must also contain "de"'],
      ['он «should produce results that a typical user of the requested locales would consider at least as good as those produced by the LookupMatchingLocaleByPrefix algorithm»', 'sec-lookupmatchinglocalebybestfit', 'should produce results that a typical user of the requested locales would consider at least as good as those produced by the LookupMatchingLocaleByPrefix algorithm'],
      ['Шаг 4 — нет пары: «set r to the Record { [[locale]]: DefaultLocale(), [[extension]]: empty }»', 'sec-resolvelocale', 'set r to the Record { [[locale]]: DefaultLocale(), [[extension]]: empty }'],
      ['Стандарт это разрешает — раздел 2: «A conforming implementation is permitted to provide additional objects, properties, and functions beyond those described in this specification»', 'conformance', 'A conforming implementation is permitted to provide additional objects, properties, and functions beyond those described in this specification'],
    ];
    const lost = fromSpec.filter(([inLecture, id, quote]) => !tight(lectureText).includes(tight(inLecture)) || !tight(f(id)).includes(tight(quote))).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`);
    check(lost.length === 0, `quotes: ${fromSpec.length} quotes the lecture gives to ECMA-402 stand in their places and in their clauses (4.2, 8, 6.2 twice, 6.2.2, 9.2.1, 6.2.3, 9.1, 9.2.4, 9.2.7, 2): ${lost.join(' | ') || 'all'}`);
  }

  // the notes: their English quotes are in the same corpus, the ones of ECMA-402 in their places and clauses; the steps of
  // their tables are the ones the lecture names (checked in the list of steps below); the footer
  {
    const corpus = tight([...daySpec.map((c) => f(c[0])), ...Object.values(M), ...outputs, facts[0]].join(' '));
    const nquotes = [...notesText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => tight(m[1]));
    const nmissing = nquotes.filter((x) => !corpus.includes(x));
    const nFromSpec = [
      ['Локаль — тег, «Unicode BCP 47 locale identifier»', 'sec-language-tags', 'Unicode BCP 47 locale identifier'],
      ['Не всё из BCP 47 годится Intl: «tags like "en-GB-oed", "i-navajo", and "x-foo" are valid according to BCP 47 but are not Unicode BCP 47 locale identifiers» (6.2)', 'sec-language-tags', 'tags like "en-GB-oed", "i-navajo", and "x-foo" are valid according to BCP 47 but are not Unicode BCP 47 locale identifiers'],
      ['в браузере «should match navigator.language»', 'sec-defaultlocale', 'should match navigator.language'],
      ['Список обязан содержать и общие теги: «If [[AvailableLocales]] contains "de-DE", then it must also contain "de"»', 'sec-internal-slots', 'If [[AvailableLocales]] contains "de-DE", then it must also contain "de"'],
    ];
    const nlost = nFromSpec.filter(([inNotes, id, quote]) => !tight(notesText).includes(tight(inNotes)) || !tight(f(id)).includes(tight(quote))).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`);
    check(nquotes.length === 6 && nmissing.length === 0 && nlost.length === 0,
      `student: ${nquotes.length} English quotes of the notes in ECMA-402, MDN or the output of Chrome (not found: ${nmissing.join(' | ') || 'none'}); the ${nFromSpec.length} of ECMA-402 in their places and clauses 6.2, 6.2.3, 9.1 (lost: ${nlost.join(' | ') || 'none'})`);
    const table = ['6.2.1: 2, 3, 6.a, 11.a', '6.2.2: 2; 8.3.1', '9.2.1: 1, 3, 4, 7.c.ii, 7.c.vii', '8.3.2: 2–7, 8.a', 'только основные имена (6.a)', '9.2.9: 4.c',
      '9.2.3: 1.b, 1.d, 1.d.iii', '9.2.7: 4', '9.2.7: 10, 13.c, 13.f, 13.k, 14', '9.2.8: 4, 6.d.ii; 9.2.11: 4.b, 5', 'опции ResolveLocale читает всегда (шаг 13.h)', 'стандарт разрешает (раздел 2)'];
    check(table.every((s) => notesText.includes(s)), `student: the tables and notes name the steps of the lecture (${table.length}: 6.2.1, 6.2.2, 9.2.1, 8.3.2, 9.2.9, 9.2.3, 9.2.7, 9.2.8, 9.2.11, 13.h, clause 2): missing ${table.filter((s) => !notesText.includes(s)).join(' | ') || 'none'}`);
    const notesHtml = builtSite.htmlOfFile(path.join(DAY, 'student.html'));
    const nFooter = notesHtml.slice(notesHtml.indexOf('<div class="sources">'));
    check(['Intl, Intl.getCanonicalLocales(), Intl.supportedValuesOf()', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => nFooter.includes(s))
      && (notesHtml.match(/developer\.mozilla\.org/g) || []).length === 1 && !/tc39\.es\/ecma402\/2026\/#/.test(notesHtml),
    'student: the footer names the MDN pages and ECMA-402 2026; MDN is linked once; section numbers without links');
  }

  // the tasks: what ECMA-402 says behind their criteria; their quotes (in their place in 6.5); the sections they ask for;
  // the link; the footer. The spec writes "<code>Europe/Kiev</code>" — spaces around quotes are dropped on both sides
  {
    const slots = (id) => { const t = tight(f(id)); return t.slice(t.indexOf('[[ResolutionOptionDescriptors]]'), t.indexOf('[[LocaleData]]')); };
    const dtf = slots('sec-intl.datetimeformat-internal-slots');
    const order = ['"calendar"', '"numberingSystem"', '"hour12"', '"hourCycle"'].map((s) => dtf.indexOf(s));
    check(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && slots('sec-intl.numberformat-internal-slots').includes('"numberingSystem"')
      && !slots('sec-intl.numberformat-internal-slots').includes('"calendar"'),
    `task 7: [[ResolutionOptionDescriptors]] — DateTimeFormat (11.2.3) calendar, numberingSystem, hour12, hourCycle in this order; NumberFormat (16.2.3) numberingSystem only ${JSON.stringify(order)}`);
    const units = ` ${f('sec-issanctionedsingleunitidentifier').split('Single Unit Identifier')[1] ?? ''} `;
    check(['acre', 'percent', 'kilometer', 'hour'].every((u) => units.includes(` ${u} `)) && !units.includes('square') && !units.includes('-per-')
      && f('sec-case-sensitivity-and-case-mapping').includes('The String values used to identify locales, currencies, scripts, and time zones are interpreted in an ASCII-case-insensitive manner')
      && f('sec-availablecanonicalunits').includes('simple unit identifiers listed in every row of Table 2'),
    'task 9: table 2 of 6.6.2 has acre, percent, kilometer, hour, no square-meter and no -per-; 6.1 makes only locales, currencies, scripts and time zones case-insensitive; 6.6.3 lists table 2 only');
    const nq = (s) => tight(s).replace(/\s*"\s*/g, '"');
    const corpus = nq([...daySpec.map((c) => f(c[0])), ...Object.values(M), ...outputs].join(' '));
    const tq = [...tasksText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => nq(m[1]));
    const tmissing = tq.filter((x) => !corpus.includes(x));
    const own65 = nq(f('sec-use-of-iana-time-zone-database'));
    const tplace = ['раздел 6.5: «in 2022 "Europe/Kiev" was deprecated to a Link resolving to a new "Europe/Kyiv" Zone»', 'советуют после ожидания — «the recommended rename waiting period is two years»'];
    check(tq.length === 2 && tmissing.length === 0 && tplace.every((s) => nq(tasksText).includes(nq(s)))
      && own65.includes(nq('in 2022 "Europe/Kiev" was deprecated to a Link resolving to a new "Europe/Kyiv" Zone')) && own65.includes('the recommended rename waiting period is two years')
      && f('sup-availablenamedtimezoneidentifiers').includes('If primary is a replacement time zone identifier and its rename waiting period has not concluded'),
    `tasks: ${tq.length} English quotes — 6.5 twice, in their place (task 2); 6.5.1 has the step of the waiting period; not found: ${tmissing.join(' | ') || 'none'}`);
    const asks = ['6.2.1 (какой), 6.2.2 или 9.2.1', 'шаги 8.3.2 и 9.2.9', '(6.5.1, шаг про rename waiting period)', 'шаги 1.d 9.2.3', '(9.2.7, шаги 4 и 10)', 'шагами 4 и 13.h ResolveLocale',
      'LookupMatchingLocaleByPrefix (9.2.3)', 'у каждого шага 1.a–1.d.iv', 'названы шаги 10, 13 и 14', 'шагом 9.2.7: 4, 13.c, 13.f или 13.k', '(9.2.8, шаг 6.d.ii)', 'шагами 4 и 6 ResolveOptions',
      'у чисел — 16.2.3, у дат — 11.2.3', 'читает одно имя (9.2.9)', '(4.2, косвенный путь)', 'который делает 6.2.2', 'таблицу единиц 6.6.2', 'назван шаг 6.6.1', 'что перечисляет раздел 6.1', 'supportedValuesOf (6.6.3)'];
    const flatTasks = tasksText.replace(/\s+/g, ' ');
    check(asks.every((s) => flatTasks.includes(s)), `tasks: they ask for ${asks.length} places of ECMA-402: missing ${asks.filter((s) => !flatTasks.includes(s)).join(' | ') || 'none'}`);
    const tnums = { 'sec-use-of-iana-time-zone-database': '6.5', 'sup-availablenamedtimezoneidentifiers': '6.5.1', 'sec-intl.numberformat-internal-slots': '16.2.3', 'sec-intl.datetimeformat-internal-slots': '11.2.3',
      'sec-issanctionedsingleunitidentifier': '6.6.2', 'sec-availablecanonicalunits': '6.6.3', 'sec-case-sensitivity-and-case-mapping': '6.1', 'sec-filterlocales': '9.2.9', 'sec-api-overview': '4.2' };
    const tWrong = Object.entries(tnums).filter(([id, k]) => num(id) !== k).map(([id, k]) => `${id}: ${num(id)}≠${k}`);
    check(tWrong.length === 0, `tasks: ${Object.keys(tnums).length} section numbers they name without links (6.5, 6.5.1, 16.2.3, 11.2.3, 6.6.2, 6.6.3, 6.1, 9.2.9, 4.2): ${tWrong.join('; ') || 'all right'}`);
    const tasksHtml = builtSite.htmlOfFile(path.join(DAY, 'tasks.html'));
    const tNamed = [...tasksHtml.matchAll(/<a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
    check(tNamed.length === 1 && tNamed.every(([id, k]) => num(id) === k && spec.includes(`id="${id}"`)) && !/tc39\.es\/ecma262\//.test(tasksHtml),
      `tasks: the one anchor of ECMA-402 exists with its number (6.6.1) ${JSON.stringify(tNamed.map(([, k]) => k))}; no links to ECMA-262`);
    const tFooter = tasksHtml.slice(tasksHtml.indexOf('<div class="sources">'));
    check(['Intl, Intl.getCanonicalLocales(), Intl.supportedValuesOf()', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => tFooter.includes(s))
      && (tasksHtml.match(/developer\.mozilla\.org/g) || []).length === 1,
    'tasks: the footer names the MDN pages and ECMA-402 2026; MDN is linked once');
  }

  // the MDN texts the lecture retells
  {
    check(hasAll(intlPage, ['A language subtag with 2–3 or 5–8 letters', 'A script subtag with 4 letters', 'A region subtag with either 2 letters or 3 digits', '"de-a-foo-a-foo" is invalid',
      'new Intl.DateTimeFormat("default") uses the implementation\'s default locale only because "default" is syntactically valid but not recognized as any locale'])
      && canonPage.includes('// Expected output: RangeError: invalid language tag: "EN_US"') && valuesPage.includes('// Expected output: RangeError: invalid key: "someInvalidKey"')
      && hasAll(plain(valuesPage), ['Duplicates are omitted and the array is sorted in ascending lexicographical order']),
    'MDN: Intl — the parts of a tag, "de-a-foo-a-foo" invalid, "default" gives the default locale; getCanonicalLocales and supportedValuesOf — the messages of Firefox; supportedValuesOf — sorted, no duplicates');
  }

  // the steps the lecture names
  const steps = [
    ['sec-iswellformedlanguagetag', 'If lowerLocale cannot be matched by the unicode_locale_id Unicode locale nonterminal, return false', '2'],
    ['sec-iswellformedlanguagetag', 'uses any of the backwards compatibility syntax', '3'],
    ['sec-iswellformedlanguagetag', 'If variants contains any duplicate subtags, return false', '6.a'],
    ['sec-iswellformedlanguagetag', 'If extensions contains any duplicate singleton subtags, return false', '11.a'],
    ['sec-canonicalizeunicodelocaleid', 'If localeId contains a substring that is a Unicode locale extension sequence, then', '2'],
    ['sec-canonicalizelocalelist', 'If locales is undefined, then', '1'],
    ['sec-canonicalizelocalelist', 'If locales is a String or locales is an Object and locales has an [[InitializedLocale]] internal slot, then', '3'],
    ['sec-canonicalizelocalelist', 'Let O be ? ToObject (locales)', '4.a'],
    ['sec-canonicalizelocalelist', 'If kValue is not a String and kValue is not an Object, throw a TypeError exception', '7.c.ii'],
    ['sec-canonicalizelocalelist', 'If seen does not contain canonicalizedTag, append canonicalizedTag to seen', '7.c.vii'],
    ['sec-intl.supportedvaluesof', 'If key is "calendar", then', '2'],
    ['sec-intl.supportedvaluesof', 'Let list be AvailablePrimaryTimeZoneIdentifiers ()', '6.a'],
    ['sec-intl.supportedvaluesof', 'Else if key is "unit", then', '7'],
    ['sec-intl.supportedvaluesof', 'Throw a RangeError exception', '8.a'],
    ['sec-lookupmatchinglocalebyprefix', 'If locale contains a Unicode locale extension sequence, then', '1.b'],
    ['sec-lookupmatchinglocalebyprefix', 'Repeat, while prefix is not the empty String,', '1.d'],
    ['sec-lookupmatchinglocalebyprefix', 'Repeat, while pos ≥ 2', '1.d.iii'],
    ['sec-lookupmatchinglocalebyprefix', 'Let extension be empty', '1.a'],
    ['sec-lookupmatchinglocalebyprefix', 'If availableLocales contains prefix, return the Record', '1.d.i'],
    ['sec-lookupmatchinglocalebyprefix', 'let pos be the index into prefix of the last occurrence of "-"', '1.d.ii'],
    ['sec-lookupmatchinglocalebyprefix', 'Set prefix to the substring of prefix from 0 to pos', '1.d.iv'],
    ['sec-iswellformedunitidentifier', 'If IsSanctionedSingleUnitIdentifier (unitIdentifier) is true, then', '1'],
    ['sec-iswellformedunitidentifier', 'is not not-found, then', '3'],
    ['sec-iswellformedunitidentifier', 'If IsSanctionedSingleUnitIdentifier (numerator) and IsSanctionedSingleUnitIdentifier (denominator) are both true, then', '7'],
    ['sec-resolvelocale', 'If matcher is "lookup", then', '2'],
    ['sec-resolvelocale', 'If r is undefined, set r to the Record', '4'],
    ['sec-resolvelocale', 'If r.[[extension]] is not empty, then', '10'],
    ['sec-resolvelocale', 'For each element key of relevantExtensionKeys, do', '13'],
    ['sec-resolvelocale', 'Let value be keyLocaleData [0]', '13.c'],
    ['sec-resolvelocale', 'If keywords contains an element whose [[Key]] is key, then', '13.f'],
    ['sec-resolvelocale', 'If keyLocaleData contains requestedValue, then', '13.f.iii.1'],
    ['sec-resolvelocale', 'Let optionsValue be options.[[< key >]]', '13.h'],
    ['sec-resolvelocale', 'If SameValue (optionsValue, value) is false and keyLocaleData contains optionsValue, then', '13.k'],
    ['sec-resolvelocale', 'If supportedKeywords is not empty, then', '14'],
    ['sec-resolveoptions', 'Let requestedLocales be ? CanonicalizeLocaleList (locales)', '1'],
    ['sec-resolveoptions', 'If specialBehaviours is present and contains coerce-options', '3'],
    ['sec-resolveoptions', 'Let matcher be ? GetOption (options, "localeMatcher"', '4'],
    ['sec-resolveoptions', 'For each Resolution Option Descriptor desc of constructor.[[ResolutionOptionDescriptors]], do', '6'],
    ['sec-resolveoptions', 'If value cannot be matched by the type Unicode locale nonterminal, throw a RangeError exception', '6.d.ii'],
    ['sec-filterlocales', 'If match is not undefined, append locale to subset', '4.c'],
    ['sec-coerceoptionstoobject', 'Return ? ToObject (options)', '2'],
    ['sec-getoption', 'Set value to ? ToString (value)', '4.b'],
    ['sec-getoption', 'If values is not empty and values does not contain value, throw a RangeError exception', '5'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-402: ${steps.length} step numbers the lecture, the notes and the tasks name (6.2.1, 6.2.2, 8.3.2, 9.2.1, 9.2.3, 9.2.7, 9.2.8, 9.2.9, 9.2.10, 9.2.11; 6.6.1 of task 9):${wrong.join('; ') || 'all right'}`);
  const nums = { 'sec-implementation-dependencies': '4.4', 'sec-intl-%symbol.tostringtag%': '8.1.1', 'sec-constructor-properties-of-the-intl-object': '8.2',
    'sec-function-properties-of-the-intl-object': '8.3', 'sec-currency-codes': '6.3', 'sec-use-of-iana-time-zone-database': '6.5', 'sec-availableprimarytimezoneidentifiers': '6.5.3',
    'sec-measurement-unit-identifiers': '6.6', 'sec-numberingsystem-identifiers': '6.7', 'sec-collation-types': '6.8', 'sec-calendar-types': '6.9', requirements: '7',
    'sec-unicode-extension-components': '9.2.5', 'sec-insert-unicode-extension-and-canonicalize': '9.2.6' };
  const wrongNums = Object.entries(nums).filter(([id, k]) => num(id) !== k).map(([id, k]) => `${id}: ${num(id)}≠${k}`);
  check(wrongNums.length === 0, `ECMA-402: ${Object.keys(nums).length} section numbers the lecture names without links (4.4, 6.3–6.9, 7, 8.1.1, 8.2, 8.3, 9.2.5, 9.2.6): ${wrongNums.join('; ') || 'all right'}`);

  // the texts the lecture retells
  {
    const ctors = (clause(spec, 'sec-constructor-properties-of-the-intl-object') + spec.slice(spec.indexOf('id="sec-constructor-properties-of-the-intl-object"'), spec.indexOf('id="sec-function-properties-of-the-intl-object"')))
      .match(/id="sec-intl\.[a-z]+-intro"/g) || [];
    check(hasAll(f('sec-api-overview'), ['Directly, by using a service constructor', 'Indirectly, by using the functions of ECMA-262 mentioned above', 'toLocaleUpperCase'])
      && hasAll(f('intl-object'), ['does not have a [[Construct]] internal method', 'does not have a [[Call]] internal method', '"IntlLegacyConstructedSymbol"'])
      && new Set(ctors).size === 10 && f('sec-language-tags').includes('the Unicode locale extension sequence of "en-US-u-fw-mon-x-u-ex-foobar" is "-u-fw-mon"')
      && hasAll(f('sec-internal-slots'), ['[[AvailableLocales]] is an Available Locales List. It must include the value returned by DefaultLocale', '[[RelevantExtensionKeys]]', '[[ResolutionOptionDescriptors]]', '[[LocaleData]]'])
      && clause(spec, 'sec-lookupmatchinglocalebybestfit').includes('type="implementation-defined abstract operation"')
      && f('sec-implementation-dependencies').includes('this specification has to leave several details implementation dependent') && lectureText.includes('Конструкторов в 8.2 десять, а Chrome показывает одиннадцать'),
    `ECMA-402: 4.2 — the direct and the indirect way, toLocaleUpperCase; 8 — no [[Construct]], no [[Call]], IntlLegacyConstructedSymbol; 8.2 — ${new Set(ctors).size} constructors; 6.2 — the example of -u-fw-mon; 9.1 — the four slots; 9.2.4 — implementation-defined; 4.4 — implementation dependent`);
    // additional properties (v8BreakIterator) are allowed by clause 2, not 7: 7 only points to the rules of ECMA-262
    const lecture = builtSite.htmlOfFile(path.join(DAY, 'lecture.html'));
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const row = (id) => (refTable.match(new RegExp(`#${id}">[^<]*</a></td><td>(.*?)</td>`)) || [])[1] ?? '';
    check(f('requirements').includes('are subject to the generic requirements and restrictions specified for standard built-in ECMAScript objects') && !f('requirements').includes('additional')
      && !lectureText.includes('(глава 7)') && row('conformance').includes('раздел 3') && !row('requirements').includes('раздел 3') && !/[«»]/.test(row('sec-iswellformedunitidentifier'))
      && hasAll(f('normative-references'), ['ECMA-262', 'ISO 4217', 'IETF RFC 4647', 'IANA Time Zone Database', 'Unicode Technical Standard #35']) && !f('normative-references').includes('BCP 47')
      && hasAll(row('normative-references'), ['ECMA-262', 'ISO 4217', 'RFC 4647', 'IANA', 'UTS #35']) && !row('normative-references').includes('BCP 47'),
    `ECMA-402 2, 3, 7: the additional properties are allowed by clause 2, 7 only points to ECMA-262 — the lecture and its table say so; 3 names ECMA-262, ISO 4217, RFC 4647, IANA, UTS #35 (not BCP 47 itself); the row of 6.6.1 quotes nothing (${JSON.stringify([row('conformance'), row('normative-references'), row('requirements'), row('sec-iswellformedunitidentifier')])})`);
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p)).replace(/ :/g, ':');
  {
    check(pageText('advanced/day-01/lecture.html').includes('а целиком он займёт модуль A7') && lectureText.includes('ECMA-402, «целиком займёт модуль A7»'),
      'lecture 1: day 1 — ECMA-402 «целиком займёт модуль A7»');
    const i25 = pageText('intermediate/day-25/lecture.html');
    check(i25.includes('Туркменского (tk) в Chrome 155 нет') && i25.includes('Intl.DateTimeFormat.supportedLocalesOf(["tk", "tr", "ru", "uz"])')
      && lectureText.includes('На дне 25 курса 2 мы смотрели только на DateTimeFormat'),
    'lecture 1, 10: day 25 of course 2 — no tk in Chrome 155, checked with DateTimeFormat.supportedLocalesOf');
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    const mods = read('tools/plan-modules.mjs');
    check(plan.includes('| 26 | A7 | ECMA-402 изнутри: языковые теги и согласование локалей |') && plan.includes('| 27 | A7 | Intl.Locale и Intl.Collator |')
      && plan.includes('| 28 | A7 | PluralRules, ListFormat и RelativeTimeFormat |') && plan.includes('| 29 | A7 | DisplayNames, DurationFormat и Segmenter |')
      && plan.includes('| 30 | A7 | Числа и даты по спецификации, функции, зависящие от локали |') && mods.includes("['A7', 3, 5, 'Intl целиком; числа и даты по спецификации']"),
    'lecture 1, 2, 19: the plan — A7 «Intl целиком; числа и даты по спецификации», five days 26–30 as the lecture names them');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor exists
  {
    const lecture = read('advanced/day-26/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">/g)].map((m) => decodeURIComponent(m[1]));
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const missing = [...daySpec.map((c) => c[0]).filter((id) => !refSpec.includes(id)), ...dayMdn.map((c) => c[0]).filter((p) => !refMdn.includes(p))];
    check(daySpec.length === 72 && dayMdn.length === 3 && refSpec.length === 72 && refMdn.length === 3 && missing.length === 0,
      `plan: ${daySpec.length} rows of ECMA-402 and ${dayMdn.length} of MDN for day 26, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = daySpec.filter((c) => c[9] === 'подробно').map((c) => c[0]).sort();
    const fullMdn = dayMdn.filter((c) => c[8] === 'подробно').map((c) => c[0]).sort();
    const markedSpec = [...refTable.matchAll(/ecma402\/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => decodeURIComponent(m[1])).sort();
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]).sort();
    check(fullSpec.length === 5 && fullMdn.length === 3 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 8 rows "подробно" (5 + 3) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const wrongTitle = dayMdn.filter((c) => !refTable.includes(`${c[0]}">MDN: ${c[1].replace(/&/g, '&amp;')}</a>`)).map((c) => c[0]);
    check(wrongTitle.length === 0, `plan: every MDN row is named by its title from the map ${wrongTitle.join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)/g)].map((m) => decodeURIComponent(m[1])));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(anchors.size >= 72 && gone.length === 0 && !/tc39\.es\/ecma262\//.test(lecture), `links: ${anchors.size} anchors of ECMA-402 2026, not in its text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length >= 90 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['Intl, Intl.getCanonicalLocales(), Intl.supportedValuesOf()', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 5,
      `links: the footer names the MDN pages and ECMA-402 2026; MDN is linked 5 times — section 1, 3 rows, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
