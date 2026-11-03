// Course 3, day 18, in Chrome: the global object and the standard built-in objects. Every <pre class="code js"> block
// of the lecture runs as the only <script> in the <body> of a clean page (one block appends an iframe, one fails as a
// whole with a SyntaxError), the way a student would paste it into a file. Console output is rebuilt from Chrome's
// preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …". The context is
// Ashgabat time and Russian.
//   node tools/runs/advanced/day-18.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-18.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block of the notes prints what the comments of its
// console.log lines say, and the homework holds in Chrome and in the text of ECMA-262 and MDN; a block of the tasks
// prints what EXPECT says, an example runs with the reference solution of SOLUTIONS and every "expression;   // value"
// line equals its comment, and what the criteria ask to find holds in Chrome and in the text of ECMA-262 (the models of
// parseInt, encodeURIComponent and decodeURIComponent agree with the real functions on whole ranges); the cheatsheet
// runs without an error; the experiments
// the lecture only tells about (caller on Function.prototype is not %ThrowTypeError% in Chrome — the finding of the
// day; Array.isArray of an array from an iframe; for-in and a method assigned to Array.prototype; decodeURIComponent
// leaves +; the table of URI characters); what the lecture says about the text of ECMA-262 2026 (chapters 17–19, 20.3,
// the terms of 4.4 and the operations around them) is checked against tools/.cache/ecma262-2026.html; the two MDN
// pages it quotes are in tools/.cache/mdn-content.git and say what it quotes; the days it points to say what it says;
// the reference table holds all 69 rows of the day's plan (all of ECMA-262) as links with their marks and every
// tc39.es anchor exists, and every link whose text starts with a number names the section of that number.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-18');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['slice:2 fill:1 defineProperty:3 split:2 then:2 of:0 Set:0', 'TypeError ok TypeError false get size true'],
  'tasks #1': ['we- нет we- нет wec --- w-c', 'false true undefined 1'],
  'tasks #2': ['NaN 1 NaN NaN 1 NaN NaN 12', '255 255 0 255 255 255'],
  'tasks #8': ['0.0005 NaN Infinity NaN 1.2 0 1 1 NaN 1'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
// No template literals inside, and every backslash doubled: Node reads these strings as templates first.
const SOLUTIONS = {
  myParseInt: `function myParseInt(string, radix) {
  let s = "".concat(string).trimStart();
  let sign = 1;
  if (s[0] === "-") sign = -1;
  if (s[0] === "+" || s[0] === "-") s = s.slice(1);
  let r = radix | 0;
  let stripPrefix = true;
  if (r !== 0) {
    if (r < 2 || r > 36) return NaN;
    if (r !== 16) stripPrefix = false;
  } else r = 10;
  if (stripPrefix && (s.startsWith("0x") || s.startsWith("0X"))) { s = s.slice(2); r = 16; }
  const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
  let value = 0, count = 0;
  for (const ch of s) {
    const lower = ch >= "A" && ch <= "Z" ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch;
    const d = DIGITS.indexOf(lower);
    if (d === -1 || d >= r) break;
    value = value * r + d;
    count++;
  }
  if (count === 0) return NaN;
  return sign * value;
}`,
  myEncodeURIComponent: `function myEncodeURIComponent(s, extra = "") {
  const str = "".concat(s);
  const KEEP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.!~*'()" + extra;
  let out = "";
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (KEEP.includes(ch)) { out += ch; continue; }
    const cp = str.codePointAt(k);
    if (cp >= 0xd800 && cp <= 0xdfff) throw new URIError("URI malformed");
    if (cp > 0xffff) k++;
    const bytes = cp < 0x80 ? [cp] : cp < 0x800 ? [0xc0 | (cp >> 6), 0x80 | (cp & 63)] : cp < 0x10000 ? [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)] : [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    for (const byte of bytes) out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}`,
  builtinLike: `function builtinLike(name, length, fn) {
  const f = { [name](...args) { return fn(...args); } }[name];
  Object.defineProperty(f, "length", { value: length });
  return f;
}`,
  parseShareLink: `function parseShareLink(query) {
  const settings = { deck: "", perDay: 20, sound: true };
  const errors = [];
  for (const pair of query.replace(/^\\?/, "").split("&")) {
    if (pair === "") continue;
    const at = pair.indexOf("=");
    const rawKey = at === -1 ? pair : pair.slice(0, at);
    const rawValue = at === -1 ? "" : pair.slice(at + 1);
    let key, value;
    try { key = decodeURIComponent(rawKey); value = decodeURIComponent(rawValue.replaceAll("+", " ")); } catch { errors.push(rawKey); continue; }
    if (key === "deck") settings.deck = value;
    else if (key === "perDay") { if (/^[0-9]{1,3}$/.test(value) && +value >= 1 && +value <= 100) settings.perDay = parseInt(value, 10); else errors.push(key); }
    else if (key === "sound") { if (value === "1" || value === "0") settings.sound = value === "1"; else errors.push(key); }
  }
  return { settings, errors };
}`,
  makeShareLink: `function makeShareLink(settings) {
  return "?deck=" + encodeURIComponent(settings.deck) + "&perDay=" + settings.perDay + "&sound=" + (settings.sound ? 1 : 0);
}`,
  myDecodeURIComponent: `function myDecodeURIComponent(s) {
  const str = "".concat(s);
  const byteAt = (i) => {
    if (i + 3 > str.length || str[i] !== "%") throw new URIError("URI malformed");
    const h = str.slice(i + 1, i + 3);
    if (!/^[0-9a-fA-F]{2}$/.test(h)) throw new URIError("URI malformed");
    return parseInt(h, 16);
  };
  let out = "";
  for (let k = 0; k < str.length; k++) {
    if (str[k] !== "%") { out += str[k]; continue; }
    const b = byteAt(k);
    k += 2;
    const n = b < 0x80 ? 0 : b < 0xc0 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : b < 0xf8 ? 4 : 5;
    if (n === 0) { out += String.fromCharCode(b); continue; }
    if (n === 1 || n > 4) throw new URIError("URI malformed");
    let cp = b & (0xff >> (n + 1));
    for (let j = 1; j < n; j++) {
      const c = byteAt(k + 1);
      if ((c & 0xc0) !== 0x80) throw new URIError("URI malformed");
      cp = (cp << 6) | (c & 63);
      k += 3;
    }
    const min = [0, 0, 0x80, 0x800, 0x10000][n];
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new URIError("URI malformed");
    out += String.fromCodePoint(cp);
  }
  return out;
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

  // what the lecture only tells about (probes d18_a–e.txt before writing)
  const told = async (code, want, text, file) => { const out = await runScript(ctx, code, file); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  await told(`${RUN}const dc = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
const da = Object.getOwnPropertyDescriptor(Function.prototype, "arguments");
const thrower = Object.getOwnPropertyDescriptor((function () { "use strict"; return arguments; })(), "callee").get;
console.log(typeof dc.get, dc.get === dc.set, dc.get === thrower, da.get === thrower, dc.enumerable, dc.configurable);
function sloppy() {}
console.log(sloppy.caller, Object.hasOwn(sloppy, "caller"), Object.hasOwn(sloppy, "arguments"), run(() => Math.max.caller));`,
  ['function false false false false true', 'null false false TypeError: \'caller\', \'callee\', and \'arguments\' properties may not be accessed on strict mode functions or the arguments objects for calls to them'],
  'lecture 7 (finding): caller on Function.prototype — getter and setter differ and are not %ThrowTypeError% (10.2.4 wants both to be it); a sloppy function has no own caller or arguments and gets null; a built-in throws', 'caller.html');
  await told(`const frame = document.body.appendChild(document.createElement("iframe"));
const arr = new frame.contentWindow.Array(1, 2);
console.log(arr instanceof Array, Array.isArray(arr));`, ['false true'], 'lecture 1: an array of another realm is not instanceof Array, Array.isArray knows it', 'realm-array.html');
  await told(`Array.prototype.last = function () { return this[this.length - 1]; };
const seen = [];
for (const k in [7, 8]) seen.push(k);
Object.defineProperty(Array.prototype, "first", { value() { return this[0]; }, writable: true, configurable: true });
const seen2 = [];
for (const k in [7, 8]) seen2.push(k);
console.log(seen.join(), seen2.join(), [7, 8].last(), [7, 8].first());`, ['0,1,last 0,1,last 8 7'],
  'lecture 6: a method assigned to Array.prototype is enumerable and for-in shows it, one defined non-enumerable is not seen', 'forin.html');
  await told(`const sample = ";/?:@&=+$,#-_.!~*'() []";
console.log([...sample].filter((c) => c !== " ").map((c) => c + (encodeURI(c) === c ? "U" : "-") + (encodeURIComponent(c) === c ? "C" : "-")).join(" "));
console.log(decodeURIComponent("a+b"), decodeURIComponent("a%2Bb"), encodeURIComponent("a b+c"), encodeURI(" "));`,
  [';U- /U- ?U- :U- @U- &U- =U- +U- $U- ,U- #U- -UC _UC .UC !UC ~UC *UC \'UC (UC )UC [-- ]--', 'a+b a+b a%20b%2Bc %20'],
  'lecture 14, 16: the table of URI characters — _ - . ! ~ * \' ( ) kept by both, ; / ? : @ & = + $ , # only by encodeURI, space and [ ] by none; decodeURIComponent leaves +', 'uri-table.html');
  // the notes: the homework, in Chrome (probe d18_student.txt before writing)
  await told(`console.log(String.prototype.replace.length, Array.prototype.splice.length, Function.prototype.call.length, JSON.parse.length, Array.prototype.indexOf.length, Object.getOwnPropertyDescriptor(Symbol.prototype, "description").get.name);
var x = 1;
let y = 2;
globalThis.z = 3;
console.log(delete globalThis.x, delete globalThis.z, "y" in globalThis, typeof z, x);
console.log(parseInt("0.00000008"), parseInt(0.00000008), parseInt("  +0x10"), parseInt("010"), parseInt("1e3", 16));
console.log([..."!'()*"].map((c) => encodeURIComponent(c)).join(""), encodeURIComponent("!'()*") === "!'()*");`,
  ['2 2 1 2 1 get description', 'false true false undefined 1', '0 8 16 10 483', '!\'()* true'],
  'student homework 1–4: replace 2, splice 2, call 1, JSON.parse 2 (written apart), indexOf 1, "get description"; var is not deleted, an assigned property is; let is not on the object; parseInt — "0" before ".", "8e-8", + and 0x, no octal, 1e3 in 16; ! \' ( ) * kept', 'student-homework.html');
  // the tasks: what the criteria ask to find, with the reference solutions (probe d18_tasks.txt before writing)
  await told(`${RUN}console.log(typeof Date(), run(() => Set()));`, ['string TypeError: Constructor Set requires \'new\''], 'task 1: Date() answers without new, Set() throws in step 1', 'task1.html');
  await told(`${SOLUTIONS.myParseInt}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const inputs = ["", " 12", "-0", "+0x1f", "0X10", "0x", "-0x", "z", "Z", "zz", "Infinity", "12e3", "0.9", "\\u00A07", "\\uFEFF-8", "٣", "K", "\\u212A", "10", "7f", "0b11"];
const radixes = [undefined, 0, 2, 8, 10, 16, 36, 37, 1, -1, NaN, "16", 16.9, 2 ** 32 + 2, Infinity];
const diff = [];
for (const s of inputs) for (const r of radixes) if (!Object.is(myParseInt(s, r), parseInt(s, r))) diff.push(JSON.stringify(s) + "/" + r);
for (const x of [null, undefined, 0.0000005, 1e21, -0, true, {}]) if (!Object.is(myParseInt(x, 36), parseInt(x, 36))) diff.push(String(x));
console.log(inputs.length, radixes.length, diff.length, run(() => parseInt(Symbol())), run(() => myParseInt(Symbol())), run(() => "".concat(Symbol())), String(Symbol("x")));`,
  ['21 15 0 TypeError TypeError TypeError Symbol(x)'],
  'task 4: myParseInt agrees with parseInt on 21 inputs × 15 radixes and 7 other values (Object.is); ToString of a symbol throws in parseInt and in concat, String(symbol) does not', 'task4.html');
  await told(`${SOLUTIONS.myEncodeURIComponent}
let diff = 0;
for (let cp = 0; cp < 0x800; cp++) { const ch = String.fromCodePoint(cp); if (myEncodeURIComponent(ch) !== encodeURIComponent(ch) || myEncodeURIComponent(ch, ";/?:@&=+$,#") !== encodeURI(ch)) diff++; }
for (const ch of ["€", "😀", "\\uFFFF", "\\u{10FFFF}", "китап", "a&b=c+d #e", "ü\\u{1F44D}\\u{1F3FD}"]) if (myEncodeURIComponent(ch) !== encodeURIComponent(ch) || myEncodeURIComponent(ch, ";/?:@&=+$,#") !== encodeURI(ch)) diff++;
console.log(diff, ["\\u007F", "\\u07FF", "\\uFFFF", "\\u{10FFFF}"].map((c) => encodeURIComponent(c).length / 3).join());`,
  ['0 1,2,3,4'], 'task 5: the model agrees with encodeURIComponent on 0–U+07FF and the samples, with extra — with encodeURI; 1, 2, 3 and 4 bytes at the edges of the ranges', 'task5.html');
  await told(`${SOLUTIONS.builtinLike}
const clamp = builtinLike("clamp", 3, (x, lo, hi) => Math.min(Math.max(x, lo), hi));
const flags = (f, k) => { const d = Object.getOwnPropertyDescriptor(f, k); return [d.writable, d.enumerable, d.configurable].join(); };
console.log(flags(Math.max, "length") === flags(clamp, "length"), flags(Math.max, "name") === flags(clamp, "name"), Math.max.toString(), "|", clamp.toString());`,
  ['true true function max() { [native code] } | [name](...args) { return fn(...args); }'],
  'task 6: the attributes of length and name equal those of Math.max; toString — [native code] for a built-in, the source text for the method', 'task6.html');
  await told(`${SOLUTIONS.parseShareLink}
${SOLUTIONS.makeShareLink}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const names = ["a & b", "x=y", "1+1", "100%", "ü", "😀 deck", ""];
console.log(names.every((n) => parseShareLink(makeShareLink({ deck: n, perDay: 5, sound: true })).settings.deck === n), run(() => makeShareLink({ deck: "x\\uD800", perDay: 5, sound: true })), JSON.stringify(parseShareLink(makeShareLink({ deck: "x\\uD800".toWellFormed(), perDay: 5, sound: true })).settings.deck));`,
  ['true URIError "x�"'], 'task 7: seven deck names go there and back; a lone surrogate breaks makeShareLink, toWellFormed turns it into U+FFFD', 'task7.html');
  await told(`${SOLUTIONS.myDecodeURIComponent}
const run = (f) => { try { return f(); } catch (e) { return e.name; } };
const samples = ["%41", "%", "%4", "%zz", "%C2", "%C2%A9", "%C2A9", "%E2%82%AC", "%E2%82", "%F0%9F%98%80", "%F4%8F%BF%BF", "%F4%90%80%80", "%F0%80%80%80", "%E0%80%80", "%ED%A0%80", "%ED%9F%BF", "%F8%80%80%80%80", "%80", "%FF", "a%2", "%%41", "%C3%A4%C3", "%EF%BB%BF"];
const diff = [];
for (let b = 0; b < 256; b++) { const s = "%" + b.toString(16).padStart(2, "0"); if (run(() => myDecodeURIComponent(s)) !== run(() => decodeURIComponent(s))) diff.push(s); }
for (const s of samples) if (run(() => myDecodeURIComponent(s)) !== run(() => decodeURIComponent(s))) diff.push(s);
console.log(samples.length, diff.length, run(() => decodeURIComponent("%F4%90%80%80")), run(() => decodeURIComponent("%ED%9F%BF")).codePointAt(0).toString(16));`,
  ['23 0 URIError d7ff'], 'task 8: the model agrees with decodeURIComponent on all 256 «%XX» and 23 samples (strings and URIError); above U+10FFFF — URIError, U+D7FF is fine', 'task8.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const ATTR = (w, e, c) => `This property has the attributes { [[Writable]] : ${w}, [[Enumerable]] : ${e}, [[Configurable]] : ${c} }`;
  const B18 = f('sec-ecmascript-standard-built-in-objects');

  check(hasAll(f('sec-standard-object'), ['object whose semantics are defined by this specification'])
    && hasAll(f('sec-built-in-object'), ['object specified and supplied by an ECMAScript implementation', 'An ECMAScript implementation may specify and supply additional kinds of built-in objects'])
    && hasAll(f('sec-built-in-function'), ['Examples of built-in functions include parseInt and Math.exp', 'A host or implementation may provide additional built-in functions'])
    && hasAll(f('sec-built-in-constructor'), ['Examples of built-in constructors include Object and Function', 'A host or implementation may provide additional built-in constructors'])
    && f('sec-boolean-object').includes('instance of the standard built-in Boolean constructor')
    && f('sec-terms-and-definitions-infinity').includes('positive infinite Number value') && f('sec-terms-and-definitions-nan').includes('NaN')
    && ['sec-standard-object', 'sec-built-in-object', 'sec-boolean-object', 'sec-terms-and-definitions-infinity', 'sec-terms-and-definitions-nan', 'sec-built-in-function', 'sec-built-in-constructor'].map(num).join() === '4.4.11,4.4.12,4.4.19,4.4.26,4.4.27,4.4.35,4.4.36',
  'lecture 1, 9, 15: the terms 4.4.11, 4.4.12, 4.4.19, 4.4.26, 4.4.27, 4.4.35, 4.4.36 and their notes (parseInt and Math.exp, Object and Function, hosts may add)');
  check(hasAll(B18, ['Unless specified otherwise, the [[Extensible]] internal slot of a built-in object initially has the value true', 'Every built-in function object has a [[Realm]] internal slot',
    'Such missing arguments are considered to be “not present” and may be identified in that manner by specification algorithms',
    'the extra arguments are evaluated by the call and then ignored by the function', 'as long as the behaviour is not the throwing of a TypeError exception that is predicated simply on the presence of an extra argument',
    'encouraged to do so by adding new functions rather than adding new parameters to existing functions',
    'has the Function prototype object, which is the initial value of the expression Function.prototype (20.2.3), as the value of its [[Prototype]] internal slot', 'every built-in prototype object has the Object prototype object',
    'If such an algorithm needs to distinguish the two cases, it checks whether NewTarget is undefined, which indicates a [[Call]] invocation',
    'Built-in function objects that are not identified as constructors do not implement the [[Construct]] internal method unless otherwise specified', 'Built-in function objects that are not constructors do not have a "prototype" property unless otherwise specified']),
  'lecture 1, 4, 5: chapter 18 — [[Extensible]] true, [[Realm]], missing arguments «not present», extra ones evaluated and ignored, no TypeError for them, note 1, %Function.prototype% and %Object.prototype%, NewTarget, no [[Construct]] and prototype');
  check(hasAll(B18, ['Unless otherwise specified, this value is the number of required parameters shown in the subclause heading for the function description. Optional parameters and rest parameters are not included in the parameter count',
    '«Array.prototype.map (callback [, thisArg])»', 'therefore the value of the "length" property of that function object is 1', 'Unless otherwise specified, the "length" property of a built-in function object has the attributes { [[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : true }',
    'Functions that are identified as anonymous functions use the empty String as the value of the "name" property', 'have "get" or "set" (respectively) passed to the prefix parameter when calling CreateBuiltinFunction',
    'The value of the "name" property is explicitly specified for each built-in functions whose property key is a Symbol value',
    'Every other data property described in clauses 19 through 28 and in Annex B.2 has the attributes { [[Writable]] : true, [[Enumerable]] : false, [[Configurable]] : true } unless otherwise specified',
    'Every accessor property described in clauses 19 through 28 and in Annex B.2 has the attributes { [[Enumerable]] : false, [[Configurable]] : true } unless otherwise specified', 'If only a get accessor function is described, the set accessor function is the default value, undefined'])
    && num('sec-createbuiltinfunction') === '10.3.4' && f('sec-createbuiltinfunction').includes('prefix'),
  'lecture 2, 3, 6: chapter 18 — length: required parameters, note 2 about map, the attributes; name: anonymous "", get/set prefix (10.3.4), symbol keys explicit; data and accessor properties of clauses 19–28');
  {
    // a heading as the lecture writes it: «(...args)», «[, options]» (the spec puts spaces around them)
    const heading = (id) => flat(clause(spec, id).match(/<h1>([\s\S]*?)<\/h1>/)[1]).replace(/ \]/g, ']').replace(/\[ /g, '[').replace(/\.\.\. /g, '...');
    check(f('sec-math.max').includes('The "length" property of this function is 2') && f('sec-array.prototype.push').includes('The "length" property of this method is 1')
      && f('sec-properties-of-the-date-constructor').includes('has a "length" property whose value is 7')
      && heading('sec-math.max').includes('Math.max (...args)') && heading('sec-array.prototype.push').includes('(...items)') && heading('sec-date').includes('Date (...values)')
      && heading('sec-promise-executor').includes('Promise (executor)') && heading('sec-regexp-pattern-flags').includes('RegExp (pattern, flags)') && heading('sec-proxy-target-handler').includes('Proxy (target, handler)')
      && heading('sec-error-message').includes('Error (message [, options])') && heading('sec-array.prototype.concat').includes('Array.prototype.concat (...items)')
      && f('sec-properties-of-the-function-prototype-object').includes('has a "name" property whose value is the empty String') && num('sec-properties-of-the-function-prototype-object') === '20.2.3',
    `lecture 2, 3: the headings — Math.max (...args), push (...items), Date (...values), Promise (executor), RegExp (pattern, flags), Proxy (target, handler), Error (message [, options]), concat (...items); lengths 2, 1, 7 written apart; Function.prototype name "" (20.2.3) [${heading('sec-error-message')}]`);
  }
  check(f('sec-array.prototype.reduce').includes('If initialValue is present') && f('sec-date').includes('Let numberOfArgs be the number of elements in values')
    && stepPath(clause(spec, 'sec-map-iterable'), 'If NewTarget is undefined, throw a TypeError exception') === '1' && stepPath(clause(spec, 'sec-promise-executor'), 'If NewTarget is undefined, throw a TypeError exception') === '1'
    && f('sec-date').includes('If NewTarget is undefined, then') && f('sec-array').includes('If NewTarget is undefined, let newTarget be the active function object'),
  'lecture 4, 5: reduce asks «If initialValue is present», Date counts its arguments; Map and Promise throw in step 1 without new; Date and Array check NewTarget');
  check(hasAll(f('sec-error-handling-and-language-extensions'), ['An early error is an error that can be detected and reported prior to the evaluation of any construct in the Script containing the error',
    'Early errors in eval code are reported at the time eval is called', 'Static Semantics: Early Errors', 'even if the compiler can prove that a construct cannot execute without error',
    'Except as restricted in 17.1, a host or implementation may extend Script syntax', 'Except as restricted in 17.1, a host or implementation may provide additional types, values, objects, properties, and functions',
    'host-defined behaviour instead of throwing an error (such as ReferenceError)'])
    && hasAll(f('sec-forbidden-extensions'), ['ECMAScript function objects defined using syntactic constructors in strict mode code must not be created with own properties named "caller" or "arguments"',
      'ArrowFunction, MethodDefinition, GeneratorDeclaration', 'ClassDeclaration, ClassExpression', 'Built-in functions, strict functions created using the Function constructor', 'and functions created using the bind method also must not be created with such own properties',
      'must not be a strict function object', 'The behaviour of built-in methods which are specified in ECMA-402, such as those named toLocaleString, must not be extended except as specified in ECMA-402',
      'When parsing for the Module goal symbol, the lexical grammar extensions defined in B.1.1 must not be supported'])
    && num('sec-html-like-comments') === 'B.1.1' && f('sec-html-like-comments').includes('this extension is not allowed when parsing source text using the goal symbol Module'),
  'lecture 7, 10: chapter 17 — early errors, eval checked when called, «Static Semantics: Early Errors», «even if the compiler can prove…», «Except as restricted in 17.1», ReferenceError of a host; 17.1 — caller and arguments, ECMA-402, B.1.1 HTML-like comments not in modules');
  check(inOrder(f('sec-addrestrictedfunctionproperties'), ['Let thrower be realm. [[Intrinsics]].[[ %ThrowTypeError% ]]', 'PropertyDescriptor { [[Get]] : thrower, [[Set]] : thrower, [[Enumerable]] : false, [[Configurable]] : true }', '"arguments"'])
    && num('sec-addrestrictedfunctionproperties') === '10.2.4',
  'lecture 7 (finding): 10.2.4 — caller and arguments of Function.prototype get and set %ThrowTypeError%, the same function');
  check(hasAll(f('sec-global-object'), ['is created before control enters any execution context', 'does not have a [[Construct]] internal method', 'does not have a [[Call]] internal method',
    'has a [[Prototype]] internal slot whose value is host-defined', 'may have host-defined properties in addition to the properties defined in this specification', 'This may include a property whose value is the global object itself'])
    && f('sec-globalthis').includes('realm. [[GlobalEnv]]. [[GlobalThisValue]]') && f('sec-globalthis').includes(ATTR('true', 'false', 'true'))
    && ['sec-value-properties-of-the-global-object-infinity', 'sec-value-properties-of-the-global-object-nan', 'sec-undefined'].every((id) => f(id).includes(ATTR('false', 'false', 'false')))
    && ['sec-globalthis', 'sec-value-properties-of-the-global-object-infinity', 'sec-value-properties-of-the-global-object-nan', 'sec-undefined'].map(num).join() === '19.1.1,19.1.2,19.1.3,19.1.4',
  'lecture 8, 9: 19 — before any context, no [[Construct]] and [[Call]], host-defined prototype and properties, «This may include…»; 19.1.1 GlobalThisValue, writable and configurable; 19.1.2–19.1.4 fixed');
  check(inOrder(f('sec-hasrestrictedglobalproperty'), ['If existingProp is undefined, return false', 'If existingProp. [[Configurable]] is true, return false. Return true'])
    && f('sec-candeclareglobalvar').includes('If hasProperty is true, return true') && f('sec-createglobalvarbinding').includes('If a binding already exists, it is reused')
    && num('sec-well-known-intrinsic-objects') === '6.1.7.4'
    && f('sec-runtime-semantics-evaluateasyncfunctionbody').includes('Let promiseCapability be ! NewPromiseCapability (%Promise%)'),
  'lecture 9, 10, 15: HasRestrictedGlobalProperty — a non-configurable property forbids let; CanDeclareGlobalVar allows var over an existing property; CreateGlobalVarBinding reuses it; 6.1.7.4; an async function takes %Promise%');
  {
    const subs = (id, n) => [...clause(spec, id).matchAll(/<emu-clause id="([^"]+)"/g)].length === 0 && [...spec.slice(spec.indexOf(`id="${id}"`)).matchAll(/<span class="secnum">([^<]+)<\/span>/g)].slice(1).map((m) => m[1]).filter((s) => new RegExp(`^${n.replace(/\./g, '\\.')}\\.\\d+$`).test(s));
    // the titles of the direct subclauses of n, once each (every number is printed twice: in the menu and in the text)
    const firstWords = (n) => { const seen = new Map(); const re = new RegExp(`<span class="secnum">(${n.replace(/\./g, '\\.')}\\.\\d+)</span>\\s*([^<(]+)`, 'g'); for (const m of spec.matchAll(re)) if (!seen.has(m[1])) seen.set(m[1], m[2].trim()); return [...seen.values()]; };
    const globals19_2 = firstWords('19.2');
    const ctors = firstWords('19.3');
    const others = firstWords('19.4');
    const values = firstWords('19.1');
    const uri = firstWords('19.2.6').filter((s) => /^(de|en)codeURI/.test(s));
    void subs;
    check(values.length === 4 && ctors.length === 42 && others.length === 4 && JSON.stringify(others) === JSON.stringify(['Atomics', 'JSON', 'Math', 'Reflect'])
      && globals19_2.filter((s) => s !== 'URI Handling Functions').length + uri.length === 9 && ['sec-escape-string', 'sec-unescape-string'].every((id) => spec.includes(`id="${id}"`))
      && [...clause(spec, 'sec-constructor-properties-of-the-global-object').matchAll(/See /g)].length === 0,
    `lecture 10, 15: 59 properties — ${values.length} values, ${globals19_2.length - 1} + ${uri.length} functions, ${ctors.length} constructors, ${others.length} objects (${others.join(', ')}); Annex B escape and unescape exist`);
    const tally = { errors: ['AggregateError', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'], wrappers: ['Boolean', 'Number', 'BigInt', 'String', 'Symbol'],
      collections: ['Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry'], binary: ['ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'BigInt64Array', 'BigUint64Array', 'Float16Array', 'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array'],
      rest: ['Object', 'Function', 'Array', 'Date', 'RegExp', 'Promise', 'Proxy', 'Iterator'] };
    const grouped = Object.values(tally).flat();
    check(grouped.length === 42 && new Set(grouped).size === 42 && grouped.every((n) => ctors.includes(n)) && [8, 5, 6, 15, 8].join() === Object.values(tally).map((g) => g.length).join(),
      'lecture 15: the table of 42 constructors — 8 errors, 5 wrappers, 6 collections and references, 15 for binary data, 8 others, each of 19.3 once');
  }
  check(hasAll(f('sec-isnan-number'), ['Let num be ? ToNumber (number)', 'A reliable way for ECMAScript code to test if a value X is NaN is an expression of the form X !== X'])
    && f('sec-isfinite-number').includes('Let num be ? ToNumber (number)')
    && hasAll(f('sec-parsefloat-string'), ['Let trimmedString be ! TrimString (inputString, start)', 'the longest prefix of trimmed that satisfies the syntax of a StrDecimalLiteral'])
    && f('sec-number.parseint').includes('The initial value of the "parseInt" property is %parseInt%') && f('sec-number.parsefloat').includes('The initial value of the "parseFloat" property is %parseFloat%')
    && num('sec-number.parseint').startsWith('21.1.2'),
  'lecture 11: isFinite and isNaN begin with ToNumber, the note X !== X; parseFloat — TrimString and the longest StrDecimalLiteral prefix; Number.parseInt and Number.parseFloat are %parseInt% and %parseFloat% (21.1.2)');
  {
    const pi = clause(spec, 'sec-parseint-string-radix');
    check(inOrder(f('sec-parseint-string-radix'), ['Let inputString be ? ToString (string)', 'Let S be ! TrimString (inputString, start)', 'set sign to -1', 'set S to the substring of S from index 1', 'Let R be ℝ (? ToInt32 (radix))',
      'If R < 2 or R > 36, return NaN', 'If R ≠ 16, set stripPrefix to false', 'Set R to 10', 'the first two code units of S are either "0x" or "0X"', 'If Z is empty, return NaN',
      'if R = 10 and Z contains more than 20 significant digits, every significant digit after the 20th may be replaced by a 0 digit', 'If sign = -1, return -0'])
      && stepPath(pi, 'Let inputString be ? ToString (string)') === '1' && stepPath(pi, 'If R < 2 or R > 36, return NaN') === '8.a' && stepPath(pi, 'Set R to 10') === '9.a'
      && stepPath(pi, 'Let mathInt be the integer value') === '14',
    `lecture 12, 13: 19.2.5 in order — ToString, TrimString, sign, ToInt32, 2–36, stripPrefix, 10, 0x, empty Z, 20 digits, −0; steps 1, 8, 9 and 14 as the lecture names them [${stepPath(pi, 'If R < 2 or R > 36, return NaN')}, ${stepPath(pi, 'Set R to 10')}, ${stepPath(pi, 'Let mathInt be the integer value')}]`);
  }
  check(hasAll(f('sec-uri-handling-functions'), ['encodeURI and decodeURI are intended to work with complete URIs', 'encodeURIComponent and decodeURIComponent are intended to work with the individual components of a URI',
    'The set of reserved characters is based upon RFC 2396 and does not reflect changes introduced by the more recent RFC 3986'])
    && f('sec-encodeuri-uri').includes('Let extraUnescaped be ";/?:@&=+$,#"') && f('sec-encodeuricomponent-uricomponent').includes('Let extraUnescaped be the empty String')
    && f('sec-decodeuri-encodeduri').includes('Let preserveEscapeSet be ";/?:@&=+$,#"')
    && inOrder(f('sec-encode'), ['Let alwaysUnescaped be the string-concatenation of the ASCII word characters and "-.!~*\'()"', 'If cp. [[IsUnpairedSurrogate]] is true, throw a URIError exception', 'applying the UTF-8 transformation to cp. [[CodePoint]]', 'formatted as an uppercase hexadecimal number'])
    && flat(spec).includes('which consists solely of every letter and number in the Unicode Basic Latin block along with U+005F (LOW LINE)')
    && hasAll(f('sec-decode'), ['If k + 3 > len, throw a URIError exception', 'If B is not an integer, throw a URIError exception', 'If preserveEscapeSet contains asciiChar, set S to escape', 'If Octets does not contain a valid UTF-8 encoding of a Unicode code point, throw a URIError exception',
      'RFC 3629 prohibits the decoding of invalid UTF-8 octet sequences', 'the invalid sequence 0xC0 0x80 must not decode'])
    && f('sec-parsehexoctet').includes('HexDigits') && num('sec-encode') === '19.2.6.5',
  'lecture 14: 19.2.6 — whole URIs and components, note 1 RFC 2396; extraUnescaped and preserveEscapeSet ;/?:@&=+$,#; Encode (19.2.6.5) — ASCII word characters (with _) and -.!~*\'(), unpaired surrogate, UTF-8, uppercase; Decode — three URIErrors, RFC 3629 and C0 80; ParseHexOctet');
  check(hasAll(f('sec-boolean-constructor'), ['creates and initializes a new Boolean object when called as a constructor', 'performs a type conversion when called as a function rather than as a constructor', 'must include a super call to the Boolean constructor'])
    && inOrder(f('sec-boolean-constructor-boolean-value'), ['Let b be ToBoolean (value). If NewTarget is undefined, return b', 'OrdinaryCreateFromConstructor (NewTarget, "%Boolean.prototype%", «[[BooleanData]]»)'])
    && f('sec-properties-of-the-boolean-constructor').includes('has a [[Prototype]] internal slot whose value is %Function.prototype%')
    && f('sec-properties-of-the-boolean-prototype-object').includes('is itself a Boolean object; it has a [[BooleanData]] internal slot with the value false')
    && inOrder(f('sec-thisbooleanvalue'), ['If value is a Boolean, return value', 'If value is an Object and value has a [[BooleanData]] internal slot', 'Throw a TypeError exception'])
    && f('sec-properties-of-boolean-instances').includes('Boolean instances have a [[BooleanData]] internal slot') && num('sec-boolean-objects') === '20.3',
  'lecture 15: 20.3 — a conversion without new, a wrapper with new, super for subclasses; Boolean.prototype is a Boolean with false; ThisBooleanValue; instances have [[BooleanData]]');

  // the notes: the step numbers of the parseInt table, the lengths of homework 1
  {
    const pi = clause(spec, 'sec-parseint-string-radix');
    const sp = (w) => stepPath(pi, w);
    const heading = (id) => flat(clause(spec, id).match(/<h1>([\s\S]*?)<\/h1>/)[1]).replace(/ \]/g, ']').replace(/\[ /g, '[').replace(/\.\.\. /g, '...');
    check(sp('Let inputString be ? ToString (string)') === '1' && sp('Let S be ! TrimString (inputString, start)') === '2' && sp('Let sign be 1') === '3' && sp('set S to the substring of S from index 1') === '5'
      && sp('Let R be ℝ (? ToInt32 (radix))') === '6' && sp('Set R to 10') === '9.a' && sp('the first two code units of S are either "0x" or "0X"') === '10.a' && sp('If Z is empty, return NaN') === '13'
      && sp('If sign = -1, return -0') === '15.a' && sp('Return 𝔽 (sign × mathInt)') === '16',
    'student table 3: the steps of 19.2.5 — 1–2 ToString and trim, 3–5 sign, 6–9 radix, 10 0x, 11–13 digits and empty, 14–16 the number and −0');
    check(f('sec-json.parse').includes('The "length" property of this function is 2') && heading('sec-json.parse').includes('JSON.parse (text [, reviver])')
      && heading('sec-string.prototype.replace').includes('(searchValue, replaceValue)') && heading('sec-array.prototype.splice').includes('(start, deleteCount,...items)')
      && heading('sec-function.prototype.call').includes('(thisArg,...args)') && heading('sec-array.prototype.indexof').includes('(searchElement [, fromIndex])'),
    `student homework 1: the headings give replace 2, splice 2, call 1, indexOf 1; JSON.parse (text [, reviver]) has 2 written apart [${heading('sec-array.prototype.splice')}]`);
  }

  // what the tasks say about the text of ECMA-262 2026
  {
    const heading = (id) => flat(clause(spec, id).match(/<h1>([\s\S]*?)<\/h1>/)[1]).replace(/ \]/g, ']').replace(/\[ /g, '[').replace(/\.\.\. /g, '...');
    check(heading('sec-array.prototype.slice').includes('(start, end)') && heading('sec-array.prototype.fill').includes('(value [, start [, end]])')
      && heading('sec-object.defineproperty').includes('(O, P, Attributes)') && heading('sec-string.prototype.split').includes('(separator, limit)')
      && heading('sec-promise.prototype.then').includes('(onFulfilled, onRejected)') && heading('sec-array.of').includes('Array.of (...items)') && heading('sec-set-iterable').includes('Set ([iterable])')
      && stepPath(clause(spec, 'sec-set-iterable'), 'If NewTarget is undefined, throw a TypeError exception') === '1',
    `task 1: the headings — slice (start, end), fill (value [, start [, end]]), defineProperty (O, P, Attributes), split (separator, limit), then (onFulfilled, onRejected), Array.of (...items), Set ([iterable]); Set throws in step 1 [${heading('sec-array.prototype.fill')}]`);
    check(f('sec-createglobalfunctionbinding').includes('Let desc be the PropertyDescriptor { [[Value]] : V, [[Writable]] : true, [[Enumerable]] : true, [[Configurable]] : D }')
      && hasAll(f('sec-globaldeclarationinstantiation'), ['CreateGlobalFunctionBinding (env, fn, fo, false)', 'CreateGlobalVarBinding (env, vn, false)']),
    'task 2: a function declaration — writable, enumerable, configurable D; GlobalDeclarationInstantiation passes false for both var and function');
    check(f('sec-parseint-string-radix').includes('using the letters A through Z and a through z for digits with values 10 through 35'),
      'task 3: the digits of parseInt — 0–9 and the Latin letters, nothing else');
    check(f('sec-string.prototype.concat').includes('Let nextString be ? ToString (next)') && f('sec-string-constructor-string-value').includes('If NewTarget is undefined and value is a Symbol, return SymbolDescriptiveString (value)'),
      'task 4: concat calls ToString (a symbol throws), String(symbol) returns SymbolDescriptiveString');
    check(hasAll(f('sec-function.prototype.tostring'), ['has a [[SourceText]] internal slot', 'Return CodePointsToString (func. [[SourceText]])', 'If func is a built-in function object, return an implementation-defined String source code representation of func. The representation must have the syntax of a NativeFunction'])
      && num('sec-function.prototype.tostring') === '20.2.3.5' && f('sec-runtime-semantics-definemethod').includes('OrdinaryFunctionCreate (prototype, sourceText') && !f('sec-runtime-semantics-definemethod').includes('MakeConstructor'),
    'task 6: 20.2.3.5 — the source text of an ECMAScript function, NativeFunction of a built-in; DefineMethod creates the closure without MakeConstructor');
    check(hasAll(f('sec-tonumber-applied-to-the-string-type'), ['StrWhiteSpaceChar ::: WhiteSpace LineTerminator', 'StrUnsignedDecimalLiteral ::: Infinity']) && num('sec-tonumber-applied-to-the-string-type') === '7.1.4.1'
      && f('sec-trimstring').includes('The definition of white space is the union of WhiteSpace and LineTerminator'),
    'task 9: 7.1.4.1 — StrDecimalLiteral, Infinity among its forms; white space of TrimString is WhiteSpace and LineTerminator (U+2028 too)');
    const tasks = fs.readFileSync(path.join(DAY, 'tasks.html'), 'utf8');
    const gone = [...tasks.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]).filter((a) => !spec.includes(`id="${a}"`));
    const tfooter = tasks.slice(tasks.indexOf('<div class="sources">'));
    check(gone.length === 0 && ['encodeURIComponent()', 'globalThis', 'ECMA-262 2026'].every((s) => tfooter.includes(s)), `tasks: every tc39.es anchor exists, the footer names the MDN pages and ECMA-262 ${gone.join(', ')}`);
  }

  // the MDN pages the lecture quotes
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/global_objects/${p}/index.md`], { encoding: 'utf8' });
  // MDN markdown as text: {{jsxref("X")}} and {{domxref("A/x", "x")}} macros, links and backticks dropped
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
  {
    const g = plain(mdn('globalthis'));
    const e = plain(mdn('encodeuricomponent'));
    check(g.includes('Historically, accessing the global object has required different syntax in different JavaScript environments') && g.includes('### HTML and the WindowProxy')
      && g.includes('in Web Workers only self will work') && g.includes('In Node.js none of these work, and you must instead use global') && g.includes('it references a Proxy around the actual global object')
      && e.includes('For application/x-www-form-urlencoded, spaces are to be replaced by +'),
    'lecture 9, 16: MDN globalThis — «Historically…», window/self/frames, Workers self, Node global, «HTML and the WindowProxy» (a proxy around the global object); encodeURIComponent — + for x-www-form-urlencoded');
    check(e.includes('### Encoding for RFC3986') && e.includes("The more recent RFC3986 reserves !, ', (, ), and *"),
      'student homework 4: MDN encodeURIComponent «Encoding for RFC3986» — RFC3986 reserves ! \' ( ) *');
    const notes = fs.readFileSync(path.join(DAY, 'student.html'), 'utf8');
    const nfooter = notes.slice(notes.indexOf('<div class="sources">'));
    check(['globalThis', 'encodeURIComponent()', 'ECMA-262 2026'].every((s) => nfooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 2,
      'student: the footer names the MDN pages the notes use (globalThis in «запомни», encodeURIComponent in homework 4) and ECMA-262 2026');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const page = (p) => flat(read(p));
  check(hasAll(page('advanced/day-01/lecture.html'), ['4.4.11 standard object', '4.4.12 built-in object', '4.4.19 Boolean object', '4.4.26 Infinity', '4.4.27 NaN', '4.4.35 built-in function', '4.4.36 built-in constructor'])
    && hasAll(page('advanced/day-02/lecture.html'), ['FEFF', '00A0']) && page('advanced/day-05/lecture.html').includes('ToNumber') && page('advanced/day-06/lecture.html').includes('ToInt32')
    && hasAll(page('advanced/day-09/lecture.html'), ['[[Realm]]', 'IsArray', 'iframe'])
    && hasAll(page('advanced/day-13/lecture.html'), ['HasRestrictedGlobalProperty', 'var total дал неудаляемое свойство окна', 'SyntaxError', 'eval'])
    && page('advanced/day-14/lecture.html').includes('OrdinarySetWithOwnDescriptor') && hasAll(page('advanced/day-15/lecture.html'), ['window', 'bound ', 'Object.prototype.toString'])
    && hasAll(read('advanced/day-16/lecture.html'), ['JSON.stringify(revoke.name)', 'kitap function 0 "" proxy,revoke'])
    && hasAll(page('advanced/day-17/lecture.html'), ['RegExp(re)', 'Symbol is not a constructor', 'На дне 18']),
  'lecture: course 3 — the terms of day 1; FEFF and 00A0 (2); ToNumber (5); ToInt32 (6); [[Realm]], IsArray, iframe (9); HasRestrictedGlobalProperty, var — a non-configurable property, eval (13); OrdinarySetWithOwnDescriptor (14); window, bound (15); revoke "" (16); RegExp(re), new Symbol, the promise of day 18 (17)');
  check(page('essentials/day-20/lecture.html').includes('Ловушка map(parseInt)') && page('essentials/day-31/lecture.html').includes('encodeURIComponent')
    && hasAll(page('intermediate/day-20/lecture.html'), ['URIError', 'одиноким суррогатом']),
  'lecture 13, 14: Essentials — map(parseInt) (day 20), encodeURIComponent (day 31); course 2 — URIError on a lone surrogate (day 20)');
  {
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    check(hasAll(plan, ['**19. Мини-проект: наблюдаемое хранилище на Proxy и Reflect.**', 'доходят до подписчиков, и страница перерисовывается сама', 'Операции пересылаются через `Reflect` с верным `receiver`',
      'вложенные объекты и массивы оборачиваются при чтении', 'У каждого необычного места — комментарий со ссылкой на раздел', '**31. Наследие и совместимость: приложение B, with, устаревшие методы.**']),
    'lecture 17: day 19 as the plan says; day 31 for the legacy');
    const ahead = read('tools/check-ahead.mjs');
    check(hasAll(ahead, ["day3: 20, re: /\\b(?:ArrayBuffer|", "day3: 21, re: /\\b(?:DataView|Float16Array)\\b", "day3: 22, re: /\\b(?:SharedArrayBuffer|Atomics)\\b", "day3: 24, re: /\\b(?:WeakRef|FinalizationRegistry)\\b", "id: 'proxy'", 'day3: 16', "id: 'reflect'", 'day3: 17']),
      'lecture 15 and the reference table: the days of course 3 for the binary data (20, 21, 22), WeakRef and FinalizationRegistry (24), Proxy (16), Reflect (17) are those of check-ahead');

    // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
    const lecture = read('advanced/day-18/lecture.html');
    const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
    const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '18').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '18').map((c) => c[0]);
    const missing = specRows.filter((id) => !refSpec.includes(id));
    check(specRows.length === 69 && mdnRows.length === 0 && refSpec.length === 69 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 18, ${refSpec.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '18' && c[9] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 6 && JSON.stringify(fullSpec) === JSON.stringify(markedSpec), `plan: the 6 rows "подробно" are marked so in the table ${JSON.stringify(markedSpec)}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    check(['globalThis', 'encodeURIComponent()', 'ECMA-262 2026'].every((s) => footer.includes(s)) && (lecture.match(/developer\.mozilla\.org/g) || []).length === 3,
      'links: the footer names the two MDN pages the text quotes and ECMA-262 2026; MDN is linked only there and at the two quotes');
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
