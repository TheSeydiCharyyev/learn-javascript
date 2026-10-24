// Course 2, day 27, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. The three helpers of day 30
// of Essentials (wait, later, failLater — the first block of the lecture) stand at the top of app.js, so they are put in
// front of every other block. Promises settle later, so a page is kept open until the last timer of the block has fired
// (the largest number of milliseconds in it plus a margin). The context is Ashgabat + ru-RU, as on days 21–26.
// A promise prints as DevTools prints it (Promise {<fulfilled>: …}); an uncaught error or an unhandled rejection prints
// as the console line: "Uncaught TypeError: …", "Uncaught (in promise) Error: …".
//   node tools/runs/intermediate/day-27.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-27.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block equals
// its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs cover the
// claims of the prose: what the MDN pages say (read from the local mdn-content clone), the error table, the empty
// inputs, unhandledrejection and rejectionhandled, the three experiments of «Карточки», the notes and reference
// solutions of tasks 1–9. Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-27');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
const REV = '5a81c288fb72';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.subtype !== 'date' && p.subtype !== 'error' && p.value === 'Object') return '{…}';
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

// the MDN pages of the day, as the local clone of mdn-content has them
const mdnPage = (p) => execFileSync('git', [`--git-dir=${GIT}`, 'show', `${REV}:files/en-us/web/javascript/reference/${p}/index.md`], { encoding: 'utf8' });
const has = (p, s) => mdnPage(p).includes(s);

