// Course 3, day 15, in Chrome: exotic objects — bound functions, arrays, strings, arguments, the module namespace and
// the immutable prototype. Every <pre class="code js"> block of the lecture runs as the only <script> in the <body> of a
// clean page (one block appends an iframe to the body, one imports a module from a data: URL and prints in .then), the
// way a student would paste it into a file. Console output is rebuilt from Chrome's preview objects, as DevTools prints
// it; an uncaught error is printed as "Uncaught TypeError: …". The context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-15.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-15.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block of the notes prints what the comments of its
// console.log lines say, and the homework (1–3 in Chrome, 4 in the text of MDN); the quoted due of deck.js (day 33 of
// course 2) is the real one; the cheatsheet runs without an error; the experiments the lecture only tells about (what an assignment to
// an index and to length of an array calls and what map asks, seen through the traps of a Proxy — the run may use what
// the lecture may not; the holes in Chrome's preview; the edge cases of length and name of a bound function, bind of an
// arrow, bind of bind with new; the species getter; the flags of length; silent writes to a string in sloppy code; the
// value of a mapped index, duplicate names past the passed arguments, no arguments in an arrow; the namespace object;
// a cycle and a null prototype for an ordinary [[SetPrototypeOf]]); what the lecture says about the text of ECMA-262
// 2026 (section 10.4 and the operations it calls) is checked against tools/.cache/ecma262-2026.html; the MDN pages of
// the footer are in tools/.cache/mdn-content.git; the days it points to say what it says; the reference table holds all
// 9 rows of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-15');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['false x-y bound bound Tag 0', 'x-y true true true'],
  'tasks #1': ['8 0,1,2,3,4,7', '2 0,1', '4 0,1 false', 'ok TypeError TypeError TypeError a,b,C,'],
  'tasks #2': ['0 1 2 5 length title 01 i 3', 'TypeError ok ok ok 0 1 2 3 title 01'],
  'tasks #8': ['ok TypeError TypeError TypeError TypeError TypeError | false true true false true'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  myBind: `function myBind(target, boundThis, ...boundArgs) {
  const bound = function (...args) {
    if (new.target !== undefined) return new target(...boundArgs, ...args);
    return Function.prototype.apply.call(target, boundThis, [...boundArgs, ...args]);
  };
  Object.setPrototypeOf(bound, Object.getPrototypeOf(target));
  const len = Object.hasOwn(target, "length") && typeof target.length === "number" ? target.length : 0;
  Object.defineProperty(bound, "length", { value: Math.max(0, Math.trunc(len) - boundArgs.length) });
  Object.defineProperty(bound, "name", { value: "bound " + (typeof target.name === "string" ? target.name : "") });
  bound.prototype = target.prototype;
  return bound;
}`,
  setLength: `function setLength(o, desc) {
  const define = (k, d) => { try { Object.defineProperty(o, k, d); return true; } catch { return false; } };
  if (!("value" in desc)) return define("length", desc);
  const newLen = desc.value >>> 0;
  if (newLen !== Number(desc.value)) throw new RangeError("Invalid array length");
  const old = Object.getOwnPropertyDescriptor(o, "length");
  if (newLen >= old.value) return define("length", { ...desc, value: newLen });
  if (!old.writable) return false;
  const newWritable = desc.writable !== false;
  if (!define("length", { value: newLen, writable: true })) return false;
  const isIndex = (k) => String(Number(k)) === k && Number.isInteger(Number(k)) && Number(k) >= 0 && Number(k) <= 2 ** 32 - 2;
  const doomed = Object.getOwnPropertyNames(o).filter(isIndex).map(Number).filter((i) => i >= newLen).sort((x, y) => y - x);
  for (const i of doomed) {
    if (!delete o[i]) {
      define("length", newWritable ? { value: i + 1 } : { value: i + 1, writable: false });
      return false;
    }
  }
  if (!newWritable) define("length", { writable: false });
  return true;
}`,
  mappedIndices: `function mappedIndices(params, argCount) {
  const seen = new Set(), result = [];
  for (let i = params.length - 1; i >= 0; i--) {
    if (seen.has(params[i])) continue;
    seen.add(params[i]);
    if (i < argCount) result.unshift([i, params[i]]);
  }
  return result;
}`,
  Deck: `class Deck {
  #words;
  #history = [];
  constructor(words) { this.#words = [...words]; }
  answer(word) { this.#history.push(word); }
  get history() { return Object.freeze([...this.#history]); }
}`,
  stringOwn: `function stringOwn(str, key) {
  if (typeof key !== "string") return undefined;
  const index = key === "-0" ? -0 : String(Number(key)) === key ? Number(key) : undefined;
  if (index === undefined || !Number.isInteger(index)) return undefined;
  if (Object.is(index, -0) || index < 0) return undefined;
  if (index >= str.length) return undefined;
  return { value: str[index], writable: false, enumerable: true, configurable: false };
}`,
};
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
// the notes write the output in the comment of the line that prints it: "console.log(x);   // 3 — why"
const commented = (code) => code.split('\n').filter((l) => l.includes('console.log(') && l.includes('//'))
  .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = { '// deck.js, день 33 курса 2 — настоящий due': 'intermediate/day-33/lecture.html' };
const RUN = 'const run = (f) => { try { f(); return "ok"; } catch (e) { return `${e.name}: ${e.message}`; } };\n';
// an iframe and a module from a data: URL need a moment more before the page closes
const wait = (code) => (code.includes('iframe') || code.includes('import(') ? 400 : 150);

