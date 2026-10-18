// Course 2, day 7, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects too, with the constructor's name in front when it is
// not Object (Student {name: 'Аман', marks: Array(3)}); an uncaught error is "! message" (V8 text; the prefix that
// Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-07.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-07.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (lookup and writes along the chain, the errors named in the text, the dictionary), the three experiments of
// «Карточки» and reference solutions of tasks 1–9 against the lines their criteria give.
// Note: Chrome's preview leaves out an own key named "constructor", so dictionaries are printed with JSON.stringify.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-07');
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

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(typeof student.toString);': ['false true', 'function'],
  'console.log(Object.getPrototypeOf(proto));': ['true', 'true', 'null'],
  'console.log(Object.getPrototypeOf(marks) === Array.prototype);': ['true', 'true', 'true', 'false true'],
  'const meret = Object.create(studentMethods);': ['Салам, Аман! Салам, Мерет! А', "true (1) ['name']"],
  'const aman = Object.create(base, { name: { value: "Аман", enumerable: true } });': ["студент {value: 'Аман', writable: false, enumerable: true, configurable: false}"],
  'const deck = Object.create(defaults);': ["еда все (1) ['topic']", 'все', 'for...in: topic', 'for...in: count'],
  'const card = Object.create(base);': ['1 (0) []'],
  'console.log(base.isPrototypeOf(last), last.isPrototypeOf(base));': ['true false', 'true'],
  'Object.setPrototypeOf(a, b);': ['! Cyclic __proto__ value'],
  'const aman = { __proto__: base, name: "Аман" };': ["студент (1) ['name'] true"],
  'const meret = new Student("Мерет", [4, 4]);': ['4.666666666666667 4', 'true', 'true', "Student {name: 'Аман', marks: Array(3)}"],
  'console.log(new Maker());': ['{b: 2}'],
  'console.log(a.greet === b.greet, Object.keys(a));': ["false (2) ['name', 'greet']"],
  'console.log(aman.best());': ['5'],
  'console.log(aman.constructor === Student, [].constructor === Array);': ["(1) ['constructor'] true", 'true true'],
  'console.log(aman.greet(), aman.constructor === Student, aman.constructor === Object);': ['Салам, Аман! false true'],
  'new card.show();': ['! card.show is not a constructor'],
  'const aman = Student("Аман");': ['undefined Аман'],
  '// TypeError: Cannot set properties of undefined': ["! Cannot set properties of undefined (setting 'name')"],
  'console.log(aman instanceof Student, aman instanceof Object);': ['true true', 'false false', 'false true false'],
  'console.log({} instanceof {});': ["! Right-hand side of 'instanceof' is not callable"],
  'console.log(Object.prototype.toString.call([5, 4]));': ['[object Array]', "(2) ['a', 'b']", 'true'],
  'Array.prototype.last = function () {': ['for...in: 0', 'for...in: 1', 'for...in: last'],
  'const plain = {};': ['2 string', '2 1 false'],
  // tasks
  'console.log(chain(new RangeError("ошибка")));': ['Object', 'Array → Object', 'Function → Object', 'Date → Object', 'RangeError → Error → Object'],
  'console.log(Object.keys(aman), "kind" in aman, Object.hasOwn(aman, "kind"));': ["(1) ['name'] true false", 'name', 'kind', 'greet', 'староста студент', 'студент'],
  'new show();': ['! show is not a constructor'],
  'const card = new Card?.("book");': ['! Invalid optional chain from new expression'],
  'Object.setPrototypeOf(deck, deck);': ['! Cyclic __proto__ value'],
  'Object.setPrototypeOf(settings, {});': ['! #<Object> is not extensible'],
  'console.log([] instanceof "Array");': ["! Right-hand side of 'instanceof' is not an object"],
  'const words = ["book", "constructor", "book", "valueOf", "toString", "book"];': [],
  'console.log(pairs.map(([value, F]) => value instanceof F).join(" "));': ['true true true true false false true true'],
  'const cardBase = {': [],
  'const settings = Object.create(DEFAULTS);': ['светлая (0) []'],
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
    const out = await runOnPage([code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const STUDENT = 'function Student(name, marks) {\n  this.name = name;\n  this.marks = marks;\n}\nStudent.prototype.average = function () {\n  return this.marks.reduce((a, b) => a + b, 0) / this.marks.length;\n};';

  // lecture, prose claims
  await extra(`${find('lecture', 'const meret = Object.create(studentMethods);')}\nconsole.log(aman.missing);`,
    ['Салам, Аман! Салам, Мерет! А', "true (1) ['name']", 'undefined'], 'lecture 4: a missing property walks to null');
  await extra('const proto = {\n  _mark: 0,\n  get mark() { return this._mark; },\n  set mark(v) { this._mark = v; },\n};\nconst s = Object.create(proto);\ns.mark = 5;\nconsole.log(s.mark, proto.mark, Object.hasOwn(s, "mark"), Object.keys(s));',
    ["5 0 false (1) ['_mark']"], 'lecture 5: a setter in the chain runs with this = the object, no own property');
  await extra(`"use strict";\n${find('lecture', 'const card = Object.create(base);')}`,
    ["! Cannot assign to read only property 'level' of object '#<Object>'"], 'lecture 5: an inherited read-only property, strict mode');
  await extra('const base = Object.freeze({ level: 1 });\nconst card = Object.create(base);\nObject.defineProperty(card, "level", { value: 2, writable: true, enumerable: true, configurable: true });\nconsole.log(card.level, base.level);',
    ['2 1'], 'lecture 5: defineProperty creates the own property');
  await extra('Object.setPrototypeOf(Object.preventExtensions({}), {});', ['! #<Object> is not extensible'], 'lecture 6: a non-extensible object');
  await extra('Object.setPrototypeOf(Object.prototype, {});', ["! Immutable prototype object 'Object.prototype' cannot have their prototype set"], 'lecture 6: Object.prototype');
  await extra('const dict = Object.create(null);\nconst plain = {};\nconsole.log(dict.__proto__, plain.__proto__ === Object.prototype, Object.getOwnPropertyNames(Object.prototype).length);',
    ['undefined true 12'], 'lecture 6, 12: no __proto__ accessor without Object.prototype; constructor, toString and ten more');
  await extra('const dict = Object.create(null);\ndict.book = 1;\nconsole.log(Object.getPrototypeOf("abc") === String.prototype, Object.prototype.hasOwnProperty.call(dict, "book"), Object.prototype.hasOwnProperty.call(dict, "toString"));',
    ['true true false'], 'lecture 6, 12: getPrototypeOf of a primitive; hasOwnProperty.call on a dictionary');
  await extra('new Math();', ['! Math is not a constructor'], 'lecture 8: new Math()');
  await extra('function Student(name) {\n  this.name = name;\n}\nconst s = new Student?.("Аман");', ['! Invalid optional chain from new expression'], 'lecture 8: new with ?.');
  await extra(`${STUDENT}\nconst aman = new Student("Аман", [5]);\nconsole.log(Student.prototype.isPrototypeOf(aman), new RangeError("x") instanceof Error, Object.getPrototypeOf(Student) === Function.prototype);`,
    ['true true true'], 'lecture 8, 10: isPrototypeOf; RangeError goes through Error.prototype; the prototype of Student itself');
  await extra('console.log({} instanceof 5);', ["! Right-hand side of 'instanceof' is not an object"], 'lecture 10: a number on the right');
  await extra('const fake = function () {};\nfake.prototype = 5;\nconsole.log({} instanceof fake);', ["! Function has non-object prototype '5' in instanceof check"], 'lecture 10: a primitive prototype');
  {
    const code = find('lecture', 'const plain = {};');
    await extra(`${code}\nconsole.log(plain.constructor);`, ['2 string', '2 1 false', 'function Object() { [native code] }1'], 'lecture 12: the string of the plain dictionary');
  }
  await extra('const dict = Object.create(null);\nString(dict);', ['! Cannot convert object to primitive value'], 'lecture 12: String(dict)');
  await extra('const dict = Object.create(null);\nconsole.log(`${dict}`);', ['! Cannot convert object to primitive value'], 'lecture 12: a template with dict');
  await extra('const dict = Object.create(null);\ndict.hasOwnProperty("a");', ['! dict.hasOwnProperty is not a function'], 'lecture 12: dict.hasOwnProperty');

  // lecture 13, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'Card.prototype.flip = function () {');
    const out1 = await runOnPage([`${cards}\nconst before = \`\${cards[0]}\`;\nCard.prototype.toString = function () { return \`карточка \${this.word}\`; };\nconsole.log(before, \`\${cards[0]}\`);`]);
    check(out1[out1.length - 1] === '[object Object] карточка book', `lecture 13, experiment 1: ${out1[out1.length - 1]}`);
    const plain = cards.replace('const byTopic = Object.create(null);', 'const byTopic = {};').replace('[7, "house", "дом", "дом"],', '[7, "house", "дом", "дом"],\n  [9, "apple", "яблоко", "toString"],');
    check(plain !== cards, 'lecture 13, experiment 2: the dictionary line and the data found');
    const out2 = await runOnPage([plain]);
    check(out2[2] === '{"школа":1,"еда":2,"дом":1,"toString":"function toString() { [native code] }1"}', `lecture 13, experiment 2: ${out2[2]}`);
    const out3 = await runOnPage([`${cards}\nconst lost = Card(9, "apple", "яблоко", "еда");\nconsole.log(lost, globalThis.word, globalThis.flipped);`]);
    check(out3[out3.length - 1] === 'undefined apple false', `lecture 13, experiment 3: ${out3[out3.length - 1]}`);
  }

  // notes: the comments of the first block
  await extra(`${find('student', 'Object.getPrototypeOf(student) === Object.prototype;')}\nconsole.log(Object.getPrototypeOf(student) === Object.prototype, Object.getPrototypeOf(Object.prototype), Object.getPrototypeOf([]) === Array.prototype, Object.getPrototypeOf(() => 1) === Function.prototype);`,
    ['true null true true'], 'notes: the four comments');

  // task 1: a string and a dictionary
  {
    const code = find('tasks', 'function chain(value) {').replace(/console\.log\(chain[^\n]*\n?/g, '');
    await extra(`${code}\nconsole.log(JSON.stringify(chain("abc")), JSON.stringify(chain(Object.create(null))));`, ['"String → Object" ""'], 'task 1: chain("abc") and chain(Object.create(null))');
  }
  // task 2: delete base.kind instead
  await extra(find('tasks', '"kind" in aman').replace('delete aman.kind;', 'delete base.kind;'),
    ["(1) ['name'] true false", 'name', 'kind', 'greet', 'староста студент', 'староста'], 'task 2: delete base.kind leaves the own one');
  // task 4: a reference Group; students in the prototype would be shared
  await extra(`function Group(title) {
  this.title = title;
  this.students = [];
}
Group.prototype.add = function (name, marks) {
  this.students.push({ name, marks });
};
Group.prototype.average = function () {
  const marks = this.students.flatMap((s) => s.marks);
  return marks.reduce((a, b) => a + b, 0) / marks.length;
};
Group.prototype.best = function () {
  const avg = (s) => s.marks.reduce((a, b) => a + b, 0) / s.marks.length;
  let best = this.students[0];
  for (const s of this.students) {
    if (avg(s) > avg(best)) best = s;
  }
  return best.name;
};
const g1 = new Group("1-А");
const g2 = new Group("2-Б");
g1.add("Аман", [5, 4, 5]);
g1.add("Мерет", [4, 4, 3]);
console.log(g1.average(), g1.best(), Object.keys(g1), g1.add === g2.add);
console.log(g1);
function Shared(title) { this.title = title; }
Shared.prototype.students = [];
const s1 = new Shared("1-А");
const s2 = new Shared("2-Б");
s1.students.push("Аман");
console.log(s2.students.length);`,
  ["4.166666666666667 Аман (2) ['title', 'students'] true", "Group {title: '1-А', students: Array(2)}", '1'], 'task 4: numbers of the criteria; an array in the prototype is shared');
  // task 5: own new
  await extra(`${STUDENT}
function Maker() {
  this.a = 1;
  return { b: 2 };
}
function create(F, ...args) {
  const obj = Object.create(F.prototype);
  const result = F.apply(obj, args);
  return typeof result === "object" && result !== null ? result : obj;
}
const aman = create(Student, "Аман", [5, 4]);
console.log(aman instanceof Student, aman.average(), aman.constructor === Student);
console.log(create(Maker));
create(() => 1);`, ['true 4.5 true', '{b: 2}', '! Object prototype may only be an Object or null: undefined'], 'task 5: own new');
  // task 6: both dictionaries, has, the template
  await extra(`${find('tasks', 'const words = ["book", "constructor"')}
const plain = {};
const dict = Object.create(null);
for (const w of words) {
  plain[w] = (plain[w] ?? 0) + 1;
  dict[w] = (dict[w] ?? 0) + 1;
}
const has = (counts, word) => Object.hasOwn(counts, word);
console.log(JSON.stringify(dict));
console.log(typeof plain.constructor, String(plain.valueOf).slice(0, 25), has(plain, "book"), has(dict, "toString"), has(plain, "hasOwnProperty"), has(dict, "hasOwnProperty"));
console.log(\`\${dict}\`);`,
  ['{"book":3,"constructor":1,"valueOf":1,"toString":1}', 'string function valueOf() { [nat true true false false', '! Cannot convert object to primitive value'], 'task 6: the dictionaries');
  // task 7: a reference isInstance
  await extra(`${find('tasks', 'const pairs = [')}
function isInstance(value, F) {
  if (typeof F !== "function") {
    throw new TypeError("справа не функция");
  }
  if (typeof value !== "object" && typeof value !== "function" || value === null) {
    return false;
  }
  let p = Object.getPrototypeOf(value);
  while (p !== null) {
    if (p === F.prototype) return true;
    p = Object.getPrototypeOf(p);
  }
  return false;
}
console.log(pairs.map(([value, F]) => isInstance(value, F)).join(" "));
Object.setPrototypeOf(aman, null);
console.log(aman instanceof Student, isInstance(aman, Student), aman instanceof Object, isInstance(aman, Object), Student instanceof Function, Student instanceof Student);`,
  ['true true true true false false true true', 'true true true true false false true true', 'false false false false true false'], 'task 7: isInstance matches instanceof');
  // task 8: the reference cards and the recursion
  {
    const base = find('tasks', 'const cardBase = {');
    const build = (textBody) => `${base}
const exampleCard = Object.create(cardBase);
exampleCard.text = function () {
  return ${textBody};
};
const card = Object.create(exampleCard);
card.word = "book";
card.translation = "книга";
card.example = "I read a book";
card.flipped = false;`;
    await extra(`${build('`${cardBase.text.call(this)} (${this.example})`')}\nconsole.log(card.text());\nconsole.log(card.flip());\nconsole.log(cardBase.isPrototypeOf(card), exampleCard.isPrototypeOf(card), Object.keys(card));`,
      ['book (I read a book)', 'книга (I read a book)', "true true (4) ['word', 'translation', 'example', 'flipped']"], 'task 8: the chain of three');
    await extra(`${build('`${this.text()} (${this.example})`')}\ncard.text();`, ['! Maximum call stack size exceeded'], 'task 8: this.text() recurses');
  }
  // task 9: strict mode, defineProperty, another design
  {
    const code = find('tasks', 'const settings = Object.create(DEFAULTS);');
    await extra(`"use strict";\n${code}`, ["! Cannot assign to read only property 'theme' of object '#<Object>'"], 'task 9: strict mode');
    await extra(`${code}\nObject.defineProperty(settings, "theme", { value: "тёмная", writable: true, enumerable: true, configurable: true });\nsettings.theme = "синяя";\nconsole.log(settings.theme, DEFAULTS.theme);\nconst copy = { ...DEFAULTS };\ncopy.theme = "тёмная";\nconsole.log(copy.theme, copy.timer);`,
      ['светлая (0) []', 'синяя светлая', 'тёмная 10'], 'task 9: defineProperty, then a copy instead of a prototype');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
