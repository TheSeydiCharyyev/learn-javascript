// Course 3, day 17, in Chrome: Reflect and the well-known symbols. Every <pre class="code js"> block of the lecture runs
// as the only <script> in the <body> of a clean page (one block appends an iframe), the way a student would paste it
// into a file. Console output is rebuilt from Chrome's preview objects, as DevTools prints it; an uncaught error is
// printed as "Uncaught TypeError: …". The context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-17.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-17.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block of the notes prints what the comments of its
// console.log lines say, the table of Symbol.keyFor holds, and the homework (1–4 in Chrome, 4 also in the text of
// MDN); the cheatsheet runs without an error; the experiments
// the lecture only tells about (the flags and length of all 13 functions of Reflect and its tag; apply without an
// array; Array.of creates through this; with and Symbol.unscopables, and a non-null prototype that hides toString —
// the run may use what the lecture may not; includes, startsWith, endsWith and matchAll refuse a RegExp; the flags of
// the well-known symbols on Symbol; the flags of the toPrimitive methods of Date and Symbol); what the lecture says
// about the text of ECMA-262 2026 (chapter 28, 20.4 and the algorithms that ask the well-known symbols) is checked
// against tools/.cache/ecma262-2026.html; the MDN pages of the plan are in tools/.cache/mdn-content.git and say what
// the lecture says; the days it points to say what it says; the reference table holds all 51 rows of the day's plan
// (22 of ECMA-262, 29 of MDN) as links with their marks and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-17');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
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
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

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
// the number of the step whose own text holds the words, as the spec writes it: 1, a, i, 1, a, i, …
const stepPath = (html, needle) => {
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const fmt = (p) => p.map((n, i) => (i % 3 === 0 ? n : i % 3 === 1 ? String.fromCharCode(96 + n) : roman[n - 1])).join('.');
  const re = /<(\/?)(ol|li)\b[^>]*>/g;
  let depth = -1;
  const counts = [], cur = [];
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === 'ol') { if (m[1]) depth--; else { depth++; counts[depth] = 0; } continue; }
    if (m[1]) continue;
    counts[depth]++; cur[depth] = counts[depth]; cur.length = depth + 1;
    const rest = html.slice(re.lastIndex);
    if (flat(rest.slice(0, rest.search(/<ol\b|<\/li>/))).includes(needle)) return fmt(cur);
  }
  return null;
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
      };
    }));
    await src.close();
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const first = blk.code.split('\n')[0];
      const out = await runScript(ctx, blk.code, `${name}-${i}.html`);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(out.length === 0, `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (name === 'student') check(same(out, commented(blk.code)), `${name} #${i}: output = comments ${JSON.stringify(out)}`);
      else if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: no result-box`);
    }
  }

  // what the lecture only tells about (probe d17_told.txt before writing)
  const told = async (code, want, text, file) => { const out = await runScript(ctx, code, file); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  await told(`const names = Object.getOwnPropertyNames(Reflect);
const flags = names.map((n) => { const d = Object.getOwnPropertyDescriptor(Reflect, n); return [n, d.writable, d.enumerable, d.configurable, Reflect[n].length].join(":"); });
const t = Object.getOwnPropertyDescriptor(Reflect, Symbol.toStringTag);
console.log(names.length, flags.every((f) => f.includes(":true:false:true:")), flags.map((f) => f.split(":")[0] + f.split(":")[4]).join(" "));
console.log(t.value, t.writable, t.enumerable, t.configurable);`,
  ['13 true defineProperty3 deleteProperty2 apply3 construct2 get2 getOwnPropertyDescriptor2 getPrototypeOf1 has2 isExtensible1 ownKeys1 preventExtensions1 set3 setPrototypeOf2', 'Reflect false false true'],
  'lecture 1: all 13 functions of Reflect are writable and configurable, not enumerable; get, construct and set have length one less; the tag "Reflect" is read-only and configurable', 'reflect-flags.html');
  await told(`function f() { return arguments.length; }
console.log(f.apply(null), f.apply(null, null), f.apply(null, undefined));`, ['0 0 0'],
  'lecture 6: Function.prototype.apply without an array calls the function without arguments', 'apply-null.html');
  await told(`function F() {}
const made = Array.of.call(F, 1, 2);
console.log(made.constructor.name, made.length, made[1], Array.isArray(made));`, ['F 2 2 false'],
  'lecture 11: Array.of creates through this, any constructor — no species', 'of-this.html');
  await told(`var keys = "внешняя";
const arr = [1];
with (arr) { console.log(keys, typeof push, typeof includes); }
const o = { toString() { return "свой"; }, [Symbol.unscopables]: {} };
const n = { toString() { return "свой"; }, [Symbol.unscopables]: Object.create(null) };
with (o) { console.log(toString === o.toString); }
with (n) { console.log(toString === n.toString); }`, ['внешняя function undefined', 'false', 'true'],
  'lecture 14: inside with (array) keys and includes are unscopable, push is seen; an unscopables object with Object.prototype hides toString too (MDN), a null-prototype one does not', 'unscopables.html');
  await told(`${RUN}console.log(run(() => "kitap".startsWith(/k/)));
console.log(run(() => "kitap".endsWith(/p/)));
console.log(run(() => "kitap".matchAll(/a/)));
console.log([..."kitap".matchAll(/a/g)].length);`,
  ['TypeError: First argument to String.prototype.startsWith must not be a regular expression', 'TypeError: First argument to String.prototype.endsWith must not be a regular expression',
    'TypeError: String.prototype.matchAll called with a non-global RegExp argument', '1'],
  'lecture 13: startsWith and endsWith refuse a RegExp like includes, matchAll needs the flag g like replaceAll', 'regexp-refuse.html');
  await told(`const wk = Object.getOwnPropertyNames(Symbol).filter((k) => typeof Symbol[k] === "symbol");
console.log(wk.length, wk.every((k) => { const d = Object.getOwnPropertyDescriptor(Symbol, k); return !d.writable && !d.enumerable && !d.configurable; }));
const fd = Object.getOwnPropertyDescriptor(Symbol, "for");
console.log(fd.writable, fd.enumerable, fd.configurable, Object.getPrototypeOf(Symbol) === Function.prototype);`, ['15 true', 'true false true true'],
  'lecture 8, 15: every well-known symbol on Symbol is read-only and fixed (15 in Chrome), Symbol.for is an ordinary method, Symbol inherits Function.prototype', 'symbol-flags.html');
  await told(`const d = Object.getOwnPropertyDescriptor(Date.prototype, Symbol.toPrimitive);
const st = Object.getOwnPropertyDescriptor(Symbol.prototype, Symbol.toStringTag);
console.log(d.writable, d.configurable, d.value.name, st.value, st.writable, st.configurable);`, ['false true [Symbol.toPrimitive] Symbol false true'],
  'lecture 9, 15: Date.prototype[Symbol.toPrimitive] is read-only but configurable; the tag of Symbol.prototype is "Symbol"', 'toprim-flags.html');
  // the notes: the table of Symbol.keyFor and the homework, in Chrome (probe d17_student.txt before writing)
  await told(`${RUN}console.log(Symbol.keyFor(Symbol("x")), Symbol.keyFor(Symbol.for("x")), Symbol.keyFor(Symbol.iterator), run(() => Symbol.keyFor(Object(Symbol.for("x")))));`,
    ['undefined x undefined TypeError: [object Symbol] is not a symbol'], 'student table 3: keyFor — undefined for Symbol("x") and a well-known symbol, "x" from the registry, a wrapper is not a symbol', 'student-keyfor.html');
  await told(`${RUN}const base = { n: 1, get v() { return this.n; } };
const p = new Proxy(base, { get(t, k, r) { return Reflect.get(t, k, r); } });
const kid = Object.create(p);
kid.n = 2;
const q = new Proxy(base, { get(t, k) { return Reflect.get(t, k); } });
const kid2 = Object.create(q);
kid2.n = 2;
console.log(kid.v, p.v, kid2.v);
class A { static [Symbol.toStringTag] = "Класс"; get [Symbol.toStringTag]() { return "Экземпляр"; } }
console.log(String(new A()), Object.prototype.toString.call(A), Object.prototype.toString.call(A.prototype));
class D extends Array { static get [Symbol.species]() { return undefined; } }
class E extends Array { static get [Symbol.species]() { return 1; } }
console.log(D.from([1, 2]).map((x) => x) instanceof D, D.from([1, 2]).map((x) => x) instanceof Array, D.of(1) instanceof D, run(() => E.from([1]).map((x) => x)));`,
  ['2 1 1', '[object Экземпляр] [object Класс] [object Экземпляр]', 'false true true TypeError: object.constructor[Symbol.species] is not a constructor'],
  'student homework 1–3: Reflect.get with receiver gives the getter the child, without it the target; the static tag names the class, the getter — instances and the prototype; species undefined — Array, of — D, species 1 — TypeError', 'student-homework.html');
  await told(`${RUN}class Card { constructor(w) { this.w = w; } }
class Other {}
console.log(run(() => Card.apply(Object.create(Other.prototype), ["kitap"])), Reflect.construct(Card, ["kitap"], Other).w);
function OneClass() { this.nt = new.target; }
const o2 = Object.create(Object.prototype); OneClass.apply(o2, []);
console.log(o2.nt, Reflect.construct(OneClass, [], Other).nt === Other);`,
  ['TypeError: Class constructor Card cannot be invoked without \'new\' kitap', 'undefined true'],
  'student homework 4: Object.create and apply — new.target undefined for a function, a class cannot be called at all; Reflect.construct works for both', 'student-homework4.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const ATTR = (w, e, c) => `This property has the attributes { [[Writable]] : ${w}, [[Enumerable]] : ${e}, [[Configurable]] : ${c} }`;

  {
    const ownLi = (clause(spec, 'sec-reflect-object').match(/<li>/g) || []).length;
    check(num('sec-reflection') === '28' && num('sec-reflect-object') === '28.1' && num('sec-proxy-objects') === '28.2' && num('sec-module-namespace-objects') === '28.3'
      && ownLi === 7 && hasAll(f('sec-reflect-object'), ['is %Reflect%', 'is the initial value of the "Reflect" property of the global object', 'is an ordinary object',
        'has a [[Prototype]] internal slot whose value is %Object.prototype%', 'is not a function object', 'does not have a [[Construct]] internal method', 'does not have a [[Call]] internal method'])
      && f('sec-reflect-%symbol.tostringtag%').includes('is the String value "Reflect"') && f('sec-reflect-%symbol.tostringtag%').includes(ATTR('false', 'false', 'true')),
    'lecture 1: chapter 28 — 28.1 Reflect, 28.2 Proxy, 28.3 namespace; 28.1 in seven points: %Reflect%, global, ordinary, %Object.prototype%, not a function, no [[Construct]], no [[Call]]; 28.1.14 — "Reflect", read-only, configurable');
  }
  {
    const calls = [['defineproperty', 'Return ? target. [[DefineOwnProperty]] (key, desc)'], ['deleteproperty', 'Return ? target. [[Delete]] (key)'], ['get', 'Return ? target. [[Get]] (key, receiver)'],
      ['getownpropertydescriptor', 'Let desc be ? target. [[GetOwnProperty]] (key)'], ['getprototypeof', 'Return ? target. [[GetPrototypeOf]] ()'], ['has', 'Return ? target. [[HasProperty]] (key)'],
      ['isextensible', 'Return ? target. [[IsExtensible]] ()'], ['ownkeys', 'Let keys be ? target. [[OwnPropertyKeys]] ()'], ['preventextensions', 'Return ? target. [[PreventExtensions]] ()'],
      ['set', 'Return ? target. [[Set]] (key, V, receiver)'], ['setprototypeof', 'Return ? target. [[SetPrototypeOf]] (proto)']];
    const wrong = calls.filter(([id, call]) => !inOrder(f(`sec-reflect.${id}`), ['If target is not an Object, throw a TypeError exception', call]));
    const numbers = calls.map(([id]) => num(`sec-reflect.${id}`));
    check(wrong.length === 0 && numbers[0] === '28.1.3' && numbers[numbers.length - 1] === '28.1.13'
      && ['get', 'set'].every((id) => f(`sec-reflect.${id}`).includes('If receiver is not present, then Set receiver to target'))
      && f('sec-reflect.ownkeys').includes('Return CreateArrayFromList (keys)'),
    `lecture 1–4: 28.1.3–28.1.13 begin with «If target is not an Object, throw a TypeError exception» and call the internal method of the target; get and set default receiver to the target; ownKeys — CreateArrayFromList ${wrong.map((w) => w[0]).join(', ')}`);
  }
  check(inOrder(f('sec-reflect.apply'), ['If IsCallable (target) is false, throw a TypeError exception', 'Let args be ? CreateListFromArrayLike (argumentsList)', 'Return ? Call (target, thisArgument, args)'])
    && inOrder(f('sec-reflect.construct'), ['If IsConstructor (target) is false, throw a TypeError exception', 'If newTarget is not present, set newTarget to target', 'Else if IsConstructor (newTarget) is false, throw a TypeError exception',
      'Let args be ? CreateListFromArrayLike (argumentsList)', 'Return ? Construct (target, args, newTarget)'])
    && f('sec-createlistfromarraylike').includes('If obj is not an Object, throw a TypeError exception')
    && f('sec-function.prototype.apply').includes('If argArray is either undefined or null, then Perform PrepareForTailCall (). Return ? Call (func, thisArg)')
    && f('sec-ordinarycreatefromconstructor').includes('GetPrototypeFromConstructor (constructor, intrinsicDefaultProto)') && f('sec-getprototypefromconstructor').includes('Let proto be ? Get (constructor, "prototype")'),
  'lecture 6, 7: Reflect.apply — callable, CreateListFromArrayLike (an object), Call; Reflect.construct — two constructors, newTarget defaults to the target; Function.prototype.apply with undefined or null — no arguments; the prototype comes from newTarget');
  check(f('sec-object.defineproperty').includes('Perform ? DefinePropertyOrThrow (O, key, desc)') && f('sec-definepropertyorthrow').includes('Let success be ? O. [[DefineOwnProperty]] (P, desc). If success is false, throw a TypeError exception')
    && f('sec-object.getprototypeof').includes('Let obj be ? ToObject (O). Return ? obj. [[GetPrototypeOf]] ()') && f('sec-object.isextensible').includes('If O is not an Object, return false')
    && inOrder(f('sec-ordinaryownpropertykeys'), ['such that P is an array index, in ascending numeric index order', 'such that P is a String and P is not an array index, in ascending chronological order of property creation',
      'such that P is a Symbol, in ascending chronological order of property creation'])
    && f('sec-ordinarysetwithowndescriptor').includes('If ownDesc. [[Writable]] is false, return false. If Receiver is not an Object, return false'),
  'lecture 2–4: Object.defineProperty — DefinePropertyOrThrow turns false into TypeError; Object.getPrototypeOf — ToObject; Object.isExtensible of a primitive — false; OrdinaryOwnPropertyKeys — indices, strings, symbols; OrdinarySetWithOwnDescriptor — read-only or a primitive Receiver: false');
  {
    const table = f('sec-well-known-symbols');
    const rows = (table.match(/%Symbol\.\w+% "Symbol\.\w+"/g) || []).length;
    const wellKnown = ['asynciterator', 'hasinstance', 'isconcatspreadable', 'iterator', 'match', 'matchall', 'replace', 'search', 'species', 'split', 'toprimitive', 'tostringtag', 'unscopables'];
    check(rows === 13 && hasAll(table, ['Unless otherwise specified, well-known symbols values are shared by all realms', 'Previous editions of this specification used a notation of the form @@name'])
      && wellKnown.every((id) => f(`sec-symbol.${id}`).includes(ATTR('false', 'false', 'false')))
      && f('sec-symbol.for').includes('It is shared by all realms') && inOrder(f('sec-keyforsymbol'), ['If SameValue (e. [[Symbol]], sym) is true, return e. [[Key]]', 'Return undefined']),
    `lecture 8: 6.1.5.1 — table 1 has ${rows} symbols, shared by all realms, @@ in old texts; the 13 properties of Symbol are read-only and fixed; the registry is shared by all realms, KeyForSymbol — undefined when not in it`);
  }
  check(inOrder(f('sec-toprimitive'), ['Let exoticToPrim be ? GetMethod (input, %Symbol.toPrimitive%)', 'Let hint be "default"', 'Let result be ? Call (exoticToPrim, input, «hint»)', 'If result is not an Object, return result. Throw a TypeError exception',
    'Of the objects defined in this specification only Dates (see 21.4.4.45) and Symbol objects (see 20.4.3.5) over-ride the default ToPrimitive behaviour. Dates treat the absence of a hint as if the hint were string'])
    && stepPath(clause(spec, 'sec-toprimitive'), 'Throw a TypeError exception') === '1.b.vi'
    && inOrder(f('sec-date.prototype-%symbol.toprimitive%'), ['If hint is either "string" or "default", then Let tryFirst be string', 'Else if hint is "number", then Let tryFirst be number', 'Else, Throw a TypeError exception', 'Return ? OrdinaryToPrimitive (O, tryFirst)', ATTR('false', 'false', 'true')])
    && hasAll(f('sec-symbol.prototype-%symbol.toprimitive%'), ['Return ? ThisSymbolValue (this value)', 'The argument is ignored', ATTR('false', 'false', 'true')])
    && num('sec-date.prototype-%symbol.toprimitive%') === '21.4.4.45' && num('sec-symbol.prototype-%symbol.toprimitive%') === '20.4.3.5',
  'lecture 9: ToPrimitive — GetMethod, "default", the result must be a primitive (TypeError of step 1.b.vi), the note: only Dates and Symbol objects, dates take no hint as string; 21.4.4.45 and 20.4.3.5 — order by hint, the hint ignored, read-only and configurable');
  {
    const tags = [['sec-map.prototype-%symbol.tostringtag%', 'Map'], ['sec-promise.prototype-%symbol.tostringtag%', 'Promise'], ['sec-math-%symbol.tostringtag%', 'Math'], ['sec-json-%symbol.tostringtag%', 'JSON'],
      ['sec-symbol.prototype-%symbol.tostringtag%', 'Symbol'], ['sec-generator.prototype-%symbol.tostringtag%', 'Generator'], ['sec-bigint.prototype-%symbol.tostringtag%', 'BigInt']];
    const missing = tags.filter(([id, t]) => !f(id).includes(`is the String value "${t}"`)).map((x) => x[1]);
    check(inOrder(f('sec-object.prototype.tostring'), ['let builtinTag be "Array"', '"Arguments"', '"Function"', '"Error"', '"Boolean"', '"Number"', '"String"', '"Date"', '"RegExp"', 'let builtinTag be "Object"',
      'Let tag be ? Get (O, %Symbol.toStringTag%). If tag is not a String, set tag to builtinTag', 'It does not provide a reliable type testing mechanism'])
      && missing.length === 0 && num('sec-object.prototype.tostring') === '20.1.3.6',
    `lecture 10: 20.1.3.6 — the tags by slots in this order, then the string of %Symbol.toStringTag%, the note «does not provide a reliable type testing mechanism»; built-in tags Map, Promise, Math, JSON, Symbol, Generator, BigInt ${missing.join(', ')}`);
  }
  check(hasAll(f('sec-get-array-%symbol.species%'), ['Return the this value', 'is "get [Symbol.species]"']) && num('sec-get-array-%symbol.species%') === '23.1.2.6'
    && f('sec-arrayspeciescreate').includes('Set C to ? Get (C, %Symbol.species%). If C is null, set C to undefined')
    && inOrder(f('sec-speciesconstructor'), ['Let C be ? Get (O, "constructor")', 'If C is undefined, return defaultConstructor', 'Let S be ? Get (C, %Symbol.species%). If S is either undefined or null, return defaultConstructor'])
    && ['sec-promise.prototype.then', 'sec-promise.prototype.finally'].every((id) => f(id).includes('Let C be ? SpeciesConstructor (promise, %Promise%)'))
    && f('sec-array.of').includes('Let C be the this value. If IsConstructor (C) is true, then Let A be ? Construct (C, «lenNumber»)') && f('sec-array.from').includes('Let C be the this value'),
  'lecture 11: Array[Symbol.species] returns this; ArraySpeciesCreate and SpeciesConstructor read species, null — the default; then and finally — SpeciesConstructor; Array.of and Array.from create through this');
  check(inOrder(f('sec-instanceofoperator'), ['If target is not an Object, throw a TypeError exception', 'Let instOfHandler be ? GetMethod (target, %Symbol.hasInstance%)', 'Return ToBoolean (? Call (instOfHandler, target, «V»))',
    'If IsCallable (target) is false, throw a TypeError exception', 'Return ? OrdinaryHasInstance (target, V)'])
    && hasAll(f('sec-function.prototype-%symbol.hasinstance%'), ['Return ? OrdinaryHasInstance (F, V)', ATTR('false', 'false', 'false'), 'to prevent tampering that could be used to globally expose the target function of a bound function'])
    && num('sec-instanceofoperator') === '13.10.2' && num('sec-function.prototype-%symbol.hasinstance%') === '20.2.3.6',
  'lecture 12: 13.10.2 — not an object: TypeError, the method before IsCallable, ToBoolean, else OrdinaryHasInstance; 20.2.3.6 — read-only and fixed, so that the target of a bound function is not exposed');
  check(inOrder(f('sec-isregexp'), ['Let matcher be ? Get (argument, %Symbol.match%). If matcher is not undefined, return ToBoolean (matcher)', 'If argument has a [[RegExpMatcher]] internal slot, return true'])
    && inOrder(f('sec-regexp-pattern-flags'), ['Let patternIsRegExp be ? IsRegExp (pattern)', 'If patternIsRegExp is true and flags is undefined, then Let patternConstructor be ? Get (pattern, "constructor"). If SameValue (newTarget, patternConstructor) is true, return pattern'])
    && ['includes', 'startswith', 'endswith'].every((m) => f(`sec-string.prototype.${m}`).includes('If isRegExp is true, throw a TypeError exception'))
    && ['replaceall', 'matchall'].every((m) => f(`sec-string.prototype.${m}`).includes('If ? ToString (flags) does not contain "g", throw a TypeError exception'))
    && ['sec-regexp.prototype-%symbol.match%', 'sec-regexp-prototype-%symbol.matchall%', 'sec-regexp.prototype-%symbol.replace%', 'sec-regexp.prototype-%symbol.search%', 'sec-regexp.prototype-%symbol.split%'].every((id) => spec.includes(`id="${id}"`))
    && num('sec-isregexp') === '7.2.6',
  'lecture 13: IsRegExp — %Symbol.match% first, then the slot; RegExp(pattern) returns pattern itself when IsRegExp and its constructor is RegExp; includes, startsWith, endsWith refuse; replaceAll and matchAll need g; five methods of RegExp.prototype');
  check(inOrder(f('sec-isconcatspreadable'), ['Let spreadable be ? Get (O, %Symbol.isConcatSpreadable%). If spreadable is not undefined, return ToBoolean (spreadable)', 'Return ? IsArray (O)'])
    && inOrder(f('sec-array.prototype-%symbol.unscopables%'), ['Let unscopableList be OrdinaryObjectCreate (null)', ...['at', 'copyWithin', 'entries', 'fill', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap', 'includes', 'keys', 'toReversed', 'toSorted', 'toSpliced', 'values'].map((k) => `(unscopableList, "${k}", true)`), ATTR('false', 'false', 'true')])
    && num('sec-isconcatspreadable') === '23.1.3.2.1' && num('sec-array.prototype-%symbol.unscopables%') === '23.1.3.41',
  'lecture 14: IsConcatSpreadable — the symbol, else IsArray; 23.1.3.41 — a null-prototype object with the 16 names in this order');
  check(hasAll(f('sec-symbol-constructor'), ['returns a new Symbol value when called as a function', 'is not intended to be used with the new operator', 'may be used as the value of an extends clause of a class definition but a super call to it will cause an exception'])
    && f('sec-symbol-description').includes('If NewTarget is not undefined, throw a TypeError exception')
    && f('sec-properties-of-the-symbol-prototype-object').includes('is not a Symbol instance and does not have a [[SymbolData]] internal slot')
    && f('sec-properties-of-symbol-instances').includes('Symbol instances have a [[SymbolData]] internal slot')
    && f('sec-symboldescriptivestring').includes('Return the string-concatenation of "Symbol(", desc, and ")"') && num('sec-keyforsymbol') === '20.4.5.1'
    && ['sec-symbol-objects', 'sec-symbol-constructor', 'sec-properties-of-the-symbol-constructor', 'sec-properties-of-the-symbol-prototype-object', 'sec-properties-of-symbol-instances', 'sec-abstract-operations-for-symbols'].map(num).join() === '20.4,20.4.1,20.4.2,20.4.3,20.4.4,20.4.5'
    && num('sec-symbol.for') === '20.4.2.2'
    && f('sec-islooselyequal').includes('or a Symbol') && f('sec-islooselyequal').includes('ToPrimitive (x), y)') && f('sec-topropertykey').includes('Let key be ? ToPrimitive (argument, string)')
    && f('sec-symbol-object').includes('4.4.33'),
  'lecture 15: 20.4.1 — a function call, no new, extends but super throws; 20.4.2–20.4.5 by their numbers; [[SymbolData]] only in instances; SymbolDescriptiveString; == and a property key go through ToPrimitive; 4.4.33 Symbol object');

  // the MDN pages of the plan and what the lecture says about them
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/global_objects/${p}/index.md`], { encoding: 'utf8' });
  const R = ['apply', 'construct', 'defineproperty', 'deleteproperty', 'get', 'getownpropertydescriptor', 'getprototypeof', 'has', 'isextensible', 'ownkeys', 'preventextensions', 'set', 'setprototypeof'];
  const S = ['hasinstance', 'isconcatspreadable', 'match', 'matchall', 'replace', 'search', 'species', 'split', 'symbol.toprimitive', 'toprimitive', 'tostringtag', 'unscopables'];
  const pages = ['array/symbol.species', 'array/symbol.unscopables', 'function/symbol.hasinstance', 'reflect', ...R.map((m) => `reflect/${m}`), ...S.map((s) => `symbol/${s}`)];
  check(pages.length === 29 && pages.every((p) => mdn(p).startsWith('---\ntitle:')), 'MDN: the 29 pages of the plan are in the cache');
  {
    const reflect = mdn('reflect');
    check(hasAll(reflect, ['The major use case of `Reflect` is to provide default forwarding behavior in `Proxy` handler traps', '{{jsxref("Reflect.construct()")}} is the only way to construct a target function with a specific [`new.target`]', 'just like the {{jsxref("Math")}} object'])
      && mdn('reflect/get').includes('The value of `this` provided for the call to `target` if a getter is encountered')
      && mdn('symbol/toprimitive').includes('### Modifying primitive values converted from an object') && mdn('symbol/tostringtag').includes('### Built-in toStringTag symbols')
      && mdn('symbol/species').includes('This specifies a protocol about how instances should be copied')
      && mdn('symbol/unscopables').includes('### Avoid using a non-null-prototype object as `[Symbol.unscopables]`')
      && hasAll(mdn('function/symbol.hasinstance'), ['non-configurable and non-writable', 'security feature'])
      && mdn('array/symbol.unscopables').includes('ignored for `with` statement-binding purposes'),
    'lecture 1, 4, 7, 9–14: MDN — Reflect like Math, «default forwarding behavior», «the only way to construct…»; receiver of Reflect.get; the examples of toPrimitive and toStringTag; species «a protocol…»; unscopables «Avoid using a non-null-prototype object»; hasInstance of Function.prototype fixed for security');
    // the notes: homework 4 quotes «Reflect.construct() vs. Object.create()»; MDN shows only functions, not a class
    const construct = mdn('reflect/construct');
    const section = construct.slice(construct.indexOf('### Reflect.construct() vs. Object.create()'), construct.indexOf('## Specifications'));
    check(section.includes('while the end result is the same') && section.includes('the `new.target` operator will point to `undefined`') && !/\bclass\s+\w/.test(section),
      'student homework 4: MDN «Reflect.construct() vs. Object.create()» — the end result is the same, new.target undefined; its examples are functions, no class');
    const notes = fs.readFileSync(path.join(DAY, 'student.html'), 'utf8');
    const footer = notes.slice(notes.indexOf('<div class="sources">'));
    check(['(Reflect,', 'Reflect.construct()', 'Reflect.get()', 'Symbol.toPrimitive', 'Symbol.toStringTag', 'Symbol.species', 'Symbol.hasInstance'].every((s) => footer.includes(s))
      && ['reflect', 'reflect/construct', 'reflect/get', 'symbol/toprimitive', 'symbol/tostringtag', 'symbol/species', 'symbol/hasinstance'].every((p) => pages.includes(p)),
    'student: the MDN pages of the footer are pages of the plan, in the cache');
  }

  // the days the lecture points to, read as text without tags (a phrase may hold <code>)
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const page = (p) => flat(read(p));
  check(page('advanced/day-01/lecture.html').includes('4.4.33 Symbol object')
    && hasAll(page('advanced/day-05/lecture.html'), ['ToPrimitive', 'IsLooselyEqual', 'Symbol.toPrimitive'])
    && hasAll(page('advanced/day-07/lecture.html'), ['DefinePropertyOrThrow', 'SpeciesConstructor', 'OrdinaryHasInstance', 'Symbol.species (день 17)'])
    && hasAll(page('advanced/day-09/lecture.html'), ['iframe', 'реалм'])
    && hasAll(page('advanced/day-14/lecture.html'), ['OrdinaryOwnPropertyKeys', 'OrdinarySetWithOwnDescriptor', 'OrdinaryCreateFromConstructor', 'Receiver', 'на остальное отвечает false'])
    && hasAll(page('advanced/day-15/lecture.html'), ['ArraySpeciesCreate', 'Symbol.species (день 17)', 'Object.prototype.toString']) && hasAll(page('advanced/day-15/tasks.html'), ['4. Своя связанная функция', 'Reflect (день 17)'])
    && hasAll(page('advanced/day-16/lecture.html'), ['Таблица 29', 'return t[key];', 'class BigCard extends Watched', 'const handler = new Proxy({}, { get(h, trap)', 'Reflect.get, день 17', 'Reflect.construct (день 17)']),
  'lecture: course 3 — 4.4.33 (day 1); ToPrimitive, IsLooselyEqual (5); DefinePropertyOrThrow, SpeciesConstructor, OrdinaryHasInstance (7); realms and iframe (9); the ordinary methods, Receiver, false (14); ArraySpeciesCreate, toString, task 4 (15); table 29, t[key], BigCard, the handler proxy, the promises (16)');
  check(hasAll(read('intermediate/day-11/lecture.html'), ['Symbol.hasInstance', 'Symbol.species']) && hasAll(read('intermediate/day-19/lecture.html'), ['re[Symbol.match] = false', '[Symbol.split]']),
    'lecture 8, 12, 13: course 2 — the well-known symbols (day 11), the methods of strings under symbols (day 19)');
  {
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    check(hasAll(plan, ['**17. Reflect и встроенные символы.**', '**18. Глобальный объект и стандартные встроенные объекты.**', '`length`, `name`, лишние аргументы', 'какие свойства `globalThis` даёт стандарт, а какие — хозяин',
      '**25. using, await using и DisposableStack.**', '**31. Наследие и совместимость: приложение B, with, устаревшие методы.**']),
    'lecture: the days it names — 18 (length, name, extra arguments, globalThis), 25 (using), 31 (with)');

    // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
    const lecture = read('advanced/day-17/lecture.html');
    const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
    const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const MDN = 'https://developer.mozilla.org/en-US/docs/';
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '17').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '17').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 22 && mdnRows.length === 29 && refSpec.length === 22 && refMdn.length === 29 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 17, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '17' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '17' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 1 && fullMdn.length === 11 && JSON.stringify(fullSpec) === JSON.stringify(markedSpec) && JSON.stringify(fullMdn) === JSON.stringify(markedMdn),
      `plan: the 12 rows "подробно" (1 of ECMA-262, 11 of MDN) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    // the numbers the text names next to its links are those of the 2026 text
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    check(lecture.includes(`${MDN}Web/JavaScript/Reference/Global_Objects/Reflect"`), 'links: the page Reflect of MDN is linked in the text');
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
