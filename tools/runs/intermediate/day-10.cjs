// Course 2, day 10, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object, and a subclass of Array with its name too (Deck(3) ['хлеб', …], a plain array is (3) […]); an uncaught
// error is "! message" (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-10.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-10.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (extends targets, construction order, super, static and private elements, new.target, Array subclasses), the three
// experiments of «Карточки» and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-10');
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
const MUST = "! Must call super constructor in derived class before accessing 'this' or returning from derived constructor";
const TWICE = '! Super constructor may only be called once';
const RETURN = '! Derived constructors may only return object or undefined';
const SUPER = "! 'super' keyword unexpected here";
const undeclared = (name) => `! Private field '${name}' must be declared in an enclosing class`;
const notRight = (name) => `! Cannot read private member ${name} from an object whose class did not declare it`;

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(card.text(), "|", card.flip());': ['book (I read a book) | книга (I read a book)', "(4) ['word', 'translation', 'flipped', 'example']"],
  'console.log(Object.getPrototypeOf(ExampleCard) === Card);': ['true', 'true', 'true true'],
  'this.mark = 5;': [MUST],
  'class ImageCard extends Card {': ['bread', 'book — I read a book', '[картинка] house'],
  'console.log(Object.getPrototypeOf(RangeError) === Error': ['true true', 'true RangeError Error'],
  'class FlipWord extends Flippable(Word) {}': ['true book true'],
  'console.log(words.toSorted() instanceof Words);': ['true true', 'false'],
  'console.log(card instanceof Card, card.constructor === Card, card.constructor.name);': ['true false ExampleCard'],
  'console.log(new Child(2, 3).sum, Child.length);': ['5 0'],
  'console.log("начало конструктора наследника");': ['начало конструктора наследника', 'поле родителя', 'тело родителя, класс: Child', 'поле наследника', 'после super: 1 2'],
  'console.log(new Child().hello(), new Base().hello());': ['привет от Base, и от Child привет от Base'],
  'const other = { greet: child.greet': ['салам, Аман | салам, Аман'],
  'console.log(Child.make() instanceof Child, Child.describe(), Object.hasOwn(Child, "make"));': ['true класс Child, наследник false'],
  'peek() {': [undeclared('#secret')],
  'this.#created++;': [notRight('#created')],
  'throw new TypeError("вызовите Student через new");': ['Аман', '! вызовите Student через new'],
  'class Circle extends Shape {}': ['создаётся Circle', '! Shape — общий класс, создавайте его наследников'],
  'console.log(words.last, words.longest(), words.length, Array.isArray(words));': ['bread water 3 true', 'true bread ["book","water","bread"]'],
  'console.log(list.length, list.at(-1), typeof list.push);': ['2 water undefined'],
  // tasks
  'console.log(aina.introduce(), Teacher.city, Object.keys(aina));': ["Я Айна, учитель Мары (1) ['name']", 'true true true'],
  'subject = (console.log("поле Exam"), "математика");': ['поле Lesson', 'тело Lesson: экзамен: undefined', 'поле Exam', 'тело Exam: экзамен: математика'],
  'new Club("Шахматы");': [MUST],
  'super();\n    super();': [TWICE],
  'return "клуб";': [RETURN],
  'class Group {\n  constructor() {\n    super();': [SUPER],
  'return super.title;': [SUPER],
  'console.log(exam.title());': ['урок → экзамен'],
  // lecture, last: return 1 is also a substring of nothing above
  'return 1;': [RETURN],
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

  // lecture 2: what may stand after extends
  await extra('class Child extends 5 {}', ['! Class extends value 5 is not a constructor or null'], 'lecture 2: extends 5');
  await extra('const arrow = () => {};\nclass Child extends arrow {}', ['! Class extends value () => {} is not a constructor or null'], 'lecture 2: extends an arrow function');
  await extra('class A {}\nconsole.log(Object.getPrototypeOf(A) === Function.prototype);\nfunction Old() {\n  this.prop = 1;\n}\nclass Child extends Old {}\nconsole.log(new Child().prop);', ['true', '1'], 'lecture 2: no extends — Function.prototype; a constructor function as a parent');
  // lecture 3: super() never called
  await extra('class Base {}\nclass Child extends Base {\n  constructor() {}\n}\nnew Child();', [MUST], 'lecture 3: returning without super()');
  // lecture 4: an overridden method called from the parent's constructor
  await extra('class Base {\n  constructor() {\n    console.log(this.describe());\n  }\n  describe() {\n    return "Base";\n  }\n}\nclass Child extends Base {\n  level = 2;\n  describe() {\n    return `Child, уровень ${this.level}`;\n  }\n}\nnew Child();', ['Child, уровень undefined'], 'lecture 4: the child field is not there yet');
  // lecture 6: super.x = 5 writes to this; super alone
  await extra('class Base {}\nclass Child extends Base {\n  set() {\n    super.x = 5;\n    return [this.x, Object.hasOwn(this, "x"), Object.hasOwn(Base.prototype, "x")];\n  }\n}\nconsole.log(new Child().set());', ['(3) [5, true, false]'], 'lecture 6: super.x = 5 sets this.x');
  await extra('const o = {\n  m() {\n    console.log(super);\n  },\n};', [SUPER], 'lecture 6: super alone is not a value');
  // lecture 7: a static field shadowed by the child
  await extra('class Base {\n  static count = 0;\n  static add() {\n    this.count = this.count + 1;\n    return this.count;\n  }\n}\nclass Child extends Base {}\nChild.add();\nChild.add();\nBase.add();\nconsole.log(Base.count, Child.count, Object.hasOwn(Child, "count"));', ['1 2 true'], 'lecture 7: two counters after the first write');
  // lecture 8: the parent's methods work on the child; the fixed static counter
  await extra('class Base {\n  #secret = 42;\n  reveal() {\n    return this.#secret;\n  }\n  static has(o) {\n    return #secret in o;\n  }\n}\nclass Child extends Base {}\nconst c = new Child();\nconsole.log(c.reveal(), Base.has(c), Object.keys(c));', ['42 true (0) []'], 'lecture 8: the private field is on the child object');
  await extra(find('lecture', 'this.#created++;').replace('this.#created++;', 'Base.#created++;').replace('Child.create();', 'Child.create();\nconsole.log("ок");'), ['ок'], 'lecture 8: Base.#created works for the child');
  // lecture 9: new.target in an arrow function and at the top level
  await extra('class A {\n  constructor() {\n    const arrow = () => new.target;\n    console.log(arrow() === A);\n  }\n}\nnew A();', ['true'], 'lecture 9: an arrow function takes new.target from outside');
  await extra('console.log(new.target);', ['! new.target expression is not allowed here'], 'lecture 9: new.target outside functions');
  // lecture 11: the console label, new Words(3), Words.of(3)
  await extra('class Words extends Array {}\nconst w = Words.from(["book", "water", "bread"]);\nconsole.log(w);\nconsole.log(new Words(3).length, JSON.stringify(new Words(3)), Words.of(3).length, Words.of(3)[0]);', ["Words(3) ['book', 'water', 'bread']", '3 [null,null,null] 1 3'], 'lecture 11: the label and the Array constructor trap');
  // lecture 13: extends null
  await extra('class Child extends null {}\nconsole.log(Object.getPrototypeOf(Child.prototype));\nnew Child();', ['null', '! Super constructor null of Child is not a constructor'], 'lecture 13: extends null fails when constructing');

  // lecture 14, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'class Deck extends Array {');
    const early = cards.replace('    super(word, translation);\n    this.example = example;', '    this.example = example;\n    super(word, translation);');
    check(early !== cards, 'lecture 14, experiment 1: the lines swapped');
    const out1 = await runOnPage([early]);
    check(same(out1, [MUST]), `lecture 14, experiment 1: the error comes at creation: ${JSON.stringify(out1)}`);
    const out2 = await runOnPage([cards.replace('${super.text()} — ${this.example}', '${this.text()} — ${this.example}')]);
    check(out2[0] === '3 1 3' && out2[1] === '! Maximum call stack size exceeded', `lecture 14, experiment 2: ${JSON.stringify(out2)}`);
    const out3 = await runOnPage([cards.replace('  text() {\n    return `${super.text()}', '  peek() {\n    return this.#flipped;\n  }\n\n  text() {\n    return `${super.text()}')]);
    check(same(out3, [undeclared('#flipped')]), `lecture 14, experiment 3: ${JSON.stringify(out3)}`);
  }

  // task 1: aina.city
  await extra(`${find('tasks', 'console.log(aina.introduce(), Teacher.city, Object.keys(aina));')}\nconsole.log(aina.city, Object.hasOwn(Teacher, "city"));`,
    ["Я Айна, учитель Мары (1) ['name']", 'true true true', 'undefined false'], 'task 1: aina.city and where city lives');
  // task 3: returning an object is allowed
  await extra('class Group {}\nclass Club extends Group {\n  constructor() {\n    super();\n    return { title: "клуб" };\n  }\n}\nconsole.log(new Club(), new Club() instanceof Club);', ["{title: 'клуб'} false"], 'task 3: a derived constructor may return an object');
  // task 4: a reference hierarchy
  await extra(`class Shape {
  constructor() {
    if (new.target === Shape) throw new TypeError("Shape — общий класс");
  }
  area() { throw new Error("не реализовано"); }
  describe() { return \`\${this.constructor.name}, площадь \${this.area()}\`; }
}
class Rectangle extends Shape {
  constructor(width, height) { super(); this.width = width; this.height = height; }
  area() { return this.width * this.height; }
}
class Square extends Rectangle {
  constructor(side) { super(side, side); }
}
try { new Shape(); } catch (e) { console.log(e.name); }
console.log(new Square(4).describe(), new Rectangle(2, 3).describe(), new Square(2) instanceof Rectangle, new Square(2) instanceof Shape);`,
  ['TypeError', 'Square, площадь 16 Rectangle, площадь 6 true true'], 'task 4: the numbers of the criteria');
  // task 5: Marks
  await extra(`class Marks extends Array {
  get average() { return this.reduce((a, b) => a + b, 0) / this.length; }
  get best() { return Math.max(...this); }
  above(n) { return this.filter((m) => m > n); }
}
const marks = Marks.from([5, 4, 5, 3, 5]);
const high = marks.above(4);
console.log(marks.average, marks.best, high instanceof Marks, high.average, new Marks(5).length, Marks.of(5)[0], Array.isArray(marks), JSON.stringify(marks));
console.log(marks);`,
  ['4.4 5 true 5 5 5 true [5,4,5,3,5]', 'Marks(5) [5, 4, 5, 3, 5]'], 'task 5: the numbers of the criteria');
  // task 6: private in the family
  await extra('class Counter {\n  #value = 0;\n  increment() {\n    this.#value++;\n  }\n}\nclass StepCounter extends Counter {\n  double() {\n    this.#value += 2;\n  }\n}', [undeclared('#value')], 'task 6: the child cannot touch #value');
  await extra(`class Counter {
  #value = 0;
  static #instances = 0;
  static create() { Counter.#instances++; return new this(); }
  static get instances() { return Counter.#instances; }
  increment() { this.#value++; return this.#value; }
}
class StepCounter extends Counter {
  double() { this.increment(); return this.increment(); }
}
Counter.create();
Counter.create();
const s = StepCounter.create();
console.log(s.double(), Counter.instances, s instanceof StepCounter);`, ['2 3 true'], 'task 6: the fixed counter');
  // task 7: two stacks
  await extra(`class StackArray extends Array {
  peek() { return this[this.length - 1]; }
}
class Stack {
  #items = [];
  push(x) { this.#items.push(x); return this; }
  pop() { return this.#items.pop(); }
  peek() { return this.#items.at(-1); }
  get size() { return this.#items.length; }
}
const a = new StackArray();
a.push("a"); a.push("b"); a.pop();
const s = new Stack().push("a").push("b");
s.pop();
console.log(a.peek(), s.peek(), s.size);
a.unshift("снизу");
console.log(a[0], Array.isArray(a), Array.isArray(s), JSON.stringify(a), JSON.stringify(s), Object.keys(s));
try { for (const x of s) console.log(x); } catch (e) { console.log(e.message); }`,
  ['a a 1', 'снизу true false ["снизу","a"] {} (0) []', 's is not iterable'], 'task 7: inheritance against composition');
  // task 8: a registry of kinds
  {
    const cards = find('lecture', 'class Deck extends Array {').split('\nclass Deck extends Array {')[0]
      .replace('  static create(...args) {', '  static #kinds = Object.create(null);\n\n  static register(kind, Class) {\n    Card.#kinds[kind] = Class;\n  }\n\n  static fromData(data) {\n    const Class = Card.#kinds[data.kind];\n    if (!Class) throw new RangeError(`вида «${data.kind}» нет`);\n    return Class === ExampleCard ? new Class(data.word, data.translation, data.example) : new Class(data.word, data.translation);\n  }\n\n  static create(...args) {');
    await extra(`${cards}
Card.register("word", WordCard);
Card.register("example", ExampleCard);
const c = Card.fromData({ kind: "example", word: "book", translation: "книга", example: "I read a book" });
console.log(c instanceof ExampleCard, c.text(), ExampleCard.fromData({ kind: "word", word: "a", translation: "б" }) instanceof WordCard);
try { Card.fromData({ kind: "image" }); } catch (e) { console.log(\`\${e.name}: \${e.message}\`); }`,
    ['true book — I read a book true', 'RangeError: вида «image» нет'], 'task 8: fromData by kind');
  }
  // task 9: a moved method keeps its super; the this-based variant does not
  await extra(`${find('tasks', 'console.log(exam.title());')}
const third = { title: exam.title, __proto__: { title() { return "чужой"; } } };
console.log(third.title());
const exam2 = { __proto__: lesson, title() { return \`\${Object.getPrototypeOf(this).title.call(this)} → экзамен\`; } };
const third2 = { title: exam2.title, __proto__: { title() { return "чужой"; } } };
console.log(exam2.title(), "|", third2.title());`, ['урок → экзамен', 'урок → экзамен', 'урок → экзамен | чужой → экзамен'], 'task 9: super stays, this-based follows the object');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
