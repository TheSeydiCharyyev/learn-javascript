// Course 3, day 7, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. A block whose first line starts with "// в консоли" is
// console input, run line by line through Runtime.evaluate with replMode, as on day 4. Console output of scripts is
// rebuilt from Chrome's preview objects, as DevTools prints it (null as "null"); an uncaught error is printed as
// "Uncaught TypeError: …". The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-07.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-07.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output, in the notes the comments of console.log lines do and the
// homework has its answers (MDN from tools/.cache/mdn-content.git); the quoted line of the twins search (day 33 of course 2,
// a block with data-page) is the real one; the cheatsheet runs without an error; the experiments the lecture only
// tells about; what the lecture says about the text of ECMA-262 2026 (sections 7.3 and 7.4 and the built-ins that call
// them) is checked against tools/.cache/ecma262-2026.html; the days it points to say what it says; the reference
// table holds all 57 rows of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-07');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const PAGES = ['lecture', 'student'];
// the notes write the output in the comment of the line that prints it: "console.log(x);   // 3 — why"
const commented = (code) => code.split('\n').filter((l) => l.includes('console.log(') && l.includes('//'))
  .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  // null comes as an object with subtype null and no description
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};
// what the console prints after an input: strings in quotes, the rest as in console.log
const echo = (a) => (a.type === 'string' ? q(a.value) : show(a));

// a block without a result-box: its output by the first line; the tasks ask to predict these, the answers live here
const EXPECT = {};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {};
const checkable = (code) => {
  const names = Object.keys(SOLUTIONS).filter((n) => code.includes(`${n}(`));
  const lines = code.split('\n').map((line) => {
    const m = line.match(/^(?!const |let )(.+?);\s*\/\/\s*(.+?)(?:\s+—.*)?$/);
    return m ? `__check(${JSON.stringify(m[1])}, () => (${m[1]}), ${JSON.stringify(m[2])});` : line;
  });
  return `function __check(text, fn, want) {
  const got = JSON.stringify(fn()), exp = JSON.stringify((0, eval)("(" + want + ")"));
  console.log((got === exp ? "EX-OK " : "EX-BAD ") + text + " = " + got + (got === exp ? "" : ", comment: " + want));
}
${names.map((n) => SOLUTIONS[n]).join('\n')}
${lines.join('\n')}`;
};
// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = {
  '// tests.js, день 33 курса 2 — поиск повторов': 'intermediate/day-33/lecture.html',
};

// run code as the only <script> of a page; returns console lines and uncaught errors in order
async function runScript(ctx, code, file = 'run.html', attrs = '') {
  const html = `<!doctype html><meta charset="utf-8"><title>run</title><body><script${attrs}>${code}\n</script></body>`;
  await ctx.route(`http://day.test/${file}`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const out = [];
  cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails;
    out.push(`Uncaught ${(d.exception?.description ?? d.text).split('\n')[0]}`);
  });
  await cdp.send('Runtime.enable');
  await p.goto(`http://day.test/${file}`);
  await p.waitForTimeout(100);
  await p.close();
  await ctx.unroute(`http://day.test/${file}`);
  return out;
}

// run the lines of a console block one by one on one page; returns the echo of each input
async function runConsole(ctx, code, file = 'console.html') {
  await ctx.route(`http://day.test/${file}`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>console</title>' }));
  const p = await ctx.newPage();
  await p.goto(`http://day.test/${file}`);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Runtime.enable');
  const out = [];
  for (const expression of code.split('\n').slice(1).filter((l) => l.trim())) {
    const r = await cdp.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true });
    out.push(r.exceptionDetails ? `Uncaught ${(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split('\n')[0]}` : echo(r.result));
  }
  await p.close();
  await ctx.unroute(`http://day.test/${file}`);
  return out;
}

