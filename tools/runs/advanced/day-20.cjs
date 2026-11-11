// Course 3, day 20, in Chrome: ArrayBuffer and typed arrays. Every <pre class="code js"> block of the lecture runs as the
// only <script> in the <body> of a clean page, the way a student would paste it into a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …". The
// context is Ashgabat time and Russian.
//   node tools/runs/advanced/day-20.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-20.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the cheatsheet runs without an error; the experiments
// the lecture only tells about (Math.round against ToUint8Clamp, species of a subclass of ArrayBuffer and Uint8Array);
// what the lecture says about the text of ECMA-262 2026 (every step it names in 25.1, 23.2, 10.4.5, 7.1.11–7.1.22 and
// table 70) is checked against tools/.cache/ecma262-2026.html; the MDN pages it quotes are in
// tools/.cache/mdn-content.git and say what it says; the days it points to say what it says; the reference table holds
// all 97 rows of the day's plan (76 of MDN, 21 of ECMA-262) as links with their marks, every tc39.es anchor exists and
// every link whose text starts with a number names the section of that number.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-20');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['-1,-128,1,31,0 | 255,128,1,31,0 | 0,128,255,31,0 | -1,128,1,31,0 | 4294967295,128,65537,31,0 | -1.5,128,65537,31,NaN', 'true 127,-128,-1,0 0,0,254,255'],
  'tasks #1': ['1,6,3 0,1,2,1e0 true TypeError 3', 'ok TypeError TypeError ok false'],
  'tasks #2': ['0 0 255 255 0 0 128 63 0 65535', '3.0039215087890625 -1,16448 255,255'],
  'tasks #8': ['7,7,7,7,7 2', 'TypeError 0', 'ok 3,3'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
// No template literals inside: Node reads these strings as templates first.
const SOLUTIONS = {
  concatTyped: `function concatTyped(...views) {
  const Kind = views.length ? views[0].constructor : Uint8Array;
  const total = views.reduce((n, v) => n + v.length, 0);
  const out = new Kind(total);
  let offset = 0;
  for (const v of views) { out.set(v, offset); offset += v.length; }
  return out;
}`,
  canonicalIndex: `function canonicalIndex(key) {
  if (key === "-0") return -0;
  const n = Number(key);
  return String(n) === key ? n : undefined;
}`,
  typedHas: `function typedHas(ta, key) {
  if (typeof key !== "string") return key in ta;
  const n = canonicalIndex(key);
  if (n === undefined) return key in ta;
  return Number.isInteger(n) && !Object.is(n, -0) && n >= 0 && n < ta.length;
}`,
  makeProgress: `function makeProgress(maxCards) {
  const buf = new ArrayBuffer(0, { maxByteLength: maxCards });
  const counts = new Uint8ClampedArray(buf);
  return {
    counts,
    add() { buf.resize(buf.byteLength + 1); },
    know(i) { counts[i]++; },
    forget() { buf.resize(buf.byteLength - 1); },
  };
}`,
  take: `function take(view) {
  const { byteOffset, length } = view;
  return new view.constructor(view.buffer.transfer(), byteOffset, length);
}`,
  toUint8Clamp: `function toUint8Clamp(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  const c = Math.min(Math.max(n, 0), 255);
  const f = Math.floor(c);
  if (c < f + 0.5) return f;
  if (c > f + 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}`,
  clamped: `function clamped(view) {
  return new Proxy(view, {
    set(target, key, value) {
      target[key] = typeof key === "string" && String(Number(key)) === key ? toUint8Clamp(value) : value;
      return true;
    },
  });
}`,
};
const NEEDS = { typedHas: ['canonicalIndex'], clamped: ['toUint8Clamp'] };
const checkable = (code) => {
  const direct = Object.keys(SOLUTIONS).filter((n) => code.includes(`${n}(`));
  const names = [...new Set(direct.flatMap((n) => [...(NEEDS[n] ?? []), n]))];
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
  if (a.type === 'object' && a.subtype !== 'error' && a.subtype !== 'typedarray' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

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
  await p.waitForTimeout(150);
  await p.close();
  await ctx.unroute(`http://day.test/${file}`);
  return out;
}

// one line of docs/coverage/*.csv: a title with a comma is in double quotes
const csvLine = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
const hasAll = (text, words) => words.every((w) => text.includes(w));
// the numbers of every step whose own text holds the words, as the spec writes them: 1, a, i, 1, a, i, …
const stepPaths = (html, needle) => {
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const fmt = (p) => p.map((n, i) => (i % 3 === 0 ? n : i % 3 === 1 ? String.fromCharCode(96 + n) : roman[n - 1])).join('.');
  const re = /<(\/?)(ol|li)\b[^>]*>/g;
  let depth = -1;
  const counts = [], cur = [], found = [];
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === 'ol') { if (m[1]) depth--; else { depth++; counts[depth] = 0; } continue; }
    if (m[1]) continue;
    counts[depth]++; cur[depth] = counts[depth]; cur.length = depth + 1;
    const rest = html.slice(re.lastIndex);
    if (flat(rest.slice(0, rest.search(/<ol\b|<\/li>/))).includes(needle)) found.push(fmt(cur));
  }
  return found;
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

  // what the lecture only tells about (probe d20_a.txt before writing)
  const told = async (code, want, text, file) => { const out = await runScript(ctx, code, file); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  await told('console.log([0.5, 1.5, 2.5, 3.5].map(Math.round).join(" "), Uint8ClampedArray.of(0.5, 1.5, 2.5, 3.5).join(" "));', ['1 2 3 4 0 2 2 4'],
    'lecture 5: Math.round gives 1, 2, 3, 4, ToUint8Clamp — 0, 2, 2, 4', 'round.html');
  await told(`class MyBuffer extends ArrayBuffer {}
class Bytes extends Uint8Array {}
const bb = Bytes.of(3, 1, 2);
console.log(new MyBuffer(4).slice(1).constructor.name);
console.log([bb.map((x) => x), bb.filter(() => true), bb.slice(1), bb.subarray(1)].map((x) => x.constructor.name).join(" "));
console.log([bb.toSorted(), bb.toReversed(), bb.with(0, 9)].map((x) => x.constructor.name).join(" "));`,
  ['MyBuffer', 'Bytes Bytes Bytes Bytes', 'Uint8Array Uint8Array Uint8Array'],
  'lecture 12: species — slice of a subclass of ArrayBuffer, map/filter/slice/subarray of a subclass of Uint8Array give the subclass; toSorted/toReversed/with — Uint8Array', 'species.html');
  await told(`"use strict";
const ta = new Uint8Array(2);
let thrown = 0;
for (const k of [5, "-0", "1.5"]) { try { ta[k] = 7; } catch { thrown++; } }
console.log(thrown, Object.keys(ta).join());`, ['0 0,1'], 'lecture 6: the writes to 5, "-0" and "1.5" vanish without an error even in strict code', 'strict.html');
  // the notes: the homework, in Chrome (probe d20_student.txt before writing)
  await told(`const vals = [200, -200, 70000, 127.5];
for (const K of [Int8Array, Uint16Array, Uint8ClampedArray]) console.log(K.name, K.from(vals).join(" "));
const ta = new Uint8Array(4);
console.log(ta["2"], ta["2.0"], ta[-1], ta.at(-1), "-1" in ta);
ta["2.0"] = 5;
console.log(Object.keys(ta).join());
const buf = new ArrayBuffer(8);
const u32 = new Uint32Array(buf, 4);
const u16 = new Uint16Array(buf, 2, 2);
u16[1] = 0x0102;
console.log(new Uint8Array(buf).join(" "), u32[0]);
const buffer = new ArrayBuffer(8, { maxByteLength: 16 });
const float32 = new Float32Array(buffer, 4);
const r = [];
buffer.resize(3); r.push(float32.length);
buffer.resize(8); r.push(float32.length);
buffer.resize(12); r.push(float32.length);
console.log(r.join(" "));`,
  ['Int8Array -56 56 112 127', 'Uint16Array 200 65336 4464 127', 'Uint8ClampedArray 200 0 255 128', '0 undefined undefined 0 false', '0,1,2,3,2.0', '0 0 0 0 2 1 0 0 258', '0 1 2'],
  'student homework 1–4: ToInt8/ToUint16/ToUint8Clamp of 200, −200, 70000, 127.5; "2.0" is not a numeric key, -1 is one; u16[1] lands in bytes 4–5, u32[0] = 258; a length-tracking view from byte 4 — 0, 1, 2', 'student-homework.html');
  // the tasks: what the criteria ask to find, with the reference solutions (probe d20_tasks.txt before writing)
  await told(`${SOLUTIONS.concatTyped}
class Bytes extends Uint8Array {}
const a = Uint8Array.of(1, 2, 3);
console.log(concatTyped(Bytes.of(1), Uint8Array.of(2)) instanceof Bytes, Array.from(concatTyped(a.subarray(1), a.subarray(0, 1))).join());`,
  ['true 2,3,1'], 'task 4: a subclass first gives the subclass; subarrays of one array concat to 2,3,1', 'task4.html');
  await told(`${SOLUTIONS.canonicalIndex}
${SOLUTIONS.typedHas}
const keys = ["0", "1", "2", "3", "-0", "-1", "1.5", "01", "1e0", "NaN", "Infinity", "-Infinity", "length", "buffer", "foo", "", " 1", "0x1", "4294967295", "9007199254740992", "1e21", Symbol.iterator, "constructor", "toString", "BYTES_PER_ELEMENT"];
const base = new Uint8Array(3);
const rab = new ArrayBuffer(4, { maxByteLength: 8 });
const out = new Uint8Array(rab, 1, 2);
rab.resize(1);
const det = new Uint8Array(4);
det.buffer.transfer();
let diff = 0;
for (const v of [base, out, det]) for (const k of keys) if (typedHas(v, k) !== (k in v)) diff++;
console.log(keys.length, diff, canonicalIndex("1e-7"), canonicalIndex("1e21"), canonicalIndex("0.0000001"));`,
  ['25 0 1e-7 undefined undefined'], 'task 5: on 25 keys and three views (plain, out of bounds, detached) typedHas = in; "1e-7" is numeric, "1e21" and "0.0000001" are not', 'task5.html');
  await told(`${SOLUTIONS.makeProgress}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const p = makeProgress(3);
p.add(); p.add(); p.add();
for (let i = 0; i < 300; i++) p.know(0);
console.log(p.counts[0], run(() => p.add()), p.counts.length);`,
  ['255 RangeError 3'], 'task 6: 300 times know — 255; the fourth add with maxCards 3 — RangeError, three cards stay', 'task6.html');
  await told(`${SOLUTIONS.take}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const naive = (view) => new view.constructor(view.buffer.transfer(), view.byteOffset, view.length);
const c = Uint16Array.of(1, 2, 3).subarray(1);
const sub = Uint16Array.of(1, 2, 3).subarray(1);
take(sub);
console.log(naive(c).length, run(() => take(sub)), take(new Uint8Array(new ArrayBuffer(2, { maxByteLength: 4 }))).buffer.resizable);`,
  ['0 TypeError true'], 'task 7: the one-liner gives an empty view (transfer runs before byteOffset and length are read); take of a moved view — TypeError; resizability kept', 'task7.html');
  await told(`${SOLUTIONS.toUint8Clamp}
${SOLUTIONS.clamped}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const values = [];
for (let i = -60; i <= 320; i += 0.25) values.push(i);
values.push(NaN, Infinity, -Infinity, "12", "", null, true, 1e300);
const ref = Uint8ClampedArray.from(values);
let diff = 0;
values.forEach((v, i) => { if (toUint8Clamp(v) !== ref[i]) diff++; });
const c = clamped(new Uint8Array(4));
c[0] = 5;
console.log(values.length, diff, run(() => c.fill(1)), run(() => c.length), run(() => c.set([1])), c[0]);`,
  ['1529 0 TypeError TypeError TypeError 5'], 'task 8: the model equals Uint8ClampedArray.from on 1529 values; fill, length and set through the proxy throw, c[0] reads', 'task8.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const steps = [
    ['sec-arraybuffer-length', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-arraybuffer-length', 'Let byteLength be ? ToIndex (length)', '2'],
    ['sec-arraybuffer-length', 'Let requestedMaxByteLength be ? GetArrayBufferMaxByteLengthOption (options)', '3'],
    ['sec-arraybuffer-length', 'Return ? AllocateArrayBuffer (NewTarget, byteLength, requestedMaxByteLength)', '4'],
    ['sec-toindex', 'If integer is not in the inclusive interval from 0 to 2 53 - 1, throw a RangeError exception', '2'],
    ['sec-initializetypedarrayfromarraybuffer', 'If offset modulo elementSize ≠ 0, throw a RangeError exception', '3'],
    ['sec-initializetypedarrayfromarraybuffer', 'If length is undefined and bufferIsFixedLength is false, then', '8'],
    ['sec-initializetypedarrayfromarraybuffer', 'If bufferByteLength modulo elementSize ≠ 0, throw a RangeError exception', '9.a.i'],
    ['sec-initializetypedarrayfromarraybuffer', 'If offset + newByteLength > bufferByteLength, throw a RangeError exception', '9.b.ii'],
    ['sec-touint8', 'If number is not finite or number is either +0 𝔽 or -0 𝔽, return +0 𝔽', '2'],
    ['sec-touint8', 'Let int be truncate (ℝ (number))', '3'],
    ['sec-touint8', 'Let int8bit be int modulo 2 8', '4'],
    ['sec-touint8clamp', 'If number is NaN, return +0 𝔽', '2'],
    ['sec-touint8clamp', 'Let clamped be the result of clamping mv between 0 and 255', '4'],
    ['sec-touint8clamp', 'Let f be floor (clamped)', '5'],
    ['sec-touint8clamp', 'If f is even, return 𝔽 (f)', '8'],
    ['sec-canonicalnumericindexstring', 'If argument is "-0", return -0 𝔽', '1'],
    ['sec-canonicalnumericindexstring', 'If ! ToString (n) is argument, return n', '3'],
    ['sec-isvalidintegerindex', 'If IsDetachedBuffer (O. [[ViewedArrayBuffer]]) is true, return false', '1'],
    ['sec-isvalidintegerindex', 'If index is not an integral Number, return false', '2'],
    ['sec-isvalidintegerindex', 'If index is -0 𝔽 or index < -0 𝔽, return false', '3'],
    ['sec-isvalidintegerindex', 'If ℝ (index) ≥ length, return false', '8'],
    ['sec-typedarray-set', 'Perform ? TypedArraySetElement (O, numericIndex, V)', '1.b.i.1'],
    ['sec-typedarraysetelement', 'If O. [[ContentType]] is bigint, let numValue be ? ToBigInt (value)', '1'],
    ['sec-typedarraysetelement', 'Else, let numValue be ? ToNumber (value)', '2'],
    ['sec-typedarraysetelement', 'If IsValidIntegerIndex (O, index) is true, then', '3'],
    ['sec-typedarray-getownproperty', 'Return the PropertyDescriptor { [[Value]] : value, [[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : true }', '1.b.iii'],
    ['sec-typedarray-delete', 'If IsValidIntegerIndex (O, numericIndex) is false, return true', '1.b.i'],
    ['sec-typedarray-defineownproperty', 'If Desc has a [[Configurable]] field and Desc. [[Configurable]] is false, return false', '1.b.ii'],
    ['sec-typedarray-defineownproperty', 'If Desc has a [[Writable]] field and Desc. [[Writable]] is false, return false', '1.b.v'],
    ['sec-%typedarray%', 'Throw a TypeError exception', '1'],
    ['sec-typedarray', 'If numberOfArgs = 0, return ? AllocateTypedArray (constructorName, NewTarget, proto, 0)', '5'],
    ['sec-typedarray', 'If firstArgument has a [[TypedArrayName]] internal slot, then', '7.b'],
    ['sec-typedarray', 'Else if firstArgument has an [[ArrayBufferData]] internal slot, then', '7.c'],
    ['sec-typedarray', 'If usingIterator is not undefined, then', '7.d.iii'],
    ['sec-typedarray', 'NOTE: firstArgument is not an iterable object, so assume it is already an array-like object', '7.d.iv.1'],
    ['sec-typedarray', 'Let elementLength be ? ToIndex (firstArgument)', '9'],
    ['sec-comparetypedarrayelements', 'If x and y are both NaN, return +0 𝔽', '3'],
    ['sec-comparetypedarrayelements', 'If x is NaN, return 1 𝔽', '4'],
    ['sec-comparetypedarrayelements', 'If y is NaN, return -1 𝔽', '5'],
    ['sec-comparetypedarrayelements', 'If x is -0 𝔽 and y is +0 𝔽, return -1 𝔽', '8'],
    ['sec-settypedarrayfromtypedarray', 'If target. [[ContentType]] is not source. [[ContentType]], throw a TypeError exception', '17'],
    ['sec-settypedarrayfromtypedarray', 'If SameValue (srcBuffer, targetBuffer) is true or sameSharedArrayBuffer is true, then', '19'],
    ['sec-settypedarrayfromtypedarray', 'If srcType is targetType, then', '23'],
    ['sec-settypedarrayfromtypedarray', 'Let value be GetValueFromBuffer (srcBuffer, srcByteIndex, srcType, true, unordered)', '24.a.i'],
    ['sec-%typedarray%.prototype.subarray', 'Let beginByteOffset be srcByteOffset + (startIndex × elementSize)', '14'],
    ['sec-%typedarray%.prototype.subarray', 'Return ? TypedArraySpeciesCreate (O, argumentsList)', '17'],
    ['sec-arraybuffer.isview', 'If arg has a [[ViewedArrayBuffer]] internal slot, return true', '2'],
    ['sec-%typedarray%.prototype.tosorted', 'Let A be ? TypedArrayCreateSameType (O, len)', '5'],
    ['sec-%typedarray%.prototype.with', 'Let A be ? TypedArrayCreateSameType (O, len)', '10'],
    ['sec-arraybuffer.prototype.resize', 'Perform ? RequireInternalSlot (O, [[ArrayBufferMaxByteLength]])', '2'],
    ['sec-arraybuffer.prototype.resize', 'If newByteLength > O. [[ArrayBufferMaxByteLength]], throw a RangeError exception', '6'],
    ['sec-arraybuffer.prototype.resize', 'Let newBlock be ? CreateByteDataBlock (newByteLength)', '10'],
    ['sec-arraybuffer.prototype.resize', 'Set O. [[ArrayBufferByteLength]] to newByteLength', '15'],
    ['sec-istypedarrayoutofbounds', 'If byteOffsetStart > bufferByteLength or byteOffsetEnd > bufferByteLength, return true', '9'],
    ['sec-validatetypedarray', 'If IsTypedArrayOutOfBounds (taRecord) is true, throw a TypeError exception', '4'],
    ['sec-typedarray-preventextensions', 'If IsTypedArrayFixedLength (O) is false, return false', '2'],
    ['sec-arraybuffercopyanddetach', 'If IsDetachedBuffer (arrayBuffer) is true, throw a TypeError exception', '5'],
    ['sec-arraybuffercopyanddetach', 'If preserveResizability is preserve-resizability and IsFixedLengthArrayBuffer (arrayBuffer) is false, then', '6'],
    ['sec-arraybuffercopyanddetach', 'Let newMaxByteLength be empty', '7.a'],
    ['sec-arraybuffercopyanddetach', 'Perform CopyDataBlockBytes (toBlock, 0, fromBlock, 0, copyLength)', '13'],
    ['sec-arraybuffercopyanddetach', 'Implementations may implement this method as a zero-copy move or a realloc', '14'],
    ['sec-arraybuffercopyanddetach', 'Perform ! DetachArrayBuffer (arrayBuffer)', '15'],
  ];
  const wrong = steps.filter(([id, needle, n]) => !same(at(id, needle), [n])).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${n}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture names (25.1.4.1 1–4, 7.1.22 2, 23.2.5.1.3 3/8/9.a.i/9.b.ii, 7.1.11 2–4, 7.1.12 2/4/5/8, 7.1.21 1/3, 10.4.5.16 1–3/8, 10.4.5.6 1.b.i.1, 10.4.5.18 1–3, 10.4.5.2 1.b.iii, 10.4.5.7, 10.4.5.4, 23.2.1.1, 23.2.5.1, 23.2.4.7, 23.2.3.26.2, 23.2.3.30, 25.1.5.1, toSorted, with, 25.1.6.6, 10.4.5.14, 23.2.4.4, 10.4.5.1, 25.1.3.3): ${wrong.join('; ') || 'all right'}`);
  check(at('sec-typedarray-delete', 'Return false').includes('1.b.ii') && at('sec-touint8clamp', 'Return 𝔽 (f + 1)').includes('9') && at('sec-allocatearraybuffer', 'Let block be ? CreateByteDataBlock (byteLength)')[0] === '5'
    && f('sec-createbytedatablock').includes('Set all of the bytes of db to 0') && f('sec-%typedarray%.prototype.toreversed').includes('TypedArrayCreateSameType')
    && f('sec-arraybuffer.prototype.transfer').includes('preserve-resizability') && f('sec-arraybuffer.prototype.transfertofixedlength').includes('fixed-length')
    && f('sec-arraybuffer.prototype.slice').includes('Let ctor be ? SpeciesConstructor (O, %ArrayBuffer%)'),
  'ECMA-262: [[Delete]] of a valid index returns false (1.b.ii), ToUint8Clamp step 9; AllocateArrayBuffer — CreateByteDataBlock, bytes 0; toReversed — TypedArrayCreateSameType; transfer keeps resizability, transferToFixedLength does not; ArrayBuffer slice — SpeciesConstructor');
  {
    // a heading writes the name as <var class="field">[[Get]]</var>
    const titles = [...spec.matchAll(/<span class="secnum">(10\.4\.5\.\d+)<\/span>\s*<var class="field">\[\[(\w+)\]\]<\/var>/g)].map((m) => `${m[1]} ${m[2]}`);
    const uniq = [...new Set(titles)];
    const withKey = uniq.filter((t) => !/PreventExtensions|OwnPropertyKeys/.test(t));
    check(uniq.length === 8 && withKey.length === 6, `ECMA-262: 10.4.5 has eight internal methods of its own, six of them get a key (${uniq.map((t) => t.split(' ')[1]).join(', ')})`);
  }
  {
    const t70 = f('sec-typedarray-objects');
    const rows = [['Int8Array', 'int8 1 ToInt8'], ['Uint8Array', 'uint8 1 ToUint8'], ['Uint8ClampedArray', 'uint8clamped 1 ToUint8Clamp'], ['Int16Array', 'int16 2 ToInt16'], ['Uint16Array', 'uint16 2 ToUint16'],
      ['Int32Array', 'int32 4 ToInt32'], ['Uint32Array', 'uint32 4 ToUint32'], ['BigInt64Array', 'bigint64 8 ToBigInt64'], ['BigUint64Array', 'biguint64 8 ToBigUint64'],
      ['Float16Array', 'float16 2 16-bit IEEE'], ['Float32Array', 'float32 4 32-bit IEEE'], ['Float64Array', 'float64 8 64-bit IEEE']];
    const missing = rows.filter(([n, rest]) => !t70.includes(`${n} %${n}% ${rest}`)).map(([n]) => n);
    check(t70.includes('Table 70: The TypedArray Constructors') && missing.length === 0, `ECMA-262: table 70 — twelve kinds, sizes and conversions as the table of section 4 says (Float16Array — day 21) ${missing.join(', ')}`);
  }
  check(f('sec-%typedarray%.prototype.tostring').includes('%Array.prototype.toString%') && f('sec-array.prototype.tostring').includes('Let func be ? Get (array, "join")') && num('sec-%typedarray%.prototype.tostring') === '23.2.3.34'
    && num('sec-properties-of-typedarray-prototype-objects') === '23.2.7' && num('sec-typedarray.prototype.bytes_per_element') === '23.2.7.1' && num('sec-typedarray.prototype.constructor') === '23.2.7.2' && !spec.includes('<span class="secnum">23.2.7.3</span>')
    && num('sec-properties-of-the-%typedarray%-intrinsic-object') === '23.2.2' && num('sec-properties-of-the-%typedarrayprototype%-object') === '23.2.3' && num('sec-comparetypedarrayelements') === '23.2.4.7',
  'ECMA-262: toString of a view is %Array.prototype.toString% (23.2.3.34), which calls join; 23.2.7 has only BYTES_PER_ELEMENT and constructor; 23.2.2, 23.2.3, 23.2.4.7 as named');
  check(hasAll(f('sec-fixed-length-and-resizable-arraybuffer-objects'), ['A fixed-length ArrayBuffer is an ArrayBuffer whose byte length cannot change after creation', 'A resizable ArrayBuffer is an ArrayBuffer whose byte length may change after creation'])
    && hasAll(f('sec-resizable-arraybuffer-guidelines'), ['we recommend that the smallest possible size for the application be chosen', 'We recommend that "maxByteLength" does not exceed 1,073,741,824', 'does not guarantee that future resizes will succeed'])
    && num('sec-structured-data') === '25' && num('sec-indexed-collections') === '23' && num('sec-data-blocks') === '6.2.9',
  'ECMA-262: 25.1.2 — fixed-length and resizable; 25.1.8 — the smallest maxByteLength, not over 1 GiB, a constructor does not promise resizes; chapters 25 and 23; Data Blocks 6.2.9');

  // the MDN pages the lecture uses
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
  {
    const guide = plain(mdn('guide/typed_arrays'));
    const ab = plain(mdn('reference/global_objects/arraybuffer'));
    check(guide.includes('title: JavaScript typed arrays') && guide.includes('split the implementation into _buffers_ and _views_') && guide.includes('offers no mechanism for accessing its contents')
      && guide.includes('ImageData.data') && guide.includes('Is a Uint8ClampedArray representing a one-dimensional array containing the data in the RGBA order'),
    'lecture 1, 5: MDN «JavaScript typed arrays» — buffers and views, a buffer offers no access to its contents; ImageData.data is a Uint8ClampedArray');
    check(ab.includes('can be transferred between different execution contexts, like Web Workers'), 'lecture 14: MDN ArrayBuffer — transferred to Web Workers');
    const ta = plain(mdn('reference/global_objects/typedarray'));
    const resizable = ta.slice(ta.indexOf('### Behavior when viewing a resizable buffer'), ta.indexOf('## Constructor'));
    check(ta.includes("Typed arrays always use the platform's native byte order") && ta.includes('you should use a DataView instead')
      && resizable.includes("This is the only case where a non-length-tracking typed array's length may change") && resizable.includes('const float32 = new Float32Array(buffer, 4);')
      && resizable.includes('buffer.resize(3);') && resizable.includes('const buffer = new ArrayBuffer(8, { maxByteLength: 16 });'),
    'student: MDN TypedArray — «Typed arrays always use the platform\'s native byte order», DataView for an order of your own; «Behavior when viewing a resizable buffer», its quote and its last example');
  }
  // what the notes say about the text of ECMA-262: the steps behind homework 2 and 4
  check(same(at('sec-typedarraylength', 'Return floor ((byteLength - byteOffset) / elementSize)'), ['9']) && same(at('sec-istypedarrayoutofbounds', 'If byteOffsetStart > bufferByteLength or byteOffsetEnd > bufferByteLength, return true'), ['9'])
    && same(at('sec-istypedarrayoutofbounds', 'Let byteOffsetEnd be bufferByteLength'), ['6.a']) && ['sec-toint8', 'sec-touint16', 'sec-touint8clamp'].map(num).join() === '7.1.10,7.1.9,7.1.12',
  `student homework 1, 4: ToInt8 7.1.10, ToUint16 7.1.9, ToUint8Clamp 7.1.12; IsTypedArrayOutOfBounds step 9 (a length-tracking view ends at the buffer, 6.a), TypedArrayLength step 9 — floor((byteLength − byteOffset) / elementSize) [${['sec-toint8', 'sec-touint16'].map(num).join()}]`);
  {
    const notes = builtSite.htmlOfFile(path.join(DAY, 'student.html'));   // read is declared below (TDZ)
    const nAnchors = [...new Set([...notes.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]))];
    const nFooter = notes.slice(notes.indexOf('<div class="sources">'));
    check(nAnchors.every((a) => spec.includes(`id="${a}"`)) && ['TypedArray', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 3,
      'student: the footer names MDN TypedArray (quoted in «запомни» and homework 4) and ECMA-262 2026; MDN is linked there and twice in the text');
  }

  // what the tasks say about the text of ECMA-262 2026 and MDN
  {
    const tsteps = [
      ['sec-typedarray-hasproperty', 'If numericIndex is not undefined, return IsValidIntegerIndex (O, numericIndex)', '1.b'],
      ['sec-typedarray-hasproperty', 'Return ? OrdinaryHasProperty (O, P)', '2'],
      ['sec-typedarray-defineownproperty', 'If IsAccessorDescriptor (Desc) is true, return false', '1.b.iv'],
      ['sec-arraybuffer.prototype.resize', 'Let newByteLength be ? ToIndex (newLength)', '4'],
      ['sec-%typedarray%.prototype.fill', 'Else, set value to ? ToNumber (value)', '5'],
      ['sec-%typedarray%.prototype.fill', 'Set taRecord to MakeTypedArrayWithBufferWitnessRecord (O, seq-cst)', '14'],
      ['sec-%typedarray%.prototype.fill', 'If IsTypedArrayOutOfBounds (taRecord) is true, throw a TypeError exception', '15'],
      ['sec-%typedarray%.prototype.fill', 'Set endIndex to min (endIndex, len)', '17'],
      ['sec-validatetypedarray', 'Perform ? RequireInternalSlot (O, [[TypedArrayName]])', '1'],
      ['sec-settypedarrayfromtypedarray', 'Perform SetValueInBuffer (targetBuffer, targetByteIndex, targetType, value, true, unordered)', '24.a.ii'],
    ];
    const twrong = tsteps.filter(([id, needle, n]) => !same(at(id, needle), [n])).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${n}`);
    check(twrong.length === 0, `tasks: ECMA-262 — 10.4.5.3 1.b and 2, 10.4.5.4 1.b.iv (an accessor), resize 4 (ToIndex), fill 5 (ToNumber once, before the range), 14–15 (bounds again), 17 (shorter end), 23.2.4.4 1 (the slot), SetTypedArrayFromTypedArray 24.a.ii (the target type): ${twrong.join('; ') || 'all right'}`);
    check(f('sec-stringtonumber') !== '' && /NonDecimalIntegerLiteral/.test(f('sec-tonumber-applied-to-the-string-type')) && num('sec-%typedarray%.prototype.fill') === '23.2.3.9',
      'tasks: ToNumber of a string takes "0x1F" (StrNumericLiteral has NonDecimalIntegerLiteral); fill is 23.2.3.9');
    const setPage = plain(mdn('reference/global_objects/typedarray/set'));
    const tasksHtml = builtSite.htmlOfFile(path.join(DAY, 'tasks.html'));
    const tAnchors = [...new Set([...tasksHtml.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]))];
    const tNamed = [...tasksHtml.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const tFooter = tasksHtml.slice(tasksHtml.indexOf('<div class="sources">'));
    check(setPage.includes('The offset into the target array at which to begin writing values') && tasksHtml.includes('«The offset into the target array at which to begin writing values»')
      && tAnchors.every((a) => spec.includes(`id="${a}"`)) && tNamed.length === 2 && tNamed.every(([id, n]) => num(id) === n)
      && ['TypedArray.prototype.set()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => tFooter.includes(s)) && (tasksHtml.match(/developer\.mozilla\.org/g) || []).length === 2,
    'tasks: MDN set — «The offset into the target array at which to begin writing values»; tc39.es anchors exist with right numbers (7.1.21, 23.2.3.9); the footer names set() and ECMA-262 2026');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const page = (p) => flat(read(p));
  check(page('advanced/day-04/lecture.html').includes('память ArrayBuffer (день 20)') && page('advanced/day-05/lecture.html').includes('ею пользуются двоичные данные (день 20)')
    && hasAll(page('advanced/day-06/lecture.html'), ['Int8Array, Uint8Array — день 20', 'Int16Array, Uint16Array — день 20', 'BigInt64Array — день 20'])
    && hasAll(page('advanced/day-15/lecture.html'), ['типизированный массив, 10.4.5', 'восемь методов', 'день 20']) && read('advanced/day-15/lecture.html').includes('#sec-array-exotic-objects-defineownproperty-p-desc'),
  'lecture 1, 2, 4, 6: the promises of days 4 (Data Block), 5 (ToIndex), 6 (ToInt8 … ToBigUint64), 15 (10.4.5, eight methods; the array and its [[DefineOwnProperty]])');
  check(page('essentials/day-19/lecture.html').includes('Массивы: создание и основные методы') && page('essentials/day-20/lecture.html').includes('Перебор массивов: forEach, map, filter, reduce'),
    'lecture 10: the methods of arrays — Essentials, days 19–20');
  {
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    const ahead = read('tools/check-ahead.mjs');
    check(hasAll(plan, ['**21. DataView, порядок байтов, Float16 и base64.**', '`Float16Array`', '`toBase64`']) && hasAll(ahead, ["day3: 21, re: /\\b(?:DataView|Float16Array)\\b", "day3: 20, re: /\\b(?:ArrayBuffer|"]),
      'lecture 4, 16: DataView, Float16Array and base64 are day 21 in the plan and in check-ahead, ArrayBuffer and the views — day 20');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
  {
    const lecture = read('advanced/day-20/lecture.html');
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine);
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '20').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '20').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 21 && mdnRows.length === 76 && refSpec.length === 21 && refMdn.length === 76 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 20, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '20' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '20' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 4 && fullMdn.length === 13 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 17 rows "подробно" (4 + 13) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const titles = mdRows.filter((c) => c[5] === '3' && c[6] === '20').map((c) => [c[0], c[1]]);
    const wrongTitle = titles.filter(([p, t]) => !refTable.includes(`${p}">MDN: ${t.replace(/&/g, '&amp;')}</a>`)).map(([p]) => p);
    check(wrongTitle.length === 0, `plan: every MDN row is named by its title from the map ${wrongTitle.join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    check(['учебник JavaScript typed arrays, ArrayBuffer, TypedArray', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && (lecture.match(/developer\.mozilla\.org/g) || []).length === 78,
      `links: the footer names the MDN pages and ECMA-262 2026; MDN is linked 78 times — 76 rows, the guide in section 1, the footer (${(lecture.match(/developer\.mozilla\.org/g) || []).length})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
