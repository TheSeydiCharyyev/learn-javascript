// Course 2, day 6, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it (objects too: {x: 10}, a descriptor {value: 4, …}, -0 as -0);
// an uncaught error is "! message" (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script
// is cut off).
//   node tools/runs/intermediate/day-06.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-06.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (errors named in the text, sealed arrays, the integrity checks, names, parentheses), the three experiments of
// «Карточки» and reference solutions of tasks 1–9 against the numbers and lines their criteria give.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-06');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
// a value inside a preview, as DevTools prints it in a collapsed object or array
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.preview) {
    return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');

const D = (value, w, e, c) => `{value: ${value}, writable: ${w}, enumerable: ${e}, configurable: ${c}}`;
const UNARY = '! Unary operator used immediately before exponentiation expression. Parenthesis must be used to disambiguate operator precedence';

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'quiz.positon = 1;': ['! Cannot add property positon, object is not extensible'],
  'console.log(card, Object.isExtensible(card));': ["{word: 'lesson'} false"],
  '// TypeError: Cannot add property level': ['! Cannot add property level, object is not extensible'],
  'console.log(student, Object.isSealed(student));': ["{name: 'Аман', mark: 4} true", D(4, true, true, false)],
  'console.log(settings.theme, Object.isFrozen(settings));': ['тёмная true'],
  'topics[0] = "спорт";': ["(3) ['школа', 'еда', 'дом']", "(3) ['ШКОЛА', 'ЕДА', 'ДОМ']", '! Cannot add property 3, object is not extensible'],
  'marks.pop();': ['(3) [2, 4, 3]', "! Cannot delete property '2' of [object Array]"],
  'console.log(Object.isFrozen(Object.preventExtensions({})));': ['true', 'true 5'],
  'settings.topics.push("дом");': ["(3) ['школа', 'еда', 'дом'] false"],
  'const settings = deepFreeze({ theme: "светлая", topics: ["школа", "еда"] });': ['true'],
  'console.log(NaN === NaN, Object.is(NaN, NaN));': ['false true', 'true false', 'false false'],
  'console.log([] == false, [1] == 1, null == 0);': ['true true false'],
  'console.log(nums.includes(NaN), nums.indexOf(NaN));': ['true -1', 'true 2'],
  'console.log(square(4), square(4), calls);': ['16 16 1'],
  'console.log(card + 1, card * 2, `${card}`, card == 42);': ['43 84 карточка true'],
  'console.log(Math.round(-0.4), 0 * -5, -0 + 0);': ['-0 -0 0', '-Infinity', '0 0'],
  'Object.defineProperty(o, "x", { value: -0 });': ['! Cannot redefine property: x'],
  'quiz.total ||= 10;': ['чтение', 'чтение, чтение, запись 5'],
  'settings.timer ||= 10;': ["! Cannot assign to read only property 'timer' of object '#<Object>'"],
  'options.level ??= 1;': ["{timer: 0, title: 'Карточки', level: 1, theme: 'светлая'}"],
  'student.group &&= student.group.trim();': ["{name: 'Аман', group: ''}"],
  'const level = null ?? 1 || 2;': ["! Unexpected token '||'"],
  'console.log(toStr.call([1, 2]), toStr.call(null), toStr.call(() => 1));': ['[object Object] 1,2', '[object Array] [object Null] [object Function]'],
  'console.log(card.valueOf() === card);': ['карточка book карточка book', 'true'],
  'console.log(typeof Object(5), Object(5) + 1);': ['object 6', '{} true'],
  // tasks
  'for (const obj of [a, b, c]) {': ['{x: 10} {x: 10, y: 2} {x: 1, y: 2}', 'false true true'],
  'const pairs = [': ['false false true true', 'true true false true', 'true false false false', 'true false false false', 'false false false false'],
  'd &&= d.toUpperCase();': ['5 "" Дашогуз МАРЫ'],
  'const power = -3 ** 2;': [UNARY],
  'const city = "" ?? null || "Мары";': ["! Unexpected token '||'"],
  'limits: { perDay: 20, perSession: 5 },': [],
  '{"name": "  Аман ", "group": "1-А", "marks": [5, 4]},': [],
  'console.log(aman.group.students[0].group.title);': ['1-А'],
  'const counter = makeCounter();': ['2 true'],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // runs scripts one after another on one fresh page; returns console lines and errors
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
        example: !!pre.closest('.example'),
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const out = await runOnPage([blk.code]);
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}${blk.example ? ' (example)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) continue; // examples use the student's own code — checked below with reference solutions
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text) => {
    const out = await runOnPage([code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };

  // lecture, prose claims
  await extra('const copy = { ...Object.freeze({ a: 1 }) };\ncopy.b = 2;\nconsole.log(Object.isFrozen(copy), Object.isExtensible(copy), copy.b);',
    ['false true 2'], 'lecture 2: a spread copy of a frozen object is an ordinary one');
  await extra('const card = Object.preventExtensions({ word: "book" });\nObject.defineProperty(card, "level", { value: 2 });',
    ['! Cannot define property level, object is not extensible'], 'lecture 3: defineProperty on a non-extensible object, sloppy mode');
  await extra('"use strict";\nconst student = Object.seal({ name: "Аман", mark: 5 });\ndelete student.name;',
    ["! Cannot delete property 'name' of #<Object>"], 'lecture 4: delete in a sealed object, strict mode');
  await extra('const topics = Object.freeze(["школа", "еда", "дом"]);\nconsole.log(topics.filter((t) => t !== "еда"), topics.toSorted());',
    ["(2) ['школа', 'дом'] (3) ['дом', 'еда', 'школа']"], 'lecture 6: filter and toSorted work on a frozen array');
  await extra('const marks = Object.seal([5, 4, 3]);\nmarks.length = 1;\nconsole.log(marks.length);',
    ['3'], 'lecture 6: length = 1 on a sealed array is lost in sloppy mode');
  await extra('"use strict";\nconst marks = Object.seal([5, 4, 3]);\nmarks.length = 1;',
    ["! Failed to set the 'length' property on 'Array': Cannot delete property '2' of [object Array]"], 'lecture 6: length = 1 on a sealed array, strict mode');
  await extra('const o = { x: 1 };\nObject.defineProperty(o, "x", { writable: false, configurable: false });\nconsole.log(Object.isFrozen(o), Object.isSealed(Object.preventExtensions({})));',
    ['false true'], 'lecture 7: read-only but extensible is not frozen; an empty non-extensible object is sealed');
  await extra('let handler;\nhandler ||= function () {};\nconst b = 1;\nlet a;\na ||= b ?? 2;\nconsole.log(handler.name, a);',
    ['handler 1'], 'lecture 11, 12: the function gets the name; ?? on the right of ||= needs no parentheses');
  await extra('console.log(JSON.stringify(String([])), document.all == null, typeof document.all, document.all ? "истинный" : "ложный");',
    ['"" true undefined ложный'], 'lecture 9: String([]) is empty; document.all pretends to be empty');
  {
    const code = find('lecture', 'return (cache[key] ??= fn.call(this, key));');
    await extra(`${code}\nlet quiet = 0;\nconst noReturn = memo(() => { quiet = quiet + 1; });\nnoReturn(1);\nnoReturn(1);\nnoReturn(1);\nconsole.log(quiet);`,
      ['16 16 1', '3'], 'lecture 12: memo with ??= calls a function that returns undefined every time');
  }
  await extra('const start = new Date(2026, 9, 1);\nconst end = new Date(2026, 9, 11);\nconsole.log((end - start) / (1000 * 60 * 60 * 24), end - start === end.getTime() - start.getTime(), `${{}}`);',
    ['10 true [object Object]'], 'lecture 13: dates subtract through valueOf; an object in a template');
  await extra('const level = null || 1 ?? 2;', ["! Unexpected token '??'"], 'lecture 12: the reverse order of || and ??');
  await extra('const t = typeof 2 ** 2;', [UNARY], 'lecture 12: typeof on the left of **');
  await extra('console.log(Object(undefined), (-2) ** 2, -(2 ** 2));', ['{} 4 -4'], 'lecture 12, 13: Object(undefined), both parentheses of -2 ** 2');

  // lecture 14, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const DEFAULTS = deepFreeze({');
    const orTimer = cards.replace('settings.timer ??= DEFAULTS.timer;', 'settings.timer ||= DEFAULTS.timer;');
    check(orTimer !== cards, 'lecture 14, experiment 1: the timer line found');
    const out1 = await runOnPage([orTimer]);
    check(out1[0] === "{timer: 10, topic: 'все', theme: 'светлая'}", `lecture 14, experiment 1: ||= replaces the zero: ${out1[0]}`);

    const shallow = cards.replace('const DEFAULTS = deepFreeze({', 'const DEFAULTS = Object.freeze({');
    const out2 = await runOnPage([shallow]);
    check(same(out2, ["{timer: 0, topic: 'все', theme: 'светлая'}", 'настройки: Cannot add property thme, object is not extensible', 'тёмная true false']),
      `lecture 14, experiment 2: the defaults line is gone, the last one changed: ${JSON.stringify(out2)}`);

    const sloppy = cards.replace('"use strict";\n', '');
    check(sloppy !== cards, 'lecture 14, experiment 3: the directive found');
    const out3 = await runOnPage([sloppy]);
    check(same(out3, ["{timer: 0, topic: 'все', theme: 'светлая'}", 'умолчания: Cannot add property 4, object is not extensible', 'тёмная true true']),
      `lecture 14, experiment 3: the typo is silent, push still throws: ${JSON.stringify(out3)}`);
  }

  // notes: the comments of the logical assignment block
  {
    const code = find('student', 'options.title ||= "Карточки";');
    const out = await runOnPage([`${code}\nconsole.log(JSON.stringify(options));`]);
    check(same(out, ['{"timer":0,"title":"Карточки","name":"Аман"}']), `notes: the logical assignments: ${JSON.stringify(out)}`);
  }

  // task 1: the first failing line in strict mode, and a after the loop
  {
    const code = find('tasks', 'for (const obj of [a, b, c]) {');
    await extra(`"use strict";\n${code}`, ['! Cannot add property z, object is not extensible'], 'task 1, strict mode: a fails at obj.z = 3');
    await extra(`${code}\nconsole.log(Object.isSealed(a));`, ['{x: 10} {x: 10, y: 2} {x: 1, y: 2}', 'false true true', 'false'], 'task 1: a is not sealed after the loop');
  }
  // task 3: both ways of the parentheses
  await extra('console.log((-3) ** 2, -(3 ** 2), JSON.stringify(("" ?? null) || "Мары"), JSON.stringify("" ?? (null || "Мары")));',
    ['9 -9 "Мары" ""'], 'task 3: both fixes of both lines give different results');
  // task 4: freeze, then deepFreeze
  {
    const config = find('tasks', 'limits: { perDay: 20, perSession: 5 },');
    const tries = `
const errors = [];
for (const write of [() => { config.title = "Слова"; }, () => { config.limits.perDay = 50; }, () => { config.topics.push("спорт"); }]) {
  try {
    write();
    errors.push("ok");
  } catch (error) {
    errors.push(error.message);
  }
}
console.log(errors.join(" | "));
console.log(config.limits.perDay, config.topics.length, Object.isFrozen(config), Object.isFrozen(config.limits), Object.isFrozen(config.topics));`;
    await extra(`"use strict";\n${config}\nObject.freeze(config);${tries}`,
      ["Cannot assign to read only property 'title' of object '#<Object>' | ok | ok", '50 4 true false false'], 'task 4: after freeze');
    const deep = 'function deepFreeze(obj) {\n  Object.freeze(obj);\n  for (const value of Object.values(obj)) {\n    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {\n      deepFreeze(value);\n    }\n  }\n  return obj;\n}';
    await extra(`"use strict";\n${deep}\n${config}\ndeepFreeze(config);${tries}`,
      ["Cannot assign to read only property 'title' of object '#<Object>' | Cannot assign to read only property 'perDay' of object '#<Object>' | Cannot add property 3, object is not extensible", '20 3 true true true'], 'task 4: after deepFreeze');
  }
  // task 5: own seal and freeze match the built-in ones; writable: false on a getter turns it into undefined
  await extra(`function mySeal(obj) {
  Object.preventExtensions(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    Object.defineProperty(obj, key, { configurable: false });
  }
  return obj;
}
function myFreeze(obj) {
  Object.preventExtensions(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    Object.defineProperty(obj, key, "value" in desc ? { configurable: false, writable: false } : { configurable: false });
  }
  return obj;
}
function naiveFreeze(obj) {
  Object.preventExtensions(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    Object.defineProperty(obj, key, { configurable: false, writable: false });
  }
  return obj;
}
const same = (x, y) => JSON.stringify(Object.getOwnPropertyDescriptors(x)) === JSON.stringify(Object.getOwnPropertyDescriptors(y));
console.log(same(mySeal({ a: 1, b: 2 }), Object.seal({ a: 1, b: 2 })), Object.isSealed(mySeal({ a: 1 })));
console.log(same(myFreeze({ a: 1, b: 2 }), Object.freeze({ a: 1, b: 2 })), Object.isFrozen(myFreeze({ a: 1 })));
const withGetter = () => ({ get g() { return 7; } });
console.log(myFreeze(withGetter()).g, Object.freeze(withGetter()).g, naiveFreeze(withGetter()).g);`,
  ['true true', 'true true', '7 7 undefined'], 'task 5: own seal/freeze; the naive freeze turns the getter into undefined');
  // task 6: the JSON of the criteria with a reference loop
  {
    const code = find('tasks', '{"name": "  Аман ", "group": "1-А", "marks": [5, 4]},');
    const said = (await (async () => {
      const p = await ctx.newPage();
      await p.goto('file:///' + path.join(DAY, 'tasks.html').replace(/\\/g, '/'));
      const t = await p.evaluate(() => [...document.querySelectorAll('.criteria code')].map((c) => c.textContent).find((s) => s.startsWith('[{"name"')));
      await p.close();
      return t;
    })());
    await extra(`${code}
for (const s of students) {
  s.name &&= s.name.trim();
  s.name ||= "без имени";
  s.group ??= "1-А";
  s.marks ??= [];
}
console.log(JSON.stringify(students) === ${JSON.stringify(said)});`, ['true'], 'task 6: the JSON of the criteria');
  }
  // task 7: the numbers of the criteria and the others of the table
  await extra(`function findAll(list, value, same) {
  const found = [];
  list.forEach((item, i) => {
    if (same(item, value)) found.push(i);
  });
  return found;
}
function sameValueZero(x, y) {
  return Object.is(x, y) || (x === 0 && y === 0);
}
const values = [0, -0, NaN, "0", null, undefined, NaN];
const ways = [(x, y) => x == y, (x, y) => x === y, Object.is, sameValueZero];
for (const value of [0, NaN, undefined]) {
  console.log(ways.map((same) => JSON.stringify(findAll(values, value, same))).join(" "));
}
console.log(values.every((x) => values.every((y) => sameValueZero(x, y) === [x].includes(y))));`,
  ['[0,1,3] [0,1] [0] [0,1]', '[] [] [2,6] [2,6]', '[4,5] [5] [5] [5]', 'true'], 'task 7: ==, ===, Object.is, sameValueZero for 0, NaN, undefined');
  // task 8: without the check — the stack overflows; with it — all three frozen; a pre-frozen parent is skipped
  {
    const code = find('tasks', 'console.log(aman.group.students[0].group.title);');
    const naive = 'function deepFreeze(obj) {\n  Object.freeze(obj);\n  for (const value of Object.values(obj)) {\n    if (typeof value === "object" && value !== null) {\n      deepFreeze(value);\n    }\n  }\n  return obj;\n}';
    await extra(`${code}\n${naive}\ndeepFreeze(group);`, ['1-А', '! Maximum call stack size exceeded'], 'task 8: without the check');
    const checked2 = naive.replace('value !== null)', 'value !== null && !Object.isFrozen(value))');
    await extra(`${code}\n${checked2}\ndeepFreeze(group);\nconsole.log(Object.isFrozen(group), Object.isFrozen(group.students), Object.isFrozen(aman));\nconst pre = Object.freeze({ list: [] });\ndeepFreeze({ pre });\nconsole.log(Object.isFrozen(pre.list));`,
      ['1-А', 'true true true', 'false'], 'task 8: with the check; a parent frozen beforehand is skipped');
  }
  // task 9: two different strict-mode errors
  {
    const code = find('tasks', 'const counter = makeCounter();');
    await extra(`"use strict";\n${code}\ncounter.value = 10;`, ['2 true', '! Cannot set property value of #<Object> which has only a getter'], 'task 9: writing the getter');
    await extra(`"use strict";\n${code}\ncounter.increment = null;`, ['2 true', "! Cannot assign to read only property 'increment' of object '#<Object>'"], 'task 9: replacing the method');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
