// Course 3, day 27, in Chrome: Intl.Locale (the constructor by steps, options over the tag, the -u- keys, maximize,
// minimize, the week, the time zones and the other lists of a locale) and Intl.Collator (usage, compare, sensitivity,
// numeric, caseFirst, ignorePunctuation, collation; a Turkmen order of letters by hand). Every block of the lecture runs
// as main.js of a folder on http://127.0.0.1 — the index.html of the lecture of day 22 (the lecture sends the student
// there, as before). Output is awaited up to the number of lines of the result-box. The context is Ashgabat time,
// Russian: section 18 prints the language a missing "tk" falls back to.
//   node tools/runs/advanced/day-27.cjs            every block: output; checks below
//   node tools/runs/advanced/day-27.cjs --quiet    only the checks
// The source of the day is ECMA-402 2026: tools/.cache/ecma402-2026.html; links go to https://tc39.es/ecma402/2026/#….
// Checks: a result-box after a block equals its output; the cheatsheet runs without output; the experiments behind the
// text — getWeekInfo gives firstDay and weekend only (MDN prints minimalDays; the other values of its examples hold),
// the parts of a Locale are getters on the prototype, ru takes ö, ü, ş, ç for o, u, s, c while tr does not, and neither
// knows ä, ý, ž; v and w are one letter only in sv-u-co-trad; numeric compares whole runs of digits; a Collator reads
// usage first; ignorePunctuation is true by default only for Thai; SU becomes the region likely for the language;
// zh-TW and zh-Hant both maximize to zh-Hant-TW; phonebk reads ö as oe; a key value is checked by its grammar only; the
// error table holds the messages of Chrome; compareTk puts letters outside the alphabet after it; every English quote
// of the lecture («…») is in the clauses of ECMA-402 of the day (and 10.3.3.2), the 28 MDN pages or the output of
// Chrome, and the quotes it gives to ECMA-402 and to MDN stand in their places and in their own clause or page; the
// texts of ECMA-402 and MDN it retells; every step and section number it names; the days it points to say what it
// says; the reference table holds all 93 rows
// of the day's plan (65 of ECMA-402, 28 of MDN) with their marks and titles, every anchor exists and every link whose
// text starts with a number names the section of that number; the footer. The notes: each of their 3 blocks prints
// what the comments of its console.log lines say; homework 1 — five toString() to predict; 2 — five errors with the
// texts of Chrome; 3 — the reference weekendNames (getWeekInfo and the weekday of DateTimeFormat); 4 — the reference
// findName with a search collator; their English quotes (the 4 of ECMA-402 and the 3 of MDN in their places), the steps
// of their tables and the footer.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-27');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const SPEC = path.join(ROOT, 'tools/.cache/ecma402-2026.html');
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
// for comparing quotes: no space before ":" or "(", none around double quotes — the spec writes "[[locale]] : …" and
// "<code>ö</code>" in quotes
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
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'student.html')));
  const notesBlocks = await src.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => ({ js: pre.matches('.js'), file: pre.dataset.file || null, code: pre.textContent })));
  const notesText = await src.evaluate(() => document.querySelector('.container').innerText);
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const js = items.filter((x) => x.kind === 'code' && x.lang === 'js');
  const boxes = items.filter((x) => x.kind === 'box');
  check(js.length === 19 && js.filter((x) => x.file).length === 0 && js.filter((x) => x.cheat).length === 1
    && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && boxes.length === 18,
  `lecture: 19 js blocks (18 with a result-box and the cheatsheet), 18 result-boxes (${js.length}, ${boxes.length})`);
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
  check(n === 18, `lecture: every result-box had a block before it (${n})`);
  const outputs = boxes.flatMap((x) => x.lines);

  // the cheatsheet runs without output
  {
    const out = await runFolder(b, page(js.find((x) => x.cheat).code));
    check(out.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out)}`);
  }

  // the experiments behind the text
  const facts = await runFolder(b, page(`const keys = (t) => Object.keys(new Intl.Locale(t).getWeekInfo()).join();
