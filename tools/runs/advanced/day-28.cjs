// Course 3, day 28, in Chrome: Intl.PluralRules (categories, the constructor by steps, select and ResolvePlural,
// ordinals, selectRange), Intl.ListFormat (types and styles, CreatePartsFromList, StringListFromIterable) and
// Intl.RelativeTimeFormat (the constructor, PartitionRelativeTimePattern, numeric "auto", dates by Temporal; the status
// line of the cards, with Turkmen templates by hand). Every block of the lecture runs as main.js of a folder on
// http://127.0.0.1 — the index.html of the lecture of day 22 (the lecture sends the student there, as before). Output is
// awaited up to the number of lines of the result-box. The context is Ashgabat time, Russian: "tk" falls back to it.
//   node tools/runs/advanced/day-28.cjs            every block: output; checks below
//   node tools/runs/advanced/day-28.cjs --quiet    only the checks
// The source of the day is ECMA-402 2026: tools/.cache/ecma402-2026.html; links go to https://tc39.es/ecma402/2026/#….
// Checks: a result-box after a block equals its output; the cheatsheet runs without output; the experiments behind the
// text — the Russian categories, the digit options of PluralRules in the order of NumberFormat, the strings select
// works on, a number ending in …001 is one when exact, pluralCategories in the order of 17.3.2, the five Arabic
// examples of MDN and 100 as other, the ordinals of MDN, a Russian range takes the category of its end, equal ends give
// the range table and not the start (en, de, es, tr; fr: one), the templates of a Russian list, options as a string,
// the words of RelativeTimeFormat follow PluralRules, which values have a phrase in "auto", the eight units and their
// plurals, the calendar of the dates of section 15, the error table holds the messages of Chrome; the Turkmen templates
// of section 16 are those of CLDR — the Intl of Node with full ICU (this process) prints the same; every English quote
// of the lecture («…») is in the clauses of ECMA-402 of the day (and 16.5.16, 9.2.10), the 18 MDN pages or the output
// of Chrome, and the quotes it gives to ECMA-402 and to MDN stand in their places and in their own clause or page; the
// texts of ECMA-402 and MDN it retells (the five MDN errors among them); every step and section number it names; the
// days it points to say what it says; the reference table holds all 77 rows of the day's plan (59 of ECMA-402, 18 of
// MDN) with their marks and titles, every anchor exists and every link whose text starts with a number names the
// section of that number; the footer.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-28');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma402-2026.html');
const SPEC262 = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const ORIGIN = 'http://127.0.0.1:5594';
const quiet = process.argv.includes('--quiet');

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
// for comparing quotes: no space before ":" or "(", none around double quotes
const tight = (s) => s.replace(/\s+/g, ' ').replace(/ ([:(])/g, '$1').replace(/\s*"\s*/g, '"');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  if (at === -1) return '';
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
const hasAll = (text, words) => words.every((w) => text.includes(w));
// the same without any whitespace on both sides — the spec puts spaces around « », ( ) and . freely
const nows = (s) => s.replace(/\s+/g, '');
const hasNows = (text, words) => words.every((w) => nows(text).includes(nows(w)));
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
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const js = items.filter((x) => x.kind === 'code' && x.lang === 'js');
  const boxes = items.filter((x) => x.kind === 'box');
  check(js.length === 17 && js.filter((x) => x.file).length === 0 && js.filter((x) => x.cheat).length === 1
    && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && boxes.length === 16,
  `lecture: 17 js blocks (16 with a result-box and the cheatsheet), 16 result-boxes (${js.length}, ${boxes.length})`);
  check(!!indexHtml && indexHtml.includes('<script type="module" src="main.js"></script>') && lectureText.includes('Блоки запускаем в папке дня 22.'),
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
  const facts = await runFolder(b, page(`const err = (f) => { try { f(); return "ok"; } catch (e) { return e.name + ": " + e.message; } };
const pr = new Intl.PluralRules("ru");
const all = (ns, c) => ns.every((x) => pr.select(x) === c);
console.log(all([1, 21, 101, 1001], "one"), all([2, 3, 4, 22, 23, 24], "few"), all([0, 5, 6, 10, 11, 12, 14, 15, 20, 25, 111], "many"), all([0.5, 1.5, 2.5, 21.5], "other"));
const order = (C) => { const seen = []; new C("ru", new Proxy({}, { get(t, k) { if (typeof k === "string") seen.push(k); return undefined; } })); return seen; };
const digits = ["minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits", "minimumSignificantDigits", "maximumSignificantDigits", "roundingIncrement", "roundingMode", "roundingPriority", "trailingZeroDisplay"];
console.log(order(Intl.NumberFormat).filter((k) => digits.includes(k)).join() === digits.join(), order(Intl.PluralRules).filter((k) => digits.includes(k)).join() === digits.join());
console.log(new Intl.NumberFormat("fr", { notation: "compact", compactDisplay: "long" }).format(1500000), "|", new Intl.NumberFormat("fr").format(1500000).replace(/\\s/g, "_"));
const nf = (o) => new Intl.NumberFormat("ru", o);
console.log(nf().format(1.0001), nf().format(1.0005), nf({ minimumFractionDigits: 1 }).format(1), nf({ maximumFractionDigits: 0 }).format(1.5));
console.log(Number("1000000000000000000001") === 1e21, pr.select(1000000000000001));
console.log(new Intl.PluralRules("uk").resolvedOptions().pluralCategories.join(), ["ar", "cy", "ru", "uk", "en", "fr", "pl"].every((t) => { const c = new Intl.PluralRules(t).resolvedOptions().pluralCategories; const all6 = ["zero", "one", "two", "few", "many", "other"]; return c.every((x, i) => i === 0 || all6.indexOf(c[i - 1]) < all6.indexOf(x)); }));
console.log([0, 1, 2, 6, 18].map((x) => new Intl.PluralRules("ar-EG").select(x)).join(), new Intl.PluralRules("ar-EG").select(100));
const ord = new Intl.PluralRules("en-US", { type: "ordinal" });
const suf = new Map([["one", "st"], ["two", "nd"], ["few", "rd"], ["other", "th"]]);
console.log([0, 1, 2, 3, 4, 11, 21, 42, 103].map((x) => x + suf.get(ord.select(x))).join(" "));
let ends = true;
for (let a = 0; a <= 25; a++) for (let c = 0; c <= 25; c++) if (a !== c && pr.selectRange(a, c) !== pr.select(c)) ends = false;
console.log(ends, [[1, 1.5], [1.5, 2], [2, 2.5], [5, 1]].every(([a, c]) => pr.selectRange(a, c) === pr.select(c)));
console.log(["en", "de", "es", "tr", "fr"].map((t) => t + ":" + new Intl.PluralRules(t).selectRange(1, 1) + "/" + new Intl.PluralRules(t).select(1)).join(" "));
const lit = (l) => new Intl.ListFormat("ru").formatToParts(l).filter((p) => p.type === "literal").map((p) => JSON.stringify(p.value)).join();
console.log(lit(["А", "Б"]), "|", lit(["А", "Б", "В", "Г"]), "|", new Intl.ListFormat("ru").format(["Сапар", "Огулгерек"]));
console.log(err(() => new Intl.ListFormat("ru", "long")), "|", new Intl.RelativeTimeFormat("ru", "long").resolvedOptions().style, "|", err(() => new Intl.PluralRules("ru", null)));
const rtf = new Intl.RelativeTimeFormat("ru");
const word = { one: "день", few: "дня", many: "дней", other: "дня" };
console.log([1, 2, 5, 11, 21, 22, 25, 101, 1.5, 0.5].every((x) => rtf.format(x, "day").endsWith(" " + word[pr.select(x)])));
const auto = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const units = ["second", "minute", "hour", "day", "week", "month", "quarter", "year"];
console.log(units.map((u) => u + ":" + [-2, -1, 0, 1, 2].filter((v) => auto.format(v, u) !== rtf.format(v, u)).join(",")).join(" "), "|", new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-2, "day"));
console.log(units.every((u) => rtf.format(2, u) === rtf.format(2, u + "s")), "|", err(() => rtf.format(1, "millisecond")), "|", err(() => rtf.format(1, "Days")));
const d = (s) => Temporal.PlainDate.from(s);
console.log(d("2026-11-28").dayOfWeek, d("2026-12-08").weekOfYear - d("2026-11-28").weekOfYear, d("2026-11-28").until(d("2027-01-15")).toString());
console.log([err(() => Intl.PluralRules("ru")), err(() => new Intl.PluralRules("ru", { type: "plural" })), err(() => new Intl.PluralRules("ru").select(21n)), err(() => new Intl.PluralRules("ru").selectRange(1)), err(() => new Intl.ListFormat("ru").format([1, 2, 3])), err(() => new Intl.ListFormat("ru", "long")), err(() => rtf.format(1, "Day")), err(() => rtf.format(NaN, "day"))].join(" | "));
console.log(new Intl.RelativeTimeFormat("tk").resolvedOptions().locale, JSON.stringify(Intl.RelativeTimeFormat.supportedLocalesOf(["tk"])), JSON.stringify(Intl.ListFormat.supportedLocalesOf(["tk"])), JSON.stringify(Intl.PluralRules.supportedLocalesOf(["tk"])));`), { lines: 18 });
  const F = (i) => facts[i] ?? '';
  check(F(0) === 'true true true true'
    && lectureText.includes('У русского четыре категории: one — 1, 21, 101, но не 11; few — 2–4, 22–24; many — 0, 5–20, 25; other — дроби, «1,5 урока».'),
  `lecture 2: one — 1, 21, 101, 1001; few — 2–4, 22–24; many — 0, 5–20, 25, 111; other — fractions ${JSON.stringify(F(0))}`);
  check(F(1) === 'true true' && lectureText.includes('Опции цифр — те же, что у чисел (день 25 курса 2).'),
    `lecture 3: PluralRules reads the digit options of NumberFormat in the same order (SetNumberFormatDigitOptions) ${JSON.stringify(F(1))}`);
  check(F(2) === '1,5 million | 1_500_000' && lectureText.includes('французскому «1,5 million» нужна другая форма, чем 1 500 000'),
    `lecture 3: French prints 1 500 000 as «1,5 million» in compact notation — the form that needs another category ${JSON.stringify(F(2))}`);
  check(F(3) === '1 1,001 1,0 2' && lectureText.includes('1.0001 печатается как «1» — one, а 1.0005 — как «1,001» — other')
    && lectureText.includes('единица стала «1,0» — «1,0 урока»; без дробей 1,5 округлилось до «2» — «2 урока»'),
  `lecture 4: the strings select works on are those NumberFormat prints with the same digits ${JSON.stringify(F(3))}`);
  check(F(4) === 'true one' && lectureText.includes('Число кончается на 1, и по тексту ответ — one: «…001 урок».')
    && lectureText.includes('строка прошла через обычное число и стала 1e21'),
  `lecture 5: Number(big) is 1e21, an exact number ending in …001 (1000000000000001) is one ${JSON.stringify(F(4))}`);
  check(F(5) === 'one,few,many,other true' && lectureText.includes('пример MDN к resolvedOptions печатает старый порядок ["few", "many", "one", "other"]'),
    `lecture 6: pluralCategories go in the order zero, one, two, few, many, other (uk: one,few,many,other), not as the MDN example ${JSON.stringify(F(5))}`);
  check(F(6) === 'zero,one,two,few,many other' && lectureText.includes('страница select после пяти примеров говорит') && lectureText.includes('шестая, other, — у сотни'),
    `lecture 6: the five Arabic examples of MDN (0, 1, 2, 6, 18) give five categories, 100 is the sixth, other ${JSON.stringify(F(6))}`);
  check(F(7) === '0th 1st 2nd 3rd 4th 11th 21st 42nd 103rd' && lectureText.includes('Пример MDN — английские окончания.'),
    `lecture 6: the ordinals of the MDN example come out as MDN prints them ${JSON.stringify(F(7))}`);
  check(F(8) === 'true true' && lectureText.includes('По-русски форму диапазона решает конец; обратный диапазон 5–1 текст не запрещает.'),
    `lecture 7: a Russian range takes the category of its end — every pair of 0…25, fractions, 5–1 ${JSON.stringify(F(8))}`);
  check(F(9) === 'en:other/one de:other/one es:other/one tr:other/one fr:one/one'
    && lectureText.includes('у английского «1» и «1» печатаются одинаково, и шаг 4 велит вернуть категорию начала, one, а Chrome берёт other из таблицы диапазонов')
    && lectureText.includes('У французского таблица сама даёт one.'),
  `lecture 7: equal ends — Chrome gives the range table, not the category of the start (17.5.4, step 4): ${JSON.stringify(F(9))}`);
  check(F(10) === '" и " | ", ",", "," и " | Сапар и Огулгерек'
    && lectureText.includes('tkList повторяет шаблоны CreatePartsFromList: запятая в [[Start]] и [[Middle]], союз в [[End]] и [[Pair]].'),
  `lecture 9, 16, scheme 2: the Russian templates — Pair and End the conjunction, Start and Middle a comma ${JSON.stringify(F(10))}`);
  check(F(11) === 'TypeError: invalid_argument | long | TypeError: Intl.PluralRules called on null or undefined'
    && lectureText.includes('PluralRules ту же строку принял (раздел 3).'),
  `lecture 3, 10: options as a string — ListFormat throws, PluralRules and RelativeTimeFormat make an object of it (null throws) ${JSON.stringify(F(11))}`);
  check(F(12) === 'true' && lectureText.includes('Правила внутри те же, что в разделе 2.'),
    `lecture 12: the words of RelativeTimeFormat follow the categories of PluralRules ru (день, дня, дней) ${JSON.stringify(F(12))}`);
  check(F(13) === 'second:0 minute:0 hour:0 day:-2,-1,0,1,2 week:-1,0,1 month:-1,0,1 quarter:-1,0,1 year:-1,0,1 | 2 days ago'
    && lectureText.includes('У секунд, минут и часов есть только «0», у дней, недель, месяцев, кварталов и лет — ещё «-1» и «1», у русских дней — и «-2», «2».'),
  `lecture 14: the values with a phrase in "auto" — seconds, minutes, hours only 0; Russian days −2…2; English days not −2 ${JSON.stringify(F(13))}`);
  check(F(14) === "true | RangeError: Invalid unit argument for Intl.RelativeTimeFormat.prototype.format() 'millisecond' | RangeError: Invalid unit argument for Intl.RelativeTimeFormat.prototype.format() 'Days'"
    && lectureText.includes('"days" становится "day", единиц восемь, регистр важен'),
  `lecture 13: eight units and their plurals, no millisecond, the case matters ${JSON.stringify(F(14))}`);
  check(F(15) === '6 2 P48D' && lectureText.includes('а 8 декабря — уже через одну (28 ноября 2026 года — суббота)') && lectureText.includes('until без опций считает в днях'),
    `lecture 15: 28.11.2026 is a Saturday, 8 December is two calendar weeks later, until counts in days ${JSON.stringify(F(15))}`);
  const errors = F(16).split(' | ');
  const table = lectureText.slice(lectureText.indexOf('17. Ошибки дня'));
  check(errors.length === 8 && errors.every((e) => e !== 'ok' && table.includes(e)),
    `lecture 17: the texts of the error table are the messages of Chrome (8 calls): ${errors.filter((e) => !table.includes(e)).join(' | ') || 'all'}`);
  check(F(17) === 'ru-RU [] [] ["tk"]' && lectureText.includes('Как узнать, что "tk" у RelativeTimeFormat подменён?')
    && flat(builtSite.htmlOfFile(path.join(DAY, 'lecture.html'))).includes('resolvedOptions().locale — язык браузера, а supportedLocalesOf(["tk"]) — пустой массив.'),
    `lecture, selfcheck 4: "tk" at RelativeTimeFormat (and ListFormat) — the language of the browser and an empty supportedLocalesOf; PluralRules has tk ${JSON.stringify(F(17))}`);

  // section 16: the Turkmen templates are those of CLDR — the Intl of this process (Node with full ICU) has tk
  {
    const tkBlock = js.find((x) => x.code.includes('const tkWhen'));
    const out = tkBlock ? await runFolder(b, page(`${tkBlock.code}\nconsole.log([-3, -2, -1, 0, 1, 2, 3].map(tkWhen).join(", "), "|", tkList(["Aman", "Meret", "Sapar", "Ogulgerek"]), "|", JSON.stringify(tkList([])));`), { lines: 3 }) : [];
    const has = Intl.ListFormat.supportedLocalesOf(['tk']).join() === 'tk' && Intl.RelativeTimeFormat.supportedLocalesOf(['tk']).join() === 'tk';
    const nodeWhen = [-3, -2, -1, 0, 1, 2, 3].map((v) => new Intl.RelativeTimeFormat('tk', { numeric: 'auto' }).format(v, 'day')).join(', ');
    const nodeList = new Intl.ListFormat('tk').format(['Aman', 'Meret', 'Sapar', 'Ogulgerek']);
    const nodeLines = [new Intl.ListFormat('tk').format(['iýmit', 'mekdep', 'şäher']), new Intl.ListFormat('tk').format(['iýmit', 'mekdep'])];
    check(has && out[2] === `${nodeWhen} | ${nodeList} | ""` && outputs.includes(`iýmit, mekdep и şäher | ${nodeLines[0]} | ${nodeLines[1]}`),
      `lecture 16: tkWhen and tkList print what Node with full ICU (${process.versions.icu}, CLDR ${process.versions.cldr}) prints for tk: ${JSON.stringify([out[2], nodeWhen, nodeList, nodeLines])}`);
    const unit = [1, 5, 21].map((x) => new Intl.NumberFormat('tk', { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(x));
    const cats = new Intl.PluralRules('tk').resolvedOptions().pluralCategories.join();
    check(same(unit, ['1 gün', '5 gün', '21 gün']) && cats === 'one,other' && lectureText.includes('Таблица слов не нужна: форма «söz» одна для любого числа.')
      && lectureText.includes('после числа существительное не меняется: «1 sapak», «5 sapak»'),
    `lecture 6, 16: in Turkmen the noun after a number keeps one form — CLDR writes 1, 5 and 21 «gün» alike, though tk has one and other ${JSON.stringify([unit, cats])}`);
  }
  await b.close();

  // ECMA-402 2026 and the MDN pages of the day
  const spec = fs.readFileSync(SPEC, 'utf8');
  const spec262 = fs.readFileSync(SPEC262, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p.toLowerCase()}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\n[ \t]*\/\/ /g, ' ').replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`/g, '').replace(/\*\*/g, '').replace(/\b_([^_]+)_\b/g, '$1').replace(/\s+/g, ' ');
  const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
  const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma402.csv'), 'utf8').split('\n').map(csvLine);
  const dayMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '28');
  const daySpec = spRows.filter((c) => c[6] === '3' && c[7] === '28');
  const md = Object.fromEntries(dayMdn.map((c) => [c[0], mdn(c[0].replace(/^Web\/JavaScript\//, ''))]));
  const M = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, plain(v)]));
  const G = 'Web/JavaScript/Reference/Global_Objects/Intl/';
  const lt = tight(lectureText);

  // every English quote of the lecture is in the clauses of ECMA-402 of the day (and 16.5.16, 9.2.10), the MDN pages or
  // the output of Chrome; the quotes it gives to ECMA-402 and to MDN stand in their places and in their own clause or
  // page (a phrase that is in another source too would pass the corpus)
  {
    const corpus = tight([...daySpec.map((c) => f(c[0])), f('sec-tointlmathematicalvalue'), f('sec-coerceoptionstoobject'), ...Object.values(M), ...outputs].join(' '));
    // an English quote: starts with a Latin letter, has no Cyrillic and is longer than three letters («y», «and», «abc»)
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => tight(m[1])).filter((x) => !/[а-яё]/i.test(x) && x.length > 3);
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length === 19 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in ECMA-402 (the clauses of the day, 16.5.16, 9.2.10), the 18 MDN pages or the output of Chrome: ${missing.join(' | ') || 'none'}`);
    const fromSpec = [
      ['и текст его не хвалит: «its use is discouraged for new functionality in favour of GetOptionsObject»', 'sec-coerceoptionstoobject',
        'Because it coerces non-null primitive values into objects, its use is discouraged for new functionality in favour of GetOptionsObject'],
      ['ToIntlMathematicalValue (16.5.16) нужна, «so that exact decimal values can be represented»', 'sec-tointlmathematicalvalue',
        'a mathematical value can be returned instead of a Number or BigInt, so that exact decimal values can be represented'],
      ['Ключей нет: «Intl.ListFormat does not have any relevant extension keys»', 'sec-Intl.ListFormat-internal-slots', 'Note 1 Intl.ListFormat does not have any relevant extension keys'],
      ['Типы объясняет примечание 3: «conjunction stands for "and"-based lists (e.g., "A, B, and C"), disjunction stands for "or"-based lists (e.g., "A, B, or C"), and unit stands for lists of values with units (e.g., "5 pounds, 12 ounces")»', 'sec-Intl.ListFormat-internal-slots',
        'Note 3 Among the list types, conjunction stands for "and"-based lists (e.g., "A, B, and C"), disjunction stands for "or"-based lists (e.g., "A, B, or C"), and unit stands for lists of values with units (e.g., "5 pounds, 12 ounces")'],
      ['Примечание: «as in Spanish, where either "y" or "e" may be selected, depending on the following word»', 'sec-createpartsfromlist',
        'Note The index n to select across multiple templates permits the conjunction to be dependent on the context, as in Spanish, where either "y" or "e" may be selected, depending on the following word'],
      ['Почему так строго: «because there is no obvious locale-aware coercion for arbitrary values»', 'sec-createstringlistfromiterable',
        'Note This algorithm raises exceptions when it encounters values that are not Strings, because there is no obvious locale-aware coercion for arbitrary values'],
    ];
    const lost = fromSpec.filter(([inLecture, id, quote]) => !lt.includes(tight(inLecture)) || !tight(f(id)).includes(tight(quote))).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`);
    check(lost.length === 0, `quotes: ${fromSpec.length} quotes the lecture gives to ECMA-402 stand in their places and in their clauses (9.2.10, 16.5.16, 14.2.3 notes 1 and 3, the note of 14.5.2, the note of 14.5.5): ${lost.join(' | ') || 'all'}`);
    const fromMdn = [
      ['MDN: методы возвращают «a tag that represents the plural form of a single or a range of numbers, cardinal or ordinal»', 'PluralRules', 'return a tag that represents the plural form of a single or a range of numbers, cardinal or ordinal'],
      ['MDN: «Intl.PluralRules() can only be constructed with new»', 'PluralRules/PluralRules', 'Intl.PluralRules() can only be constructed with new'],
      ['Страница MDN о конструкторе notation не знает: «These options are interpreted as if the notation option from Intl.NumberFormat is "standard" and style is "decimal"»', 'PluralRules/PluralRules',
        'These options are interpreted as if the notation option from Intl.NumberFormat is "standard" and style is "decimal"'],
      ['страница select после пяти примеров говорит «Note that Arabic has 5 forms for cardinal numbers, as shown»', 'PluralRules/select', 'Note that Arabic has 5 forms for cardinal numbers, as shown'],
      ['MDN описывает Chrome: «In English there is only one plural form, such as "1–10 apples", and the method will return other»', 'PluralRules/selectRange',
        'In English there is only one plural form, such as "1–10 apples", and the method will return other'],
      ['MDN в разделе «Unit formatting» ошибается: «Use style: "unit" to format the list items as a compound unit»', 'ListFormat/ListFormat', '### Unit formatting Use style: "unit" to format the list items as a compound unit'],
      ['британский — нет (раздел MDN «Oxford comma»)', 'ListFormat/ListFormat', '### Oxford comma'],
      ['MDN: «this is for programmatic usage and is not localized»', 'RelativeTimeFormat/formatToParts', 'this is for programmatic usage and is not localized'],
      ['MDN: «When the value is 0, the output may be dependent on the unit»', 'RelativeTimeFormat/RelativeTimeFormat', 'When the value is 0, the output may be dependent on the unit'],
    ];
    const lostMdn = fromMdn.filter(([inLecture, p, quote]) => !lt.includes(tight(inLecture)) || !tight(M[G + p] ?? '').includes(tight(quote))).map(([, p, quote]) => `${p} «${quote.slice(0, 30)}»`);
    check(lostMdn.length === 0, `quotes: ${fromMdn.length} quotes the lecture gives to MDN stand in their places and on their pages (PluralRules, PluralRules() twice, select, selectRange, ListFormat() twice, RelativeTimeFormat formatToParts and constructor): ${lostMdn.join(' | ') || 'all'}`);
  }

  // the MDN texts the lecture retells — its five errors among them
  {
    const ctor = md[`${G}PluralRules/PluralRules`];
    check(!/- `notation`|compactDisplay/.test(ctor) && ctor.includes('- `minimumIntegerDigits`')
      && lectureText.includes('Страница MDN о конструкторе notation не знает'),
    'MDN PluralRules(): the options list has no notation and no compactDisplay — Chrome and 17.1.1 (steps 9–12) read them; the lecture says so');
    check(md[`${G}PluralRules/resolvedOptions`].includes('// Expected output: Array ["few", "many", "one", "other"]') && md[`${G}PluralRules/resolvedOptions`].includes('new Intl.PluralRules("uk")')
      && hasNows(f('sec-intl.pluralrules.prototype.resolvedoptions'), ['sorted according to the following order: "zero", "one", "two", "few", "many", "other"']),
    'MDN PluralRules resolvedOptions: the uk example prints the old order few, many, one, other; 17.3.2 sorts zero … other');
    const sel = md[`${G}PluralRules/select`];
    check(M[`${G}PluralRules`].includes('and Arabic has six!') && ['pr.select(0); // \'zero\'', 'pr.select(1); // \'one\'', 'pr.select(2); // \'two\'', 'pr.select(6); // \'few\'', 'pr.select(18); // \'many\''].every((s) => sel.includes(s))
      && (sel.match(/^pr\.select\(/gm) || []).length === 5,
    'MDN PluralRules: the main page says Arabic has six forms, select shows five examples (0, 1, 2, 6, 18) and says five');
    const main = md[`${G}ListFormat`];
    const parts = md[`${G}ListFormat/formatToParts`];
    const lfc = md[`${G}ListFormat/ListFormat`];
    check(/new Intl\.ListFormat\("en-GB", \{\s+style: "long",\s+type: "conjunction",\s+\}\)\.formatToParts\(list\)[^]*?\/\/ +\{ "type": "literal", "value": ", and " \}/.test(main)
      && /new Intl\.ListFormat\("en-GB", \{[^]*?\/\/ +\{ "type": "literal", "value": " and " \}/.test(parts),
    'MDN ListFormat: the main page prints ", and " for en-GB in formatToParts, the formatToParts page " and "');
    const unitSection = lfc.slice(lfc.indexOf('### Unit formatting'), lfc.indexOf('### Short and narrow style'));
    check(unitSection.includes('Use `style: "unit"` to format the list items as a compound unit') && unitSection.includes('new Intl.ListFormat("en-US", { type: "unit" })') && !unitSection.includes('{ style: "unit"')
      && hasNows(f('sec-Intl.ListFormat'), ['GetOption (options, "type", string, « "conjunction", "disjunction", "unit" », "conjunction")', 'GetOption (options, "style", string, « "long", "short", "narrow" », "long")']),
    'MDN ListFormat(): "Unit formatting" says style: "unit", its code passes type: "unit"; in 14.1.1 unit is a value of type, not of style');
    check(lfc.includes('the `en-US` locale uses the Oxford comma, while the `en-GB` locale does not') && lfc.includes('console.log(formatter.format(words));\n// fuerte e indomable') && lfc.includes('// indomable y fuerte')
      && M[`${G}PluralRules`].includes('formatOrdinals(103); // \'103rd\'') && M[`${G}PluralRules`].includes('["few", "rd"]'),
    'MDN: the Oxford comma of en-US and not of en-GB, the Spanish e/y example, the English ordinals with their suffixes');
  }

  // the steps the lecture names
  const steps = [
    ['sec-intl.pluralrules', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-intl.pluralrules', 'Let optionsResolution be ? ResolveOptions', '3'],
    ['sec-intl.pluralrules', 'Let t be ? GetOption (options, "type"', '7'],
    ['sec-intl.pluralrules', 'Let notation be ? GetOption (options, "notation"', '9'],
    ['sec-intl.pluralrules', 'If notation is "compact", then', '12'],
    ['sec-intl.pluralrules', 'Perform ? SetNumberFormatDigitOptions', '13'],
    ['sec-intl.pluralrules.prototype.resolvedoptions', 'Let pluralCategories be a List of Strings', '4'],
    ['sec-intl.pluralrules.prototype.select', 'Let n be ? ToIntlMathematicalValue (value)', '3'],
    ['sec-intl.pluralrules.prototype.selectrange', 'If start is undefined or end is undefined, throw a TypeError exception', '3'],
    ['sec-resolveplural', 'If n is not-a-number, then', '1'],
    ['sec-resolveplural', 'If n is positive-infinity, then', '2'],
    ['sec-resolveplural', 'If n is negative-infinity, then', '3'],
    ['sec-resolveplural', 'Let res be FormatNumericToString (pluralRules, n)', '4'],
    ['sec-resolveplural', 'Let p be PluralRuleSelect (locale, type, notation, compactDisplay, s)', '10'],
    ['sec-resolvepluralrange', 'If x is not-a-number or y is not-a-number, throw a RangeError exception', '1'],
    ['sec-resolvepluralrange', 'If xp.[[FormattedString]] is yp.[[FormattedString]], then', '4'],
    ['sec-tointlmathematicalvalue', 'If primValue is a BigInt, return', '2'],
    ['sec-tointlmathematicalvalue', 'If primValue is a String, then', '3'],
    ['sec-Intl.ListFormat', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-Intl.ListFormat', 'Let optionsResolution be ? ResolveOptions', '3'],
    ['sec-Intl.ListFormat', 'Let type be ? GetOption (options, "type"', '7'],
    ['sec-Intl.ListFormat', 'Let style be ? GetOption (options, "style"', '9'],
    ['sec-Intl.ListFormat', 'Set listFormat.[[Templates]] to', '13'],
    ['sec-createpartsfromlist', 'If size is 0, then', '2'],
    ['sec-createpartsfromlist', 'If size is 2, then', '3'],
    ['sec-createpartsfromlist', 'Let parts be', '5'],
    ['sec-createpartsfromlist', 'Repeat, while i ≥ 0,', '7'],
    ['sec-createpartsfromlist', 'Let n be an implementation-defined index', '7.b'],
    ['sec-createpartsfromlist', 'If i is 0, then', '7.c'],
    ['sec-createstringlistfromiterable', 'If iterable is undefined, then', '1'],
    ['sec-createstringlistfromiterable', 'If next is not a String, then', '4.c'],
    ['sec-createstringlistfromiterable', 'Return ? IteratorClose (iteratorRecord, error)', '4.c.ii'],
    ['sec-Intl.ListFormat.prototype.format', 'Let stringList be ? StringListFromIterable (list)', '3'],
    ['sec-Intl.RelativeTimeFormat', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-Intl.RelativeTimeFormat', 'Let optionsResolution be ? ResolveOptions', '3'],
    ['sec-Intl.RelativeTimeFormat', 'Let style be ? GetOption (options, "style"', '10'],
    ['sec-Intl.RelativeTimeFormat', 'Let numeric be ? GetOption (options, "numeric"', '12'],
    ['sec-Intl.RelativeTimeFormat', 'be ! Construct (%Intl.NumberFormat%', '16'],
    ['sec-Intl.RelativeTimeFormat', 'be ! Construct (%Intl.PluralRules%', '17'],
    ['sec-Intl.RelativeTimeFormat.prototype.format', 'Let value be ? ToNumber (value)', '3'],
    ['sec-Intl.RelativeTimeFormat.prototype.format', 'Let unit be ? ToString (unit)', '4'],
    ['sec-PartitionRelativeTimePattern', 'If value is NaN', '1'],
    ['sec-PartitionRelativeTimePattern', 'Let unit be ? SingularRelativeTimeUnit (unit)', '2'],
    ['sec-PartitionRelativeTimePattern', 'If relativeTimeFormat.[[Numeric]] is "auto", then', '7'],
    ['sec-PartitionRelativeTimePattern', 'Let valueString be ! ToString (value)', '7.a'],
    ['sec-PartitionRelativeTimePattern', 'If value is -0', '8'],
    ['sec-PartitionRelativeTimePattern', 'Let fv be PartitionNumberPattern', '11'],
    ['sec-PartitionRelativeTimePattern', 'Let pr be ResolvePlural', '12'],
    ['sec-PartitionRelativeTimePattern', 'Return MakePartsList (pattern, unit, fv)', '14'],
    ['sec-singularrelativetimeunit', 'If unit is not one of', '9'],
    ['sec-resolveoptions', 'contains coerce-options, set options to ? CoerceOptionsToObject (options)', '3'],
    ['sec-getoption', 'If values is not empty and values does not contain value, throw a RangeError exception', '5'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-402: ${steps.length} step numbers the lecture and its schemes name (17.1.1, 17.3.2, 17.3.3, 17.3.4, 17.5.2, 17.5.4, 16.5.16, 14.1.1, 14.5.2, 14.5.5, 14.3.3, 18.1.1, 18.3.3, 18.5.2, 18.5.1, 9.2.8, 9.2.11): ${wrong.join('; ') || 'all right'}`);
  const nums = { 'sec-intl.pluralrules.prototype.resolvedoptions': '17.3.2', 'sec-pluralruleselectrange': '17.5.3', 'sec-getoption': '9.2.11',
    'sec-intl.pluralrules-internal-slots': '17.2.3', 'sec-resolveoptions': '9.2.8' };
  const wrongNums = Object.entries(nums).filter(([id, k]) => num(id) !== k).map(([id, k]) => `${id}: ${num(id)}≠${k}`);
  const num262 = (clause(spec262, 'sec-getoptionsobject').match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const tables = [['sec-Intl.ListFormat.prototype.resolvedoptions', 'Table 25: Resolved Options of ListFormat Instances'], ['sec-intl.pluralrules.prototype.resolvedoptions', 'Table 32: Resolved Options of PluralRules Instances'],
    ['sec-intl.relativetimeformat.prototype.resolvedoptions', 'Table 33: Resolved Options of RelativeTimeFormat Instances']];
  const wrongTables = tables.filter(([id, t]) => !f(id).includes(t)).map(([id]) => id);
  check(wrongNums.length === 0 && wrongTables.length === 0 && num262 === '7.3.36' && hasNows(flat(clause(spec262, 'sec-getoptionsobject')), ['If options is an Object, then Return options. Throw a TypeError exception'])
    && hasAll(f('sec-intl.pluralrules-internal-slots'), ['Note 1', 'Note 2']) && hasAll(f('sec-Intl.ListFormat-internal-slots'), ['Note 1', 'Note 2', 'Note 3']),
  `ECMA-402: ${Object.keys(nums).length} section numbers named without links (17.3.2, 17.5.3, 9.2.11, 17.2.3, 9.2.8), ECMA-262 7.3.36 GetOptionsObject throws for a non-object, tables 25, 32, 33, notes of 17.2.3 and 14.2.3: ${[...wrongNums, ...wrongTables, num262].join('; ')}`);

  // the texts the lecture retells
  check(hasNows(f('sec-intl.pluralrules'), ['« coerce-options »', 'Perform ? SetNumberFormatDigitOptions (pluralRules, options, 0, 3, notation)', 'If notation is "compact", then Set pluralRules.[[CompactDisplay]] to compactDisplay'])
    && hasNows(f('sec-intl.pluralrules-internal-slots'), ['The value of the [[RelevantExtensionKeys]] internal slot is « »', 'It is recommended that implementations use the locale data provided by the Common Locale Data Repository'])
    && hasNows(f('sec-pluralruleselect'), ['implementation-defined abstract operation PluralRuleSelect', 's (a decimal String)'])
    && hasNows(f('sec-resolveplural'), ['[[PluralCategory]]: "other"']) && hasNows(f('sec-pluralruleselectrange'), ['implementation-dependent algorithm'])
    && !/greater|less than| > | < /.test(f('sec-resolvepluralrange')) && !/greater/.test(f('sec-intl.pluralrules.prototype.selectrange')),
  'ECMA-402 17: coerce-options, fraction digits from 0 to 3, compactDisplay only when compact, no extension keys, CLDR, PluralRuleSelect takes a decimal string, NaN and infinities are other, ranges by data, no order of the ends required');
  check(hasNows(f('sec-Intl.ListFormat'), ['ResolveOptions (%Intl.ListFormat%, %Intl.ListFormat%.[[LocaleData]], locales, options)']) && !f('sec-Intl.ListFormat').includes('coerce-options')
    && hasNows(f('sec-Intl.RelativeTimeFormat'), ['« coerce-options »']) && hasNows(f('sec-Intl.ListFormat-internal-slots'), ['The value of the [[RelevantExtensionKeys]] internal slot is « »', '[[Pair]], [[Start]], [[Middle]], and [[End]]'])
    && hasNows(f('sec-createpartsfromlist'), ['Let pattern be listFormat.[[Templates]][n].[[Pair]]', 'Let pattern be listFormat.[[Templates]][n].[[Start]]', 'Let pattern be listFormat.[[Templates]][n].[[Middle]]', 'Let pattern be listFormat.[[Templates]][n].[[End]]'])
    && hasNows(f('sec-formatlisttoparts'), ['"type"', '"value"']) && hasNows(f('sec-createpartsfromlist'), ['"element"', '"literal"']),
  'ECMA-402 14: ResolveOptions without coerce-options (RelativeTimeFormat and PluralRules have it), no extension keys, the four templates Pair, Start, Middle, End, parts element and literal');
  check(hasNows(f('sec-Intl.RelativeTimeFormat-internal-slots'), ['The value of the [[RelevantExtensionKeys]] internal slot is « "nu" »'])
    && hasNows(f('sec-Intl.RelativeTimeFormat'), ['Let numeric be ? GetOption (options, "numeric", string, « "always", "auto" », "always")', 'Construct (%Intl.PluralRules%, « locale »)'])
    && hasNows(f('sec-Intl.Locale'), ['Let kn be ? GetOption (options, "numeric", boolean'])
    && hasNows(f('sec-singularrelativetimeunit'), ['If unit is not one of "second", "minute", "hour", "day", "week", "month", "quarter", or "year", throw a RangeError exception'])
    && hasNows(f('sec-PartitionRelativeTimePattern'), ['If value is NaN, +∞', 'or -∞', 'throw a RangeError exception', 'If patterns has a field [[<valueString>]], then', 'Let tl be "past"'])
    && hasNows(f('sec-Intl.RelativeTimeFormat.prototype.format'), ['Let value be ? ToNumber (value)'])
    && hasNows(f('sec-FormatRelativeTimeToParts'), ['CreateDataPropertyOrThrow (O, "unit", part.[[Unit]])']),
  'ECMA-402 18: the key nu, numeric a string (in Locale, 15.1.1, a boolean), the PluralRules of the locale by %Intl.PluralRules%, eight units, NaN and ∞ RangeError, the phrase by ToString(value), past for −0 and below, ToNumber, parts with unit');

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p)).replace(/ :/g, ':');
  {
    const d26 = pageText('advanced/day-26/lecture.html');
    const d27 = pageText('advanced/day-27/lecture.html');
    check(hasAll(d26, ['ListFormat ru,en,tr', 'PluralRules ru,en,tk,tr,uz', 'RelativeTimeFormat ru,en,tr,uz', 'списки — день 28', 'множественное число — день 28', '«вчера» — день 28'])
      && d27.includes('Завтра — день 28: PluralRules («1 урок, 2 урока, 5 уроков»), ListFormat и RelativeTimeFormat.') && d27.includes('шаг 29 читает его как булеву опцию')
      && lectureText.includes('туркменский знает PluralRules, а ListFormat и RelativeTimeFormat — нет. День 27 обещал «1 урок, 2 урока, 5 уроков».')
      && hasAll(lectureText, ['а не булева опция, как у Locale (день 27)', 'Туркменский Chrome знает (день 26)', '"tk" стал языком браузера (день 26)']),
    'lecture 1, 12: day 26 — tk only in PluralRules among the three, the rows "день 28"; day 27 promised «1 урок, 2 урока, 5 уроков» and read numeric of Locale as a boolean');
    const i25 = pageText('intermediate/day-25/lecture.html');
    check(i25.includes('сам склоняет слово: 1 час, 2 часа, 5 часов') && i25.includes('5. Цифры, округление, запись') && i25.includes('Для сравнения — Node 22 с полной ICU')
      && pageText('intermediate/day-12/lecture.html').includes('8. return() и finally') && pageText('intermediate/day-21/lecture.html').includes('MAX_SAFE_INTEGER')
      && pageText('intermediate/day-22/lecture.html').includes('7. since и until: сколько между датами')
      && hasAll(lectureText, ['А на дне 25 курса 2 NumberFormat склонял только свои единицы — «5 часов»', 'Опции цифр — те же, что у чисел (день 25 курса 2).',
        'показывает Node с полной ICU (день 25 курса 2)', 'сработал его finally (день 12 курса 2)', 'до Number.MAX_SAFE_INTEGER (день 21 курса 2)', 'Разницу считает Temporal — until из дня 22 курса 2.']),
    'lecture 1, 3, 5, 10, 15, 16: course 2 — day 25 (unit declines «5 часов», digits, Node with full ICU), day 12 (return() and finally), day 21 (MAX_SAFE_INTEGER), day 22 (until)');
    const plan = read('docs/plan-3-advanced.md').replace(/`/g, '').replace(/\s+/g, ' ');
    check(plan.includes('| 28 | A7 | PluralRules, ListFormat и RelativeTimeFormat |') && plan.includes('| 29 | A7 | DisplayNames, DurationFormat и Segmenter |')
      && plan.includes('«1 урок, 2 урока, 5 уроков» через select (в ru для 1, 2, 5, 21 — one, few, many, one; проверено), «Аман, Мерет и Сапар» через ListFormat, «вчера» и «через 3 дня»')
      && plan.includes('разделы ECMA-402 17.1, 14.1, 18.1') && lectureText.includes('Завтра — день 29: DisplayNames, DurationFormat и Segmenter.'),
    'lecture 1, 17: the plan — day 28, its practice and chapters 17.1, 14.1, 18.1; day 29');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor exists
  {
    const lecture = read('advanced/day-28/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">/g)].map((m) => decodeURIComponent(m[1]));
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const missing = [...daySpec.map((c) => c[0]).filter((id) => !refSpec.includes(id)), ...dayMdn.map((c) => c[0]).filter((p) => !refMdn.includes(p))];
    check(daySpec.length === 59 && dayMdn.length === 18 && refSpec.length === 59 && refMdn.length === 18 && missing.length === 0,
      `plan: ${daySpec.length} rows of ECMA-402 and ${dayMdn.length} of MDN for day 28, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = daySpec.filter((c) => c[9] === 'подробно').map((c) => c[0]).sort();
    const fullMdn = dayMdn.filter((c) => c[8] === 'подробно').map((c) => c[0]).sort();
    const markedSpec = [...refTable.matchAll(/ecma402\/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => decodeURIComponent(m[1])).sort();
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]).sort();
    check(fullSpec.length === 3 && fullMdn.length === 9 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 12 rows "подробно" (3 + 9) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const wrongTitle = dayMdn.filter((c) => !refTable.includes(`${c[0]}">MDN: ${c[1].replace(/&/g, '&amp;')}</a>`)).map((c) => c[0]);
    const wrongSpecTitle = daySpec.filter((c) => !textOf(refTable).replace(/\s+/g, ' ').includes(`${c[1]} ${c[2]}`.replace(/\s+/g, ' '))).map((c) => c[1]);
    check(wrongTitle.length === 0 && wrongSpecTitle.length === 0, `plan: every row is named by its number and title from the map ${[...wrongTitle, ...wrongSpecTitle].join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)/g)].map((m) => decodeURIComponent(m[1])));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(anchors.size >= 64 && gone.length === 0 && !/tc39\.es\/ecma262\//.test(lecture), `links: ${anchors.size} anchors of ECMA-402 2026, not in its text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length >= 83 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['Intl.PluralRules, Intl.ListFormat, Intl.RelativeTimeFormat и их методы', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 22,
      `links: the footer names the MDN pages and ECMA-402 2026; MDN is linked 22 times — section 1 three times, 18 rows, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
