// Course 2, day 28, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. As on day 27, the three
// helpers of day 30 of Essentials (wait, later, failLater) stand at the top of app.js, so they are put in front of every
// block. A page stays open until the timers of the block have fired (all the milliseconds of the code added up, plus a
// margin). The context is Ashgabat + ru-RU. A promise prints as DevTools prints it; an uncaught error or an unhandled
// rejection prints as the console line: "Uncaught SyntaxError: …", "Uncaught (in promise) Error: …".
//   node tools/runs/intermediate/day-28.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-28.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block equals
// its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs cover the
// claims of the prose: what the MDN pages say (read from the local mdn-content clone), the table of where await is
// allowed and the error table, the three experiments of «Карточки», the notes and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-28');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
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

const EXPECT = {
  // lecture
  'console.log(p === basicReturn(), p === asyncReturn());': ['true false'],
  'const load = async function loadDeck(attempt) {': ['попытка 3 | loadDeck | undefined'],
  'console.log("A");': ['A', 'C', 'E', 'K', 'D', 'F', 'I', 'H', 'J', 'B', 'G'],
  // tasks
  'console.log(1);': ['1', '4', '6', '8', '3', '5', '7', '2'],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext(MAIN);
  await ctx.route('http://day.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // how long a page stays open: every number of two to four digits in the code added up (delays are written as
  // later(x, 100), ms: 100, [300, 100]), plus a margin
  const waitFor = (code) => Math.min(4000, [...code.matchAll(/\b(\d{2,4})\b/g)].reduce((sum, m) => sum + Number(m[1]), 300));
  // a click, when asked, is a real mouse click on the given selector after the scripts have run
  const runOnPage = async (scripts, { click } = {}) => {
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
    if (click) await p.click(click);
    await p.waitForTimeout(waitFor(scripts.join(LF)));
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
      check(!out.some((l) => l.startsWith('<error object')), `${name} #${i}: no error object printed`);
      if (blk.cheat) { check(!out.some((l) => l.startsWith('Uncaught')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) {
        // a block that ends with its output in comments: the comment lines are the expected output
        const comment = blk.code.split(LF).filter((l) => l.startsWith('// ')).map((l) => l.slice(3));
        check(comment.length > 0 && same(out, comment), `${name} #${i} ${first.trim().slice(0, 50)}: output = the closing comment ${JSON.stringify(out)} vs ${JSON.stringify(comment)}`);
      }
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)${same(out, blk.box) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      if (name === 'student') check(!out.some((l) => l.startsWith('Uncaught')), `student #${i} runs without an error: ${JSON.stringify(out)}`);
    }
  }
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text, opts) => {
    const out = await runOnPage(withHelpers(code), opts);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');

  // what the prose says the MDN pages say
  check(has('operators/await', 'execution doesn\'t return to the current function until all other already-scheduled microtasks are processed') && has('operators/await', 'intertwined') && has('operators/await', 'make sure to use `await` only when necessary') && has('operators/await', 'another [microtask]'), 'lecture 2, 4, 5: microtasks, intertwined, await only when necessary');
  check(has('statements/async_function', 'can be thought of as being split by zero or more await') && has('statements/async_function', 'Code after each await expression can be thought of as existing in a `.then`') && has('statements/async_function', 'an async function without an await expression\nwill run synchronously') && has('statements/async_function', 'they are not equivalent'), 'lecture 4, 6: the body split by await; not the same as Promise.resolve');
  check(has('operators/async_function', 'An [expression statement](/en-US/docs/Web/JavaScript/Reference/Statements/Expression_statement) cannot begin with the keywords `async function`') && has('operators/async_function', 'The name is only local to the function body') && has('operators/async_function', 'allowing you to mimic [top-level await]') && has('operators/async_function', 'prints 60 after 2 seconds'), 'lecture 7: no statement starts with async function; the name is local; IIFE; the example of add');
  check(has('global_objects/asyncfunction', 'is _not_ a global object') && has('global_objects/asyncfunction', 'do not have the [`prototype`]') && has('global_objects/asyncfunction/asyncfunction', 'all caveats mentioned in the {{jsxref("Function/Function", "Function()")}} description apply'), 'lecture 11: not global, no prototype, the caveats of Function()');
  check(has('errors/bad_await', 'an `await` can never block the execution of the program') && has('errors/bad_await', 'SyntaxError: await is only valid in async functions and the top level bodies of modules (V8-based)'), 'lecture 10: await never blocks; the V8 text');
  check(lecture.includes('«Execution model»') && lecture.includes('это курс 3'), 'lecture 2: Execution model is course 3');
  check(has('operators/await', '### Improving stack trace') && has('operators/await', 'Contrary to some popular belief, `return await promise` is at least as fast as `return promise`') && has('operators/await', 'except for stylistic reasons, `return await` is almost always preferable'), 'lecture 6: return await — the stack, not slower, preferable');

  // lecture 8: the same listeners with a real mouse click — a microtask after each listener
  {
    const code = find('lecture', 'console.log("после click()");');
    const noClick = code.replace('button.click();\nconsole.log("после click()");', '');
    check(noClick !== code, 'lecture 8: the listeners without the two last lines');
    await extra(noClick, ['слушатель 1', 'микрозадача 1', 'слушатель 2', 'микрозадача 2'], 'lecture 8: a real click — the microtask right after its listener', { click: 'button' });
  }

  // lecture 10 and 12: where await is allowed, the error table
  const syntax = 'Uncaught SyntaxError: await is only valid in async functions and the top level bodies of modules';
  for (const [code, want] of [
    ['function f() { await later(1, 10); }', [syntax]],
    ['function* g() { await later(1, 10); }', [syntax]],
    ['async function f(items) { items.forEach((x) => { await later(x, 10); }); }', [syntax]],
    ['console.log("до");\nawait later(1, 10);', [syntax]],
    ['async function () {}', ['Uncaught SyntaxError: Function statements require a function name']],
    ['async function f(items, list) { items.forEach((x) => { list.push(await later(x, 10)); }); }', ['Uncaught SyntaxError: missing ) after argument list']],
    ['const load = async function () {};\ntry { new load(); } catch (e) { console.log(e.name, e.message); }', ['TypeError load is not a constructor']],
    ['try { AsyncFunction; } catch (e) { console.log(e.name, e.message); }', ['ReferenceError AsyncFunction is not defined']],
    ['async function f() { await null; throw new Error("после await"); }\nf();\nconsole.log("скрипт идёт дальше");', ['скрипт идёт дальше', 'Uncaught (in promise) Error: после await']],
    ['const ok = async function (x) { return x; };\nconst m = { async load() { return 1; } };\nclass Deck { async load() {} static async create() {} }\nconsole.log(typeof ok, Object.prototype.toString.call(m.load), Object.prototype.toString.call(Deck.create));', ['function [object AsyncFunction] [object AsyncFunction]']],
  ]) await extra(code, want, `lecture 10, 12: ${code.split(LF)[0].slice(0, 60)}`);

  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'async function saveWithForEach() {');
    const noAsync = cards.replace('cards.forEach(async (card) => {', 'cards.forEach((card) => {');
    check(noAsync !== cards, 'lecture 14, experiment 1: async removed from the callback');
    await extra(noAsync, ['Uncaught SyntaxError: missing ) after argument list'], 'lecture 14, experiment 1: a SyntaxError with another text, nothing runs');
    const awaited = cards.replace('  cards.forEach(async (card) => {', '  await cards.forEach(async (card) => {');
    check(awaited !== cards, 'lecture 14, experiment 2: await before forEach');
    await extra(awaited, ['forEach: сохранено 0', 'for...of: сохранено 3 за 400 мс', 'Promise.all: сохранено 3 за 200 мс'], 'lecture 14, experiment 2: still 0');
    const kitap = cards.replace('const saveCard = (card) => later(card.word, card.ms);', 'const saveCard = (card) => (card.word === "kitap" ? failLater("kitap: нет связи", 200) : later(card.word, card.ms));\nconst savedWords = [];\nconst track = (card) => saveCard(card).then((w) => { savedWords.push(w); return w; });').replace('for (const card of cards) saved.push(await saveCard(card));', 'for (const card of cards) saved.push(await track(card));\n  console.log("не дойдём");');
    check(kitap !== cards && kitap.includes('track(card)'), 'lecture 14, experiment 3: kitap fails');
    await extra(`${kitap}\nsetTimeout(() => console.log("for...of сохранил:", savedWords.join()), 800);`, ['forEach: сохранено 0', 'Uncaught (in promise) Error: kitap: нет связи', 'Uncaught (in promise) Error: kitap: нет связи', 'for...of сохранил: cat'], 'lecture 14, experiment 3: for...of saves cat and stops, two unhandled rejections');
  }
  // notes: the main block prints its numbers in order
  {
    const out = await runOnPage(withHelpers(find('student', 'console.log("2: конец скрипта");')));
    check(same(out.map((l) => l.split(':')[0]), ['1', '2', '3', '4', '5']), `notes: the numbers of the main block go in order: ${JSON.stringify(out)}`);
  }

  // task 2
  await extra(`const out = [];
out.push(typeof (async () => 1));
console.log(out[0], (async () => 1)());
let thrown = "нет";
let r;
try { r = (async () => { throw new Error("x"); })(); } catch { thrown = "да"; }
r.catch(() => {});
console.log("бросил:", thrown, Object.prototype.toString.call(async function () {}), "prototype" in async function () {});
try { new (async function () {})(); } catch (e) { console.log(e.name); }
console.log((async function loadDeck() {}).name, typeof AsyncFunction, async function () {}.constructor.name);`,
  ['function Promise {<fulfilled>: 1}', 'бросил: нет [object AsyncFunction] false', 'TypeError', 'loadDeck undefined AsyncFunction'], 'task 2: the eight answers');
  // task 3: lines 1, 4 run; 2, 3, 5 are SyntaxErrors (6 is a module — day 30)
  await extra('async function load() { await later(1, 100); }\nasync function all(items) { await Promise.all(items.map(async (x) => await later(x, 100))); }\nconsole.log("строки 1 и 4 — можно");', ['строки 1 и 4 — можно'], 'task 3: lines 1 and 4');
  for (const code of ['function load() { await later(1, 100); }', 'async function all(items) { items.forEach((x) => { await later(x, 100); }); }', 'await later(1, 100);']) await extra(code, [syntax], `task 3: ${code.slice(0, 50)}`);
  // task 4
  await extra(`const run = (source) => (async () => {
  try {
    const text = await source;
    const marks = text.split(" ").map(Number);
    console.log("лучшая оценка:", Math.max(...marks));
  } catch (e) {
    console.log("ошибка:", e.message);
  }
})();
const best = async function bestMark(text) {
  try {
    const marks = (await text).split(" ").map(Number);
    return \`лучшая оценка: \${Math.max(...marks)}\`;
  } catch (e) {
    return \`ошибка: \${e.message}\`;
  }
};
run(later("5 4 9", 100));
setTimeout(() => run(failLater("нет связи", 100)), 200);
setTimeout(async () => console.log(await best(later("5 4 9", 100)), "|", await best(failLater("нет связи", 100)), "|", typeof bestMark), 400);`,
  ['лучшая оценка: 9', 'ошибка: нет связи', 'лучшая оценка: 9 | ошибка: нет связи | undefined'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`async function loadOr(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
async function loadOrBroken(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
loadOr(() => later("слова", 100), []).then((v) => console.log(v));
loadOr(() => failLater("нет связи", 100), []).then((v) => console.log(v));
loadOr(() => { throw new Error("сразу"); }, []).then((v) => console.log("сразу:", v));
loadOrBroken(() => failLater("нет связи", 100), []).then((v) => console.log(v), (e) => console.log("отказ:", e.message));`,
  ['сразу: (0) []', 'слова', '(0) []', 'отказ: нет связи'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`async function count(n) {
  for (let i = 1; i <= n; i++) await null;
  console.log(\`досчитали до \${n}\`);
}
async function countWithBreaks(n) {
  for (let i = 1; i <= n; i++) {
    if (i % 100 === 0) {
      await wait(0);
      console.log("после шага", i);
    } else {
      await null;
    }
  }
  console.log(\`с паузами досчитали до \${n}\`);
}
setTimeout(() => console.log("таймер"), 0);
count(300).then(() => {
  setTimeout(() => console.log("таймер 2"), 0);
  return countWithBreaks(300);
});`, ['досчитали до 300', 'таймер', 'таймер 2', 'после шага 100', 'после шага 200', 'после шага 300', 'с паузами досчитали до 300'], 'task 6: microtasks hold the timer; wait(0) at step 100 lets it go');
  // task 7
  await extra(`const marks = [{ name: "Аман", ms: 100 }, { name: "Мерет", ms: 300 }, { name: "Сапар", ms: 200 }];
const send = (item) => later(item.name, item.ms);
const ms = (start) => Math.round((Date.now() - start) / 100) * 100;
async function sendOneByOne() {
  const start = Date.now();
  const sent = [];
  for (const item of marks) sent.push(await send(item));
  console.log(sent.join(", "), ms(start));
}
async function sendAll() {
  const start = Date.now();
  const sent = await Promise.all(marks.map(send));
  console.log(sent.join(", "), ms(start));
}
async function sendForEach() {
  const sent = [];
  marks.forEach(async (item) => sent.push(await send(item)));
  console.log("отправлено", sent.length);
}
(async () => {
  await sendOneByOne();
  await sendAll();
  await sendForEach();
})();`, ['Аман, Мерет, Сапар 600', 'Аман, Мерет, Сапар 300', 'отправлено 0'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`async function greet(name) {
  console.log(name, "1");
  await null;
  console.log(name, "2");
  await null;
  console.log(name, "3");
}
function greetPromise(name) {
  return new Promise((resolve) => {
    console.log(name, "1");
    resolve(null);
  }).then(() => {
    console.log(name, "2");
    return null;
  }).then(() => {
    console.log(name, "3");
  });
}
const a = [greet("A"), greet("B")];
setTimeout(() => {
  console.log("—");
  const b = [greetPromise("A"), greetPromise("B")];
  Promise.all([...a, ...b]).then((v) => console.log(v.every((x) => x === undefined)));
}, 50);`, ['A 1', 'B 1', 'A 2', 'B 2', 'A 3', 'B 3', '—', 'A 1', 'B 1', 'A 2', 'B 2', 'A 3', 'B 3', 'true'], 'task 8: the same six lines in the same order');
  // task 9
  await extra(`async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let running = 0;
  let most = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      running++;
      most = Math.max(most, running);
      results[i] = await fn(items[i]);
      running--;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { results, most };
}
const fn = (ms) => later(ms, ms);
const time = async (items, limit) => {
  const start = Date.now();
  const { results, most } = await mapLimit(items, limit, fn);
  return \`\${limit}: \${results.join()} за \${Math.round((Date.now() - start) / 100) * 100}, не больше \${most}\`;
};
(async () => {
  for (const limit of [1, 2, 4]) console.log(await time([100, 100, 100, 100], limit));
  console.log(await time([300, 100, 100, 100], 2));
})();`, ['1: 100,100,100,100 за 400, не больше 1', '2: 100,100,100,100 за 200, не больше 2', '4: 100,100,100,100 за 100, не больше 4', '2: 300,100,100,100 за 300, не больше 2'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
