// Course 2, day 21, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The browser context is
// fixed to the Ashgabat time zone (UTC+5, as in day 17 of Essentials) and the ru-RU language, so dates print the same
// on any machine; claims about other zones and languages run in contexts of their own. Console output is rebuilt from
// Chrome's preview objects, as DevTools prints it: BigInt as 1n, a Date as its toString, a regex as its literal, an
// array with its extra named properties; an uncaught error is "! message" (V8 text).
//   node tools/runs/intermediate/day-21.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-21.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (the BigInt error texts, toJSON on BigInt.prototype, no setDay, New York and UTC−5
// readings, toString in two languages, >>>), the three experiments of «Карточки», the lines of the notes and
// reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-21');
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

const EXPECT = {
  // lecture
  'console.log(Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2, 9007199254740993, 9007199254740993n);': ['true 9007199254740992 9007199254740993n', '14 9 2026-10-12T09:30:00.000Z true 1791797399999'],
  'console.log(typeof 10n, 9007199254740993n': ['bigint 9007199254740993n 9007199254740991n 9007199254740993n 9007199254740991n 123n 1n', '9007199254740992n object false'],
  'const previousMaxSafe = BigInt(Number.MAX_SAFE_INTEGER);': ['9007199254740992n 9007199254740993n 18014398509481982n 18446744073709551616n', '2n -2n 1n -1n Итого: 5 5', '18446744073709552000 9007199254740992 4n 5.5', '! Cannot mix BigInt and other types, use explicit conversions'],
  'function factorial(n) {': ['265252859812191058636308480000000n 33 2.6525285981219103e+32', 'true false'],
  'const mixed = [4n, 6, -12n, 10, 4, 0, 0n];': ['true false true true true false 12n', '(7) [-12n, 0, 0n, 10, 4n, 4, 6] (7) [-12n, 0, 0n, 4n, 4, 6, 10]', '2 undefined true'],
  'console.log(254n.toString(16)': ['fe 1000010 -1010 0 73', '9223372036854775807n -9223372036854775808n 0n 1n -7n', 'bigint 5'],
  'const replacer = (key, value) =>': ['{"number":1,"big":{"$bigint":"18014398509481982"}} 18014398509481982n 9007199254740992'],
  'console.log(2n ** 0n, 0n ** 0n, Number(1n) + 1);': ['1n 1n 2', '! Cannot mix BigInt and other types, use explicit conversions'],
  'const d = new Date(2026, 9, 12, 14, 30, 15, 250);': ['14 9 -300 1 15 250', '2026-10-12T09:30:15.250Z 1791797415250 5 1970-01-01T00:00:00.000Z', '-360 -300'],
  'console.log(Date.parse("2019-01-01")': ['1546300800000 1546300800000 1546282800000', '5 0 5 2', '11 Invalid Date 2 Invalid Date'],
  'function parseRuDate(text) {': ['Mon Oct 12 2026 null null'],
  'console.log(Date.UTC(2026, 9, 12)': ['1791763200000 1791797400000 5 1767225600000', '-18000000 1970 true 1999'],
  'const ret = d.setDate(d.getDate() + 20);': ['Sun Nov 01 2026 true', '1962-07-24 1962-08-01 1962-06-30 1962-05-11', '28 29'],
  'const e = new Date(2026, 9, 12, 14, 30);': ['13 1', '2 15', '2 1'],
  'function addDaysBad(date, n) {': ['true 14'],
  'const jan31 = new Date(2026, 0, 31);': ['Tue Mar 03 2026', 'Sat Feb 28 2026 29 Fri Jan 15 2027'],
  'console.log(d.toDateString(), "|", d.toUTCString()': ['Mon Oct 12 2026 | Mon, 12 Oct 2026 09:30:00 GMT | 2026-10-12T09:30:00.000Z', '14:30:00 GMT+0500 12.10.2026 string {"when":"2026-10-12T09:30:00.000Z"}'],
  'console.log(typeof (d + 1), d - 1': ['string 1791797399999 true 1791797400000 Mon Oct 12 2026', '{"when":null} 1970-01-01T00:00:00.000Z 0'],
  'console.log(new Date("2026-10-12T24:00").getDate()': ['13 +275760-09-13T00:00:00.000Z Invalid Date', 'true true'],
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

  // lecture 6: toJSON on BigInt.prototype
  await extra('BigInt.prototype.toJSON = function () {\n  return { $bigint: this.toString() };\n};\nconsole.log(JSON.stringify({ a: 1n }));', ['{"a":{"$bigint":"1"}}'], 'lecture 6: BigInt.prototype.toJSON');
  // lecture 7: the error table
  for (const [expr, want] of [
    ['1n / 0n', 'RangeError Division by zero'], ['2n ** -1n', 'RangeError Exponent must be positive'],
    ['BigInt(1.5)', 'RangeError The number 1.5 cannot be converted to a BigInt because it is not an integer'],
    ['+1n', 'TypeError Cannot convert a BigInt value to a number'], ['Math.max(1n, 2n)', 'TypeError Cannot convert a BigInt value to a number'],
    ['BigInt(undefined)', 'TypeError Cannot convert undefined to a BigInt'], ['BigInt("1.5")', 'SyntaxError Cannot convert 1.5 to a BigInt'],
    ['1n + 1', 'TypeError Cannot mix BigInt and other types, use explicit conversions'], ['new BigInt(1)', 'TypeError BigInt is not a constructor'],
    ['JSON.stringify({ a: 1n })', 'TypeError Do not know how to serialize a BigInt'],
    ['1n >>> 0n', 'TypeError BigInts have no unsigned right shift, use >> instead'],
  ]) await extra(errOf(expr), [want], `lecture 7 and 13: ${expr}`);
  // lecture 8: no setDay; the same moment in New York; toString in two languages
  await extra('console.log(typeof Date.prototype.setDay, typeof Date.prototype.getDay);', ['undefined function'], 'lecture 8: no setDay');
  await extra('const m = new Date(Date.UTC(2026, 9, 12, 9, 30, 15));\nconsole.log(m.getHours(), m.getMinutes(), m.getTimezoneOffset());', ['5 30 240'], 'lecture 8, scheme 2: New York in October', { timezoneId: 'America/New_York', locale: 'en-US' });
  await extra('console.log(new Date(2026, 9, 12, 14, 30).toString());', ['Mon Oct 12 2026 14:30:00 GMT+0500 (Туркменистан, стандартное время)'], 'lecture 12: toString in a Russian browser');
  await extra('console.log(new Date(2026, 9, 12, 14, 30).toString());', ['Mon Oct 12 2026 14:30:00 GMT+0500 (Turkmenistan Standard Time)'], 'lecture 12: toString in an English browser', { timezoneId: 'Asia/Ashgabat', locale: 'en-US' });
  // lecture 9: west of UTC a date-only string is the day before
  await extra('console.log(new Date("2026-10-12").getDate(), new Date("2026-10-12T00:00").getDate());', ['11 12'], 'lecture 9 and task 2: UTC−5', { timezoneId: 'America/Lima', locale: 'en-US' });
  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const save = (list) =>');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 14: the program without its output lines');
    const noReplacer = top.replace('JSON.stringify(list, (key, value) => (typeof value === "bigint" ? String(value) : value))', 'JSON.stringify(list)');
    check(noReplacer !== top, 'lecture 14, experiment 1: save without the replacer');
    await extra(noReplacer, ['! Do not know how to serialize a BigInt'], 'lecture 14, experiment 1: the error');
    const noN = top.replace('{ id: 9007199254740993n,', '{ id: 9007199254740993,');
    check(noN !== top, 'lecture 14, experiment 2: the first id without n');
    await extra(`${noN}\nconsole.log(cards[0].id, back[0].id);`, ['9007199254740992 9007199254740992n'], 'lecture 14, experiment 2: the digit is lost already in the literal');
    const mutating = top.replace('const addDays = (date, n) => {\n  const copy = new Date(date);\n  copy.setDate(copy.getDate() + n);\n  return copy;\n};', 'const addDays = (date, n) => {\n  date.setDate(date.getDate() + n);\n  return date;\n};');
    check(mutating !== top, 'lecture 14, experiment 3: addDays without a copy');
    await extra(`${mutating}\nconsole.log(today.toDateString());`, ['Fri Oct 16 2026'], 'lecture 14, experiment 3: today moved');
  }
  // notes: the main block
  await extra('console.log(9007199254740993n + 2n, BigInt("9007199254740993") === 9007199254740993n, 5n / 2n, new Date("2026-10-12").getHours(), new Date(2026, 2, 0).getDate(), new Date(2026, 9, 12) - new Date(2026, 9, 11));',
    ['9007199254740995n true 2n 5 28 86400000'], 'notes: the main block');

  // task 1
  await extra('console.log([5n / 2n, -5n / 2n, 2n ** 64n, 0n == 0, 0n === 0, typeof 10n, BigInt("0x1f")].map(String).join(" "), 1n + 1n, Number(1n) + 1);',
    ['2 -2 18446744073709551616 true false bigint 31 2n 2'], 'task 1: lines 1–7 and the two fixes');
  // task 2
  await extra('console.log([new Date("2026-10-12").getHours(), new Date("2026-10-12T00:00").getHours(), new Date("2026-10-12T00:00Z").getHours(), new Date("2026-10-12T00:00+03:00").getHours(), new Date("12.10.2026").getMonth(), new Date("2026-13-01").getTime()].join(" "));',
    ['5 0 5 2 11 NaN'], 'task 2: the six answers');
  // task 3
  await extra(`const base = () => new Date(2026, 9, 12, 14, 30);
const a = base(); a.setHours(25);
const b = base(); b.setDate(0);
const c = base(); c.setMonth(12);
const e = base(); e.setFullYear(2027, 1, 29);
const f = base(); const ret = f.setDate(20);
console.log(a.getDate(), a.getHours(), a.getMinutes(), b.getMonth(), b.getDate(), c.getFullYear(), c.getMonth(), e.getFullYear(), e.getMonth(), e.getDate(), new Date(2026, 2, 0).getDate(), new Date(2028, 2, 0).getDate(), ret === f.getTime());`,
  ['13 1 30 8 30 2027 0 2027 2 1 28 29 true'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`function factorial(n) {
  let r = 1n;
  for (let i = 2n; i <= n; i++) r *= i;
  return r;
}
function factorialNumber(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
let first = 0;
for (let n = 1; n <= 30 && !first; n++) if (BigInt(factorialNumber(n)) !== factorial(BigInt(n))) first = n;
let zeros = 0;
let x = factorial(30n);
while (x % 10n === 0n) {
  zeros++;
  x /= 10n;
}
console.log(factorial(30n), String(factorial(30n)).length, first, zeros, Number(factorial(30n)));`,
  ['265252859812191058636308480000000n 33 23 7 2.6525285981219107e+32'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`${find('lecture', 'function parseRuDate(text) {').split('\nconsole.log(')[0]}
const ok = parseRuDate("12.10.2026");
console.log(ok.getMonth(), ok.getDate(), ["31.02.2026", "1.10.2026", "2026-10-12"].map(parseRuDate), new Date("12.10.2026").getMonth(), new Date("12.10.2026").getDate());`,
  ['9 12 (3) [null, null, null] 11 10'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`${find('lecture', 'function addMonths(date, n) {').split('\nconsole.log(addMonths')[0].split('\n').slice(3).join('\n')}
const fmt = (d) => \`\${d.getFullYear()}-\${d.getMonth() + 1}-\${d.getDate()}\`;
const start = new Date(2026, 0, 31);
console.log([addMonths(start, 1), addMonths(new Date(2028, 0, 31), 1), addMonths(new Date(2026, 2, 31), 1), addMonths(new Date(2026, 11, 15), 1), addMonths(new Date(2026, 4, 31), -3)].map(fmt), fmt(start));`,
  ["(5) ['2026-2-28', '2028-2-29', '2026-4-30', '2027-1-15', '2026-2-28'] 2026-1-31"], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`function lessons(start, weeks) {
  const result = [];
  const day = new Date(start);
  for (let i = 0; i < weeks * 7; i++) {
    if ([1, 3, 5].includes(day.getDay())) result.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  return result;
}
const start = new Date(2026, 9, 12);
const list = lessons(start, 12);
const utcDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const last = list.at(-1);
console.log(list.length, list.slice(0, 3).map((d) => d.getDate()), last.toDateString(), (utcDay(last) - utcDay(list[0])) / 86400000, start.getDate());`,
  ['36 (3) [12, 14, 16] Fri Jan 01 2027 81 12'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`const students = [{ id: 9007199254740993n }, { id: 9007199254740995n }];
let error = "";
try {
  JSON.stringify(students);
} catch (e) {
  error = e.message;
}
const text = JSON.stringify(students, (k, v) => (typeof v === "bigint" ? String(v) : v));
const back = JSON.parse(text, (k, v) => (k === "id" ? BigInt(v) : v));
console.log(error, text, back.every((s, i) => s.id === students[i].id), JSON.parse('{"id": 9007199254740993}').id);`,
  ['Do not know how to serialize a BigInt [{"id":"9007199254740993"},{"id":"9007199254740995"}] true 9007199254740992'], 'task 8: replacer and reviver');
  await extra('BigInt.prototype.toJSON = function () {\n  return String(this);\n};\nconsole.log(JSON.stringify([{ id: 9007199254740993n }]));', ['[{"id":"9007199254740993"}]'], 'task 8: the toJSON variant');
  // task 9
  await extra(`class Lesson {
  constructor(title, date) {
    this.title = title;
    this.date = date;
  }
  [Symbol.toPrimitive](hint) {
    return hint === "number" ? this.date.getTime() : \`\${this.title}, \${this.date.toLocaleDateString("ru-RU")}\`;
  }
}
const l1 = new Lesson("JS", new Date(2026, 9, 12));
const l2 = new Lesson("CSS", new Date(2026, 9, 14));
console.log(\`\${l1}\`, l1 + "", [l2, l1].sort((a, b) => a - b).map((l) => l.title), l1 < l2);`,
  ["JS, 12.10.2026 JS, 12.10.2026 (2) ['JS', 'CSS'] true"], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