// one line of docs/coverage/*.csv: a title with a comma is in double quotes
const csvLine = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// the same text in one line, without the spaces that removed tags leave before punctuation
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
// the steps of a clause in the order they are written: every word must come after the one before
const inOrder = (text, words) => words.every((w, i) => text.includes(w) && (i === 0 || text.indexOf(words[i - 1]) < text.indexOf(w)));
const hasAll = (text, words) => words.every((w) => text.includes(w));

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };

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
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const first = blk.code.split('\n')[0];
      if (QUOTES[first]) {
        const quoted = fs.readFileSync(path.join(ROOT, QUOTES[first]), 'utf8');
        // the quoted page marks some blocks with data-page, so the tag may carry attributes
        const code = [...quoted.matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).join('\n');
        const lines = blk.code.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
        const missing = lines.filter((l) => !code.split('\n').some((c) => c.trim() === l));
        check(missing.length === 0, `${name} #${i}: quoted lines are in ${QUOTES[first]}${missing.length ? ` — missing: ${missing.join(' | ')}` : ''}`);
        continue;
      }
      const consoleBlock = first.startsWith('// в консоли');
      const out = consoleBlock ? await runConsole(ctx, blk.code, `${name}-${i}.html`)
        : await runScript(ctx, blk.example ? checkable(blk.code) : blk.code, `${name}-${i}.html`);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : consoleBlock ? ' (console)' : blk.example ? ' (example)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('Uncaught')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) {
        const lines = out.filter((l) => l.startsWith('EX-'));
        for (const l of lines) check(l.startsWith('EX-OK'), `${name} #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(lines.length > 0 && !out.some((l) => l.startsWith('Uncaught')), `${name} #${i} example runs with the reference solution: ${lines.length} lines`);
        continue;
      }
      if (name === 'student') check(JSON.stringify(out) === JSON.stringify(commented(blk.code)), `${name} #${i}: output = comments ${JSON.stringify(out)}`);
      else if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else if (EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
    }
  }

  // what the lecture only tells about
  {
    const out = await runScript(ctx, `const log = [];
const strictFrozen = (() => { "use strict"; const a = Object.freeze([1]); try { a[0] = 9; return "no error"; } catch (e) { return e.name; } })();
Object.defineProperty(Object.prototype, "word", { set(v) { log.push(v); }, configurable: true });
const lit = { word: "a" };
const o = {};
o.word = "b";
delete Object.prototype.word;
console.log(strictFrozen, log.join(), Object.hasOwn(lit, "word"), Object.hasOwn(o, "word"));`, 'told-1.html');
    check(JSON.stringify(out) === '["TypeError b true false"]',
      `lecture 3, 4: strict assignment to a frozen array throws; a literal defines and passes an inherited setter by, an assignment calls it ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const log = [];
class P { constructor() { log.push(Object.hasOwn(this, "f")); } }
class Q extends P { f = 1; }
const q = new Q();
class C { x = this.#m(); a = log.push("a"); b = log.push("b"); #m() { return 1; } }
const c = new C();
console.log(log.join(), Object.getPrototypeOf(q) === Q.prototype, c.x);`, 'told-2.html');
    check(JSON.stringify(out) === '["false,a,b true 1"]',
      `lecture 7, 10: the prototype comes from newTarget; a field of the child is not there yet in the parent's constructor; private methods come before fields, fields in order ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const attempt = (f) => { try { return String(f()); } catch (e) { return e.name; } };
const log = [];
const it = { [Symbol.asyncIterator]() { return { next: async () => ({ value: 1, done: false }), return: async () => { log.push("return"); return {}; } }; } };
console.log(attempt(() => Object.groupBy(null, (x) => x)), attempt(() => Object.groupBy([], 5)), attempt(() => Object.groupBy(5, (x) => x)));
(async () => { for await (const x of it) break; console.log(log.join()); })();`, 'told-3.html');
    check(JSON.stringify(out) === JSON.stringify(['TypeError TypeError TypeError', 'return']),
      `lecture 11, 13: groupBy checks null and the callback, a number is not iterable; break in for await calls return ${JSON.stringify(out)}`);
  }
  // notes, homework 1, 2 and 4: push on a frozen empty array, four integrity tests, next throws — no return
  {
    const out = await runScript(ctx, `const attempt = (f) => { try { return String(f()); } catch (e) { return e.name + ": " + e.message; } };
console.log(attempt(() => Object.freeze([]).push(1)));
console.log(Object.isFrozen(Object.freeze({ get x() { return 1; } })), Object.isFrozen(Object.seal({ a: 1 })), Object.isSealed(Object.freeze({ a: 1 })), Object.isFrozen(Object.seal({})));
const log = [];
const it = { [Symbol.iterator]() { return { next() { throw new Error("next"); }, return() { log.push("return"); return {}; } }; } };
try { for (const x of it) {} } catch (e) { log.push(e.message); }
console.log(log.join());`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(['TypeError: Cannot add property 0, object is not extensible', 'true false true true', 'next']),
      `student homework 1, 2, 4: push on a frozen [] — "Cannot add property 0"; isFrozen/isSealed by TestIntegrityLevel; a throwing next() is not closed ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  check(f('sec-get-o-p').includes('Return ? O. [[Get]] (P, O)') && f('sec-getv').includes('Let O be ? ToObject (V). Return ? O. [[Get]] (P, V)'),
    'lecture 2: Get passes O as the receiver, GetV looks in the wrapper and passes the value itself');
  check(f('sec-set-o-p-v-throw').includes('Let success be ? O. [[Set]] (P, V, O). If success is false and Throw is true, throw a TypeError exception')
    && f('sec-putvalue').includes('If succeeded is false and V. [[Strict]] is true, throw a TypeError exception'),
  'lecture 3: Set throws by the flag, an assignment (PutValue) only in strict code');
  check(f('sec-array.prototype.push').includes('Perform ? Set (O, ! ToString (𝔽 (len)), E, true)') && f('sec-array.prototype.pop').includes('Perform ? DeletePropertyOrThrow (O, index)')
    && f('sec-object.defineproperty').includes('Perform ? DefinePropertyOrThrow (O, key, desc)') && f('sec-object.assign').includes('Let propValue be ? Get (from, nextKey). Perform ? Set (to, nextKey, propValue, true)'),
  'lecture 3, 4: push and Object.assign call Set with true, pop — DeletePropertyOrThrow, defineProperty — DefinePropertyOrThrow');
  const ownDesc = f('sec-ordinarysetwithowndescriptor');
  check(hasAll(ownDesc, ['10.1.9.2 OrdinarySetWithOwnDescriptor', 'If ownDesc. [[Writable]] is false, return false', 'Return ? CreateDataProperty (Receiver, P, V)', 'Perform ? Call (setter, Receiver, «V»)'])
    && hasAll(f('sec-createdataproperty'), ['[[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : true', 'Return ? O. [[DefineOwnProperty]] (P, newDesc)']),
  'lecture 4: an inherited read-only property stops [[Set]], a setter is called, a new property ends in CreateDataProperty; CreateDataProperty defines');
  check(inOrder(f('sec-copydataproperties'), ['If source is either undefined or null, return unused', 'Let from be ! ToObject (source)', 'Let keys be ? from. [[OwnPropertyKeys]] ()',
    'desc. [[Enumerable]] is true', 'Let propValue be ? Get (from, nextKey)', 'Perform ! CreateDataPropertyOrThrow (target, nextKey, propValue)'])
    && (spec.match(/aoid="CopyDataProperties"/g) || []).length >= 4, 'lecture 5: CopyDataProperties — null, ToObject, own keys, enumerable, Get, define; spread and rest call it');
  check(inOrder(f('sec-call'), ['If argumentsList is not present, set argumentsList to a new empty List', 'If IsCallable (F) is false, throw a TypeError exception', 'Return ? F. [[Call]] (V, argumentsList)'])
    && f('sec-invoke').includes('Let func be ? GetV (V, P). Return ? Call (func, V, argumentsList)')
    && f('sec-getmethod').includes('If func is either undefined or null, return undefined. If IsCallable (func) is false, throw a TypeError exception'),
  'lecture 6: Call checks IsCallable; Invoke is GetV and Call; GetMethod — null and undefined mean no method');
  check(inOrder(f('sec-array.prototype.map'), ['If IsCallable (callback) is false, throw a TypeError exception', 'ArraySpeciesCreate (O, len)', 'Call (callback, thisArg, «kValue, 𝔽 (k), O»)'])
    && f('sec-getiteratorfrommethod').includes('If iterator is not an Object, throw a TypeError exception') && f('sec-array.prototype.tolocalestring').includes('Invoke (')
    && f('sec-serializejsonproperty').includes('If IsCallable (toJSON) is true'), 'lecture 6: map checks the callback first; a non-object iterator; toLocaleString — Invoke; toJSON — Get and IsCallable');
  check(hasAll(f('sec-construct'), ['If newTarget is not present, set newTarget to F', 'Return ? F. [[Construct]] (argumentsList, newTarget)', 'this operation is equivalent to: new F(...argumentsList)'])
    && f('sec-super-keyword-runtime-semantics-evaluation').includes('Let result be ? Construct (func, argList, newTarget)') && f('sec-array.from').includes('Construct (C)'),
  'lecture 7: Construct and its note; super() passes newTarget; Array.from constructs this');
  check(f('sec-arrayspeciescreate').includes('10.4.2.3 ArraySpeciesCreate') && f('sec-promise.prototype.then').includes('SpeciesConstructor (promise, %Promise%)')
    && inOrder(f('sec-speciesconstructor'), ['Let C be ? Get (O, "constructor")', 'Let S be ? Get (C, %Symbol.species%)']), 'lecture 7: map — ArraySpeciesCreate 10.4.2.3, then — SpeciesConstructor: constructor, then Symbol.species');
  check(inOrder(f('sec-setintegritylevel'), ['Let status be ? O. [[PreventExtensions]] ()', 'If IsAccessorDescriptor (currentDesc) is true, then Let desc be the PropertyDescriptor { [[Configurable]] : false }',
    'Else, Let desc be the PropertyDescriptor { [[Configurable]] : false, [[Writable]] : false }'])
    && inOrder(f('sec-testintegritylevel'), ['If extensible is true, return false', 'If currentDesc. [[Configurable]] is true, return false', 'If currentDesc. [[Writable]] is true, return false', 'Return true']),
  'lecture 8: freeze — PreventExtensions, accessors only non-configurable; isFrozen — extensible, configurable, writable');
  check(f('sec-instanceofoperator').includes('Let instOfHandler be ? GetMethod (target, %Symbol.hasInstance%)')
    && inOrder(f('sec-ordinaryhasinstance'), ['If C has a [[BoundTargetFunction]] internal slot', 'Let P be ? Get (C, "prototype")', 'If SameValue (P, O) is true, return true']),
  'lecture 9: instanceof asks GetMethod for Symbol.hasInstance; OrdinaryHasInstance — bound target, prototype, the chain by SameValue');
  check(inOrder(f('sec-initializeinstanceelements'), ['Perform ? PrivateMethodOrAccessorAdd (O, method)', 'Perform ? DefineField (O, fieldRecord)'])
    && f('sec-definefield').includes('Perform ? CreateDataPropertyOrThrow (receiver, fieldName, initValue)')
    && inOrder(f('sec-privatefieldadd'), ['If the host is a web browser, then Perform ? HostEnsureCanAddPrivateElement (O)', 'If entry is not empty, throw a TypeError exception'])
    && f('sec-privateget').includes('If entry is empty, throw a TypeError exception') && f('sec-privateset').includes('If entry. [[Kind]] is method, throw a TypeError exception')
    && f('sec-hostensurecanaddprivateelement').includes('prevent the addition of private elements to particular host-defined exotic objects'),
  'lecture 10: methods before fields, a field is CreateDataPropertyOrThrow; PrivateFieldAdd asks the host and throws on a second add; PrivateGet and PrivateSet throw');
  check(inOrder(f('sec-groupby'), ['Perform ? RequireObjectCoercible (items)', 'If IsCallable (callback) is false, throw a TypeError exception', 'Let iteratorRecord be ? GetIterator (items, sync)',
    'Let next be ? IteratorStepValue (iteratorRecord)', 'Call (callback, undefined, «value, 𝔽 (k)»)', 'IfAbruptCloseIterator (key, iteratorRecord)', 'ToPropertyKey (key)',
    'CanonicalizeKeyedCollectionKey (key)', 'Perform AddValueToKeyedGroup (groups, key, value)'])
    && f('sec-add-value-to-keyed-group').includes('If SameValue (g. [[Key]], key) is true') && hasAll(f('sec-object.groupby'), ['20.1.2.13 Object.groupBy', 'Let obj be OrdinaryObjectCreate (null)']),
  'lecture 11: GroupBy step by step; groups by SameValue; Object.groupBy (20.1.2.13) makes an object without a prototype');
  check(hasAll(f('sec-iterator-records'), ['[[Iterator]] an Object', '[[NextMethod]] an ECMAScript language value', '[[Done]] a Boolean']) && f('sec-getiteratordirect').includes('Let nextMethod be ? Get (obj, "next")')
    && f('sec-runtime-semantics-forinofheadevaluation').includes('Return ? GetIterator (exprValue, iteratorKind)'),
  'lecture 12: table 13 — three fields; GetIteratorDirect reads next once; the head of for...of calls GetIterator');
  const body = f('sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset');
  check(body.includes('14.7.5.7 ForIn/OfBodyEvaluation') && inOrder(body, ['Let nextResult be ? Call (iteratorRecord. [[NextMethod]], iteratorRecord. [[Iterator]])',
    'If nextResult is not an Object, throw a TypeError exception', 'Let done be ? IteratorComplete (nextResult)', 'Let nextValue be ? IteratorValue (nextResult)']) && body.includes('IteratorClose')
    && !body.includes('IteratorStepValue'), 'lecture 12, schemes 1 and 3: for...of steps itself (14.7.5.7) — next, an object, done, value; it closes with IteratorClose, not through IteratorStepValue');
  check(inOrder(f('sec-iteratorstep'), ['Let result be ? IteratorNext (iteratorRecord)', 'Let done be Completion (IteratorComplete (result))'])
    && inOrder(f('sec-iteratorstepvalue'), ['Let result be ? IteratorStep (iteratorRecord)', 'If result is done, then Return done', 'Let value be Completion (IteratorValue (result))'])
    && f('sec-iteratornext').includes('If result is not an Object, then Set iteratorRecord. [[Done]] to true. Throw a TypeError exception')
    && f('sec-iteratorcomplete').includes('Return ToBoolean (? Get (iteratorResult, "done"))')
    && ['sec-array.from', 'sec-groupby'].every((id) => f(id).includes('IteratorStepValue')), 'lecture 12: IteratorStepValue — next, done, then value; a non-object result throws; done goes through ToBoolean; Array.from and GroupBy use it');
  check(inOrder(f('sec-iteratorclose'), ['Let innerResult be Completion (GetMethod (iterator, "return"))', 'If return is undefined, return ? completion', 'Set innerResult to Completion (Call (return, iterator))',
    'If completion is a throw completion, return ? completion', 'If innerResult is a throw completion, return ? innerResult', 'If innerResult. [[Value]] is not an Object, throw a TypeError exception']),
  'lecture 13: IteratorClose — no return, nothing; the body error first; then return must give an object');
  check(f('sec-lengthofarraylike').includes('Return ℝ (? ToLength (? Get (obj, "length")))') && f('sec-createlistfromarraylike').includes('If obj is not an Object, throw a TypeError exception')
    && f('sec-error-message').includes('CreateNonEnumerableDataPropertyOrThrow (O, "message", msg)') && f('sec-installerrorcause').includes('CreateNonEnumerableDataPropertyOrThrow (O, "cause", cause)')
    && !spec.includes('id="sec-error.prototype.stack"'), 'lecture 14: LengthOfArrayLike, CreateListFromArrayLike throws on a non-object; message and cause are non-enumerable; no stack in the standard');
  check(f('sec-object.keys').includes('EnumerableOwnProperties (obj, key)'), 'scheme 1: Object.keys is EnumerableOwnProperties');
  const push = f('sec-array.prototype.push');
  check(push.includes('23.1.3.23 Array.prototype.push') && (push.match(/Perform \? Set \(O, /g) || []).length === 2 && push.includes('Perform ? Set (O, ! ToString (𝔽 (len)), E, true)')
    && push.includes('Perform ? Set (O, "length", 𝔽 (len), true)'), 'student homework 1: push is 23.1.3.23 with two Set calls, both with true');
  const mdn = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/iteration_protocols/index.md'], { encoding: 'utf8' });
  check(mdn.includes('### Errors during iteration') && mdn.includes('the iteration in progress is aborted without retrying or cleanup')
    && mdn.includes('The `return()` method is only called for premature exits'), 'student homework 4: MDN — a throwing next() is not cleaned up, return() only for premature exits');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('intermediate/day-02/lecture.html').includes('оборачиваются в объек') && read('intermediate/day-10/lecture.html').includes('new.target')
    && read('intermediate/day-09/lecture.html').includes(' in ') && /#\w+ in /.test(read('intermediate/day-09/lecture.html')),
  'lecture 2, 7, 10: a primitive this is wrapped — course 2 day 2; new.target — day 10; #x in — day 9');
  check(read('intermediate/day-31/lecture.html').includes('JSON.parse(\'{"__proto__": {"admin": true}}\')') && read('intermediate/day-07/lecture.html').includes('<h3>__proto__</h3>'),
    'lecture 4: JSON with "__proto__" — course 2 day 31, the __proto__ accessor — day 7');
  check(read('essentials/day-21/lecture.html').includes('Object.groupBy') && read('intermediate/day-14/lecture.html').includes('Map.groupBy') && read('essentials/day-22/lecture.html').includes('spread'),
    'lecture 5, 11: spread — Essentials 22, Object.groupBy — Essentials 21, Map.groupBy — course 2 day 14');
  check(read('intermediate/day-33/lecture.html').includes('номер карточки → { next, step }') && read('advanced/day-05/lecture.html').includes('dataset'),
    'lecture 15: progress of the Cards is a Map by card number (course 2 day 33); the dataset fork of day 5');
  check(read('intermediate/day-27/lecture.html').includes('AggregateError') && read('intermediate/day-29/lecture.html').includes('for await') && read('intermediate/day-13/lecture.html').includes('Iterator.from'),
    'reference: AggregateError — course 2 day 27, for await — 29, Iterator.from — 13');

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-07/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '7').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 57 && refRows.length === 57 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 7, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '7').map((c) => c[0]);
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 7`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