// run code as the only <script> in the <body> of a page; returns console lines and uncaught errors in order
async function runScript(ctx, code, file = 'run.html') {
  const html = `<!doctype html><meta charset="utf-8"><title>run</title><body><script>${code}\n</script></body>`;
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
  await p.waitForTimeout(wait(code));
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
// the algorithm of a clause without its header (the header names every parameter)
const steps = (text) => text.slice(text.indexOf('It performs the following steps when called'));
// the clauses whose text calls an operation: the nearest clause before every <emu-xref aoid="op">, named by its
// operation (aoid) when it defines one, else by its id
const clauses = (spec) => [...spec.matchAll(/<emu-clause([^>]*)>/g)].map((m) => [m.index, (m[1].match(/\saoid="([^"]+)"/) ?? m[1].match(/\sid="([^"]+)"/))?.[1]]);
const callersOf = (spec, op) => {
  const ids = clauses(spec);
  const found = new Set();
  for (const m of spec.matchAll(new RegExp(`<emu-xref aoid="${op}"`, 'g'))) {
    let id = null;
    for (const [at, cid] of ids) { if (at > m.index) break; id = cid; }
    if (id) found.add(id);
  }
  return [...found];
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  for (const name of PAGES) {
    const src = await ctx.newPage();
    await src.goto(builtSite.urlOfFile(path.join(DAY, `${name}.html`)));
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
        const code = [...quoted.matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).join('\n');
        const lines = blk.code.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
        const missing = lines.filter((l) => !code.split('\n').some((c) => c.trim() === l));
        check(missing.length === 0, `${name} #${i}: quoted lines are in ${QUOTES[first]}${missing.length ? ` — missing: ${missing.join(' | ')}` : ''}`);
        continue;
      }
      const out = await runScript(ctx, blk.example ? checkable(blk.code) : blk.code, `${name}-${i}.html`);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : blk.example ? ' (example)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(out.length === 0, `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) {
        const lines = out.filter((l) => l.startsWith('EX-'));
        for (const l of lines) check(l.startsWith('EX-OK'), `${name} #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(lines.length > 0 && lines.length === out.length, `${name} #${i} example runs with the reference solution: ${lines.length} lines`);
        continue;
      }
      if (name === 'student') check(same(out, commented(blk.code)), `${name} #${i}: output = comments ${JSON.stringify(out)}`);
      else if (EXPECT[`${name} #${i}`]) check(same(out, EXPECT[`${name} #${i}`]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: no result-box`);
    }
  }

  // what the lecture only tells about
  const told = async (code, want, text, file) => { const out = await runScript(ctx, code, file); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  // sections 5 and 7: what an assignment to an index and to length calls, through the traps of a Proxy over an array
  await told(`const log = [];
const arr = ["a", "b"];
const p = new Proxy(arr, { defineProperty(t, k, d) { log.push(k + " " + JSON.stringify(d)); return Reflect.defineProperty(t, k, d); } });
p[5] = "f";
p.length = 1;
console.log(log.join(" | "), arr.length);`, ['5 {"value":"f","writable":true,"enumerable":true,"configurable":true} | length {"value":1} 1'],
  'lecture 5, 7: a[i] = v ends in [[DefineOwnProperty]] with the full data descriptor (CreateDataProperty on the Receiver), length = n — [[DefineOwnProperty]] of "length" with only value (ArraySetLength)', 'traps-define.html');
  // section 9: map asks constructor (ArraySpeciesCreate), toSorted does not (ArrayCreate); IsArray sees through a Proxy
  await told(`const seen = (f) => { const log = []; const p = new Proxy(["b", "a"], { get(t, k, r) { if (typeof k === "string" && !/^[0-9]+$/.test(k)) log.push(k); return Reflect.get(t, k, r); } }); f(p); return log.join(","); };
console.log(seen((p) => Array.prototype.map.call(p, (x) => x)), "|", seen((p) => Array.prototype.toSorted.call(p)), "|", Array.isArray(new Proxy([], {})));`,
  ['length,constructor | length | true'], 'lecture 9: map reads length and constructor (ArraySpeciesCreate), toSorted only length (ArrayCreate)', 'traps-species.html');
  // section 6: the holes — Chrome's preview of a has only 0, 1 and 5, DevTools draws the gap as «empty × 3»
  {
    await ctx.route('http://day.test/holes.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>holes</title><body></body>' }));
    const p = await ctx.newPage();
    await p.goto('http://day.test/holes.html');
    const cdp = await ctx.newCDPSession(p);
    const r = await cdp.send('Runtime.evaluate', { expression: 'const a = [1, 2]; a[5] = 6; a', generatePreview: true, replMode: true });
    const names = r.result.preview.properties.map((x) => x.name).join();
    await p.close();
    check(r.result.description === 'Array(6)' && names === '0,1,5', `lecture 6: the preview of a — ${r.result.description}, elements ${names}: the gap 2–4 is empty`);
  }
  await told(`function f(a, b, c) {}
Object.defineProperty(f, "length", { value: -Infinity });
const g = function () {}; Object.defineProperty(g, "length", { value: 2.7 });
const s = function () {}; Object.defineProperty(s, "length", { get() { return "3"; } });
const h = function (a, b) {}; delete h.length;
class A { static name() {} }
console.log(f.bind().length, g.bind().length, s.bind().length, h.bind().length, h.length, JSON.stringify(A.bind().name));
const d = Object.getOwnPropertyDescriptor(g.bind(), "length");
console.log(d.writable, d.enumerable, d.configurable);`, ['0 2 0 0 0 "bound "', 'false false true'],
  'lecture 2: length of a bound function — −∞ → 0, a fraction is cut, not a Number or not own → 0 (h.length 0 is inherited); a name that is not a String → "bound "', 'bound-length.html');
  await told(`class Point {}
const B2 = Point.bind(null).bind(null);
console.log((() => this).bind({ x: 1 })() === window, new B2() instanceof Point, new Point() instanceof B2, B2.name, Object.getPrototypeOf(B2) === Function.prototype);`,
  ['true true true bound bound Point true'], 'lecture 3, 4: bind of an arrow does not give it this (note 2); bind of bind constructs Point, instanceof asks the target', 'bound-more.html');
  await told(`${RUN}class Deck extends Array {}
const desc = Object.getOwnPropertyDescriptor(Array, Symbol.species);
console.log(Object.hasOwn(Deck, Symbol.species), Deck[Symbol.species] === Deck, typeof desc.get, desc.set);
const b = [1];
b.constructor = 1;
console.log(run(() => b.map((x) => x)));`, ['false true function undefined', 'TypeError: object.constructor[Symbol.species] is not a constructor'],
  'lecture 9: Deck inherits the static getter Symbol.species of Array, it returns this; a constructor that is not a constructor and not an object — TypeError', 'species.html');
  await told(`const flags = (d) => [d.value, d.writable, d.enumerable, d.configurable].join();
const list = [Object.freeze([1]), new String("ab"), Array.prototype, String.prototype, []].map((o) => flags(Object.getOwnPropertyDescriptor(o, "length")));
console.log(list.join(" | "));`, ['1,false,false,false | 2,false,false,false | 0,true,false,false | 0,false,false,false | 0,true,false,false'],
  'lecture 1, 7, 9, 10: freeze makes length read-only; length of a String object and of String.prototype is read-only and fixed; Array.prototype and a new array — writable, not configurable', 'length-flags.html');
  await told(`const word = "kitap";
word[0] = "K"; word[9] = "!"; word.length = 1;
console.log(word, word.length, word[9], "K" + word.slice(1));`, ['kitap 5 undefined Kitap'],
  'lecture 11: in sloppy code the writes to a string are silent and change nothing; a new string instead', 'string-sloppy.html');
  await told(`function m(a) { a = 5; return Object.getOwnPropertyDescriptor(arguments, "0").value; }
function d(x, x) { x = 9; return [arguments[0], x].join(); }
console.log(m(1), d(1), (() => typeof arguments)());`, ['5 1,9 undefined'],
  'lecture 13, 14: [[GetOwnProperty]] of a mapped index gives the binding; the last x is number 1 — past the passed arguments, so no index is mapped; an arrow has no arguments', 'arguments-more.html');
  await told(`"use strict";
${RUN}import("data:text/javascript," + encodeURIComponent("export let b = 1; export const a = 2;")).then((ns) => {
  const d = Object.getOwnPropertyDescriptor(ns, "b");
  console.log(d.writable, d.enumerable, d.configurable, Object.isExtensible(ns), run(() => Object.setPrototypeOf(ns, null)), run(() => { ns.c = 1; }), "|", run(() => delete ns.a), "toString" in ns);
  const t = Object.getOwnPropertyDescriptor(ns, Symbol.toStringTag);
  console.log(Object.getOwnPropertySymbols(ns).length, t.value, t.writable, run(() => Object.defineProperty(ns, "b", { value: 2 })), Object.keys(ns).join());
});`, ['true true false false ok TypeError: Cannot assign to property \'c\' of [object Module] | TypeError: Cannot delete property \'a\' of [object Module] false',
    '1 Module false TypeError: Cannot redefine property: b a,b'],
  'lecture 15: namespace properties writable, enumerable, not configurable; not extensible; the same null prototype is fine; prototype null — no toString; one symbol, «Module»; another value — no; keys sorted', 'namespace.html');
  await told(`${RUN}const root = Object.create(null);
const kid = Object.create(root);
console.log(run(() => Object.setPrototypeOf(root, kid)), "|", run(() => Object.setPrototypeOf(root, Object.create(null))), "|", run(() => Object.setPrototypeOf(EventTarget.prototype, {})), "|", run(() => Object.setPrototypeOf(window, Object.getPrototypeOf(window))), Object.getPrototypeOf(Object.prototype));`,
  ['TypeError: Cyclic __proto__ value | ok | TypeError: Immutable prototype object \'#<EventTarget>\' cannot have their prototype set | ok null'],
  'lecture 16: an ordinary [[SetPrototypeOf]] stops only a cycle, a fresh null-prototype object passes; EventTarget.prototype is immutable too; the same prototype of window is fine', 'immutable.html');
  // the notes: the homework, in Chrome
  await told(`${RUN}function f(a, b, c) { return [this.n, a, b, c].join(); }
const fn = f.bind({ n: 1 }, "x").bind({ n: 2 }, "y");
console.log(fn(), fn.length);
const a = ["a", "b", "c", "d"];
Object.defineProperty(a, 2, { configurable: false });
a.length = 1;
console.log(a.length, a.join());
console.log(run(() => Object.defineProperty(a, "length", { value: 1, writable: false })), a.length, a.join(), Object.getOwnPropertyDescriptor(a, "length").writable);
function d(x, x) { arguments[1] = "новое"; return x; }
console.log(d(1, 2), d(1));`, ['1,x,y, 1', '3 a,b,c', 'TypeError: Cannot delete property \'2\' of [object Array] 3 a,b,c false', 'новое undefined'],
  'student homework 1–3: this of the first bind, arguments of both, length 3 − 2 = 1; deletion stops at index 2 — length 3, writable: false is set even so; d(1, 2) maps index 1 to x, d(1) maps nothing', 'homework.html');
  // the tasks: what the criteria ask to find, with the reference solutions
  await told(`${SOLUTIONS.myBind}
function show(a, b) { return this.name + " " + a + " " + b; }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
const OnAxis = myBind(Point, null, 0);
class Sub extends OnAxis {}
const RealAxis = Point.bind(null, 0);
RealAxis.prototype = Point.prototype;
class RealSub extends RealAxis {}
const mine = myBind(show, null);
delete mine.prototype;
console.log(myBind(myBind(show, { name: "1" }), { name: "2" })(3, 4) === show.bind({ name: "1" }).bind({ name: "2" })(3, 4), new Sub(1) instanceof Sub, new RealSub(1) instanceof RealSub, Object.hasOwn(mine, "prototype"), Object.getOwnPropertyDescriptor(mine, "prototype").configurable);`,
  ['true false true true false'], 'task 4: myBind of myBind agrees with bind of bind; Sub of the model is not a Sub, of a real bound function it is; prototype of the wrapper is not configurable and stays', 'task4.html');
  await told(`${SOLUTIONS.setLength}
const like = (...items) => { const o = { ...items }; Object.defineProperty(o, "length", { value: items.length, writable: true, enumerable: false, configurable: false }); return o; };
const cases = [[{ value: 0 }], [{ value: 6 }], [{ value: 2, writable: false }], [{ writable: false }], [{ value: 0 }, { value: 3 }], [{ value: 2, writable: false }, { value: 1 }]];
const state = (o, res) => JSON.stringify([res, o.length, Object.keys(o), Object.getOwnPropertyDescriptor(o, "length").writable]);
const realRun = (descs) => { const r = ["a", "b", "c", "d"]; Object.defineProperty(r, 1, { configurable: false }); return state(r, descs.map((d) => { try { Object.defineProperty(r, "length", d); return true; } catch { return false; } })); };
const modelRun = (descs) => { const m = like("a", "b", "c", "d"); Object.defineProperty(m, 1, { configurable: false }); return state(m, descs.map((d) => setLength(m, d))); };
let calls = 0, realCalls = 0;
setLength(like("a"), { value: { valueOf() { calls++; return 0; } } });
Object.defineProperty(["a"], "length", { value: { valueOf() { realCalls++; return 0; } } });
console.log(cases.every((c) => realRun(c) === modelRun(c)), calls, realCalls);`,
  ['true 2 2'], 'task 5: setLength agrees with Object.defineProperty on a real array (answer, length, keys, writable) on six sequences; valueOf is called twice by both', 'task5.html');
  await told(`${SOLUTIONS.mappedIndices}
const real = (params, n) => {
  const names = [...new Set(params)];
  const fn = new Function(...params, "for (let i = 0; i < " + params.length + "; i++) arguments[i] = 'w' + i; return [" + names.join(",") + "];");
  const after = fn(...Array.from({ length: n }, (_, i) => "v" + i));
  return names.map((p, j) => [after[j], p]).filter(([v]) => typeof v === "string" && v.startsWith("w")).map(([v, p]) => [Number(v.slice(1)), p]).sort((x, y) => x[0] - y[0]);
};
const cases = [[["a", "b"], 1], [["a", "b", "c"], 5], [["x", "x"], 2], [["x", "x"], 1], [["a", "b", "a", "c"], 4], [["x", "y", "x"], 3]];
console.log(cases.every(([p, n]) => JSON.stringify(real(p, n)) === JSON.stringify(mappedIndices(p, n))), JSON.stringify(real(["x", "x"], 1)));`,
  ['true []'], 'task 6: on real sloppy functions writing arguments[i] the mapped indices agree with the model; x, x with one argument maps nothing', 'task6.html');
  await told(`${RUN}class LeakyDeck { #history = []; answer(word) { this.#history.push(word); } get history() { return Object.freeze(this.#history); } }
const leaky = new LeakyDeck();
leaky.answer("kitap");
const first = leaky.history;
console.log(run(() => leaky.answer("galam")), leaky.history.join(), first === leaky.history);`,
  ['TypeError: Cannot add property 1, object is not extensible kitap true'], 'task 7: freezing #history itself breaks the deck — the next answer throws', 'task7.html');
  await told(`${SOLUTIONS.stringOwn}
const keys = ["0", "3", "-0", "1.0", "01", "1e0", "-1", "Infinity", "NaN", "length"];
const diff = [];
for (const str of ["kit", "", "😀"]) for (const k of keys) if (JSON.stringify(stringOwn(str, k)) !== JSON.stringify(Object.getOwnPropertyDescriptor(new String(str), k))) diff.push(JSON.stringify(str) + ":" + k);
console.log(diff.join(" "), String(Number("Infinity")) === "Infinity", String(Number("NaN")) === "NaN");`,
  ['"kit":length "":length "😀":length true true'], 'task 8: stringOwn agrees with a real String object on every key but length; "Infinity" and "NaN" are canonical numbers', 'task8.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);
  const fullSpec = flat(spec);

  check(hasAll(f('sec-built-in-exotic-object-internal-methods-and-slots'), ['These objects generally behave similar to ordinary objects except for a few specific situations',
    'use the ordinary object internal methods except where it is explicitly specified otherwise'])
    && fullSpec.includes('exotic object object that does not have the default behaviour for one or more of the essential internal methods'),
  'lecture 1: 10.4 — exotic objects use the ordinary methods except where said otherwise; 4.4.10 — one method is enough');
  check(f('sec-bound-function-exotic-objects').includes('if its [[Call]] and (if applicable) [[Construct]] internal methods use the following implementations')
    && f('sec-array-exotic-objects').includes('if its [[DefineOwnProperty]] internal method uses the following implementation')
    && f('sec-string-exotic-objects').includes('if its [[GetOwnProperty]], [[DefineOwnProperty]], and [[OwnPropertyKeys]] internal methods use the following implementations')
    && hasAll(f('sec-createmappedargumentsobject'), ['Set obj. [[GetOwnProperty]] as specified in 10.4.4.1', 'Set obj. [[DefineOwnProperty]] as specified in 10.4.4.2', 'Set obj. [[Get]] as specified in 10.4.4.3',
      'Set obj. [[Set]] as specified in 10.4.4.4', 'Set obj. [[Delete]] as specified in 10.4.4.5'])
    && f('sec-typedarray-exotic-objects').includes('if its [[PreventExtensions]], [[GetOwnProperty]], [[HasProperty]], [[DefineOwnProperty]], [[Get]], [[Set]], [[Delete]], and [[OwnPropertyKeys]], internal methods')
    && f('sec-module-namespace-exotic-objects').includes('if its [[GetPrototypeOf]], [[SetPrototypeOf]], [[IsExtensible]], [[PreventExtensions]], [[GetOwnProperty]], [[DefineOwnProperty]], [[HasProperty]], [[Get]], [[Set]], [[Delete]], and [[OwnPropertyKeys]] internal methods')
    && f('sec-immutable-prototype-exotic-objects').includes('if its [[SetPrototypeOf]] internal method uses the following implementation')
    && hasAll(f('sec-bound-function-exotic-objects'), ['[[BoundTargetFunction]]', '[[BoundThis]]', '[[BoundArguments]]']) && f('sec-string-exotic-objects').includes('[[StringData]] internal slot')
    && f('sec-arguments-exotic-objects').includes('They also have a [[ParameterMap]] internal slot') && hasAll(f('sec-module-namespace-exotic-objects'), ['[[Module]]', '[[Exports]]'])
    && hasAll(f('sec-typedarray-exotic-objects'), ['[[ViewedArrayBuffer]]', '[[ByteOffset]]', '[[ArrayLength]]']),
  'lecture 1: the table — the methods and slots of every kind (a typed array: eight methods in 2026)');
  check(inOrder(f('sec-object.prototype.tostring'), ['If isArray is true, let builtinTag be "Array"', 'Else if O has a [[ParameterMap]] internal slot, let builtinTag be "Arguments"',
    'Else if O has a [[Call]] internal method, let builtinTag be "Function"', 'Else if O has a [[StringData]] internal slot, let builtinTag be "String"'])
    && f('sec-arguments-exotic-objects').includes('For ordinary argument objects the [[ParameterMap]] internal slot is only used by Object.prototype.toString (20.1.3.6) to identify them as such')
    && f('sec-properties-of-the-array-prototype-object').includes('is an Array exotic object')
    && hasAll(f('sec-properties-of-the-string-prototype-object'), ['is a String exotic object', 'has a [[StringData]] internal slot whose value is the empty String'])
    && f('sec-isarray').includes('If argument is an Array exotic object, return true'),
  'lecture 1: Object.prototype.toString — Array, Arguments, Function, String in this order; note 1 of 10.4.4; Array.prototype is an array (23.1.3), String.prototype a String with "" (22.1.3); IsArray asks the kind');
  check(f('sec-bound-function-exotic-objects').includes('Bound function exotic objects do not have the internal slots of ECMAScript function objects listed in Table 25')
    && inOrder(f('sec-boundfunctioncreate'), ['Let proto be ? targetFunction. [[GetPrototypeOf]] ()', 'Set obj. [[Call]] as specified in 10.4.1.1',
      'If IsConstructor (targetFunction) is true, then Set obj. [[Construct]] as specified in 10.4.1.2', 'Set obj. [[BoundTargetFunction]] to targetFunction', 'Set obj. [[BoundArguments]] to boundArgs'])
    && inOrder(f('sec-function.prototype.bind'), ['Let F be ? BoundFunctionCreate (Target, thisArg, args)', 'Let targetHasLength be ? HasOwnProperty (Target, "length")', 'If targetLen is +∞ 𝔽, then Set L to +∞',
      'Else if targetLen is -∞ 𝔽, then Set L to 0', 'Let targetLenAsInt be ! ToIntegerOrInfinity (targetLen)', 'Set L to max (targetLenAsInt - argCount, 0)', 'If targetName is not a String, set targetName to the empty String',
      'Perform SetFunctionName (F, targetName, "bound")', 'They also do not have a "prototype" property', 'If Target is either an arrow function or a bound function exotic object, then the thisArg passed to this method will not be used by subsequent calls to F'])
    && hasAll(f('sec-tointegerorinfinity'), ['with fractional part truncated', 'Return truncate (ℝ (number))']),
  'lecture 2, 3: no slots of table 25; BoundFunctionCreate — the prototype of the target now, [[Construct]] only for a constructor; bind — own length minus the count, ±∞, a cut fraction, "bound " name, no prototype, note 2');
  {
    const call = steps(f('sec-bound-function-exotic-objects-call-thisargument-argumentslist'));
    const construct = steps(f('sec-bound-function-exotic-objects-construct-argumentslist-newtarget'));
    check(inOrder(call, ['Let target be F. [[BoundTargetFunction]]', 'Let boundThis be F. [[BoundThis]]', 'Let args be the list-concatenation of boundArgs and argumentsList', 'Return ? Call (target, boundThis, args)'])
      && !call.includes('thisArgument')
      && inOrder(construct, ['Let args be the list-concatenation of boundArgs and argumentsList', 'If SameValue (F, newTarget) is true, set newTarget to target', 'Return ? Construct (target, args, newTarget)'])
      && !construct.includes('[[BoundThis]]'),
    'lecture 3, 4: [[Call]] — glue the arguments, call the target with [[BoundThis]], thisArgument unused; [[Construct]] — glue, newTarget = F → target, [[BoundThis]] unused');
  }
  check(inOrder(f('sec-ordinaryhasinstance'), ['If IsCallable (C) is false, return false', 'If C has a [[BoundTargetFunction]] internal slot, then Let BC be C. [[BoundTargetFunction]]. Return ? InstanceofOperator (O, BC)'])
    && inOrder(f('sec-runtime-semantics-classdefinitionevaluation'), ['Let protoParent be ? Get (superclass, "prototype")', 'If protoParent is not an Object and protoParent is not null, throw a TypeError exception'])
    && inOrder(f('sec-super-keyword-runtime-semantics-evaluation'), ['Let newTarget be GetNewTarget ()', 'Let func be GetSuperConstructor ()', 'Let result be ? Construct (func, argList, newTarget)'])
    && f('sec-runtime-semantics-classdefinitionevaluation').includes('Let result be ? Construct (func, args, NewTarget)')
    && f('sec-ordinarycallbindthis').includes('If thisMode is lexical, return unused'),
  'lecture 3, 4: OrdinaryHasInstance asks the target right after IsCallable; extends reads prototype (not an object, not null — TypeError); super() and the default constructor pass their newTarget; an arrow takes no this');
  check(hasAll(f('sec-array-exotic-objects'), ['A property whose property name is an array index is also called an element',
    'Every Array has a non-configurable "length" property whose value is always a non-negative integral Number whose mathematical value is strictly less than 2 32',
    'numerically greater than the name of every own property whose name is an array index', 'is unaffected by "length" or array index properties that may be inherited from its prototypes'])
    && fullSpec.includes('An array index is an integer index n such that CanonicalNumericIndexString (n) returns an integral Number in the inclusive interval from +0 𝔽 to 𝔽 (2 32 - 2)')
    && inOrder(f('sec-array-exotic-objects-defineownproperty-p-desc'), ['If P is "length", return ? ArraySetLength (A, Desc)', 'If index ≥ length and lengthDesc. [[Writable]] is false, return false',
      'Let succeeded be ! OrdinaryDefineOwnProperty (A, P, Desc). If succeeded is false, return false', 'If index ≥ length, then Set lengthDesc. [[Value]] to index + 1 𝔽', 'Return ? OrdinaryDefineOwnProperty (A, P, Desc)'])
    && f('sec-ordinarysetwithowndescriptor').includes('Return ? CreateDataProperty (Receiver, P, V)') && f('sec-createdataproperty').includes('Return ? O. [[DefineOwnProperty]] (P, newDesc)')
    && f('sec-array.prototype.push').includes('Perform ? Set (O, ! ToString (𝔽 (len)), E, true)'),
  'lecture 5, 6: the invariant of 10.4.2, an index up to 2³² − 2; [[DefineOwnProperty]] — length to ArraySetLength, past a read-only length false, define, raise length; a[i] = v → CreateDataProperty → [[DefineOwnProperty]]; push → Set(O, len, E, true)');
  check(inOrder(f('sec-arraysetlength'), ['If Desc does not have a [[Value]] field, then Return ! OrdinaryDefineOwnProperty (A, "length", Desc)', 'Let newLen be ? ToUint32 (Desc. [[Value]])', 'Let numberLen be ? ToNumber (Desc. [[Value]])',
    'If SameValueZero (newLen, numberLen) is false, throw a RangeError exception', 'If newLen ≥ oldLen, then Return ! OrdinaryDefineOwnProperty (A, "length", newLenDesc)', 'If oldLenDesc. [[Writable]] is false, return false',
    'NOTE: Setting the [[Writable]] attribute to false is deferred in case any elements cannot be deleted', 'in descending numeric index order', 'Set newLenDesc. [[Value]] to ! ToUint32 (P) + 1 𝔽',
    'If newWritable is false, set newLenDesc. [[Writable]] to false', 'If newWritable is false, then Set succeeded to ! OrdinaryDefineOwnProperty (A, "length", PropertyDescriptor { [[Writable]] : false })',
    'if Desc. [[Value]] is an object then its valueOf method is called twice', '2 nd Edition'])
    && f('sec-tonumber').includes('Let primValue be ? ToPrimitive (argument, number)')
    && inOrder(f('sec-setintegritylevel'), ['PropertyDescriptor { [[Configurable]] : false })', 'Let desc be the PropertyDescriptor { [[Configurable]] : false, [[Writable]] : false }']),
  'lecture 7, 8: ArraySetLength — no value: ordinary; ToUint32 and ToNumber, RangeError; grow; read-only false; writable: false deferred; delete from the end, stop at the first that stays; valueOf twice (2nd edition); seal and freeze descriptors');
  {
    const arrayCreate = callers('ArrayCreate');
    const mentions = ['MakeBasicObject', 'sec-array-exotic-objects'];
    const calls = arrayCreate.filter((c) => !mentions.includes(c));
    const species = callers('ArraySpeciesCreate').filter((c) => c.startsWith('sec-array.prototype.'));
    check(inOrder(f('sec-arraycreate'), ['If length > 2 32 - 1, throw a RangeError exception', 'If proto is not present, set proto to %Array.prototype%', 'Set A. [[DefineOwnProperty]] as specified in 10.4.2.1',
      '[[Writable]] : true, [[Enumerable]] : false, [[Configurable]] : false'])
      && f('sec-makebasicobject').includes('exotic objects are created in abstract operations such as ArrayCreate') && f('sec-array-exotic-objects').includes('These methods are installed in ArrayCreate')
      && calls.length === 18 && ['CreateArrayFromList', 'sec-array-initializer-runtime-semantics-evaluation', 'sec-array', 'ArraySpeciesCreate', 'sec-array.prototype.tosorted', 'sec-array.prototype.toreversed',
        'sec-array.prototype.tospliced', 'sec-array.prototype.with'].every((c) => calls.includes(c))
      && f('sec-object.keys').includes('Return CreateArrayFromList (keyList)') && f('sec-array.prototype.tosorted').includes('Let A be ? ArrayCreate (len)')
      && JSON.stringify(species.sort()) === JSON.stringify(['sec-array.prototype.concat', 'sec-array.prototype.filter', 'sec-array.prototype.flat', 'sec-array.prototype.flatmap', 'sec-array.prototype.map',
        'sec-array.prototype.slice', 'sec-array.prototype.splice'])
      && inOrder(f('sec-arrayspeciescreate'), ['If isArray is false, return ? ArrayCreate (length)', 'Let C be ? Get (originalArray, "constructor")', 'If SameValue (C, realmC. [[Intrinsics]].[[ %Array% ]]) is true, set C to undefined',
        'Set C to ? Get (C, %Symbol.species%). If C is null, set C to undefined', 'If C is undefined, return ? ArrayCreate (length)', 'If IsConstructor (C) is false, throw a TypeError exception', 'Return ? Construct (C, «𝔽 (length)»)',
        'then a new Array is created using the realm of the running execution context'])
      && f('sec-arrayspeciescreate').includes('It does not enforce that the constructor function returns an Array')
      && f('sec-get-array-%symbol.species%').includes('Return the this value')
      && f('sec-array-initializer-runtime-semantics-evaluation').includes('Let array be ! ArrayCreate (0)') && f('sec-array.prototype.filter').includes('Perform ? CreateDataPropertyOrThrow (A, ! ToString (𝔽 (to)), kValue)'),
    `lecture 9, 17: ArrayCreate — RangeError past 2³² − 1, the flags of length; ${calls.length} calls (and 2 mentions) — CreateArrayFromList (Object.keys), the literal, Array, toSorted and its friends, ArraySpeciesCreate; ArraySpeciesCreate — exactly ${species.length} methods, the steps, the realm note; the species getter returns this; filter creates each element`);
  }
  check(hasAll(f('sec-string-exotic-objects'), ['exposes virtual integer-indexed data properties corresponding to the individual code unit elements of the String value',
    'Both the code unit data properties and the "length" property are non-writable and non-configurable'])
    && f('sec-string-exotic-objects-getownproperty-p').includes('Let desc be OrdinaryGetOwnProperty (S, P). If desc is not undefined, return desc. Return StringGetOwnProperty (S, P)')
    && inOrder(f('sec-stringgetownproperty'), ['If P is not a String, return undefined', 'Let index be CanonicalNumericIndexString (P)', 'If index is not an integral Number, return undefined', 'If index is -0 𝔽 or index < -0 𝔽, return undefined',
      'If ℝ (index) ≥ len, return undefined', '[[Value]] : resultStr, [[Writable]] : false, [[Enumerable]] : true, [[Configurable]] : false'])
    && inOrder(f('sec-string-exotic-objects-defineownproperty-p-desc'), ['Return IsCompatiblePropertyDescriptor (extensible, Desc, stringDesc)', 'Return ! OrdinaryDefineOwnProperty (S, P, Desc)'])
    && f('sec-iscompatiblepropertydescriptor').includes('Return ValidateAndApplyPropertyDescriptor (undefined, "", Extensible, Desc, Current)')
    && inOrder(f('sec-string-exotic-objects-ownpropertykeys'), ['For each integer i such that 0 ≤ i < len, in ascending order', 'such that P is an array index and ! ToIntegerOrInfinity (P) ≥ len, in ascending numeric index order',
      'such that P is a String and P is not an array index, in ascending chronological order of property creation', 'such that P is a Symbol, in ascending chronological order of property creation'])
    && f('sec-stringcreate').includes('"length", PropertyDescriptor { [[Value]] : 𝔽 (length), [[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : false }')
    && inOrder(f('sec-canonicalnumericindexstring'), ['If argument is "-0", return -0 𝔽', 'If ! ToString (n) is argument, return n. Return undefined']),
  'lecture 10: String objects — virtual code units, read-only and fixed; ordinary first, then StringGetOwnProperty (canonical, integral, not −0, inside); IsCompatiblePropertyDescriptor (ValidateAndApply without an object); the order of keys; length of StringCreate; "-0" and "1.0"');
  check(inOrder(f('sec-putvalue'), ['Let baseObj be ? ToObject (V. [[Base]])', 'Let succeeded be ? baseObj. [[Set]] (V. [[ReferencedName]], W, GetThisValue (V))', 'If succeeded is false and V. [[Strict]] is true, throw a TypeError exception'])
    && inOrder(f('sec-ordinarysetwithowndescriptor'), ['If ownDesc. [[Writable]] is false, return false', 'If Receiver is not an Object, return false'])
    && inOrder(f('sec-ordinarydelete'), ['If desc. [[Configurable]] is true', 'Return false']),
  'lecture 11: PutValue — a wrapper, [[Set]] with the primitive as Receiver, TypeError only in strict code; read-only false, a primitive Receiver false; a fixed property is not deleted');
  check(hasAll(f('sec-arguments-exotic-objects'), ['While CreateUnmappedArgumentsObject is grouped into this clause, it creates an ordinary object, not an arguments exotic object',
    'This correspondence is broken if such a property is deleted and then redefined or if the property is changed into an accessor property', 'are not directly observable from ECMAScript code'])
    && f('sec-functiondeclarationinstantiation').includes('If strict is true or simpleParameterList is false, then Let ao be CreateUnmappedArgumentsObject (argumentsList). Else, NOTE: A mapped argument object is only provided for non-strict functions that don\'t have a rest parameter, any parameter default value initializers, or any destructured parameters. Let ao be CreateMappedArgumentsObject (func, formals, argumentsList, env)')
    && hasAll(f('sec-createunmappedargumentsobject'), ['"length", PropertyDescriptor { [[Value]] : 𝔽 (len), [[Writable]] : true, [[Enumerable]] : false, [[Configurable]] : true }',
      '%Symbol.iterator%, PropertyDescriptor { [[Value]] : %Array.prototype.values%', '"callee", PropertyDescriptor { [[Get]] : %ThrowTypeError%, [[Set]] : %ThrowTypeError%'])
    && inOrder(f('sec-createmappedargumentsobject'), ['Assert : formals does not contain a rest parameter, any binding patterns, or any initializers', 'Let map be OrdinaryObjectCreate (null)',
      'Set index to numberOfParameters - 1. Repeat, while index ≥ 0', 'If mappedNames does not contain name, then Append name to mappedNames. If index < len, then Let g be MakeArgGetter (name, env)',
      '%Symbol.iterator%, PropertyDescriptor { [[Value]] : %Array.prototype.values%', '"callee", PropertyDescriptor { [[Value]] : func'])
    && f('sec-makearggetter').includes('env. GetBindingValue (name, false)') && f('sec-makeargsetter').includes('env. SetMutableBinding (name, value, false)')
    && f('sec-%arrayiteratorprototype%.next').includes('Let len be ? LengthOfArrayLike (array)'),
  'lecture 12–14: the notes of 10.4.4; FunctionDeclarationInstantiation — mapped only for a sloppy simple list; unmapped length, values, %ThrowTypeError% callee; mapped — the assert, map with null, from the end, a new name and index < len, callee = func; the iterator reads length');
  check(inOrder(f('sec-arguments-exotic-objects-getownproperty-p'), ['Let desc be OrdinaryGetOwnProperty (args, P)', 'If isMapped is true, then Set desc. [[Value]] to ! Get (map, P)'])
    && inOrder(f('sec-arguments-exotic-objects-defineownproperty-p-desc'), ['If Desc does not have a [[Value]] field, Desc has a [[Writable]] field, and Desc. [[Writable]] is false, then Set newArgDesc to a copy of Desc. Set newArgDesc. [[Value]] to ! Get (map, P)',
      'If IsAccessorDescriptor (Desc) is true, then Perform ! map. [[Delete]] (P)', 'If Desc has a [[Value]] field, then', 'Perform ! Set (map, P, Desc. [[Value]], false)', 'If Desc has a [[Writable]] field and Desc. [[Writable]] is false, then Perform ! map. [[Delete]] (P)'])
    && inOrder(f('sec-arguments-exotic-objects-get-p-receiver'), ['If isMapped is false, return ? OrdinaryGet (args, P, Receiver)', 'Return ! Get (map, P)'])
    && inOrder(f('sec-arguments-exotic-objects-set-p-v-receiver'), ['If SameValue (args, Receiver) is false, then Let isMapped be false', 'Perform ! Set (map, P, V, false)', 'Return ? OrdinarySet (args, P, V, Receiver)'])
    && inOrder(f('sec-arguments-exotic-objects-delete-p'), ['Let result be ? OrdinaryDelete (args, P)', 'If result is true and isMapped is true, then Perform ! map. [[Delete]] (P)']),
  'lecture 13: the five methods — the value from map; value through map, an accessor or writable: false (with the value kept) break it; Get from map; Set only with args as Receiver; delete removes the index from map');
  check(hasAll(f('sec-module-namespace-exotic-objects'), ['Each such property has the attributes { [[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : false }', 'Module namespace exotic objects are not extensible',
    'The list is sorted according to lexicographic code unit order'])
    && f('sec-module-namespace-exotic-objects-getprototypeof').includes('Return null') && f('sec-module-namespace-exotic-objects-setprototypeof-v').includes('Return ! SetImmutablePrototype (O, V)')
    && f('sec-module-namespace-exotic-objects-isextensible').includes('Return false') && steps(f('sec-module-namespace-exotic-objects-set-p-v-receiver')).includes('Return false')
    && f('sec-module-namespace-exotic-objects-get-p-receiver').includes('Return ? targetEnv. GetBindingValue (binding. [[BindingName]], true)')
    && f('sec-module-namespace-exotic-objects-defineownproperty-p-desc').includes('If Desc has a [[Value]] field, return SameValue (Desc. [[Value]], current. [[Value]])')
    && f('sec-module-namespace-objects').includes('There is no constructor function for Module Namespace Objects')
    && hasAll(f('sec-%symbol.tostringtag%'), ['The initial value of the %Symbol.toStringTag% property is the String value "Module"', '[[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : false']),
  'lecture 15: the namespace — writable, enumerable, not configurable; not extensible; sorted exports; prototype null and immutable; [[Set]] false; [[Get]] reads the binding; the same value passes; Symbol.toStringTag «Module»');
  check(f('sec-immutable-prototype-exotic-objects').includes('they are only used by %Object.prototype% and by host environments')
    && f('sec-immutable-prototype-exotic-objects-setprototypeof-v').includes('Return ? SetImmutablePrototype (O, V)')
    && inOrder(f('sec-set-immutable-prototype'), ['Let current be ? O. [[GetPrototypeOf]] ()', 'If SameValue (V, current) is true, return true', 'Return false'])
    && f('sec-properties-of-the-object-prototype-object').includes('is an immutable prototype exotic object'),
  'lecture 16: no creating operation, only %Object.prototype% and host objects; SetImmutablePrototype — the same true, else false; Object.prototype is one');
  check(f('sec-makeconstructor').includes('"prototype", PropertyDescriptor { [[Value]] : prototype, [[Writable]] : writablePrototype, [[Enumerable]] : false, [[Configurable]] : false }')
    && inOrder(f('sec-module-namespace-exotic-objects-defineownproperty-p-desc'), ['If P is a Symbol, return ! OrdinaryDefineOwnProperty (O, P, Desc)', 'If current is undefined, return false',
      'If Desc has a [[Configurable]] field and Desc. [[Configurable]] is true, return false', 'If Desc has an [[Enumerable]] field and Desc. [[Enumerable]] is false, return false',
      'If IsAccessorDescriptor (Desc) is true, return false', 'If Desc has a [[Writable]] field and Desc. [[Writable]] is false, return false',
      'If Desc has a [[Value]] field, return SameValue (Desc. [[Value]], current. [[Value]])', 'Return true'])
    && inOrder(f('sec-module-namespace-exotic-objects-hasproperty-p'), ['If P is a Symbol, return ! OrdinaryHasProperty (O, P)', 'If exports contains P, return true', 'Return false'])
    && inOrder(f('sec-module-namespace-exotic-objects-delete-p'), ['If P is a Symbol, then Return ! OrdinaryDelete (O, P)', 'If exports contains P, return false', 'Return true']),
  'tasks 4, 9: MakeConstructor (10.2.5) — prototype is not configurable; 10.4.6.6 step by step, 10.4.6.7 and 10.4.6.10 — a symbol goes to the ordinary method, an unknown name is deleted «true»');

  // the MDN pages of the footer and of the text
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  check(['reference/global_objects/function/bind', 'reference/global_objects/array/length', 'reference/functions/arguments', 'reference/statements/import', 'reference/global_objects/string/length']
    .every((p) => mdn(p).startsWith('---\ntitle:')),
  'footer and text: the MDN pages Function.prototype.bind(), Array: length, The arguments object, import, String: length are in the cache');
  {
    const args = mdn('reference/functions/arguments');
    const assigning = args.slice(args.indexOf('### Assigning to indices'), args.indexOf('### arguments is an array-like object'));
    check(assigning.includes('Non-strict functions that only have simple parameters (that is, no rest, default, or destructured parameters) will sync the new value of parameters with the `arguments` object, and vice versa')
      && !/delete|accessor|writable|not passed/i.test(assigning),
    'student homework 4: MDN «Assigning to indices» — simple non-strict functions sync «and vice versa»; it names no exception (delete, an accessor, writable: false, an argument not passed)');
  }

  // the days the lecture points to
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const day14 = read('advanced/day-14/lecture.html');
  check(read('advanced/day-01/lecture.html').includes('4.4.10 exotic object') && read('advanced/day-04/lecture.html').includes('PutValue')
    && hasAll(read('advanced/day-05/lecture.html'), ['CanonicalNumericIndexString', 'ToPrimitive']) && read('advanced/day-06/lecture.html').includes('ToUint32')
    && hasAll(read('advanced/day-07/lecture.html'), ['OrdinaryHasInstance', 'CreateDataProperty'])
    && hasAll(read('advanced/day-09/lecture.html'), ['IsArray', 'OrdinaryCallBindThis', 'iframe'])
    && hasAll(day14, ['OrdinarySetWithOwnDescriptor', 'SetIntegrityLevel', 'ValidateAndApplyPropertyDescriptor', '%ThrowTypeError%', '13.3.7.1', 'таблицы 25', '6.1.7'])
    && inOrder(day14, ['<li>собрать имена', '<li>нужен ли <code>arguments</code>', '<li>привязки параметров и <code>arguments</code>: связанный у нестрогого простого списка', '<li>значения параметров слева направо; при повторах']),
  'lecture: course 3 — 4.4.10 (day 1), PutValue (4), CanonicalNumericIndexString and ToPrimitive (5), ToUint32 (6), OrdinaryHasInstance and CreateDataProperty (7), IsArray, OrdinaryCallBindThis, the frame (9); day 14 — its operations and steps 2, 3, 4 of its list');
  check(hasAll(read('intermediate/day-02/lecture.html'), ['[[BoundTargetFunction]]', 'второй bind тоже']) && read('intermediate/day-04/lecture.html').includes('arguments в двух режимах')
    && read('intermediate/day-08/lecture.html').includes('тело класса строгое всегда') && read('intermediate/day-20/lecture.html').includes('суррогатной парой')
    && read('intermediate/day-30/lecture.html').includes('import * as') && read('intermediate/day-31/lecture.html').includes('import()')
    && read('essentials/day-19/lecture.html').includes('cart.length = 0'),
  'lecture: course 2 — the scheme of bind and the second bind (day 2), arguments in two modes (4), a class body is strict (8), surrogate pairs (20), import * as (30), import() (31); Essentials — cart.length = 0 (19)');
  {
    const plan = read('docs/plan-3-advanced.md');
    const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
    const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
    const mdnDay = (p) => { const r = mdRows.find((c) => c[0] === p); return r ? `${r[5]}.${r[6]}` : '?'; };
    const G = 'Web/JavaScript/Reference/';
    check(plan.includes('**16. Proxy: ловушки и инварианты.**') && plan.includes('**17. Reflect и встроенные символы.**')
      && mdnDay(`${G}Global_Objects/Array/Symbol.species`) === '3.17' && spRows.some((c) => c[0] === 'sec-typedarray-exotic-objects' && c[6] === '3' && c[7] === '20')
      && mdnDay(`${G}Global_Objects/Function/bind`) === '2.2' && mdnDay(`${G}Functions/arguments`) === '2.4' && mdnDay(`${G}Statements/import`) === '2.30'
      && mdnDay(`${G}Global_Objects/Array/length`) === '1.19' && mdnDay(`${G}Global_Objects/String/length`) === '1.16',
    'lecture: the days it names — Proxy 16, Symbol.species 17, typed arrays 20; the MDN pages — bind (course 2, day 2), arguments (2.4), import (2.30), Array: length (Essentials 19), String: length (Essentials 16)');

    // the reference table holds every row of the plan as a link, every anchor of the lecture exists
    const lecture = read('advanced/day-15/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const rows = spRows.filter((c) => c[6] === '3' && c[7] === '15').map((c) => c[0]);
    const notInTable = rows.filter((id) => !refRows.includes(id));
    check(rows.length === 9 && refRows.length === 9 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 15, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
    const full = spRows.filter((c) => c[6] === '3' && c[7] === '15' && c[9] === 'подробно').map((c) => c[0]);
    const marked = [...refTable.matchAll(/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(full.length === 5 && JSON.stringify(full) === JSON.stringify(marked), `plan: the 5 rows "подробно" are marked so in the table ${JSON.stringify(marked)}`);
    check(mdRows.filter((c) => c[5] === '3' && c[6] === '15').length === 0, 'plan: no MDN pages of day 15');
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