console.log(["tk-TM", "en-US", "he", "fa-IR", "ar-AF", "und"].every((t) => keys(t) === "firstDay,weekend"));
const wi = (t) => { const w = new Intl.Locale(t).getWeekInfo(); return w.firstDay + "/" + w.weekend.join(","); };
console.log(["he", "af", "en-GB", "ar-AF", "dv-MV"].map(wi).join(" "));
const desc = (k) => Object.getOwnPropertyDescriptor(Intl.Locale.prototype, k);
console.log(["baseName", "language", "script", "region", "calendar", "hourCycle", "firstDayOfWeek"].every((k) => typeof desc(k).get === "function" && desc(k).set === undefined));
const b = (t, x, y) => Number(new Intl.Collator(t, { sensitivity: "base" }).compare(x, y) !== 0);
console.log(["ö/o", "ü/u", "ş/s", "ç/c", "ä/a", "ý/y", "ž/z"].map((p) => { const [x, y] = p.split("/"); return p + ":" + b("ru", x, y) + b("tr", x, y); }).join(" "));
console.log(new Intl.Collator("sv-u-co-trad").resolvedOptions().collation, new Intl.Locale("sv").getCollations().includes("trad"), b("sv", "v", "w"), b("sv-u-co-trad", "v", "w"));
const num = new Intl.Collator("ru", { numeric: true });
console.log(num.compare("x02", "x2"), num.compare("1.5", "1.10"));
const seen = [];
new Intl.Collator("ru", new Proxy({}, { get(t, k) { if (typeof k === "string") seen.push(k); return undefined; } }));
console.log(seen.join());
console.log(["ru", "en", "ar", "ja", "tr", "de"].map((t) => new Intl.Collator(t).resolvedOptions().ignorePunctuation).join(), new Intl.Collator("th").resolvedOptions().ignorePunctuation);
console.log(Intl.getCanonicalLocales(["tk-SU", "ru-SU", "uz-SU", "hy-SU", "kk-SU"]).join());
console.log(new Intl.Locale("zh-TW").maximize().baseName, new Intl.Locale("zh-Hant").maximize().baseName);
const pb = (t) => new Intl.Collator(t, { sensitivity: "base" }).compare("Österreich", "Oesterreich");
console.log(pb("de-u-co-phonebk"), pb("de") !== 0);
console.log(new Intl.Locale("tk", { calendar: "xxxx" }).calendar, new Intl.Locale("tk-u-ca-xxxx").getCalendars().join());
const err = (f) => { try { f(); return "ok"; } catch (e) { return e.name + ": " + e.message; } };
console.log([err(() => Intl.Locale("tk")), err(() => new Intl.Locale(5)), err(() => new Intl.Locale("tk_TM")), err(() => new Intl.Locale("tk", { region: "Turkmenistan" })), err(() => new Intl.Locale("tk", { hourCycle: "h25" })), err(() => new Intl.Collator("ru", { sensitivity: "high" })), err(() => Intl.Collator.prototype.compare)].join(" | "));`), { lines: 13 });
  check(facts[0] === 'true' && lectureText.includes('По таблице 27 полей два'),
    `lecture 9: getWeekInfo gives firstDay and weekend only, as table 27 — no minimalDays (${JSON.stringify(facts[0])})`);
  check(facts[1] === '7/5,6 7/6,7 1/6,7 6/4,5 5/6,7',
    `lecture 9: the first days and weekends of the MDN examples (he, af, en-GB, ar-AF, dv-MV) hold — only minimalDays is gone ${JSON.stringify(facts[1])}`);
  check(facts[2] === 'true' && lectureText.includes('Своих свойств нет: части — геттеры на прототипе'),
    `lecture 2: the parts of a Locale are getters without setters on the prototype ${JSON.stringify(facts[2])}`);
  check(facts[3] === 'ö/o:01 ü/u:01 ş/s:01 ç/c:01 ä/a:00 ý/y:00 ž/z:00'
    && lectureText.includes('Русские правила считают «ö», «ü», «ş» вариантами «o», «u», «s»') && lectureText.includes('Но «ä», «ý» и «ž» не знает и он.'),
  `lecture 18: ru takes ö, ü, ş, ç for o, u, s, c, tr keeps them apart; neither tells ä, ý, ž from a, y, z ${JSON.stringify(facts[3])}`);
  check(facts[4] === 'trad true 1 0' && lectureText.includes('одной буквой они остались только в традиционной сортировке trad'),
    `lecture 17: v and w are one base letter only in sv-u-co-trad, the default Swedish keeps them apart ${JSON.stringify(facts[4])}`);
  check(facts[5] === '0 -1' && lectureText.includes('с numeric: true строки "x02" и "x2" равны, а "1.5" стоит раньше "1.10"'),
    `lecture, selfcheck 5: numeric compares whole runs of digits — "x02" = "x2", "1.5" < "1.10" ${JSON.stringify(facts[5])}`);
  check(facts[6] === 'usage,localeMatcher,collation,numeric,caseFirst,sensitivity,ignorePunctuation' && lectureText.includes('Шаг 7 читает usage раньше выбора локали'),
    `lecture 13: a Collator reads usage before ResolveOptions (localeMatcher, co, kn, kf), then sensitivity and ignorePunctuation ${JSON.stringify(facts[6])}`);
  check(facts[7] === 'false,false,false,false,false,false true',
    `lecture 16: ignorePunctuation is true by default for Thai only (MDN) ${JSON.stringify(facts[7])}`);
  check(facts[8] === 'tk-TM,ru-RU,uz-UZ,hy-AM,kk-KZ' && lectureText.includes('из многих замен SU выбран регион, вероятный для языка'),
    `lecture 7: the old region SU becomes the region likely for the language ${JSON.stringify(facts[8])}`);
  check(facts[9] === 'zh-Hant-TW zh-Hant-TW' && lectureText.includes('письменность выводится из региона, и регион алгоритм оставляет'),
    `lecture 8: both zh-TW and zh-Hant maximize to zh-Hant-TW — minimize keeps the region ${JSON.stringify(facts[9])}`);
  check(facts[10] === '0 true' && lectureText.includes('В «телефонной книге» немцев «ö» читается как «oe»'),
    `lecture 17: in phonebk Österreich = Oesterreich at the base level, in the default German not ${JSON.stringify(facts[10])}`);
  check(facts[11] === 'xxxx xxxx' && lectureText.includes('Значения проверяются только по грамматике.'),
    `lecture 6: a value of a key is checked by its grammar only — calendar "xxxx" is kept and even listed ${JSON.stringify(facts[11])}`);
  const errors = (facts[12] ?? '').split(' | ');
  const table = lectureText.slice(lectureText.indexOf('19. Ошибки дня'));
  check(errors.length === 7 && errors.every((e) => e !== 'ok' && table.includes(e)),
    `lecture 19: the texts of the error table are the messages of Chrome (7 calls): ${errors.filter((e) => !table.includes(e)).join(' | ') || 'all'}`);
  {
    const tk = js.find((x) => x.code.includes('function compareTk('));
    const out = tk ? await runFolder(b, page(`${tk.code}\nconsole.log(["q", "z", "1", "ä"].toSorted(compareTk).join(" "));`), { lines: 4 }) : [];
    check(out[3] === 'ä z 1 q' && lectureText.includes('Буквы вне алфавита идут после него по коду'),
      `lecture 18: compareTk puts letters outside the alphabet after it, by their codes ${JSON.stringify(out[3])}`);
  }

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

  // the notes, homework 1–4: by experiment (the outputs go into the corpus of the quotes too — «Cuma, Cumartesi»)
  const homework = [];
  {
    const hw1 = await runFolder(b, page(`console.log([new Intl.Locale("sh", { region: "BA" }), new Intl.Locale("tk-SU", { numeric: true }), new Intl.Locale("en-u-hc-h12", { hourCycle: "h23" }), new Intl.Locale("ru-Latn").maximize(), new Intl.Locale("en-Latn-US-u-ca-gregory").minimize()].map(String).join(" "));`), { lines: 1 });
    check(same(hw1, ['sr-Latn-BA tk-TM-u-kn en-u-hc-h23 ru-Latn-RU en-u-ca-gregory'])
      && ['new Intl.Locale("sh", { region: "BA" })', 'new Intl.Locale("tk-SU", { numeric: true })', 'new Intl.Locale("en-u-hc-h12", { hourCycle: "h23" })', 'new Intl.Locale("ru-Latn").maximize()', 'new Intl.Locale("en-Latn-US-u-ca-gregory").minimize()'].every((s) => notesText.includes(s)),
    `student homework 1: canonicalization before the region, SU and kn, the option over -u-, maximize keeps Latn, minimize keeps -u- ${JSON.stringify(hw1)}`);
    const hw2 = await runFolder(b, page(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name + ": " + e.message; } };
console.log([run(() => Intl.Locale("tk")), run(() => new Intl.Locale(null)), run(() => new Intl.Locale("tk", { script: "Latin" })), run(() => new Intl.Locale("tk", { variants: "1996-1996" })), run(() => new Intl.Collator("ru", { usage: "filter" }))].join(" | "));`), { lines: 1 });
    check(same(hw2, ["TypeError: Constructor Intl.Locale requires 'new' | TypeError: First argument to Intl.Locale constructor can't be empty or missing | RangeError: Incorrect locale information provided | RangeError: Incorrect locale information provided | RangeError: Value filter out of range for Intl.Collator options property usage"])
      && notesText.includes('new Intl.Locale("tk", { variants: "1996-1996" })') && notesText.includes('new Intl.Collator("ru", { usage: "filter" })'),
    `student homework 2: five errors — 15.1.1 steps 1 and 7, the grammar of 15.1.2 twice (script, duplicate variants), 10.1.1 step 7 with 9.2.11 step 5 ${JSON.stringify(hw2)}`);
    const hw3 = await runFolder(b, page(`function weekendNames(tag, lang) {
  const { weekend } = new Intl.Locale(tag).getWeekInfo();
  const fmt = new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" });
  return weekend.map((d) => fmt.format(new Date(Date.UTC(2026, 10, 22 + d)))).join(", ");
}
console.log([weekendNames("tk-TM", "ru"), weekendNames("fa-IR", "ru"), weekendNames("ar-AF", "ru"), weekendNames("he", "tr")].join(" | "));`), { lines: 1 });
    check(same(hw3, ['суббота, воскресенье | пятница | четверг, пятница | Cuma, Cumartesi'])
      && notesText.includes('"tk-TM" по-русски — «суббота, воскресенье», "fa-IR" — «пятница», "ar-AF" — «четверг, пятница», "he" по-турецки — «Cuma, Cumartesi»'),
    `student homework 3: the reference weekendNames — getWeekInfo and the long weekday of DateTimeFormat (23 November 2026 is a Monday) ${JSON.stringify(hw3)}`);
    const hw4 = await runFolder(b, page(`function findName(list, query) {
  const c = new Intl.Collator("ru", { usage: "search", sensitivity: "base" });
  return list.filter((n) => c.compare(n, query) === 0);
}
console.log(findName(["Ýusup", "yusup", "Jusup", "ÝUSUP", "Gülnar", "Gulnar", "Gülnara"], "gulnar").join(", "));`), { lines: 1 });
    check(same(hw4, ['Gülnar, Gulnar']) && notesText.includes('Почему тем же коллатором нельзя отсортировать список?'),
      `student homework 4: the reference findName — a search collator with base finds Gülnar and Gulnar, not Gülnara ${JSON.stringify(hw4)}`);
    homework.push(...hw1, ...hw2, ...hw3, ...hw4);
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
  const dayMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '27');
  const daySpec = spRows.filter((c) => c[6] === '3' && c[7] === '27');
  const md = Object.fromEntries(dayMdn.map((c) => [c[0], mdn(c[0].replace(/^Web\/JavaScript\//, ''))]));
  const M = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, plain(v)]));
  const G = 'Web/JavaScript/Reference/Global_Objects/Intl/';
  const lt = tight(lectureText);

  // every English quote of the lecture is in the clauses of ECMA-402 of the day (and the nested 10.3.3.2), the MDN pages
  // or the output of Chrome; the quotes it gives to ECMA-402 and to MDN stand in their places and in their own clause or
  // page (a phrase that is in another source too would pass the corpus)
  {
    const corpus = tight([...daySpec.map((c) => f(c[0])), f('sec-collator-comparestrings'), ...Object.values(M), ...outputs].join(' '));
    // an English quote: starts with a Latin letter, has no Cyrillic and is longer than a letter or two («o», «ch»)
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => tight(m[1])).filter((x) => !/[а-яё]/i.test(x) && x.length > 3);
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length === 14 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in ECMA-402 (the clauses of the day, 10.3.3.2), the 28 MDN pages or the output of Chrome: ${missing.join(' | ') || 'none'}`);
    const fromSpec = [
      ['объясняет примечание шага 12: «Because LanguageId canonicalization can alter tag in arbitrary ways according to Alias Rules from supplementalMetadata.xml, it is necessary to perform such canonicalization before applying overrides from options»', 'sec-Intl.Locale',
        'Because LanguageId canonicalization can alter tag in arbitrary ways according to Alias Rules from supplementalMetadata.xml, it is necessary to perform such canonicalization before applying overrides from options'],
      ['значения «based on locale» выбирает реализация', 'sec-weekinfooflocale', 'with values based on locale'],
      ['Текст требует «canonical Zone name» базы IANA', 'sec-timezonesoflocale', 'canonical Zone name of the IANA Time Zone Database'],
      ['примечание предупреждает: «Web developers should not rely too much on this API to decide the direction of the text»', 'sec-textdirectionoflocale', 'Web developers should not rely too much on this API to decide the direction of the text'],
      ['Примечание: «The returned function is bound to collator so that it can be passed directly to Array.prototype.sort or other functions»', 'sec-intl.collator.prototype.compare', 'The returned function is bound to collator so that it can be passed directly to Array.prototype.sort or other functions'],
      ['Основа буквы важна всегда: «different base letters always compare as unequal»', 'sec-collator-comparestrings', 'different base letters always compare as unequal'],
      ['Примечание 1 даёт примеры: «in Swedish, "ö" is a base letter that differs from "o", and "v" and "w" are considered to be the same base letter»', 'sec-collator-comparestrings',
        'Note 1 The mapping from input code points to base letters can include arbitrary contractions, expansions, and collisions, including those that apply special treatment to certain characters with diacritic marks. For example, in Swedish, "ö" is a base letter that differs from "o", and "v" and "w" are considered to be the same base letter'],
      ['Сортировать коллатором поиска нельзя: «this collation is not guaranteed to be in any particular order» (примечание 10.1.1)', 'sec-intl.collator', 'Note The collation associated with the "search" value for the "usage" option should only be used to find matching strings, since this collation is not guaranteed to be in any particular order'],
    ];
    const lost = fromSpec.filter(([inLecture, id, quote]) => !lt.includes(tight(inLecture)) || !tight(f(id)).includes(tight(quote))).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`);
    check(lost.length === 0, `quotes: ${fromSpec.length} quotes the lecture gives to ECMA-402 stand in their places and in their clauses (15.1.1, 15.5.17, 15.5.13, 15.5.14, 10.3.3, 10.3.3.2 twice, 10.1.1): ${lost.join(' | ') || 'all'}`);
    const fromMdn = [
      ['MDN: «The information above is exactly provided as-is when the Locale object is constructed, without consulting any external database»', 'Locale', 'The information above is exactly provided as-is when the Locale object is constructed, without consulting any external database'],
      ['MDN: «Intl.Locale() can only be constructed with new»', 'Locale/Locale', 'Intl.Locale() can only be constructed with new'],
      ['MDN: «Option values here take priority over extension keys in the locale identifier»', 'Locale/Locale', 'Option values here take priority over extension keys in the locale identifier'],
      ['MDN: «Both create a new Intl.Collator instance»', 'Collator/Collator', 'Both create a new Intl.Collator instance'],
      ['MDN: «The default is true for Thai (th) and false for all other languages»', 'Collator/Collator', 'The default is true for Thai (th) and false for all other languages'],
      ['А MDN пишет, что метод «returns a weekInfo object with the properties firstDay, weekend and minimalDays»', 'Locale/getWeekInfo', 'returns a weekInfo object with the properties firstDay, weekend and minimalDays'],
      ['MDN предупреждает про «-1, or some other negative value»', 'Collator', '-1, or some other negative value'],
    ];
    const lostMdn = fromMdn.filter(([inLecture, p, quote]) => !lt.includes(tight(inLecture)) || !tight(M[G + p] ?? '').includes(tight(quote))).map(([, p, quote]) => `${p} «${quote.slice(0, 30)}»`);
    check(lostMdn.length === 0, `quotes: ${fromMdn.length} quotes the lecture gives to MDN stand in their places and on their pages (Locale, Locale() twice, Collator() twice, getWeekInfo, Collator): ${lostMdn.join(' | ') || 'all'}`);
  }

  // the notes: their English quotes are in the corpus (with the outputs of the homework), the ones of ECMA-402 and MDN in
  // their places and their own clause or page; the steps of their tables are those of the lecture (in the list of steps
  // below); the footer
  {
    const ns = tight(notesText);
    const corpus = tight([...daySpec.map((c) => f(c[0])), f('sec-collator-comparestrings'), ...Object.values(M), ...outputs, ...homework].join(' '));
    const nquotes = [...notesText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => tight(m[1])).filter((x) => !/[а-яё]/i.test(x) && x.length > 3);
    const nmissing = nquotes.filter((x) => !corpus.includes(x));
    const nFromSpec = [
      ['Текст требует для поясов «canonical Zone name»', 'sec-timezonesoflocale', 'canonical Zone name of the IANA Time Zone Database'],
      ['Направление письма — лишь запасной вариант: «Web developers should not rely too much on this API to decide the direction of the text»', 'sec-textdirectionoflocale', 'Web developers should not rely too much on this API to decide the direction of the text'],
      ['Примечание 10.3.3: «The returned function is bound to collator so that it can be passed directly to Array.prototype.sort or other functions»', 'sec-intl.collator.prototype.compare', 'The returned function is bound to collator so that it can be passed directly to Array.prototype.sort or other functions'],
      ['Коллатор поиска не для сортировки: «this collation is not guaranteed to be in any particular order»', 'sec-intl.collator', 'Note The collation associated with the "search" value for the "usage" option should only be used to find matching strings, since this collation is not guaranteed to be in any particular order'],
    ];
    const nFromMdn = [
      ['MDN: «Intl.Locale() can only be constructed with new»', 'Locale/Locale', 'Intl.Locale() can only be constructed with new'],
      ['и «Option values here take priority over extension keys in the locale identifier»', 'Locale/Locale', 'Option values here take priority over extension keys in the locale identifier'],
      ['Страница MDN говорит, что метод «returns a weekInfo object with the properties firstDay, weekend and minimalDays»', 'Locale/getWeekInfo', 'returns a weekInfo object with the properties firstDay, weekend and minimalDays'],
    ];
    const nlost = [...nFromSpec.filter(([inNotes, id, quote]) => !ns.includes(tight(inNotes)) || !tight(f(id)).includes(tight(quote))).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`),
      ...nFromMdn.filter(([inNotes, p, quote]) => !ns.includes(tight(inNotes)) || !tight(M[G + p] ?? '').includes(tight(quote))).map(([, p, quote]) => `${p} «${quote.slice(0, 30)}»`)];
    check(nquotes.length === 8 && nmissing.length === 0 && nlost.length === 0,
      `student: ${nquotes.length} English quotes of the notes in ECMA-402, MDN or the output of Chrome (not found: ${nmissing.join(' | ') || 'none'}); the 4 of ECMA-402 (15.5.13, 15.5.14, 10.3.3, 10.1.1) and the 3 of MDN (Locale() twice, getWeekInfo) in their places (lost: ${nlost.join(' | ') || 'none'})`);
    const table = ['15.1.1: 1, 7, 9.a, 11', '15.1.1: 13, 14, 35', '(15.1.2)', '(15.1.3)', '15.3.9, 15.3.10', '15.1.1: 23.a; 15.5.15', '15.3.22; 15.5.17, таблица 27', '15.5.13: 2', '15.5.9: 1; 15.5.8', '15.5.14',
      '10.1.1: 1, 7, 11, 19', '10.3.3: 3; 10.3.3.1: 5', '10.3.3.2, таблица 4', '10.2.3', '(9.2.1, шаг 3)', 'Примечание 10.3.3'];
    check(table.every((s) => notesText.includes(s)), `student: the tables and notes name the steps of the lecture (${table.length}): missing ${table.filter((s) => !notesText.includes(s)).join(' | ') || 'none'}`);
    const notesHtml = builtSite.htmlOfFile(path.join(DAY, 'student.html'));
    const nFooter = notesHtml.slice(notesHtml.indexOf('<div class="sources">'));
    check(['Intl.Locale, Intl.Collator и их свойства и методы', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => nFooter.includes(s))
      && (notesHtml.match(/developer\.mozilla\.org/g) || []).length === 1 && !/tc39\.es\/ecma402\/2026\/#/.test(notesHtml),
    'student: the footer names the MDN pages and ECMA-402 2026; MDN is linked once; section numbers without links');
  }

  // the MDN texts the lecture retells
  {
    const week = md[`${G}Locale/getWeekInfo`];
    check((week.match(/minimalDays: \d \}/g) || []).length === 5 && week.includes('// { firstDay: 7, weekend: [5, 6], minimalDays: 1 }') && week.includes('// { firstDay: 6, weekend: [4, 5], minimalDays: 1 }')
      && week.includes('// { firstDay: 5, weekend: [6, 7], minimalDays: 1 }') && lectureText.includes('и печатает minimalDays в каждом примере'),
    'MDN getWeekInfo: all 5 examples print minimalDays (he 7/5,6, ar-AF 6/4,5, dv-MV 5/6,7, …) — the lecture says so');
    check(M[`${G}Locale/Locale`].includes('unlike most other Intl constructors, does not accept an array')
      && hasAll(M[`${G}Locale/maximize`], ['Other subtags after the "-u" in the locale identifier are called extension subtags and are not affected by the maximize() method', '// Note that the extension tags (after "-u") remain unchanged.'.replace('// ', '')])
      && md[`${G}Collator/compare`].includes('console.log(a.join(", ")); // "Odenwald, Österreich, Offenbach"') && md[`${G}Collator/compare`].includes('new Intl.Collator("de-u-co-phonebk")')
      && hasAll(md[`${G}Collator`], ['// Expected output: Array ["a", "ä", "z", "Z"]', '// Expected output: Array ["a", "z", "Z", "ä"]', '// Expected output: Array ["a", "ä", "Z", "z"]', 'new Intl.Collator("de", { caseFirst: "upper" })'])
      && M[`${G}Collator/Collator`].includes("it's locale dependent for usage \"search\" per spec, but is usually also \"variant\""),
    'MDN: Locale() takes no array (unlike most), maximize keeps the extension, the phonebk example of compare, the de/sv/caseFirst example of Collator, search sensitivity usually variant');
  }

  // the steps the lecture names
  const steps = [
    ['sec-Intl.Locale', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-Intl.Locale', 'If tag is not a String and tag is not an Object, throw a TypeError exception', '7'],
    ['sec-Intl.Locale', 'If tag is an Object and tag has an [[InitializedLocale]] internal slot, then', '8'],
    ['sec-Intl.Locale', 'Let tag be ? ToString (tag)', '9.a'],
    ['sec-Intl.Locale', 'If IsWellFormedLanguageTag (tag) is false, throw a RangeError exception', '11'],
    ['sec-Intl.Locale', 'NOTE: Because LanguageId canonicalization', '12'],
    ['sec-Intl.Locale', 'Set tag to CanonicalizeUnicodeLocaleId (tag)', '13'],
    ['sec-Intl.Locale', 'Set tag to ? UpdateLanguageId (tag, options)', '14'],
    ['sec-Intl.Locale', 'Set fw to WeekdayToUValue (fw)', '23.a'],
    ['sec-Intl.Locale', 'Let kn be ? GetOption (options, "numeric", boolean', '29'],
    ['sec-Intl.Locale', 'Let r be MakeLocaleRecord (tag, opt, localeExtensionKeys)', '35'],
    ['sec-intl.collator', 'If NewTarget is undefined, let newTarget be the active function object', '1'],
    ['sec-intl.collator', 'Let usage be ? GetOption (options, "usage"', '7'],
    ['sec-intl.collator', 'Let optionsResolution be ? ResolveOptions', '11'],
    ['sec-intl.collator', 'If usage is "sort", let defaultSensitivity be "variant"', '19'],
    ['sec-intl.collator', 'Let defaultIgnorePunctuation be resolvedLocaleData.[[ignorePunctuation]]', '21'],
    ['sec-intl.collator.prototype.compare', 'Perform ? RequireInternalSlot (collator, [[InitializedCollator]])', '2'],
    ['sec-intl.collator.prototype.compare', 'If collator.[[BoundCompare]] is undefined, then', '3'],
    ['sec-collator-compare-functions', 'Let X be ? ToString (x)', '5'],
    ['sec-canonicalizelocalelist', 'If locales is a String or locales is an Object and locales has an [[InitializedLocale]] internal slot, then', '3'],
    ['sec-canonicalizelocalelist', 'If kValue is an Object and kValue has an [[InitializedLocale]] internal slot, then', '7.c.iii'],
    ['sec-Intl.Locale.prototype.maximize', 'If an error is signaled, set maximal to loc.[[Locale]]', '3'],
    ['sec-timezonesoflocale', 'If region is undefined, return undefined', '2'],
    ['sec-weekinfooflocale', 'If fw is not undefined, then', '5'],
    ['sec-calendarsoflocale', 'If loc.[[Calendar]] is not undefined, then', '1'],
    ['sec-getoption', 'If values is not empty and values does not contain value, throw a RangeError exception', '5'],
    ['sec-updatelanguageid', 'If script cannot be matched by the unicode_script_subtag Unicode locale nonterminal, throw a RangeError exception', '5.a'],
    ['sec-updatelanguageid', 'If variantSubtags contains any duplicate elements, throw a RangeError exception', '9.e'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `ECMA-402: ${steps.length} step numbers the lecture names (15.1.1, 10.1.1, 10.3.3, 10.3.3.1, 9.2.1, 15.3.9, 15.5.13, 15.5.17, 15.5.9, 9.2.11; 15.1.2 of homework 2 of the notes):${wrong.join('; ') || 'all right'}`);
  const nums = { 'sec-Intl.Locale.prototype.firstDayOfWeek': '15.3.6', 'sec-collator-comparestrings': '10.3.3.2', 'sec-collator-compare-functions': '10.3.3.1',
    'sec-calendarsoflocale': '15.5.9', 'sec-getoption': '9.2.11', 'sup-String.prototype.localeCompare': '20.1.1' };
  const wrongNums = Object.entries(nums).filter(([id, k]) => num(id) !== k).map(([id, k]) => `${id}: ${num(id)}≠${k}`);
  const tables = [['sec-weekdaytouvalue', 'Table 26: Weekday String and Value'], ['sec-weekinfooflocale', 'Table 27: WeekInfo Record Fields'],
    ['sec-collator-comparestrings', 'Table 4: Effects of Collator Sensitivity'], ['sec-intl.collator.prototype.resolvedoptions', 'Table 3: Resolved Options of Collator Instances']];
  const wrongTables = tables.filter(([id, t]) => !f(id).includes(t)).map(([id]) => id);
  check(wrongNums.length === 0 && wrongTables.length === 0 && hasAll(f('sec-collator-comparestrings'), ['Note 1', 'Note 2', 'Note 3']),
    `ECMA-402: ${Object.keys(nums).length} section numbers named without links (15.3.6, 10.3.3.2, 10.3.3.1, 15.5.9, 9.2.11, 20.1.1), tables 26, 27, 4, 3 in their clauses, notes 1–3 of CompareStrings: ${[...wrongNums, ...wrongTables].join('; ') || 'all right'}`);

  // the texts the lecture retells
  {
    check(hasNows(f('sec-intl.locale-internal-slots'), ['must include all elements of « "ca", "co", "fw", "hc", "nu" », must additionally include any element of « "kf", "kn" » that is also an element of %Intl.Collator%.[[RelevantExtensionKeys]]'])
      && hasNows(f('sec-Intl.Locale'), ['Let hc be ? GetOption (options, "hourCycle", string, « "h11", "h12", "h23", "h24" », undefined)',
        'If SameValue (r.[[kn]], "true") is true or r.[[kn]] is the empty String, then Set locale.[[Numeric]] to true'])
      && hasNows(f('sec-getlocalebasename'), ['Return the longest prefix of locale matched by the unicode_language_id Unicode locale nonterminal'])
      && hasNows(f('sec-Intl.Locale.prototype.maximize'), ['Add Likely Subtags', 'Return ! Construct (%Intl.Locale%, maximal)']) && hasNows(f('sec-Intl.Locale.prototype.minimize'), ['Remove Likely Subtags', 'Return ! Construct (%Intl.Locale%, minimal)'])
      && hasNows(f('sec-Intl.Locale.prototype.baseName'), ['is an accessor property whose set accessor function is undefined'])
      && hasNows(f('sec-updatelanguageid'), ['Let region be ? GetOption (options, "region", string, empty, GetLocaleRegion (baseName))']),
    'ECMA-402 15: the keys of 15.2.2, four hour cycles, kn without a value is true, the base name (15.5.1), maximize and minimize — Add/Remove Likely Subtags and a new Locale, accessors on the prototype, the region from the options (15.1.2)');
    check(hasNows(f('sec-weekdaytouvalue'), ['"0" "sun" 7', '"7" "sun" 7', 'returns any other string unmodified']) && hasNows(f('sec-weekdayuvaluetonumber'), ['returns undefined for any other string'])
      && hasNows(f('sec-weekinfooflocale'), ['[[FirstDay]]', '[[Weekend]]']) && !f('sec-weekinfooflocale').includes('MinimalDays') && !f('sec-Intl.Locale.prototype.getWeekInfo').includes('minimalDays')
      && hasNows(f('sec-regionpreference'), ['If region is undefined, then Let maximal be the result of the Add Likely Subtags algorithm applied to locale'])
      && hasNows(f('sec-calendarsoflocale'), ['Let preference be RegionPreference (loc.[[Locale]])']) && hasNows(f('sec-hourcyclesoflocale'), ['Let preference be RegionPreference (loc.[[Locale]])'])
      && !f('sec-timezonesoflocale').includes('RegionPreference') && hasNows(f('sec-use-of-iana-time-zone-database'), ['in 2022 "Europe/Kiev" was deprecated to a Link resolving to a new "Europe/Kyiv" Zone']),
    'ECMA-402 15.5: table 26 — "0" and "7" are sun, other strings unmodified, back to a number — undefined; table 27 — two fields, no minimal days; RegionPreference adds likely subtags for calendars and hour cycles, not for time zones; 6.5 — Kiev became a Link to Kyiv');
    const cmp = f('sec-collator-comparestrings');
    check(hasNows(f('sec-intl-collator-internal-slots'), ['must include the element "co", may include any or all of the elements "kf" and "kn"', 'the keys "kb", "kh", "kk", "kr", and "vt" are not allowed in this version', 'The values "standard" and "search" must not be used as elements in any [[SortLocaleData]]'])
      && hasNows(f('sec-intl.collator'), ['[[SortLocaleData]]', '[[SearchLocaleData]]', 'Otherwise, let defaultSensitivity be resolvedLocaleData.[[sensitivity]]'])
      && hasNows(f('sec-collator-compare-functions'), ['A Collator compare function is an anonymous built-in function', 'The "length" property of a Collator compare function is 2'])
      && hasNows(cmp, ['returning +0', 'canonically equivalent', 'It is recommended that implementations use the tailorings provided by the Common Locale Data Repository', 'Applications should not assume that the behaviour of the CompareStrings abstract operation for Collator instances with the same resolved options will remain the same for different versions of the same implementation', 'In Slovak, "ch" is a single base letter'])
      && hasNows(f('sec-properties-of-the-intl-collator-prototype-object'), ['is not an Intl.Collator instance'])
      && hasNows(f('sup-String.prototype.localeCompare'), ['Let collator be ? Construct (%Intl.Collator%, «locales, options»)']),
    'ECMA-402 10, 20.1.1: co, kf, kn and the banned kb … vt; search and standard banned; sort or search data, search sensitivity from the locale; an anonymous compare of length 2; +0 for canonical equivalents, CLDR, versions, Slovak ch; the prototype is no Collator; localeCompare builds a Collator');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const pageText = (p) => flat(read(p)).replace(/ :/g, ':');
  {
    const d26 = pageText('advanced/day-26/lecture.html');
    const t26 = pageText('advanced/day-26/tasks.html');
    check(d26.includes('Завтра — день 27: Intl.Locale (тег как объект: maximize, minimize, неделя и пояса Туркменистана) и Intl.Collator.')
      && d26.includes('17. Вызов без new и [[FallbackSymbol]]') && d26.includes('15. Расширение пропадает вместе с языком')
      && /1\. Канонизация по шагам[^]*?tk-SU[^]*?2\. Что знает браузер[^]*?Europe\/Kyiv/.test(t26)
      && pageText('advanced/day-05/lecture.html').includes('для алфавита — localeCompare и Intl.Collator, день 27') && lectureText.includes('день 5 обещал «для алфавита — localeCompare и Intl.Collator, день 27»'),
    'lecture 1, 3, 10, 12: day 26 promised Locale and Collator, its sections 15 and 17, task 1 with tk-SU and task 2 with Europe/Kyiv; day 5 promised the alphabet for day 27');
    const i25t = pageText('intermediate/day-25/tasks.html');
    const i25 = pageText('intermediate/day-25/lecture.html');
    check(i25t.includes('Порядок букв: "abçdeäfghijžklmnňoöprsştuüwyýz"') && i25t.includes('результат: Annaýew Babaýew Çaryýew Esenow Ärsaryýew Öwezow Şirow Yslamow Ýazmuhammedow Ýusupow Zarow')
      && i25t.includes('ставит Ärsaryýew вторым и Ýazmuhammedow раньше Yslamow') && lectureText.includes('порядок букв: abçdeäfghijžklmnňoöprsştuüwyýz')
      && outputs.includes('Annaýew Babaýew Çaryýew Esenow Ärsaryýew Öwezow Şirow Yslamow Ýazmuhammedow Ýusupow Zarow')
      && i25.includes('11. localeCompare. Практика: сортировка фамилий') && pageText('intermediate/day-20/lecture.html').includes('localeCompare (день 25); ===, includes, ключи Map — нет'),
    'lecture 13, 14, 18: task 9 of day 25 of course 2 — the same alphabet and the same order of the surnames; its lecture 11 — localeCompare; day 20 — === tells canonical equivalents apart, localeCompare does not');
    const plan = read('docs/plan-3-advanced.md').replace(/`/g, '').replace(/\s+/g, ' ');
    check(plan.includes('| 27 | A7 | Intl.Locale и Intl.Collator |') && plan.includes('| 28 | A7 | PluralRules, ListFormat и RelativeTimeFormat |')
      && plan.includes('Intl.Locale("tk-TM").getWeekInfo() — неделя с понедельника, выходные 6 и 7; getTimeZones() — ["Asia/Ashgabat"]')
      && plan.includes('неделя и пояса Туркменистана через Intl.Locale (шапка плана)') && lectureText.includes('неделя и пояса Туркменистана из шапки'),
    'lecture 1, 9, 10, 19: the plan — day 27 and day 28 as the lecture names them; its head — the week from Monday, weekend 6 and 7, Asia/Ashgabat');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor exists
  {
    const lecture = read('advanced/day-27/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">/g)].map((m) => decodeURIComponent(m[1]));
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const missing = [...daySpec.map((c) => c[0]).filter((id) => !refSpec.includes(id)), ...dayMdn.map((c) => c[0]).filter((p) => !refMdn.includes(p))];
    check(daySpec.length === 65 && dayMdn.length === 28 && refSpec.length === 65 && refMdn.length === 28 && missing.length === 0,
      `plan: ${daySpec.length} rows of ECMA-402 and ${dayMdn.length} of MDN for day 27, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
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
    check(anchors.size >= 70 && gone.length === 0 && !/tc39\.es\/ecma262\//.test(lecture), `links: ${anchors.size} anchors of ECMA-402 2026, not in its text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma402\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length >= 95 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['Intl.Locale, Intl.Collator и их свойства и методы', 'спецификация <a href="https://tc39.es/ecma402/2026/">ECMA-402 2026</a>', 'Mozilla Contributors'].every((s) => footer.includes(s)) && mdnLinks === 31,
      `links: the footer names the MDN pages and ECMA-402 2026; MDN is linked 31 times — section 1 twice, 28 rows, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
