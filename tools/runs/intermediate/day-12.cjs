// Course 2, day 12, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object (a generator shows its function's name and the internal slot: genFunc {[[GeneratorState]]: 'suspended'}),
// a subclass of Array with its name too, a symbol as Symbol(description); an uncaught error is "! message" (V8 text;
// the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-12.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-12.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem; every EXPECT key is in exactly one block.
// Extra runs cover the claims of the prose (syntax errors around yield, hoisting, return() with yield in finally,
// throw() before the start, the states DevTools shows, the prototype chain), the three experiments of «Карточки»
// and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-12');
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
  'const [first, ...others] = range;': ['(4) [1, 2, 3, 4] 4', '1 (3) [2, 3, 4]'],
  'const b = counter();': ['1 2 1 3'],
  'class Box { *items() { yield 4; } }': ['(4) [1, 2, 3, 4]', 'expressed questions function'],
  'const loose = lesson.cards;': ["(2) ['еда', 3]", 'undefined'],
  'return "конец";': ["{value: 'да', done: false} {value: 'нет', done: false}", "{value: 'конец', done: true} {value: undefined, done: true}", "(2) ['да', 'нет']"],
  'let [current, after] = [0, 1];': ['(10) [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]'],
  'const pager = pages(words, 3);': ["(3) ['book', 'teacher', 'lesson']", "(3) ['bread', 'water', 'apple']", "(2) ['house', 'window']", 'true'],
  'const second = yield "3 · 3?";': ["{value: '2 + 2?', done: false}", "{value: '3 · 3?', done: false}", "{value: 'ответы: 4, 9', done: true}"],
  'function* sum() {': ['первое число? второе число? {value: 5, done: true}'],
  'function* safe() {': ['42', 'поймано внутри: сбой', '42'],
  'function* plain() {': ['снаружи: сбой', '{value: undefined, done: true}'],
  'const result = yield* inner();': ['yield* вернул: inner готов', "(7) [1, 2, 3, 4, 5, 'а', 'б']"],
  'function* outerPart() {': ['внутренний 1', 'закрыт внутренний', 'закрыт внешний'],
  'it = getNumbers(0);': ['! Generator is already running'],
  'function* gen(a = yield 1) {}': ['! Yield expression not allowed in formal parameter'],
  'const generatorProto = proto(proto(gen));': ['true (0) []', "(4) ['constructor', 'next', 'return', 'throw'] Generator", 'true [object Generator]'],
  'const twice = new GeneratorFunction': ['(2) [20, 30] anonymous undefined', 'true true'],
  'function* greet(name =': ['параметр вычислен', 'генератор создан', 'тело началось', 'салам, Аман'],
  // tasks
  'function* steps() {': ['старт', 'A', '1', 'B 5', '10', 'C', 'true'],
  'return "b";': ["(1) ['a'] 1", "{value: 'a', done: false} {value: 'b', done: true} {value: undefined, done: true}", 'a'],
  'title: "Learn JavaScript",': [],
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

  // lecture 2: new, hoisting
  await extra('function* counter() {}\nnew counter();', ['! counter is not a constructor'], 'lecture 2: a generator function is not a constructor');
  await extra('console.log(early().next().value);\nfunction* early() {\n  yield "до своей строки";\n}', ['до своей строки'], 'lecture 2: function* is hoisted');
  // lecture 3: no arrow generator; spaces around the star
  await extra('const g = *() => {};', ["! Unexpected token '*'"], 'lecture 3: no arrow generator');
  await extra('function *spaced() {\n  yield 1;\n}\nfunction* tight() {\n  yield 2;\n}\nconsole.log([...spaced(), ...tight()]);', ['(2) [1, 2]'], 'lecture 3: the star may stand anywhere');
  // lecture 4 and 11: yield in nested functions, yield as a name
  await extra('function* gen() {\n  [1, 2].forEach((x) => {\n    yield x;\n  });\n}', ["! Unexpected identifier 'x'"], 'lecture 11: yield x in a callback');
  await extra('function* gen() {\n  function inner() {\n    yield 1;\n  }\n}', ['! Unexpected number'], 'lecture 11: yield 1 in a nested function');
  await extra('function* gen() {\n  const yield = 5;\n}', ["! Unexpected identifier 'yield'"], 'lecture 11: yield as a name inside a generator');
  await extra('var yield = 5;\nconsole.log(yield);', ['5'], 'lecture 4: outside generators and strict mode yield is a name');
  await extra('function* g() {\n  const got = yield;\n  console.log("получено:", got);\n}\nconst it = g();\nconsole.log(it.next().value);\nit.next(7);', ['undefined', 'получено: 7'], 'lecture 4: yield without a value');
  // lecture 5: the array iterator goes on after break, the generator does not
  await extra('const it = ["a", "b"][Symbol.iterator]();\nfor (const x of it) break;\nconsole.log([...it]);\nfunction* g() {\n  yield "a";\n  yield "b";\n}\nconst gen = g();\nfor (const x of gen) break;\nconsole.log([...gen], typeof gen.return);', ["(1) ['b']", '(0) [] function'], 'lecture 5: break closes a generator, not an array iterator');
  // lecture 8: return() with yield in finally
  await extra('function* gen() {\n  yield 1;\n  try {\n    yield 2;\n  } finally {\n    yield "уборка";\n  }\n}\nconst g = gen();\ng.next();\ng.next();\nconsole.log(g.return("рано"), g.next());', ["{value: 'уборка', done: false} {value: 'рано', done: true}"], 'lecture 8: yield in finally gives done: false');
  // lecture 9: throw() before the start cannot be caught; an error in the body closes the generator
  await extra('function* gen() {\n  try {\n    yield 1;\n  } catch (e) {\n    console.log("не дойдёт");\n  }\n}\nconst g = gen();\ntry {\n  g.throw(new Error("рано"));\n} catch (e) {\n  console.log("снаружи:", e.message);\n}\nconsole.log(g.next());', ['снаружи: рано', '{value: undefined, done: true}'], 'lecture 9 and 13: throw() before the start');
  await extra('function* g() {\n  yield 1;\n  throw new Error("в теле");\n}\nconst it = g();\nit.next();\ntry {\n  it.next();\n} catch (e) {\n  console.log("next бросил:", e.message);\n}\nconsole.log(it.next());', ['next бросил: в теле', '{value: undefined, done: true}'], 'lecture 9: an error in the body');
  // lecture 10: yield* of a non-iterable
  await extra('function* g() {\n  yield* 5;\n}\ng().next();', ['! number 5 is not iterable (cannot read property Symbol(Symbol.iterator))'], 'lecture 10: yield* 5');
  // lecture 12–13: the prototype chain, gen.constructor, what DevTools shows
  await extra('function* genFunc() {\n  yield 1;\n}\nconst gen = genFunc();\nconst proto = Object.getPrototypeOf;\nconsole.log(Object.hasOwn(genFunc.prototype, "constructor"), gen.constructor === proto(genFunc), typeof gen.constructor, proto(proto(proto(gen))) === proto(proto([][Symbol.iterator]())));\nconsole.log(proto(genFunc) === proto(function* () {}), proto(proto(genFunc)) === Function.prototype);',
    ['false true object true', 'true true'], 'lecture 12: no own constructor; Iterator.prototype next in the chain');
  await extra('const gen = (function* genFunc() {\n  console.log(gen);\n  yield 1;\n})();\nconsole.log(gen);\ngen.next();\ngen.next();\nconsole.log(gen);',
    ["genFunc {[[GeneratorState]]: 'suspended'}", "genFunc {[[GeneratorState]]: 'running'}", "genFunc {[[GeneratorState]]: 'closed'}"], 'lecture 12–13: DevTools names the states suspended, running, closed');
  await extra('function* g() {\n  yield 1;\n}\nconst it = g();\nit.next();\nit.next();\nconsole.log(it.next(), it.next());', ['{value: undefined, done: true} {value: undefined, done: true}'], 'lecture 13: completed answers done: true forever');

  // lecture 14, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'class Deck {');
    const noFinally = cards.replace('    try {\n', '    {\n').replace('    } finally {\n      console.log(`сессия окончена: верно ${right}`);\n    }\n', '    }\n');
    check(noFinally !== cards && !noFinally.includes('finally'), 'lecture 14, experiment 1: try and finally removed');
    const out1 = await runOnPage([noFinally]);
    check(out1.length === 9 && !out1.some((l) => l.startsWith('сессия')) && out1[5] === '{value: 3, done: true}', `lecture 14, experiment 1: the two finally lines are gone: ${JSON.stringify(out1)}`);
    const first = cards.replace('console.log(session.next().value);', 'console.log(session.next("книга").value);');
    check(first !== cards, 'lecture 14, experiment 2: the answer goes to the first next');
    const base = await runOnPage([cards]);
    const out2 = await runOnPage([first]);
    check(same(out2, base), 'lecture 14, experiment 2: the first answer is lost, the score is the same');
    const head = cards.split('\nconst session = deck.quiz();')[0];
    await extra(`${head}\nconst one = deck.quiz();\nconst two = deck.quiz();\nconsole.log(one.next().value, two.next().value);\nconsole.log(one.next("книга").value, two.next("нет").value);\none.return();\ntwo.return();`,
      ["(4) ['book', 'bread', 'water', 'house']", 'book — ? book — ?', 'bread — ? bread — ?', 'сессия окончена: верно 1', 'сессия окончена: верно 0'], 'lecture 14, experiment 3: two quizzes keep their own score, the deck is shared');
  }

  // task 1: one more next after the end
  await extra(`${find('tasks', 'function* steps() {')}\nconsole.log(it.next());`, ['старт', 'A', '1', 'B 5', '10', 'C', 'true', '{value: undefined, done: true}'], 'task 1: after the end');
  // task 2: four forms
  await extra(`function* declared() {
  yield "красный"; yield "жёлтый"; yield "зелёный";
}
const expressed = function* () {
  yield* declared();
};
const lights = { *colors() { yield* declared(); } };
class Lights { *colors() { yield* declared(); } }
const arrays = [[...declared()], [...expressed()], [...lights.colors()], [...new Lights().colors()]];
console.log(arrays.every((a) => a.join() === "красный,жёлтый,зелёный"), declared.name, expressed.name, lights.colors.name, Lights.prototype.colors.name, typeof declared, typeof declared());
try { new declared(); } catch (e) { console.log(e.message); }`, ['true declared expressed colors colors function object', 'declared is not a constructor'], 'task 2: four forms');
  // task 3: all three letters
  await extra('function* g() {\n  yield "a";\n  yield "b";\n  yield "c";\n}\nfor (const x of g()) console.log(x);\nfunction* h() {\n  yield "a";\n  return "b";\n}\nconst it = h();\nit.next();\nconsole.log(it.next().value);', ['a', 'b', 'c', 'b'], 'task 3: yield all three; read return by hand');
  // task 4: range as a generator
  await extra(`function* range(from, to, step = 1) {
  for (let n = from; step > 0 ? n <= to : n >= to; n += step) {
    yield n;
  }
}
const r = range(1, 10, 3);
console.log([...range(1, 10, 3)], [...range(5, 1, -2)], [...range(3, 1)], Math.max(...range(1, 5)));
console.log([...r], [...r]);
const reusable = { *[Symbol.iterator]() { yield* range(1, 10, 3); } };
console.log([...reusable], [...reusable]);`, ['(4) [1, 4, 7, 10] (3) [5, 3, 1] (0) [] 5', '(4) [1, 4, 7, 10] (0) []', '(4) [1, 4, 7, 10] (4) [1, 4, 7, 10]'], 'task 4: one-off generator, reusable object');
  // task 5: the tree
  await extra(`${find('tasks', 'title: "Learn JavaScript",')}
function* walk(node, depth = 0) {
  yield { title: node.title, depth };
  for (const child of node.children ?? []) yield* walk(child, depth + 1);
}
function* leaves(node) {
  if (!node.children) {
    yield node.title;
    return;
  }
  for (const child of node.children) yield* leaves(child);
}
function* countAll(node) {
  let count = 1;
  for (const child of node.children ?? []) {
    const n = yield* countAll(child);
    count += n;
  }
  yield node.title;
  return count;
}
const nodes = [...walk(course)];
console.log(nodes.length, Math.max(...nodes.map((n) => n.depth)), [...leaves(course)]);
const it = countAll(course);
let step = it.next();
while (!step.done) step = it.next();
console.log(step.value);`, ["9 3 (5) ['Переменные', 'Функции', 'События', 'Символы', 'Генераторы']", '9'], 'task 5: the numbers of the criteria');
  // task 6: Fibonacci with a reset
  await extra(`function* fibonacci() {
  let [current, after] = [0, 1];
  while (true) {
    const reset = yield current;
    [current, after] = [after, current + after];
    if (reset) [current, after] = [0, 1];
  }
}
const first = [];
for (const n of fibonacci()) {
  if (first.length === 10) break;
  first.push(n);
}
const seq = fibonacci();
console.log(first, [seq.next().value, seq.next().value, seq.next().value, seq.next().value, seq.next(true).value, seq.next().value]);`,
  ['(10) [0, 1, 1, 2, 3, 5, 8, 13, 21, 34] (6) [0, 1, 1, 2, 0, 1]'], 'task 6: the numbers of the criteria');
  // task 7: seven cases of finally
  await extra(`const log = [];
function* lines() {
  try {
    yield 1;
    yield 2;
    yield 3;
  } finally {
    log.push("уборка");
  }
}
const rows = [];
const run = (name, fn) => { log.length = 0; try { fn(); } catch (e) {} rows.push(\`\${name}: \${log.length}\`); };
run("full", () => { for (const x of lines()) {} });
run("break", () => { for (const x of lines()) break; });
run("[a]", () => { const [a] = lines(); });
run("return()", () => { const g = lines(); g.next(); g.return(); });
run("return() before start", () => { lines().return(); });
run("throw()", () => { const g = lines(); g.next(); g.throw(new Error("x")); });
run("body error", () => { for (const x of lines()) throw new Error("x"); });
console.log(rows.join(", "));
const g = lines();
g.next();
g.return();
console.log(g.next());`, ['full: 1, break: 1, [a]: 1, return(): 1, return() before start: 0, throw(): 1, body error: 1', '{value: undefined, done: true}'], 'task 7: finally runs in six cases of seven');
  // task 8: a quiz with a skip
  await extra(`function* quiz(questions) {
  let score = 0;
  for (const [question, right] of questions) {
    try {
      const answer = yield question;
      if (answer === right) score++;
    } catch (error) {
      console.log("пропуск:", error.message);
    }
  }
  return score;
}
const q = quiz([["2 + 2?", 4], ["3 · 3?", 9], ["10 − 7?", 3]]);
console.log(q.next().value);
console.log(q.next(4).value);
console.log(q.throw(new Error("не знаю")).value);
console.log(q.next(3));
const early = quiz([["2 + 2?", 4]]);
try { early.throw(new Error("не знаю")); } catch (e) { console.log("до старта — снаружи:", e.message); }`,
  ['2 + 2?', '3 · 3?', 'пропуск: не знаю', '10 − 7?', '{value: 2, done: true}', 'до старта — снаружи: не знаю'], 'task 8: next, throw and the score');
  // task 9: yield* and the result
  await extra(`function* inner() {
  try {
    yield "a";
    yield "b";
    return 2;
  } finally {
    console.log("inner закрыт");
  }
}
function* outer() {
  const n = yield* inner();
  const m = yield* inner();
  return n + m;
}
const got = [];
const it = outer();
let s = it.next();
while (!s.done) {
  got.push(s.value);
  s = it.next();
}
console.log(got, s.value);
const it2 = outer();
it2.next();
console.log(it2.return("стоп"));
console.log([...outer()].length);
function* plainOuter() {
  yield inner();
}
console.log(String([...plainOuter()][0]));`,
  ['inner закрыт', 'inner закрыт', "(4) ['a', 'b', 'a', 'b'] 4", 'inner закрыт', "{value: 'стоп', done: true}", 'inner закрыт', 'inner закрыт', '4', '[object Generator]'], 'task 9: yield* forwards and returns');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
