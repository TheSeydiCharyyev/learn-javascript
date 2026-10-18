// Course 2, day 9, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects too, with the constructor's name in front when it is
// not Object, and private fields as DevTools lists them (Student {#mark: 4, name: 'Аман'}); an uncaught error is
// "! message" (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-09.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-09.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem. Extra runs cover the claims of the prose
// (the DevTools console relaxation — Runtime.evaluate with replMode, as the console runs code —, the errors named
// in the text, static elements), the three experiments of «Карточки» and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-09');
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
const undeclared = (name) => `! Private field '${name}' must be declared in an enclosing class`;
const notRight = (name) => `! Cannot read private member ${name} from an object whose class did not declare it`;

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(aman.mark, Object.keys(aman), JSON.stringify(aman));': ['4 (1) [\'name\'] {"name":"Аман"}'],
  'aman.#mark = 100;': [undeclared('#mark')],
  'account["#balance"] = 999;': ["100 (1) ['owner']", "100 (2) ['owner', '#balance']"],
  '// TypeError: Cannot set property balance of #<Account>': ['! Cannot set property balance of #<Account> which has only a getter'],
  'const counter = Object.freeze(new Counter());': ['true 2 3'],
  'console.log(meret.average, typeof meret.check);': ['4.5 undefined'],
  "// TypeError: '#value' was defined without a getter": ["! '#value' was defined without a getter"],
  'Account.read({});': ['0', notRight('#balance')],
  'const fake = Object.create(Account.prototype);': ['true false', 'true false'],
  'a.transfer(b, 30);': ['70 30'],
  'console.log(deck.makeViewer().show(deck));': ['book, water'],
  'return #word in other && other.#word === this.#word;': ['true false'],
  'static seconds = this.minutes * 60;': ['2700 45 мин'],
  'console.log(card.topics, typeof card.isTopic);': ['4 true', 'undefined undefined', "(1) ['topics']"],
  'const cards = Card.fromWords(["book", "water", "bread"]);': ['3 3', '3'],
  'const reveal = Box.reveal;': ['42', "! Cannot read properties of undefined (reading '#secret')"],
  'console.log(Topics.has("еда"), Topics.has("спорт"));': ['блок 1', 'поле', 'блок 2, тем: 4 true', 'true false'],
  // tasks
  'console.log(ticket.issued, typeof Ticket.code, ticket["#code"]);': ['T-12 2 (1) [\'seat\'] {"seat":12}', 'undefined undefined undefined'],
  'console.log(new Seat().#number);': [undeclared('#number')],
  'delete this.#number;': ['! Private fields can not be deleted'],
  'new Seat().read();': ["! '#number' was defined without a getter"],
  'static get #number() {': ["! Identifier '#number' has already been declared"],
  'Seat.read({ number: 1 });': [notRight('#number')],
  'console.log(Lesson.describe(), "|", math.describe());': ['уроков: 2, по 45 мин | Математика: 45 мин', "(2) ['minutes', 'count'] (1) ['title']"],
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

  // lecture 1: what the console shows, and the console relaxation (replMode, the way DevTools evaluates input)
  await extra(`${find('lecture', 'console.log(aman.mark, Object.keys(aman), JSON.stringify(aman));')}\nconsole.log(aman);`,
    ['4 (1) [\'name\'] {"name":"Аман"}', "Student {#mark: 4, name: 'Аман'}"], 'lecture 1: the console shows #mark');
  {
    const p = await ctx.newPage();
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    const ev = async (expression, replMode) => {
      const r = await cdp.send('Runtime.evaluate', { expression, replMode, returnByValue: true });
      return r.exceptionDetails ? `! ${(r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]}` : JSON.stringify(r.result.value);
    };
    await ev('class Student {\n  #mark = 5;\n}\nglobalThis.aman = new Student();', true);
    const repl = await ev('aman.#mark', true);
    const script = await ev('aman.#mark', false);
    check(repl === '5' && script === "! SyntaxError: Private field '#mark' must be declared in an enclosing class", `lecture 1: the console (replMode) reads aman.#mark, a script cannot: ${repl} | ${script}`);
    await p.close();
  }
  // lecture 3: the table and the querySelector slip
  await extra('class Account {\n  reset() {\n    this.#total = 0;\n  }\n}', [undeclared('#total')], 'lecture 3: undeclared inside the class');
  await extra('class Temp {\n  #x = 1;\n  #x = 2;\n}', ["! Identifier '#x' has already been declared"], 'lecture 3: declared twice');
  await extra('document.querySelector(#app);', [undeclared('#app')], 'lecture 3: #app without quotes');
  await extra('const y = # 5;', ['! Invalid or unexpected token'], 'lecture 12: a lone #');
  // lecture 4: a private method is not writable, a getter-only write, the static/non-static pair
  await extra('class Temp {\n  #check() {}\n  replace() {\n    this.#check = () => 2;\n  }\n}\nnew Temp().replace();', ["! Private method '#check' is not writable"], 'lecture 4: replacing a private method');
  await extra('class Temp {\n  get #value() {\n    return 1;\n  }\n  write() {\n    this.#value = 2;\n  }\n}\nnew Temp().write();', ["! '#value' was defined without a setter"], 'lecture 4: writing a getter-only private');
  await extra('class Temp {\n  static get #value() {\n    return 1;\n  }\n  set #value(v) {}\n}', ["! Identifier '#value' has already been declared"], 'lecture 4: a static getter and an ordinary setter');
  // lecture 5: the write error, in with a primitive
  await extra('class Account {\n  #balance = 0;\n  static write(obj) {\n    obj.#balance = 1;\n  }\n}\nAccount.write({});', ['! Cannot write private member #balance to an object whose class did not declare it'], 'lecture 5: writing to a foreign object');
  await extra('class Account {\n  #balance = 0;\n  static has(obj) {\n    return #balance in obj;\n  }\n}\nAccount.has(5);', ["! Cannot use 'in' operator to search for '#balance' in 5"], 'lecture 5: #x in a primitive');
  await extra('class Account {\n  #balance = 10;\n  get balance() {\n    return this.#balance;\n  }\n}\nconst child = Object.create(new Account());\nconsole.log(child.balance);', [notRight('#balance')], 'lecture 5, 7: a private field is not found along the chain');
  // lecture 7: brands of two classes from one factory
  await extra('function makeCounter(step) {\n  return class {\n    #count = 0;\n    static isCounter(obj) {\n      return #count in obj;\n    }\n  };\n}\nconst ByOne = makeCounter(1);\nconst ByTen = makeCounter(10);\nconst one = new ByOne();\nconsole.log(ByOne.isCounter(one), ByTen.isCounter(one));', ['true false'], 'lecture 7: every evaluation of a class has its own private names');
  // lecture 9: static methods of Object
  await extra('console.log(Object.hasOwn(Object, "keys"), Object.hasOwn(Object.prototype, "keys"), ({}).keys, Object.getOwnPropertyDescriptor(Number, "isInteger").enumerable);', ['true false undefined false'], 'lecture 9: Object.keys is a static method');
  // lecture 10: a private static method
  await extra('class Card {\n  static #normalize(word) {\n    return word.trim().toLowerCase();\n  }\n  static make(word) {\n    return Card.#normalize(word);\n  }\n}\nconsole.log(Card.make("  BOOK "), typeof Card.normalize);', ['book undefined'], 'lecture 10: a private static helper');
  await extra('class Card {\n  static #normalize(word) {\n    return word;\n  }\n}\nCard.#normalize("x");', [undeclared('#normalize')], 'lecture 10: a private static method outside the class');
  // lecture 11: var stays inside the block; arguments is not allowed
  await extra('class A {\n  static {\n    var inside = 1;\n    try {\n      JSON.parse("{");\n    } catch {\n      console.log("ошибка поймана");\n    }\n  }\n}\nconsole.log(typeof inside);', ['ошибка поймана', 'undefined'], 'lecture 11: try...catch and var in a static block');
  await extra('class A {\n  static {\n    console.log(arguments);\n  }\n}', ["! 'arguments' is not allowed in class field initializer or static initialization block"], 'lecture 11: arguments in a static block');
  // lecture 12: double initialization (needs extends — only here, not in the text)
  await extra('class Base {\n  constructor(obj) {\n    return obj;\n  }\n}\nclass Stamper extends Base {\n  #stamp = 42;\n}\nconst obj = {};\nnew Stamper(obj);\nnew Stamper(obj);', ['! Cannot initialize #stamp twice on the same object'], 'lecture 12: initializing twice');

  // lecture 13, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'static fromJSON(text) {');
    const early = cards.replace('    if (!Card.#topics[topic]) {', '    Card.#created++;\n    if (!Card.#topics[topic]) {').replace('    this.topic = topic;\n    Card.#created++;', '    this.topic = topic;');
    check(early !== cards, 'lecture 13, experiment 1: the counter line moved');
    const out1 = await runOnPage([early]);
    check(out1[3] === 'true false 3', `lecture 13, experiment 1: the failed card is counted: ${out1[3]}`);
    const out2 = await runOnPage([`${cards}\nconsole.log(bread.#flipped);`]);
    check(same(out2, [undeclared('#flipped')]), `lecture 13, experiment 2: the whole file does not run: ${JSON.stringify(out2)}`);
    const out3 = await runOnPage([`${cards}\nconst load = Card.fromJSON;\nconsole.log(load(text).flipped);`]);
    check(out3[out3.length - 1] === 'true', `lecture 13, experiment 3: the detached fromJSON works: ${out3[out3.length - 1]}`);
  }

  // task 1: the file stops; task 3: what the object and the class do not have
  await extra(`${find('tasks', 'console.log(ticket.issued, typeof Ticket.code, ticket["#code"]);')}\nconsole.log(ticket.#code);`, [undeclared('#code')], 'task 1: the private read in the file');
  await extra(`${find('tasks', 'console.log(Lesson.describe(), "|", math.describe());')}\nconsole.log(math.minutes, Lesson.title);`,
    ['уроков: 2, по 45 мин | Математика: 45 мин', "(2) ['minutes', 'count'] (1) ['title']", 'undefined undefined'], 'task 3: math.minutes and Lesson.title');
  // task 4: a reference BankAccount
  await extra(`class BankAccount {
  #balance = 0;
  #history = [];
  #check(sum) {
    if (!(sum > 0)) throw new RangeError("сумма должна быть больше нуля");
  }
  deposit(sum) {
    this.#check(sum);
    this.#balance = this.#balance + sum;
    this.#history.push(\`+\${sum}\`);
    return this;
  }
  withdraw(sum) {
    this.#check(sum);
    if (sum > this.#balance) throw new RangeError("недостаточно денег");
    this.#balance = this.#balance - sum;
    this.#history.push(\`-\${sum}\`);
    return this;
  }
  transfer(other, sum) {
    if (!(#balance in other)) throw new TypeError("это не счёт");
    this.withdraw(sum);
    other.deposit(sum);
  }
  get balance() { return this.#balance; }
  get history() { return [...this.#history]; }
}
const account = new BankAccount().deposit(100).withdraw(30);
try { account.withdraw(100); } catch (e) { console.log(e.name); }
account.history.push("взлом");
try { account.transfer({}, 10); } catch (e) { console.log(e.message); }
console.log(account.balance, account.history, Object.keys(account), JSON.stringify(account));`,
  ['RangeError', 'это не счёт', "70 (2) ['+100', '-30'] (0) [] {}"], 'task 4: the numbers of the criteria');
  // task 5: a reference Word
  await extra(`class Word {
  static #created = 0;
  constructor(text) {
    if (typeof text !== "string" || text === "") throw new TypeError("нужно непустое слово");
    this.text = text;
    Word.#created++;
  }
  static get created() { return Word.#created; }
  static reset() { Word.#created = 0; }
}
new Word("book"); new Word("water"); new Word("bread");
try { new Word(""); } catch (e) { console.log(e.message); }
Word.created = 0;
console.log(Word.created);
Word.reset();
console.log(Word.created);`, ['нужно непустое слово', '3', '0'], 'task 5: an honest counter');
  // task 6: the example with a reference Student
  {
    const ex = find('tasks', 'students.sort(Student.compare);');
    const said = ex.match(/\/\/ (.*)$/m)[1];
    await extra(`class Student {
  constructor(name, marks) {
    this.name = name;
    this.marks = marks;
  }
  get average() {
    return this.marks.reduce((a, b) => a + b, 0) / this.marks.length;
  }
  static fromJSON(text) {
    return JSON.parse(text).map((s) => new Student(s.name, s.marks));
  }
  static compare(a, b) {
    return b.average - a.average;
  }
}
${ex}
const load = Student.fromJSON;
console.log(students.every((s) => s instanceof Student), load('[{"name":"x","marks":[3]}]')[0] instanceof Student);`,
    [said, 'true true'], 'task 6: the example and a detached fromJSON');
  }
  // task 7: two money classes and a factory
  await extra(`function money(name) {
  return class {
    #amount;
    constructor(amount) { this.#amount = amount; }
    add(other) {
      if (!(#amount in other)) throw new TypeError(\`это не \${name}\`);
      return new this.constructor(this.#amount + other.#amount);
    }
    get amount() { return this.#amount; }
    static is(value) { return #amount in value; }
  };
}
class Manat {
  #amount;
  constructor(amount) { this.#amount = amount; }
  add(other) {
    if (!(#amount in other)) throw new TypeError("это не манаты");
    return new Manat(this.#amount + other.#amount);
  }
  get amount() { return this.#amount; }
  static is(value) { return #amount in value; }
}
class Dollar {
  #amount;
  constructor(amount) { this.#amount = amount; }
  static is(value) { return #amount in value; }
}
console.log(new Manat(5).add(new Manat(3)).amount);
try { new Manat(5).add(new Dollar(3)); } catch (e) { console.log(e.message); }
const A = money("A");
const B = money("B");
console.log(Manat.is(new Dollar(1)), A.is(new B(1)), A.is(new A(1)), Object.create(Manat.prototype) instanceof Manat, Manat.is(Object.create(Manat.prototype)));`,
  ['8', 'это не манаты', 'false false true true false'], 'task 7: same names, different brands');
  // task 8: a private constructor
  await extra(`class Token {
  static #allowed = false;
  constructor(fail) {
    if (!Token.#allowed) throw new TypeError("используйте Token.create()");
    if (fail) throw new Error("сбой");
  }
  static create(fail) {
    Token.#allowed = true;
    try {
      return new Token(fail);
    } finally {
      Token.#allowed = false;
    }
  }
}
try { new Token(); } catch (e) { console.log(e.message); }
console.log(Token.create() instanceof Token);
try { Token.create(true); } catch (e) { console.log(e.message); }
try { new Token(); } catch (e) { console.log(e.message); }`,
  ['используйте Token.create()', 'true', 'сбой', 'используйте Token.create()'], 'task 8: the flag is lowered even after an error');
  // task 9: the cursor
  await extra(`class Deck {
  #words;
  constructor(words) { this.#words = [...words]; }
  cursor() {
    const deck = this;
    return new (class Cursor {
      #position = 0;
      next() {
        return this.#position < deck.#words.length ? deck.#words[this.#position++] : null;
      }
    })();
  }
}
const deck = new Deck(["book", "water"]);
const a = deck.cursor();
const b = deck.cursor();
console.log(a.next(), a.next(), a.next(), b.next(), new Deck(["bread"]).cursor().next(), Object.keys(a));`,
  ['book water null book bread (0) []'], 'task 9: independent cursors');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
