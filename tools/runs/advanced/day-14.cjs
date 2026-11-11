// Course 3, day 14, in Chrome: internal methods of ordinary objects and functions. Every <pre class="code js"> block
// of the lecture runs as the only <script> in the <body> of a clean page (two blocks append an iframe to the body),
// the way a student would paste it into a file. Console output is rebuilt from Chrome's preview objects, as DevTools
// prints it; an uncaught error is printed as "Uncaught TypeError: …". The context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-14.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-14.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block of the notes prints what the comments of its
// console.log lines say, and the homework (1–3 in Chrome, 4 in the text of MDN); a block of the tasks without a
// result-box prints what EXPECT says, an example runs with the reference solutions of SOLUTIONS ("expression;   //
// value"), and the criteria are checked against real objects and real classes; the quoted getters of card.js (day 33 of course 2) are
// the real ones; the cheatsheet runs without an error; the experiments the lecture only tells about (the table of
// section 9 seen live through the traps of a Proxy — the run may use what the lecture may not; a cycle through a Proxy
// is not caught by [[SetPrototypeOf]]; a descriptor is a copy; a strict write to a read-only property of the prototype;
// numeric order of indices; the flags of length; the poison pill of strict arguments; the legacy caller of Chrome and
// the out-of-date note of MDN; duplicate parameters in strict code and with a default); what the lecture says about the
// text of ECMA-262 2026 (chapter 10 and the operations it calls) is checked against tools/.cache/ecma262-2026.html; the
// MDN pages of the footer and of caller are in tools/.cache/mdn-content.git; the days it points to say what it says;
// the reference table holds all 34 rows of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-14');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['rw,_acc 1 прото 3! прото', 'снова rw,_acc,ro'],
  'tasks #1': ['ok TypeError ok ok TypeError ok TypeError TypeError ok'],
  'tasks #2': ['2 10 z a | 2 10 z a hidden | 2 10 z a 1 p2 | {"2":1,"10":1,"z":1,"a":1}'],
  'tasks #8': ['SyntaxError TypeError TypeError ok ok'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  validate: `function validate(current, desc, extensible) {
  const isAccessor = (d) => "get" in d || "set" in d;
  const isData = (d) => "value" in d || "writable" in d;
  if (current === undefined) return extensible;
  if (Object.keys(desc).length === 0) return true;
  if (current.configurable === false) {
    if (desc.configurable === true) return false;
    if ("enumerable" in desc && desc.enumerable !== current.enumerable) return false;
    if ((isAccessor(desc) || isData(desc)) && isAccessor(desc) !== isAccessor(current)) return false;
    if (isAccessor(current)) {
      if ("get" in desc && !Object.is(desc.get, current.get)) return false;
      if ("set" in desc && !Object.is(desc.set, current.set)) return false;
    } else if (current.writable === false) {
      if (desc.writable === true) return false;
      if ("value" in desc) return Object.is(desc.value, current.value);
    }
  }
  return true;
}`,
  ordinarySet: `function ordinarySet(O, P, V, Receiver) {
  let ownDesc = Object.getOwnPropertyDescriptor(O, P);
  if (ownDesc === undefined) {
    const parent = Object.getPrototypeOf(O);
    if (parent !== null) return ordinarySet(parent, P, V, Receiver);
    ownDesc = { value: undefined, writable: true, enumerable: true, configurable: true };
  }
  if ("value" in ownDesc) {
    if (!ownDesc.writable) return false;
    if (Receiver === null || (typeof Receiver !== "object" && typeof Receiver !== "function")) return false;
    const existing = Object.getOwnPropertyDescriptor(Receiver, P);
    if (existing !== undefined) {
      if (!("value" in existing) || !existing.writable) return false;
      Object.defineProperty(Receiver, P, { value: V });
      return true;
    }
    if (!Object.isExtensible(Receiver)) return false;
    Object.defineProperty(Receiver, P, { value: V, writable: true, enumerable: true, configurable: true });
    return true;
  }
  if (ownDesc.set === undefined) return false;
  ownDesc.set.call(Receiver, V);
  return true;
}`,
  ownKeysOrder: `function ownKeysOrder(keys) {
  const isIndex = (k) => typeof k === "string" && String(Number(k)) === k && Number.isInteger(Number(k)) && Number(k) >= 0 && Number(k) <= 2 ** 32 - 2;
  const indices = keys.filter(isIndex).sort((a, b) => Number(a) - Number(b));
  const strings = keys.filter((k) => typeof k === "string" && !isIndex(k));
  const symbols = keys.filter((k) => typeof k === "symbol");
  return [...indices, ...strings, ...symbols];
}`,
  Card: `class Card {
  #word;
  constructor(word) {
    this.#word = word;
    if (new.target === Card) Object.freeze(this);
  }
  get word() { return this.#word; }
}
class BigCard extends Card {
  level = 2;
  constructor(word) {
    super(word);
    if (new.target === BigCard) Object.freeze(this);
  }
}`,
  construct: `function construct(F, args, newTarget = F) {
  const proto = newTarget.prototype;
  const obj = Object.create(typeof proto === "object" && proto !== null || typeof proto === "function" ? proto : Object.prototype);
  const result = F.apply(obj, args);
  return typeof result === "object" && result !== null || typeof result === "function" ? result : obj;
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
const QUOTES = { '// card.js, день 33 курса 2 — геттеры Card': 'intermediate/day-33/lecture.html' };
const RUN = 'const run = (f) => { try { f(); return "ok"; } catch (e) { return `${e.name}: ${e.message}`; } };\n';
const wait = (code) => (code.includes('iframe') ? 400 : 150);

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
  // section 9: every row of the table, seen through the traps of a Proxy (the run may use what the lecture may not)
  {
    const out = await runScript(ctx, `const traps = [];
const handler = new Proxy({}, { get(_, trap) { traps.push(trap); return undefined; } });
const watch = (target, f) => { traps.length = 0; f(new Proxy(target, handler)); return [...new Set(traps)].join(); };
function F() {}
const rows = {
  get: watch({ x: 1 }, (p) => p.x),
  set: watch({ x: 1 }, (p) => { p.x = 2; }),
  has: watch({ x: 1 }, (p) => "x" in p),
  del: watch({ x: 1 }, (p) => { delete p.x; }),
  define: watch({}, (p) => Object.defineProperty(p, "x", { value: 1 })),
  gopd: watch({ x: 1 }, (p) => Object.getOwnPropertyDescriptor(p, "x")),
  keys: watch({ x: 1 }, (p) => Object.keys(p)),
  spread: watch({ x: 1 }, (p) => ({ ...p })),
  forin: watch({ x: 1 }, (p) => { for (const k in p); }),
  json: watch({ x: 1 }, (p) => JSON.stringify(p)),
  gpo: watch({}, (p) => Object.getPrototypeOf(p)),
  inst: watch({}, (p) => p instanceof F),
  spo: watch({}, (p) => Object.setPrototypeOf(p, {})),
  proto: watch({}, (p) => { p.__proto__ = {}; }),
  pe: watch({}, (p) => Object.preventExtensions(p)),
  freeze: watch({ x: 1 }, (p) => Object.freeze(p)),
  call: watch(function () {}, (p) => p()),
  construct: watch(function () {}, (p) => new p()),
};
console.log(JSON.stringify(rows));`, 'traps.html');
    const rows = JSON.parse(out[0] ?? '{}');
    const want = { get: ['get'], set: ['set'], has: ['has'], del: ['deleteProperty'], define: ['defineProperty'], gopd: ['getOwnPropertyDescriptor'], keys: ['ownKeys', 'getOwnPropertyDescriptor'],
      spread: ['ownKeys', 'getOwnPropertyDescriptor', 'get'], forin: ['ownKeys', 'getOwnPropertyDescriptor'], json: ['ownKeys', 'getOwnPropertyDescriptor', 'get'], gpo: ['getPrototypeOf'],
      inst: ['getPrototypeOf'], spo: ['setPrototypeOf'], proto: ['setPrototypeOf'], pe: ['preventExtensions'], freeze: ['preventExtensions', 'defineProperty'], call: ['apply'], construct: ['construct'] };
    const wrong = Object.entries(want).filter(([k, traps]) => !(rows[k] ?? '').split(',').filter(Boolean).length || !traps.every((t) => rows[k].split(',').includes(t)));
    const quiet1 = ['has', 'keys', 'gopd'].every((k) => !rows[k].split(',').includes('get'));
    check(wrong.length === 0 && quiet1, `lecture 9: every row of the table, seen live through Proxy traps; in, Object.keys and the descriptor never reach get ${JSON.stringify(rows)}`);
  }
  await told(`${RUN}const a = {};
const p = new Proxy(Object.create(a), {});
console.log(run(() => Object.setPrototypeOf(a, p)), Object.getPrototypeOf(a) === p);`, ['ok true'],
  'lecture 2: the loop of [[SetPrototypeOf]] stops at a Proxy — a cycle through it is not caught', 'cycle.html');
  await told(`"use strict";
${RUN}const o = { x: 1 };
const d = Object.getOwnPropertyDescriptor(o, "x");
d.value = 2; d.writable = false;
const proto = Object.defineProperty({}, "fixed", { value: 1, writable: false });
const obj = Object.create(proto);
console.log(o.x, Object.getOwnPropertyDescriptor(o, "x").writable, "|", run(() => { obj.fixed = 2; }));
console.log(Object.keys({ b: 1, 10: 1, a: 1, 2: 1 }).join());
const len = Object.getOwnPropertyDescriptor(function g(a, b) {}, "length");
console.log(len.value, len.writable, len.enumerable, len.configurable);`,
  ['1 true | TypeError: Cannot assign to read only property \'fixed\' of object \'#<Object>\'', '2,10,b,a', '2 false false true'],
  'lecture 1, 3, 8, 14 and selfcheck 3: a descriptor is a copy; a strict write to a read-only property of the prototype throws; indices sort as numbers; length has the flags of name', 'small.html');
  await told(`${RUN}const thrower = Object.getOwnPropertyDescriptor((function () { "use strict"; return arguments; })(), "callee").get;
const c = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
const a = Object.getOwnPropertyDescriptor(Function.prototype, "arguments");
function sloppy() { return [sloppy.caller === outer, sloppy.arguments.length].join(); }
function outer() { return sloppy(1, 2); }
function strictFn() { "use strict"; }
console.log(Object.isFrozen(thrower), JSON.stringify(thrower.name), thrower.length, run(() => thrower()));
console.log(c.get === a.get, typeof c.get, typeof a.set, outer(), c.get.call(outer), run(() => strictFn.caller));
console.log(Object.hasOwn(function f() {}, "caller"), Object.getOwnPropertyNames(function () {}).join());`,
  ['true "" 0 TypeError: \'caller\', \'callee\', and \'arguments\' properties may not be accessed on strict mode functions or the arguments objects for calls to them',
    'false function function true,2 null TypeError: \'caller\', \'callee\', and \'arguments\' properties may not be accessed on strict mode functions or the arguments objects for calls to them',
    'false length,name,prototype'],
  'lecture 14, Chrome: %ThrowTypeError% (callee) is frozen, nameless, of length 0 and throws; caller and arguments of Function.prototype are other accessors, they give the caller and arguments of a running non-strict function and throw for a strict one; a function has no own caller (the MDN note «In Chrome: own property» is out of date)', 'caller.html');
  await told(`${RUN}console.log(run(() => new Function("a", "a", '"use strict";')), "|", run(() => new Function("a", "a = 1", "")));`,
    ['SyntaxError: Duplicate parameter name not allowed in this context | SyntaxError: Duplicate parameter name not allowed in this context'],
    'lecture 15: duplicate parameters in strict code or with a default are an early error', 'dup.html');
  // the notes: the homework, in Chrome
  await told(`const proto = { set x(v) { this._x = v; } };
const o = Object.create(proto);
o.x = 1;
console.log(Object.keys(o).join(), Object.hasOwn(o, "x"), Object.keys(proto).join());
console.log(Object.keys({ 3: 1, b: 1, "007": 1, 0: 1, a: 1, 4294967294: 1, 4294967295: 1 }).join(" "));
function g(x, y) { var x; function y() {} return [typeof x, typeof y].join(); }
console.log(g(1, 2));`, ['_x false x', '0 3 4294967294 b 007 a 4294967295', 'number,function'],
  'student homework 1–3: a setter of the prototype writes _x on the Receiver; 4294967295 is a string key; var keeps the parameter, a function replaces it', 'homework.html');
  // the tasks: what the criteria ask to find, with the reference solutions
  await told(`${SOLUTIONS.validate}
const data = (v, w, e, c) => ({ value: v, writable: w, enumerable: e, configurable: c });
const cases = [[undefined, { value: 1 }, true], [undefined, { value: 1 }, false], [data(1, true, true, false), { value: 2 }, true], [data(1, false, true, false), { value: 2 }, true],
  [data(NaN, false, true, false), { value: NaN }, true], [data(0, false, true, false), { value: -0 }, true], [data(1, true, true, false), { get() {} }, true], [data(1, true, true, true), { get() {} }, true],
  [data(1, true, true, false), {}, true]];
const real = cases.map(([current, desc, extensible]) => {
  const o = {};
  if (current) Object.defineProperty(o, "p", current);
  if (!extensible) Object.preventExtensions(o);
  try { Object.defineProperty(o, "p", desc); return true; } catch { return false; }
});
console.log(JSON.stringify(real) === JSON.stringify(cases.map((c) => validate(...c))), JSON.stringify(real));`, ['true [true,false,true,false,true,false,false,true,true]'],
  'task 4: validate agrees with Object.defineProperty on the nine cases', 'task4.html');
  await told(`"use strict";
${SOLUTIONS.ordinarySet}
const make = () => {
  const proto = {};
  Object.defineProperty(proto, "ro", { value: 1, writable: false });
  Object.defineProperty(proto, "acc", { set(v) { this.log = v; } });
  proto.rw = 0;
  return [proto, Object.create(proto)];
};
const real = (P, V) => { const [, a] = make(); try { a[P] = V; return [true, a[P === "acc" ? "log" : P]]; } catch { return [false]; } };
const model = (P, V) => { const [, a] = make(); return ordinarySet(a, P, V, a) ? [true, a[P === "acc" ? "log" : P]] : [false]; };
const same = ["rw", "ro", "acc", "fresh"].every((P) => JSON.stringify(real(P, 5)) === JSON.stringify(model(P, 5)));
const [proto] = make();
const obj = Object.create(proto);
Object.defineProperty(obj, "rw", { get() { return "своё"; }, configurable: true });
console.log(same, ordinarySet(proto, "rw", 9, obj));`, ['true false'],
  'task 5: in strict code a real write agrees with ordinarySet (true — no error, false — TypeError); super.x = with an own accessor of the Receiver is false', 'task5.html');
  await told(`${SOLUTIONS.ownKeysOrder}
const s = Symbol("s");
const lists = [["b", "10", s, "a", "2", "01", "4294967295", "4294967294"], ["-0", "0", "1.5", "1e3", "7"]];
console.log(lists.every((keys) => { const o = {}; for (const k of keys) o[k] = 1; return JSON.stringify([...Object.getOwnPropertyNames(o), ...Object.getOwnPropertySymbols(o)].map(String)) === JSON.stringify(ownKeysOrder(keys).map(String)); }));`,
  ['true'], 'task 6: a real object made in the same order agrees with ownKeysOrder', 'task6.html');
  await told(`"use strict";
const run = (f) => { try { f(); return "ok"; } catch (e) { return \`\${e.name}: \${e.message}\`; } };
${SOLUTIONS.Card}
class HugeCard extends BigCard { size = 3; }
const huge = new HugeCard("suw");
class FrozenHuge extends BigCard { size = 3; constructor(word) { super(word); if (new.target === FrozenHuge) Object.freeze(this); } }
const frozenHuge = new FrozenHuge("suw");
class Plain { #w; constructor(w) { this.#w = w; Object.freeze(this); } }
class PlainBig extends Plain { level = 2; }
class OnlyCard { constructor() { if (new.target === OnlyCard) Object.freeze(this); } }
class OnlyBig extends OnlyCard { level = 2; constructor() { super(); Object.freeze(this); } }
class OnlyHuge extends OnlyBig { size = 3; }
console.log(huge.size, huge.level, Object.isFrozen(huge), Object.isFrozen(frozenHuge), "|", run(() => new PlainBig("x")), "|", run(() => new OnlyHuge()));`,
  ['3 2 false true | TypeError: Cannot define property level, object is not extensible | TypeError: Cannot define property size, object is not extensible'],
  'task 7: HugeCard is made but not frozen — nobody has new.target === HugeCard; its own check freezes it; freeze in Card breaks the field of BigCard; an unconditional freeze in BigCard breaks a third level', 'task7.html');
  await told(`${SOLUTIONS.construct}
function Point(x) { this.x = x; }
function Other() {}
Point.prototype = null;
const viaModel = construct(Point, [1]);
const viaNew = new Point(1);
Point.prototype = { kind: "точка" };
console.log(Object.getPrototypeOf(viaModel) === Object.prototype, Object.getPrototypeOf(viaNew) === Object.prototype, Object.getPrototypeOf(Reflect.construct(Point, [1], Other)) === Object.getPrototypeOf(construct(Point, [1], Other)));`,
  ['true true true'], 'task 8: with prototype null the model and new give Object.prototype; the model with newTarget agrees with Reflect.construct', 'task8.html');
  await told(`"use strict";
class Card { #word; constructor(word) { this.#word = word; Object.freeze(this); } get word() { return this.#word; } set w(v) { this.#word = v; } }
const card = new Card("kitap");
card.w = "galam";
console.log(card.word, Object.isFrozen(card));`, ['galam true'], 'lecture 17: freeze does not touch a private field — it is not a property', 'private.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);
  const fullSpec = flat(spec);

  check(hasAll(f('sec-ordinary-object-internal-methods-and-internal-slots'), ['All ordinary objects have an internal slot called [[Prototype]]', 'O inherits it for get access',
    'If P refers to a writable data property on the [[Prototype]] object, set access of P on O creates a new data property named P on O',
    'If P refers to a non-writable data property on the [[Prototype]] object, set access of P on O fails', 'the accessor is inherited by O for both get access and set access',
    'it is no longer possible to add properties to the object, to modify the value of the object\'s [[Prototype]] internal slot, or to subsequently change the value of [[Extensible]] to true']),
  'lecture 1: 10.1 — [[Prototype]], the four rules of inheritance, no way back from [[Extensible]] = false');
  check(f('sec-ordinarygetprototypeof').includes('Return O. [[Prototype]]') && f('sec-ordinaryisextensible').includes('Return O. [[Extensible]]')
    && f('sec-ordinarypreventextensions').includes('Set O. [[Extensible]] to false. Return true')
    && inOrder(f('sec-ordinarysetprototypeof'), ['If SameValue (V, current) is true, return true', 'If extensible is false, return false', 'Else if SameValue (p, O) is true, then Return false',
      'If p. [[GetPrototypeOf]] is not the ordinary object internal method defined in 10.1.1, set done to true'])
    && inOrder(f('sec-ordinaryhasproperty'), ['Let hasOwn be ? O. [[GetOwnProperty]] (P)', 'Return ? parent. [[HasProperty]] (P)'])
    && inOrder(f('sec-ordinarydelete'), ['If desc is undefined, return true', 'If desc. [[Configurable]] is true, then Remove the own property with name P from O. Return true', 'Return false']),
  'lecture 2: the six simple methods; [[SetPrototypeOf]] — the same is true first, non-extensible false, a cycle false, a non-ordinary [[GetPrototypeOf]] stops the loop');
  check(hasAll(f('sec-ordinarygetownproperty'), ['If O does not have an own property with key P, return undefined', 'Let D be a newly created Property Descriptor with no fields'])
    && f('sec-ordinarydefineownproperty').includes('Let current be ? O. [[GetOwnProperty]] (P). Let extensible be ? IsExtensible (O). Return ValidateAndApplyPropertyDescriptor (O, P, extensible, Desc, current)')
    && f('sec-createdataproperty').includes('[[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : true')
    && inOrder(f('sec-topropertydescriptor'), ['If Obj is not an Object, throw a TypeError exception', 'Let hasEnumerable be ? HasProperty (Obj, "enumerable")', 'Let enumerable be ToBoolean (? Get (Obj, "enumerable"))',
      'If desc has a [[Get]] field or desc has a [[Set]] field, then If desc has a [[Value]] field or desc has a [[Writable]] field, throw a TypeError exception'])
    && /> 6\.2\.6\.5 ToPropertyDescriptor/.test(f('sec-topropertydescriptor')),
  'lecture 3: OrdinaryGetOwnProperty makes a new descriptor; [[DefineOwnProperty]] passes current and extensibility; CreateDataProperty — all true; ToPropertyDescriptor (6.2.6.5) reads through HasProperty and Get, an accessor with a value throws');
  check(inOrder(f('sec-validateandapplypropertydescriptor'), ['If current is undefined, then If extensible is false, return false', 'to the attribute\'s default value otherwise', 'If Desc does not have any fields, return true',
    'If current. [[Configurable]] is false, then If Desc has a [[Configurable]] field and Desc. [[Configurable]] is true, return false', 'If Desc has an [[Enumerable]] field and Desc. [[Enumerable]] is not current. [[Enumerable]], return false',
    'IsAccessorDescriptor (Desc) is not IsAccessorDescriptor (current), return false', 'If Desc has a [[Get]] field and SameValue (Desc. [[Get]], current. [[Get]]) is false, return false',
    'Else if current. [[Writable]] is false, then If Desc has a [[Writable]] field and Desc. [[Writable]] is true, return false', 'SameValue returns true for NaN values which may be distinguishable by other means',
    'If Desc has a [[Value]] field, return SameValue (Desc. [[Value]], current. [[Value]])', 'Replace the property named P of object O with an accessor property whose [[Configurable]] and [[Enumerable]] attributes are set to configurable and enumerable'])
    && inOrder(f('sec-setintegritylevel'), ['Let status be ? O. [[PreventExtensions]] ()', 'If level is sealed, then For each element k of keys, do Perform ? DefinePropertyOrThrow (O, k, PropertyDescriptor { [[Configurable]] : false })',
      'Let desc be the PropertyDescriptor { [[Configurable]] : false, [[Writable]] : false }']) && /> 7\.3\.15 SetIntegrityLevel/.test(f('sec-setintegritylevel'))
    && f('sec-definepropertyorthrow').includes('If success is false, throw a TypeError exception'),
  'lecture 4: ValidateAndApplyPropertyDescriptor — create or false, empty Desc, the rules of a non-configurable property, the NaN note, a change of kind keeps the flags; SetIntegrityLevel (7.3.15); DefinePropertyOrThrow throws');
  check(inOrder(f('sec-ordinaryget'), ['Let desc be ? O. [[GetOwnProperty]] (P)', 'If parent is null, return undefined. Return ? parent. [[Get]] (P, Receiver)', 'If IsDataDescriptor (desc) is true, return desc. [[Value]]',
    'If getter is undefined, return undefined. Return ? Call (getter, Receiver)'])
    && inOrder(f('sec-getvalue'), ['Let baseObj be ? ToObject (V. [[Base]])', 'Return ? baseObj. [[Get]] (V. [[ReferencedName]], GetThisValue (V))']) && /> 6\.2\.5\.5 GetValue/.test(f('sec-getvalue'))
    && f('sec-getthisvalue').includes('If IsSuperReference (V) is true, return V. [[ThisValue]]. Return V. [[Base]]')
    && hasAll(f('sec-makesuperpropertyreference'), ['Let baseValue be GetSuperBase (env)', '[[ThisValue]] : actualThis'])
    && f('sec-getsuperbase').includes('Let home be envRec. [[FunctionObject]]. [[HomeObject]]'),
  'lecture 5: OrdinaryGet goes up with the same Receiver and calls the getter with it; GetValue (6.2.5.5) — a wrapper for the search, the base as Receiver; super.x — from the prototype of [[HomeObject]], Receiver = this');
  check(inOrder(f('sec-ordinarysetwithowndescriptor'), ['If ownDesc is undefined, then Let parent be ? O. [[GetPrototypeOf]] (). If parent is not null, return ? parent. [[Set]] (P, V, Receiver)',
    'Set ownDesc to the PropertyDescriptor { [[Value]] : undefined, [[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : true }', 'If ownDesc. [[Writable]] is false, return false',
    'If Receiver is not an Object, return false', 'Let existingDescriptor be ? Receiver. [[GetOwnProperty]] (P)', 'Return ? CreateDataProperty (Receiver, P, V)', 'If IsAccessorDescriptor (existingDescriptor) is true, return false',
    'If existingDescriptor. [[Writable]] is false, return false', 'Let valueDesc be the PropertyDescriptor { [[Value]] : V }. Return ? Receiver. [[DefineOwnProperty]] (P, valueDesc)',
    'If setter is undefined, return false. Perform ? Call (setter, Receiver, «V»). Return true'])
    && fullSpec.includes('If succeeded is false and V. [[Strict]] is true, throw a TypeError exception'),
  'lecture 6: OrdinarySetWithOwnDescriptor — the prototype with the same Receiver, a writable default, read-only false, a primitive Receiver false, its own accessor or read-only false, define only value, else CreateDataProperty; a setter with Receiver; PutValue throws only in strict code');
  check(f('sec-definefield').includes('Perform ? CreateDataPropertyOrThrow (receiver, fieldName, initValue)')
    && f('sec-object.assign').includes('Perform ? Set (to, nextKey, propValue, true)') && /> 20\.1\.2\.1 Object\.assign/.test(f('sec-object.assign'))
    && f('sec-copydataproperties').includes('Perform ! CreateDataPropertyOrThrow (target, nextKey, propValue)'),
  'lecture 7: a field is DefineField → CreateDataPropertyOrThrow; Object.assign (20.1.2.1) uses Set, spread CopyDataProperties creates');
  check(inOrder(f('sec-ordinaryownpropertykeys'), ['such that P is an array index, in ascending numeric index order', 'such that P is a String and P is not an array index, in ascending chronological order of property creation',
    'such that P is a Symbol, in ascending chronological order of property creation'])
    && fullSpec.includes('An array index is an integer index n such that CanonicalNumericIndexString (n) returns an integral Number in the inclusive interval from +0 𝔽 to 𝔽 (2 32 - 2)'),
  'lecture 8: OrdinaryOwnPropertyKeys — indices by number, strings and symbols by creation; an array index ends at 2³² − 2');
  check(f('sec-getvalue').includes('[[Get]]') && fullSpec.includes('Let succeeded be ? baseObj. [[Set]] (V. [[ReferencedName]], W, GetThisValue (V))')
    && f('sec-relational-operators-runtime-semantics-evaluation').includes('Return ? HasProperty (rVal, ? ToPropertyKey (lVal))') && f('sec-hasproperty').includes('Return ? O. [[HasProperty]] (P)')
    && f('sec-delete-operator-runtime-semantics-evaluation').includes('Let deleteStatus be ? baseObj. [[Delete]] (ref. [[ReferencedName]])')
    && f('sec-definepropertyorthrow').includes('Let success be ? O. [[DefineOwnProperty]] (P, desc)')
    && f('sec-object.getownpropertydescriptor').includes('Let desc be ? obj. [[GetOwnProperty]] (key)')
    && hasAll(f('sec-enumerableownproperties'), ['Let ownKeys be ? O. [[OwnPropertyKeys]] ()', 'Let desc be ? O. [[GetOwnProperty]] (key)'])
    && f('sec-copydataproperties').includes('Let propValue be ? Get (from, nextKey)')
    && hasAll(f('sec-enumerate-object-properties'), ['by calling its [[OwnPropertyKeys]] internal method', 'by calling its [[GetOwnProperty]] internal method'])
    && f('sec-serializejsonobject').includes('EnumerableOwnProperties (value, key)') && f('sec-serializejsonproperty').includes('Let value be ? Get (holder, key)')
    && f('sec-ordinaryhasinstance').includes('Set O to ? O. [[GetPrototypeOf]] ()') && f('sec-object.getprototypeof').includes('Return ? obj. [[GetPrototypeOf]] ()')
    && f('sec-object.setprototypeof').includes('Let status be ? O. [[SetPrototypeOf]] (proto)') && f('sec-set-object.prototype.__proto__').includes('Let status be ? O. [[SetPrototypeOf]] (proto)')
    && f('sec-object.preventextensions').includes('Let status be ? O. [[PreventExtensions]] ()') && f('sec-object.freeze').includes('Let status be ? SetIntegrityLevel (O, frozen)')
    && f('sec-call').includes('Return ? F. [[Call]] (V, argumentsList)') && f('sec-construct').includes('Return ? F. [[Construct]] (argumentsList, newTarget)'),
  'lecture 9: the table — GetValue, PutValue, in, delete, DefinePropertyOrThrow, getOwnPropertyDescriptor, EnumerableOwnProperties, CopyDataProperties, for-in, JSON, instanceof, getPrototypeOf, setPrototypeOf and __proto__, preventExtensions, freeze, Call, Construct');
  check(hasAll(f('sec-ordinaryobjectcreate'), ['Let O be MakeBasicObject (internalSlotsList)', 'it is not called by any algorithm that subsequently modifies the internal methods of the object', 'Operations that create exotic objects invoke MakeBasicObject directly'])
    && f('sec-ordinarycreatefromconstructor').includes('Let proto be ? GetPrototypeFromConstructor (constructor, intrinsicDefaultProto)')
    && hasAll(f('sec-getprototypefromconstructor'), ['Let proto be ? Get (constructor, "prototype"). If proto is not an Object, then Let realm be ? GetFunctionRealm (constructor)',
      'the default value that is used is obtained from the realm of the constructor function rather than from the running execution context'])
    && f('sec-requireinternalslot').includes('If O does not have an internalSlot internal slot, throw a TypeError exception')
    && f('sec-thistimevalue').includes('[[DateValue]]'),
  'lecture 10: OrdinaryObjectCreate and its note on MakeBasicObject; OrdinaryCreateFromConstructor → GetPrototypeFromConstructor and the realm of the constructor; RequireInternalSlot; [[DateValue]]');
  check(hasAll(f('sec-ecmascript-function-objects'), ['Table 25', '[[Environment]]', '[[PrivateEnvironment]]', '[[FormalParameters]]', '[[ECMAScriptCode]]', '[[ConstructorKind]] base or derived', '[[Realm]]',
    '[[ScriptOrModule]]', '[[ThisMode]] lexical, strict, or global', '[[Strict]]', '[[HomeObject]]', '[[SourceText]]', '[[Fields]]', '[[PrivateMethods]]', '[[ClassFieldInitializerName]]', '[[IsClassConstructor]]'])
    && f('sec-function.prototype.tostring').includes('Return CodePointsToString (func. [[SourceText]])'),
  'lecture 11: the slots of table 25; toString returns [[SourceText]]');
  check(inOrder(f('sec-ecmascript-function-objects-call-thisargument-argumentslist'), ['Let calleeContext be PrepareForOrdinaryCall (F, undefined)', 'If F. [[IsClassConstructor]] is true, then Let error be a newly created TypeError object',
    'error is created in calleeContext with F \'s associated Realm Record', 'Perform OrdinaryCallBindThis (F, calleeContext, thisArgument)', 'Let result be Completion (OrdinaryCallEvaluateBody (F, argumentsList))',
    'If result is a return completion, return result. [[Value]]'])
    && inOrder(f('sec-prepareforordinarycall'), ['Set the Realm of calleeContext to calleeRealm', 'Let localEnv be NewFunctionEnvironment (F, newTarget)'])
    && hasAll(f('sec-ordinarycallbindthis'), ['If thisMode is lexical, return unused', 'If thisMode is strict, then Let thisValue be thisArgument', 'Let thisValue be globalEnv. [[GlobalThisValue]]',
      'Let thisValue be ! ToObject (thisArgument). NOTE: ToObject produces wrapper objects using calleeRealm'])
    && f('sec-ordinarycallevaluatebody').includes('Return ? EvaluateBody of F. [[ECMAScriptCode]] with arguments F and argumentsList')
    && f('sec-runtime-semantics-evaluatefunctionbody').includes('Perform ? FunctionDeclarationInstantiation (functionObject, argumentsList)')
    && f('sec-newfunctionenvironment').includes('Set env. [[NewTarget]] to newTarget'),
  'lecture 12: [[Call]] — PrepareForOrdinaryCall with undefined, a class throws in its own realm, OrdinaryCallBindThis (wrappers from the callee realm), EvaluateBody → FunctionDeclarationInstantiation; newTarget in the environment');
  check(inOrder(f('sec-ecmascript-function-objects-construct-argumentslist-newtarget'), ['If kind is base, then Let thisArgument be ? OrdinaryCreateFromConstructor (newTarget, "%Object.prototype%")',
    'Let calleeContext be PrepareForOrdinaryCall (F, newTarget)', 'Let initializeResult be Completion (InitializeInstanceElements (thisArgument, F))', 'Let result be Completion (OrdinaryCallEvaluateBody (F, argumentsList))',
    'If result. [[Value]] is an Object, return result. [[Value]]', 'If kind is base, return thisArgument', 'If result. [[Value]] is not undefined, throw a TypeError exception', 'Let thisBinding be ? constructorEnv. GetThisBinding ()'])
    && inOrder(f('sec-super-keyword-runtime-semantics-evaluation'), ['Let result be ? Construct (func, argList, newTarget)', 'Perform ? BindThisValue (thisER, result)', 'Perform ? InitializeInstanceElements (result, F)'])
    && /> 13\.3\.7\.1 Runtime Semantics: Evaluation/.test(f('sec-super-keyword-runtime-semantics-evaluation'))
    && f('sec-function-environment-records-getthisbinding').includes('If envRec. [[ThisBindingStatus]] is uninitialized, throw a ReferenceError exception'),
  'lecture 13: [[Construct]] — this from newTarget for base, fields, body, an object wins, base gives this, derived: not undefined — TypeError, then this or ReferenceError; super() (13.3.7.1): Construct, BindThisValue, fields');
  check(hasAll(f('sec-setfunctionname'), ['If description is undefined, set name to the empty String. Else, set name to the string-concatenation of "[", description, and "]"',
    'Set name to the string-concatenation of prefix, the code unit 0x0020 (SPACE), and name', '[[Value]] : name, [[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : true'])
    && f('sec-setfunctionlength').includes('[[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : true')
    && f('sec-makeclassconstructor').includes('Set F. [[IsClassConstructor]] to true') && f('sec-makemethod').includes('Set F. [[HomeObject]] to homeObject')
    && f('sec-makeconstructor').includes('Set F. [[Construct]] to the definition specified in 10.2.2')
    && f('sec-definemethodproperty').includes('Let desc be the PropertyDescriptor { [[Value]] : closure, [[Writable]] : true, [[Enumerable]] : enumerable, [[Configurable]] : true }')
    && inOrder(f('sec-runtime-semantics-classdefinitionevaluation'), ['Perform SetFunctionName (F, className)', 'Let element be Completion (ClassElementEvaluation of e with argument F)']),
  'lecture 14: SetFunctionName — "[description]" or "", a prefix with a space, flags of name and length; MakeClassConstructor, MakeMethod, MakeConstructor, DefineMethodProperty; a class gets its name before its elements');
  check(f('sec-addrestrictedfunctionproperties').includes('Perform ! DefinePropertyOrThrow (F, "caller", PropertyDescriptor { [[Get]] : thrower, [[Set]] : thrower, [[Enumerable]] : false, [[Configurable]] : true })')
    && callers('AddRestrictedFunctionProperties').includes('CreateIntrinsics') && fullSpec.includes('Perform AddRestrictedFunctionProperties (realmRec. [[Intrinsics]].[[ %Function.prototype% ]], realmRec)')
    && hasAll(f('sec-%throwtypeerror%'), ['It is an anonymous built-in function object that is defined once for each realm', 'Throw a TypeError exception', 'The value of the [[Extensible]] internal slot of this function is false'])
    && fullSpec.includes('"callee", PropertyDescriptor { [[Get]] : %ThrowTypeError%, [[Set]] : %ThrowTypeError%, [[Enumerable]] : false, [[Configurable]] : false }'),
  'lecture 14, Chrome: AddRestrictedFunctionProperties (called by CreateIntrinsics for Function.prototype) gives caller and arguments %ThrowTypeError% as getter and setter; %ThrowTypeError% is anonymous and non-extensible; strict arguments get it as callee');
  const fdi = f('sec-functiondeclarationinstantiation');
  check(inOrder(fdi, ['If parameterNames has any duplicate entries, let hasDuplicates be true', 'Let simpleParameterList be IsSimpleParameterList of formals', 'Let hasParameterExpressions be ContainsExpression of formals',
    'For each element d of varDeclarations, in reverse List order', 'the last declaration is used', 'If func. [[ThisMode]] is lexical, then NOTE: Arrow functions never have an arguments object',
    'Else if parameterNames contains "arguments", then Set argumentsObjectNeeded to false', 'Else if hasParameterExpressions is false, then If functionNames contains "arguments" or lexicalNames contains "arguments", then Set argumentsObjectNeeded to false',
    'If strict is true or simpleParameterList is false, then Let ao be CreateUnmappedArgumentsObject (argumentsList)', 'If hasDuplicates is true, then Let usedEnv be undefined',
    'Perform ? IteratorBindingInitialization of formals with arguments iteratorRecord and usedEnv', 'A var with the same name as a formal parameter initially has the same value as the corresponding initialized parameter',
    'Block-Level Function Declarations Web Legacy Compatibility Semantics', 'Lexically declared names are only instantiated here but not initialized', 'Perform ! varEnv. SetMutableBinding (fn, fo, false)'])
    && f('sec-parameter-lists-static-semantics-early-errors').includes('It is a Syntax Error if IsSimpleParameterList of FormalParameterList is false and the BoundNames of FormalParameterList contains any duplicate elements'),
  'lecture 15: FunctionDeclarationInstantiation — names, functions from the end, when arguments is needed, mapped or not, duplicates without an environment, var copies a parameter, B.3.2, lexical without values, functions over parameters; duplicates only in a simple list');
  check(hasAll(f('sec-built-in-function-objects'), ['[[Realm]], a Realm Record', '[[InitialName]], a String that is the initial name of the function. It is used by 20.2.3.5', '[[Async]], a Boolean',
    'A built-in function object has a [[Construct]] internal method if and only if it is described as a “ constructor ”'])
    && f('sec-built-in-function-objects-call-thisargument-argumentslist').includes('Return ? BuiltinCallOrConstruct (F, thisArgument, argumentsList, undefined)')
    && f('sec-built-in-function-objects-construct-argumentslist-newtarget').includes('Let result be ? BuiltinCallOrConstruct (F, uninitialized, argumentsList, newTarget)')
    && hasAll(f('sec-builtincallorconstruct'), ['Set the ScriptOrModule of calleeContext to null', 'evaluating F in a manner that conforms to the specification of F'])
    && hasAll(f('sec-createbuiltinfunction'), ['Perform SetFunctionLength (func, length)', 'Perform SetFunctionName (func, name)']) && !f('sec-createbuiltinfunction').includes('"prototype"')
    && f('sec-function.prototype.tostring').includes('if func has an [[InitialName]] internal slot and func. [[InitialName]] is a String, the portion of the returned String that would be matched by NativeFunctionAccessor opt PropertyName must be func. [[InitialName]]'),
  'lecture 16: built-in functions — [[Realm]], [[InitialName]] (20.2.3.5), [[Async]]; [[Construct]] only for constructors; BuiltinCallOrConstruct without ScriptOrModule; CreateBuiltinFunction sets length and name, no prototype');
  check(f('sec-definemethodproperty').includes('DefinePropertyOrThrow only returns an abrupt completion when attempting to define a class static method whose key is "prototype"')
    && inOrder(f('sec-class-definitions-static-semantics-early-errors'), ['ClassElement : static MethodDefinition', 'It is a Syntax Error if the PropName of MethodDefinition is "prototype"'])
    && f('sec-iscompatiblepropertydescriptor').includes('Return ValidateAndApplyPropertyDescriptor (undefined, "", Extensible, Desc, Current)')
    && callers('IsCompatiblePropertyDescriptor').some((c) => /proxy/i.test(c))
    && f('sec-definefield').includes('Perform ? CreateDataPropertyOrThrow (receiver, fieldName, initValue)')
    && /> 10\.2\.8 DefineMethodProperty/.test(f('sec-definemethodproperty')) && /> 10\.1\.6\.2 IsCompatiblePropertyDescriptor/.test(f('sec-iscompatiblepropertydescriptor')),
  `tasks 4, 9: IsCompatiblePropertyDescriptor (10.1.6.2) is the version without an object, used by Proxy; the note of 10.2.8 on a static "prototype"; the early error of 15.7.1; a static field goes through DefineField ${JSON.stringify(callers('IsCompatiblePropertyDescriptor'))}`);
  check(spec.includes('id="sec-array-exotic-objects-defineownproperty-p-desc"') && spec.includes('id="sec-bound-function-exotic-objects-call-thisargument-argumentslist"')
    && spec.includes('id="sec-bound-function-exotic-objects-construct-argumentslist-newtarget"') && f('sec-array-exotic-objects-defineownproperty-p-desc').includes('If P is "length", return ? ArraySetLength (A, Desc)'),
  'lecture 1: an array has its own [[DefineOwnProperty]] (length), a bound function its own [[Call]] and [[Construct]]');

  // the MDN pages of the footer and what the lecture says about MDN
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  check(['guide/inheritance_and_the_prototype_chain', 'reference/global_objects/object/defineproperty', 'guide/enumerability_and_ownership_of_properties'].every((p) => mdn(p).startsWith('---\ntitle:')),
    'footer: the MDN pages Inheritance and the prototype chain, Object.defineProperty(), Enumerability and ownership of properties are in the cache');
  {
    const en = mdn('guide/enumerability_and_ownership_of_properties');
    const querying = en.slice(en.indexOf('## Querying object properties'), en.indexOf('## Traversing object properties'));
    const traversing = en.slice(en.indexOf('## Traversing object properties'), en.indexOf('## Obtaining properties'));
    check(querying.includes('[`in`]') && querying.includes('[`Object.hasOwn()`]') && traversing.includes('[`Object.keys`]') && traversing.includes('[`for...in`]') && traversing.includes('[Object spread]'),
      'student homework 4: MDN — the tables «Querying» (in, Object.hasOwn) and «Traversing» (Object.keys, for...in, spread)');
  }
  {
    const caller = mdn('reference/global_objects/function/caller');
    check(caller.includes('status:\n  - deprecated\n  - non-standard') && mdn('reference/global_objects/function/arguments').includes('  - deprecated')
      && caller.includes('// In Chrome:\n// caller is an own property with descriptor'),
    'lecture 14: MDN calls caller and arguments deprecated and non-standard; its note «In Chrome: own property» (out of date, see above) is still there — a finding for day 31');
  }

  // the days the lecture points to
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  check(hasAll(read('advanced/day-04/lecture.html'), ['Таблица 4 — одиннадцать обязательных методов любого объекта', '6.1.7.3', 'PutValue'])
    && hasAll(read('advanced/day-07/lecture.html'), ['DefineField', 'CreateDataProperty', 'EnumerableOwnProperties', 'CopyDataProperties', 'InitializeInstanceElements'])
    && read('advanced/day-08/lecture.html').includes('Duplicate parameter name not allowed in this context')
    && hasAll(read('advanced/day-09/lecture.html'), ['OrdinaryCallBindThis', 'new.target', 'Реалм']) && read('advanced/day-10/lecture.html').includes('скобки не теряют ссылку')
    && read('advanced/day-11/lecture.html').includes('Порядок for-in') && read('advanced/day-12/lecture.html').includes('<figcaption>Окружения вызова функции с кодом в параметрах</figcaption>')
    && read('advanced/day-12/lecture.html').includes('(целиком — день 14)') && read('advanced/day-12/tasks.html').includes('3. Класс с наследником по шагам')
    && read('advanced/day-13/lecture.html').includes('FunctionDeclarationInstantiation целиком'),
  'lecture: course 3 — table 4, 6.1.7.3, PutValue (day 4); DefineField and friends (7); duplicate parameters (8); OrdinaryCallBindThis, new.target, realms (9); parentheses (10); for-in order (11); the scheme, the promise and task 3 (12); the promise (13)');
  check(read('intermediate/day-01/lecture.html').includes('[[Environment]]') && read('intermediate/day-04/lecture.html').includes('toString: исходный текст')
    && read('intermediate/day-05/lecture.html').includes('присваивание даёт все три признака') && read('intermediate/day-07/lecture.html').includes('override mistake')
    && read('intermediate/day-10/lecture.html').includes('Откуда super знает родителя') && read('intermediate/day-33/lecture.html').includes('get word() {'),
  'lecture: course 2 — [[Environment]] (day 1), toString (4), flags of an assignment (5), override mistake (7), super (10), the getters of Card (33)');
  {
    const plan = read('docs/plan-3-advanced.md');
    const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
    const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
    const mdnDay = (p) => { const r = mdRows.find((c) => c[0] === p); return r ? `${r[5]}.${r[6]}` : '?'; };
    check(plan.includes('**15. Экзотические объекты: массив, строка, arguments, связанная функция.**') && plan.includes('**16. Proxy: ловушки и инварианты.**')
      && plan.includes('| 21 | A5 |') && mdnDay('Web/JavaScript/Reference/Global_Objects/Function/caller') === '3.31' && mdnDay('Web/JavaScript/Reference/Global_Objects/Function/arguments') === '3.31'
      && spRows.some((c) => c[0] === 'sec-block-level-function-declarations-web-legacy-compatibility-semantics' && c[7] === '31'),
    'lecture: the days it names — exotic objects 15, Proxy 16, DataView 21, caller and arguments of MDN and B.3.2 — 31');

    // the reference table holds every row of the plan as a link, every anchor of the lecture exists
    const lecture = read('advanced/day-14/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const rows = spRows.filter((c) => c[6] === '3' && c[7] === '14').map((c) => c[0]);
    const notInTable = rows.filter((id) => !refRows.includes(id));
    check(rows.length === 34 && refRows.length === 34 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 14, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
    const full = spRows.filter((c) => c[6] === '3' && c[7] === '14' && c[9] === 'подробно').map((c) => c[0]);
    const marked = [...refTable.matchAll(/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(full.length === 11 && JSON.stringify(full) === JSON.stringify(marked), `plan: the 11 rows "подробно" are marked so in the table ${JSON.stringify(marked)}`);
    check(mdRows.filter((c) => c[5] === '3' && c[6] === '14').length === 0, 'plan: no MDN pages of day 14');
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
