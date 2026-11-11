// Course 3, day 21, in Chrome: DataView, byte order, Float16 and base64. Every ```js block of the lecture runs as the only
// <script> in the <body> of a clean page, the way a student would paste it into a file. Console output is rebuilt from
// Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …". The context
// is Ashgabat time and Russian.
//   node tools/runs/advanced/day-21.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-21.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output (the notes: the comment of every console.log line); the
// homework of the notes in Chrome and the steps it asks for; the cheatsheet runs without an error; the experiments
// the lecture only tells about (26 names of DataView.prototype and no getUint8Clamped, Math.f16round of 65519 and 1e-8,
// the fraction bits and the largest numbers of the table of section 7, the alignment a view needs and DataView does
// not, a detached buffer, whitespace in base64, the methods only Uint8Array has, the 44 bytes of the WAV header); what
// the lecture says about the text of ECMA-262 2026 (every step it names in 25.3, 25.1.3, 23.3, 21.3.2.18, the methods
// of 25.3.4, table 70, the agent's [[LittleEndian]]) is checked against tools/.cache/ecma262-2026.html; the MDN pages it
// quotes are in tools/.cache/mdn-content.git and say what it says; the days it points to say what it says; the
// reference table holds all 45 rows of the day's plan (35 of MDN, 10 of ECMA-262) as links with their marks, every
// tc39.es anchor exists and every link whose text starts with a number names the section of that number.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-21');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['0 255 212 195 178 161 5 -44 a1b2', 'RangeError RangeError RangeError -95'],
  'tasks #1': ['191 0 0 0 bf00 bf00 bf00 bf00 bf bf00 bf bf bf00', '16777216 true 0 75'],
  'tasks #2': ['TWFu TWE= TQ __4=', '77,97 77,97 SyntaxError SyntaxError SyntaxError'],
  'tasks #8': ['{"read":6,"written":3} 1,2,3', 'SyntaxError 10,11,0,0', 'SyntaxError 0,0,0,0 TypeError', 'TypeError {"read":0,"written":0} SyntaxError'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
// No template literals inside: Node reads these strings as templates first.
const SOLUTIONS = {
  imageSize: `function imageSize(input) {
  const bytes = typeof input === "string" ? Uint8Array.fromBase64(input) : input;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hex = bytes.subarray(0, 8).toHex();
  if (hex === "89504e470d0a1a0a" && bytes.length >= 24) return { type: "png", width: dv.getUint32(16), height: dv.getUint32(20) };
  if (hex.startsWith("47494638") && bytes.length >= 10) return { type: "gif", width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (hex.startsWith("424d") && bytes.length >= 26) return { type: "bmp", width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)) };
  return null;
}`,
  swapBytes: `function swapBytes(view) {
  const size = view.BYTES_PER_ELEMENT;
  if (size === 1) return view;
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  const get = { 2: "getUint16", 4: "getUint32", 8: "getBigUint64" }[size];
  const set = get.replace("get", "set");
  for (let i = 0; i < view.byteLength; i += size) dv[set](i, dv[get](i, true), false);
  return view;
}`,
  pickFloat: `function pickFloat(values, eps) {
  const kinds = [[Float16Array, Math.f16round], [Float32Array, Math.fround]];
  for (const [Kind, round] of kinds) {
    if (values.every((x) => { const r = round(x); return Object.is(r, x) || Math.abs(r - x) <= eps; })) return Kind;
  }
  return Float64Array;
}`,
  packProgress: `function packProgress(counts) {
  const packed = new Uint8Array(3 + counts.length);
  const head = new DataView(packed.buffer);
  head.setUint8(0, 1);
  head.setUint16(1, counts.length);
  packed.set(counts, 3);
  return packed.toBase64({ alphabet: "base64url", omitPadding: true });
}`,
  unpackProgress: `function unpackProgress(link) {
  let bytes;
  try { bytes = Uint8Array.fromBase64(link, { alphabet: "base64url" }); } catch { return null; }
  if (bytes.length < 3) return null;
  const head = new DataView(bytes.buffer);
  if (head.getUint8(0) !== 1 || head.getUint16(1) !== bytes.length - 3) return null;
  return bytes.slice(3);
}`,
  myToBase64: `function myToBase64(bytes, { alphabet = "base64", omitPadding = false } = {}) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" + (alphabet === "base64url" ? "-_" : "+/");
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const left = bytes.length - i;
    const n = (bytes[i] << 16) | ((left > 1 ? bytes[i + 1] : 0) << 8) | (left > 2 ? bytes[i + 2] : 0);
    out += abc[n >> 18] + abc[(n >> 12) & 63];
    out += left > 1 ? abc[(n >> 6) & 63] : omitPadding ? "" : "=";
    out += left > 2 ? abc[n & 63] : omitPadding ? "" : "=";
  }
  return out;
}`,
};
const NEEDS = {};
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
    if (name === 'lecture') check(blocks.length === 19 && blocks.filter((x) => x.cheat).length === 1, `lecture: 18 blocks and the cheatsheet (${blocks.length})`);
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

  // what the lecture only tells about (probes d21_a.txt … d21_c.txt before writing)
  const told = async (code, want, text, file) => { const out = await runScript(ctx, code, file); check(same(out, want), `${text} ${JSON.stringify(out)}`); };
  await told(`const names = Object.getOwnPropertyNames(DataView.prototype);
console.log(names.length, names.filter((n) => /^(get|set)/.test(n)).length, names.includes("getUint8Clamped"), names.filter((n) => !/^(get|set)/.test(n)).sort().join());`,
  ['26 22 false buffer,byteLength,byteOffset,constructor'], 'lecture 5: Object.getOwnPropertyNames(DataView.prototype) — 26 names: 22 methods get…/set…, no getUint8Clamped, the getters buffer, byteLength, byteOffset and constructor', 'names.html');
  await told('console.log(Math.f16round(65519), Math.f16round(65520), 1e-8 < 2 ** -25, Math.f16round(2 ** -24) === 2 ** -24, Math.f16round(1e-8));',
    ['65504 Infinity true true 0'], 'lecture 7: Math.f16round(65519) is still 65504, 65520 — Infinity; 1e-8 is under half the smallest float16 2^-24 and becomes 0', 'f16.html');
  await told(`const bits = (round) => { let b = 0; while (round(1 + 2 ** -(b + 1)) !== 1) b++; return b; };
console.log(bits(Math.f16round), bits(Math.fround), bits((x) => x));
console.log([11, 24, 53].map((b) => (b * Math.log10(2)).toFixed(1)).join(" "));
console.log(Math.f16round(65504), Math.fround(3.4028234663852886e38).toPrecision(2), Math.fround(3.5e38), Number.MAX_VALUE.toPrecision(2));`,
  ['10 23 52', '3.3 7.2 16.0', '65504 3.4e+38 Infinity 1.8e+308'],
  'lecture 7, the table: fraction bits 10, 23, 52 (Math.f16round, Math.fround, Number); about 3, 7, 16 significant digits; the largest 65504, ≈ 3.4e38, ≈ 1.8e308', 'formats.html');
  await told(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const buf = new ArrayBuffer(4);
console.log(run(() => new Uint16Array(buf, 1)), new DataView(buf).getUint16(1));
const rab = new ArrayBuffer(4, { maxByteLength: 8 });
const ta = new Uint8Array(rab, 0, 4);
rab.resize(2);
buf.transfer();
console.log(run(() => new DataView(buf)), ta.length);`,
  ['RangeError 0', 'TypeError 0'], 'lecture 1, 15: Uint16Array needs an even offset, DataView reads from byte 1; DataView of a detached buffer — TypeError (step 4); a view with a length out of bounds pretends to be empty — 0', 'bounds.html');
  await told(`const wav = "UklGRkRiBQBXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YSBiBQA=";
console.log(Uint8Array.fromBase64("AQ\\nID\\t").join(), Uint8Array.fromBase64(wav).length);
console.log("toBase64" in Uint8ClampedArray.prototype, typeof Int8Array.fromBase64, Object.getOwnPropertyNames(Uint8Array.prototype).sort().join(), Object.getOwnPropertyNames(Uint8Array).filter((n) => n.startsWith("from")).sort().join());`,
  ['1,2,3 44', 'false undefined BYTES_PER_ELEMENT,constructor,setFromBase64,setFromHex,toBase64,toHex fromBase64,fromHex'],
  'lecture 11, 12, 16: fromBase64 skips a newline and a tab; the WAV header is 44 bytes; toBase64, toHex, setFrom…, fromBase64, fromHex are own properties of Uint8Array only', 'uint8.html');
  // the notes: the homework, in Chrome (probe d21_student.txt before writing)
  await told(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const buf = new ArrayBuffer(4);
const dv = new DataView(buf);
dv.setUint32(0, 0x12345678);
console.log(new Uint8Array(buf).join(" "), dv.getUint32(0, true).toString(16), new Uint32Array(buf)[0].toString(16), dv.getUint16(1).toString(16), run(() => dv.getUint32(1)));`,
  ['18 52 86 120 78563412 78563412 3456 RangeError'], 'student homework 1: 0x12345678 big-endian — bytes 18 52 86 120; little-endian and the view read 78563412; getUint16(1) — 3456; getUint32(1) — RangeError', 'student-h1.html');
  await told(`const lastBit = (x) => { const d = new DataView(new ArrayBuffer(2)); d.setFloat16(0, x); return d.getUint16(0) & 1; };
console.log(Float16Array.of(1024.5, 1025.5, 4097, 4098, 4102).join(" "));
console.log([1025, 2047, 4100, 8188].every((x) => Math.f16round(x) === x), [1024.5, 2047.5, 4098, 4101, 8190].some((x) => Math.f16round(x) === x));
console.log([1024, 1025, 1026, 4096, 4100, 4104].map(lastBit).join(""));`,
  ['1024 1026 4096 4096 4104', 'true false', '010010'], 'student homework 2: 1024.5 → 1024, 1025.5 → 1026, 4097 → 4096 (not a tie), 4098 → 4096, 4102 → 4104; steps 1 between 1024 and 2048, 4 between 4096 and 8192; the last bit of the fraction: 1025 and 4100 odd, 1024, 1026, 4096, 4104 even', 'student-h2.html');
  await told(`const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const n = [1, 2, 3, 4, 5];
console.log(n.map((k) => new Uint8Array(k).toBase64().length).join(" "), n.map((k) => new Uint8Array(k).toBase64({ omitPadding: true }).length).join(" "));
console.log(Uint8Array.fromBase64("AQIDBAU").join(), run(() => Uint8Array.fromBase64("AQIDBAU", { lastChunkHandling: "strict" })), Uint8Array.fromBase64("AQIDBAU", { lastChunkHandling: "stop-before-partial" }).join());`,
  ['4 4 4 8 8 2 3 4 6 7', '1,2,3,4,5 SyntaxError 1,2,3'], 'student homework 3: toBase64 of 1…5 bytes — 4 4 4 8 8 signs, without "=" — 2 3 4 6 7; "AQIDBAU": loose 1,2,3,4,5, strict SyntaxError, stop-before-partial 1,2,3', 'student-h3.html');
  await told(`const a8 = new Uint8Array(8);
const r8 = a8.setFromBase64("PGI+ TURO PC9i Pg==");
const a9 = new Uint8Array(9);
const r9 = a9.setFromBase64("PGI+ TURO PC9i Pg==");
console.log(JSON.stringify(r8), a8.join(), JSON.stringify(r9), a9.join());`,
  ['{"read":9,"written":6} 60,98,62,77,68,78,0,0 {"read":14,"written":9} 60,98,62,77,68,78,60,47,98'], 'student homework 4: "PGI+ TURO PC9i Pg==" into 8 bytes — read 9 (the space counts), written 6; into 9 bytes — read 14, written 9', 'student-h4.html');
  // the tasks: what the criteria ask to find, with the reference solutions (probe d21_tasks.txt before writing)
  await told(`${SOLUTIONS.imageSize}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
const png = "iVBORw0KGgoAAAANSUhEUgAAAoAAAAHgCAIAAAA=";
const file = new Uint8Array(100);
file.set(Uint8Array.fromBase64(png), 7);
const bytes = file.subarray(7);
console.log(JSON.stringify(imageSize(bytes)), new DataView(bytes.buffer).getUint32(16), JSON.stringify(imageSize("R0lGODlhQAHIAIAAAA==")));
console.log(run(() => [new Uint8Array(0), Uint8Array.of(0x89, 0x50), Uint8Array.of(66, 77, 1), Uint8Array.of(71, 73, 70, 56), "", "iVBORw0KGgo="].map(imageSize).join()));`,
  ['{"type":"png","width":640,"height":480} 3401 {"type":"gif","width":320,"height":200}', 'ok'],
  'task 4: the PNG from byte 7 of a 100-byte file — 640 × 480, while new DataView(bytes.buffer) reads 3401 from the start of the buffer; the GIF as base64 — 320 × 200; short files give null without an error', 'task4.html');
  await told(`${SOLUTIONS.swapBytes}
const kinds = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, BigInt64Array, BigUint64Array, Float16Array, Float32Array, Float64Array];
let bad = 0, cases = 0;
for (const K of kinds) for (let t = 0; t < 50; t++) {
  cases++;
  const s = K.BYTES_PER_ELEMENT;
  const raw = Uint8Array.from({ length: s * 5 }, () => Math.floor(Math.random() * 256));
  const v = new K(raw.slice().buffer);
  swapBytes(v);
  const once = new Uint8Array(v.buffer);
  for (let i = 0; i < raw.length; i++) { const e = Math.floor(i / s) * s; if (once[i] !== raw[e + s - 1 - (i - e)]) bad++; }
  swapBytes(v);
  if (new Uint8Array(v.buffer).join() !== raw.join()) bad++;
}
const nanBytes = Uint8Array.of(0x01, 0x00, 0x80, 0x7F);
const fdv = new DataView(nanBytes.buffer);
fdv.setFloat32(0, fdv.getFloat32(0, true), false);
const viaInt = Float32Array.from([0]);
new Uint8Array(viaInt.buffer).set([0x01, 0x00, 0x80, 0x7F]);
swapBytes(viaInt);
console.log(cases, bad, nanBytes.join(" "), new Uint8Array(viaInt.buffer).join(" "));`,
  ['600 0 127 192 0 1 127 128 0 1'],
  'task 5: random bytes of all twelve kinds — once reverses every element, twice gives the bytes back; getFloat32/setFloat32 turned 01 00 80 7F into 7F C0 00 01, swapBytes gives 7F 80 00 01', 'task5.html');
  await told(`${SOLUTIONS.pickFloat}
const absOnly = (x) => Math.abs(Math.f16round(x) - x) <= 0;
console.log([pickFloat([Infinity, -0, NaN], 0), pickFloat([2049], 0.5), pickFloat([2050], 0.5)].map((K) => K.name).join(" "), absOnly(Infinity), absOnly(NaN), absOnly(-0));
let diff = 0, n = 0;
for (let i = -70000; i <= 70000; i += 0.37) { n++; const x = i * (1 + Math.random()); if (!Object.is(Math.f16round(x), Float16Array.of(x)[0])) diff++; }
console.log(n, diff);`,
  ['Float16Array Float32Array Float16Array false false true', '378379 0'],
  'task 6: [Infinity, -0, NaN] fit Float16Array, the bare Math.abs check rejects Infinity and NaN; 2049 at eps 0.5 needs Float32Array, 2050 does not; Math.f16round = a write into Float16Array on 378379 values', 'task6.html');
  await told(`${SOLUTIONS.packProgress}
${SOLUTIONS.unpackProgress}
const run = (f) => { try { f(); return "ok"; } catch (e) { return e.name; } };
let bad = 0;
for (let t = 0; t < 1000; t++) {
  const counts = Uint8Array.from({ length: Math.floor(Math.random() * 40) }, () => Math.floor(Math.random() * 256));
  const link = packProgress(counts);
  if (!/^[A-Za-z0-9_-]*$/.test(link) || unpackProgress(link).join() !== counts.join()) bad++;
}
const back = unpackProgress(packProgress(Uint8Array.of(5, 6)));
console.log(bad, run(() => Uint8Array.fromBase64("AQAEAwD_DA", { alphabet: "base64url", lastChunkHandling: "strict" })), back.byteOffset, back.buffer.byteLength);
const sub = Uint8Array.fromBase64(packProgress(Uint8Array.of(5, 6)), { alphabet: "base64url" }).subarray(3);
console.log(new DataView(sub.buffer).getUint8(0), new DataView(back.buffer).getUint8(0));`,
  ['0 SyntaxError 0 2', '1 5'],
  'task 7: 1000 random sets go there and back, links only of A–Z a–z 0–9 - _; strict cannot read a link without "="; the result is a copy (byteOffset 0, a buffer of the counters only) — a DataView over a subarray\'s buffer reads the version byte 1', 'task7.html');
  await told(`${SOLUTIONS.myToBase64}
let bad = 0, cases = 0;
for (let t = 0; t < 1000; t++) {
  const big = Uint8Array.from({ length: 60 }, () => Math.floor(Math.random() * 256));
  const start = Math.floor(Math.random() * 10);
  const bytes = big.subarray(start, start + Math.floor(Math.random() * 51));
  for (const opts of [undefined, { alphabet: "base64url" }, { omitPadding: true }, { alphabet: "base64url", omitPadding: true }]) { cases++; if (myToBase64(bytes, opts) !== bytes.toBase64(opts)) bad++; }
}
console.log(cases, bad);`,
  ['4000 0'], 'task 8: on 1000 random subarrays of 0–50 bytes and four sets of options myToBase64 = toBase64', 'task8.html');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  // [id, words of the step, its numbers joined — a step the clause repeats has two]
  const steps = [
    ['sec-dataview-buffer-byteoffset-bytelength', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'Perform ? RequireInternalSlot (buffer, [[ArrayBufferData]])', '2'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'Let offset be ? ToIndex (byteOffset)', '3'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'If IsDetachedBuffer (buffer) is true, throw a TypeError exception', '4,11'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'If offset > bufferByteLength, throw a RangeError exception', '6,13'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'If byteLength is undefined, then', '8'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'Let viewByteLength be bufferByteLength - offset', '8.a.i'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'Let viewByteLength be auto', '8.b.i'],
    ['sec-dataview-buffer-byteoffset-bytelength', 'If offset + viewByteLength > bufferByteLength, throw a RangeError exception', '9.b,14.a'],
    ['sec-getviewvalue', 'Let getIndex be ? ToIndex (requestIndex)', '3'],
    ['sec-getviewvalue', 'Set isLittleEndian to ToBoolean (isLittleEndian)', '4'],
    ['sec-getviewvalue', 'If IsViewOutOfBounds (viewRecord) is true, throw a TypeError exception', '8'],
    ['sec-getviewvalue', 'If getIndex + elementSize > viewSize, throw a RangeError exception', '11'],
    ['sec-getviewvalue', 'Return GetValueFromBuffer (view. [[ViewedArrayBuffer]], bufferIndex, type, false, unordered, isLittleEndian)', '13'],
    ['sec-setviewvalue', 'If IsBigIntElementType (type) is true, let numberValue be ? ToBigInt (value)', '4'],
    ['sec-setviewvalue', 'Else, let numberValue be ? ToNumber (value)', '5'],
    ['sec-setviewvalue', 'If getIndex + elementSize > viewSize, throw a RangeError exception', '13'],
    ['sec-rawbytestonumeric', 'If isLittleEndian is false, reverse the order of the elements of rawBytes', '2'],
    ['sec-getvaluefrombuffer', 'If isLittleEndian is not present, then', '8'],
    ['sec-getvaluefrombuffer', 'Set isLittleEndian to AR. [[LittleEndian]]', '8.b'],
    ['sec-numerictorawbytes', 'converting value to IEEE 754-2019 binary32 format using roundTiesToEven mode', '2.a'],
    ['sec-numerictorawbytes', 'If value is NaN, rawBytes may be set to any implementation chosen IEEE 754-2019 binary32 format NaN encoding', '2.a'],
    ['sec-uint8array.prototype.tobase64', 'Perform ? ValidateUint8Array (O)', '2'],
    ['sec-uint8array.prototype.tobase64', 'Let alphabet be ? Get (opts, "alphabet")', '4'],
    ['sec-uint8array.prototype.tobase64', 'If alphabet is undefined, set alphabet to "base64"', '5'],
    ['sec-uint8array.prototype.tobase64', 'If alphabet is neither "base64" nor "base64url", throw a TypeError exception', '6'],
    ['sec-uint8array.prototype.tobase64', 'Let omitPadding be ToBoolean (? Get (opts, "omitPadding"))', '7'],
    ['sec-uint8array.frombase64', 'If string is not a String, throw a TypeError exception', '1'],
    ['sec-uint8array.frombase64', 'Let lastChunkHandling be ? Get (opts, "lastChunkHandling")', '6'],
    ['sec-uint8array.frombase64', 'If lastChunkHandling is undefined, set lastChunkHandling to "loose"', '7'],
    ['sec-uint8array.frombase64', 'If lastChunkHandling is not one of "loose", "strict", or "stop-before-partial", throw a TypeError exception', '8'],
    ['sec-uint8array.prototype.setfrombase64', 'Perform SetUint8ArrayBytes (into, bytes)', '19'],
    ['sec-uint8array.prototype.setfrombase64', 'If result. [[Error]] is not none, then', '20'],
    ['sec-uint8array.prototype.tohex', 'Set hex to StringPad (hex, 2, "0", start)', '5.b'],
    ['sec-validateuint8array', 'If ta. [[TypedArrayName]] is not "Uint8Array", throw a TypeError exception', '2'],
    ['sec-frombase64', 'Set index to SkipAsciiWhitespace (string, index)', '10.a,10.e.ii'],
    ['sec-frombase64', 'If lastChunkHandling is "stop-before-partial", then', '10.b.i.1,10.e.iii.1.a'],
    ['sec-frombase64', 'If lastChunkHandling is "strict", then', '10.b.i.2'],
    ['sec-frombase64', 'Set bytes to the list-concatenation of bytes and ! DecodeFinalBase64Chunk (chunk, false)', '10.b.i.5'],
    ['sec-frombase64', 'If lastChunkHandling is "strict", let throwOnExtraBits be true', '10.e.v'],
    ['sec-fromhex', 'If length modulo 2 ≠ 0, then', '5'],
    ['sec-fromhex', 'If hexits contains any code units which are not in "0123456789abcdefABCDEF", then', '6.b'],
    ['sec-math.f16round', 'Let n16 be the result of converting n to IEEE 754-2019 binary16 format using roundTiesToEven mode', '4'],
    ['sec-math.f16round', 'Let n64 be the result of converting n16 to IEEE 754-2019 binary64 format', '5'],
    ['sec-get-dataview.prototype.bytelength', 'If IsViewOutOfBounds (viewRecord) is true, throw a TypeError exception', '5'],
  ];
  const wrong = steps.filter(([id, needle, n]) => at(id, needle).join() !== n).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${n}`);
  check(wrong.length === 0, `ECMA-262: ${steps.length} step numbers the lecture names (25.3.2.1 1–4/6/8/9.b, 25.3.1.5 3/4/8/11/13, 25.3.1.6 4–5/13, 25.1.3.14 2, 25.1.3.16 8, 25.1.3.17 2.a, 23.3.2.3 2/4–6/7, 23.3.1.1 1/6–8, 23.3.2.1 19/20, 23.3.2.4 5.b, 23.3.3.1 2, 23.3.3.7 10.a/10.b.i.1/10.b.i.2/10.b.i.5/10.e.v, 23.3.3.8 5/6.b, 21.3.2.18 4–5, 25.3.4.2 5): ${wrong.join('; ') || 'all right'}`);
  check(num('sec-dataview-objects') === '25.3' && num('sec-arraybuffer-objects') === '25.1' && num('sec-uint8array') === '23.3'
    && num('sec-uint8array.prototype.setfrombase64') === '23.3.2.1' && num('sec-uint8array.prototype.setfromhex') === '23.3.2.2' && num('sec-get-dataview.prototype.bytelength') === '25.3.4.2',
  'ECMA-262: DataView is 25.3 next to ArrayBuffer 25.1; base64 and hex — 23.3; setFromBase64 and setFromHex 23.3.2.1–23.3.2.2; the byteLength getter 25.3.4.2');
  check(hasAll(f('sec-agents'), ['The default value computed for the isLittleEndian parameter when it is needed by the algorithms GetValueFromBuffer and SetValueInBuffer', 'The choice is implementation-defined'])
    && hasAll(f('sec-properties-of-dataview-instances'), ['DataView instances are ordinary objects', '[[DataView]], [[ViewedArrayBuffer]], [[ByteLength]], and [[ByteOffset]] internal slots'])
    && num('sec-dataview.prototype') === '25.3.3.1' && !spec.includes('<span class="secnum">25.3.3.2</span>'),
  'ECMA-262: the agent\'s [[LittleEndian]] — the default order, chosen by the implementation; 25.3.5 — DataView instances are ordinary objects with slots; 25.3.3 has only prototype');
  {
    const heads = [...spec.matchAll(/<h1><span class="secnum">25\.3\.4\.\d+<\/span>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]).replace(/\s+/g, ' ').trim());
    const acc = heads.map((h) => h.match(/^DataView\.prototype\.(get|set)(\w+) \( (.*) \)$/)).filter(Boolean);
    const types = [...new Set(acc.map((m) => m[2]))];
    // the heading as text: "( byteOffset , value [ , littleEndian ] )" — a space before every comma
    const wrongParams = acc.filter(([, gs, t, p]) => p.replace(/ ,/g, ',') !== (gs === 'get' ? 'byteOffset' : 'byteOffset, value') + (/^U?[Ii]nt8$/.test(t) ? '' : ' [, littleEndian ]')).map((m) => m[0]);
    const getters = heads.filter((h) => h.startsWith('get DataView.prototype.')).map((h) => h.split('.').pop());
    check(acc.length === 22 && types.length === 11 && !types.includes('Uint8Clamped') && wrongParams.length === 0 && same(getters, ['buffer', 'byteLength', 'byteOffset']) && heads.includes('DataView.prototype.constructor'),
      `ECMA-262 25.3.4: 22 methods get…/set… for 11 types, no Uint8Clamped; reading takes (byteOffset [, littleEndian]), writing (byteOffset, value [, littleEndian]), the one-byte ones without the order; getters ${getters.join(', ')}, constructor ${wrongParams.join('; ')}`);
  }
  {
    const t70 = f('sec-typedarray-objects');
    check(t70.includes('Table 70: The TypedArray Constructors') && t70.includes('Float16Array %Float16Array% float16 2 16-bit IEEE floating point') && t70.includes('Float32Array %Float32Array% float32 4 32-bit IEEE floating point'),
      'ECMA-262: table 70 has Float16Array — float16, 2 bytes');
  }

  // the MDN pages the lecture uses
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const plain = (md) => md.replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
  {
    const dv = plain(mdn('reference/global_objects/dataview'));
    check(dv.includes("without having to care about the platform's endianness") && dv.includes('DataView defaults to big-endian read and write, but most platforms use little-endian')
      && hasAll(dv, ['const littleEndian = (() => {', 'new DataView(buffer).setInt16(0, 256, true /* littleEndian */);', 'return new Int16Array(buffer)[0] === 256;']),
    'lecture 1, 2: MDN DataView — «without having to care about the platform\'s endianness», «DataView defaults to big-endian…», the example that finds the order of the machine (256 little-endian, read by Int16Array)');
    const ta = plain(mdn('reference/global_objects/typedarray'));
    check(ta.includes('Float16Array uses 10 bits for the mantissa and 5 bits for the exponent') && ta.includes('Float32Array uses 23 (instead of 52) bits for the mantissa'),
      'lecture 7: MDN TypedArray — Float16Array «uses 10 bits for the mantissa and 5 bits for the exponent»; Float32Array 23, Number 52');
    const fb = plain(mdn('reference/global_objects/uint8array/frombase64'));
    check(fb.includes('This method should be preferred over Window.atob() because it results in a byte array'), 'lecture 12: MDN Uint8Array.fromBase64() — «should be preferred over Window.atob() because it results in a byte array»');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const page = (p) => flat(read(p));
  check(page('advanced/day-05/lecture.html').includes('4. ToBoolean') && page('advanced/day-09/lecture.html').includes('[[LittleEndian]] порядок байтов по умолчанию день 21'),
    'lecture 2, 4: day 5 has ToBoolean (section 4), day 9 promised [[LittleEndian]] of the agent record to day 21');
  {
    const l20 = page('advanced/day-20/lecture.html');
    const t20 = page('advanced/day-20/tasks.html');
    const task3 = t20.slice(t20.indexOf('3. Три вида на восьми байтах'), t20.indexOf('4. concat для видов'));
    check(hasAll(l20, ['смещение кратно размеру элемента', 'Float16Array 2 — день 21', 'ToIndex', 'BigInt64Array', '«Карточки 2.0»: счётчики в байтах'])
      && task3.includes('байты 128 и 63 у единицы во Float32Array') && task3.includes('u8.fill(0x40, 4);'),
    'lecture 1, 4, 6, 7, 8, 17: day 20 — a view needs the offset a multiple of the element size, Float16Array left for day 21, ToIndex, BigInt64Array, the counters of «Карточки 2.0»; its task 3 asks where the bytes 128 and 63 of 1 in Float32Array come from');
  }
  check(hasAll(page('advanced/day-18/lecture.html'), ['«Карточки 2.0»: настройки из ссылки', 'encodeURIComponent']), 'lecture 17: day 18 — «Карточки 2.0», the settings in a link, encodeURIComponent');
  {
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    const ahead = read('tools/check-ahead.mjs');
    check(hasAll(plan, ['**21. DataView, порядок байтов, Float16 и base64.**', '**22. SharedArrayBuffer и Atomics.**']) && hasAll(ahead, ["day3: 21, re: /\\b(?:DataView|Float16Array)\\b", "day3: 22, re: /\\b(?:SharedArrayBuffer|Atomics)\\b/"])
      && read('docs/plan-0-overview.md').includes('## Курс 4. Web APIs'),
    'lecture 12, 18: the plan and check-ahead — DataView, Float16Array, base64 are day 21, SharedArrayBuffer and Atomics day 22; course 4 is the Web APIs (btoa, atob)');
  }

  // the notes: the steps and sections they name, the MDN pages they quote, the footer
  {
    const nsteps = [
      ['sec-setviewvalue', 'Let getIndex be ? ToIndex (requestIndex)', '3'],
      ['sec-setviewvalue', 'Set isLittleEndian to ToBoolean (isLittleEndian)', '6'],
      ['sec-setviewvalue', 'If IsViewOutOfBounds (viewRecord) is true, throw a TypeError exception', '10'],
      ['sec-setviewvalue', 'Perform SetValueInBuffer (view. [[ViewedArrayBuffer]], bufferIndex, type, numberValue, false, unordered, isLittleEndian)', '15'],
      ['sec-isviewoutofbounds', 'If IsDetachedBuffer (view. [[ViewedArrayBuffer]]) is true, then', '3'],
      ['sec-frombase64', 'If remaining = 1 and chunkLength = 2, or if remaining = 2 and chunkLength = 3, then', '10.i'],
      ['sec-frombase64', 'Set read to index', '10.l.iv'],
    ];
    const nwrong = nsteps.filter(([id, needle, n]) => at(id, needle).join() !== n).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${n}`);
    check(nwrong.length === 0 && num('sec-getviewvalue') === '25.3.1.5' && num('sec-setviewvalue') === '25.3.1.6' && num('sec-numerictorawbytes') === '25.1.3.17' && num('sec-math.f16round') === '21.3.2.18' && num('sec-frombase64') === '23.3.3.7',
      `student: ECMA-262 — SetViewValue 3, 6, 10, 15 (the table; 4–5 and 13 — above), IsViewOutOfBounds 3 (a detached buffer is out of bounds too), FromBase64 10.i (homework 4: stops before a chunk that does not fit) and 10.l.iv (read — the index in the string, spaces included); 25.3.1.5, 25.3.1.6, 25.1.3.17, 21.3.2.18, 23.3.3.7 ${nwrong.join('; ')}`);
    const sfb = plain(mdn('reference/global_objects/uint8array/setfrombase64'));
    const big = sfb.slice(sfb.indexOf('### Decoding a big string into a small array'), sfb.indexOf('### Setting data at a specific offset'));
    check(hasAll(big, ['without discarding any bits', 'const uint8Array = new Uint8Array(8);', 'uint8Array.setFromBase64("PGI+ TURO PC9i Pg==");', '{ read: 9, written: 6 }', '[60, 98, 62, 77, 68, 78, 0, 0]']),
      'student homework 4: MDN setFromBase64() — «Decoding a big string into a small array», «without discarding any bits», the same string into 8 bytes gives read 9, written 6');
    const notes = read('advanced/day-21/student.html');
    const nflat = flat(notes);
    const nFooter = notes.slice(notes.indexOf('<div class="sources">'));
    check(nflat.includes('«DataView defaults to big-endian read and write, but most platforms use little-endian»') && nflat.includes('«without discarding any bits»') && nflat.includes('Decoding a big string into a small array')
      && ['DataView, Uint8Array.prototype.setFromBase64()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => nFooter.includes(s)) && (notes.match(/developer\.mozilla\.org/g) || []).length === 3
      && !/tc39\.es\/ecma262\/2026\/#/.test(notes),
    'student: the quotes of MDN DataView and setFromBase64() as MDN writes them; the footer names both and ECMA-262 2026; MDN is linked there and twice in the text; section numbers without links');
  }

  // the tasks: the steps the criteria ask for, the MDN page they quote, the links and the footer
  {
    const tsteps = [
      ['sec-frombase64', 'If chunkLength < 2, then', '10.e.i'],
      ['sec-decodefinalbase64chunk', 'If throwOnExtraBits is true and bytes [2] ≠ 0, throw a SyntaxError exception', '6'],
      ['sec-numerictorawbytes', 'converting value to IEEE 754-2019 binary16 format using roundTiesToEven mode', '1.a'],
      ['sec-uint8array.prototype.setfromhex', 'If string is not a String, throw a TypeError exception', '3'],
      ['sec-uint8array.prototype.setfromhex', 'If IsTypedArrayOutOfBounds (taRecord) is true, throw a TypeError exception', '5'],
      ['sec-uint8array.prototype.setfromhex', 'Let result be FromHex (string, byteLength)', '7'],
      ['sec-uint8array.prototype.setfromhex', 'Perform SetUint8ArrayBytes (into, bytes)', '12'],
      ['sec-uint8array.prototype.setfromhex', 'If result. [[Error]] is not none, then', '13'],
      ['sec-fromhex', 'Repeat, while read < length and the number of elements in bytes < maxLength', '6'],
    ];
    const twrong = tsteps.filter(([id, needle, n]) => at(id, needle).join() !== n).map(([id, needle, n]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${n}`);
    check(twrong.length === 0 && num('sec-frombase64') === '23.3.3.7' && num('sec-decodefinalbase64chunk') === '23.3.3.5' && num('sec-fromhex') === '23.3.3.8'
      && f('sec-uint8array.prototype.tobase64').includes('the base64 encoding specified in section 4 of RFC 4648'),
    `tasks: ECMA-262 — FromBase64 10.e.i ("T==="), DecodeFinalBase64Chunk 6 ("TWF=" strict), NumericToRawBytes 1.a (float16, as Math.f16round step 4), setFromHex 3/5/7/12/13 and FromHex 6 (task 9); 23.3.3.5, 23.3.3.7, 23.3.3.8; toBase64 step 9 — RFC 4648, section 4 ${twrong.join('; ')}`);
    const fb = plain(mdn('reference/global_objects/uint8array/frombase64'));
    const tasksHtml = read('advanced/day-21/tasks.html');
    const quote = 'the last chunk must be exactly 4 characters long with padding = characters, and the overflow bits must be 0';
    const tAnchors = [...new Set([...tasksHtml.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]))];
    const tNamed = [...tasksHtml.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const tFooter = tasksHtml.slice(tasksHtml.indexOf('<div class="sources">'));
    check(fb.includes(quote) && flat(tasksHtml).includes(`«${quote}»`)
      && tAnchors.every((a) => spec.includes(`id="${a}"`)) && tNamed.length === 1 && tNamed.every(([id, n]) => num(id) === n)
      && ['Uint8Array.fromBase64()', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => tFooter.includes(s)) && (tasksHtml.match(/developer\.mozilla\.org/g) || []).length === 2,
    'tasks: MDN fromBase64() — strict wants «the last chunk … exactly 4 characters long with padding = characters, and the overflow bits must be 0»; the tc39.es anchor exists with its number (23.3.2.2); the footer names fromBase64() and ECMA-262 2026');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the lecture exists
  {
    const lecture = read('advanced/day-21/lecture.html');
    const spRows = read('docs/coverage/ecma262.csv').split('\n').map(csvLine);
    const mdRows = read('docs/coverage/mdn-javascript.csv').split('\n').map(csvLine);
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const specRows = spRows.filter((c) => c[6] === '3' && c[7] === '21').map((c) => c[0]);
    const mdnRows = mdRows.filter((c) => c[5] === '3' && c[6] === '21').map((c) => c[0]);
    const missing = [...specRows.filter((id) => !refSpec.includes(id)), ...mdnRows.filter((p) => !refMdn.includes(p))];
    check(specRows.length === 10 && mdnRows.length === 35 && refSpec.length === 10 && refMdn.length === 35 && missing.length === 0,
      `plan: ${specRows.length} rows of ECMA-262 and ${mdnRows.length} of MDN for day 21, ${refSpec.length} + ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullSpec = spRows.filter((c) => c[6] === '3' && c[7] === '21' && c[9] === 'подробно').map((c) => c[0]);
    const fullMdn = mdRows.filter((c) => c[5] === '3' && c[6] === '21' && c[8] === 'подробно').map((c) => c[0]);
    const markedSpec = [...refTable.matchAll(/2026\/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
    check(fullSpec.length === 2 && fullMdn.length === 9 && same(fullSpec, markedSpec) && same(fullMdn, markedMdn), `plan: the 11 rows "подробно" (2 + 9) are marked so in the table ${JSON.stringify([markedSpec.length, markedMdn.length])}`);
    const titles = mdRows.filter((c) => c[5] === '3' && c[6] === '21').map((c) => [c[0], c[1]]);
    const wrongTitle = titles.filter(([p, t]) => !refTable.includes(`${p}">MDN: ${t.replace(/&/g, '&amp;')}</a>`)).map(([p]) => p);
    check(wrongTitle.length === 0, `plan: every MDN row is named by its title from the map ${wrongTitle.join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [m[1], m[2]]);
    const wrongNum = named.filter(([id, n]) => num(id) !== n).map(([id, n]) => `${n}≠${num(id)} (${id})`);
    check(named.length > 0 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    check(['DataView и его методы, Float16Array, TypedArray, Uint8Array.fromBase64() и соседние методы', 'ECMA-262 2026', 'Mozilla Contributors'].every((s) => footer.includes(s)) && (lecture.match(/developer\.mozilla\.org/g) || []).length === 38,
      `links: the footer names the MDN pages and ECMA-262 2026; MDN is linked 38 times — 35 rows, DataView in section 1, TypedArray in section 7, the footer (${(lecture.match(/developer\.mozilla\.org/g) || []).length})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
