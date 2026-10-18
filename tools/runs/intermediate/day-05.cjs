// Course 2, day 5, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it (objects too: a descriptor is {value: 5, writable: true, …},
// a function inside is ƒ, a getter not yet read is (...)); an uncaught error is "! message" (V8 text; the prefix
// that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-05.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-05.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; extra runs cover the claims of the prose (errors named in the text, the three experiments
// of «Карточки») and reference solutions of tasks 4–9 against the numbers and lines their criteria give.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-05');
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
const A = (get, set, e, c) => `{get: ${get}, set: ${set}, enumerable: ${e}, configurable: ${c}}`;

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(Object.hasOwn(greet, "name"));': ['greet', '(0) []', 'true'],
  'console.log(Object.getOwnPropertyDescriptor(student, "phone"));': [D("'Аман'", true, true, true), D("'greet'", false, false, true), 'undefined'],
  'console.log(Object.getOwnPropertyDescriptor(Math, "PI"));': [D(Math.PI, false, false, false), D(2, true, false, false), D(5, true, true, true)],
  'console.log(quiz.id);   // 7 — запись молча не сработала': ['7', D(7, false, false, false)],
  "// TypeError: Cannot assign to read only property 'id'": ["! Cannot assign to read only property 'id' of object '#<Object>'"],
  'console.log(student.propertyIsEnumerable("id"));': ['17', "(1) ['name']", '{"name":"Аман"}', "{name: 'Аман'}", "(2) ['name', 'id']", 'false'],
  'console.log(Object.getOwnPropertyNames(greet));': ["(1) ['calls']", "(4) ['length', 'name', 'prototype', 'calls']"],
  'console.log(delete Math.PI, Math.PI);': [`false ${Math.PI}`],
  "// TypeError: Cannot delete property 'PI'": ["! Cannot delete property 'PI' of #<Object>"],
  'console.log(delete globalThis.level, delete globalThis.other);': ['false true'],
  'Object.defineProperty(quiz, "id", { value: 8 });': ['! Cannot redefine property: id'],
  'Object.defineProperty(quiz, "id", { writable: false });': ['9', '! Cannot redefine property: id'],
  'console.log(fastSquare.name, fastSquare(4));': ['memo square 16'],
  'Object.defineProperty(quiz, "total", { value: 8 });': [D(5, true, true, true), D(8, false, false, false)],
  'console.log(Object.keys(deck), deck.version);': ["(1) ['title'] 2", '{title: {…}, version: {…}}'],
  'Object.defineProperty({}, "x", 5);': ['! Property description must be an object: 5'],
  'console.log(student.average);   // 4.666666666666667': ['4.666666666666667', '4.25'],
  'get average(round) {': ['! Getter must not have any formal parameters.'],
  'student.average = 5;': ['! Cannot set property average of #<Object> which has only a getter'],
  'student.mark = "5";': ['оценка 7 не принята', 'оценка 5 не принята', '4'],
  'set mark() {},': ['! Setter must have exactly one formal parameter.'],
  'this.name = value;   // запись в name снова вызывает этот же сеттер': ['! Maximum call stack size exceeded'],
  'console.log(Object.getOwnPropertyDescriptor(student, "_mark"));': [D(5, true, true, true), A('ƒ', 'undefined', true, true)],
  'console.log(quiz.total, Object.keys(quiz));': ["3 (1) ['words']"],
  'Object.defineProperty({}, "total", {': ['! Invalid property descriptor. Cannot both specify accessors and a value or writable attribute, #<Object>'],
  'const d = Object.getOwnPropertyDescriptor(window, "name");': ['function function'],
  'console.log(JSON.stringify(student));   // {"_mark":5,"mark":5}': ["(2) ['_mark', 'mark']", '{"_mark":5,"mark":5}'],
  'console.log(student.mark, Object.keys(student));   // 3': ["3 (1) ['mark']", '{"mark":3}'],
  'console.log(quiz.show.name, quiz.go.name);': [D('ƒ', true, true, true), 'show go', 'false true'],
  'console.log(results.score, results.scoreMax(), results.scoreMax.name);': ['10 20 scoreMax'],
  'console.log(flat.average, full.average);': ['4.5 3'],
  'const box = { hasOwnProperty: 1, name: "коробка" };': ['true', '! box.hasOwnProperty is not a function'],
  'const settings = Object.freeze({ theme: "светлая" });': [D("'светлая'", false, true, false)],
  // tasks
  'console.log(Object.getOwnPropertyDescriptor(Math, "max"));': [D("'Аман'", true, true, true), A('ƒ', 'undefined', true, true), D(3, true, false, false), D(1, false, false, true), D('ƒ', true, false, true)],
  'console.log("b" in box, Object.hasOwn(box, "b"), box.propertyIsEnumerable("b"));': ["(2) ['a', 'c']", "(3) ['a', 'b', 'c']", '{"a":1,"c":3}', 'true true false', 'a', 'c'],
  'get minutes(unit) {': ['! Getter must not have any formal parameters.'],
  'set seconds() {},': ['! Setter must have exactly one formal parameter.'],
  'Object.defineProperty({}, "size", 5);': ['! Property description must be an object: 5'],
  'Object.defineProperty(card, "size", { value: 6 });': ['! Cannot redefine property: size'],
  'const group = {': [],
  'Object.defineProperty(config, "MAX_WORDS", { value: 8, enumerable: true });': ["{MAX_WORDS: 8} (1) ['MAX_WORDS']"],
  'console.log(run(detailed));': ['проверено подробно: слово'],
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

  // lecture, prose claims
  {
    const out = await runOnPage(['console.log(Object.keys([5, 4]), Object.keys(Math).length, Object.getOwnPropertyNames(Math).length > 40);']);
    check(out[0] === "(2) ['0', '1'] 0 true", `lecture 2, 4: Object.keys([5, 4]); Math hides more than forty: ${out[0]}`);
  }
  {
    const code = find('lecture', 'console.log(fastSquare.name, fastSquare(4));').replace('return n * n;', 'throw new Error("ошибка");');
    const out = await runOnPage([code.replace(/console\.log\(fastSquare\.name, fastSquare\(4\)\);.*$/m, 'try { fastSquare(4); } catch (e) { console.log(e.stack.split("\\n")[2].trim().split(" (")[0]); }')]);
    check(out[0] === 'at memo square', `lecture 5: the stack shows the renamed wrapper: ${out[0]}`);
  }
  {
    const out = await runOnPage(['Object.defineProperty(5, "x", {});']);
    check(out[0] === '! Object.defineProperty called on non-object', `lecture 6: a non-object first argument: ${out[0]}`);
  }
  {
    const out = await runOnPage(['Object.defineProperties({}, { title: "Карточки" });']);
    check(out[0] === '! Property description must be an object: Карточки', `lecture 6: defineProperties with a value that is not a descriptor: ${out[0]}`);
  }
  {
    const out = await runOnPage(['const o = {};\nObject.defineProperty(o, "x", {});\nconsole.log(o.x, Object.keys(o).length, delete o.x, "x" in o);']);
    check(out[0] === 'undefined 0 false true', `lecture 6, rule 1: an empty descriptor — undefined, hidden, not deletable: ${out[0]}`);
  }
  {
    const code = find('lecture', 'student.average = 5;').replace('"use strict";\n', '') + '\nconsole.log(student.average);';
    const out = await runOnPage([code]);
    check(same(out, ['4.5']), `lecture 7: without "use strict" the write is lost, average stays 4.5: ${JSON.stringify(out)}`);
  }
  {
    const out = await runOnPage(['const o = { set mark(...all) {} };']);
    check(out[0] === '! Setter function argument must not be a rest parameter', `lecture 8: a rest parameter of a setter: ${out[0]}`);
  }
  {
    const out = await runOnPage(['const o = { set a(v = 1) { this.x = v; }, set b({ v }) { this.y = v; } };\no.a = undefined;\no.b = { v: 2 };\nconsole.log(o.x, o.y, o.a);']);
    check(out[0] === '1 2 undefined', `lecture 8: a default value and destructuring are allowed; a setter-only property reads undefined: ${out[0]}`);
  }
  {
    const out = await runOnPage(['Object.defineProperty({}, "x", { get: 5 });']);
    check(out[0] === '! Getter must be a function: 5', `lecture 9: { get: 5 }: ${out[0]}`);
  }
  {
    const out = await runOnPage(['var name = 5;\nconst d = Object.getOwnPropertyDescriptor(window, "name");\nconsole.log(typeof name, d.set.name);\nwindow.name = "";']);
    check(out[0] === 'string set name', `lecture 9: var name = 5 goes through the setter of window.name: ${out[0]}`);
  }
  {
    const out = await runOnPage(['const p = document.createElement("p");\nconsole.log(Object.hasOwn(p, "textContent"), "textContent" in p, typeof Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML").set);']);
    check(out[0] === 'false true function', `lecture 9: textContent and innerHTML are inherited accessors: ${out[0]}`);
  }
  {
    const code = find('lecture', 'Object.defineProperty(student, "_mark", { value: 5, writable: true });');
    const out = await runOnPage([`${code}\nstudent._mark = 100;\nconsole.log(student.mark);`]);
    check(out[2] === '100', `lecture 10: the hidden field is not protected, _mark = 100 works: ${JSON.stringify(out)}`);
  }
  {
    const code = find('lecture', 'const field = "score";');
    const out = await runOnPage([`${code}\nconsole.log(Object.getOwnPropertyDescriptor(results, "score").get.name);\nconst quiz = { show() {} };\nnew quiz.show();`]);
    check(same(out.slice(1), ['get score', '! quiz.show is not a constructor']), `lecture 11: the getter's name, a method is not a constructor: ${JSON.stringify(out)}`);
  }
  // lecture 14, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const topics = ["все", "школа", "еда", "дом"];');
    const noWritable = cards.replace('{ value: "все", writable: true }', '{ value: "все" }');
    check(noWritable !== cards, 'lecture 14, experiment 1: the descriptor of _topic found');
    const out = await runOnPage([noWritable]);
    check(!out.some((l) => l.startsWith('! ')) && out[1] === 'темы «спорт» нет, осталась «все»' && out[2] === 'все: 5 карточки, выучено 38%',
      `lecture 14, experiment 1: no error, the topic stays «все»: ${JSON.stringify(out.slice(1, 3))}`);
    const strict = await runOnPage([`"use strict";\n${noWritable}`]);
    check(strict.length === 2 && strict[1] === "! Cannot assign to read only property '_topic' of object '#<Object>'",
      `lecture 14, experiment 1 in strict mode: the error comes at deck.topic = "еда": ${JSON.stringify(strict)}`);

    const keys = cards.replace('for (const key of', 'console.log(Object.keys(deck));\nfor (const key of').replace('const saved =', 'console.log(Object.keys(deck));\nconst saved =');
    const out2 = await runOnPage([keys]);
    check(out2.includes("(4) ['learned', 'topic', 'cards', 'percent']") && out2.includes("(2) ['learned', 'topic']"), `lecture 14, experiment 2: keys before and after, never _topic: ${JSON.stringify(out2.filter((l) => l.startsWith('(4)') || l.startsWith('(2)')))}`);

    const spread = cards.replace(/Object\.assign\(deck, (JSON\.parse\('.*?'\))\);\nconsole\.log\(deck\.learned, deck\.topic\);/, 'const loaded = { ...deck, ...$1 };\nconsole.log(loaded.topic, loaded.cards);');
    check(spread !== cards, 'lecture 14, experiment 3: the Object.assign line found');
    const out3 = await runOnPage([spread]);
    check(out3[out3.length - 1] === 'спорт undefined', `lecture 14, experiment 3: spread skips the setter and the hidden getters: ${out3[out3.length - 1]}`);
  }

  // notes: the comments of both blocks (they print nothing themselves)
  {
    const out = await runOnPage([`${all.student[0].code}
console.log(Object.getOwnPropertyDescriptor({ name: "Аман" }, "name"), Object.getOwnPropertyDescriptor(greet, "name"));
${all.student[1].code}
console.log(student.mark, JSON.stringify(student));`]);
    check(same(out, [`${D("'Аман'", true, true, true)} ${D("'greet'", false, false, true)}`, '5 {"mark":5}']), `notes: the descriptors and the JSON of the comments: ${JSON.stringify(out)}`);
  }

  // task 1: Math.max can be replaced (writable, configurable) though Object.keys(Math) is empty
  {
    const out = await runOnPage(['const old = Math.max;\nMath.max = () => 0;\nconsole.log(Math.max(1, 2), Object.keys(Math).length);\nMath.max = old;']);
    check(out[0] === '0 0', `task 1: Math.max replaced, keys still empty: ${out[0]}`);
  }
  // task 2: box.c = 30 is lost (writable: false)
  {
    const code = find('tasks', 'console.log("b" in box,');
    const out = await runOnPage([`${code}\nbox.c = 30;\nconsole.log(box.c);`]);
    check(out[out.length - 1] === '3', `task 2: box.c = 30 is lost: ${out[out.length - 1]}`);
  }
  // task 4: the numbers of the criteria and the strict-mode error, with a reference solution
  {
    const group = find('tasks', 'const group = {');
    const solution = `"use strict";
${group.replace('  ],\n};', `  ],
  get count() {
    return this.students.length;
  },
  get best() {
    const avg = (s) => s.marks.reduce((a, b) => a + b, 0) / s.marks.length;
    let best = this.students[0];
    for (const s of this.students) {
      if (avg(s) > avg(best)) best = s;
    }
    return best.name;
  },
  get average() {
    const marks = this.students.flatMap((s) => s.marks);
    return marks.reduce((a, b) => a + b, 0) / marks.length;
  },
};`)}
console.log(group.count, group.best, group.average);
group.students.push({ name: "Айна", marks: [4, 5] });
console.log(group.count, group.best, group.average);
group.count = 10;`;
    const out = await runOnPage([solution]);
    check(same(out, ['3 Сапар 4.375', '4 Сапар 4.4', '! Cannot set property count of #<Object> which has only a getter']), `task 4: ${JSON.stringify(out)}`);
  }
  // task 5: the example with a reference lesson
  {
    const ex = find('tasks', 'lesson.minutes = 45;');
    const said = [...ex.matchAll(/\/\/ (минуты .*)$/gm)].map((m) => m[1]);
    const out = await runOnPage([`const lesson = {
  get minutes() {
    return this._minutes;
  },
  set minutes(value) {
    if (!Number.isInteger(value) || value < 1 || value > 90) {
      console.log(\`минуты \${value} не приняты\`);
      return;
    }
    this._minutes = value;
  },
};
Object.defineProperty(lesson, "_minutes", { value: 0, writable: true });
Object.defineProperty(lesson, "label", { get() { return \`\${this.minutes} мин\`; } });
${ex}
console.log(Object.keys(lesson));`]);
    check(same(out, [...said, '45 мин {"minutes":45}', "(1) ['minutes']"]), `task 5: the example's comments and the criteria: ${JSON.stringify(out)}`);
  }
  // task 6: three actions in both modes, and the freeze descriptor is the same
  {
    const code = find('tasks', 'Object.defineProperty(config, "MAX_WORDS"');
    const sloppy = await runOnPage([`${code}\nconfig.MAX_WORDS = 10;\nconsole.log(config.MAX_WORDS, delete config.MAX_WORDS);\nObject.defineProperty(config, "MAX_WORDS", { value: 10 });`]);
    check(same(sloppy.slice(1), ['8 false', '! Cannot redefine property: MAX_WORDS']), `task 6, sloppy: ${JSON.stringify(sloppy.slice(1))}`);
    const strict = [];
    for (const action of ['config.MAX_WORDS = 10;', 'delete config.MAX_WORDS;', 'Object.defineProperty(config, "MAX_WORDS", { value: 10 });']) {
      const out = await runOnPage([`"use strict";\n${code}\n${action}`]);
      strict.push(out[1]);
    }
    check(same(strict, ["! Cannot assign to read only property 'MAX_WORDS' of object '#<Object>'", "! Cannot delete property 'MAX_WORDS' of #<Object>", '! Cannot redefine property: MAX_WORDS']),
      `task 6, strict: ${JSON.stringify(strict)}`);
    const frozen = await runOnPage([`${code}\nconst a = Object.getOwnPropertyDescriptor(config, "MAX_WORDS");\nconst b = Object.getOwnPropertyDescriptor(Object.freeze({ MAX_WORDS: 8 }), "MAX_WORDS");\nconsole.log(JSON.stringify(a) === JSON.stringify(b));`]);
    check(frozen[1] === 'true', `task 6: the freeze descriptor is the same: ${frozen[1]}`);
  }
  // task 7: before and after the helper
  {
    const code = find('tasks', 'console.log(run(detailed));').replace('console.log(run(detailed));', '');
    const out = await runOnPage([`${code}
function describe(wrapper, fn, prefix) {
  Object.defineProperty(wrapper, "name", { value: prefix + " " + fn.name });
  Object.defineProperty(wrapper, "length", { value: fn.length });
  return wrapper;
}
function plainOnce(fn) {
  let done = false;
  let result;
  return function (...args) {
    if (!done) {
      done = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}
function once(fn) {
  return describe(plainOnce(fn), fn, "once");
}
const wrapped = once(detailed);
console.log(run(plainOnce(detailed)));
console.log(run(wrapped), wrapped.name, Object.getOwnPropertyDescriptor(wrapped, "name").writable);`]);
    check(same(out, ['проверено undefined: слово', 'проверено подробно: слово once detailed false']), `task 7: ${JSON.stringify(out)}`);
  }
  // task 8: the spread copy takes mark = 7, the clone keeps the check and its own _mark
  {
    const out = await runOnPage([`const student = {
  name: "Аман",
  get mark() {
    return this._mark;
  },
  set mark(value) {
    if (Number.isInteger(value) && value >= 2 && value <= 5) {
      this._mark = value;
    }
  },
};
Object.defineProperty(student, "_mark", { value: 5, writable: true });
const clone = (obj) => Object.defineProperties({}, Object.getOwnPropertyDescriptors(obj));
const flat = { ...student };
const full = clone(student);
flat.mark = 7;
full.mark = 7;
full.mark = 3;
console.log(flat.mark, "_mark" in flat, full.mark, student.mark);`]);
    check(out[0] === '7 false 3 5', `task 8: spread copy, clone, original: ${out[0]}`);
  }
  // task 9: the example with a reference watch
  {
    const ex = find('tasks', 'watch(quiz, "position");');
    const said = [...ex.matchAll(/(position: \d → \d)/g)].map((m) => m[1]);
    const watch = `function watch(obj, key) {
  let value = obj[key];
  Object.defineProperty(obj, key, {
    get() {
      return value;
    },
    set(next) {
      console.log(\`\${key}: \${value} → \${next}\`);
      value = next;
    },
  });
}`;
    const out = await runOnPage([`${watch}\n${ex}\nconsole.log(Object.keys(quiz), JSON.stringify(quiz));`]);
    check(same(out, [...said, `(2) ['position', 'flipped'] {"position":3,"flipped":false}`]), `task 9: ${JSON.stringify(out)}`);
    const locked = await runOnPage([`${watch}\nconst quiz = {};\nObject.defineProperty(quiz, "position", { value: 0, writable: true });\nwatch(quiz, "position");`]);
    check(locked[0] === '! Cannot redefine property: position', `task 9, configurable: false: ${locked[0]}`);
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
