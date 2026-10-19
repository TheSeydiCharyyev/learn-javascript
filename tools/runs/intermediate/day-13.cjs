// Course 2, day 13, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object, a subclass of Array with its name too, a symbol as Symbol(description); an uncaught error is "! message"
// (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-13.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-13.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem; every EXPECT key is in exactly one block.
// Extra runs cover the claims of the prose (where the methods live, the texts of the errors, which methods close the
// source, Iterator.from, the abstract Iterator, concat/zip/zipKeyed, what Chrome 155 lacks), the three experiments of
// «Карточки» and reference solutions of tasks 1–9. No run ever touches an infinite iterator without take/find.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-13');
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

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(fibonacci().find((n) => n > 100));': ['(10) [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]', '144'],
  'console.log(proto(proto(marks.values())) === Iterator.prototype);': ['true', 'function undefined', '(3) [50, 30, 40]'],
  'console.log(words.values().take(10).toArray().length);': ["(5) ['1. book', '2. teacher', '3. lesson', '4. bread', '5. water']", "(2) ['teacher', 'lesson'] (2) ['teacher', 'lesson']", '5'],
  'const viaLoop = [];': ['(2) [50, 40] (2) [50, 40]'],
  'function* letters(word) {': ["(4) ['a', 'b', 'c', 'd']", '2'],
  'function* marks() {': ['19 5', 'true false', '3 true 5 3 4 2 5', '0 5', '1 3'],
  'const seq = lessons();': ['лекция {value: undefined, done: true}'],
  'console.log(fibonacci().drop(5).take(3).toArray());': ['(5) [0, 2, 8, 34, 144]', '(3) [5, 8, 13]', '88'],
  'console.log(naturals().take(5).drop(2).toArray());': ['(5) [3, 4, 5, 6, 7]', '(3) [3, 4, 5]'],
  'const copy = source.drop(0);': ['1 2 3'],
  'const firstTwo = lessons().take(2);': ['лекция практика', 'источник закрыт', '{value: undefined, done: true}'],
  'const proper = Iterator.from(plain);': ['undefined', '(3) [0, 10, 20] false'],
  'function* one() {': ["true (4) ['М', 'а', 'р', 'ы']"],
  'class Countdown extends Iterator {': ['(3) [5, 3, 1] (3) [3, 2, 1]', '! Abstract class Iterator not directly constructable'],
  'console.log(Iterator.concat([1, 2], letters()).toArray());': ["(4) [1, 2, 'x', 'y']", 'book — книга', 'water — вода', '[{"word":"book","ru":"книга"},{"word":"water","ru":"вода"}]'],
  'for (const [n, word] of Iterator.zip([counter(), ["book", "water"]])) {': ['1 book', '2 water'],
  // tasks
  'console.log(viaArray, viaIterator.next().value);': ['массив map 5', 'массив map 2', 'массив map 4', 'массив filter 50', 'массив filter 20', 'массив filter 40', 'готово', 'итератор map 5', 'итератор filter 50', '(2) [50, 40] 50'],
  'const best = marks.filter': ['(2) [50, 40]'],
  'const students = [': [],
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

  const NATURALS = 'function* naturals() {\n  let n = 1;\n  while (true) yield n++;\n}\n';

  // lecture 2 and 11: helpers live on iterators, not on arrays
  await extra('[1, 2].take(1);', ['! [1,2].take is not a function'], 'lecture 11: take on an array literal');
  await extra('const proto = Object.getPrototypeOf;\nconsole.log(typeof Iterator, proto(proto("ab"[Symbol.iterator]())) === Iterator.prototype, proto(proto(proto((function* () {})()))) === Iterator.prototype);',
    ['function true true'], 'lecture 2: Iterator is global; string iterators and generators inherit from it');
  // lecture 4: filter gets the counter too; the RangeError texts; flatMap with a string
  await extra('console.log(["a", "b", "c"].values().filter((x, i) => i !== 1).toArray());', ["(2) ['a', 'c']"], 'lecture 4: filter gets the counter');
  await extra('[1].values().take(-1);', ['! -1 must be positive'], 'lecture 4: take(-1)');
  await extra('[1].values().drop(-1);', ['! -1 must be positive'], 'lecture 11: drop(-1)');
  await extra('[1].values().take(NaN);', ['! NaN must be positive'], 'lecture 4: take(NaN)');
  await extra('console.log([1, 2, 3].values().take("2").toArray(), [1, 2].values().take(10).toArray());', ['(2) [1, 2] (2) [1, 2]'], 'lecture 4: the argument becomes a number; more than there is — everything');
  await extra('console.log([1, 2].values().flatMap((x) => String(x)).toArray());', ['! Iterator.prototype.flatMap called on non-object'], 'lecture 4: flatMap with a string');
  await extra('console.log(["ab"].values().flatMap((s) => Iterator.from(s)).toArray());', ["(2) ['a', 'b']"], 'lecture 4: a string through Iterator.from');
  // lecture 5: reduce on an empty iterator, includes and NaN, finally after find
  await extra('[].values().reduce((a, b) => a + b);', ['! Reduce of a done iterator with no initial value'], 'lecture 5: reduce of an empty iterator');
  await extra('function* g() {\n  try {\n    yield NaN;\n    yield 1;\n  } finally {\n    console.log("finally");\n  }\n}\nconsole.log(g().includes(NaN));\nconsole.log([...g()].length);', ['finally', 'true', 'finally', '2'], 'lecture 5: includes finds NaN and closes');
  await extra('function* lessons() {\n  yield "лекция";\n  yield "практика";\n}\nconst seq = lessons();\nconst f = seq.filter(() => true);\nconsole.log(f.next().value, seq.next().value);', ['лекция практика'], 'lecture 5: filter(…).next() does not close');
  // lecture 7: return() of a helper before the start; next(value) is not passed on
  await extra('function* lessons() {\n  try {\n    yield "лекция";\n  } finally {\n    console.log("источник закрыт");\n  }\n}\nconst src = lessons();\nconsole.log(src.take(2).return(), src.next());', ['{value: undefined, done: true} {value: undefined, done: true}'], 'lecture 7: a helper closed before the start closes a source that has not started — no finally');
  await extra('function* echo() {\n  const got = yield 1;\n  console.log("получено:", got);\n  yield 2;\n}\nconst h = echo().map((x) => x);\nh.next();\nh.next("ответ");', ['получено: undefined'], 'lecture 7: next(value) does not go through a helper');
  // lecture 8–9: Iterator.from(5), Iterator() without new
  await extra('Iterator.from(5);', ['! Iterator.from called on non-object'], 'lecture 8: Iterator.from(5)');
  await extra('Iterator();', ["! Constructor Iterator requires 'new'"], 'lecture 9: Iterator() without new');
  // lecture 10: concat rejects strings; zip modes; chunks and windows are not there; Symbol.dispose calls return()
  await extra('Iterator.concat([1], "ab");', ['! Iterator.concat called on non-object'], 'lecture 10: concat rejects a string');
  await extra('console.log(JSON.stringify(Iterator.zip([["book", "water", "bread"], ["книга", "вода"]], { mode: "longest" }).toArray()), Iterator.zip([["book", "water", "bread"], ["книга", "вода"]], { mode: "longest" }).toArray()[2][1]);',
    ['[["book","книга"],["water","вода"],["bread",null]] undefined'], 'lecture 10: zip longest fills undefined');
  await extra('Iterator.zip([[1, 2], [1]], { mode: "strict" }).toArray();', ["! Iterators passed to Iterator.zip in 'strict' mode must have the same length"], 'lecture 10: zip strict');
  await extra('console.log(typeof Iterator.prototype.chunks, typeof Iterator.prototype.windows, typeof Iterator.prototype.includes, typeof Iterator.prototype.join, typeof Iterator.zipKeyed);', ['undefined undefined function function function'], 'lecture 10: Chrome 155 has no chunks and windows');
  await extra('function* g() {\n  try {\n    yield 1;\n    yield 2;\n  } finally {\n    console.log("уборка");\n  }\n}\nconst it = g();\nit.next();\nit[Symbol.dispose]();\nconsole.log(it.next());', ['уборка', '{value: undefined, done: true}'], 'lecture 10: Symbol.dispose calls return()');
  // lecture 11: map(5)
  await extra('[1].values().map(5);', ['! number 5 is not a function'], 'lecture 11: map(5)');
  // lecture 12: the helper's tag
  await extra('const h = [1].values().map((x) => x);\nconsole.log(Object.prototype.toString.call(h), Object.getOwnPropertyNames(Object.getPrototypeOf(h)));', ["[object Iterator Helper] (2) ['next', 'return']"], 'lecture 12: an Iterator Helper with next and return');

  // lecture 13, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'class Deck {');
    const counted = cards.replace('console.log(Iterator.from(deck).filter((c) => !c[LEARNED])', 'let calls = 0;\nconsole.log(Iterator.from(deck).filter((c) => (calls++, !c[LEARNED]))');
    check(counted !== cards, 'lecture 13: the filter of line 1 counted');
    const withTake = await runOnPage([`${counted}\nconsole.log(calls);`]);
    const noTake = await runOnPage([`${counted.replace('.map((c) => c.word).take(3).toArray());', '.map((c) => c.word).toArray());')}\nconsole.log(calls);`]);
    check(withTake[6] === '4' && noTake[0] === "(6) ['book', 'lesson', 'bread', 'apple', 'house', 'window']" && noTake[6] === '8',
      `lecture 13, experiment 1: 6 words without take; filter 4 times with take, 8 without: ${JSON.stringify([withTake[6], noTake[0], noTake[6]])}`);
    const allLearned = cards.replace('deck.learn("water");', 'deck.learn("water");\nfor (const word of ["book", "lesson", "bread", "apple", "house", "window"]) deck.learn(word);');
    const out2 = await runOnPage([allLearned]);
    check(out2[0] === '(0) []' && out2[5] === '(0) []', `lecture 13, experiment 2: everything learned — lines 1 and 6 are empty: ${JSON.stringify(out2)}`);
    const arrayFirst = cards.replace('Iterator.from(deck).filter((c) => c.topic === "еда")', 'Iterator.from(deck).toArray().filter((c) => c.topic === "еда")');
    check(arrayFirst !== cards, 'lecture 13, experiment 3: toArray first');
    const base = await runOnPage([cards]);
    const out3 = await runOnPage([arrayFirst]);
    check(same(out3, base), 'lecture 13, experiment 3: the same output from array methods');
  }

  // task 2: take on the array itself; how many values the iterator chain looked at
  await extra('const marks = [5, 3, 4, 2, 5, 4];\nlet seen = 0;\nconst best = marks.values().filter((m) => (seen++, m >= 4)).map((m) => m * 10).take(2).toArray();\nconsole.log(best, seen);\nmarks.take(2);', ['(2) [50, 40] 3', '! marks.take is not a function'], 'task 2: the iterator chain and the error');
  // task 3: the expressions that answer
  await extra(`${NATURALS}console.log(typeof naturals().map((n) => n * 2).next, naturals().find((n) => n > 10), naturals().filter((n) => n % 7 === 0).take(3).toArray(), naturals().take(3).filter((n) => n % 7 === 0).toArray(), naturals().every((n) => n < 5), naturals().drop(1000).take(1).toArray());`,
    ['function 11 (3) [7, 14, 21] (0) [] false (1) [1001]'], 'task 3: six of eight answer');
  // task 4: first N of an endless counter
  await extra(`function* counter() {\n  let n = 1;\n  while (true) yield n++;\n}\nconsole.log(counter().take(5).toArray(), counter().filter((n) => n % 2 === 1).map((n) => n * n).take(5).toArray(), counter().take(10).reduce((a, b) => a + b), counter().find((n) => n * n > 50));`,
    ['(5) [1, 2, 3, 4, 5] (5) [1, 9, 25, 49, 81] 55 8'], 'task 4: the numbers of the criteria');
  // task 5: pages with helpers
  await extra(`function* pages(list, size) {\n  for (let start = 0; start < list.length; start += size) {\n    yield list.slice(start, start + size);\n  }\n}\nconst words = ["book", "teacher", "lesson", "bread", "water", "apple", "house", "window"];\nconsole.log(JSON.stringify(pages(words, 3).drop(1).take(1).toArray()), pages(words, 3).map((page, i) => \`\${i + 1}: \${page.join(" ")}\`).toArray());\nconsole.log(pages(words, 3).flatMap((page) => page).reduce((n) => n + 1, 0), pages(words, 3).some((page) => page.includes("water")));`,
    ["[[\"bread\",\"water\",\"apple\"]] (3) ['1: book teacher lesson', '2: bread water apple', '3: house window']", '8 true'], 'task 5: the numbers of the criteria');
  // task 6: a proper iterator
  await extra(`const plain = {\n  n: 0,\n  next() {\n    return this.n < 3 ? { value: this.n++, done: false } : { value: undefined, done: true };\n  },\n};\nconsole.log(typeof plain.map, Iterator.from(plain).map((x) => x * 10).toArray());\nclass Countdown extends Iterator {\n  #n;\n  constructor(n) {\n    super();\n    this.#n = n;\n  }\n  next() {\n    return this.#n > 0 ? { value: this.#n--, done: false } : { value: undefined, done: true };\n  }\n}\nconsole.log(new Countdown(5).filter((x) => x % 2 === 1).toArray(), [...new Countdown(3)]);\nconst gen = (function* () {})();\nconsole.log(Iterator.from(gen) === gen, Iterator.from(plain) === plain);`,
    ['undefined (3) [0, 10, 20]', '(3) [5, 3, 1] (3) [3, 2, 1]', 'true false'], 'task 6: the numbers of the criteria');
  // task 7: the journal
  await extra(`${find('tasks', 'const students = [')}
const average = (marks) => marks.reduce((a, b) => a + b) / marks.length;
function* counter() {
  let n = 1;
  while (true) yield n++;
}
console.log(students.values().filter((s) => average(s.marks) >= 4.5).map((s) => s.name).toArray(), students.values().find((s) => s.marks.includes(2)).name, students.values().every((s) => s.marks.includes(5)));
console.log(students.values().flatMap((s) => s.marks).reduce((a, b) => a + b), students.values().flatMap((s) => s.marks).filter((m) => m === 5).reduce((n) => n + 1, 0));
console.log(Iterator.zip([counter(), students]).map(([n, s]) => \`\${n}. \${s.name}\`).toArray());`,
    ["(2) ['Аман', 'Айна'] Мерет false", '49 5', "(4) ['1. Аман', '2. Мерет', '3. Айна', '4. Сапар']"], 'task 7: the numbers of the criteria');
  // task 8: who closes the source
  await extra(`const log = [];
function* src() {
  try {
    yield 1;
    yield 2;
    yield 3;
  } finally {
    log.push("закрыт");
  }
}
const rows = [];
const run = (name, fn) => {
  log.length = 0;
  fn();
  rows.push(\`\${name}: \${log.length}\`);
};
run("take(2).toArray()", () => src().take(2).toArray());
run("toArray()", () => src().toArray());
run("find 2", () => src().find((x) => x === 2));
run("find 9", () => src().find((x) => x === 9));
run("some", () => src().some((x) => x > 1));
run("every", () => src().every((x) => x < 2));
run("map", () => src().map((x) => x));
run("map().return()", () => src().map((x) => x).return());
run("map, next, return", () => {
  const h = src().map((x) => x);
  h.next();
  h.return();
});
console.log(rows.join("; "));`,
    ['take(2).toArray(): 1; toArray(): 1; find 2: 1; find 9: 1; some: 1; every: 1; map: 0; map().return(): 0; map, next, return: 1'], 'task 8: seven of nine close the source');
  // task 9: an own zip that closes the longer iterator, like Iterator.zip
  await extra(`function* zip(a, b) {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  while (true) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) {
      if (!x.done) ia.return?.();
      if (!y.done) ib.return?.();
      return;
    }
    yield [x.value, y.value];
  }
}
function* long() {
  try {
    yield "book";
    yield "water";
    yield "bread";
  } finally {
    console.log("длинный закрыт");
  }
}
const ru = ["книга", "вода"];
console.log(JSON.stringify([...zip(long(), ru)]));
console.log(JSON.stringify(Iterator.zip([long(), ru]).toArray()));
try {
  Iterator.zip(["ab", "cd"]).toArray();
} catch (e) {
  console.log(e.message, JSON.stringify(Iterator.zip([Iterator.from("ab"), Iterator.from("cd")]).toArray()));
}`,
    ['длинный закрыт', '[["book","книга"],["water","вода"]]', 'длинный закрыт', '[["book","книга"],["water","вода"]]', 'ab is not iterable [["a","c"],["b","d"]]'], 'task 9: both close the longer iterator; strings through Iterator.from');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
