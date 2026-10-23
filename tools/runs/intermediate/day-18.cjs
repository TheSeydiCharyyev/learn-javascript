// Course 2, day 18, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: a regex as its literal, an array with its extra named
// properties after the elements — (4) ['12.10.2026', '12', '10', '2026', index: 7, input: '…', groups: undefined] —,
// objects with the constructor's name in front when it is not Object; an uncaught error is "! message" (V8 text).
//   node tools/runs/intermediate/day-18.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-18.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (anchors without m, \B, groups object without a prototype, duplicate names in
// alternatives, backward lookbehind, the lastIndex rules, the two endless loops — guarded —, lazy and the class way,
// matchAll copies the regex and steps over empty matches, a string in matchAll, the flags y and d, g against y,
// \A missing, the five errors, exec read through a property), the three experiments of «Карточки» and reference
// solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-18');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.value === 'Object') return '{…}';
  return p.value;
};
const pv = (o) => {
  if (o.type === 'string') return q(o.description);
  if (o.type === 'object' && (o.subtype === 'array' || o.subtype === 'regexp')) return o.description;
  if (o.type === 'object' && o.subtype === 'null') return 'null';
  if (o.type === 'object') return '{…}';
  return o.description;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'regexp') return a.description;
  if (a.subtype === 'map' || a.subtype === 'weakmap') {
    const entries = (a.preview.entries ?? []).map((e) => `${pv(e.key)} => ${pv(e.value)}`);
    return `${a.description} {${entries.join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  if (a.subtype === 'set' || a.subtype === 'weakset') {
    if (!a.preview.entries) return `${a.description} {<empty>}`;
    return `${a.description} {${a.preview.entries.map((e) => pv(e.value)).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
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
  'const m = /(\\d{2})\\.(\\d{2})\\.(\\d{4})/.exec("Сдача: 12.10.2026");': ["(4) ['12.10.2026', '12', '10', '2026', index: 7, input: 'Сдача: 12.10.2026', groups: undefined]", '12.10.2026 12 10 2026 7', "(2) ['744000', '744000']"],
  'const isIndex = (text) => /^\\d{6}$/.test(text);': ['(4) [true, false, false, false]', '(3) [true, false, false]', 'false true false true'],
  'console.log(/\\bcat\\b/.test("a cat!")': ['true false false', '-1 0'],
  'console.log(/(ab)+/.exec("ababab")[0]': ['ababab JPEG', 'undefined b', '1'],
  'const { day, month, year } = m.groups;': ["{day: '12', month: '10', year: '2026'} true null", '9 12/10'],
  'const parseTitle = (s) =>': ['Hello null', 'foo foo', "'"],
  'const phone = /^(?:\\d{3}|\\(\\d{3}\\))([-/.])\\d{3}\\1\\d{4}$/;': ['(4) [true, false, true, false]'],
  'console.log("100 манат и 20 тенге".match(': ['100 250 141', '(4) [true, false, true, false]'],
  'const word = (w) =>': ['true false false', 'Мы не null'],
  'const g = /fo+/g;': ['true 9 false 0 true', 'true false', 'true'],
  'const html = "<b>Аман</b> и <b>Айна</b>";': ["5 (2) ['744000', '744000'] undefined null", '<b>Аман</b> и <b>Айна</b> | <b>Аман</b>'],
  'const list = "book — книга\\nwater — вода";': ["false true (2) ['book', 'water'] (2) ['книга', 'вода']", 'false true true false'],
  're.exec = () => null;': ['false -1 {value: 0, writable: true, enumerable: false, configurable: false}'],
  'const parseIso = (s) =>': ['(3) [2026, 10, 12] null', 'true false'],
  'const parseAttr = (s) =>': ['undefined foo'],
  'const firstPart = (s) =>': ['Привет Спасибо undefined'],
  'const digits = (s) =>': ['6 0 65 true'],
  'const hi = /(hi)?/g;': ["(2) ['hi', 'hi'] 2", "(2) ['', undefined] 2", "(2) ['', undefined] 2"],
  'function createMatcher(pattern) {': ['foo foo null 0'],
  'const stringPattern = /"[^"]*"/y;': ['null 0', '"Hello world" 29', '(2) [0, 3] (2) [8, 11] undefined'],
  // tasks
  'const schedule = `пн 09:00 Математика': [],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  const runOnPage = async (scripts) => {
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
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
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 2–3: anchors without m; \B
  await extra('console.log(/^b/.test("a\\nb"), /^$/.test(""), /\\Bon/.test("at noon"), /oo\\b/.test("moon"), /\\bm/.test("moon"));', ['false true true false true'], 'lecture 2–3: ^ without m, an empty string, \\B, \\b');
  // lecture 4: nested groups are numbered by "("
  await extra('console.log(/((\\d+)-(\\d+))/.exec("12-34").slice(1));', ["(3) ['12-34', '12', '34']"], 'lecture 4: nested groups');
  // lecture 5: groups have no prototype; one name in two alternatives
  await extra('const m = /(?<n>\\d)/.exec("a1");\nconsole.log(typeof m.groups.toString, Object.keys(m.groups), /(?<a>x)|(?<a>y)/.exec("y").groups.a);', ["undefined (1) ['n'] y"], 'lecture 5: groups object; a name in two alternatives');
  // lecture 6: a backreference with i
  await extra('console.log(/(b)\\1/i.test("bB"), /(b)\\1/.test("bB"));', ['true false'], 'lecture 6: \\1 with the i flag');
  // lecture 7: a lookbehind matches right to left
  await extra('console.log(/(?<=([ab]+)([bc]+))$/.exec("abc").slice(0, 3));', ["(3) ['', 'a', 'bc']"], 'lecture 7: a lookbehind is matched backwards');
  // lecture 8: lastIndex rules; the two endless loops (guarded)
  await extra('const rg = /o/g;\nrg.lastIndex = 10;\nconsole.log(rg.exec("foo"), rg.lastIndex);', ['null 0'], 'lecture 8: lastIndex past the end gives null and 0');
  await extra('const str = "table football, foosball";\nlet n = 0;\nwhile (/fo+/g.exec(str) && n < 5) n++;\nconsole.log(n);', ['5'], 'lecture 8: a literal in the while condition never ends (stopped at 5)');
  await extra('const re = /x*/g;\nlet n = 0;\nwhile (re.exec("ab") !== null && n < 5) n++;\nconsole.log(n, re.lastIndex);', ['5 0'], 'lecture 8: an empty match does not move lastIndex (stopped at 5)');
  // lecture 9: the class way; a string becomes a pattern
  await extra('console.log("<b>Аман</b> и <b>Айна</b>".match(/<b>[^<]+<\\/b>/)[0], "123".match("1.3")[0]);', ['<b>Аман</b> 123'], 'lecture 9: [^<]+ instead of laziness; match with a string');
  // lecture 10: matchAll needs g; copies the regex; steps over empty matches
  await extra(errOf('"abc".matchAll(/./)'), ['TypeError String.prototype.matchAll called with a non-global RegExp argument'], 'lecture 10 and 12: matchAll without g');
  await extra('const regexp = /[a-c]/g;\nregexp.lastIndex = 1;\nconsole.log(Array.from("abc".matchAll(regexp), (m) => `${regexp.lastIndex} ${m[0]}`), [..."ab".matchAll(/x*/g)].map((m) => m.index));', ["(2) ['1 b', '1 c'] (3) [0, 1, 2]"], 'lecture 10 and 13: matchAll copies the regex and steps over empty matches');
  await extra('console.log(String("a".matchAll(/a/g)), Object.getPrototypeOf(Object.getPrototypeOf("a".matchAll(/a/g))) === Iterator.prototype);', ['[object RegExp String Iterator] true'], 'lecture 10: the iterator inherits Iterator.prototype');
  await extra('const re = /[a-c]/g;\nconst seen = [];\nfor (const m of "abc".matchAll(re)) {\n  re.lastIndex = 5;\n  seen.push(m[0]);\n}\nconsole.log(seen.join(""), [..."a.b".matchAll(".")].map((m) => m[0]));', ["abc (3) ['a', '.', 'b']"], 'lecture 10: lastIndex changed mid-loop does nothing; a string becomes a regex with g');
  // lecture 11: y, d, \A
  await extra('const st = /foo/y;\nst.lastIndex = 6;\nconsole.log(st.test("table football"), st.lastIndex, st.test("table football"), st.sticky);\nconst d = /(?<day>\\d{2})\\.(\\d{2})/d.exec("Дата: 12.10");\nconsole.log(d.indices[1], d.indices.groups.day, /x/d.hasIndices, /x/s.dotAll);', ['true 9 false true', '(2) [6, 8] (2) [6, 8] true true'], 'lecture 11: the flags y and d');
  await extra('const input = `const message = "Hello world";`;\nconst g = /"[^"]*"/g;\ng.lastIndex = 6;\nconst gy = /o/gy;\nconsole.log(g.exec(input).index, gy.exec("foo"), gy.lastIndex, "foo bar foo".slice(8, 11));', ['16 null 0 foo'], 'lecture 11: g goes further than y; exec with g and y is sticky; indices end like slice');
  await extra(errOf('new RegExp("\\\\Aab", "u")'), ['SyntaxError Invalid regular expression: /\\Aab/u: Invalid escape'], 'lecture 11: \\A is not in Chrome 155');
  // lecture 12: the four syntax errors; \k without named groups
  await extra(errOf('new RegExp("(?1)")'), ['SyntaxError Invalid regular expression: /(?1)/: Invalid group'], 'lecture 12: Invalid group');
  await extra(errOf('new RegExp("(?<1>x)")'), ['SyntaxError Invalid regular expression: /(?<1>x)/: Invalid capture group name'], 'lecture 12: Invalid capture group name');
  await extra(errOf('new RegExp("(?<a>x)(?<a>y)")'), ['SyntaxError Invalid regular expression: /(?<a>x)(?<a>y)/: Duplicate capture group name'], 'lecture 12: Duplicate capture group name');
  await extra(errOf('new RegExp("(?<x>a)\\\\k<y>")'), ['SyntaxError Invalid regular expression: /(?<x>a)\\k<y>/: Invalid named capture referenced'], 'lecture 12: Invalid named capture referenced');
  await extra('console.log(/\\k<x>/.test("k<x>"));', ['true'], 'lecture 12: \\k without named groups is the letter k');
  // lecture 13: without g lastIndex is neither read nor written; y fails at once
  await extra('const re = /o/;\nre.lastIndex = 5;\nconsole.log(re.exec("foo").index, re.lastIndex);\nconst y = /o/y;\nconsole.log(y.exec("foo"), y.lastIndex);', ['1 5', 'null 0'], 'lecture 13: RegExpBuiltinExec without g and with y');

  // lecture 13: indices from Match Records
  await extra('console.log(/(\\d{2})\\.(\\d{2})/d.exec("Дата: 12.10").indices[1], /(\\d{2})\\.(\\d{2})/d.exec("Дата: 12.10").indices[0]);', ['(2) [6, 8] (2) [6, 11]'], 'lecture 13: indices[1] is [6, 8]');
  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const LINE = /^(?<word>');
    const head = cards.split('\nconsole.log(cards.length')[0];
    check(head !== cards, 'lecture 14: the import without its output lines');
    const noM = head.replace(')$/gm;', ')$/g;');
    check(noM !== head, 'lecture 14, experiment 1: without m');
    await extra(`${noM}\nconsole.log(cards.length);`, ['0'], 'lecture 14, experiment 1: no cards without m');
    const twice = head.replace('water — вода (еда)`;', 'water — вода (еда)\nbook — книжка (школа)`;');
    check(twice !== head, 'lecture 14, experiment 2: book twice');
    await extra(`${twice}\nconst byWord = Map.groupBy(cards, (c) => c.word);\nconsole.log(cards.length, [...byWord].filter(([, list]) => list.length > 1).map(([w]) => w));`, ["5 (1) ['book']"], 'lecture 14, experiment 2: the repeated word');
    const hl = cards.split('\nconsole.log(highlight(')[0].replace('\nconsole.log(cards.length, cards.map((c) => c.word), cards[1]);', '');
    check(!hl.includes('console.log(cards.length'), 'lecture 14, experiment 3: the program without its output lines');
    await extra(`${hl}\nconsole.log(highlight("teacher", "e"));`, ['t[e]acher'], 'lecture 14, experiment 3: only the first e');
  }

  // task 1
  await extra('console.log([/\\d{3}/.test("12345"), /^\\d{3}$/.test("12345"), /^Мары/.test("Город Мары"), /Мары$/.test("Город Мары"), /\\bjs\\b/i.test("Курс JS-1"), /\\bкурс\\b/i.test("Курс JS-1"), /^[^0-9]/.test("1 курс"), /^$/.test("")].join(" "), /(?<![а-яё])курс(?![а-яё])/i.test("Курс JS-1"));',
    ['true false false true true false false true true'], 'task 1: the eight answers and the fix of line 6');
  // task 2
  await extra(`const m = /(\\w+)@(\\w+)\\.(\\w+)/.exec("Почта: aman@mail.tm");
console.log(m.slice(0, 4), m.index);
const { user, domain, zone } = /(?<user>\\w+)@(?<domain>\\w+)\\.(?<zone>\\w+)/.exec("Почта: aman@mail.tm").groups;
console.log(user, domain, zone, /(\\w+)@(\\w+)\\.(?:\\w+)/.exec("Почта: aman@mail.tm").length, /((\\d+)-(\\d+))/.exec("12-34").slice(1));`,
  ["(4) ['aman@mail.tm', 'aman', 'mail', 'tm'] 7", "aman mail tm 3 (3) ['12-34', '12', '34']"], 'task 2: the numbers of the criteria');
  // task 3
  await extra(`const s = "a1 b22 c333";
const re = /\\d+/g;
console.log(s.match(/\\d+/)[0], s.match(/\\d+/g), re.exec(s)[0], re.exec(s)[0], re.lastIndex);
console.log(re.exec(s)[0], re.exec(s), re.lastIndex, [...s.matchAll(/\\d+/g)].length, "abc".match(/\\d/g) ?? []);`,
  ["1 (3) ['1', '22', '333'] 1 22 6", '333 null 0 3 (0) []'], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`const RE = /^(?<day>\\d{2})(?<sep>[./])(?<month>\\d{2})\\k<sep>(?<year>\\d{4}) (?<hour>\\d{2}):(?<minute>\\d{2})$/;
function parseDateTime(text) {
  const m = RE.exec(text);
  if (!m) return null;
  const { day, month, year, hour, minute } = m.groups;
  return { day: Number(day), month: Number(month), year: Number(year), hour: Number(hour), minute: Number(minute) };
}
console.log(parseDateTime("12.10.2026 14:30"), JSON.stringify(parseDateTime("12/10/2026 14:30")) === JSON.stringify(parseDateTime("12.10.2026 14:30")));
console.log(parseDateTime("12.10.2026"), parseDateTime("1.10.2026 14:30"), parseDateTime("12/10.2026 14:30"));
const t = parseDateTime("12.10.2026 14:30");
console.log(new Date(t.year, t.month - 1, t.day, t.hour, t.minute).getHours(), typeof RE.exec("12.10.2026 14:30").groups.hour);`,
  ['{day: 12, month: 10, year: 2026, hour: 14, minute: 30} true', 'null null null', '14 string'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`const post = "Сдали #экзамен! Спасибо @aman и @meret_2010. Пишите aman@mail.tm #Экзамен #JS #js #каникулы";
const tags = post.match(/#[\\wа-яё]+/gi);
console.log(tags.length, new Set(tags.map((t) => t.toLowerCase())).size, post.match(/(?<![\\w.])@\\w+/g), post.match(/@\\w+/g).length);
console.log([...post.matchAll(/#[\\wа-яё]+/gi)].map((m) => m.index));`,
  ["5 3 (2) ['@aman', '@meret_2010'] 3", '(5) [6, 65, 74, 78, 82]'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`const text = "Мы мы пошли в в школу. The the end. Кот котлета.";
const repeats = [...text.matchAll(/(?<![а-яёa-z])([а-яёa-z]+)\\s+\\1(?![а-яёa-z])/gi)];
console.log(repeats.map((m) => m[1]), repeats.map((m) => m.index), [...text.matchAll(/\\b(\\w+)\\s+\\1\\b/gi)].map((m) => m[1]));`,
  ["(3) ['Мы', 'в', 'The'] (3) [0, 12, 23] (1) ['The']"], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`${find('tasks', 'const schedule = `пн 09:00 Математика')}
const LESSON = /^(?<day>пн|вт|ср|чт|пт) (?<time>(?:[01]\\d|2[0-3]):[0-5]\\d) (?<subject>.+)$/gm;
const lessons = [...schedule.matchAll(LESSON)].map((m) => ({ ...m.groups }));
const byDay = Map.groupBy(lessons, (l) => l.day);
const noM = [...schedule.matchAll(/^(?<day>пн|вт|ср|чт|пт) (?<time>(?:[01]\\d|2[0-3]):[0-5]\\d) (?<subject>.+)$/g)].length;
const noHours = [...schedule.matchAll(/^(?<day>пн|вт|ср|чт|пт) (?<time>\\d{2}:\\d{2}) (?<subject>.+)$/gm)].map((m) => m.groups.subject);
console.log(lessons.length, byDay.get("пн").length, byDay.get("ср").length, noM, noHours);`,
  ["3 2 1 0 (4) ['Математика', 'Физика', 'JS', 'История']"], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`function allMatches(text, re) {
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const found = [];
  let m;
  while ((m = copy.exec(text)) !== null) {
    found.push(m);
    if (m[0] === "") copy.lastIndex++;
  }
  return found;
}
const re = /\\d+/g;
const mine = allMatches("a1 b22 c333", re).map((m) => \`\${m[0]}@\${m.index}\`);
const theirs = [..."a1 b22 c333".matchAll(/\\d+/g)].map((m) => \`\${m[0]}@\${m.index}\`);
console.log(mine, JSON.stringify(mine) === JSON.stringify(theirs), re.lastIndex);
console.log(allMatches("ab", /x*/g).map((m) => m.index), [..."ab".matchAll(/x*/g)].map((m) => m.index), allMatches("a1b2", /\\d/).length);`,
  ["(3) ['1@1', '22@4', '333@8'] true 0", '(3) [0, 1, 2] (3) [0, 1, 2] 2'], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`const isStrong = (p) => /^(?!\\d)(?!.*\\s)(?=.*\\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(p);
const plain = (p) => p.length >= 8 && /\\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && !/\\s/.test(p) && !/^\\d/.test(p);
const list = ["Aman2010x", "Aman 2010x", "2Amanxxxx", "AMAN2010X", "Aman201"];
console.log(list.map(isStrong), JSON.stringify(list.map(isStrong)) === JSON.stringify(list.map(plain)), /^(?=\\d)/.test("a1"), /^(?=.*\\d)/.test("a1"));`,
  ['(5) [true, false, false, false, false] true false true'], 'task 9: the numbers of the criteria; why .* is needed');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
