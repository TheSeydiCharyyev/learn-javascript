// Course 2, day 29, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. As on days 27–28, the three
// helpers of day 30 of Essentials (wait, later, failLater) stand at the top of app.js, so they are put in front of every
// block. A page stays open until the timers of the block have fired (all the milliseconds of the code added up, plus a
// margin; the two ticker blocks of section 10 get their own time in WAIT). The context is Ashgabat + ru-RU. A promise
// prints as DevTools prints it; an uncaught error or an unhandled rejection prints as the console line:
// "Uncaught SyntaxError: …", "Uncaught (in promise) Error: …".
//   node tools/runs/intermediate/day-29.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-29.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block equals
// its output; a lecture block with neither must end with its output in comments; every EXPECT key is in exactly one
// block. Extra runs cover the claims of the prose: what the MDN pages and ECMA-262 say (read from the local caches), the
// body that starts on the first next(), the line break after async, the table of section 6, setInterval against the lazy
// ticker, the prototype chain, the error table, the three experiments of «Карточки», the notes and reference solutions
// of tasks 1–9. Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-29');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
const SPEC = path.join(__dirname, '../../.cache/ecma262-2026.html');
const REV = '5a81c288fb72';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);
// the helpers of day 30 of Essentials, word for word as the first block of day 27 has them
const HELPERS = `const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const later = (value, ms) => new Promise((resolve) => setTimeout(resolve, ms, value));
const failLater = (text, ms) => new Promise((resolve, reject) => {
  setTimeout(() => reject(new Error(text)), ms);
});`;

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype === 'error') return p.value.split(LF)[0];
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.subtype !== 'date' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  // DevTools prints an error object as its stack; the day never prints one, so mark it for a failing check
  if (a.subtype === 'error') return `<error object ${a.description.split(LF)[0]}>`;
  if (a.subtype === 'promise' && a.preview) {
    const state = a.preview.properties.find((p) => p.name === '[[PromiseState]]').value;
    const result = a.preview.properties.find((p) => p.name === '[[PromiseResult]]');
    return state === 'pending' ? `${a.className} {<pending>}` : `${a.className} {<${state}>: ${result ? inner(result) : ''}}`;
  }
  // a generator object previews as genFunc {[[GeneratorState]]: 'suspended'}; the day never prints one
  if (a.subtype === 'generator') return `<generator ${a.description}>`;
  if (a.subtype === 'regexp' || a.subtype === 'date') return a.description;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    const items = a.preview.properties.map((p) => (/^\d+$/.test(p.name) ? inner(p) : `${p.name}: ${inner(p)}`));
    return `${name === 'Array' ? '' : name}(${n}) [${items.join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};

const mdnPage = (p) => execFileSync('git', [`--git-dir=${GIT}`, 'show', `${REV}:files/en-us/web/javascript/reference/${p}/index.md`], { encoding: 'utf8' });
const has = (p, s) => mdnPage(p).includes(s);
// the text of ECMA-262 2026 without tags, spaces collapsed
const specRaw = fs.readFileSync(SPEC, 'utf8');
const spec = specRaw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const inSpec = (s) => spec.includes(s);

const EXPECT = {
  // tasks
  'console.log("скрипт");': ['начало', 'g1', 'скрипт', 'цикл a', 'g2', 'цикл b', 'g3', 'конец'],
  'const journal = [': [],
  'async function* slowPages() {': [],
};
// how long a page stays open, for blocks whose timers the sum of numbers does not cover
const WAIT = {
  'for await (const tick of every(1000))': 3600,
  'for await (const tick of every(300))': 2700,
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext(MAIN);
  await ctx.route('http://day.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
  // the ticker blocks of section 10: a timer never fires early but may be late, and the lateness of several waits adds
  // up (the lecture says so after the second box) — a time in ms may be 0 to 100 ms later than written, never earlier
  const TICKERS = 'for await (const tick of every(';
  const lateOk = (out, want) => out.length === want.length && out.every((l, i) => {
    if (l === want[i]) return true;
    const a = l.match(/^(.*\D)(\d+) мс$/), w = want[i].match(/^(.*\D)(\d+) мс$/);
    return !!a && !!w && a[1] === w[1] && Number(a[2]) - Number(w[2]) >= 0 && Number(a[2]) - Number(w[2]) <= 100;
  });

  // every number of two to four digits in the code added up (delays are written as later(x, 100), wait(300)), plus a
  // margin; a WAIT line in the code overrides it
  const waitFor = (code) => {
    const own = Object.keys(WAIT).find((k) => code.includes(k));
    if (own) return WAIT[own];
    return Math.min(4000, [...code.matchAll(/\b(\d{2,4})\b/g)].reduce((sum, m) => sum + Number(m[1]), 300));
  };
  const runOnPage = async (scripts, { ms } = {}) => {
    const p = await ctx.newPage();
    const out = [];
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => {
      const d = e.exceptionDetails;
      const what = d.exception ? (d.exception.description ?? JSON.stringify(d.exception.value)).split(LF)[0] : '';
      out.push(`${d.text} ${what}`.replace("Failed to execute 'appendChild' on 'Node': ", ''));
    });
    for (const code of scripts) await p.addScriptTag({ content: code }).catch(() => {});
    await p.waitForTimeout(ms ?? waitFor(scripts.join(LF)));
    await p.close();
    return out;
  };
  const withHelpers = (code) => [HELPERS, code];

  const all = {};
  for (const name of PAGES) {
    const src = await ctx.newPage();
    await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
    all[name] = await src.evaluate(() => [...document.querySelectorAll('pre.code.js')].map((pre) => {
      const next = pre.nextElementSibling;
      return {
        code: pre.textContent,
        box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
        cheat: !!pre.closest('.cheatsheet'),
      };
    }));
    await src.close();
  }

  for (const name of PAGES) {
    if (!quiet) console.log(`\n===== ${name}: ${all[name].length} blocks`);
    for (const [i, blk] of all[name].entries()) {
      const out = await runOnPage(withHelpers(blk.code));
      const first = blk.code.split(LF)[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      check(!out.some((l) => l.startsWith('<error object') || l.startsWith('<generator')), `${name} #${i}: no error or generator object printed`);
      if (blk.cheat) { check(!out.some((l) => l.startsWith('Uncaught')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) {
        // a block that ends with its output in comments: the comment lines are the expected output
        const comment = blk.code.split(LF).filter((l) => l.startsWith('// ')).map((l) => l.slice(3));
        check(comment.length > 0 && same(out, comment), `${name} #${i} ${first.trim().slice(0, 50)}: output = the closing comment ${JSON.stringify(out)} vs ${JSON.stringify(comment)}`);
      }
      const fits = blk.box && (blk.code.includes(TICKERS) ? lateOk(out, blk.box) : same(out, blk.box));
      if (blk.box) check(fits, `${name} #${i}: result-box = output (${out.length} lines)${fits ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      if (name === 'student') check(!out.some((l) => l.startsWith('Uncaught')), `student #${i} runs without an error: ${JSON.stringify(out)}`);
    }
  }
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }
  for (const k of Object.keys(WAIT)) {
    const n = all.lecture.filter((x) => x.code.includes(k)).length;
    check(n === 1, `WAIT key in exactly one lecture block (${n}): ${k}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text, opts) => {
    const out = await runOnPage(withHelpers(code), opts);
    check(opts?.late ? lateOk(out, want) : same(out, want), `${text}: ${JSON.stringify(out)}`);
    return out;
  };
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');

  // what the prose says the MDN pages say
  check(has('statements/async_function_star_', 'combines the features of [async functions]') && has('statements/async_function_star_', 'You can use both the [`await`]') && has('statements/async_function_star_', 'Async generator functions do not have arrow function counterparts') && has('statements/async_function_star_', 'there cannot be a line terminator between `async` and `function`') && has('statements/async_function_star_', 'they are [hoisted]'), 'lecture 2, 3: await and yield together, no arrow, no line break after async, hoisted');
  check(has('statements/async_function_star_', 'Async generator functions always produce promises of results — even when each `yield` step is synchronous') && has('statements/async_function_star_', 'The `value` property of an async generator\'s resolved result will not be another promise'), 'lecture 3, 5: promises even for synchronous yields; value is never a promise');
  check(has('operators/async_function_star_', 'The name is only local to the function body') && has('operators/async_function_star_', 'cannot begin with the keywords `async function`') && has('operators/async_function_star_', 'joinAll'), 'lecture 3: the expression — local name, no statement starts with async function, joinAll');
  check(has('statements/for-await...of', 'The returned promise is awaited before the loop exits') && has('statements/for-await...of', 'leading to slower execution due to repeated promise unwrapping') && has('statements/for-await...of', 'which includes inside an [async function]') && has('statements/for-await...of', 'is then wrapped into an async iterator'), 'lecture 4, 8: return() awaited before the loop exits; slower over sync iterables; where it is allowed; the wrapper');
  check(has('global_objects/asyncgenerator/next', 'the first value sent through `next` is lost') && has('global_objects/asyncgenerator/return', 'asyncGen.return("foo")'), 'lecture 6: the first next value is lost; the return("foo") example');
  check(has('global_objects/symbol/asynciterator', 'not to completely replace callbacks and events') && has('global_objects/symbol/asynciterator', '{{domxref("ReadableStream")}}') && has('global_objects/asynciterator', 'Currently, the only built-in JavaScript async iterator is the {{jsxref("AsyncGenerator")}}'), 'lecture 7, 10: not a replacement for events; ReadableStream; the only built-in async iterator');
  check(has('global_objects/array/fromasync', 'almost equivalent to {{jsxref("Array.from()")}}') && has('global_objects/array/fromasync', 'awaits each value yielded from the object sequentially') && has('global_objects/array/fromasync', 'iterates the iterable lazily') && has('global_objects/array/fromasync', 'If a `mapFn` is provided, its output is also internally awaited'), 'lecture 11: like Array.from, one by one and lazily, mapFn awaited');
  check(has('global_objects/asynciterator', 'is _not_ a global object, although it will be in the future with the [async iterator helpers proposal]') && has('global_objects/asynciterator', 'does not implement [`[Symbol.iterator]()`]') && has('global_objects/asyncgeneratorfunction/prototype', '`AsyncGeneratorFunction.prototype.prototype` is the technically more accurate name'), 'lecture 12: AsyncIterator is not global, helpers later, no Symbol.iterator; the accurate name');
  check(has('global_objects/asyncgeneratorfunction', 'is _not_ a global object') && has('global_objects/asyncgeneratorfunction/asyncgeneratorfunction', 'all caveats mentioned in the {{jsxref("Function/Function", "Function()")}} description apply') && has('global_objects/asyncgeneratorfunction/asyncgeneratorfunction', 'can be called with or without [`new`]'), 'lecture 12: AsyncGeneratorFunction is not global; the caveats of Function(); with or without new');
  check(has('global_objects/asynciterator/symbol.asyncdispose', 'It calls and awaits the `return()` method of `this`'), 'lecture 12: [Symbol.asyncDispose]() calls and awaits return()');
  // what the prose says ECMA-262 2026 says
  check(inSpec('suspended-start, suspended-yield, executing, draining-queue, or completed') && inSpec('NOTE: Execution continues without suspending the generator.') && inSpec('Table 90: Internal Slots of AsyncGenerator Instances'), 'lecture 14: five states, the note of AsyncGeneratorYield, table 90');
  check(inSpec('IfAbruptRejectPromise(result, promiseCapability)') && inSpec('If generatorKind is async, return ? AsyncGeneratorYield(? Await(value))') && inSpec('If GetGeneratorKind() is async, set exprValue to ? Await(exprValue)'), 'lecture 14: next rejects; Yield awaits; return awaits');
  check(!/asyncDispose/.test(specRaw) && inSpec('Unlike function instances, the object that is the value of an AsyncGeneratorFunction\'s "prototype" property does not have a "constructor" property') && inSpec('This async function performs the following steps when called') && inSpec('However, this requirement is also not enforced'), 'lecture 14: no asyncDispose in the 2026 text; prototype without constructor; Array.fromAsync is an async function; value not a promise — not enforced');
  check(inSpec('The abstract operation AsyncGeneratorDrainQueue') && new Set([...specRaw.matchAll(/<span class="secnum">27\.6\.3\.(\d+)<\/span>/g)].map((m) => m[1])).size === 10, 'lecture 14: 27.6.3 has ten subsections (a record and nine operations)');
  check(lecture.includes('курс 3') && lecture.includes('await using'), 'lecture 12: await using is course 3');

  // lecture 2: no arrow async generator; lecture 3: the body starts on the first next(); a line break after async
  await extra('const g = async *() => { yield 1; };', ['Uncaught SyntaxError: Malformed arrow function parameter list'], 'lecture 2, 13: no arrow async generator');
  await extra('async function* g() { console.log("тело"); yield 1; }\nconst gen = g();\nconsole.log("вызов");\ngen.next();', ['вызов', 'тело'], 'lecture 3: the body starts on the first next()');
  await extra('let async = 1;\nasync\nfunction* g() {}\nconsole.log(Object.prototype.toString.call(g));', ['[object GeneratorFunction]'], 'lecture 3: a line break after async makes a plain function*');
  // lecture 6: the table
  await extra(`async function* gen() {
  try {
    yield 1;
    yield 2;
  } catch (e) {
    console.log("пойман:", e.message);
    yield "после ошибки";
  }
}
(async () => {
  const a = gen();
  console.log(await a.return("до старта"), await a.next());
  const b = gen();
  await b.throw(new Error("до старта")).catch((e) => console.log("отклонён:", e.message));
  console.log(await b.next());
  const c = gen();
  await c.next();
  console.log(await c.throw(new Error("на yield")));
  const d = gen();
  for await (const x of d);
  console.log(await d.return("после конца"));
  await d.throw(new Error("после конца")).catch((e) => console.log("отклонён:", e.message));
})();`, ["{value: 'до старта', done: true} {value: undefined, done: true}", 'отклонён: до старта', '{value: undefined, done: true}', 'пойман: на yield', "{value: 'после ошибки', done: false}", "{value: 'после конца', done: true}", 'отклонён: после конца'], 'lecture 6: the table — return and throw before the start, on a yield and after the end');
  // lecture 10: setInterval with the same step fires 7 times while the loop gets three ticks
  {
    const code = find('lecture', 'for await (const tick of every(300))').replace('if (tick === 3) break;', 'if (tick === 3) {\n      console.log("setInterval:", fired);\n      clearInterval(id);\n      break;\n    }');
    check(code.includes('fired'), 'lecture 10: the counter is added');
    await extra(`let fired = 0;\nconst id = setInterval(() => fired++, 300);\n${code}`, ['тик 1 300 мс', 'тик 2 1200 мс', 'тик 3 2100 мс', 'setInterval: 7'], 'lecture 10: setInterval fired 7 times in 2.1 s', { ms: 2700, late: true });
  }
  // lecture 10, after the second box: a timer is never early, it may be late, and five waits add their lateness up
  {
    const out = await runOnPage([`(async () => {\n  const late = [];\n  const start = performance.now();\n  for (const ms of [300, 600, 300, 600, 300]) {\n    const t = performance.now();\n    await new Promise((r) => setTimeout(r, ms));\n    late.push(performance.now() - t - ms);\n  }\n  console.log(late.every((x) => x >= -1), Math.round(performance.now() - start - 2100) >= 0);\n})();`], { ms: 2700 });
    check(same(out, ['true true']) && lecture.includes('таймер не срабатывает раньше') && lecture.includes('третий тик может') && lecture.includes('показать и 2200 мс'), `lecture 10: no timer early, the chain ends at 2100 ms or later; the text says so: ${JSON.stringify(out)}`);
  }
  // lecture 11 and 12: no take on an async iterator; the chain; AsyncGeneratorFunction without new
  await extra(`async function* every(ms) { while (true) { await wait(ms); yield 1; } }
async function* lessons() { yield 1; }
const gen = lessons();
const proto = Object.getPrototypeOf;
console.log(every(100).take, Object.getOwnPropertyNames(proto(proto(gen))).join(), proto(proto(proto(proto(gen)))) === Object.prototype, Object.getOwnPropertyNames(lessons.prototype).length);
const AsyncGeneratorFunction = async function* () {}.constructor;
console.log(typeof AsyncGeneratorFunction("yield 1"), Object.getPrototypeOf(AsyncGeneratorFunction) === Function);`, ['undefined constructor,next,return,throw true 0', 'function true'], 'lecture 11, 12: no take; next, return, throw on AsyncGenerator.prototype; the chain ends at Object.prototype; without new');
  await extra(`async function* nums() { try { yield 1; } finally { console.log("finally"); } }
const g = nums();
(async () => {
  await g.next();
  console.log(await g[Symbol.asyncDispose]());
})();`, ['finally', 'undefined'], 'lecture 12: [Symbol.asyncDispose]() calls return()');

  // lecture 13: the error table
  for (const [code, want] of [
    ['function f() {\n  for await (const x of [1]) console.log(x);\n}', ['Uncaught SyntaxError: Unexpected reserved word']],
    ['for await (const x of [1]) console.log(x);', ['Uncaught SyntaxError: Unexpected reserved word']],
    ['async function* g(x = await 1) {}', ['Uncaught SyntaxError: Illegal await-expression in formal parameters of async function']],
    ['async function* g() {\n  [1, 2].forEach((x) => { yield x; });\n}', ["Uncaught SyntaxError: Unexpected identifier 'x'"]],
    ['async function* g() { yield 1; }\nconst gen = g();\ntry { for (const x of gen); } catch (e) { console.log(e.name, e.message); }', ['TypeError gen is not iterable']],
    ['(async () => {\n  try { for await (const x of 5); } catch (e) { console.log(e.name, e.message); }\n})();', ['TypeError 5 is not async iterable']],
    ['const bad = { [Symbol.asyncIterator]() { return { next() { return Promise.resolve(5); } }; } };\n(async () => {\n  try { for await (const x of bad); } catch (e) { console.log(e.name, e.message); }\n})();', ['TypeError Iterator result 5 is not an object']],
    ['async function* gen() {}\ntry { new gen(); } catch (e) { console.log(e.name, e.message); }', ['TypeError gen is not a constructor']],
    ['async function* g() { yield 1; }\nconst gen = g();\ntry { gen.map((x) => x); } catch (e) { console.log(e.name, e.message); }', ['TypeError gen.map is not a function']],
    ['async function* g() { yield 1; }\nconst gen = g();\nconst p = gen.next.call({});\nconsole.log(p instanceof Promise);\np.catch((e) => console.log(e.name, e.message));', ['true', 'TypeError Method [AsyncGenerator].prototype.next called on incompatible receiver #<Object>']],
    ['try { AsyncGeneratorFunction; } catch (e) { console.log(e.name, e.message); }', ['ReferenceError AsyncGeneratorFunction is not defined']],
    ['Array.fromAsync(null).catch((e) => console.log(e.name, e.message));', ["TypeError Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')"]],
    ['async function* every(ms) { while (true) { await wait(ms); yield 1; } }\nArray.fromAsync(every(50)).then(() => console.log("собрали"));\nsetTimeout(() => console.log("через 500 мс — всё ещё ждём"), 500);', ['через 500 мс — всё ещё ждём']],
  ]) await extra(code, want, `lecture 13: ${code.split(LF)[0].slice(0, 60)}`);

  // lecture 15: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'async function* loadDeck() {');
    const whole = cards.replace('take(loadDeck(), 4)', 'loadDeck()');
    check(whole !== cards, 'lecture 15, experiment 1: take removed');
    await extra(whole, ['загрузка остановлена, запросов: 3', 'урок: book — книга, water — вода, bread — хлеб, apple — яблоко, house — дом, window — окно, teacher — учитель, lesson — урок'], 'lecture 15, experiment 1: three requests, eight cards, finally on the normal end');
    const sync = cards.replace('async function* take(source, n) {', 'function* take(source, n) {');
    check(sync !== cards, 'lecture 15, experiment 2: async removed from take');
    await extra(sync, ['Uncaught SyntaxError: Unexpected reserved word'], 'lecture 15, experiment 2: a SyntaxError, nothing runs');
    const failing = cards.replace('  requests++;\n', '  requests++;\n  if (n === 2) return failLater("страница 2: нет связи", 100);\n');
    check(failing !== cards, 'lecture 15, experiment 3: page 2 fails');
    await extra(failing, ['загрузка остановлена, запросов: 2', 'Uncaught (in promise) Error: страница 2: нет связи'], 'lecture 15, experiment 3: the lesson gets nothing');
    const loop = failing.replace(/\(async \(\) => \{[\s\S]*\}\)\(\);$/, '(async () => {\n  for await (const card of take(loadDeck(), 4)) console.log(card.word);\n})();');
    check(loop !== failing, 'lecture 15, experiment 3: the for await version');
    await extra(loop, ['book', 'water', 'bread', 'загрузка остановлена, запросов: 2', 'Uncaught (in promise) Error: страница 2: нет связи'], 'lecture 15, experiment 3: for await shows the three cards of page 1 first');
  }

  // notes: the main block — two pages, closed before the line after the loop, then the whole array
  await extra(find('student', 'console.log(await Array.fromAsync(pages()));'), ['book, water', 'apple', 'закрыт', 'закрыт', '(3) [Array(2), Array(1), Array(1)]'], 'notes: the main block');

  // task 1
  await extra(`console.log(typeof (async function* () {}));
console.log((async function* () { yield 1; })().next());
console.log(Object.prototype.toString.call((async function* () {})()), Symbol.iterator in (async function* () {})(), typeof (async function* () {})().map);
try { new (async function* () {})(); } catch (e) { console.log(e.name); }
(async () => console.log(await (async function* () { return later("итог", 100); })().next(), typeof AsyncGeneratorFunction, async function* () {}.constructor.name))();`,
  ['function', 'Promise {<pending>}', '[object AsyncGenerator] false undefined', 'TypeError', "{value: 'итог', done: true} undefined AsyncGeneratorFunction"], 'task 1: the eight answers');
  // task 3
  await extra(`const since = (start) => \`\${Math.round((Date.now() - start) / 100) * 100} мс\`;
async function* names() {
  yield later("Аман", 300);
  yield later("Мерет", 100);
  yield later("Сапар", 200);
}
const promises = [later("Аман", 300), later("Мерет", 100), later("Сапар", 200)];
for (const p of promises) console.log(p);
(async () => {
  let start = Date.now();
  for await (const name of promises) console.log(name, since(start));
  start = Date.now();
  for await (const name of names()) console.log(name, since(start));
})();`, ['Promise {<pending>}', 'Promise {<pending>}', 'Promise {<pending>}', 'Аман 300 мс', 'Мерет 300 мс', 'Сапар 300 мс', 'Аман 300 мс', 'Мерет 400 мс', 'Сапар 600 мс'], 'task 3: pending promises; the array at 300; the generator at 300, 400, 600', { ms: 1400 });
  // task 4
  await extra(`${find('tasks', 'const journal = [')}
let requests = 0;
function loadPage(n) {
  requests++;
  return later({ students: journal[n - 1], next: n < journal.length ? n + 1 : null }, 100);
}
async function* students() {
  let page = 1;
  try {
    while (page) {
      const { students, next } = await loadPage(page);
      yield* students;
      page = next;
    }
  } finally {
    console.log(\`запросов: \${requests}\`);
  }
}
(async () => {
  const everyone = await Array.fromAsync(students());
  console.log(everyone.length);
  requests = 0;
  for await (const s of students()) {
    if (s.mark < 3) {
      console.log(s.name);
      break;
    }
  }
  requests = 0;
  let sum = 0;
  let count = 0;
  for await (const s of students()) {
    sum += s.mark;
    count++;
  }
  console.log(sum / count);
})();`, ['запросов: 4', '8', 'Айна', 'запросов: 2', 'запросов: 4', '4'], 'task 4: 8 students and 4 requests; Aýna after 2 requests; the average 4', { ms: 1500 });
  // task 5, at a tenth of the time: 100 ms for a second; times to 50 ms in the first loop, the gaps of the busy loop
  // checked separately (the timers add a few ms each)
  const t5 = await runOnPage(withHelpers(`const since = (start) => Math.round((Date.now() - start) / 50) * 50;
async function* countdown(from, ms) {
  try {
    for (let n = from; n >= 1; n--) {
      await wait(ms);
      yield n;
    }
  } finally {
    console.log("отсчёт закончен");
  }
}
(async () => {
  let start = Date.now();
  for await (const n of countdown(3, 100)) console.log(\`осталось \${n}\`, since(start));
  console.log("Звонок!");
  for await (const n of countdown(3, 100)) {
    console.log(\`осталось \${n}\`);
    if (n === 2) break;
  }
  console.log("после цикла");
  let last = Date.now();
  for await (const n of countdown(3, 100)) {
    console.log(\`занятый цикл: \${n}\`, Date.now() - last);
    last = Date.now();
    await wait(150);
  }
})();`), { ms: 1800 });
  const ticks = t5.slice(0, 3).map((l) => Number(l.split(' ').pop()));
  check(same(t5.slice(0, 9).map((l, i) => (i < 3 ? l.replace(/ \d+$/, '') : l)), ['осталось 3', 'осталось 2', 'осталось 1', 'отсчёт закончен', 'Звонок!', 'осталось 3', 'осталось 2', 'отсчёт закончен', 'после цикла']) && ticks.every((t, i) => Math.abs(t - 100 * (i + 1)) <= 50), `task 5: 1, 2, 3 s, then the bell; break on 2 (at a tenth of the time): ${JSON.stringify(t5.slice(0, 9))}`);
  const gaps = t5.filter((l) => l.startsWith('занятый цикл')).map((l) => Number(l.split(' ').pop()));
  check(gaps.length === 3 && gaps.slice(1).every((g) => Math.abs(g - 250) <= 30) && t5.at(-1) === 'отсчёт закончен', `task 5: a busy loop — a value every 250 ms instead of 100: ${JSON.stringify(t5.slice(9))}`);
  // task 6
  await extra(`async function* every(ms) {
  let tick = 0;
  try {
    while (true) {
      await wait(ms);
      yield ++tick;
    }
  } finally {
    console.log("таймер остановлен");
  }
}
async function* take(source, n) {
  if (n <= 0) return;
  for await (const value of source) {
    yield value;
    if (--n === 0) return;
  }
}
async function* map(source, fn) {
  for await (const value of source) yield fn(value);
}
async function* filter(source, fn) {
  for await (const value of source) if (fn(value)) yield value;
}
(async () => {
  let start = Date.now();
  const result = await Array.fromAsync(take(map(filter(every(100), (t) => t % 2 === 0), (t) => t * 10), 3));
  const took = Date.now() - start;
  console.log(result, took >= 600 && took < 700);
  start = Date.now();
  console.log(await Array.fromAsync(take(every(100), 0)), Date.now() - start < 20);
})();`, ['таймер остановлен', '(3) [20, 40, 60] true', '(0) [] true'], 'task 6: [20, 40, 60] after six ticks (600–700 ms); take 0 waits for nothing', { ms: 1200 });
  // task 7
  await extra(`function* requests() { for (const ms of [300, 100, 200]) yield later(ms, ms); }
const ms = (start) => Math.round((Date.now() - start) / 100) * 100;
(async () => {
  let start = Date.now();
  console.log(await Array.fromAsync(requests()), ms(start));
  start = Date.now();
  console.log(await Promise.all(requests()), ms(start));
  start = Date.now();
  console.log(await Array.fromAsync([later(300, 300), later(100, 100), later(200, 200)]), ms(start));
  console.log(await Array.fromAsync({ length: 2, 0: "a", 1: later("b", 100) }, (s) => s.toUpperCase()));
})();`, ['(3) [300, 100, 200] 600', '(3) [300, 100, 200] 300', '(3) [300, 100, 200] 300', "(2) ['A', 'B']"], 'task 7: the numbers of the criteria', { ms: 1800 });
  // task 8
  await extra(`class Countdown {
  constructor(from, ms) {
    this.from = from;
    this.ms = ms;
  }
  [Symbol.asyncIterator]() {
    let n = this.from;
    const ms = this.ms;
    return {
      next() {
        if (n === 0) return Promise.resolve({ value: undefined, done: true });
        return later({ value: n--, done: false }, ms);
      },
      return() {
        console.log("остановлен");
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
(async () => {
  const c = new Countdown(3, 100);
  const start = Date.now();
  const first = [];
  for await (const n of c) first.push(n);
  console.log(first.join(), Math.round((Date.now() - start) / 100) * 100);
  const second = [];
  for await (const n of c) second.push(n);
  console.log(second.join());
  for await (const n of c) {
    console.log("break на", n);
    break;
  }
  console.log(await Array.fromAsync(new Countdown(2, 100)));
})();`, ['3,2,1 300', '3,2,1', 'break на 3', 'остановлен', '(2) [2, 1]'], 'task 8: 3, 2, 1 in 300 ms; two full passes; break calls return(); fromAsync', { ms: 1400 });
  // task 9
  {
    const out = await runOnPage(withHelpers(`class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}
async function* withTimeout(source, ms) {
  const it = source[Symbol.asyncIterator]();
  try {
    while (true) {
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(\`нет значения за \${ms} мс\`)), ms);
      });
      const result = await Promise.race([it.next(), timeout]).finally(() => clearTimeout(timer));
      if (result.done) return;
      yield result.value;
    }
  } finally {
    it.return();
  }
}
${find('tasks', 'async function* slowPages() {').replace('console.log("источник закрыт");', 'console.log("источник закрыт", Date.now() - start);')}
const start = Date.now();
(async () => {
  try {
    for await (const p of withTimeout(slowPages(), 150)) console.log(p);
  } catch (e) {
    console.log(e.name, e.message, e instanceof TimeoutError, Date.now() - start);
  }
  await wait(300);
  console.log("—");
  for await (const p of withTimeout(slowPages(), 400)) console.log(p);
})();`), { ms: 1600 });
    const at = (prefix) => Number((out.find((l) => l.startsWith(prefix)) ?? '').split(' ').pop());
    const timeoutAt = at('TimeoutError');
    const closedAt = at('источник закрыт');
    check(out[0] === 'стр. 1' && /^TimeoutError нет значения за 150 мс true \d+$/.test(out[1]) && Math.abs(timeoutAt - 250) <= 60 && Math.abs(closedAt - 400) <= 60, `task 9: TimeoutError at about 250 ms, the source closed at about 400 ms: ${JSON.stringify(out)}`);
    const after = out.slice(out.indexOf('—') + 1).map((l) => (l.startsWith('источник закрыт') ? 'источник закрыт' : l));
    check(same(after, ['стр. 1', 'стр. 2', 'стр. 3', 'источник закрыт']), `task 9: with 400 ms — all three pages: ${JSON.stringify(after)}`);
    // with await it.return() the error waits for the source to close
    const out2 = await runOnPage(withHelpers(`class TimeoutError extends Error {}
async function* withTimeout(source, ms) {
  const it = source[Symbol.asyncIterator]();
  try {
    while (true) {
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError("нет значения")), ms);
      });
      const result = await Promise.race([it.next(), timeout]).finally(() => clearTimeout(timer));
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await it.return();
  }
}
${find('tasks', 'async function* slowPages() {')}
const start = Date.now();
(async () => {
  try {
    for await (const p of withTimeout(slowPages(), 150));
  } catch (e) {
    console.log("ошибка", Date.now() - start);
  }
})();`), { ms: 900 });
    const late = Number((out2.find((l) => l.startsWith('ошибка')) ?? '').split(' ').pop());
    check(out2[0] === 'источник закрыт' && Math.abs(late - 400) <= 60, `task 9: with await it.return() the error comes at about 400 ms: ${JSON.stringify(out2)}`);
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
