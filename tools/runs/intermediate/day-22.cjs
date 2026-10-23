// Course 2, day 22, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The browser context is
// fixed to the Ashgabat time zone (UTC+5) and the ru-RU language, as on day 21; claims about another zone run in a
// context of their own. Console output is rebuilt from Chrome's preview objects, as DevTools prints it: a Temporal
// object as its class name and its first five fields (PlainDate {era: undefined, …}), BigInt as 1n, a Date as its
// toString; an uncaught error is "! message" (V8 text). The current date of Temporal.Now is never printed.
//   node tools/runs/intermediate/day-22.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-22.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (the error table, strict parsing, the string table of section 9, the same
// PlainDateTime in New York, Temporal.Now there), the three experiments of «Карточки», the lines of the notes and
// reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-22');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const NY = { timezoneId: 'America/New_York', locale: 'en-US' };
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

const VALUEOF = '! Do not use Temporal.PlainDate.prototype.valueOf; use Temporal.PlainDate.prototype.compare for comparison.';
const EXPECT = {
  // lecture
  'const next = jan31.add({ months: 1 });': ['2026-02-28 2026-01-31 1 false'],
  'console.log(typeof Temporal, Object.prototype.toString.call(Temporal)': ["object [object Temporal] (9) ['Now', 'PlainDate', 'PlainTime', 'PlainDateTime', 'ZonedDateTime', 'Duration', 'Instant', 'PlainYearMonth', 'PlainMonthDay']", '! Temporal is not a constructor'],
  'const b = Temporal.PlainDate.from({ year: 2026, month: 10, day: 12 });': ['2026-10-12 2026-10-12 2026-10-12 2026-10-12 true false', "PlainDate {era: undefined, eraYear: undefined, calendarId: 'iso8601', year: 2026, month: 10, …}", '2026-09-12'],
  'const tryFrom = (text) =>': ["(6) ['2026-10-12', '2026-10-12', '2026-10-12', 'RangeError', 'RangeError', 'RangeError']"],
  'Temporal.PlainDate.from({ year: 2026, month: 13, day: 1 })': ['2026-02-28 2026-12-01', '! Temporal error: day value is not in a valid range.'],
  'const old = new Date(2026, 9, 12, 14, 30);': ['2026-10-12', '! Temporal error: Invalid PlainDate fields provided.'],
  'console.log(d.year, d.month, d.day, d.dayOfWeek, d.daysInMonth);': ['2026 10 12 1 31', '285 365 false M10 42 2026 undefined iso8601', '7 0'],
  'console.log(Object.getOwnPropertyNames(d), Object.isFrozen(d)': ['(0) [] false function', '! Cannot set property year of [object Temporal.PlainDate] which has only a getter'],
  'const first = d.with({ day: 1 });': ['2026-10-01 2026-10-31 2026-02-28 2028-02-29 2026-10-12', '! Temporal error: day value is not in a valid range.'],
  'start.add({ weeks: 12 })': ['2026-11-01 2027-01-04 2026-09-12 2028-01-06', '28 28'],
  'console.log(jan31.add({ months: 1, days: 31 })': ['2026-02-28 2028-02-29 2026-02-28', '2026-03-31 2026-04-03', '2026-02-01 2026-01-31', '! Temporal error: not a valid ISO date.'],
  'const left = start.until(end);': ['81 81 -81 P81D', '2 20 11', '26 7 13'],
  'const daysLeft = (today) =>': ['81 1 0 -9'],
  'function lessons(start, weeks) {': ['36 (3) [12, 14, 16] 2027-01-01 5 81'],
  'dates.sort(Temporal.PlainDate.compare);': ['true false -1 1 0', '2026-10-12, 2026-11-05, 2026-12-31, 2027-01-01 2026-10-12', VALUEOF],
  'console.log(d.toString({ calendarName: "always" })': ['2026-10-12[u-ca=iso8601] 2026-10-12 {"next":"2026-10-12"} 12.10.2026', '2026-10-13'],
  'const bell = lesson.add({ minutes: 45 });': ['09:00:00 09:45:00 9 45 1 30 14:30:00', '00:15:00 22:45:00 22:00:00 23:00:00', '-1 23:00:00 09:00', '! Temporal error: Invalid character while parsing hour value.'],
  'console.log(dt.toString(), dt.toPlainDate()': ['2026-10-12T14:30:00 2026-10-12 14:30:00 1 14', '2026-10-12T09:00:00 2026-10-13T01:00:00 2026-10-12T18:00:00 2026-10-12T14:30:00', '2 1 30 49 -1'],
  'console.log(Temporal.PlainDateTime.from("2026-10-12T14:30+03:00")': ['2026-10-12T14:30:00 16 2026-10-13T00:00:00', '! Temporal error: UTC designator is not valid for DateTime parsing.'],
  'console.log(Temporal.Now.timeZoneId()': ['Asia/Ashgabat true number', 'true true true'],
  'const persian = d.withCalendar("persian");': ['1405 7 20 ap 2026-10-12[u-ca=persian] false 0', '5787 13 true ce undefined', '53 2026'],
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

  // lecture 15: the error table, row by row, and the errors named in the prose of sections 3–8
  const a = 'Temporal.PlainDate.from("2026-10-12")';
  for (const [expr, want] of [
    ['new Temporal()', 'TypeError Temporal is not a constructor'],
    ['Temporal.PlainDate(2026, 10, 12)', 'TypeError Method invoked on an object that is not Temporal.PlainDate.'],
    ['new Temporal.PlainDate(2026, 2, 30)', 'RangeError Temporal error: Invalid ISO date.'],
    ['Temporal.PlainDate.from("12.10.2026")', 'RangeError Temporal error: Invalid character while parsing year value.'],
    ['Temporal.PlainDate.from("2026-02-30")', 'RangeError Temporal error: Parsed day value not in a valid range.'],
    ['Temporal.PlainDate.from("2021-02-29")', 'RangeError Temporal error: Parsed day value not in a valid range.'],
    ['Temporal.PlainDate.from({ year: 2026, month: 10 })', 'TypeError Temporal error: Invalid PlainDate fields provided.'],
    ['Temporal.PlainDate.from(new Date())', 'TypeError Temporal error: Invalid PlainDate fields provided.'],
    [`${a}.add({ month: 1 })`, 'TypeError Temporal error: Did not provide any valid Duration fields.'],
    [`${a}.add({ months: 1, days: -1 })`, 'RangeError Temporal error: Duration was not valid.'],
    [`${a} < ${a}`, VALUEOF.replace('! ', 'TypeError ')],
    [`${a} - ${a}`, VALUEOF.replace('! ', 'TypeError ')],
    [`${a} + ""`, VALUEOF.replace('! ', 'TypeError ')],
    [`${a}.until("2027-01-01", { largestUnit: "hours" })`, 'RangeError Temporal error: Unit was not part of the date unit group.'],
    [`${a}.with({})`, 'TypeError Temporal error: Must specify at least one calendar field.'],
    [`${a}.with({ dayOfWeek: 5 })`, 'TypeError Temporal error: Must specify at least one calendar field.'],
    ['Temporal.PlainTime.from("9:05")', 'RangeError Temporal error: Invalid character while parsing hour value.'],
    ['Temporal.Now.plainDateISO("Mars/Olympus")', 'RangeError Temporal error: Not a valid time zone string'],
  ]) await extra(errOf(expr), [want], `lecture 15 and prose: ${expr.slice(0, 60)}`);
  await extra('const d = Temporal.PlainDate.from("2026-10-12");\nd.year = 2027;\nconsole.log(d.year);', ['2026'], 'lecture 4: sloppy assignment does nothing');
  await extra('const d = Temporal.PlainDate.from("2026-10-12");\nd.note = "x";\nconsole.log(Object.isExtensible(d), d.note);', ['true x'], 'lecture 4: not frozen, an own property can be added');
  // lecture 5, 6, 10, 11, 16: smaller claims of the prose
  await extra(`console.log(${a}.with({ day: Number.MAX_VALUE }).toString(), ${a}.add("P1M").toString(), new Temporal.PlainTime().toString(), new Temporal.PlainDate(2026.9, 10.5, 12.99).toString());`,
    ['2026-10-31 2026-11-12 00:00:00 2026-10-12'], 'lectures 5, 6, 10, 16: MAX_VALUE, "P1M", midnight, truncation');
  await extra('const dt = Temporal.PlainDateTime.from("2026-10-12T14:30");\nconsole.log(dt.withPlainTime().toString(), Temporal.PlainDate.from("2026-10-12").toPlainDateTime().toString());',
    ['2026-10-12T00:00:00 2026-10-12T00:00:00'], 'lecture 11: withPlainTime() and toPlainDateTime() give midnight');
  // lecture 9: the string table, three classes
  await extra(`const tryIt = (f) => { try { return f().toString(); } catch (e) { return e.name; } };
for (const s of ["2026-10-12", "14:30", "2026-10-12T14:30", "2026-10-12 14:30", "2026-10-12T14:30+03:00", "2026-10-12T14:30Z"]) {
  console.log(s, tryIt(() => Temporal.PlainDate.from(s)), tryIt(() => Temporal.PlainTime.from(s)), tryIt(() => Temporal.PlainDateTime.from(s)));
}
console.log(${a}.toString({ calendarName: "never" }), ${a}.toString({ calendarName: "critical" }), ${a}.toString({ calendarName: "auto" }));`, [
    '2026-10-12 2026-10-12 RangeError 2026-10-12T00:00:00',
    '14:30 RangeError 14:30:00 RangeError',
    '2026-10-12T14:30 2026-10-12 14:30:00 2026-10-12T14:30:00',
    '2026-10-12 14:30 2026-10-12 14:30:00 2026-10-12T14:30:00',
    '2026-10-12T14:30+03:00 2026-10-12 14:30:00 2026-10-12T14:30:00',
    '2026-10-12T14:30Z RangeError RangeError RangeError',
    '2026-10-12 2026-10-12[!u-ca=iso8601] 2026-10-12',
  ], 'lecture 9: the string table and calendarName');
  // lecture 11 and 13: a PlainDateTime is the same in New York, a Date is not; Temporal.Now there
  await extra('console.log(Temporal.PlainDateTime.from("2026-10-12T14:30").toString(), new Date(2026, 9, 12, 14, 30).toISOString());',
    ['2026-10-12T14:30:00 2026-10-12T09:30:00.000Z'], 'lecture 11: wall-clock time in Ashgabat');
  await extra('console.log(Temporal.PlainDateTime.from("2026-10-12T14:30").toString(), new Date(2026, 9, 12, 14, 30).toISOString());',
    ['2026-10-12T14:30:00 2026-10-12T18:30:00.000Z'], 'lecture 11: the same wall-clock time in New York', NY);
  await extra('console.log(Temporal.Now.timeZoneId(), Temporal.Now.plainDateISO("Asia/Ashgabat") instanceof Temporal.PlainDate);',
    ['America/New_York true'], 'lecture 13: timeZoneId follows the device', NY);
  // lecture 17: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const review = (card, today) =>');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 17: the program without its output lines');
    const lt = top.replace('Temporal.PlainDate.compare(c.next, today) <= 0', 'c.next <= today');
    check(lt !== top, 'lecture 17, experiment 1: c.next <= today');
    await extra(lt, [VALUEOF], 'lecture 17, experiment 1: the error');
    const noReviver = top.replace('JSON.parse(text, (key, value) => (key === "next" ? Temporal.PlainDate.from(value) : value))', 'JSON.parse(text)');
    check(noReviver !== top, 'lecture 17, experiment 2: load without the reviver');
    await extra(`${noReviver}\nconsole.log(back[0].next.dayOfWeek, typeof back[0].next, due.map((c) => c.word));`, ["undefined string (2) ['book', 'bread']"], 'lecture 17, experiment 2: compare still works, dayOfWeek does not');
    const lost = top.replace('const due = ', 'today.add({ days: 1 });\nconst due = ');
    check(lost !== top, 'lecture 17, experiment 3: an add without assignment');
    await extra(`${lost}\nconsole.log(due.map((c) => c.word), today.toString());`, ["(2) ['book', 'bread'] 2026-10-13"], 'lecture 17, experiment 3: nothing changed');
  }
  // notes: the main block
  await extra('console.log(Temporal.PlainDate.from("2026-01-31").add({ months: 1 }).toString(), new Temporal.PlainDate(2026, 10, 12).month, Temporal.PlainDate.from("2026-10-18").dayOfWeek, Temporal.PlainDate.from("2026-10-12").until("2027-01-01").days, Temporal.PlainDate.compare("2026-10-12", "2026-10-20"), JSON.stringify({ next: Temporal.PlainDate.from("2026-10-12") }));',
    ['2026-02-28 10 7 81 -1 {"next":"2026-10-12"}'], 'notes: the main block');
  await extra('const jan31 = Temporal.PlainDate.from("2026-01-31");\nconsole.log(jan31.add({ months: 1, days: 31 }).toString());', ['2026-03-31'], 'notes: 31 January + { months: 1, days: 31 }');

  // task 1
  await extra(`const err = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log([
  () => Temporal.PlainDate.from("2026-01-31").add({ months: 1 }).toString(),
  () => Temporal.PlainDate.from("2026-10-12").month,
  () => Temporal.PlainDate.from("2026-10-18").dayOfWeek,
  () => new Temporal.PlainDate(2026, 9, 12).toString(),
  () => Temporal.PlainDate.from({ year: 2026, month: 2, day: 30 }).toString(),
  () => Temporal.PlainDate.from("2026-02-30"),
  () => Temporal.PlainDate.from("2026-10-12") < Temporal.PlainDate.from("2026-10-13"),
  () => Temporal.PlainTime.from("22:45").add({ minutes: 90 }).toString(),
  () => Temporal.PlainDate.compare("2026-10-12", "2026-10-13"),
].map(err).join(" "));`, ['2026-02-28 10 7 2026-09-12 2026-02-28 RangeError TypeError 00:15:00 -1'], 'task 1: the eight answers and the fix of line 7');
  // task 2
  await extra(`const d = Temporal.PlainDate.from("2026-10-12");
const later = d.add({ days: 20 });
console.log(d.month, d.dayOfWeek, later.toString(), Temporal.PlainDate.from("2026-02-01").daysInMonth, d.since("2026-10-11").days, d.toString(), Temporal.PlainDate.from("2026-10-18").dayOfWeek, new Date(2026, 9, 18).getDay());`,
  ['10 1 2026-11-01 28 1 2026-10-12 7 0'], 'task 2: the numbers of the criteria');
  // task 3
  await extra(`function bells(start, count, length, pause) {
  const result = [];
  let t = Temporal.PlainTime.from(start);
  for (let i = 0; i < count; i++) {
    const end = t.add({ minutes: length });
    result.push(\`\${t.toString({ smallestUnit: "minute" })}–\${end.toString({ smallestUnit: "minute" })}\`);
    t = end.add({ minutes: pause });
  }
  return result;
}
console.log(bells("08:30", 4, 45, 10).join(" "), bells("22:00", 3, 45, 10).at(-1));`,
  ['08:30–09:15 09:25–10:10 10:20–11:05 11:15–12:00 23:50–00:35'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`const courseEnd = Temporal.PlainDate.from("2027-01-01");
const left = (today) => today.until(courseEnd);
const t = Temporal.PlainDate.from("2026-11-20");
const months = t.until(courseEnd, { largestUnit: "months" });
const weeks = t.until(courseEnd, { largestUnit: "weeks" });
console.log(left(t).days, months.months, months.days, weeks.weeks, weeks.days, left(Temporal.PlainDate.from("2027-01-05")).days, t.since(courseEnd).days, typeof left(Temporal.Now.plainDateISO()).days);`,
  ['42 1 12 6 0 -4 -42 number'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`function lessons(start, count, holidays) {
  const skip = new Set(holidays);
  const result = [];
  const skipped = [];
  for (let day = start; result.length < count; day = day.add({ days: 1 })) {
    if (![1, 3, 5].includes(day.dayOfWeek)) continue;
    if (skip.has(day.toString())) skipped.push(day.toString());
    else result.push(day);
  }
  return { result, skipped };
}
const start = Temporal.PlainDate.from("2026-10-12");
const { result, skipped } = lessons(start, 36, ["2026-12-12", "2027-01-01"]);
console.log(result.length, result.at(-1).toString(), result.at(-1).dayOfWeek, skipped.join(), Temporal.PlainDate.from("2026-12-12").dayOfWeek, result[0].until(result.at(-1)).days, start.toString());`,
  ['36 2027-01-04 1 2027-01-01 6 84 2026-10-12'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`function parseRuDate(text) {
  const m = /^(\\d{2})\\.(\\d{2})\\.(\\d{4})$/.exec(text);
  if (!m) return null;
  const [, day, month, year] = m.map(Number);
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
  } catch {
    return null;
  }
}
console.log(["12.10.2026", "29.02.2028", "31.02.2026", "00.10.2026", "1.10.2026", "2026-10-12"].map((t) => String(parseRuDate(t))).join(" "), Temporal.PlainDate.from({ year: 2026, month: 2, day: 31 }).toString());`,
  ['2026-10-12 2028-02-29 null null null null 2026-02-28'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`const lastDay = (d) => d.with({ day: Number.MAX_VALUE });
function nextWeekday(date, dow) {
  const distance = dow - date.dayOfWeek;
  return date.add({ days: distance <= 0 ? date.daysInWeek + distance : distance });
}
function mondays(year, month) {
  const result = [];
  for (let d = nextWeekday(Temporal.PlainDate.from({ year, month, day: 1 }).subtract({ days: 1 }), 1); d.month === month; d = d.add({ weeks: 1 })) result.push(d.day);
  return result;
}
const wed = Temporal.PlainDate.from("2026-10-14");
console.log(lastDay(Temporal.PlainDate.from("2026-02-10")).toString(), lastDay(Temporal.PlainDate.from("2028-02-10")).toString(), nextWeekday(wed, 1).toString(), nextWeekday(Temporal.PlainDate.from("2026-10-12"), 1).toString(), mondays(2026, 10).join(), mondays(2026, 11).join(), wed.toString());`,
  ['2026-02-28 2028-02-29 2026-10-19 2026-10-19 5,12,19,26 2,9,16,23,30 2026-10-14'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`const lesson = { title: "JS", date: Temporal.PlainDate.from("2026-10-12"), start: Temporal.PlainTime.from("09:00") };
const text = JSON.stringify(lesson);
const types = { date: Temporal.PlainDate, start: Temporal.PlainTime };
const back = JSON.parse(text, (key, value) => (key in types ? types[key].from(value) : value));
console.log(text, back.date.equals(lesson.date), back.start.equals(lesson.start), back.date.toPlainDateTime(back.start).toString(), JSON.stringify({ date: new Date(2026, 9, 12, 9, 0) }));`,
  ['{"title":"JS","date":"2026-10-12","start":"09:00:00"} true true 2026-10-12T09:00:00 {"date":"2026-10-12T04:00:00.000Z"}'], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`const dates = ["2026-12-31", "2026-10-12", "2027-01-01"].map((s) => Temporal.PlainDate.from(s));
const latest = (list) => list.reduce((x, y) => (Temporal.PlainDate.compare(x, y) >= 0 ? x : y));
let error = "";
try {
  Math.max(...dates);
} catch (e) {
  error = e.name;
}
console.log(latest(dates).toString(), error, "+010000-01-01" < "2026-10-12", Temporal.PlainDate.compare("+010000-01-01", "2026-10-12"), "-000500-01-01" < "-001000-01-01", Temporal.PlainDate.compare("-000500-01-01", "-001000-01-01"), dates.toSorted(Temporal.PlainDate.compare).join(), dates.join());`,
  ['2027-01-01 TypeError true 1 true 1 2026-10-12,2026-12-31,2027-01-01 2026-12-31,2026-10-12,2027-01-01'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
