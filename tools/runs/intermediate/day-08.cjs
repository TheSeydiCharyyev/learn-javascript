// Course 2, day 8, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects too, with the constructor's name in front when it is
// not Object (Student {name: 'Аман'}); an uncaught error is "! message" (V8 text; the prefix that Playwright adds to
// a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-08.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-08.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (class versus constructor function, fields, names, the errors named in the text), the three experiments of
// «Карточки» and reference solutions of tasks 1–9 against the lines their criteria give.
// Note: Chrome's preview of an object with more than five properties ends with "…", so such objects are printed
// with Object.keys in the text.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-08');
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
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');
const ARGS = "! 'arguments' is not allowed in class field initializer or static initialization block";
const LENGTH = "! Cannot read properties of undefined (reading 'length')";

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'const meret = new Student("Мерет", [4, 4]);': ['4.666666666666667 4', 'true', "Student {name: 'Аман', marks: Array(3)}"],
  'console.log(typeof Student);': ['function', 'true', 'true true', "(2) ['constructor', 'greet']"],
  'console.log(new Student("Аман"), new Student());': ["Student {name: 'Аман'} Student {name: 'без имени'}"],
  'console.log(Object.keys(Student.prototype), Object.keys(aman));': ['4.666666666666667 Салам, Аман!', "(0) [] (2) ['name', 'marks']", 'for...in: name', 'for...in: marks'],
  'console.log(card.topic, water.topic);   // все еда': ['все еда'],
  'food.count();': ["! Cannot read properties of undefined (reading 'name')"],
  'console.log(`${a}`, a === b, a.equals(b), a.equals({ word: "book" }));': ['book — книга false true false'],
  'aman.mark = 4;': ["4 (2) ['name', '_mark']", 'RangeError: оценка 7 не принята'],
  'const deck = new Deck().add("book").add("water").add("bread").remove("water");': ["(2) ['book', 'bread']"],
  'console.log(a.students, b.students, a.students === b.students);': ["(1) ['Аман'] (0) [] false", "(3) ['title', 'students', 'note'] undefined"],
  'console.log("конструктор видит second =", this.second);': ['поле 1', 'поле 2', 'конструктор видит second = 2'],
  'const next = quiz.next;   // метод без объекта': ["! Cannot read properties of undefined (reading 'position')"],
  'console.log(next(), next(), quiz.position);': ['1 2 2', "false (2) ['position', 'next']"],
  "// TypeError: Class constructor Student": ["! Class constructor Student cannot be invoked without 'new'"],
  'console.log(Rect.name, Named.name, new Named().who(), typeof Inner);': ['Rect Inner Inner undefined'],
  'const card = new Card("book");': ["! Cannot access 'Card' before initialization"],
  'console.log(counter.add(), JSON.stringify(ByTen.name));': ['20 ""'],
  'args = arguments;': [ARGS],
  'Student.prototype = { greet() {} };': ["! Cannot assign to read only property 'prototype' of function 'class Student {}'"],
  // tasks
  'console.log(group.count(), Object.keys(Group.prototype));': ["1 (2) ['add', 'count']"],
  'console.log(short.describe());': ['урок на 45 минут, на деле 45', 'урок на 45 минут, на деле 90', "(2) ['minutes', 'title']", 'minutes', 'title'],
  'constructor(ms) {}': ['! A class may only have one constructor'],
  'const timer = new Timer();': ["! Cannot access 'Timer' before initialization"],
  'class Timer {}\nTimer();': ["! Class constructor Timer cannot be invoked without 'new'"],
  'started = arguments.length;': [ARGS],
  'const basket = new Basket(["book", "pen"]);': [LENGTH],
  'total = this.items.length;': [LENGTH],
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

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };

  // lecture, prose claims
  await extra('class Empty {}\nclass A {\n  m() { return 1; }\n  m() { return 2; }\n}\nclass Maker {\n  constructor() {\n    this.a = 1;\n    return { b: 2 };\n  }\n}\nconsole.log(new Empty(), new A().m(), new Maker());',
    ['Empty {} 2 {b: 2}'], 'lecture 3: no constructor, a repeated method, a returned object');
  {
    const code = find('lecture', 'console.log(card.topic, water.topic);   // все еда');
    await extra(`${code}\nnew Card();`, ['все еда', "! Cannot destructure property 'word' of 'undefined' as it is undefined."], 'lecture 3: new Card() without an argument');
    await extra(code.replace('constructor({ word, translation, topic = "все" })', 'constructor({ word, translation, topic = "все" } = {})') + '\nconsole.log(new Card().topic);', ['все еда', 'все'], 'lecture 3: a default for the whole parameter');
  }
  await extra('function Student(name) {\n  this.name = name;\n}\nStudent.prototype.greet = function () {};\nfor (const key in new Student("Аман")) {\n  console.log(key);\n}',
    ['name', 'greet'], 'lecture 4: a method added by assignment shows in for...in');
  await extra('class Card {\n  word = "book";\n  [`level${2}`] = "B";\n  constructor(word) {\n    this.word = word;\n  }\n}\nconst c = new Card("water");\nconsole.log(c.word, c.level2, Object.getOwnPropertyDescriptor(c, "word").enumerable);',
    ['water B true'], 'lecture 5: the constructor wins over a field; a computed field name; a field is enumerable');
  await extra(`${find('lecture', 'aman.mark = 4;').split('\nconst aman')[0].replace('class Student {\n', 'class Student {\n  mark = 7;\n')}\nconst s = new Student("Сапар", 9);\ns.mark = 10;\nconsole.log(s.mark, Object.keys(s));`,
    ["10 (2) ['mark', 'name']"], 'lecture 5: a field with the setter name bypasses the check');
  await extra(`${find('lecture', 'aman.mark = 4;').split('\ntry {')[0]}\nconsole.log(JSON.stringify(aman));`,
    ["4 (2) ['name', '_mark']", '{"name":"Аман","_mark":4}'], 'lecture 4: a class getter is not in JSON');
  {
    const topic = find('lecture', 'food.count();');
    await extra(topic.replace('food.count();', 'console.log(food.count());').replace('this.words.filter(function (w) {\n      return w.topic === this.name;\n    })', 'this.words.filter((w) => w.topic === this.name)'),
      ['1'], 'lecture 6: the arrow callback fixes count');
    await extra('function Topic(name, words) {\n  this.name = name;\n  this.words = words;\n}\nTopic.prototype.count = function () {\n  return this.words.filter(function (w) {\n    return w.topic === this.name;\n  }).length;\n};\nconsole.log(new Topic("еда", [{ topic: "еда" }, { topic: "дом" }]).count());',
      ['0'], 'lecture 6: a constructor function reads window.name and answers 0');
  }
  await extra('const day = Temporal.PlainDate.from("2026-10-18");\nconst next = day.add({ days: 1 });\nconsole.log(String(day), String(next), day === next);\nconst date = new Date(2026, 9, 18);\nconst same = date;\nsame.setDate(19);\nconsole.log(date.getDate());',
    ['2026-10-18 2026-10-19 false', '19'], 'lecture 12: Temporal returns a new object, a Date is changed for every reference');
  await extra(['class Card {}\nconsole.log(typeof globalThis.Card);', 'console.log(typeof Card);'],
    ['undefined', 'function'], 'lecture 9: a class is not in globalThis but the next script sees it');
  await extra('class C {\n  f = () => arguments;\n}', [ARGS], 'lecture 10: an arrow function in a field does not help');
  await extra('class C {\n  f = function () {\n    return arguments.length;\n  };\n}\nconsole.log(new C().f(1, 2));', ['2'], 'lecture 10: an ordinary function in a field has its own arguments');
  await extra('function makeOne() {\n  class C {\n    args = arguments.length;\n  }\n  return new C();\n}', [ARGS], 'lecture 10: even inside an ordinary function');
  await extra('class Student {}\nStudent.prototype = { greet() {} };\nconsole.log(typeof Student.prototype.greet);', ['undefined'], 'lecture 11: sloppy mode — the write is lost');
  await extra('console.log(greet(), typeof globalThis.greet);\nfunction greet() {\n  return "салам";\n}', ['салам function'], 'lecture 11: a function declaration works before its line and is in globalThis');
  await extra('let calls = 0;\nconst key = () => {\n  calls = calls + 1;\n  return "k";\n};\nclass D {\n  [key()] = 1;\n}\nnew D();\nnew D();\nconsole.log(calls, new D().k);', ['1 1'], 'lecture 12: a computed key runs once');
  await extra('class C {\n  [C.name]() {}\n}', ["! Cannot access 'C' before initialization"], 'lecture 12: the class name inside a computed key');

  // lecture 13, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'button.addEventListener("click", card.handleFlip);');
    const plain = cards.replace('button.addEventListener("click", card.handleFlip);', 'button.addEventListener("click", card.flip);');
    const out1 = await runOnPage([plain]);
    check(out1[0] === '! this.text is not a function' && out1[1] === '! this.text is not a function', `lecture 13, experiment 1: ${JSON.stringify(out1.slice(0, 2))}`);
    const assign = cards.replace(/const restored = new Card\(saved\.id, saved\.word, saved\.translation, saved\.topic\);\nrestored\.flipped = saved\.flipped;/, 'const restored = Object.assign(Object.create(Card.prototype), saved);');
    check(assign !== cards, 'lecture 13, experiment 2: the restore lines found');
    const out2 = await runOnPage([assign]);
    check(out2[out2.length - 1] === 'true bread undefined', `lecture 13, experiment 2: ${out2[out2.length - 1]}`);
    const title = cards.replace('  flipped = false;\n', '  flipped = false;\n  title = this.word.toUpperCase();\n');
    const out3 = await runOnPage([title]);
    check(out3[0] === "! Cannot read properties of undefined (reading 'toUpperCase')", `lecture 13, experiment 3: ${out3[0]}`);
  }

  // notes: the comment of the last line
  await extra(`${find('student', 'card.handleFlip();')}\nconsole.log(card.flipped, card.text(), card.label, Object.keys(card));`,
    ["true хлеб карточка bread (4) ['flipped', 'handleFlip', 'word', 'translation']"], 'notes: handleFlip flips the card');

  // task 1: the class version
  await extra(`class Group {
  students = [];
  constructor(title) {
    this.title = title;
  }
  add(name, marks) {
    this.students.push({ name, marks });
  }
  count() {
    return this.students.length;
  }
}
const group = new Group("1-А");
group.add("Аман", [5, 4]);
console.log(group.count(), Object.keys(Group.prototype), group instanceof Group, group.constructor === Group);`,
  ['1 (0) [] true true'], 'task 1: the class prints 1 []');
  // task 2: a title that follows the minutes
  await extra(find('tasks', 'console.log(short.describe());').replace('  title = `урок на ${this.minutes} минут`;\n', '').replace('  describe() {', '  get title() {\n    return `урок на ${this.minutes} минут`;\n  }\n\n  describe() {'),
    ['урок на 45 минут, на деле 45', 'урок на 90 минут, на деле 90', "(1) ['minutes']", 'minutes'], 'task 2: title as a getter');
  // task 3: a function declaration instead of the class
  await extra('const timer = new Timer();\nfunction Timer() {}\nconsole.log(timer instanceof Timer);', ['true'], 'task 3: a function declaration works before its line');
  // task 4: a reference WordCounter
  await extra(`class WordCounter {
  counts = Object.create(null);
  add(word) {
    this.counts[word] = (this.counts[word] ?? 0) + 1;
  }
  get total() {
    return Object.values(this.counts).reduce((a, b) => a + b, 0);
  }
  top() {
    let best = null;
    for (const word of Object.keys(this.counts)) {
      if (best === null || this.counts[word] > this.counts[best]) best = word;
    }
    return best;
  }
}
const counter = new WordCounter();
for (const w of ["book", "water", "book", "constructor", "book", "water"]) counter.add(w);
const other = new WordCounter();
other.add("water");
console.log(counter.total, counter.top(), JSON.stringify(counter.counts), JSON.stringify(other.counts), Object.keys(counter));`,
  ['6 book {"book":3,"water":2,"constructor":1} {"water":1} (1) [\'counts\']'], 'task 4: the numbers of the criteria');
  // task 5: four buttons
  await extra(`class Plain {
  position = 0;
  next() { this.position = this.position + 1; return this.position; }
}
class Arrow {
  position = 0;
  next = () => { this.position = this.position + 1; return this.position; };
}
class Bound {
  position = 0;
  constructor() { this.next = this.next.bind(this); }
  next() { this.position = this.position + 1; return this.position; }
}
const result = [];
for (const [Q, wrap] of [[Plain, false], [Arrow, false], [Bound, false], [Plain, true]]) {
  const quiz = new Q();
  const button = document.createElement("button");
  document.body.append(button);
  button.addEventListener("click", wrap ? () => quiz.next() : quiz.next);
  button.click();
  button.click();
  result.push(\`\${quiz.position}/\${button.position}/\${Object.keys(quiz).length}/\${quiz.next === new Q().next}\`);
}
console.log(result.join(" "));`,
  ['0/NaN/1/true 2/undefined/2/false 2/undefined/2/false 2/undefined/1/true'], 'task 5: plain method, arrow field, bind, wrapper');
  // task 6: three fixes
  await extra(`class InConstructor {
  constructor(items) { this.items = items; this.total = items.length; }
}
class Getter {
  constructor(items) { this.items = items; }
  get total() { return this.items.length; }
}
class Fields {
  items = [];
  total = this.items.length;
  constructor(items) { this.items = items; }
}
console.log([InConstructor, Getter, Fields].map((B) => {
  const basket = new B(["book", "pen"]);
  const before = basket.total;
  basket.items.push("bag");
  return \`\${before}→\${basket.total}\`;
}).join(" "));`, ['2→2 2→3 0→0'], 'task 6: only the getter follows the items');
  // task 8: the counters and the name
  await extra(`function makeCounter(step) {
  return class Counter {
    count = 0;
    add() {
      this.count = this.count + step;
      return this.count;
    }
  };
}
const ByOne = makeCounter(1);
const ByFive = makeCounter(5);
const one = new ByOne();
const five = new ByFive();
for (let i = 0; i < 3; i++) {
  one.add();
  five.add();
}
console.log(one.count, five.count, one instanceof ByFive, ByOne.name);`, ['3 15 false Counter'], 'task 8: 3 and 15, different classes, the name');
  // task 9: cardFromJSON; yesterday's way gives a button that does nothing
  {
    const cards = find('lecture', 'button.addEventListener("click", card.handleFlip);').split('\nconst card = new Card(')[0];
    await extra(`${cards}
function cardFromJSON(text) {
  const data = JSON.parse(text);
  const card = new Card(data.id, data.word, data.translation, data.topic);
  card.flipped = data.flipped;
  return card;
}
const card = new Card(4, "bread", "хлеб", "еда");
card.flip();
const restored = cardFromJSON(JSON.stringify(card));
const button = document.createElement("button");
document.body.append(button);
button.addEventListener("click", restored.handleFlip);
button.click();
console.log(restored.flipped, card.flipped, restored.handleFlip !== card.handleFlip, restored.flip === card.flip);
const old = Object.assign(Object.create(Card.prototype), JSON.parse(JSON.stringify(card)));
const button2 = document.createElement("button");
document.body.append(button2);
button2.addEventListener("click", old.handleFlip);
button2.click();
console.log(old.flipped);`, ['кнопка: bread', 'false true true true', 'true'], 'task 9: cardFromJSON; the old way silently does nothing');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
