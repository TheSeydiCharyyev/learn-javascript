// Course 2, day 25, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The browser context is
// fixed to the Ashgabat time zone (UTC+5) and the ru-RU language, as on days 21–24: the language matters here, because
// an unknown locale such as "tk" falls back to it. Claims about an English browser run in an en-US context; claims about
// Node 22 (full ICU, it knows "tk") run in this very Node process. Intl output keeps its non-breaking spaces (code 160),
// so the expected strings below build them from NB, and a result-box writes them as &nbsp;.
//   node tools/runs/intermediate/day-25.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-25.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (the error table, "tk" in an English browser and in Node, the limit of
// maximumFractionDigits), the three experiments of «Карточки», the lines of the notes and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-25');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const EN = { timezoneId: 'Asia/Ashgabat', locale: 'en-US' };
const NB = String.fromCharCode(160);
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.subtype !== 'date' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'regexp' || a.subtype === 'date') return a.description;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    const items = a.preview.properties.map((p) => (/^\d+$/.test(p.name) ? inner(p) : `${p.name}: ${inner(p)}`));
    return `${name === 'Array' ? '' : name}(${n}) [${items.join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');
const TMT = (s) => `${s}${NB}ТМТ`;
const nb = (s) => s.replaceAll(' ', NB);

const EXPECT = {
  // lecture
  'const amount = 1250.5;': [`${TMT(nb('1 250,50'))} | 12 октября 2026 г. | 1 ч 30 мин | ı | 0`],
  'console.log(price.format(1250.5), price.format(30)': [`${TMT(nb('1 250,50'))} ${TMT('30,00')} object [object Intl] 1,250.5`, '! Intl is not a constructor'],
  'new Intl.DateTimeFormat(["xx", "en-US"])': ['ru-RU en-US ١٬٢٥٠٫٥ 20 мехр 1405 г. перс. год'],
  'const n = 1234567.891;': [`${nb('1 234 567,9')} | 1,234,568 | 7,5${NB}% | 1,2 миллиона | 1.2M`, '+5 005 1250,5 1 час, 2 часа, 5 часов, 81 час 60 км/ч'],
  'const space = String.fromCharCode(160);': ['false 160 true', `integer group integer decimal fraction literal currency ${nb('1 250,50')}${NB}[ТМТ]`, 'ru-RU 2 2 symbol halfExpand'],
  '9007199254740993n.toLocaleString("ru-RU")': [`${nb('9 007 199 254 740 993')} ${nb('9 007 199 254 740 992')} 1,250.5,3 ${TMT(nb('1 250,50'))},${TMT('3,00')}`],
  'console.log(d.toLocaleString("ru-RU"), "|", d.toLocaleString("en-US")': ['12.10.2026, 14:30:00 | 10/12/2026, 2:30:00 PM | понедельник, 12 октября 2026 г. в 14:30 | Monday, October 12, 2026 at 2:30 PM', 'пн, 12 окт. | октябрь 2026 г. | октябрь | 02:30 PM | 2:30 PM'],
  'const at = (zone) =>': ['14:30 GMT+5 | 11:30 GMT+2 | 05:30 GMT-4', 'weekday=понедельник literal=,  day=12 literal=  month=октября', 'ru-RU gregory Asia/Ashgabat numeric 2-digit 2-digit'],
  'const ym = Temporal.PlainYearMonth.from({ year: 2026, month: 10, calendar: "gregory" });': ['12 октября 2026 г. | октябрь 2026 г. | 12 октября | 14:30:00 Центральная Европа, летнее время | 81 час | 1:30:15', '! Invalid argument for Temporal [object Temporal.ZonedDateTime]'],
  'const names = ["Ёлкин", "абдуллаев", "Яковлев", "Ершов", "Абаев", "Чарыев"];': ['Ёлкин Абаев Ершов Чарыев Яковлев абдуллаев | Абаев абдуллаев Ёлкин Ершов Чарыев Яковлев', 'урок 1, урок 2, урок 10 | 0 1 -1 false', 'i ı İ -1 1'],
  'const october = new Date(2026, 9, 12);': ["октябрь ru-RU (3) ['tr', 'ru', 'uz']", '2026 M10 12, Mon | 12 Ekim 2026 Pazartesi | Annaýew Ärsaryýew Esenow Zarow'],
  'new Intl.NumberFormat("ru-RU").formatRange(3, 5)': [`3–5 | ${nb('1 250,00')}–${TMT(nb('1 500,00'))} | 12–16 октября 2026 г. | 12 октября – 31 декабря 2026 г.`],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const route = (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' });
  const contexts = new Map();
  const ctxFor = async (opts) => {
    const key = JSON.stringify(opts);
    if (!contexts.has(key)) {
      const c = await b.newContext(opts);
      await c.route('http://day.test/**', route);
      contexts.set(key, c);
    }
    return contexts.get(key);
  };
  const ctx = await ctxFor(MAIN);
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  const runOnPage = async (scripts, opts = MAIN) => {
    const c = await ctxFor(opts);
    const p = await c.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    const cdp = await c.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    for (const code of scripts) await p.addScriptTag({ content: code }).catch((e) => out.push(`! ${clean(e.message.split('\n')[0])}`));
    await p.waitForTimeout(80);
    await p.close();
    return out;
  };

  const all = {};
  for (const name of PAGES) {
    const src = await ctx.newPage();
    await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
    const blocks = await src.evaluate(() => [...document.querySelectorAll('pre.code.js')].map((pre) => {
      const next = pre.nextElementSibling;
      return {
        code: pre.textContent,
        box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
        cheat: !!pre.closest('.cheatsheet'),
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);
    for (const [i, blk] of blocks.entries()) {
      const out = await runOnPage([blk.code]);
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l.replaceAll(NB, '␣')}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out).replaceAll(NB, '␣')}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)${same(out, blk.box) ? '' : ` ${JSON.stringify(out).replaceAll(NB, '␣')} vs ${JSON.stringify(blk.box).replaceAll(NB, '␣')}`}`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const head = (code) => code.split('\nconsole.log(')[0];
  const extra = async (code, want, text, opts) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code], opts);
    check(same(out, want), `${text}: ${JSON.stringify(out).replaceAll(NB, '␣')}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 14: the error table, row by row
  for (const [expr, want] of [
    ['new Intl()', 'TypeError Intl is not a constructor'],
    ['new Intl.NumberFormat("ru-RU", { style: "currency" })', 'TypeError Currency code is required with currency style.'],
    ['new Intl.NumberFormat("ru-RU", { style: "currency", currency: "TM" })', 'RangeError Invalid currency code : TM'],
    ['new Intl.NumberFormat("ru-RU", { style: "money" })', 'RangeError Value money out of range for Intl.NumberFormat options property style'],
    ['new Intl.NumberFormat("ru-RU", { style: "unit", unit: "liters" })', "RangeError Invalid unit argument for Intl.NumberFormat() 'liters'"],
    ['new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 200 })', 'RangeError maximumFractionDigits value is out of range.'],
    ['new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 101 })', 'RangeError maximumFractionDigits value is out of range.'],
    ['new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 100 })', 'no error'],
    ['new Intl.NumberFormat("i")', 'RangeError Invalid language tag: i'],
    ['"a".localeCompare("b", "i")', 'RangeError Invalid language tag: i'],
    ['new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", month: "long" })', 'TypeError Invalid option : option'],
    ['new Intl.DateTimeFormat("ru-RU", { timeZone: "Mars/Olympus" })', 'RangeError Invalid time zone specified: Mars/Olympus'],
    ['new Intl.DateTimeFormat("ru-RU").format(new Date("x"))', 'RangeError Invalid time value'],
    ['Temporal.PlainYearMonth.from("2026-10").toLocaleString("ru-RU")', 'RangeError Mismatched calendars.'],
    ['new Intl.DateTimeFormat("xx")', 'no error'],
  ]) await extra(errOf(expr), [want], `lecture 14: ${expr.slice(0, 70)}`);
  // lecture 12: "tk" in an English browser (the plan) and in Node 22 (this process)
  await extra('const tk = new Intl.DateTimeFormat("tk", { month: "long" });\nconsole.log(tk.format(new Date(2026, 9, 12)), tk.resolvedOptions().locale, Intl.DateTimeFormat.supportedLocalesOf(["tk"]).length);',
    ['October en-US 0'], 'lecture 12: "tk" in an English Chrome falls back to English', EN);
  {
    const d = new Date(2026, 9, 12);
    const node = [new Intl.DateTimeFormat('tk', { month: 'long' }).format(d), new Intl.DateTimeFormat('tk').resolvedOptions().locale, new Intl.DateTimeFormat('tk', { dateStyle: 'full' }).format(d),
      (1250.5).toLocaleString('tk', { style: 'currency', currency: 'TMT' }).replaceAll(NB, ' '), ['Annaýew', 'Ärsaryýew', 'Esenow', 'Zarow'].sort((x, y) => x.localeCompare(y, 'tk')).join(' ')];
    check(same(node, ['Oktýabr', 'tk', '12 oktýabr 2026 duşenbe', '1 250,50 TMT', 'Annaýew Esenow Ärsaryýew Zarow']), `lecture 12: Node ${process.version} knows "tk": ${JSON.stringify(node)}`);
  }
  // lecture 16: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'function view(locale) {');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 16: the program without its output lines');
    await extra(`${top}\nconsole.log(view("tk") === view("ru-RU"), new Intl.DateTimeFormat("tk").resolvedOptions().locale);`, ['true ru-RU'], 'lecture 16, experiment 1: "tk" falls back to ru-RU');
    const lessThan = top.replace('cards.toSorted((a, b) => a.word.localeCompare(b.word, locale))', 'cards.toSorted((a, b) => (a.word < b.word ? -1 : 1))');
    check(lessThan !== top, 'lecture 16, experiment 2: words compared with <');
    await extra(`${lessThan}\nconsole.log(view("en-US").split(" | ").map((s) => s.split(":")[0]).join(" "));`, ['Book apple water'], 'lecture 16, experiment 2: with < Book goes first');
    const noFunction = top.replace('cards.toSorted((a, b) => a.word.localeCompare(b.word, locale))', 'cards.toSorted()');
    await extra(`${noFunction}\nconsole.log(view("en-US").split(" | ").map((s) => s.split(":")[0]).join(" "), String(cards[0]));`, ['water Book apple [object Object]'], 'lecture 16, experiment 2: toSorted() on objects keeps the order');
    await extra(`${top}\nconst typed = "apple: вт, 20 октября, 100 % | Book: вт, 13 октября, 40 % | water: чт, 15 октября, 75 %";\nconsole.log(view("ru-RU") === typed, view("ru-RU").replaceAll(String.fromCharCode(160), " ") === typed);`, ['false true'], 'lecture 16, experiment 3: a typed string is not equal');
  }
  // notes: the main block
  await extra('console.log(new Intl.NumberFormat("ru-RU", { style: "currency", currency: "TMT" }).format(1250.5), new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(2026, 9, 12)), (0.075).toLocaleString("ru-RU", { style: "percent", minimumFractionDigits: 1 }), (5).toLocaleString("ru-RU", { style: "unit", unit: "hour", unitDisplay: "long" }), ["Ёлкин", "Абаев"].sort((a, b) => a.localeCompare(b, "ru")).join(), new Intl.DateTimeFormat("tk").resolvedOptions().locale);',
    [`${TMT(nb('1 250,50'))} October 12, 2026 7,5${NB}% 5 часов Абаев,Ёлкин ru-RU`], 'notes: the main block');

  // task 1
  await extra(`const err = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log([
  () => (1250.5).toLocaleString("de-DE"),
  () => (1250.5).toLocaleString("en-US", { style: "currency", currency: "TMT" }),
  () => (0.5).toLocaleString("ru-RU", { style: "percent" }),
  () => (22).toLocaleString("ru-RU", { style: "unit", unit: "hour", unitDisplay: "long" }),
  () => new Date(2026, 9, 12).toLocaleDateString("en-GB"),
  () => new Date(2026, 9, 12).toLocaleString("ru-RU", { month: "long" }),
  () => new Intl.NumberFormat("ru-RU", { style: "currency" }),
  () => \`\${"a".localeCompare("B") < 0} \${"a" < "B"}\`,
].map(err).join(" | "));`, [`1.250,5 | TMT${NB}1,250.50 | 50${NB}% | 22 часа | 12/10/2026 | октябрь | TypeError | true false`], 'task 1: the eight answers');
  // task 2
  await extra(`const ru = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "TMT" });
const en = new Intl.NumberFormat("en-US", { style: "currency", currency: "TMT" });
const rows = [["Хлеб", 12.5], ["Вода", 3], ["Книга", 125]];
const total = rows.reduce((sum, [, p]) => sum + p, 0);
console.log(rows.map(([name, p]) => \`\${name}: \${ru.format(p)}\`).join(" | "), ru.format(total), en.format(total), ru.formatRange(3, 125), (1250.5).toLocaleString("ru-RU", { style: "currency", currency: "TMT", currencyDisplay: "code" }));`,
  [`Хлеб: ${TMT('12,50')} | Вода: ${TMT('3,00')} | Книга: ${TMT('125,00')} ${TMT('140,50')} TMT${NB}140.50 3,00–${TMT('125,00')} ${nb('1 250,50')}${NB}TMT`], 'task 2: the numbers of the criteria');
  // task 3
  await extra(`const days = ["2026-10-12T09:00", "2026-10-14T09:00", "2026-10-16T14:30"].map((s) => Temporal.PlainDateTime.from(s));
const options = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
for (const locale of ["ru-RU", "en-US"]) console.log(days.map((d) => new Intl.DateTimeFormat(locale, options).format(d)).join(" | "));
console.log(new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeStyle: "short" }).format(days[0]), "|", new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(days[0]));`,
  ['понедельник, 12 октября в 09:00 | среда, 14 октября в 09:00 | пятница, 16 октября в 14:30', 'Monday, October 12 at 9:00 AM | Wednesday, October 14 at 9:00 AM | Friday, October 16 at 2:30 PM', 'понедельник, 12 октября 2026 г. в 09:00 | Monday, October 12, 2026 at 9:00 AM'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`const names = ["Ёлкин", "абдуллаев", "Яковлев", "Ершов", "Абаев", "Ёжиков", "Чарыев"];
const copy = names.join();
const find = (query, sensitivity) => names.filter((n) => n.localeCompare(query, "ru", { sensitivity }) === 0).join();
console.log(names.toSorted().join(" "), "|", names.toSorted((a, b) => a.localeCompare(b, "ru")).join(" "), "|", find("елкин", "base"), "|", find("елкин", "accent") || "—", names.join() === copy);`,
  ['Ёжиков Ёлкин Абаев Ершов Чарыев Яковлев абдуллаев | Абаев абдуллаев Ёжиков Ёлкин Ершов Чарыев Яковлев | Ёлкин | — true'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`function parseLocaleNumber(text, locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((p) => p.type === "group").value;
  const decimal = parts.find((p) => p.type === "decimal").value;
  return Number(text.replaceAll(group, "").replaceAll(" ", "").replace(decimal, "."));
}
console.log(parseLocaleNumber("1 250,5", "ru-RU"), parseLocaleNumber(new Intl.NumberFormat("ru-RU").format(1250.5), "ru-RU"), parseLocaleNumber("1,250.5", "en-US"), parseLocaleNumber("1.250,5", "de-DE"), parseLocaleNumber("abc", "ru-RU"), parseLocaleNumber("12,5", "en-US"));`,
  ['1250.5 1250.5 1250.5 1250.5 NaN 125'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`const lesson = Temporal.ZonedDateTime.from("2026-10-12T19:00[Asia/Ashgabat]");
const students = [{ name: "Мерет", zone: "Europe/Berlin", locale: "ru-RU" }, { name: "Sapar", zone: "America/New_York", locale: "en-US" }, { name: "Аман", zone: "Asia/Ashgabat", locale: "ru-RU" }];
const options = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
console.log(students.map((s) => \`\${s.name}: \${lesson.withTimeZone(s.zone).toLocaleString(s.locale, options)}\`).join(" | "));`,
  ['Мерет: понедельник, 12 октября в 16:00 | Sapar: Monday, October 12 at 10:00 AM | Аман: понедельник, 12 октября в 19:00'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`const unit = (u) => (n) => n.toLocaleString("ru-RU", { style: "unit", unit: u, unitDisplay: "long" });
const d = Temporal.Duration.from({ hours: 1, minutes: 30, seconds: 15 });
console.log([1, 2, 5, 11, 21, 22, 81, 93].map(unit("hour")).join(", "), "|", [1, 3, 45].map(unit("minute")).join(", "), "|", (36 / 108).toLocaleString("ru-RU", { style: "percent", maximumFractionDigits: 1 }), "|", d.toLocaleString("ru-RU", { style: "long" }), "|", d.toLocaleString("en-US", { style: "long" }));`,
  [`1 час, 2 часа, 5 часов, 11 часов, 21 час, 22 часа, 81 час, 93 часа | 1 минута, 3 минуты, 45 минут | 33,3${NB}% | 1 час 30 минут 15 секунд | 1 hour, 30 minutes, 15 seconds`], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`const months = ["ýanwar", "fewral", "mart", "aprel", "maý", "iýun", "iýul", "awgust", "sentýabr", "oktýabr", "noýabr", "dekabr"];
const days = ["duşenbe", "sişenbe", "çarşenbe", "penşenbe", "anna", "şenbe", "ýekşenbe"];
const tkDate = (d) => \`\${d.day} \${months[d.month - 1]} \${d.year}, \${days[d.dayOfWeek - 1]}\`;
console.log(["2026-10-12", "2026-01-01", "2027-02-28"].map((s) => tkDate(Temporal.PlainDate.from(s))).join(" | "), "|", new Intl.DateTimeFormat("tk", { dateStyle: "full" }).format(new Date(2026, 9, 12)));`,
  ['12 oktýabr 2026, duşenbe | 1 ýanwar 2026, penşenbe | 28 fewral 2027, ýekşenbe | понедельник, 12 октября 2026 г.'], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`const ALPHABET = "abçdeäfghijžklmnňoöprsştuüwyýz";
const key = (word) => [...word.toLowerCase()].map((ch) => String.fromCharCode(97 + ALPHABET.indexOf(ch))).join("");
const byTurkmen = (a, b) => {
  const x = key(a);
  const y = key(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
const names = ["Çaryýew", "Annaýew", "Şirow", "Öwezow", "Ýazmuhammedow", "Ärsaryýew", "Babaýew", "Zarow", "Esenow", "Ýusupow", "Yslamow"];
console.log(names.toSorted(byTurkmen).join(" "), "|", names.toSorted((a, b) => a.localeCompare(b, "tk")).join(" "), "|", byTurkmen("ÇARYÝEW", "çaryýew"));`,
  ['Annaýew Babaýew Çaryýew Esenow Ärsaryýew Öwezow Şirow Yslamow Ýazmuhammedow Ýusupow Zarow | Annaýew Ärsaryýew Babaýew Çaryýew Esenow Öwezow Şirow Ýazmuhammedow Yslamow Ýusupow Zarow | 0'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
