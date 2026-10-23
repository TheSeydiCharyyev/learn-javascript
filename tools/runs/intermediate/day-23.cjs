// Course 2, day 23, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The browser context is
// fixed to the Ashgabat time zone (UTC+5) and the ru-RU language, as on days 21–22. Console output is rebuilt from
// Chrome's preview objects, as DevTools prints it: a Temporal object as its class name and its first five fields
// (Duration {years: 0, …}, PlainMonthDay {calendarId: 'iso8601', monthCode: 'M10', day: 12}); an uncaught error is
// "! message" (V8 text — note the empty text after "Temporal error: " for calendar units without relativeTo).
//   node tools/runs/intermediate/day-23.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-23.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (the error table, ISO 8601 extensions, weeks as a calendar unit, PlainYearMonth in
// days through dates, PlainMonthDay without compare and add), the three experiments of «Карточки», the lines of the
// notes and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-23');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
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

const VALUEOF = (cls) => `TypeError Do not use Temporal.${cls}.prototype.valueOf; use Temporal.${cls}.prototype.compare for comparison.`;
const EXPECT = {
  // lecture
  'const lessons = Temporal.Duration.from({ minutes: 45 * 108 });': ['P81D 81 PT4860M 81'],
  'const b = Temporal.Duration.from("P1Y2M3W4DT5H6M7.008S");': ['PT1H30M P1Y2M3W4DT5H6M7.008S PT1H30M PT1H30M false 0', '1 2 3 4 5 6 7 8 undefined', 'Duration {years: 0, months: 0, weeks: 0, days: 0, hours: 1, …}'],
  'const iso = (text) =>': ["(9) ['P40D', 'PT2H30M', 'P1M', 'PT1M', 'PT0.0021S', 'PT0S', '-PT1H30M', 'P1DT12H', 'PT1H30M']"],
  'const late = Temporal.Duration.from({ hours: -1, minutes: -30 });': ['-PT1H30M -1 -1 PT1H30M PT1H30M PT0S 0 true', 'PT100H', '! Temporal error: Duration was not valid.'],
  'const d = Temporal.Duration.from({ hours: 100, minutes: 100, seconds: 100 });': ['PT100H100M100S P4DT5H41M40S PT101H41M40S PT102H', 'PT73H41M5S PT1H15M PT150M'],
  'console.log(d.total("minutes"), d.total("hours")': ['90 1.5 5400', '81 3.375 P3DT9H 108'],
  'const month = Temporal.Duration.from({ months: 1 });': ['31 28 29', 'P2M20D P11W4D', '! Temporal error: '],
  'const list = ["PT2H", "PT1H30M"': ['PT10M PT45M PT2H15M PT70M P2DT6H', 'PT1H PT1H30M PT90M PT1H45M PT2H -1 true', '! Temporal error: Largest unit cannot be a calendar unit when adding two durations.'],
  'const record = Temporal.Duration.from({ seconds: 9, milliseconds: 580 });': ['PT9.58S PT9.5S PT9.580S PT9.58S {"time":"PT9.58S"}', 'PT1S 0 1 ч 30 мин 15 с'],
  'const ym = Temporal.PlainYearMonth.from("2026-10");': ['2026-10 2026-10 true 2026 10 M10 31 false undefined', '2026-10-01 4 2026-10-31 {"ym":"2026-10"}'],
  'const school = Temporal.PlainYearMonth.from("2026-09");': ['2027-01 2026-05 P8M 8 -1', '9 30 31 30 31 31 28 31 30 31', '! Temporal error: Can only add years or months to PlainYearMonth.'],
  'const md = Temporal.PlainMonthDay.from("10-12");': ['10-12 10-12 10-12 true M10 12 undefined undefined 1972-10-12[u-ca=iso8601]', "PlainMonthDay {calendarId: 'iso8601', monthCode: 'M10', day: 12}", '02-29 2027-02-28 2028-02-29 02-28 undefined'],
  'Temporal.Duration.compare({ months: 1 }, { months: 1 })': ['2026-10-01[u-ca=iso8601] 0 4294967295', '! Temporal error: Expected finite integer.'],
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
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
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
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 15: the error table, row by row, and the errors named in the prose
  const ym = 'Temporal.PlainYearMonth.from("2026-10")';
  const md = 'Temporal.PlainMonthDay.from("10-12")';
  const month = 'Temporal.Duration.from({ months: 1 })';
  for (const [expr, want] of [
    ['Temporal.Duration(1)', 'TypeError Method invoked on an object that is not Temporal.Duration.'],
    ['Temporal.Duration.from({ hours: 1.5 })', 'RangeError Temporal error: Expected finite integer.'],
    ['Temporal.Duration.from({ hours: 1, minutes: -30 })', 'RangeError Temporal error: Duration was not valid.'],
    ['Temporal.Duration.from({ hour: 1 })', 'TypeError Temporal error: Did not provide any valid Duration fields.'],
    ['Temporal.Duration.from("1h30m")', 'RangeError Temporal error: Invalid duration designator.'],
    [`${month}.total("days")`, 'RangeError Temporal error: '],
    ['Temporal.Duration.from({ weeks: 1 }).total("days")', 'RangeError Temporal error: '],
    ['Temporal.Duration.from("P81D").round({ largestUnit: "months" })', 'RangeError Temporal error: largestUnit when rounding Duration was not the largest provided unit'],
    [`${month}.add({ days: 1 })`, 'RangeError Temporal error: Largest unit cannot be a calendar unit when adding two durations.'],
    ['Temporal.Duration.from("PT1H") > Temporal.Duration.from("PT1M")', VALUEOF('Duration')],
    ['Temporal.Duration.from("PT1H") + Temporal.Duration.from("PT1M")', VALUEOF('Duration')],
    [`${ym}.add({ days: 20 })`, 'RangeError Temporal error: Can only add years or months to PlainYearMonth.'],
    [`${ym}.until("2027-05", { largestUnit: "days" })`, 'RangeError Temporal error: Weeks and days are not allowed in this operation.'],
    [`${md}.toPlainDate(2027)`, 'TypeError Temporal error: year argument must be an object.'],
    [`${ym}.toLocaleString("ru-RU")`, 'RangeError Mismatched calendars.'],
    [`${md}.toLocaleString("ru-RU")`, 'RangeError Mismatched calendars.'],
    ['Temporal.Duration.compare("P1M", "P30D")', 'RangeError Temporal error: '],
  ]) await extra(errOf(expr), [want], `lecture 15 and prose: ${expr.slice(0, 60)}`);
  // lecture 3, 4, 7, 10, 12: smaller claims of the prose
  await extra('console.log(Temporal.Duration.from("PT1.5H").toString(), Temporal.Duration.from("P3W1D").toString(), Temporal.Duration.from("-P1M").toString(), Temporal.Duration.from("PT1M").minutes, Temporal.Duration.from("P1M").months);',
    ['PT1H30M P3W1D -P1M 1 1'], 'lectures 3–4: fractions, the ISO 8601-2 extensions, M before and after T');
  await extra('const start = Temporal.PlainDate.from("2026-01-01");\nconsole.log(start.add({ years: 1 }).add({ months: 1 }).since(start).toString(), Temporal.Duration.from({ weeks: 1 }).total({ unit: "days", relativeTo: start }));',
    ['P396D 7'], 'lectures 7–8: calendar durations through a date, weeks with relativeTo');
  await extra(`const school = Temporal.PlainYearMonth.from("2026-09");\nconsole.log(school.toPlainDate({ day: 1 }).until(Temporal.PlainYearMonth.from("2027-05").toPlainDate({ day: 1 })).days, ${ym}.with({ month: 2 }).toString(), ${ym}.daysInYear, ${ym}.monthsInYear, ${ym}.era, ${ym}.calendarId);`,
    ['242 2026-02 365 12 undefined iso8601'], 'lecture 10: days through dates, with and the other fields');
  await extra(`console.log(Temporal.PlainMonthDay.from("--10-12").toString(), typeof ${md}.add, typeof ${md}.since, ${md}.with({ day: 31 }).toString(), ${md}.toLocaleString("ru-RU", { calendar: "iso8601" }));`,
    ['10-12 undefined undefined 10-31 10-12'], 'lecture 12: "--MM-DD", no add or since, with');
  // lecture 17: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const sessions = ["PT12M30S"');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 17: the program without its output lines');
    const plus = top.replace('sessions.reduce((a, b) => a.add(b))', 'sessions.reduce((a, b) => a + b)');
    check(plus !== top, 'lecture 17, experiment 1: reduce with +');
    await extra(plus, [VALUEOF('Duration').replace('TypeError ', '! ')], 'lecture 17, experiment 1: the error');
    await extra(`${top}\nconsole.log(cards[1].interval.total({ unit: "days", relativeTo: cards[1].last }));\ncards[1].interval.total("days");`, ['7', '! Temporal error: '], 'lecture 17, experiment 2: weeks need relativeTo');
    const monthly = top.replace('interval: Temporal.Duration.from({ weeks: 2 }) }', 'interval: Temporal.Duration.from({ months: 1 }) }');
    check(monthly !== top, 'lecture 17, experiment 3: bread every month');
    await extra(`${monthly}\nconsole.log(due, cards[2].last.add(cards[2].interval).toString());`, ["(1) ['book'] 2026-10-28"], 'lecture 17, experiment 3: a date takes a month, bread is not due');
  }
  // notes: the main block
  await extra('console.log(Temporal.Duration.from({ minutes: 45 * 108 }).total("hours"), Temporal.Duration.from("PT100H100M").round({ largestUnit: "days" }).toString(), Temporal.Duration.from({ months: 1 }).total({ unit: "days", relativeTo: "2026-02-01" }), Temporal.Duration.compare("PT90M", "PT1H30M"), Temporal.PlainYearMonth.from("2026-10").daysInMonth, Temporal.PlainMonthDay.from("02-29").toPlainDate({ year: 2027 }).toString());',
    ['81 P4DT5H40M 28 0 31 2027-02-28'], 'notes: the main block');
  await extra('console.log(["P81D", "P1M", "PT1M", "P1DT12H", "PT9.58S", "-PT1H30M", "PT0S"].map((s) => { const d = Temporal.Duration.from(s); return [d.days, d.months, d.minutes, d.hours, d.seconds, d.milliseconds, d.sign].join(","); }).join(" "));',
    ['81,0,0,0,0,0,1 0,1,0,0,0,0,1 0,0,1,0,0,0,1 1,0,0,12,0,0,1 0,0,0,0,9,580,1 0,0,-30,-1,0,0,-1 0,0,0,0,0,0,0'], 'notes: the string table');

  // task 1
  await extra(`const err = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log([
  () => Temporal.Duration.from({ minutes: 90 }).toString(),
  () => Temporal.Duration.from({ minutes: 90 }).round({ largestUnit: "hours" }).toString(),
  () => Temporal.Duration.from("PT1H30M").total("hours"),
  () => Temporal.Duration.from("P1M").minutes,
  () => Temporal.Duration.from({ hours: 1, minutes: -30 }),
  () => Temporal.Duration.from({ months: 1 }).total("days"),
  () => Temporal.Duration.compare("PT90M", "PT1H30M"),
  () => "PT3S" > "PT1M",
  () => Temporal.Duration.compare("PT3S", "PT1M"),
].map(err).join(" "));`, ['PT90M PT1H30M 1.5 0 RangeError RangeError 0 true -1'], 'task 1: the eight answers and the fix of line 8');
  // task 2
  await extra(`const fields = (s) => {
  const d = Temporal.Duration.from(s);
  return ["years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds"].filter((k) => d[k] !== 0).map((k) => \`\${k}=\${d[k]}\`).join(",");
};
console.log(["P1Y2M10DT2H30M", "PT0.5S", "-P3D", "P2W", "PT36H"].map(fields).join(" | "), Temporal.Duration.from("-P3D").sign, Temporal.Duration.from("PT36H").round({ largestUnit: "days" }).toString(), Temporal.Duration.from({ days: 1, hours: 12 }).toString(), Temporal.Duration.from({ minutes: 0 }).toString());`,
  ['years=1,months=2,days=10,hours=2,minutes=30 | milliseconds=500 | days=-3 | weeks=2 | hours=36 -1 P1DT12H P1DT12H PT0S'], 'task 2: the numbers of the criteria');
  // task 3
  await extra(`const lesson = Temporal.Duration.from({ minutes: 45 });
const course = Temporal.Duration.from({ minutes: 45 * 108 });
const withBreaks = course.add({ minutes: 10 * 2 * 36 });
console.log(course.total("hours"), withBreaks.total("hours"), withBreaks.round({ largestUnit: "days" }).toString(), Temporal.Duration.from({ hours: 81 }).total("minutes") / lesson.total("minutes"));`,
  ['81 93 P3DT21H 108'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`const times = ["07:30", "12:05", "09:55", "20:00", "06:40"];
const parse = (t) => {
  const [minutes, seconds] = t.split(":").map(Number);
  return Temporal.Duration.from({ minutes, seconds });
};
const list = times.map(parse);
const sum = list.reduce((a, b) => a.add(b));
const average = Temporal.Duration.from({ seconds: Math.round(sum.total("seconds") / list.length) }).round({ largestUnit: "minutes" });
const longest = list.reduce((a, b) => (Temporal.Duration.compare(a, b) >= 0 ? a : b));
console.log(sum.toString(), average.toString(), longest.toString(), list.toSorted(Temporal.Duration.compare)[0].toString(), list[0].toString());`,
  ['PT56M10S PT11M14S PT20M PT6M40S PT7M30S'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`${find('lecture', 'function nextBirthday(birthday, today) {').split('\nconst today')[0]}
const rows = (today) => [["Аман", "10-20"], ["Мерет", "12-31"], ["Сапар", "02-29"], ["Гүлнар", "10-05"]]
  .map(([name, text]) => {
    const next = nextBirthday(Temporal.PlainMonthDay.from(text), today);
    return { name, next, days: today.until(next).days };
  })
  .sort((a, b) => a.days - b.days);
console.log(rows(Temporal.PlainDate.from("2026-10-12")).map((r) => \`\${r.name} \${r.next} \${r.days}\`).join(" | "), nextBirthday(Temporal.PlainMonthDay.from("02-29"), Temporal.PlainDate.from("2027-03-01")).toString());`,
  ['Аман 2026-10-20 8 | Мерет 2026-12-31 80 | Сапар 2027-02-28 139 | Гүлнар 2027-10-05 358 2028-02-29'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`function monthGrid(ym, firstDay = 1) {
  const first = ym.toPlainDate({ day: 1 });
  const cells = Array((first.dayOfWeek - firstDay + 7) % 7).fill("··");
  for (let day = 1; day <= ym.daysInMonth; day++) cells.push(String(day).padStart(2, "0"));
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(" "));
  return rows;
}
const P = (s) => Temporal.PlainYearMonth.from(s);
console.log(monthGrid(P("2027-02")).length, monthGrid(P("2027-02"))[0], monthGrid(P("2026-03")).length, monthGrid(P("2026-02")).length, monthGrid(P("2026-02"), 7).length, monthGrid(P("2026-02"), 7)[0], monthGrid(P("2026-10")).join("|"));`,
  ['4 01 02 03 04 05 06 07 6 5 4 01 02 03 04 05 06 07 ·· ·· ·· 01 02 03 04|05 06 07 08 09 10 11|12 13 14 15 16 17 18|19 20 21 22 23 24 25|26 27 28 29 30 31'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`const start = Temporal.PlainYearMonth.from("2026-09");
const end = Temporal.PlainYearMonth.from("2027-05");
const rows = [];
let days = 0, lessons = 0;
for (let m = start; Temporal.PlainYearMonth.compare(m, end) <= 0; m = m.add({ months: 1 })) {
  let count = 0;
  for (let d = 1; d <= m.daysInMonth; d++) if ([1, 3, 5].includes(m.toPlainDate({ day: d }).dayOfWeek)) count++;
  rows.push(\`\${m}: \${m.daysInMonth}, \${count}\`);
  days += m.daysInMonth;
  lessons += count;
}
console.log(rows.length, start.until(end).toString(), days, lessons, rows[5], rows[6]);`,
  ['9 P8M 273 117 2027-02: 28, 12 2027-03: 31, 14'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`function clock(duration) {
  const d = duration.round({ largestUnit: "hours", smallestUnit: "seconds" });
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  return \`\${d.sign < 0 ? "-" : ""}\${pad(d.hours)}:\${pad(d.minutes)}:\${pad(d.seconds)}\`;
}
console.log(["P3DT1H41M5S", "PT90S", "-PT5M", "PT0S", "PT59M59.6S"].map((s) => clock(Temporal.Duration.from(s))).join(" "));`,
  ['73:41:05 00:01:30 -00:05:00 00:00:00 01:00:00'], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`const cmp = (date) => Temporal.Duration.compare("P1M", "P30D", { relativeTo: date });
const year = Temporal.Duration.from({ years: 1 });
const s = Temporal.PlainDate.from("2026-01-30");
let error = "";
try {
  Temporal.Duration.from("P1M").add("P1D");
} catch (e) {
  error = e.message;
}
console.log(cmp("2026-01-01"), cmp("2026-02-01"), cmp("2026-04-01"), year.total({ unit: "days", relativeTo: "2027-01-01" }), year.total({ unit: "days", relativeTo: "2028-01-01" }), s.add({ months: 1 }).add({ days: 1 }).since(s).toString(), s.add({ days: 1 }).add({ months: 1 }).since(s).toString(), error);`,
  ['1 -1 0 365 366 P30D P29D Temporal error: Largest unit cannot be a calendar unit when adding two durations.'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
