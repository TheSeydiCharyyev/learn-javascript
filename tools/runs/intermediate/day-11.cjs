// Course 2, day 11, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object, a subclass of Array with its name too, a symbol as Symbol(description), also as a key inside an object
// preview ({name: 'Аман', Symbol(id): 7}); an uncaught error is "! message" (V8 text; the prefix that Playwright adds
// to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-11.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-11.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (symbol conversions, who sees a symbol key, the registry across two scripts, well-known symbols, iterable iterators,
// arguments and NodeList, return(), the broken-protocol texts, the cached next), the three experiments of «Карточки»
// and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-11');
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
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
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
const TO_STRING = '! Cannot convert a Symbol value to a string';

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'typeof list[Symbol.iterator]);': ['function function undefined', '! list is not iterable'],
  'const other = Symbol("id");': ['symbol false true', 'Symbol(id) id undefined', '42 string'],
  'const id = new Symbol("id");': ['! Symbol is not a constructor'],
  'console.log("ключ: " + id);': ['Symbol(id) Symbol(id) id', 'true object', TO_STRING],
  'student.id = "A-7";': ["7 A-7 {name: 'Аман', id: 'A-7', Symbol(id): 7}"],
  'const clubId = Symbol("id");': ["101 K-7 (1) ['name']"],
  'console.log(Object.keys(student), seen, JSON.stringify(student));': ["(1) ['name'] (1) ['name'] {\"name\":\"Аман\"}", "(1) ['name'] (1) [Symbol(id)]", '7 7 true true'],
  'const lesson = { b: 1, [second]: 2': ["(4) ['2', '10', 'b', 'a'] (2) [Symbol(второй), Symbol(первый)]"],
  'const again = Symbol.for("cards.learned");': ['true false cards.learned', 'cards.learned undefined'],
  'console.log(Symbol.iterator === Symbol.for("Symbol.iterator"));': ['symbol Symbol.iterator undefined', 'false'],
  'class Even {': ['true false', 'function'],
  'const marks = [5, 4];': ['{value: 5, done: false}', '{value: 4, done: false}', '{value: undefined, done: true}', '{value: undefined, done: true}'],
  'let step = iterator.next();': ['5', '4', '3'],
  'const arrayIteratorProto = Object.getPrototypeOf(iterator);': ['Array Iterator {} [object Array Iterator]', "(1) ['next']"],
  'const marks = [5, , 3];': ["(2) ['0', '2'] (3) [0, 1, 2] (3) [5, undefined, 3]"],
  'words[1] = "tea";': ['book', 'tea', 'bread house true', 'true'],
  'const arrayLike = { length: 2, 0: "a", 1: "b" };': ["(2) ['a', 'b'] (2) ['a', 'b']", '! arrayLike is not iterable'],
  'const city = "Мары";': ["{value: 'М', done: false} (4) ['М', 'а', 'р', 'ы']", '2 1'],
  'show("a", "b");': ['true true', 'перебор: a', 'перебор: b'],
  'function isIterable(value) {': ['true true false false false'],
  'return 5;': ['! Iterator result 5 is not an object'],
  'console.log("взяли итератор");': ['взяли итератор', '5', '4', '3'],
  // tasks
  'const c = Symbol.for("урок");': ['false true false true', 'Symbol(урок) symbol undefined урок', 'Symbol(урок) 4'],
  'Object.defineProperty(lesson, "room"': ["(1) ['title'] (1) ['title'] {\"title\":\"Итераторы\"}", "(2) ['title', 'room'] (1) [Symbol(secret)]", '42 undefined true true'],
  'const k = ["a", "b"].keys();': ['{value: Array(2), done: false}', "(2) [1, 'b']", '{value: undefined, done: true}', 'true', '(2) [0, 1] (0) []'],
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
      if (blk.example) continue;
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }

  // every EXPECT key is used by exactly one block, so a key cannot silently match the wrong block
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };

  // lecture 2–3: conversions, ==, the description getter in both modes
  await extra('const id = Symbol("id");\nconsole.log(Symbol("").description === "", Boolean(id), id == "Symbol(id)");\nconsole.log(`${id}`);', ['true true false', TO_STRING], 'lecture 3: a template converts implicitly');
  await extra('const id = Symbol("id");\nconsole.log(+id);', ['! Cannot convert a Symbol value to a number'], 'lecture 3: +id');
  await extra('const id = Symbol("id");\nconsole.log(id * 2);', ['! Cannot convert a Symbol value to a number'], 'lecture 3: id * 2');
  await extra('const id = Symbol("id");\nid.description = "x";\nconst d = Object.getOwnPropertyDescriptor(Symbol.prototype, "description");\nconsole.log(id.description, typeof d.get, d.set, Object.getPrototypeOf(id) === Symbol.prototype);\nconsole.log(Object.getOwnPropertyNames(Symbol.prototype));',
    ['id function undefined true', "(4) ['constructor', 'toString', 'valueOf', 'description']"], 'lecture 3: description is a getter of Symbol.prototype');
  await extra('"use strict";\nconst id = Symbol("id");\nid.description = "x";', ['! Cannot set property description of [object Symbol] which has only a getter'], 'lecture 3: the strict-mode text');
  // lecture 4: only enumerable symbol keys are copied
  await extra('const id = Symbol("id");\nconst o = {};\nObject.defineProperty(o, id, { value: 7 });\nconsole.log({ ...o }[id], Object.assign({}, o)[id], Object.getOwnPropertySymbols(o), Object.getOwnPropertySymbols({}));',
    ['undefined undefined (1) [Symbol(id)] (0) []'], 'lecture 4: a non-enumerable symbol key is not copied');
  await extra('const MARK = Symbol("mark");\nclass Card {\n  #mark = 1;\n  _mark = 2;\n}\nconst c = new Card();\nc[MARK] = 3;\nconst copy = { ...c };\nconsole.log(Object.keys(copy), copy[MARK], JSON.stringify(c));',
    ["(1) ['_mark'] 3 {\"_mark\":2}"], 'lecture 4: _mark, [MARK] and #mark against keys, spread and JSON');
  // lecture 5: keyFor needs a symbol; the registry is shared by two scripts, a local symbol is not
  await extra('Symbol.keyFor("cards.learned");', ['! cards.learned is not a symbol'], 'lecture 5: keyFor of a string');
  await extra(['const firstMark = Symbol.for("cards.learned");\nwindow.card = { word: "book", [firstMark]: true };', 'console.log(card[Symbol.for("cards.learned")]);'], ['true'], 'lecture 5: Symbol.for finds the mark of another script');
  await extra(['window.card = { word: "book", [Symbol("cards.learned")]: true };', 'console.log(card[Symbol("cards.learned")]);'], ['undefined'], 'lecture 5: Symbol() in another script is another symbol');
  // lecture 6: Symbol.iterator is read-only, Chrome knows 15 well-known symbols, Function.prototype has hasInstance
  await extra('const d = Object.getOwnPropertyDescriptor(Symbol, "iterator");\nconst wellKnown = Object.getOwnPropertyNames(Symbol).filter((k) => typeof Symbol[k] === "symbol");\nconsole.log(d.writable, d.configurable, wellKnown.length, wellKnown.includes("dispose"), wellKnown.includes("asyncDispose"), Object.hasOwn(Function.prototype, Symbol.hasInstance));',
    ['false false 15 true true true'], 'lecture 6: read-only, 13 + 2 well-known symbols');
  // lecture 8: the arrow-function trap
  await extra('const range = {\n  from: 1,\n  to: 4,\n  [Symbol.iterator]: () => {\n    let current = this.from;\n    const last = this.to;\n    return { next() { return current <= last ? { value: current++, done: false } : { value: undefined, done: true }; } };\n  },\n};\nconsole.log([...range]);', ['(0) []'], 'lecture 8: an arrow function takes this from outside');
  // lecture 9: the iterator of range is not iterable until it returns this; Iterator.prototype returns this
  {
    const range = find('lecture', 'const range = {').split('\nfor (const n of range)')[0];
    await extra(`${range}\nconst it = range[Symbol.iterator]();\nfor (const n of it) {}`, ['! it is not iterable'], 'lecture 9: the iterator of range is not iterable');
    await extra(`${range}\nfor (const n of range[Symbol.iterator]()) {}`, ['! range[Symbol.iterator] is not a function or its return value is not iterable'], 'lecture 9: V8 names a call on the right of of differently');
    await extra(`${range.replace('    return {\n      next() {', '    return {\n      [Symbol.iterator]() {\n        return this;\n      },\n      next() {')}\nconst it = range[Symbol.iterator]();\nit.next();\nconsole.log([...it]);`, ['(3) [2, 3, 4]'], 'lecture 9: with [Symbol.iterator]() { return this; } it is');
  }
  await extra('const it = [5][Symbol.iterator]();\nconst p2 = Object.getPrototypeOf(Object.getPrototypeOf(it));\nconsole.log(Object.hasOwn(p2, Symbol.iterator), p2[Symbol.iterator].call(it) === it, Object.getPrototypeOf(p2) === Object.prototype);', ['true true true'], 'lecture 9: Iterator.prototype[Symbol.iterator] returns this');
  // lecture 10: Array.from of a plain object, the growing array (guarded)
  await extra('console.log(Array.from({ name: "Аман" }));\nconst arr = [1, 2, 3];\nlet steps = 0;\nfor (const x of arr) {\n  steps++;\n  if (steps < 50) arr.push(x);\n}\nconsole.log(steps, arr.length);', ['(0) []', '52 52'], 'lecture 10: Array.from({}) is empty; push inside for...of keeps the loop going');
  // lecture 11: half of a surrogate pair, arguments in strict mode, NodeList and HTMLCollection
  await extra('console.log("😀"[0].length, "😀"[0] === "😀", [..."😀"][0] === "😀");', ['1 false true'], 'lecture 11: "😀"[0] is a half');
  await extra('"use strict";\nfunction show() {\n  return Object.hasOwn(arguments, Symbol.iterator) && arguments[Symbol.iterator] === Array.prototype.values;\n}\nconsole.log(show(1));', ['true'], 'lecture 11: strict arguments too (10.4.4.6)');
  await extra('document.body.innerHTML = "<li>a</li><li>b</li>";\nconst items = document.querySelectorAll("li");\nconsole.log(Object.hasOwn(NodeList.prototype, Symbol.iterator), items[Symbol.iterator] === Array.prototype.values, [...document.getElementsByTagName("li")].length);',
    ['true true 2'], 'lecture 11: NodeList uses Array.prototype.values; HTMLCollection is iterable');
  // lecture 12: return() on a return from a function and on an error in the body
  {
    const lessons = find('lecture', 'const lessons = {').split('\nconst [lesson] = lessons;')[0];
    await extra(`${lessons}\nfunction firstOf(it) {\n  for (const x of it) {\n    return x;\n  }\n}\nconsole.log(firstOf(lessons));`, ['next 1', 'return: перебор бросили', '1'], 'lecture 12: return from a function closes the iterator');
    await extra(`${lessons}\ntry {\n  for (const x of lessons) {\n    throw new Error("ошибка в теле");\n  }\n} catch (e) {\n  console.log(e.message);\n}`, ['next 1', 'return: перебор бросили', 'ошибка в теле'], 'lecture 12: an error in the body closes the iterator');
  }
  // lecture 13: the table of the broken protocol, all TypeError
  await extra('const broken = { [Symbol.iterator]: 1 };\nfor (const x of broken) {}', ['! broken is not iterable'], 'lecture 13: [Symbol.iterator] is not a function');
  await extra('const broken = {};\nconsole.log(Math.max(...broken));', ['! Spread syntax requires ...iterable[Symbol.iterator] to be a function'], 'lecture 13: spread in a call');
  await extra('const broken = { [Symbol.iterator]() { return 1; } };\nfor (const x of broken) {}', ['! Result of the Symbol.iterator method is not an object'], 'lecture 13: returned a non-object');
  await extra('const broken = { [Symbol.iterator]() { return {}; } };\nfor (const x of broken) {}', ['! undefined is not a function'], 'lecture 13: no next in for...of');
  await extra('const broken = { [Symbol.iterator]() { return {}; } };\nconsole.log([...broken]);', ['! broken is not iterable'], 'lecture 13: no next in spread');
  await extra('const broken = { [Symbol.iterator]() { return { next() { return { value: 1, done: false }; }, return() { return 5; } }; } };\nfor (const x of broken) {\n  break;\n}', ['! Iterator result 5 is not an object'], 'lecture 13: return() returned a non-object');
  await extra('const names = [];\nfor (const make of [() => ({}), () => ({ [Symbol.iterator]: 1 }), () => ({ [Symbol.iterator]() { return 1; } }), () => ({ [Symbol.iterator]() { return { next() { return 5; } }; } })]) {\n  try {\n    for (const x of make()) {}\n  } catch (e) {\n    names.push(e.name);\n  }\n}\nconsole.log(names.join(" "));', ['TypeError TypeError TypeError TypeError'], 'lecture 13: all four are TypeError');
  // lecture 14: no done means false; value may be absent when done
  await extra('const r = { [Symbol.iterator]() { let i = 0; return { next() { return i < 2 ? { value: i++ } : { done: true }; } }; } };\nconsole.log([...r]);', ['(2) [0, 1]'], 'lecture 14: a result without done counts as done: false');

  // lecture 15, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const LEARNED = Symbol("learned");');
    const renamed = cards.replace('  [Symbol.iterator]() {\n    const cards', '  iterator() {\n    const cards');
    check(renamed !== cards, 'lecture 15, experiment 1: the method renamed');
    await extra(renamed, ['! deck is not iterable'], 'lecture 15, experiment 1: the first for...of fails');
    const stringKey = cards.replace('card[LEARNED] = true;', 'card.learned = true;').replace('cards[index][LEARNED]', 'cards[index].learned');
    check(stringKey !== cards, 'lecture 15, experiment 2: the key replaced');
    const out2 = await runOnPage([stringKey]);
    check(out2[4] === '{"word":"teacher","translation":"учитель","topic":"школа","learned":true} 4 undefined' && out2[5] === '(0) [] (0) []' && out2.length === 7,
      `lecture 15, experiment 2: lines 5 and 6 change: ${JSON.stringify(out2.slice(4, 6))}`);
    const done = cards.replace('return { value: undefined, done: true };', 'return { value: "конец", done: true };');
    check(done !== cards, 'lecture 15, experiment 3: the last result replaced');
    const out1 = await runOnPage([cards]);
    const out3 = await runOnPage([done]);
    check(same(out3, out1), 'lecture 15, experiment 3: for...of does not print the value of done: true');
  }

  // task 1: a symbol added to a string
  await extra('const a = Symbol("урок");\nconsole.log(String(a), a.description);\nconsole.log("урок: " + a);', ['Symbol(урок) урок', TO_STRING], 'task 1: string + symbol');
  // task 2: one call that finds 42 without the variable
  await extra(`${find('tasks', 'Object.defineProperty(lesson, "room"')}\nconsole.log(lesson[Object.getOwnPropertySymbols(lesson)[0]]);`,
    ["(1) ['title'] (1) ['title'] {\"title\":\"Итераторы\"}", "(2) ['title', 'room'] (1) [Symbol(secret)]", '42 undefined true true', '42'], 'task 2: 42 through getOwnPropertySymbols');
  // task 3: values and [Symbol.iterator]; two fresh iterators
  await extra('const it = ["a", "b"].values();\nconsole.log(it.next(), it.next().value);\nconsole.log([...["a", "b"].keys()], [...["a", "b"].keys()]);', ["{value: 'a', done: false} b", '(2) [0, 1] (2) [0, 1]'], 'task 3: values; a new iterator each time');
  // task 4: range with a step
  await extra(`function range(from, to, step = 1) {
  return {
    [Symbol.iterator]() {
      let current = from;
      return {
        next() {
          if (step > 0 ? current <= to : current >= to) {
            const value = current;
            current += step;
            return { value, done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}
const r = range(1, 10, 3);
console.log([...r], [...r], [...range(5, 1, -2)], [...range(3, 1)], Math.max(...range(1, 5)));
const [a, b] = range(10, 20, 5);
console.log(a, b);`, ['(4) [1, 4, 7, 10] (4) [1, 4, 7, 10] (3) [5, 3, 1] (0) [] 5', '10 15'], 'task 4: the numbers of the criteria');
  // task 5: Stack from the top; ReadOnlyWords by delegation; no "top" as a name (a property of window)
  await extra(`class Stack {
  #items = [];
  push(x) { this.#items.push(x); return this; }
  pop() { return this.#items.pop(); }
  peek() { return this.#items.at(-1); }
  get size() { return this.#items.length; }
  [Symbol.iterator]() {
    const items = this.#items;
    let index = items.length - 1;
    return {
      next() {
        return index >= 0 ? { value: items[index--], done: false } : { value: undefined, done: true };
      },
    };
  }
}
const stack = new Stack();
stack.push("a");
stack.push("b");
stack.push("c");
for (const x of stack) console.log(x);
console.log([...stack], stack.size, Object.keys(stack));
class ReadOnlyWords {
  #items;
  constructor(items) { this.#items = [...items]; }
  [Symbol.iterator]() { return this.#items[Symbol.iterator](); }
}
console.log([...new ReadOnlyWords(["book", "water"])]);`, ['c', 'b', 'a', "(3) ['c', 'b', 'a'] 3 (0) []", "(2) ['book', 'water']"], 'task 5: from the top; delegation for ReadOnlyWords');
  // task 6: a symbol mark against _visited
  await extra(`const VISITED = Symbol("visited");
const students = JSON.parse('[{"name":"Аман"},{"name":"Мерет"},{"name":"Айна"}]');
const before = JSON.stringify(students);
students[0][VISITED] = true;
students[2][VISITED] = true;
console.log(JSON.stringify(students) === before, Object.keys(students[0]), students.filter((s) => s[VISITED]).length);
students[1]._visited = true;
console.log(JSON.stringify(students[1]));`, ["true (1) ['name'] 2", '{"name":"Мерет","_visited":true}'], 'task 6: JSON stays, _visited shows');
  // task 7: forOf by hand
  await extra(`function forOf(iterable, callback) {
  const method = iterable?.[Symbol.iterator];
  if (typeof method !== "function") {
    throw new TypeError("значение не перебирается");
  }
  const iterator = method.call(iterable);
  const next = iterator.next;
  let step = next.call(iterator);
  while (!step.done) {
    if (callback(step.value) === false) {
      iterator.return?.();
      return;
    }
    step = next.call(iterator);
  }
}
const out = [];
forOf([1, 2, 3], (x) => out.push(x));
forOf("ab", (x) => out.push(x));
(function () { forOf(arguments, (x) => out.push(x)); })("x", "y");
console.log(out.join(" "));
for (const bad of [{}, null]) {
  try { forOf(bad, () => {}); } catch (e) { console.log(e.name, e.message); }
}
const obj = { [Symbol.iterator]() { let i = 0; return { next() { i++; return { value: i, done: i > 3 }; }, return() { console.log("return"); return { done: true }; } }; } };
forOf(obj, (x) => { console.log(x); return x < 2; });`, ['1 2 3 a b x y', 'TypeError значение не перебирается', 'TypeError значение не перебирается', '1', '2', 'return'], 'task 7: forOf, its errors and return()');
  // task 8: an endless iterable iterator
  await extra(`function idMaker() {
  let id = 0;
  return {
    next() { return { value: id++, done: false }; },
    [Symbol.iterator]() { return this; },
  };
}
function firstN(iterable, n) {
  const result = [];
  if (n <= 0) return result;
  for (const value of iterable) {
    result.push(value);
    if (result.length === n) break;
  }
  return result;
}
const ids = idMaker();
console.log(firstN(ids, 3), firstN(ids, 2), firstN(idMaker(), 0), firstN([7, 8], 5));
const plain = { next: idMaker().next };
try { firstN(plain, 1); } catch (e) { console.log(e.message); }`, ['(3) [0, 1, 2] (2) [3, 4] (0) [] (2) [7, 8]', 'iterable is not iterable'], 'task 8: firstN and an iterator that is not iterable');
  // task 9: seven cases of return(); next is called 4 times for [a, b, c, d]; the value of done: true is not printed
  {
    const obj = 'const obj = { [Symbol.iterator]() { let i = 0; return { next() { i++; log.push("n"); return i <= 3 ? { value: i, done: false } : { value: 99, done: true }; }, return() { log.push("R"); return { done: true }; } }; } };\n';
    await extra(`const log = [];
${obj}const rows = [];
const run = (name, fn) => { log.length = 0; try { fn(); } catch (e) {} rows.push(\`\${name}:\${log.join("")}\`); };
run("full", () => { for (const x of obj) {} });
run("break", () => { for (const x of obj) break; });
run("return", () => (function () { for (const x of obj) return x; })());
run("throw", () => { for (const x of obj) throw new Error("x"); });
run("[a]", () => { const [a] = obj; });
run("[a,b,c,d]", () => { const [a, b, c, d] = obj; });
run("spread", () => [...obj]);
console.log(rows.join(" "));
const printed = [];
for (const x of obj) printed.push(x);
console.log(printed);`, ['full:nnnn break:nR return:nR throw:nR [a]:nR [a,b,c,d]:nnnn spread:nnnn', '(3) [1, 2, 3]'], 'task 9: when return() is called');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
