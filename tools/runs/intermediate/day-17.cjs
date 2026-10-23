// Course 2, day 17, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: a regex as its literal /ab+c/i, objects with the constructor's
// name in front when it is not Object, a Map and a Set with their entries; an uncaught error is "! message" (V8 text;
// the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-17.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-17.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (a bad literal stops the whole script, a bad constructor call can be caught, the other
// string methods that refuse a regex, a dash inside a class, \d is only 0-9, flags are read-only, the memory of g
// survives a new string, every error of the table, Annex B literals), the three experiments of «Карточки» and
// reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-17');
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
    return `${name === 'Array' ? '' : name}(${n}) [${a.preview.properties.map(inner).join(', ')}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  'const letters = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяүңәөҗ";': ['true', 'false true'],
  'const re2 = new RegExp("ab+c", "i");': ['/ab+c/i /ab+c/i false', 'ab+c i /ab+c/i object', '\\d+ \\d+ d+'],
  'console.log(re.test("table football"), re.test("table tennis"));': ['true false', '6 -1', 'true 0 1'],
  '"file.png".includes(/png/);': ['true true', '! First argument to String.prototype.includes must not be a regular expression'],
  'console.log(/a\\*b/.test("a*b"), /a\\*b/.test("ab"), /a*b/.test("ab"));': ['true false true', 'true true true', 'true 5 true'],
  'console.log(/[аеиоуы]/.test("шкф")': ['false true false true', 'false true true'],
  'console.log(/[а-я]/.test("ё"), /[а-яё]/.test("ё")': ['false true false true'],
  'console.log(/\\w/.test("Аман"), /\\w/.test("Aman_1"), /\\W/.test("Аман"));': ['false true true', 'true true false', 'true false true'],
  'console.log(/colou?r/.test("color")': ['true true false', 'true false true', 'false true true'],
  'console.log(/кот|кошка/.test("кошка")': ['true 4', 'true false true'],
  'const re = /мары/i;': ['true true false i gi', 'true false true'],
  'const g = /fo+/g;': ['true false true', '6 6'],
  'const isIndex = (text) =>': ['true false false', 'true false false false', 'true false false', 'true true'],
  'const cities = "Ашхабат, Мары, Дашогуз";': ['true 9', 'true false', '! Invalid regular expression: /c++/i: Nothing to repeat'],
  'console.log(Object.getOwnPropertyNames(re), RegExp(re) === re': ["(1) ['lastIndex'] true false", '\\/ (?:) /a\\/b/gi'],
  'console.log(/[A-z]/.test("_")': ['true false true false'],
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
  check(all.tasks.length === 0, `tasks: no code blocks (${all.tasks.length})`);
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

  // lecture 2: a bad literal stops the whole script before it runs; a bad constructor call can be caught
  await extra('console.log("до");\nconst r = /[9-1]/;', ['! Invalid regular expression: /[9-1]/: Range out of order in character class'], 'lecture 2 and 12: a bad literal — nothing runs');
  await extra(`console.log("до");\n${errOf('new RegExp("[9-1]")')}`, ['до', 'SyntaxError Invalid regular expression: /[9-1]/: Range out of order in character class'], 'lecture 2 and 12: a bad constructor call is caught');
  await extra('function f() {\n  return /a/;\n}\nconsole.log(f() === f(), RegExp("a").source);', ['false a'], 'lecture 2: every literal evaluation is a new object; RegExp works without new');
  // lecture 3: startsWith and endsWith refuse a regex too
  await extra(errOf('"file.png".startsWith(/f/)'), ['TypeError First argument to String.prototype.startsWith must not be a regular expression'], 'lecture 3: startsWith');
  await extra(errOf('"file.png".endsWith(/png/)'), ['TypeError First argument to String.prototype.endsWith must not be a regular expression'], 'lecture 3: endsWith');
  // lecture 5: a dash in the middle makes a range; escaped it is a dash
  await extra('console.log(/[a-z]/.test("-"), /[a\\-z]/.test("-"), /[a\\-z]/.test("b"), /[\\]]/.test("]"));', ['false true false true'], 'lecture 5: escaping inside a class');
  await extra('console.log(/[\\u0400-\\u04FF]/.test("ң"), /[\\u0400-\\u04FF]/.test("ә"), /[a-z]/.test("ý"));', ['true true false'], 'lecture 5: ң and ә are in the block; ý is not in a-z');
  // lecture 6: \d is only 0-9
  await extra('console.log(/\\d/.test("\\u0663"), /\\D/.test("\\u0663"), /\\s/.test("\\n"));', ['false true true'], 'lecture 6: \\d is ten ASCII digits; \\s takes a line break');
  // lecture 7: the lazy form is valid
  await extra('console.log(/a+?/.test("aaa"), /\\d*?/.test(""));', ['true true'], 'lecture 7: lazy quantifiers');
  // lecture 9: flags are read-only; a new object with other flags
  await extra('const re = /x/i;\nre.global = true;\nconsole.log(re.global, new RegExp(re, "gi").flags, re.flags);', ['false gi i'], 'lecture 9: flags cannot be changed, a new object can have others');
  await extra('"use strict";\nconst re = /x/i;\nre.global = true;', ['! Cannot set property global of [object Object] which has only a getter'], 'lecture 9: in strict mode');
  await extra('const r = /foo/g;\nconsole.log(r.test("barfoo"), r.test("foobar"), r.test("foobar"));', ['true false true'], 'lecture 9: the memory of g survives a new string');
  // lecture 11: includes needs no pattern
  await extra('const cities = "Ашхабат, Мары, Дашогуз";\nconsole.log(cities.toLowerCase().includes("МАРЫ".toLowerCase()), cities.toLowerCase().includes("."));', ['true false'], 'lecture 11: a plain substring search');
  // lecture 12: the table
  await extra(errOf('new RegExp("x", "gg")'), ["SyntaxError Invalid flags supplied to RegExp constructor 'gg'"], 'lecture 12: repeated flag in the constructor');
  await extra('const re = /x/gg;', ['! Invalid regular expression flags'], 'lecture 12: repeated flag in a literal');
  await extra(errOf('new RegExp("x", "b")'), ["SyntaxError Invalid flags supplied to RegExp constructor 'b'"], 'lecture 12: an unknown flag');
  await extra(errOf('new RegExp("\\\\")'), ['SyntaxError Invalid regular expression: /\\/: \\ at end of pattern'], 'lecture 12: \\ at end');
  await extra(errOf('new RegExp("*a")'), ['SyntaxError Invalid regular expression: /*a/: Nothing to repeat'], 'lecture 12: nothing to repeat');
  await extra('const re = /a{3,2}/;', ['! Invalid regular expression: /a{3,2}/: numbers out of order in {} quantifier'], 'lecture 12: numbers out of order');
  await extra('/* внешний /* внутренний */ хвост */\nconsole.log("сюда не дойдём");', ['! Invalid regular expression: missing /'], 'lecture 1 and 12: a nested comment');
  // lecture 13: \s is exactly what trim strips (WhiteSpace and LineTerminator); the six signs between Z and a
  await extra('const chars = [" ", "\\t", "\\n", "\\r", "\\u00A0", "\\u2028", "\\uFEFF", "\\u3000", "\\u200B", "\\u180E", "x"];\nconsole.log(chars.every((ch) => /\\s/.test(ch) === ((ch + "x").trim() === "x")), chars.filter((ch) => /\\s/.test(ch)).length);', ['true 8'], 'lecture 13: \\s and trim agree');
  await extra('const between = [];\nfor (let code = 91; code < 97; code++) between.push(String.fromCharCode(code));\nconsole.log(between.join(" "), between.every((ch) => /[A-z]/.test(ch)));', ['[ \\ ] ^ _ ` true'], 'lecture 5: six signs between Z and a');
  // lecture 13: Annex B literals
  await extra('console.log(/]/.test("]"), /{/.test("{"), /a{1, 3}/.source);', ['true true a{1, 3}'], 'lecture 13: Annex B keeps ] { and a{1, 3} literal');

  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'function findCards(query) {');
    const head = cards.split('\nconsole.log(findCards')[0];
    check(head !== cards, 'lecture 14: the program without its output lines');
    await extra(`${head}\nconsole.log(findCards(".").length);\ntry {\n  findCards("c++");\n} catch (e) {\n  console.log(e.message);\n}`, ['5', 'Invalid regular expression: /c++/i: Nothing to repeat'], 'lecture 14, experiment 1: "." and "c++"');
    const safe = head.replace('function findCards(query) {\n  const re = new RegExp(query, "i");\n  return cards.filter((c) => re.test(c.word) || re.test(c.translation)).map((c) => c.word);\n}', 'function findCards(query) {\n  try {\n    const re = new RegExp(query, "i");\n    return cards.filter((c) => re.test(c.word) || re.test(c.translation)).map((c) => c.word);\n  } catch {\n    return [];\n  }\n}');
    check(safe !== head, 'lecture 14, experiment 1: findCards wrapped in try...catch');
    await extra(`${safe}\nconsole.log(findCards("c++"), findCards("ea").length);`, ['(0) [] 2'], 'lecture 14, experiment 1: a bad query gives []');
    const noYo = head.replace('const NOT_RUSSIAN = /[^а-яё ]/;', 'const NOT_RUSSIAN = /[^а-я ]/;');
    check(noYo !== head, 'lecture 14, experiment 2: ё removed');
    await extra(`${noYo}\nconsole.log(checkCard("ice", "лёд"));`, ['перевод: только русские буквы и пробел'], 'lecture 14, experiment 2: лёд fails without ё');
    const withG = head.replace('const re = new RegExp(query, "i");', 'const re = new RegExp(query, "gi");');
    check(withG !== head, 'lecture 14, experiment 3: flags gi');
    await extra(`${head}\nconsole.log(findCards("a"));`, ["(3) ['teacher', 'bread', 'water']"], 'lecture 14, experiment 3: with i');
    await extra(`${withG}\nconsole.log(findCards("a"));`, ["(2) ['teacher', 'bread']"], 'lecture 14, experiment 3: with gi water is lost');
  }

  // task 1
  await extra('console.log([/кот/.test("Котлета"), /кот/i.test("Котлета"), /a.c/.test("a-c"), /a\\.c/.test("a-c"), /[0-9]{3}/.test("12-34"), /\\d+/.test(""), /\\d*/.test(""), /png|jpg/.test("jpeg")].join(" "), /[Кк]от/.test("Котлета"));',
    ['false true true false false false true false true'], 'task 1: the eight answers and the class fix');
  // task 2
  await extra('console.log("Мары 744000".search(/\\d/), "abc".search(/\\d/), "5.0".search("."), "5.0".search("\\\\."), "Аман  Мерет".search(/\\s{2}/), "hey JudE".search(/[A-Z]/));', ['5 -1 0 1 4 4'], 'task 2: 5 -1 0 1 4 4');
  // task 3
  await extra(`const vowel = /[аеёиоуыэюя]/i;
const notDigitNorSpace = /[^\\d\\s]/;
const hex = /[0-9a-f]/i;
const hex2 = /[0-9a-fA-F]/;
console.log(vowel.test("Мрт"), vowel.test("ЁЛКА"), notDigitNorSpace.test("12 34"), notDigitNorSpace.test("12a4"), hex.test("G"), hex.test("f"), hex2.test("G"), hex2.test("F"), /[а-я]/.test("ёж"));`,
  ['false true false true false true false true true'], 'task 3: the classes');
  // task 4
  await extra(`const isIndex = (text) => text.length === 6 && !/\\D/.test(text);
const isLogin = (text) => text.length >= 3 && text.length <= 16 && !/\\W/.test(text);
const isGroup = (text) => !/[^A-Z\\d-]/.test(text) && /[A-Z]{2,3}-\\d{1,2}/.test(text) && text.length <= 6;
console.log(["744000", "74400", "7440O0", " 744000"].map(isIndex).join(" "), ["aman_2010", "аман", "am"].map(isLogin).join(" "));
console.log(["JS-1", "JS-12", "J-1", "js-1", "1JS-1"].map(isGroup).join(" "));`,
  ['true false false false true false false', 'true true false false true'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`const cities = ["Ашхабат", "Мары", "Дашогуз", "Балканабат", "Туркменабат"];
function findCities(query) {
  try {
    const re = new RegExp(query, "i");
    return cities.filter((c) => re.test(c));
  } catch (e) {
    console.log(e.message);
    return [];
  }
}
const findPlain = (query) => cities.filter((c) => c.toLowerCase().includes(query.toLowerCase()));
console.log(findCities("абат").length, findCities("МАРЫ"), findCities("огуз"), findCities(".").length, findPlain(".").length, findPlain("МАРЫ"));
console.log(findCities("("));`,
  ["3 (1) ['Мары'] (1) ['Дашогуз'] 5 0 (1) ['Мары']", 'Invalid regular expression: /(/i: Unterminated group', '(0) []'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`function problems(text) {
  const found = [];
  if (/ {2}/.test(text)) found.push("два пробела");
  if (/\\t/.test(text)) found.push("табуляция");
  if (/\\u200B/.test(text)) found.push("невидимый символ");
  if (/[a-z]/i.test(text)) found.push("латинская буква");
  if (/\\d/.test(text)) found.push("цифра");
  return found;
}
console.log(problems("Гүлнар"), problems("Мерет  Ильясов"), problems("Айна\\u200B"), problems("Aман"), problems("Аман2\\tМерет"));
console.log("  Аман\\t".trim().length, "Айна\\u200B".trim().length, "Мерет  Ильясов".trim().length);`,
  ["(0) [] (1) ['два пробела'] (1) ['невидимый символ'] (1) ['латинская буква'] (2) ['табуляция', 'цифра']", '4 5 14'], 'task 6: the numbers of the criteria; what trim removes');
  // task 7
  await extra(`function positions(text, re) {
  const found = [];
  let from = 0;
  let i = text.search(re);
  while (i !== -1) {
    found.push(from + i);
    from = from + i + 1;
    i = text.slice(from).search(re);
  }
  return found;
}
console.log(positions("a1b22", /\\d/), positions("Мары 744000, Ашхабат 744000", /\\d/).length, positions("нет цифр", /\\d/));
console.log(positions("Гүлнар Аман", /[аеёиоуыэюя]/i), positions("12 345", /\\d+/));`,
  ['(3) [1, 3, 4] 12 (0) []', '(3) [4, 7, 9] (5) [0, 1, 3, 4, 5]'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`const DIGIT = /\\d/g;
const withG = ["a1", "b2", "c3"].filter((s) => DIGIT.test(s));
const noG = ["a1", "b2", "c3"].filter((s) => /\\d/.test(s));
const bySearch = ["a1", "b2", "c3"].filter((s) => s.search(DIGIT) !== -1);
const r = /foo/g;
console.log(withG, noG.length, bySearch.length, r.test("barfoo"), r.test("foobar"));`,
  ["(2) ['a1', 'c3'] 3 3 true false"], 'task 8: the numbers of the criteria');
  // task 9: the six errors and their fixes
  await extra('const r = /[z-a]/;', ['! Invalid regular expression: /[z-a]/: Range out of order in character class'], 'task 9.1');
  await extra(errOf('new RegExp("+7")'), ['SyntaxError Invalid regular expression: /+7/: Nothing to repeat'], 'task 9.2');
  await extra('const r = /\\d{5,2}/;', ['! Invalid regular expression: /\\d{5,2}/: numbers out of order in {} quantifier'], 'task 9.3');
  await extra(errOf('new RegExp("C:\\\\")'), ['SyntaxError Invalid regular expression: /C:\\/: \\ at end of pattern'], 'task 9.4');
  await extra(errOf('new RegExp("x", "gig")'), ["SyntaxError Invalid flags supplied to RegExp constructor 'gig'"], 'task 9.5');
  await extra('const r = /кот/W;', ['! Invalid regular expression flags'], 'task 9.6');
  await extra('console.log(/[a-z]/.test("q"), new RegExp("\\\\+7").test("+7 65"), /\\d{2,5}/.test("123"), new RegExp("C:\\\\\\\\").test("C:\\\\Users"), new RegExp("x", "gi").flags, /кот/i.test("КОТ"));', ['true true true true gi true'], 'task 9: the fixes work');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
