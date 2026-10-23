// Course 2, day 24, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The browser context is
// fixed to the Ashgabat time zone (UTC+5) and the ru-RU language, as on days 21–23; claims about a device in another
// zone run in a New York context. Console output is rebuilt from Chrome's preview objects, as DevTools prints it:
// Instant {epochMilliseconds: …, epochNanoseconds: …n} whole, a ZonedDateTime cut after five fields; an uncaught error
// is "! message" (V8 text). The current moment of Temporal.Now is never printed.
//   node tools/runs/intermediate/day-24.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-24.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (the error table, the offset option, Date in a New York browser, the MDN example of
// Instant.toString), the three experiments of «Карточки», the lines of the notes and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-24');
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

const EXPECT = {
  // lecture
  'const instant = old.toTemporalInstant();': ['2026-10-12T09:30:00Z 2026-10-12T14:30:00+05:00[Asia/Ashgabat] 2026-10-12T11:30:00+02:00[Europe/Berlin]'],
  'const d = new Temporal.Instant(1791797400000000000n);': ['true true true 1791797400000 1791797400000000000n undefined', '2026-10-12T09:30:00Z 2026-10-12T14:30:00+05:00 14 true', 'Instant {epochMilliseconds: 1791797400000, epochNanoseconds: 1791797400000000000n}', '! Temporal error: Required fields missing from Instant string.'],
  'const legacy = new Date(Date.UTC(2026, 9, 12, 9, 30));': ['14 5 05:30:00'],
  'const x = new Temporal.ZonedDateTime(1791797400000000000n, "America/New_York");': ['2026-10-12T14:30:00+05:00[Asia/Ashgabat] Asia/Ashgabat +05:00 14 2026-10-12 2026-10-12T09:30:00Z 1791797400000', '2026-10-12T11:30:00+02:00[Europe/Berlin] 2026-10-12T05:30:00-04:00[America/New_York] false 0 true', '! Temporal error: Time zone annotation is required for parsing a zoned date time.'],
  'const ash = Temporal.ZonedDateTime.from("2026-06-01T00:00[Asia/Ashgabat]");': ['+06:00 Asia/Ashkhabad Asia/Ashgabat', 'null 1992-01-19T03:00:00+05:00[Asia/Ashgabat]', '+05:00 -05:00'],
  'const call = Temporal.ZonedDateTime.from("2026-10-12T12:00[America/New_York]");': ['2026-10-12T18:00:00+02:00[Europe/Paris] 2026-10-12T12:00:00+02:00[Europe/Paris]'],
  'const berlin = (text) =>': ['23 25 24 24', '2026-10-25T12:00:00+01:00[Europe/Berlin] 2026-10-25T11:00:00+01:00[Europe/Berlin] PT25H P1D', '2026-10-25T02:00:00+01:00[Europe/Berlin] 25'],
  'const saoPaulo = ': ['2015-10-18T01:00:00-02:00[America/Sao_Paulo] 23'],
  'const gap = "2026-03-29T02:30[Europe/Berlin]";': ['2026-03-29T03:30:00+02:00[Europe/Berlin] 2026-03-29T01:30:00+01:00[Europe/Berlin]', '2026-10-25T02:30:00+02:00[Europe/Berlin] 2026-10-25T02:30:00+01:00[Europe/Berlin]', '! Temporal error: Rejecting ambiguous time zones.'],
  'const later = a.add({ hours: 30 });': ['2026-10-13T15:30:00Z PT108000S PT30H 2026-10-12T10:00:00Z -1', '2026-11-12T16:30:00+05:00[Asia/Ashgabat] 2026-10-13T00:00:00+05:00[Asia/Ashgabat] PT18H30M', '! Temporal error: Largest unit cannot be a date unit'],
  'const start = Temporal.ZonedDateTime.from("2026-10-24T12:00[Europe/Berlin]");': ['PT29H P1DT4H P1DT5H', '! Temporal error: Timezones must be the same if unit is a day unit.'],
  'z.toString({ timeZoneName: "never" })': ['2026-10-12T14:30:00+05:00 2026-10-12T14:30:00[Asia/Ashgabat] {"z":"2026-10-12T14:30:00+05:00[Asia/Ashgabat]"}', 'true {"at":"2026-10-12T09:30:00Z"}'],
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

  // lecture 12: the error table, row by row
  const zdt = (s) => `Temporal.ZonedDateTime.from(${JSON.stringify(s)})`;
  for (const [expr, want] of [
    ['Temporal.Instant.from("2026-10-12T14:30")', 'RangeError Temporal error: Required fields missing from Instant string.'],
    ['new Temporal.Instant(1791797400000)', 'TypeError Cannot convert 1791797400000 to a BigInt'],
    ['new Date("x").toTemporalInstant()', 'RangeError The number NaN cannot be converted to a BigInt because it is not an integer'],
    ['Temporal.Instant.from("2026-10-12T09:30Z").add({ days: 1 })', 'RangeError Temporal error: Largest unit cannot be a date unit'],
    [zdt('2026-10-12T14:30+05:00'), 'RangeError Temporal error: Time zone annotation is required for parsing a zoned date time.'],
    [zdt('2026-10-12T14:30[Mars/Olympus]'), 'RangeError Temporal error: Unknown time zone identifier'],
    [zdt('2026-10-12T14:30+03:00[Asia/Ashgabat]'), 'RangeError Temporal error: Offsets could not be determined without disambiguation'],
    ['Temporal.ZonedDateTime.from("2026-10-25T02:30[Europe/Berlin]", { disambiguation: "reject" })', 'RangeError Temporal error: Rejecting ambiguous time zones.'],
    [`${zdt('2026-10-25T20:00[Asia/Ashgabat]')}.since(${zdt('2026-10-24T12:00[Europe/Berlin]')}, { largestUnit: "days" })`, 'RangeError Temporal error: Timezones must be the same if unit is a day unit.'],
    ['new Temporal.ZonedDateTime(0n)', 'TypeError Temporal error: Time zone must be string'],
    ['Temporal.Instant.from("2026-10-12T09:30Z") < Temporal.Instant.from("2026-10-12T10:30Z")', 'TypeError Do not use Temporal.Instant.prototype.valueOf; use Temporal.Instant.prototype.compare for comparison.'],
    [`${zdt('2026-10-12T14:30[Asia/Ashgabat]')} < ${zdt('2026-10-12T14:30[Asia/Ashgabat]')}`, 'TypeError Do not use Temporal.ZonedDateTime.prototype.valueOf; use Temporal.ZonedDateTime.prototype.compare for comparison.'],
  ]) await extra(errOf(expr), [want], `lecture 12: ${expr.slice(0, 70)}`);
  // lecture 2, 4, 7, 10: smaller claims of the prose
  await extra(find('lecture', 'const legacy = new Date(Date.UTC(2026, 9, 12, 9, 30));'), ['5 5 05:30:00'], 'lecture 2: the same code on a device in New York', NY);
  await extra(`console.log(Temporal.ZonedDateTime.from("2026-10-12T14:30+03:00[Asia/Ashgabat]", { offset: "use" }).toString(), Temporal.ZonedDateTime.from("2026-10-12T14:30+03:00[Asia/Ashgabat]", { offset: "ignore" }).toString(), ${zdt('2026-10-12T09:30Z[Asia/Ashgabat]')}.toString());`,
    ['2026-10-12T16:30:00+05:00[Asia/Ashgabat] 2026-10-12T14:30:00+05:00[Asia/Ashgabat] 2026-10-12T14:30:00+05:00[Asia/Ashgabat]'], 'lecture 7: offset "use", "ignore" and Z');
  await extra('console.log(Temporal.Instant.fromEpochMilliseconds(1577836800000).toString({ timeZone: "UTC" }));', ['2020-01-01T00:00:00+00:00'], 'lecture 10: the MDN example of Instant.toString is wrong');
  await extra('console.log(Temporal.Now.zonedDateTimeISO().timeZoneId, Temporal.Now.instant() instanceof Temporal.Instant, Temporal.Now.timeZoneId());', ['Asia/Ashgabat true Asia/Ashgabat'], 'lecture 3–4: Temporal.Now in Ashgabat');
  await extra('console.log(Temporal.Now.timeZoneId(), Temporal.Now.zonedDateTimeISO().timeZoneId);', ['America/New_York America/New_York'], 'lecture 4: Temporal.Now follows the device', NY);
  await extra(`console.log(${zdt('2026-10-12T14:30[Asia/Ashgabat]')}.offsetNanoseconds, typeof ${zdt('2026-10-12T14:30[Asia/Ashgabat]')}.epochNanoseconds, ${zdt('2026-10-12T14:30[ASIA/ASHGABAT]')}.timeZoneId);`, ['18000000000000 bigint Asia/Ashgabat'], 'lecture 3–4: offsetNanoseconds, epochNanoseconds, case');
  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const reminders = students.map(');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 14: the program without its output lines');
    const oct26 = top.replace('Temporal.PlainDate.from("2026-10-13")', 'Temporal.PlainDate.from("2026-10-26")');
    check(oct26 !== top, 'lecture 14, experiment 1: 26 October');
    await extra(`${oct26}\nconsole.log(reminders.map((r) => r.at.toInstant().toString()).join(" "), reminders.map((r) => r.at.hour).join(" "));`,
      ['2026-10-26T04:00:00Z 2026-10-26T08:00:00Z 2026-10-26T13:00:00Z 9 9 9'], 'lecture 14, experiment 1: only Berlin moved');
    await extra(`${top}\nconst back = Temporal.ZonedDateTime.from(JSON.parse(JSON.stringify(reminders[1])).at);\nconsole.log(back.equals(reminders[1].at), back.timeZoneId, back.offset);`,
      ['true Europe/Berlin +02:00'], 'lecture 14, experiment 2: JSON keeps everything');
    const offsetZone = top.replace('{ name: "Сапар", zone: "America/New_York" }', '{ name: "Сапар", zone: "-04:00" }').replace('Temporal.PlainDate.from("2026-10-13")', 'Temporal.PlainDate.from("2026-11-05")');
    check(offsetZone !== top, 'lecture 14, experiment 3: an offset instead of a zone name');
    await extra(`${offsetZone}\nconsole.log(reminders[2].at.withTimeZone("America/New_York").toPlainTime().toString());`, ['08:00:00'], 'lecture 14, experiment 3: an hour early in New York');
  }
  // notes: the main block
  await extra('console.log(new Date(2026, 9, 12, 14, 30).toTemporalInstant().toString(), Temporal.Instant.from("2026-10-12T09:30Z").toZonedDateTimeISO("Europe/Berlin").hour, Temporal.ZonedDateTime.from("2026-10-12T14:30[Asia/Ashgabat]").offset, Temporal.ZonedDateTime.from("2026-10-25T12:00[Europe/Berlin]").hoursInDay, Temporal.ZonedDateTime.from("2026-03-29T02:30[Europe/Berlin]").hour, Temporal.Instant.fromEpochMilliseconds(0).epochNanoseconds);',
    ['2026-10-12T09:30:00Z 11 +05:00 25 3 0n'], 'notes: the main block');
  await extra('console.log(Temporal.ZonedDateTime.from("2026-07-01T12:00[Europe/Berlin]").offset, Temporal.ZonedDateTime.from("2026-12-01T12:00[Europe/Berlin]").offset);', ['+02:00 +01:00'], 'notes: Berlin in summer and winter');

  // task 1
  await extra(`const err = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log([
  () => Temporal.Instant.from("2026-10-12T14:30+05:00").toString(),
  () => Temporal.Instant.from("2026-10-12T14:30"),
  () => Temporal.ZonedDateTime.from("2026-10-12T14:30[Europe/Berlin]").offset,
  () => Temporal.ZonedDateTime.from("2026-12-12T14:30[Europe/Berlin]").offset,
  () => Temporal.ZonedDateTime.from("2026-10-25T12:00[Europe/Berlin]").hoursInDay,
  () => new Temporal.Instant(0),
  () => Temporal.Instant.fromEpochMilliseconds(0).epochNanoseconds,
  () => Temporal.ZonedDateTime.from("2026-10-12T14:30[Asia/Ashgabat]").withTimeZone("UTC").hour,
  () => new Temporal.Instant(0n).toString(),
].map(err).join(" "));`, ['2026-10-12T09:30:00Z RangeError +02:00 +01:00 25 TypeError 0 9 1970-01-01T00:00:00Z'], 'task 1: the eight answers and the fix of line 6');
  // task 2
  await extra(`const d = new Date(2026, 9, 12, 14, 30, 15, 250);
const i = d.toTemporalInstant();
let error = "";
try {
  new Date("12 октября").toTemporalInstant();
} catch (e) {
  error = e.message;
}
console.log(i.toString(), new Date(i.epochMilliseconds).getTime() === d.getTime(), i.epochNanoseconds === BigInt(d.getTime()) * 1000000n, i.toZonedDateTimeISO("Asia/Ashgabat").toPlainDate().toString(), error);`,
  ['2026-10-12T09:30:15.25Z true true 2026-10-12 The number NaN cannot be converted to a BigInt because it is not an integer'], 'task 2: the numbers of the criteria');
  // task 3
  await extra(`const moment = Temporal.Instant.from("2026-10-12T09:30Z");
console.log(["Asia/Ashgabat", "Europe/Moscow", "Europe/Istanbul", "Asia/Tokyo", "Asia/Kolkata"].map((z) => {
  const t = moment.toZonedDateTimeISO(z);
  return \`\${t.toPlainTime().toString({ smallestUnit: "minute" })} \${t.offset}\`;
}).join(" | "));`, ['14:30 +05:00 | 12:30 +03:00 | 12:30 +03:00 | 18:30 +09:00 | 15:00 +05:30'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`function goodHours(date, zones, from, to) {
  const result = [];
  for (let h = 0; h < 24; h++) {
    const here = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: "Asia/Ashgabat", plainTime: { hour: h } });
    if (zones.every((zone) => {
      const local = here.withTimeZone(zone).hour;
      return local >= from && local < to;
    })) result.push(h);
  }
  return result;
}
const zones = ["Asia/Ashgabat", "Europe/Berlin", "America/New_York"];
console.log(["2026-10-22", "2026-10-29", "2026-11-05"].map((d) => goodHours(d, zones, 8, 20).join(",")).join(" | "));`,
  ['17,18,19 | 17,18,19 | 18,19'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`function oddDays(zone, year) {
  const result = [];
  let t = Temporal.ZonedDateTime.from({ timeZone: zone, year, month: 1, day: 1 });
  for (;;) {
    t = t.getTimeZoneTransition("next");
    if (t === null || t.year !== year) break;
    result.push(\`\${t.toPlainDate()} \${t.hoursInDay}\`);
  }
  return result;
}
console.log(["Europe/Berlin", "America/New_York", "Asia/Ashgabat", "Australia/Sydney"].map((z) => oddDays(z, 2026).join(", ")).join(" | "));`,
  ['2026-03-29 23, 2026-10-25 25 | 2026-03-08 23, 2026-11-01 25 |  | 2026-04-05 25, 2026-10-04 23'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`const flight1 = Temporal.ZonedDateTime.from("2026-10-12T11:00[Europe/Istanbul]").since(Temporal.ZonedDateTime.from("2026-10-12T08:30[Asia/Ashgabat]"));
const flight2 = Temporal.ZonedDateTime.from("2026-10-25T16:00[Europe/Berlin]").since(Temporal.ZonedDateTime.from("2026-10-25T14:00[Europe/Istanbul]"));
const naive = Temporal.PlainDateTime.from("2026-10-25T14:00").until("2026-10-25T16:00");
console.log(flight1.toString(), flight2.toString(), flight2.total("minutes"), naive.toString());`,
  ['PT4H30M PT4H 240 PT2H'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`const at = (date, options) => Temporal.PlainDateTime.from(\`\${date}T02:30\`).toZonedDateTime("Europe/Berlin", options);
let error = "";
try {
  at("2026-03-29", { disambiguation: "reject" });
} catch (e) {
  error = e.name;
}
console.log(["2026-03-28", "2026-03-29", "2026-03-30"].map((d) => at(d).toString()).join(" "), at("2026-03-29", { disambiguation: "earlier" }).toPlainTime().toString(), error, at("2026-10-25").offset, at("2026-10-25", { disambiguation: "later" }).offset, at("2026-10-25", { disambiguation: "later" }).since(at("2026-10-25")).toString());`,
  ['2026-03-28T02:30:00+01:00[Europe/Berlin] 2026-03-29T03:30:00+02:00[Europe/Berlin] 2026-03-30T02:30:00+02:00[Europe/Berlin] 01:30:00 RangeError +02:00 +01:00 PT1H'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`const students = [
  { name: "Аман", zone: "Asia/Ashgabat" },
  { name: "Мерет", zone: "Europe/Berlin" },
  { name: "Сапар", zone: "America/New_York" },
];
const remindersFor = (day) => students.map((s) => ({ name: s.name, at: Temporal.PlainDate.from(day).toZonedDateTime({ timeZone: s.zone, plainTime: "09:00" }) }));
const due = (day, now) => remindersFor(day).filter((r) => Temporal.Instant.compare(r.at.toInstant(), Temporal.Instant.from(now)) <= 0).map((r) => r.name);
const saved = JSON.parse(JSON.stringify(remindersFor("2026-10-13")));
const restored = saved.map((r) => ({ ...r, at: Temporal.ZonedDateTime.from(r.at) }));
console.log(due("2026-10-13", "2026-10-13T08:00Z").join(","), due("2026-10-13", "2026-10-13T13:00Z").join(","), remindersFor("2026-10-26")[1].at.toInstant().toString(), restored.every((r, i) => r.at.equals(remindersFor("2026-10-13")[i].at)));`,
  ['Аман,Мерет Аман,Мерет,Сапар 2026-10-26T08:00:00Z true'], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`const berlin = Temporal.ZonedDateTime.from("2026-10-25T00:00[Europe/Berlin]");
const ashgabat = Temporal.ZonedDateTime.from("2026-10-25T00:00[Asia/Ashgabat]");
const day = Temporal.Duration.from({ days: 1 });
console.log(day.total({ unit: "hours", relativeTo: berlin }), day.total({ unit: "hours", relativeTo: berlin.toPlainDate() }), Temporal.Duration.compare(day, { hours: 24 }, { relativeTo: berlin }), Temporal.Duration.compare(day, { hours: 24 }, { relativeTo: ashgabat }), berlin.add({ days: 1 }).toPlainDateTime().toString(), berlin.add({ hours: 24 }).toPlainDateTime().toString());`,
  ['25 24 1 0 2026-10-26T00:00:00 2026-10-25T23:00:00'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