const EXPECT = {
  // lecture
  '// помощники дня 30 Essentials': [],
  'async function loadOneByOne() {': ['по очереди: слова прогресс настройки 600 мс'],
  'console.log("все сразу:", words': ['все сразу: слова прогресс настройки 300 мс'],
  'later("группа JS-1", 300)': ['группа JS-1 | расписание | оценки | 300 мс'],
  'const loadWords = () => later("слова", 100);': ['function слова'],
  'later("колода с сервера «Мары»", 250)': ['загружена колода с сервера «Дашогуз»'],
  'failLater("Мары: 503", 100)': ['AggregateError | All promises were rejected | Ашхабад: нет связи; Мары: 503; Дашогуз: 404'],
  'let resolve, reject;': ['готово'],
  'const thenable = { then(resolve) { resolve(42); } };': ["(3) [42, 'промис', 'строка']"],
  'class LoggedPromise extends Promise {}': ['true true true false'],
  // tasks
  'Promise.race([a, b, c])': ['race C 100 мс', 'any A 200 мс', "all (2) ['A', 'C'] 200 мс", 'allSettled 2 300 мс', 'all отклонён B 300 мс'],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext(MAIN);
  await ctx.route('http://day.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  // two data files for the fetch claim of lecture 3; a later route wins over the one above
  await ctx.route('http://day.test/*.json', (r) => r.fulfill({ contentType: 'application/json', body: r.request().url().endsWith('group.json') ? '["Аман","Мерет","Сапар"]' : '{"Аман":[5,4]}' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // how long a page stays open: all the milliseconds of the code added up (awaits one by one add up too), plus a margin
  const waitFor = (code) => Math.min(2500, [...code.matchAll(/\b(\d{2,4})\)/g)].reduce((sum, m) => sum + Number(m[1]), 300));
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
      };
    }));
    await src.close();
    all[name] = blocks;
  }
  const HELPERS = all.lecture[0].code;
  check(HELPERS.startsWith('// помощники дня 30 Essentials') && ['const wait', 'const later', 'const failLater'].every((s) => HELPERS.includes(s)), 'lecture #0 is the block of the three helpers');
  const withHelpers = (code) => (code === HELPERS ? [code] : [HELPERS, code]);

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
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
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
  const tasks = fs.readFileSync(path.join(DAY, 'tasks.html'), 'utf8');

  // what the prose says the MDN pages say
  check(has('global_objects/promise', '### Promise concurrency') && has('global_objects/promise', 'JavaScript is [single-threaded]'), 'lecture 2: the four methods of «Promise concurrency»; single-threaded');
  check(has('global_objects/promise/any', '{{jsxref("Array.prototype.some()")}} and {{jsxref("Array.prototype.every()")}}'), 'lecture 2: any and all compared with some and every');
  check(has('global_objects/promise', 'Repeatedly passing the same pending promise to concurrency methods can accumulate handlers'), 'lecture 2: handlers on a long pending promise accumulate');
  check(has('global_objects/promise/all', 'regardless of completion order') && has('global_objects/promise/all', 'fail-fast') && has('global_objects/promise/all', 'does not cancel the remaining operations') && has('global_objects/promise/all', 'you may run into subtle bugs'), 'lecture 3: order of input, fail-fast, nothing cancelled, destructuring pitfall');
  check(has('global_objects/promise/all', '"over-await"') && has('global_objects/promise/all', 'Directly passing the functions to `Promise.all` does not work') && has('global_objects/promise/all', 'bug-prone error handling'), 'lecture 4: over-await, functions instead of promises, bug-prone upfront awaits');
  check(has('global_objects/promise/allsettled', 'not dependent on one another') && has('global_objects/promise/allsettled', 'Only present if `status` is `"fulfilled"`'), 'lecture 5: allSettled — independent tasks; value only when fulfilled');
  check(has('global_objects/promise/any', 'rejects upon receiving an _empty iterable_') && has('global_objects/promise/any', 'The errors are in the order of the promises passed, regardless of completion order'), 'lecture 6: any — empty input rejects; errors in input order');
  check(has('global_objects/aggregateerror', 'console.log(e.message); // "All Promises rejected"') && has('errors/promise_any_all_rejected', 'AggregateError: All promises were rejected (V8-based)') && has('errors/promise_any_all_rejected', 'AggregateError: No Promise in Promise.any was resolved (Firefox)'), 'lecture 7 and 12: the example on AggregateError says «All Promises rejected»; the error page lists the V8 text');
  check(has('global_objects/promise/race', 'To release resources early') && has('global_objects/promise/race', 'AbortController') && has('global_objects/promise/race', 'remains pending forever if the `iterable` passed is empty'), 'lecture 8: release the loser, AbortController, race([]) pending forever');
  check(has('global_objects/promise/withresolvers', 'is exactly equivalent to the following code') && has('global_objects/promise/withresolvers', 'does not require the use of {{jsxref("Statements/let", "let")}}'), 'lecture 9: withResolvers is the code with let');
  check(has('global_objects/promise/try', 'Promise.resolve(func())') && has('global_objects/promise/try', 'Promise.resolve().then(func);') && has('global_objects/promise/try', 'Like {{domxref("Window/setTimeout", "setTimeout()")}}, `Promise.try()` accepts extra arguments') && has('global_objects/promise/try', 'In async/await, the same code would look like this'), 'lecture 10: the two records try is compared with; extra arguments; the async/await form');
  check(has('global_objects/promise/symbol.species', 'investigating whether to remove this feature'), 'lecture 11: species may be removed');
  check(has('global_objects/promise/allkeyed', '{{SeeCompatTable}}') && has('global_objects/promise/allsettledkeyed', '{{SeeCompatTable}}'), 'lecture 11: allKeyed and allSettledKeyed are experimental on MDN');

  // lecture 2–4: claims checked in Chrome
  await extra('Promise.all([fetch("group.json"), fetch("marks.json")].map((p) => p.then((response) => response.json())))\n  .then(([group, marks]) => console.log(group.length, Object.keys(marks)));', ["3 (1) ['Аман']"], 'lecture 3: Promise.all with fetch of day 31');
  await extra('const none = Promise.any([]);\nconsole.log(none, Promise.race([]));\nnone.catch(() => {});\nconst never = Promise.race([]);\nsetTimeout(() => console.log(never), 300);', ['Promise {<rejected>: AggregateError: All promises were rejected} Promise {<pending>}', 'Promise {<pending>}'], 'lecture 6, 8: any([]) is rejected at once, race([]) stays pending');
  await extra(`window.addEventListener("unhandledrejection", (e) => console.log("unhandledrejection:", e.reason.message));
window.addEventListener("rejectionhandled", (e) => console.log("rejectionhandled:", e.reason.message));
${find('lecture', 'async function loadUpfront() {')}`, ['unhandledrejection: прогресс не пришёл', 'Uncaught (in promise) Error: прогресс не пришёл', 'поймали: прогресс не пришёл', 'rejectionhandled: прогресс не пришёл'], 'lecture 4: an unhandled rejection at 100 ms, handled at 300 ms');
  await extra(`window.addEventListener("unhandledrejection", (e) => console.log("unhandledrejection:", e.reason.message));
async function loadAll() {
  try {
    const [words, progress] = await Promise.all([later("слова", 300), failLater("прогресс не пришёл", 100)]);
    console.log(words, progress);
  } catch (e) {
    console.log("поймали:", e.message);
  }
}
loadAll();`, ['поймали: прогресс не пришёл'], 'lecture 4: with Promise.all the rejection is handled from the start');
  // lecture 7: the table of AggregateError
  await extra(`const input = [1, "два"];
const e = new AggregateError(input);
console.log(e.errors !== input, e.errors, Object.hasOwn(e, "message"), Object.hasOwn(AggregateError.prototype, "name"), JSON.stringify(Object.getOwnPropertyDescriptor(e, "errors").enumerable), AggregateError("x") instanceof AggregateError, AggregateError.length);
try { new AggregateError(); } catch (x) { console.log(x.name, x.message); }`, ["true (2) [1, 'два'] false true false true 2", 'TypeError undefined is not iterable (cannot read property Symbol(Symbol.iterator))'], 'lecture 7: errors is a new array, not enumerable; message only when given; errors is required');
  // lecture 9: a plain object with three keys; only the first call counts
  await extra(`const w = Promise.withResolvers();
console.log(Object.keys(w), Object.getPrototypeOf(w) === Object.prototype);
w.resolve("первый");
w.resolve("второй");
w.reject(new Error("поздно"));
setTimeout(() => console.log(w.promise), 0);`, ["(3) ['promise', 'resolve', 'reject'] true", "Promise {<fulfilled>: 'первый'}"], 'lecture 9: { promise, resolve, reject }, only the first call counts');
  // lecture 11: the keyed methods are not in Chrome 155
  await extra('console.log(typeof Promise.allKeyed, typeof Promise.allSettledKeyed);', ['undefined undefined'], 'lecture 11: allKeyed and allSettledKeyed are not in Chrome 155');
  // lecture 12: the error table, row by row
  const caught = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log("thrown:", e.name, e.message);\n}`;
  const rejected = (expr) => `try {\n  (${expr}).then(() => console.log("fulfilled"), (e) => console.log("rejected:", e.name, e.message));\n} catch (e) {\n  console.log("thrown:", e.name, e.message);\n}`;
  for (const [code, want] of [
    [rejected('Promise.all(5)'), 'rejected: TypeError number 5 is not iterable (cannot read property Symbol(Symbol.iterator))'],
    [rejected('Promise.all()'), 'rejected: TypeError undefined is not iterable (cannot read property Symbol(Symbol.iterator))'],
    [caught('const { all } = Promise; all([])'), 'thrown: TypeError Promise.all called on non-object'],
    [caught('new Promise.all([])'), 'thrown: TypeError Promise.all is not a constructor'],
    [rejected('Promise.any([])'), 'rejected: AggregateError All promises were rejected'],
    [caught('new AggregateError()'), 'thrown: TypeError undefined is not iterable (cannot read property Symbol(Symbol.iterator))'],
    [rejected('Promise.try(5)'), 'rejected: TypeError number 5 is not a function'],
    ['const { promise, resolve } = Promise.withResolvers();\nresolve(promise);\npromise.catch((e) => console.log("rejected:", e.name, e.message));', 'rejected: TypeError Chaining cycle detected for promise #<Promise>'],
    ['const f = () => 1;\nconst g = () => 2;\nPromise.all([f, g]).then((v) => console.log("fulfilled:", v.map((x) => typeof x).join()));', 'fulfilled: function,function'],
  ]) await extra(code, [want], `lecture 12: ${want.slice(0, 70)}`);
  // lecture 13: the constructor and the resolving functions
  await extra(`${caught('Promise(() => {})')}\n${caught('new Promise(5)')}\nnew Promise(() => { throw new Error("в исполнителе"); }).catch((e) => console.log("rejected:", e.message));`,
    ["thrown: TypeError Promise constructor cannot be invoked without 'new'", 'thrown: TypeError Promise resolver 5 is not a function', 'rejected: в исполнителе'], 'lecture 13: without new, not a function, a throw in the executor');
  check(lecture.includes('27.2.4.7.1') && lecture.includes('PerformPromiseAll'), 'lecture 11, 13: the prose names 27.2.4.7.1 and PerformPromiseAll');
  // lecture 14: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const deck = [{ id: 1, word: "cat" }');
    const allFail = cards.replace('later({ from: "Мары", deck }, 250)', 'failLater("Мары: 503", 250)').replace('later({ from: "Дашогуз", deck }, 150)', 'failLater("Дашогуз: 404", 150)');
    check(allFail !== cards && !allFail.includes('from: "Мары"') && !allFail.includes('from: "Дашогуз"'), 'lecture 14, experiment 1: all three servers fail');
    await extra(allFail, ['слов нет: Ашхабад: нет связи; Мары: 503; Дашогуз: 404'], 'lecture 14, experiment 1: the reasons in the order of the servers');
    const longer = cards.replace('withTimeout(later([2], 500), 300)', 'withTimeout(later([2], 500), 600)');
    check(longer !== cards, 'lecture 14, experiment 2: the limit is 600 ms');
    await extra(longer, ['слова: 3, сервер «Дашогуз»', 'выучено: 1', 'тема: dark', 'к повторению: cat, suw | 500 мс'], 'lecture 14, experiment 2: progress arrives, 500 ms');
    const race = cards.replace('Promise.any(servers)', 'Promise.race(servers)');
    check(race !== cards, 'lecture 14, experiment 3: race instead of any');
    await extra(race, ["Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'map')"], 'lecture 14, experiment 3: race gives a plain Error without errors');
  }
  // notes: the comments of the main block
  await extra(`Promise.all([Promise.resolve(1), 2]).then((v) => console.log(v));
