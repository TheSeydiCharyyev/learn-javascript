// Course 3, day 16, in Chrome: Proxy — traps and invariants. Every <pre class="code js"> block of the lecture runs as
// the only <script> in the <body> of a clean page, the way a student would paste it into a file. Console output is
// rebuilt from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …".
// The context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-16.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-16.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block of the notes prints what the comments of its
// console.log lines say, the table «code — traps» of the notes holds, and the homework (1–3 in Chrome, 4 in the text of
// MDN); a block of the tasks prints what EXPECT says, an example runs with the reference solution of SOLUTIONS and every
// "expression;   // value" line equals its comment, and what the criteria ask to find holds in Chrome and in the text of
// ECMA-262; the cheatsheet runs without an error; the experiments
// the lecture only tells about (GetMethod with null and with a non-function; an empty handler gives getters this =
// proxy; t[key] helps a getter of a Map, not its methods, the wrapper of MDN helps both; Promise.resolve asks then;
// a sloppy assignment is silent on false, Object.assign throws; the table of the six traps seen through a handler that
// is itself a proxy; the invariants of a non-extensible target; a revoked then in a thenable rejects with a TypeError
// of the current realm; typeof of revoked proxies); what the lecture says about the text of ECMA-262 2026 (section 10.5,
// 28.2 and the operations around them) is checked against tools/.cache/ecma262-2026.html; the MDN pages of the plan
// are in tools/.cache/mdn-content.git and say what the lecture says; the days it points to say what it says; the
// reference table holds all 36 rows of the day's plan (19 of ECMA-262, 17 of MDN) as links with their marks and every
// tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-16');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['kitap 2 нет: nope 2 false', '2 undefined word,level'],
  'tasks #1': ['TypeError 100 100 TypeError false', 'ok true TypeError ok 0'],
  'tasks #2': ['getOwnPropertyDescriptor', 'ownKeys, getOwnPropertyDescriptor, get', 'get, set, getOwnPropertyDescriptor, defineProperty', 'has', 'isExtensible'],
  'tasks #8': ['ok TypeError TypeError TypeError ok TypeError 1 false', 'TypeError ok 1'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
// No Reflect: the day forwards with t[key], key in t, Object.defineProperty and Function.prototype.apply.call.
const SOLUTIONS = {
  checked: `function checked(target, test) {
  const guard = (key, value) => { if (!test(key, value)) throw new RangeError(String(key) + ": " + String(value) + " не прошло проверку"); };
  return new Proxy(target, {
    set(t, key, value) { guard(key, value); t[key] = value; return true; },
    defineProperty(t, key, desc) {
      if ("get" in desc || "set" in desc) throw new TypeError(String(key) + ": аксессор не проверить");
      if ("value" in desc) guard(key, desc.value);
      Object.defineProperty(t, key, desc);
      return true;
    },
  });
}`,
  range: `function range(from, to) {
  const inRange = (key) => typeof key === "string" && String(Number(key)) === key && Number.isInteger(Number(key)) && Number(key) >= from && Number(key) <= to;
  return new Proxy({}, {
    get(t, key) { return inRange(key) ? Number(key) : t[key]; },
    has(t, key) { return inRange(key) || key in t; },
    ownKeys() { const keys = []; for (let i = from; i <= to; i++) keys.push(String(i)); return keys; },
    getOwnPropertyDescriptor(t, key) { return inRange(key) ? { value: Number(key), writable: false, enumerable: true, configurable: true } : Object.getOwnPropertyDescriptor(t, key); },
  });
}`,
  memo: `function memo(fn) {
  const cache = new Map();
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      const key = JSON.stringify(args);
      if (!cache.has(key)) cache.set(key, Function.prototype.apply.call(target, thisArg, args));
      return cache.get(key);
    },
  });
}`,
  strictSettings: `function strictSettings(defaults) {
  const LANGUAGE = new Set(["toJSON", "then"]);
  return new Proxy({ ...defaults }, {
    get(t, key) {
      if (typeof key === "string" && !LANGUAGE.has(key) && !(key in t)) throw new ReferenceError("нет настройки «" + key + "»");
      return t[key];
    },
    set(t, key, value) {
      if (!Object.hasOwn(t, key)) throw new ReferenceError("нет настройки «" + String(key) + "»");
      if (typeof value !== typeof t[key]) throw new TypeError(String(key) + ": нужен " + typeof t[key]);
      t[key] = value;
      return true;
    },
    defineProperty(t, key) { throw new TypeError(String(key) + ": только присваиванием"); },
    deleteProperty() { return false; },
  });
}`,
  lend: `function lend(target) {
  const wrappers = new WeakMap();
  const revokes = [];
  const wrap = (obj) => {
    if (wrappers.has(obj)) return wrappers.get(obj);
    const { proxy, revoke } = Proxy.revocable(obj, {
      get(t, key) { const value = t[key]; return typeof value === "object" && value !== null ? wrap(value) : value; },
    });
    wrappers.set(obj, proxy);
    revokes.push(revoke);
    return proxy;
  };
  return { proxy: wrap(target), revoke() { for (const r of revokes) r(); } };
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

const RUN = 'const run = (f) => { try { f(); return "ok"; } catch (e) { return `${e.name}: ${e.message}`; } };\n';
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
  await told(`${RUN}const nul = new Proxy({ x: 1 }, { get: null });
const bad = new Proxy({ x: 1 }, { get: 1 });
console.log(nul.x, run(() => bad.x));`, ['1 TypeError: \'1\' returned for property \'get\' of object \'#<Object>\' is not a function'],
  'lecture 3: GetMethod — null means «no trap», a non-function is a TypeError', 'getmethod.html');
  await told(`const t = { get me() { return this; } };
const p = new Proxy(t, {});
console.log(p.me === p, t.me === t);`, ['true true'], 'lecture 5: an empty handler forwards with Receiver = proxy — a getter of the target gets this = proxy', 'empty-this.html');
  await told(`${RUN}const m = new Map([[1, "kitap"]]);
const half = new Proxy(m, { get(t, key) { return t[key]; } });
const full = new Proxy(m, { get(t, key, receiver) { const value = t[key]; return value instanceof Function ? function (...args) { return value.apply(this === receiver ? t : this, args); } : value; } });
console.log(run(() => half.get(1)), "|", run(() => half.size), "|", full.get(1), full.size);`,
  ['TypeError: Method Map.prototype.get called on incompatible receiver #<Map> | ok | kitap 1'],
  'lecture 5: t[key] saves the getter size of a Map but not its method get (called with this = proxy); the wrapper of MDN saves both', 'map-methods.html');
  await told(`const keys = [];
const p = new Proxy({}, { get(t, key) { keys.push(String(key)); return t[key]; } });
Promise.resolve(p).then(() => console.log(keys.join()));`, ['then'], 'cheatsheet: the language asks a proxy for then too (Promise.resolve)', 'then.html');
  await told(`${RUN}const proxy = new Proxy({}, { set(t, key, value) { return !key.startsWith("_"); } });
console.log(run(() => { proxy._x = 1; }), "|", run(() => Object.assign(proxy, { _b: 1 })));`, ['ok | TypeError: \'set\' on proxy: trap returned falsish for property \'_b\''],
  'lecture 7: false from set — silent in sloppy code, Object.assign throws even there', 'assign.html');
  await told(`const log = [];
const handler = new Proxy({}, { get(h, trap) { log.push(trap); return undefined; } });
const watch = (target, f) => { log.length = 0; f(new Proxy(target, handler)); return [...new Set(log)].join(); };
const rows = {
  protoSet: watch({}, (p) => { p.__proto__ = {}; }),
  setProto: watch({}, (p) => Object.setPrototypeOf(p, {})),
  freeze: watch({ x: 1 }, (p) => Object.freeze(p)),
  seal: watch({ x: 1 }, (p) => Object.seal(p)),
  isExt: watch({}, (p) => Object.isExtensible(p)),
  isProto: watch({}, (p) => Object.prototype.isPrototypeOf(p)),
  field: watch({}, (p) => { class Base { constructor() { return p; } } class Field extends Base { x = 1; } new Field(); }),
  gopd: watch({ x: 1 }, (p) => Object.getOwnPropertyDescriptor(p, "x")),
  define: watch({}, (p) => Object.defineProperty(p, "x", { value: 1 })),
  inst: watch({}, (p) => p instanceof Object),
};
console.log(JSON.stringify(rows));`,
  ['{"protoSet":"set,setPrototypeOf","setProto":"setPrototypeOf","freeze":"preventExtensions,ownKeys,getOwnPropertyDescriptor,defineProperty","seal":"preventExtensions,ownKeys,defineProperty","isExt":"isExtensible","isProto":"getPrototypeOf","field":"defineProperty","gopd":"getOwnPropertyDescriptor","define":"defineProperty","inst":"getPrototypeOf"}'],
  'lecture 13: the table of the six traps — __proto__ = and setPrototypeOf, freeze and seal, isExtensible, isPrototypeOf and instanceof, a class field and defineProperty', 'six.html');
  await told(`${RUN}const t = Object.preventExtensions({ a: 1 });
console.log(run(() => "a" in new Proxy(t, { has() { return false; } })), "|", run(() => delete new Proxy(t, { deleteProperty() { return true; } }).a), "|", run(() => Object.keys(new Proxy(t, { ownKeys() { return ["a", "b"]; } }))));`,
  ['TypeError: \'has\' on proxy: trap returned falsish for property \'a\' but the proxy target is not extensible | TypeError: \'deleteProperty\' on proxy: trap returned truish for property \'a\' but the proxy target is non-extensible | TypeError: \'ownKeys\' on proxy: trap returned extra keys but proxy target is non-extensible'],
  'lecture 9, 10: a non-extensible target — no hiding or «deleting» even a configurable key, ownKeys gives exactly its keys', 'nonext.html');
  await told(`const { proxy: then, revoke } = Proxy.revocable(function (resolve) { resolve("ok"); }, {});
revoke();
Promise.resolve({ then }).then((v) => console.log("fulfilled", v), (e) => console.log("rejected", e.name, e.message, e instanceof TypeError));`,
  ['rejected TypeError Cannot perform \'apply\' on a proxy that has been revoked true'],
  'lecture 15 and task of day 9: a revoked then — the job takes the current realm and the promise is rejected with a TypeError of it', 'thenable.html');
  await told(`const { proxy, revoke } = Proxy.revocable({}, {});
const { proxy: f, revoke: r2 } = Proxy.revocable(class {}, {});
revoke(); r2();
console.log(typeof proxy, typeof f);`, ['object function'], 'lecture 15 (scheme): typeof of revoked proxies still works — it looks at [[Call]]', 'typeof.html');
  // the notes: the table «code — traps», seen through a handler that is itself a proxy (the first trap is the one of
  // the operation, the rest come from forwarding: [[Set]] of the target asks the Receiver, [[Construct]] reads prototype)
  await told(`const log = [];
const handler = new Proxy({}, { get(h, trap) { log.push(trap); return undefined; } });
const watch = (target, f) => { log.length = 0; f(new Proxy(target, handler)); return [...new Set(log)].join(); };
const rows = {
  get: watch({ x: 1 }, (p) => p.x),
  set: watch({}, (p) => { p.x = 1; }),
  in: watch({ x: 1 }, (p) => "x" in p),
  del: watch({ x: 1 }, (p) => delete p.x),
  keys: watch({ x: 1 }, (p) => Object.keys(p)),
  json: watch({ x: 1 }, (p) => JSON.stringify(p)),
  inst: watch({}, (p) => p instanceof Object),
  proto: watch({}, (p) => Object.getPrototypeOf(p)),
  call: watch(function () {}, (p) => p()),
  construct: watch(function () {}, (p) => new p()),
};
console.log(JSON.stringify(rows));`,
  ['{"get":"get","set":"set,getOwnPropertyDescriptor,defineProperty","in":"has","del":"deleteProperty","keys":"ownKeys,getOwnPropertyDescriptor","json":"get,ownKeys,getOwnPropertyDescriptor","inst":"getPrototypeOf","proto":"getPrototypeOf","call":"apply","construct":"construct,get"}'],
  'student table 1: p.x — get, p.x = v — set, in — has, delete — deleteProperty, Object.keys — ownKeys and descriptors, JSON — get (toJSON) first, instanceof and getPrototypeOf, p() — apply, new p() — construct', 'student-table.html');
  // the notes: the homework, in Chrome
  await told(`${RUN}const t = {};
Object.defineProperty(t, "id", { value: 7, configurable: false, writable: true });
const p = new Proxy(t, { get() { return 0; }, has() { return false; } });
console.log(p.id, run(() => "id" in p));
const k = new Proxy({ x: 1 }, { ownKeys() { return ["x", "y"]; } });
console.log(JSON.stringify(Object.keys(k)), JSON.stringify(Object.getOwnPropertyNames(k)), Object.preventExtensions(k) === k, Object.isExtensible(k), run(() => Object.keys(k)));
const twice = new Proxy(function (x) { return x; }, { apply(t, self, args) { return t(...args) * 2; } });
const made = new twice(1);
console.log(twice(2), twice.call(null, 3), JSON.stringify([1, 2].map(twice)), typeof made, JSON.stringify(made), Object.getPrototypeOf(made) === twice.prototype);`,
  ['0 TypeError: \'has\' on proxy: trap returned falsish for property \'id\' which exists in the proxy target as non-configurable',
    '["x"] ["x","y"] true false TypeError: \'ownKeys\' on proxy: trap returned extra keys but proxy target is non-extensible',
    '4 6 [2,4] object {} true'],
  'student homework 1–3: id is writable — get may answer anything, has may not hide a non-configurable key; Object.keys drops y without a descriptor, after preventExtensions (no trap — the target) the extra key throws; new does not go to apply — the target constructs an object', 'student-homework.html');
  // the tasks: what the criteria ask to find, with the reference solutions (probe d16_tasks.txt before writing)
  await told(`${RUN}const p = new Proxy({ level: 2 }, { set: () => false });
p.level = 3;
console.log(p.level, run(() => Object.assign(p, { level: 4 })));`, ['2 TypeError: \'set\' on proxy: trap returned falsish for property \'level\''],
  'task 1: false from set — the sloppy assignment is silent and writes nothing, Object.assign throws', 'task1.html');
  await told(`const log = [];
const handler = new Proxy({}, { get(h, trap) { log.push(trap); return undefined; } });
const watch = (target, f) => { log.length = 0; f(new Proxy(target, handler)); return [...new Set(log)].join(", "); };
console.log(watch(Object.freeze({ x: 1 }), (p) => Object.isFrozen(p)));`, ['isExtensible, ownKeys, getOwnPropertyDescriptor'],
  'task 3: isFrozen of a frozen target goes on — ownKeys and the descriptor of every key', 'task3.html');
  await told(`${RUN}const log = [];
const ok = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const only = new Proxy({}, { defineProperty(t, key, desc) { log.push(String(key) + " " + JSON.stringify(desc)); if (!ok(desc.value)) throw new RangeError("нет"); Object.defineProperty(t, key, desc); return true; } });
only.a = 5;
only.a = 4;
console.log(run(() => { only.b = 7; }), JSON.stringify(only), log.join(" | "));`,
  ['RangeError: нет {"a":4} a {"value":5,"writable":true,"enumerable":true,"configurable":true} | a {"value":4} | b {"value":7,"writable":true,"enumerable":true,"configurable":true}'],
  'task 4: a defineProperty trap alone checks assignment too — a new key comes with the full descriptor (CreateDataProperty), an existing one with { value } only', 'task4.html');
  await told(`${RUN}const keysOnly = new Proxy({}, { get(t, key) { return Number(key); }, ownKeys() { return ["3", "4"]; } });
console.log(JSON.stringify(Object.keys(keysOnly)), JSON.stringify(keysOnly), JSON.stringify(Object.getOwnPropertyNames(keysOnly)));
const fixed = new Proxy({}, { ownKeys() { return ["3"]; }, getOwnPropertyDescriptor() { return { value: 3, writable: false, enumerable: true, configurable: false }; } });
console.log(run(() => Object.keys(fixed)));
${SOLUTIONS.range}
const r = range(3, 5);
console.log(Object.preventExtensions(r) === r, run(() => Object.keys(r)));`,
  ['[] {} ["3","4"]', 'TypeError: \'getOwnPropertyDescriptor\' on proxy: trap reported non-configurability for property \'3\' which is either non-existent or configurable in the proxy target',
    'true TypeError: \'ownKeys\' on proxy: trap returned extra keys but proxy target is non-extensible'],
  'task 5: without getOwnPropertyDescriptor Object.keys and JSON see nothing, getOwnPropertyNames sees the keys; configurable: false — TypeError; preventExtensions, then Object.keys — TypeError', 'task5.html');
  await told(`${RUN}${SOLUTIONS.memo}
function memoThis(fn) {
  const byThis = new WeakMap(), noThis = new Map();
  return new Proxy(fn, { apply(target, thisArg, args) {
    const cache = thisArg !== null && (typeof thisArg === "object" || typeof thisArg === "function") ? (byThis.get(thisArg) ?? byThis.set(thisArg, new Map()).get(thisArg)) : noThis;
    const key = JSON.stringify(args); if (!cache.has(key)) cache.set(key, Function.prototype.apply.call(target, thisArg, args)); return cache.get(key); } });
}
function plus(x) { return this.n + x; }
const shared = memo(plus);
const a = { n: 1, plus: shared }, b = { n: 10, plus: shared };
const fixedPlus = memoThis(plus);
const c = { n: 1, plus: fixedPlus }, d = { n: 10, plus: fixedPlus };
class Card { constructor(word) { this.word = word; } }
const MemoCard = memo(Card);
console.log(a.plus(1), b.plus(1), c.plus(1), d.plus(1), new MemoCard("kitap") === new MemoCard("kitap"), run(() => MemoCard("kitap")));`,
  ['2 2 2 11 false TypeError: Class constructor Card cannot be invoked without \'new\''],
  'task 6: one memo for two objects gives the second the first answer (the key has no thisArg), a cache per thisArg — 2 and 11; new is not cached (no construct trap), a call without new — the class throws inside apply', 'task6.html');
  await told(`${RUN}${SOLUTIONS.strictSettings}
const settings = strictSettings({ perDay: 10, sound: true });
const lecture = new Proxy({ perDay: 10 }, { get(t, key) { if (typeof key === "string" && !(key in t)) throw new ReferenceError("нет настройки «" + key + "»"); return t[key]; } });
const withIn = new Proxy({ perDay: 10 }, { set(t, key, value) { if (!(key in t)) throw new ReferenceError("нет настройки «" + String(key) + "»"); if (typeof value !== typeof t[key]) throw new TypeError(String(key) + ": нужен " + typeof t[key]); t[key] = value; return true; } });
console.log(run(() => { settings.toString = 1; }), "|", run(() => { withIn.toString = 1; }), "|", String(lecture));
Promise.resolve(settings).then((v) => console.log("fulfilled", v === settings), (e) => console.log("rejected", e.name, e.message));
Promise.resolve(lecture).then((v) => console.log("fulfilled", v === lecture), (e) => console.log("rejected", e.name, e.message));`,
  ['ReferenceError: нет настройки «toString» | TypeError: toString: нужен function | [object Object]', 'fulfilled true', 'rejected ReferenceError нет настройки «then»'],
  'task 7: Object.hasOwn stops toString as a typo, in would let it to the type check; String works in the lecture too; Promise.resolve fulfills with the settings, the lecture version is rejected on then', 'task7.html');
  await told(`${RUN}${SOLUTIONS.lend}
const frozen = lend(Object.freeze({ deck: {} }));
console.log(run(() => frozen.proxy.deck));`,
  ['TypeError: \'get\' on proxy: property \'deck\' is a read-only and non-configurable data property on the proxy target but the proxy did not return its actual value (expected \'#<Object>\' but got \'#<Object>\')'],
  'task 8: lend over a frozen object — a wrapper for a fixed property breaks 10.5.8, and V8 prints both objects as #<Object>', 'task8.html');
  await told(`const plain = {};
Object.defineProperty(plain, "c", { value: 1 });
console.log(JSON.stringify(Object.getOwnPropertyDescriptor(plain, "c")));`, ['{"value":1,"writable":false,"enumerable":false,"configurable":false}'],
  'task 9: on an ordinary object { value: 1 } makes a non-configurable property — the proxy checks only the fields that Desc has', 'task9.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);
  const PX = 'sec-proxy-object-internal-methods-and-internal-slots';

  check(hasAll(f(PX), ['A Proxy object is an exotic object whose essential internal methods are partially implemented using ECMAScript code', 'Every Proxy object has an internal slot called [[ProxyHandler]]',
    'Every Proxy object also has an internal slot called [[ProxyTarget]]',
    'Table 29: Proxy Handler Methods Internal Method Handler Method [[GetPrototypeOf]] getPrototypeOf [[SetPrototypeOf]] setPrototypeOf [[IsExtensible]] isExtensible [[PreventExtensions]] preventExtensions [[GetOwnProperty]] getOwnPropertyDescriptor [[DefineOwnProperty]] defineProperty [[HasProperty]] has [[Get]] get [[Set]] set [[Delete]] deleteProperty [[OwnPropertyKeys]] ownKeys [[Call]] apply [[Construct]] construct',
    'the handler method is passed the proxy\'s target object as a parameter',
    'Invoking an internal method on the proxy results in the invocation of the corresponding internal method on the proxy\'s target object if the handler object does not have a method corresponding to the internal trap',
    'When a proxy is revoked, its [[ProxyHandler]] and [[ProxyTarget]] internal slots are set to null', 'These invariants are explicitly enforced by the Proxy object internal methods specified in this section',
    'An object is a Proxy exotic object if its essential internal methods (including [[Call]] and [[Construct]], if applicable) use the definitions in this section']),
  'lecture 1, 3: 10.5 — methods in ECMAScript code, the two slots, table 29, no trap — the target, revocation nulls both, the invariants are enforced, all methods are its own');
  {
    const methods = [['getprototypeof', 'getPrototypeOf'], ['setprototypeof-v', 'setPrototypeOf'], ['isextensible', 'isExtensible'], ['preventextensions', 'preventExtensions'], ['getownproperty-p', 'getOwnPropertyDescriptor'],
      ['defineownproperty-p-desc', 'defineProperty'], ['hasproperty-p', 'has'], ['get-p-receiver', 'get'], ['set-p-v-receiver', 'set'], ['delete-p', 'deleteProperty'], ['ownpropertykeys', 'ownKeys'],
      ['call-thisargument-argumentslist', 'apply'], ['construct-argumentslist-newtarget', 'construct']];
    const wrong = methods.filter(([id, trap]) => !inOrder(f(`${PX}-${id}`), ['Perform ? ValidateNonRevokedProxy (O)', `Let trap be ? GetMethod (handler, "${trap}")`, 'If trap is undefined, then', 'Call (trap, handler, «target']));
    check(wrong.length === 0 && f('sec-getmethod').includes('If func is either undefined or null, return undefined. If IsCallable (func) is false, throw a TypeError exception')
      && f('sec-validatenonrevokedproxy').includes('If proxy. [[ProxyTarget]] is null, throw a TypeError exception'),
    `lecture 3: all thirteen methods — ValidateNonRevokedProxy, GetMethod, the target without a trap, Call(trap, handler, «target, …»); GetMethod — undefined or null, else callable; ValidateNonRevokedProxy ${wrong.map((w) => w[1]).join(', ') || ''}`);
  }
  check(inOrder(f(`${PX}-getprototypeof`), ['If handlerProto is not an Object and handlerProto is not null, throw a TypeError exception', 'If extensibleTarget is true, return handlerProto', 'If SameValue (handlerProto, targetProto) is false, throw a TypeError exception'])
    && inOrder(f(`${PX}-setprototypeof-v`), ['If booleanTrapResult is false, return false', 'If extensibleTarget is true, return true', 'If SameValue (V, targetProto) is false, throw a TypeError exception'])
    && f(`${PX}-isextensible`).includes('If booleanTrapResult is not targetResult, throw a TypeError exception')
    && f(`${PX}-preventextensions`).includes('If booleanTrapResult is true, then Let extensibleTarget be ? IsExtensible (target). If extensibleTarget is true, throw a TypeError exception'),
  'lecture 13: getPrototypeOf and setPrototypeOf — free while the target is extensible; isExtensible — the answer of the target; preventExtensions — true only for a non-extensible target');
  check(inOrder(f(`${PX}-getownproperty-p`), ['If trapResultObj is not an Object and trapResultObj is not undefined, throw a TypeError exception', 'If trapResultObj is undefined, then If targetDesc is undefined, return undefined. If targetDesc. [[Configurable]] is false, throw a TypeError exception',
    'If extensibleTarget is false, throw a TypeError exception. Return undefined', 'Let resultDesc be ? ToPropertyDescriptor (trapResultObj). Perform CompletePropertyDescriptor (resultDesc)',
    'Let valid be IsCompatiblePropertyDescriptor (extensibleTarget, resultDesc, targetDesc)', 'If resultDesc. [[Configurable]] is false, then If targetDesc is undefined or targetDesc. [[Configurable]] is true, then Throw a TypeError exception',
    'If resultDesc has a [[Writable]] field and resultDesc. [[Writable]] is false, then', 'If targetDesc. [[Writable]] is true, throw a TypeError exception'])
    && hasAll(f('sec-completepropertydescriptor'), ['[[Value]] : undefined, [[Writable]] : false, [[Get]] : undefined, [[Set]] : undefined, [[Enumerable]] : false, [[Configurable]] : false'])
    && JSON.stringify(callers('IsCompatiblePropertyDescriptor').sort()) === JSON.stringify([`${PX}-defineownproperty-p-desc`, `${PX}-getownproperty-p`, 'sec-string-exotic-objects-defineownproperty-p-desc']),
  'lecture 10, 13, 14: 10.5.5 step by step — object or undefined, no hiding, CompletePropertyDescriptor, IsCompatiblePropertyDescriptor, the two rules; IsCompatiblePropertyDescriptor is called by 10.5.5, 10.5.6 and 10.4.3.2');
  check(inOrder(f(`${PX}-defineownproperty-p-desc`), ['If booleanTrapResult is false, return false', 'If targetDesc is undefined, then If extensibleTarget is false, throw a TypeError exception. If settingConfigFalse is true, throw a TypeError exception',
    'If settingConfigFalse is true and targetDesc. [[Configurable]] is true, throw a TypeError exception'])
    && f(`${PX}-hasproperty-p`).includes('If booleanTrapResult is false, then Let targetDesc be ? target. [[GetOwnProperty]] (P). If targetDesc is not undefined, then If targetDesc. [[Configurable]] is false, throw a TypeError exception. Let extensibleTarget be ? IsExtensible (target). If extensibleTarget is false, throw a TypeError exception')
    && inOrder(f(`${PX}-delete-p`), ['If booleanTrapResult is false, return false', 'If targetDesc is undefined, return true', 'If targetDesc. [[Configurable]] is false, throw a TypeError exception. Let extensibleTarget be ? IsExtensible (target). If extensibleTarget is false, throw a TypeError exception']),
  'lecture 9, 14: defineProperty — no new key on a non-extensible target, no false non-configurable; has and deleteProperty — no hiding a non-configurable key or any key of a non-extensible target');
  check(inOrder(f(`${PX}-get-p-receiver`), ['If trap is undefined, then Return ? target. [[Get]] (P, Receiver)', 'Let trapResult be ? Call (trap, handler, «target, P, Receiver»)', 'Let targetDesc be ? target. [[GetOwnProperty]] (P)',
    'If targetDesc is not undefined and targetDesc. [[Configurable]] is false, then If IsDataDescriptor (targetDesc) is true and targetDesc. [[Writable]] is false, then If SameValue (trapResult, targetDesc. [[Value]]) is false, throw a TypeError exception',
    'If IsAccessorDescriptor (targetDesc) is true and targetDesc. [[Get]] is undefined, then If trapResult is not undefined, throw a TypeError exception', 'Return trapResult']),
  'lecture 4, 5: 10.5.8 — no trap: the target with the same Receiver; the trap with Receiver; then the target descriptor; read-only fixed — SameValue; accessor without get — undefined');
  check(inOrder(f(`${PX}-set-p-v-receiver`), ['Let booleanTrapResult be ToBoolean (? Call (trap, handler, «target, P, V, Receiver»)). If booleanTrapResult is false, return false', 'If SameValue (V, targetDesc. [[Value]]) is false, throw a TypeError exception',
    'If targetDesc. [[Set]] is undefined, throw a TypeError exception'])
    && inOrder(f('sec-putvalue'), ['Let succeeded be ? baseObj. [[Set]] (V. [[ReferencedName]], W, GetThisValue (V))', 'If succeeded is false and V. [[Strict]] is true, throw a TypeError exception'])
    && f('sec-object.assign').includes('Perform ? Set (to, nextKey, propValue, true)') && f('sec-set-o-p-v-throw').includes('If success is false and Throw is true, throw a TypeError exception')
    && inOrder(f('sec-ordinarysetwithowndescriptor'), ['If parent is not null, return ? parent. [[Set]] (P, V, Receiver)', 'Let existingDescriptor be ? Receiver. [[GetOwnProperty]] (P)', 'Return ? CreateDataProperty (Receiver, P, V)'])
    && f('sec-createdataproperty').includes('Return ? O. [[DefineOwnProperty]] (P, newDesc)'),
  'lecture 7, 11, 14: 10.5.9 — a boolean, false is false, read-only fixed and no setter; PutValue throws only in strict code, Object.assign — Set with Throw; Receiver: the parent [[Set]], the descriptor and CreateDataProperty of the Receiver');
  check(inOrder(f(`${PX}-ownpropertykeys`), ['Let trapResult be ? CreateListFromArrayLike (trapResultArray, property-key)', 'If trapResult contains any duplicate entries, throw a TypeError exception',
    'If extensibleTarget is true and targetNonconfigurableKeys is empty, then Return trapResult', 'If uncheckedResultKeys does not contain key, throw a TypeError exception', 'If extensibleTarget is true, return trapResult',
    'If uncheckedResultKeys is not empty, throw a TypeError exception'])
    && f('sec-createlistfromarraylike').includes('property-key')
    && hasAll(f('sec-enumerableownproperties'), ['Let ownKeys be ? O. [[OwnPropertyKeys]] ()', 'Let desc be ? O. [[GetOwnProperty]] (key). If desc is not undefined and desc. [[Enumerable]] is true, then']),
  'lecture 10: 10.5.11 — CreateListFromArrayLike of property keys, no duplicates, all non-configurable keys, exactly the keys of a non-extensible target; Object.keys drops a key without an enumerable descriptor');
  check(f(`${PX}-call-thisargument-argumentslist`).includes('Let argArray be CreateArrayFromList (argumentsList). Return ? Call (trap, handler, «target, thisArgument, argArray»)')
    && f(`${PX}-call-thisargument-argumentslist`).includes('A Proxy exotic object only has a [[Call]] internal method if the initial value of its [[ProxyTarget]] internal slot is an object that has a [[Call]] internal method')
    && f(`${PX}-construct-argumentslist-newtarget`).includes('Let newObj be ? Call (trap, handler, «target, argArray, newTarget»). If newObj is not an Object, throw a TypeError exception')
    && inOrder(f('sec-super-keyword-runtime-semantics-evaluation'), ['Let newTarget be GetNewTarget ()', 'Let result be ? Construct (func, argList, newTarget)', 'Perform ? InitializeInstanceElements (result, F)']),
  'lecture 12: [[Call]] — the arguments as an array, only for a callable target; [[Construct]] — an object; super() passes the newTarget of the subclass and puts its fields on what it got');
  check(inOrder(f('sec-proxycreate'), ['If target is not an Object, throw a TypeError exception', 'If handler is not an Object, throw a TypeError exception', 'Let P be MakeBasicObject («[[ProxyHandler]], [[ProxyTarget]]»)',
    'If IsCallable (target) is true, then Set P. [[Call]] as specified in 10.5.12', 'If IsConstructor (target) is true, then Set P. [[Construct]] as specified in 10.5.13', 'Set P. [[ProxyTarget]] to target. Set P. [[ProxyHandler]] to handler'])
    && f('sec-proxy-constructor').includes('is not intended to be called as a function and will throw an exception when called in that manner')
    && f('sec-proxy-target-handler').includes('If NewTarget is undefined, throw a TypeError exception. Return ? ProxyCreate (target, handler)')
    && f('sec-properties-of-the-proxy-constructor').includes('does not have a "prototype" property because Proxy objects do not have a [[Prototype]] internal slot that requires initialization')
    && f('sec-isarray').includes('If argument is a Proxy exotic object, then Perform ? ValidateNonRevokedProxy (argument). Let proxyTarget be argument. [[ProxyTarget]]. Return ? IsArray (proxyTarget)')
    && f('sec-typeof-operator-runtime-semantics-evaluation').includes('has a [[Call]] internal method, return "function"'),
  'lecture 2, 15: ProxyCreate — objects only, [[Call]] and [[Construct]] by the target; Proxy without new — TypeError; no prototype (28.2.2); IsArray looks through a proxy; typeof looks at [[Call]]');
  check(inOrder(f('sec-proxy.revocable'), ['Let proxy be ? ProxyCreate (target, handler)', 'If p is null, return NormalCompletion (undefined). Set F. [[RevocableProxy]] to null', 'Set p. [[ProxyTarget]] to null. Set p. [[ProxyHandler]] to null',
    'Let revoker be CreateBuiltinFunction (revokerClosure, 0, "", «[[RevocableProxy]]»)', 'Perform ! CreateDataPropertyOrThrow (result, "proxy", proxy)', 'Perform ! CreateDataPropertyOrThrow (result, "revoke", revoker)'])
    && f('sec-getfunctionrealm').includes('If obj is a Proxy exotic object, then Perform ? ValidateNonRevokedProxy (obj)')
    && ['ArraySpeciesCreate', 'NewPromiseResolveThenableJob'].every((c) => callers('GetFunctionRealm').includes(c))
    && hasAll(f('sec-newpromiseresolvethenablejob'), ['If getThenRealmResult is a normal completion, let thenRealm be getThenRealmResult. [[Value]]. Else, let thenRealm be the current Realm Record',
      'When then. [[Callback]] is a revoked Proxy and no code runs, thenRealm is used to create error objects']),
  'lecture 15: Proxy.revocable — ProxyCreate, revoke of length 0 and no name with [[RevocableProxy]], a second call does nothing, both slots null; GetFunctionRealm of a revoked proxy throws; ArraySpeciesCreate and the thenable job call it, the job takes the current realm');
  check(f('sec-toprimitive').includes('Let exoticToPrim be ? GetMethod (input, %Symbol.toPrimitive%)')
    && inOrder(f('sec-serializejsonproperty'), ['Let toJSON be ? GetV (value, "toJSON")', 'If IsCallable (toJSON) is true'])
    && f('sec-array.prototype.includes').includes('SameValueZero (searchElement, elementK) is true, return true')
    && inOrder(f('sec-set.prototype.has'), ['CanonicalizeKeyedCollectionKey (value)', 'SameValue (e, value) is true, return true'])
    && f('sec-weakmap.prototype.get').includes('SameValue (p. [[Key]], key) is true, return p')
    && f('sec-ordinaryhasproperty').includes('Let hasOwn be ? O. [[GetOwnProperty]] (P). If hasOwn is not undefined, return true')
    && f('sec-ordinaryhasinstance').includes('Set O to ? O. [[GetPrototypeOf]] ()') && f('sec-object.prototype.isprototypeof').includes('Repeat, Set V to ? V. [[GetPrototypeOf]] ()'),
  'lecture 5, 6, 9, 13: ToPrimitive — GetMethod (0 throws); JSON — GetV toJSON, called only if callable; includes, Set and WeakMap compare by SameValueZero and SameValue; [[HasProperty]] — own first; instanceof and isPrototypeOf go by [[GetPrototypeOf]]');

  // what the tasks say about the text of ECMA-262 2026
  {
    const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
    check(f('sec-object.hasown').includes('Return ? HasOwnProperty (obj, key)') && f('sec-hasownproperty').includes('Let desc be ? O. [[GetOwnProperty]] (P)')
      && f('sec-object.entries').includes('EnumerableOwnProperties (obj, key+value)') && inOrder(f('sec-enumerableownproperties'), ['Let ownKeys be ? O. [[OwnPropertyKeys]] ()', 'Let desc be ? O. [[GetOwnProperty]] (key)', 'Let value be ? Get (O, key)'])
      && inOrder(f('sec-ordinaryhasproperty'), ['Let hasOwn be ? O. [[GetOwnProperty]] (P). If hasOwn is not undefined, return true', 'Return ? parent. [[HasProperty]] (P)'])
      && f('sec-object.isfrozen').includes('Return ? TestIntegrityLevel (O, frozen)')
      && inOrder(f('sec-testintegritylevel'), ['Let extensible be ? IsExtensible (O). If extensible is true, return false', 'Let keys be ? O. [[OwnPropertyKeys]] ()', 'Let currentDesc be ? O. [[GetOwnProperty]] (k)']),
    'task 3: hasOwn — HasOwnProperty, [[GetOwnProperty]]; entries — EnumerableOwnProperties: keys, descriptors, Get; in — OrdinaryHasProperty asks the parent; isFrozen — TestIntegrityLevel stops at an extensible object');
    check(inOrder(f('sec-ordinarysetwithowndescriptor'), ['Return ? CreateDataProperty (Receiver, P, V)', 'Let valueDesc be the PropertyDescriptor { [[Value]] : V }. Return ? Receiver. [[DefineOwnProperty]] (P, valueDesc)']),
      'task 4: OrdinarySetWithOwnDescriptor — a new key: CreateDataProperty on the Receiver, an existing one: [[DefineOwnProperty]] with { [[Value]] } only');
    check(inOrder(f(`${PX}-defineownproperty-p-desc`), ['If Desc has a [[Configurable]] field and Desc. [[Configurable]] is false, then Let settingConfigFalse be true',
      'If targetDesc is undefined, then If extensibleTarget is false, throw a TypeError exception. If settingConfigFalse is true, throw a TypeError exception',
      'If IsCompatiblePropertyDescriptor (extensibleTarget, Desc, targetDesc) is false, throw a TypeError exception',
      'If settingConfigFalse is true and targetDesc. [[Configurable]] is true, throw a TypeError exception',
      'If IsDataDescriptor (targetDesc) is true, targetDesc. [[Configurable]] is false, and targetDesc. [[Writable]] is true, then If Desc has a [[Writable]] field and Desc. [[Writable]] is false, throw a TypeError exception']),
    'task 9: 10.5.6 — settingConfigFalse only if Desc has the field; a new key on a non-extensible target; incompatible; non-configurable over configurable; non-writable over a fixed writable');
    check(num('sec-promise-resolve-functions') === '27.2.1.3' && f('sec-promise-resolve-functions').includes('CreateResolvingFunctions')
      && f('sec-promise-resolve-functions').includes('Let then be Completion (Get (resolution, "then")). If then is an abrupt completion, then Perform RejectPromise (promise, then. [[Value]])'),
    'task 7: CreateResolvingFunctions (27.2.1.3) — resolve asks then and rejects the promise if the question throws');
    const tasks = fs.readFileSync(path.join(DAY, 'tasks.html'), 'utf8');
    check([['getownproperty-p', '10.5.5'], ['defineownproperty-p-desc', '10.5.6'], ['get-p-receiver', '10.5.8'], ['ownpropertykeys', '10.5.11']].every(([id, n]) => num(`${PX}-${id}`) === n)
      && [...tasks.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].every((m) => spec.includes(`id="${m[1]}"`)),
    'tasks: the numbers 10.5.5, 10.5.6, 10.5.8, 10.5.11 are those of the 2026 text, every tc39.es anchor exists');
  }

  // the MDN pages of the plan and what the lecture says about them
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const G = 'reference/global_objects/proxy';
  const pages = ['guide/meta_programming', G, `${G}/proxy`, `${G}/revocable`, ...['apply', 'construct', 'defineproperty', 'deleteproperty', 'get', 'getownpropertydescriptor', 'getprototypeof', 'has', 'isextensible', 'ownkeys', 'preventextensions', 'set', 'setprototypeof'].map((t) => `${G}/proxy/${t}`)];
  check(pages.length === 17 && pages.every((p) => mdn(p).startsWith('---\ntitle:')), 'MDN: the 17 pages of the plan are in the cache');
  {
    const meta = mdn('guide/meta_programming');
    const proxy = mdn(G);
    check(meta.includes('### Terminology') && hasAll(meta, ['handler', 'traps', 'target', 'invariants']) && meta.includes('## Revocable `Proxy`')
      && proxy.includes('### No private field forwarding') && proxy.includes('return value.apply(this === receiver ? target : this, args);')
      && mdn(`${G}/proxy`).includes('### Handler functions') && mdn(`${G}/revocable`).includes('calling `revoke()` again has no effect')
      && mdn(`${G}/proxy/get`).includes('Property access: `proxy[foo]` and `proxy.bar`') && hasAll(mdn(`${G}/proxy/ownkeys`), ['{{jsxref("Object.keys()")}}', '{{jsxref("Object.getOwnPropertyNames()")}}']),
    'lecture 1, 5, 15: MDN — the terms of the guide, the example «No private field forwarding» and its wrapper, handler functions, a second revoke() does nothing, what get and ownKeys intercept');
    // the notes: homework 4 quotes «Return value» of handler.set(); the answer — Object.assign throws on false even in
    // sloppy code (Set with Throw = true, checked above: assign.html and 7.3.4)
    const plain = (md) => md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\{\{jsxref\("([^"]+)"\)\}\}/g, '$1');
    const setMd = plain(mdn(`${G}/proxy/set`));
    check(setMd.includes('### Return value') && setMd.includes('Many operations, including using property accessors in strict mode, throw a TypeError if the `[[Set]]` internal method returns `false`.')
      && !setMd.includes('Object.assign'),
    'student homework 4: MDN handler.set() «Return value» — many operations, strict assignment among them, throw on false; Object.assign is not named there');
    const notes = fs.readFileSync(path.join(DAY, 'student.html'), 'utf8');
    const footer = notes.slice(notes.indexOf('<div class="sources">'));
    check(['(Proxy,', 'handler.get()', 'handler.set()', 'handler.ownKeys()', 'handler.construct()', 'Proxy.revocable()'].every((s) => footer.includes(s))
      && [G, `${G}/proxy/get`, `${G}/proxy/set`, `${G}/proxy/ownkeys`, `${G}/proxy/construct`, `${G}/revocable`].every((p) => pages.includes(p)),
    'student: the MDN pages of the footer are pages of the plan, in the cache');
    const tasksHtml = fs.readFileSync(path.join(DAY, 'tasks.html'), 'utf8');
    const tasksFooter = tasksHtml.slice(tasksHtml.indexOf('<div class="sources">'));
    check(['(Proxy,', 'handler.set()', 'handler.defineProperty()', 'handler.ownKeys()', 'handler.getOwnPropertyDescriptor()', 'handler.apply()', 'Proxy.revocable()'].every((s) => tasksFooter.includes(s))
      && [`${G}/proxy/defineproperty`, `${G}/proxy/getownpropertydescriptor`, `${G}/proxy/apply`].every((p) => pages.includes(p)),
    'tasks: the MDN pages of the footer are pages of the plan, in the cache');
  }

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(hasAll(read('advanced/day-04/lecture.html'), ['Таблица 4', '6.1.7.3', 'Proxy перехватывает ровно эти вызовы', 'Map.prototype.get called on incompatible receiver'])
    && hasAll(read('advanced/day-05/lecture.html'), ['ToPrimitive', 'SameValueZero']) && hasAll(read('advanced/day-07/lecture.html'), ['OrdinaryHasInstance', 'Object.assign'])
    && read('advanced/day-09/lecture.html').includes('IsArray') && read('advanced/day-09/tasks.html').includes('отозванный прокси (день 16)')
    && read('advanced/day-11/lecture.html').includes('EnumerateObjectProperties')
    && hasAll(read('advanced/day-14/lecture.html'), ['Увидеть каждый', 'OrdinarySetWithOwnDescriptor', 'Receiver', '13.3.7.1']) && read('advanced/day-14/tasks.html').includes('инварианты Proxy, день 16')
    && read('advanced/day-15/lecture.html').includes('ArraySpeciesCreate') && read('advanced/day-15/tasks.html').includes('4. Своя связанная функция')
    && read('advanced/day-15/lecture.html').includes('[[DefineOwnProperty]] (10.4.3.2)'),
  'lecture: course 3 — table 4, 6.1.7.3, the promise, the Map error (day 4); ToPrimitive, SameValueZero (5); OrdinaryHasInstance, Object.assign (7); IsArray and the task (9); for-in (11); the promise of the table, Receiver, SuperCall, the hint of task 4 (14); ArraySpeciesCreate, task 4, 10.4.3.2 (15)');
  check(hasAll(read('intermediate/day-16/lecture.html'), ['addMark(mark) {', 'throw new RangeError']),
    'lecture 8: course 2 — the journal of day 16 checks a mark in the method addMark');
  {
    const plan = read('docs/plan-3-advanced.md');
    const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
    const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
    check(plan.includes('**17. Reflect и встроенные символы.**') && plan.includes('**16. Proxy: ловушки и инварианты.**'), 'lecture: the days it names — Reflect 17');

    // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
    const lecture = read('advanced/day-16/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const MDN = 'https://developer.mozilla.org/en-US/docs/';
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '16').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '16').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 19 && mdnRows.length === 17 && refSpec.length === 19 && refMdn.length === 17 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 16, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '16' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '16' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 4 && fullMdn.length === 11 && JSON.stringify(fullSpec) === JSON.stringify(markedSpec) && JSON.stringify(fullMdn) === JSON.stringify(markedMdn),
      `plan: the 15 rows "подробно" (4 of ECMA-262, 11 of MDN) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    check(lecture.includes(`${MDN}Web/JavaScript/Guide/Meta_programming`), 'links: the guide of MDN is linked in the text');
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
