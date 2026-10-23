// Course 2, day 19, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: a regex as its literal, an array with its extra named
// properties after the elements, objects with the constructor's name in front when it is not Object; an uncaught
// error is "! message" (V8 text).
//   node tools/runs/intermediate/day-19.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-19.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose ($& with a string pattern, two-digit groups, the hasOwn guard, a trailing separator,
// escape of \n, Symbol.match = false, search makes no copy, split copies with y, the error texts, RegExp's own
// properties), the three experiments of «Карточки», the lines of the notes and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-19');
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
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'regexp') return a.description;
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
  'console.log(Number("4,5".replace(",", "."))': ['4.5 1.5,7 1.5.7', "сухой лёд и вода | (4) ['сухой', 'лёд', 'и', 'вода']", '20 16'],
  'const str = "Twas the night before Xmas...";': ['Twas the night before Christmas... | Twas the night before Xmas...', 'oranges are round, and oranges are juicy.', 'a-b.c ----- a-b-c _xxx'],
  'const one = /\\d/;': ['a#b# 0', 'a#b2 3'],
  'console.log("aabbcc".replaceAll("b", ".")': ['aa..cc a-b-c aa..cc _x_x_x_', '! String.prototype.replaceAll called with a non-global RegExp argument'],
  'console.log("foo".replace(/(f)/, "$2")': ['$2oo $1oo oo', 'f0oo $<x>oo Сумма $0'],
  'function replacer(match, p1, p2, p3, offset, string) {': ['abc - 12345 - #$*%', 'Сумма: $& a5b aundefined'],
  'function styleHyphenFormat(propertyName) {': ['border-top border-top border-Top'],
  'function f2c(text) {': ['Вода кипит при 100C, а замерзает при 0C -17.77777777777778C'],
  'function fill(template, data) {': ['Здравствуйте, Аман! Оценка: 5. {unknown}', 'Цена: $&100 | Цена: {price}100 | {b}1'],
  'function addOffset(match, ...args) {': ['abc (1) d | abc (abcd) d', 'abc (1) d | abc (1) d', '["12.10","12","10",0,"12.10",{"d":"12","m":"10"}]'],
  'const months = "Jan,Feb,': ["12 (3) ['Jan', 'Feb', 'Mar'] (2) ['Аман', 'Мерет'] Аман, Мерет", "(1) ['Oh brave new world'] (3) ['', 'a', ''] (3) ['a', 'b', 'c'] (1) [''] (0) []", "(0) [] (3) ['a', 'b', 'c'] (1) ['a,b'] (2) ['a', 'b']"],
  'console.log("Аман, Мерет;Гүлнар ; Сапар".split(': ["(4) ['Аман', 'Мерет', 'Гүлнар', 'Сапар']", "(3) ['строка 1', 'строка 2', 'строка 3'] (5) ['', 'a', 'b', 'c', ''] (3) ['a', 'b', 'c']", "(6) ['Harry Trump', 'Fred Barney', 'Helen Rigby', 'Bill Abel', 'Chris Hand', '']"],
  'console.log("Аман,Мерет;Гүлнар".split(/[,;]/)': ["(3) ['Аман', 'Мерет', 'Гүлнар'] (5) ['Аман', ',', 'Мерет', ';', 'Гүлнар']", "(5) ['Hello ', '1', ' word. Sentence number ', '2', '.'] (2) ['a', '1'] (3) ['a', undefined, 'b']", "(2) ['a', 'b'] (2) ['', 'b'] (2) ['a', 'b'] (2) ['a', 'b']"],
  'const safe = RegExp.escape("c++");': ['\\x63\\+\\+ true \\x35\\.0 false', '\\(a\\) \\x66oo\\x2dbar \\x61\\x20b Мары \\$100'],
  'console.log(new RegExp("(a)\\\\1" + "1")': ['false true'],
  'function superSafeRedactName(text, name) {': ['A h[REDACTED]r called [REDACTED] breached the system. | A hacker called [REDACTED] breached the system.'],
  'const phones = [': ["(4) ['+993 65 123456', '+993 65 123456', '+993 65 123456', '+993 65 123456']", '**** **** **** 3456 a***@mail.tm'],
  'console.log(/-/g[Symbol.replace]': ["2016.01.01 (3) ['a', 'b', 'c'] (3) ['2016', '01', '02'] 4", "(3) ['Аман', 'Мерет', 'Гүлнар']", "(3) ['(2016)', '(01)', '(02)'] a+b"],
  'const sticky = /a/y;': ["(5) ['baa 1', 'aba 2', 'aab 3', 'aaa 0', 'baa 1'] bb-a"],
  'console.log("abc".replace("b")': ["aundefinedc aundefinedc null (1) ['a,b']"],
  'console.log(Object.prototype.toString.call(RegExp.prototype)': ['[object Object] (?:) undefined', 'giy', '5 true'],
  // tasks
  'const list = "Аман, Мерет;': [],
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
  const head = (code) => code.split('\nconsole.log(')[0];
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 3: with a global regex replaceAll is replace
  await extra('console.log("a1b2".replaceAll(/\\d/g, (m, off) => off), "a1b2".replace(/\\d/g, (m, off) => off));', ['a1b3 a1b3'], 'lecture 3: replaceAll with g = replace');
  // lecture 4: $& $` $\' $$ work with a string pattern; two digits only when the group exists
  await extra('console.log("a-b".replace("-", "[$&|$`|$\'|$$]"), "abcdefghijk".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)/, "$10|$11|$01"));', ['a[-|a|b|$]b j|k|a'], 'lecture 4: $ patterns with a string; $10, $11, $01');
  // lecture 5: hasOwn keeps {toString} out; the lecture fill knows no spaces in braces
  await extra(`${head(find('lecture', 'function fill(template, data) {'))}\nconsole.log(fill("{toString}", {}), fill("{ name }", { name: "А" }));`, ['{toString} { name }'], 'lecture 5: Object.hasOwn guards {toString}');
  // lecture 8: the last empty piece comes from the trailing space
  await extra('console.log("a ;b".split(/\\s*(?:;|$)\\s*/), "a ;b ".split(/\\s*(?:;|$)\\s*/));', ["(2) ['a', 'b'] (3) ['a', 'b', '']"], 'lecture 8: a trailing separator gives the last empty piece');
  // lecture 9: \n has its own escape; letters other than ASCII stay
  await extra('console.log(RegExp.escape("x\\ny") === "\\\\x78\\\\ny", RegExp.escape("Мары 5"));', ['true Мары\\x205'], 'lecture 9: escape of \\n and of a space');
  // lecture 11: Symbol.match decides what a regex is; search makes no copy
  await extra(errOf('"x/a/".includes(/a/)'), ['TypeError First argument to String.prototype.includes must not be a regular expression'], 'lecture 11: the error of day 17');
  await extra('const re = /a/;\nre[Symbol.match] = false;\nconsole.log("x/a/".includes(re), "/a/b".startsWith(re));', ['true true'], 'lecture 11: Symbol.match = false');
  await extra(`${head(find('lecture', 'class Loud extends RegExp {'))}\n"a-b".search(loud);\nconsole.log("search done");`, ['search done'], 'lecture 11: search makes no copy');
  // lecture 12: the four error texts and null.replace
  await extra(errOf('RegExp.escape(5)'), ['TypeError input argument must be a string'], 'lecture 12: RegExp.escape(5)');
  await extra(errOf('String.prototype.replace.call(null, "a", "b")'), ['TypeError String.prototype.replace called on null or undefined'], 'lecture 12: replace on null');
  await extra(errOf('RegExp.prototype[Symbol.replace].call("x", "a", "b")'), ['TypeError Method RegExp.prototype.@@replace called on incompatible receiver x'], 'lecture 12: Symbol.replace on a string');
  await extra(errOf('null.replace("a", "b")'), ["TypeError Cannot read properties of null (reading 'replace')"], 'lecture 12: null.replace');
  // lecture 13: RegExp.prototype attributes, the legacy statics, the species getter; split copies with y
  await extra('const d = Object.getOwnPropertyDescriptor(RegExp, "prototype");\nconsole.log(d.writable, d.enumerable, d.configurable, "$1" in RegExp, "lastMatch" in RegExp, Object.getOwnPropertyDescriptor(RegExp, Symbol.species).get.call(5));', ['false false false true true 5'], 'lecture 13: 22.2.5 in Chrome');
  await extra('console.log("a.b".search("."), "a.b".match(".")[0], [..."a.b".matchAll(".")].length, "a.b".split("."), "a.b".replace(".", "-"), "a.b".replaceAll(".", "-"));', ["0 a 3 (2) ['a', 'b'] a-b a-b"], 'lecture 13, scheme 3: a string is literal for replace and split, a pattern for match and search');
  await extra('class Spy extends RegExp {\n  constructor(...args) {\n    super(...args);\n    console.log(this.flags);\n  }\n}\n"a-b".split(new Spy("-", "g"));', ['g', 'gy'], 'lecture 13: split builds a copy with y');
  // lecture 14: the three experiments of «Карточки»; \u200B is not white space
  {
    const cards = find('lecture', 'const tidy = (s) =>');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 14: the program without its output lines');
    const noEscape = top.replace('new RegExp(RegExp.escape(tidy(query)), "i")', 'new RegExp(tidy(query), "i")');
    check(noEscape !== top, 'lecture 14, experiment 1: without RegExp.escape');
    await extra(`${noEscape}\nconsole.log(findCards("."));\nfindCards("c++");`, ["(5) ['book', 'teacher', 'bread', 'water', 'house']", '! Invalid regular expression: /c++/i: Nothing to repeat'], 'lecture 14, experiment 1: day 17 is back');
    const ownCase = top.replace('"[$&]"', '`[${query}]`');
    check(ownCase !== top, 'lecture 14, experiment 2: the query instead of $&');
    await extra(`${ownCase}\nconsole.log(highlight("teacher", "EA"));`, ['t[EA]cher'], 'lecture 14, experiment 2: the case of the query');
    const oneLine = top.replace('text.split(/\\n+/)', 'text.split("\\n")');
    check(oneLine !== top, 'lecture 14, experiment 3: split by one line break');
    await extra(oneLine, ["! Cannot read properties of undefined (reading 'replace')"], 'lecture 14, experiment 3: the empty line breaks tidy');
    await extra('console.log("\\u200B".trim().length, /\\s/.test("\\u200B"));', ['1 false'], 'lecture 14: \\u200B is not white space');
  }
  // self-check 4
  await extra('console.log("a1b2".split(/\\d/), "a1b2".split(/(\\d)/), "a-b-c".replace("-", "+"));', ["(3) ['a', 'b', ''] (5) ['a', '1', 'b', '2', ''] a+b-c"], 'lecture, self-check 1 and 4');
  // notes: the comments of the main block and the split table
  await extra('console.log("a-b-c".replace("-", "+"), "a-b-c".replace(/-/g, "+"), "a-b-c".replaceAll("-", "+"), "12.10.2026".replace(/(\\d+)\\.(\\d+)\\.(\\d+)/, "$3-$2-$1"), "Аман, Мерет;Гүлнар".split(/\\s*[,;]\\s*/), new RegExp(RegExp.escape("c++"), "i").test("C++"));',
    ["a+b-c a+b+c a+b+c 2026-10-12 (3) ['Аман', 'Мерет', 'Гүлнар'] true"], 'notes: the main block');
  await extra('console.log("a,b".split(","), ",a,".split(","), "abc".split(""), "a1b2".split(/(\\d)/), "a,b,c".split(",", 2), "".split(","), "".split(""), RegExp.escape("c++"));',
    ["(2) ['a', 'b'] (3) ['', 'a', ''] (3) ['a', 'b', 'c'] (5) ['a', '1', 'b', '2', ''] (2) ['a', 'b'] (1) [''] (0) [] \\x63\\+\\+"], 'notes: the split table and the escape of c++');

  // task 1
  await extra('console.log(["a-b-c".replace("-", "+"), "a-b-c".replace(/-/g, "+"), "a-b-c".replaceAll("-", "+"), "a.b.c".replace(/./g, "-"), "Мары".replace("", "г. "), "abc".replace("b", "[$&]"), "abc".replace("b", "[$1]")].join(" | "), "a.b.c".replace(/\\./g, "-"), "a-b-c".replaceAll(/-/g, "+"));',
    ['a+b-c | a+b+c | a+b+c | ----- | г. Мары | a[b]c | a[$1]c a-b-c a+b+c'], 'task 1: lines 1–7 and the fixes');
  await extra(errOf('"a-b-c".replaceAll(/-/, "+")'), ['TypeError String.prototype.replaceAll called with a non-global RegExp argument'], 'task 1: line 8');
  // task 2
  await extra('console.log("Мерет Аманова".replace(/^(\\S)\\S* (\\S+)$/, "$2 $1."), "2026-10-12".replace(/(\\d{4})-(\\d{2})-(\\d{2})/, "$3.$2.$1"), "2026-10-12".replace(/(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/, "$<day>.$<month>.$<year>"), "Цена: 100".replace(/\\d+/, "$$$&"), "100".replace(/\\d+/, "$$&"));',
    ['Аманова М. 12.10.2026 12.10.2026 Цена: $100 $&'], 'task 2: the numbers of the criteria');
  // task 3
  await extra('const s = "a, b,,c";\nconsole.log(s.split(","), s.split(/,\\s*/), s.split(/,+\\s*/));\nconsole.log(s.split(/(,)/), s.split(",", 2), "".split(","));',
    ["(4) ['a', ' b', '', 'c'] (4) ['a', 'b', '', 'c'] (3) ['a', 'b', 'c']", "(7) ['a', ',', ' b', ',', '', ',', 'c'] (2) ['a', ' b'] (1) ['']"], 'task 3: the six answers');
  // task 4
  await extra(`function normalPhone(text) {
  const m = /^(?:993|8)?(\\d{2})(\\d{6})$/.exec(text.replace(/\\D/g, ""));
  return m ? \`+993 \${m[1]} \${m[2]}\` : null;
}
const phones = ["+993 65 12-34-56", "8 (65) 123456", "993-65-123456", "65 12 34 56", "12345", "+7 916 123 45 67"];
console.log(phones.map(normalPhone), phones.map(normalPhone).filter(Boolean).length);`,
  ["(6) ['+993 65 123456', '+993 65 123456', '+993 65 123456', '+993 65 123456', null, null] 4"], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`const maskCard = (s) => s.replace(/\\d(?=.*\\d{4}$)/g, "*");
const maskPhone = (s) => s.replace(/\\d{4}(?=\\d{2}$)/, "****");
const maskEmail = (s) => s.replace(/^(.)([^@]*)/, (m, first, rest) => first + "*".repeat(rest.length));
console.log(maskCard("1234 5678 9012 3456"), maskPhone("+993 65 123456"), maskEmail("aman@mail.tm"), maskEmail("meret_2010@mail.tm"));`,
  ['**** **** **** 3456 +993 65 ****56 a***@mail.tm m*********@mail.tm'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`function fill(template, data) {
  return template.replace(/\\{\\s*(\\w+)\\s*\\}/g, (whole, key) => (Object.hasOwn(data, key) ? data[key] : whole));
}
console.log(fill("Здравствуйте, {name}! Оценка: {mark}.", { name: "Аман", mark: 5 }), "|", fill("{unknown} {toString}", {}), "|", fill("{ name }", { name: "Аман" }), "|", fill("{p}", { p: "$&" }), "|", "{p}".replace(/\\{p\\}/, "$&"));`,
  ['Здравствуйте, Аман! Оценка: 5. | {unknown} {toString} | Аман | $& | {p}'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`${find('tasks', 'const list = "Аман, Мерет;')}
const parts = list.split(/\\s*[,;\\n]\\s*/);
const names = list.split(/\\s*[,;\\n]+\\s*/);
console.log(parts.length, parts.indexOf(""), names.length, new Set(names).size, list.split(/\\s*[,;\\n]+\\s*/, 3));`,
  ["8 4 7 6 (3) ['Аман', 'Мерет', 'Гүлнар']"], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`function highlightAll(text, query) {
  if (query === "") return text;
  return text.replace(new RegExp(RegExp.escape(query), "gi"), "[$&]");
}
const text = "Курс C++ и c++, оценка 5.0, не 540; (А) и (а)";
console.log(highlightAll(text, "c++"));
console.log(highlightAll(text, "5.0"), "|", highlightAll(text, "(а)"), "|", highlightAll(text, "") === text);
console.log(text.replace(new RegExp("5.0", "gi"), "[$&]"), "|", "ab".replace(new RegExp("", "gi"), "[$&]"));`,
  ['Курс [C++] и [c++], оценка 5.0, не 540; (А) и (а)', 'Курс C++ и c++, оценка [5.0], не 540; (А) и (а) | Курс C++ и c++, оценка 5.0, не 540; [(А)] и [(а)] | true', 'Курс C++ и c++, оценка [5.0], не [540]; (А) и (а) | []a[]b[]'], 'task 8: the numbers of the criteria');
  await extra(errOf('new RegExp("c++", "gi")'), ['SyntaxError Invalid regular expression: /c++/gi: Nothing to repeat'], 'task 8: c++ without escape');
  // task 9
  await extra(`const viaJoin = (text, search, repl) => text.split(search).join(repl);
console.log(viaJoin("a-b-c", "-", "+"), "a-b-c".replaceAll("-", "+"), viaJoin("a-b-c", "-", "[$&]"), "a-b-c".replaceAll("-", "[$&]"));
console.log(viaJoin("xxx", "", "_"), "xxx".replaceAll("", "_"), viaJoin("a-b", "-", () => "+"));`,
  ['a+b+c a+b+c a[$&]b[$&]c a[-]b[-]c', 'x_x_x _x_x_x_ a() => "+"b'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