Promise.allSettled([Promise.reject(new Error("x"))]).then((r) => console.log(r[0].status, r[0].reason.message));
Promise.any([Promise.reject(new Error("x")), Promise.resolve("ok")]).then((v) => console.log(v));
Promise.race([new Promise(() => {}), "сразу"]).then((v) => console.log(v));
Promise.any([]).catch((e) => e.name).then((v) => console.log(v));
Promise.try(() => JSON.parse("{")).catch((e) => e.name).then((v) => console.log(v));`, ['(2) [1, 2]', 'rejected x', 'ok', 'сразу', 'AggregateError', 'SyntaxError'], 'notes: the main block');

  // task 1
  await extra(`const p = Promise.resolve(1);
const results = [];
const note = (i, promise) => promise.then((v) => { results[i] = \`выполнен: \${JSON.stringify(v)}\`; }, (e) => { results[i] = \`отклонён: \${e.name}\`; });
note(0, Promise.all([1, Promise.resolve(2)]));
const empty = Promise.all([]);
let thrown = "нет";
let six;
try { six = Promise.all(5); } catch { thrown = "да"; }
note(3, six);
note(1, Promise.any([]));
note(2, Promise.allSettled([Promise.reject(new Error("x"))]).then((r) => r.map((x) => x.status)));
const race = Promise.race([]);
setTimeout(() => console.log(results.join(" | "), "|", empty, "|", race, "| брошена:", thrown, "|", JSON.stringify(new AggregateError([]).message), Promise.resolve(p) === p), 1000);`,
  ['выполнен: [1,2] | отклонён: AggregateError | выполнен: ["rejected"] | отклонён: TypeError | Promise {<fulfilled>: Array(0)} | Promise {<pending>} | брошена: нет | "" true'], 'task 1: the eight answers');
  check(tasks.includes('«race C 100 мс», «any A 200 мс», «all (2) [\'A\', \'C\'] 200 мс», «allSettled 2 300 мс», «all') && tasks.includes('отклонён B 300 мс»'), 'task 3: the criteria quote the output');
  // task 4
  const loadClass = (schedule) => `async function loadClass() {
  try {
    const [group, days, marks] = await Promise.all([later(["Аман", "Мерет", "Сапар"], 300), ${schedule}, later({ Аман: [5, 4] }, 100)]);
    return \`\${group.length} ученика, занятия: \${days.join(", ")}, оценки у \${Object.keys(marks).length}\`;
  } catch (e) {
    return \`Не загрузилось: \${e.message}\`;
  }
}
const start = Date.now();
loadClass().then((text) => console.log(text, Math.round((Date.now() - start) / 100) * 100));`;
  await extra(loadClass('later(["пн", "ср", "пт"], 200)'), ['3 ученика, занятия: пн, ср, пт, оценки у 1 300'], 'task 4: all three, 300 ms');
  await extra(loadClass('failLater("расписание: 500", 200)'), ['Не загрузилось: расписание: 500 200'], 'task 4: the schedule fails, 200 ms');
  await extra(`async function oneByOne() {
  const group = await later(["Аман", "Мерет", "Сапар"], 300);
  const days = await later(["пн", "ср", "пт"], 200);
  const marks = await later({ Аман: [5, 4] }, 100);
  return group.length + days.length + Object.keys(marks).length;
}
const start = Date.now();
oneByOne().then(() => console.log(Math.round((Date.now() - start) / 100) * 100));`, ['600'], 'task 4: three awaits one by one, 600 ms');
  // task 5
  await extra(`const files = [
  { name: "group.json", promise: later("группа", 100) },
  { name: "schedule.json", promise: failLater("404", 200) },
  { name: "marks.json", promise: later("оценки", 150) },
  { name: "words.json", promise: later("слова", 50) },
  { name: "photos.json", promise: failLater("нет сети", 300) },
];
const start = Date.now();
Promise.allSettled(files.map((f) => f.promise)).then((results) => {
  const ok = files.filter((f, i) => results[i].status === "fulfilled").map((f) => f.name);
  const failed = files.map((f, i) => [f, results[i]]).filter(([, r]) => r.status === "rejected").map(([f, r]) => \`\${f.name} (\${r.reason.message})\`);
  console.log(\`загружено \${ok.length} из \${files.length}: \${ok.join(", ")}\`);
  console.log(\`не загружено: \${failed.join(", ")}\`, Math.round((Date.now() - start) / 100) * 100);
});`, ['загружено 3 из 5: group.json, marks.json, words.json', 'не загружено: schedule.json (404), photos.json (нет сети) 300'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`function fastest(servers) {
  return Promise.any(servers).catch((e) => (e.errors.length === 0 ? "серверов нет" : \`все серверы молчат: \${e.errors.map((x) => x.message).join(", ")}\`));
}
const start = Date.now();
fastest([later("Мары", 300), failLater("Ашхабад", 100), later("Дашогуз", 200)]).then((v) => console.log(v, Math.round((Date.now() - start) / 100) * 100));
fastest([failLater("Ашхабад", 100), failLater("Мары", 50)]).then((v) => console.log(v));
fastest([]).then((v) => console.log(v));
Promise.race([later("Мары", 300), failLater("Ашхабад", 100), later("Дашогуз", 200)]).catch((e) => console.log("race:", e.message));`,
  ['серверов нет', 'все серверы молчат: Ашхабад, Мары', 'race: Ашхабад', 'Дашогуз 200'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      console.log("таймер сработал");
      reject(new Error(\`нет ответа за \${ms} мс\`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
const start = Date.now();
withTimeout(later("ok", 100), 300).then((v) => console.log(v));
setTimeout(() => {
  withTimeout(later("ok", 500), 300).catch((e) => console.log(e.message, Math.round((Date.now() - start) / 100) * 100));
}, 400);
setTimeout(() => {
  withTimeout(Promise.reject(new Error("сразу")), 300).catch((e) => console.log(e.message));
}, 1100);`, ['ok', 'таймер сработал', 'нет ответа за 300 мс 700', 'сразу'], 'task 7: the numbers of the criteria');
  // task 8
  await extra(`function myAll(iterable) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const values = [];
  let remaining = 1;
  let index = 0;
  for (const item of iterable) {
    const i = index++;
    values.push(undefined);
    remaining++;
    Promise.resolve(item).then((value) => {
      values[i] = value;
      remaining--;
      if (remaining === 0) resolve(values);
    }, reject);
  }
  remaining--;
  if (remaining === 0) resolve(values);
  return promise;
}
const start = Date.now();
myAll([later("A", 300), later("B", 100), "C"]).then((v) => console.log(v, Math.round((Date.now() - start) / 100) * 100));
console.log(myAll([]));
myAll([failLater("x", 100), failLater("y", 50)]).catch((e) => console.log(e.message));
myAll(new Set([later(1, 10), 2])).then((v) => console.log(v));`, ['Promise {<fulfilled>: Array(0)}', '(2) [1, 2]', 'y', "(3) ['A', 'B', 'C'] 300"], 'task 8: the numbers of the criteria');
  // task 9
  await extra(`async function retry(fn, times) {
  const errors = [];
  for (let i = 1; i <= times; i++) {
    try {
      return await fn(i);
    } catch (e) {
      errors.push(e);
    }
  }
  throw new AggregateError(errors, \`\${times} попытки не удались\`);
}
const fn = (n) => (n < 3 ? failLater(\`попытка \${n}: нет связи\`, 50) : later("данные", 50));
retry(fn, 3).then((v) => console.log(v));
setTimeout(() => retry(fn, 2).catch((e) => console.log(e.name, "|", e.message, "|", e.errors.map((x) => x.message).join("; "))), 300);
setTimeout(() => retry(() => { throw new Error("сразу"); }, 2).catch((e) => console.log(e.errors.map((x) => x.message).join("; "))), 600);`,
  ['данные', 'AggregateError | 2 попытки не удались | попытка 1: нет связи; попытка 2: нет связи', 'сразу; сразу'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
