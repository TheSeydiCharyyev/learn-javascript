// Course 3, day 6, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. A block whose first line starts with "// в консоли" is
// console input, run line by line through Runtime.evaluate with replMode, as on day 4. Console output of scripts is
// rebuilt from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …".
// A block with setTimeout gets 700 ms before its page closes. The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-06.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-06.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the quoted lines of the method know (day 34 of course 2,
// a block with data-page) are the real ones; the cheatsheet runs without an error; the experiments the lecture only
// tells about (the table of ToInt8 … ToBigUint64 through typed arrays, which the lecture may not use before day 20);
// what the lecture says about the text of ECMA-262 2026 is checked against tools/.cache/ecma262-2026.html and what it
// takes from MDN against the pages in tools/.cache/mdn-content.git; the days it points to say what it says; every row
// of the day's plan is a link and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-06');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const PAGES = ['lecture'];
// the notes write the output in the comment of the line that prints it: "console.log(x);   // 3 — why"
const commented = (code) => code.split('\n').filter((l) => l.includes('console.log(') && l.includes('//'))
  .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
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
  '// deck.js, день 34 курса 2 — метод know': 'intermediate/day-34/lecture.html',
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
  await p.waitForTimeout(code.includes('setTimeout') ? 700 : 100);
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
    const out = await runScript(ctx, `const bits = (n) => (n >>> 0).toString(2).padStart(32, "0");
const values = [2.9, -2.9, 2 ** 31, 3e9, -1.5e10, 1e21, NaN, Infinity, -Infinity, -0, 123456789012];
console.log(bits(~9).endsWith("11110110"), bits(-9).endsWith("11110111"), (2 ** 31 - 1) | 0, -(2 ** 31) | 0, (2 ** 31) | 0);
console.log(values.every((v) => ((v | 0) | 0) === (v | 0)), values.every((v) => ((v >>> 0) | 0) === (v | 0)), values.every((v) => ((v | 0) >>> 0) === (v >>> 0)));`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(['true true 2147483647 -2147483648 -2147483648', 'true true true']),
      `lecture 2, 3: −9 is ~9 plus 1, the range ends at 2^31 − 1; ToInt32 is idempotent, ToInt32(ToUint32(x)) = ToInt32(x) and back ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `console.log(Int8Array.of(127, 128, -129, 255).join(" "), Uint8Array.of(256, -1).join(" "), Int16Array.of(32768, -32769).join(" "), Uint16Array.of(-1, 65536).join(" "));
console.log(Uint8ClampedArray.of(300, -5, 2.5, 3.5, 1.5, 254.5).join(" "), Math.round(2.5));
console.log(BigInt64Array.of(2n ** 63n)[0], BigUint64Array.of(-1n)[0], [2n ** 63n, -1n, 2n ** 64n + 5n].every((x) => BigInt64Array.of(x)[0] === BigInt.asIntN(64, x)));
const a = [];
a[2 ** 32 - 2] = 1;
const b = [];
b[2 ** 32 - 1] = 1;
console.log(a.length, b.length, Math.floor(2 ** 32 / 86400000));`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify(['127 -128 127 -1 0 255 -32768 32767 65535 0', '255 0 2 4 2 254 3',
      '-9223372036854775808n 18446744073709551615n true', '4294967295 0 49']),
    `lecture 4: the table of ToInt8 … ToBigUint64 through typed arrays (clamp: 300 → 255, −5 → 0, 2.5 → 2, 3.5 → 4, Math.round gives 3), ToBigInt64 = asIntN(64); the last index is 2^32 − 2; 2^32 ms is 49 days ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, 'console.log(+"x", +{}, 1 + 1 << 1, 1 << 2 < 5, 1 == 1 & 0, 6 & 3 ^ 1, 1 ^ 1 | 1, 0 && 1 | 1);', 'told-3.html');
    check(JSON.stringify(out) === '["NaN NaN 4 true 0 3 1 0"]',
      `lecture 5, 6: "x" and {} are NaN; + before <<, << before <, == before &, & before ^, ^ before |, | before && ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const ints = [];
for (let x = -40; x <= 40; x++) ints.push(x);
console.log(ints.every((x) => ~x === -x - 1), ~(2 ** 31), -(2 ** 31) - 1);
console.log(ints.every((x) => [0, 1, 2, 3, 4].every((k) => x >> k === Math.floor(x / 2 ** k))), ints.every((x) => (x << 3) === x * 8));
console.log(ints.filter((x) => x >= 0).every((x) => [0, 1, 2, 5].every((k) => x >> k === x >>> k)), ints.filter((x) => x < 0).some((x) => x >> 1 === x >>> 1));
const big = [-9n, -1n, 0n, 7n, 255n, -256n];
console.log(big.every((x) => [0n, 1n, 2n, 5n].every((k) => (x >> k) === (x << -k))), big.every((x) => ~x === -x - 1n), !~-1n, !~0);`, 'told-4.html');
    check(JSON.stringify(out) === JSON.stringify(['true 2147483647 -2147483649', 'true true', 'true false', 'true true true false']),
      `lecture 7–10: ~x = −x − 1 only inside 32 bits; >> k is floor division by 2^k, << k is times 2^k; >> and >>> agree on non-negatives only; BigInt >> is << with a minus, ~ is −x − 1n, and ~-1n is falsy too ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, 'console.log(Math.round(2 ** 31 / 365.25 / 1e6), (2 ** 31 / 365.25 / 1e6).toFixed(2));', 'told-5.html');
    check(JSON.stringify(out) === '["6 5.88"]', `lecture 15: 2^31 days are about six million years ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  check(inOrder(f('sec-toint32'), ['Let number be ? ToNumber (argument)', 'If number is not finite or number is either +0 𝔽 or -0 𝔽, return +0 𝔽',
    'Let int be truncate (ℝ (number))', 'Let int32bit be int modulo 2 32', 'If int32bit ≥ 2 31, return 𝔽 (int32bit - 2 32)', 'Return 𝔽 (int32bit)']),
  'lecture 3: ToInt32 — the five steps in this order');
  check(hasAll(f('sec-toint32'), ['is idempotent', 'ToInt32(ToUint32 (x)) is the same value as ToInt32(x)', 'that +∞ 𝔽 and -∞ 𝔽 are mapped to +0 𝔽', 'ToInt32 maps -0 𝔽 to +0 𝔽']),
    'lecture 3: the note — idempotent, ToInt32(ToUint32(x)), infinities to +0 for that, −0 to +0');
  check(/computes a value k of the same sign as y \(or zero\)/.test(f('sec-mathematical-operations')), 'lecture 3: modulo has the sign of the divisor');
  check(hasAll(f('sec-touint32'), ['in the inclusive interval from +0 𝔽 to 𝔽 (2 32 - 1)', 'Let int32bit be int modulo 2 32. Return 𝔽 (int32bit)', 'Step 5 is the only difference between ToUint32 and ToInt32']),
    'lecture 4: ToUint32 — the same steps without step 5');
  check(f('sec-toint16').includes('from 𝔽 (-2 15) to 𝔽 (2 15 - 1)') && f('sec-touint16').includes('from +0 𝔽 to 𝔽 (2 16 - 1)')
    && f('sec-toint8').includes('from -128 𝔽 to 127 𝔽') && f('sec-touint8').includes('from +0 𝔽 to 255 𝔽'), 'lecture 4: the ranges of ToInt16, ToUint16, ToInt8, ToUint8');
  check(hasAll(f('sec-touint8clamp'), ['Let clamped be the result of clamping mv between 0 and 255', 'If f is even, return 𝔽 (f)', '“round half to even”']),
    'lecture 4: ToUint8Clamp — clamps and rounds half to even');
  check(f('sec-tobigint64').includes('Let int64bit be ℝ (n) modulo 2 64. If int64bit ≥ 2 63, return ℤ (int64bit - 2 64)') && f('sec-tobiguint64').includes('Let int64bit be ℝ (n) modulo 2 64. Return ℤ (int64bit)')
    && f('sec-bigint.asintn').includes('Let mod be ℝ (bigint) modulo 2 bits. If mod ≥ 2 bits - 1, return ℤ (mod - 2 bits)'), 'lecture 4: ToBigInt64, ToBigUint64 and BigInt.asIntN — the same remainder and sign');
  const typed = flat(spec.slice(spec.indexOf('id="table-the-typedarray-constructors"'), spec.indexOf('</emu-table>', spec.indexOf('id="table-the-typedarray-constructors"'))));
  check(inOrder(typed, ['Int8Array', 'ToInt8', 'Uint8Array', 'ToUint8', 'Uint8ClampedArray', 'ToUint8Clamp', 'Int16Array', 'ToInt16', 'Uint16Array', 'ToUint16'])
    && hasAll(typed, ['BigInt64Array', 'ToBigInt64', 'BigUint64Array', 'ToBigUint64']), 'lecture 4: the typed array table names the conversions of day 20');
  check(f('sec-string.fromcharcode').includes('ℝ (? ToUint16 (next))') && f('sec-math.imul').includes('Let a be ℝ (? ToUint32 (x)). Let b be ℝ (? ToUint32 (y)). Let product be (a × b) modulo 2 32')
    && f('sec-math.clz32').includes('Let n be ? ToUint32 (x). Let p be the number of leading zero bits'), 'lecture 4: fromCharCode — ToUint16, imul and clz32 — ToUint32');
  check(inOrder(f('sec-arraysetlength'), ['Let newLen be ? ToUint32 (Desc. [[Value]])', 'Let numberLen be ? ToNumber (Desc. [[Value]])', 'If SameValueZero (newLen, numberLen) is false, throw a RangeError exception']),
    'lecture 4: ArraySetLength — ToUint32, then ToNumber, then RangeError');
  const apply = f('sec-applystringornumericbinaryoperator');
  check(hasAll(apply, ['opText (**, *, /, %, +, -, <<, >>, >>>, &, ^, or |)', 'If SameType (lNum, rNum) is false, throw a TypeError exception', 'If opText is >>>, return ? BigInt::unsignedRightShift (lNum, rNum)',
    '<< BigInt::leftShift >> BigInt::signedRightShift & BigInt::bitwiseAND ^ BigInt::bitwiseXOR | BigInt::bitwiseOR',
    '<< Number::leftShift >> Number::signedRightShift >>> Number::unsignedRightShift & Number::bitwiseAND ^ Number::bitwiseXOR | Number::bitwiseOR'])
    && inOrder(apply, ['If opText is +, then', 'NOTE: At this point, it must be a numeric operation', 'Let lNum be ? ToNumeric (lVal). Let rNum be ? ToNumeric (rVal)']),
  'lecture 1, 5, 10: ApplyStringOrNumericBinaryOperator — ToPrimitive only for +, ToNumeric, SameType, the tables, >>> throws for BigInt');
  check(inOrder(f('sec-evaluatestringornumericbinaryexpression'), ['Let lRef be ? Evaluation of leftOperand', 'Let lVal be ? GetValue (lRef)', 'Let rRef be ? Evaluation of rightOperand',
    'Let rVal be ? GetValue (rRef)', 'Return ? ApplyStringOrNumericBinaryOperator (lVal, opText, rVal)']), 'lecture 1, 5: left operand, then right, then the operator');
  check(['sec-left-shift-operator-runtime-semantics-evaluation', 'sec-signed-right-shift-operator-runtime-semantics-evaluation', 'sec-unsigned-right-shift-operator-runtime-semantics-evaluation']
    .every((id) => f(id).includes('Return ? EvaluateStringOrNumericBinaryExpression (ShiftExpression,'))
    && hasAll(f('sec-binary-bitwise-operators-runtime-semantics-evaluation'), ['(BitwiseANDExpression, &, EqualityExpression)', '(BitwiseXORExpression, ^, BitwiseANDExpression)', '(BitwiseORExpression, |, BitwiseXORExpression)']),
  'lecture 1: 13.9.1–13.9.3 and 13.12.1 all go to EvaluateStringOrNumericBinaryExpression');
  check(f('sec-binary-bitwise-operators').includes('BitwiseANDExpression [?In, ?Yield, ?Await] & EqualityExpression') && f('sec-binary-bitwise-operators').includes('BitwiseXORExpression [?In, ?Yield, ?Await] ^ BitwiseANDExpression')
    && f('sec-binary-bitwise-operators').includes('BitwiseORExpression [?In, ?Yield, ?Await] | BitwiseXORExpression') && f('sec-bitwise-shift-operators').includes('ShiftExpression [?Yield, ?Await] << AdditiveExpression')
    && f('sec-relational-operators').includes('RelationalExpression [?In, ?Yield, ?Await] < ShiftExpression') && f('sec-equality-operators').includes('EqualityExpression [?In, ?Yield, ?Await] == RelationalExpression')
    && f('sec-binary-logical-operators').includes('LogicalANDExpression [?In, ?Yield, ?Await] && BitwiseORExpression'),
  'lecture 6: the grammar — + under <<, << under <, < under ==, == under &, & under ^, ^ under |, | under &&');
  const not = f('sec-bitwise-not-operator-runtime-semantics-evaluation');
  check(not.includes('Let oldValue be ? ToNumeric (? GetValue (expr)). If oldValue is a Number, return Number::bitwiseNOT (oldValue)') && not.includes('Return BigInt::bitwiseNOT (oldValue)')
    && f('sec-numeric-types-number-bitwiseNOT').includes('Let oldValue be ! ToInt32 (x). Return the bitwise complement of oldValue') && f('sec-numeric-types-bigint-bitwiseNOT').includes('Return - x - 1 ℤ'),
  'lecture 7: ~ — ToNumeric; Number: ToInt32 and complement; BigInt: −x − 1');
  check(f('sec-numeric-types-number-leftShift').includes('Let lNum be ! ToInt32 (x). Let rNum be ! ToUint32 (y). Let shiftCount be ℝ (rNum) modulo 32')
    && hasAll(f('sec-numeric-types-number-signedRightShift'), ['Let lNum be ! ToInt32 (x). Let rNum be ! ToUint32 (y). Let shiftCount be ℝ (rNum) modulo 32', 'The most significant bit is propagated']),
  'lecture 8: << and >> — the left operand ToInt32, the count ToUint32 modulo 32, >> copies the top bit');
  check(hasAll(f('sec-numeric-types-number-unsignedRightShift'), ['Let lNum be ! ToUint32 (x). Let rNum be ! ToUint32 (y). Let shiftCount be ℝ (rNum) modulo 32', 'Vacated bits are filled with zero']),
    'lecture 9: >>> — the left operand ToUint32, zeros from the left');
  check(f('sec-numberbitwiseop').includes("Let lNum be ! ToInt32 (x). Let rNum be ! ToInt32 (y). Let lBits be the 32-bit two's complement bit string")
    && ['bitwiseAND (x, y)', 'bitwiseXOR (x, y)', 'bitwiseOR (x, y)'].every((m, i) => f(`sec-numeric-types-number-${m.split(' ')[0]}`).includes(`Return NumberBitwiseOp (${'&^|'[i]}, x, y)`)),
  'lecture 5: NumberBitwiseOp — ToInt32 of both, 32-bit strings; &, ^ and | call it');
  check(hasAll(f('sec-bigintbitwiseop'), ['Repeat, until (x = 0 or x = -1) and (y = 0 or y = -1)', 'NOTE: This extends the sign'])
    && hasAll(f('sec-numeric-types-bigint-leftShift'), ['If y < 0 ℤ, then Return ℤ (floor (ℝ (x) / 2 - ℝ (y)))', 'Return x × 2 ℤ y']) && !f('sec-numeric-types-bigint-leftShift').includes('modulo')
    && f('sec-numeric-types-bigint-signedRightShift').includes('Return BigInt::leftShift (x, - y)') && f('sec-numeric-types-bigint-unsignedRightShift').includes('returns a throw completion. It performs the following steps when called: Throw a TypeError exception'),
  'lecture 10: BigIntBitwiseOp until 0 or −1; leftShift without modulo, floor for a negative count; >> is << with −y; >>> only throws');
  // the simple = comes first in the clause with the same first step, so the compound one is read from its production on
  const assignAll = f('sec-assignment-operators-runtime-semantics-evaluation');
  const assign = assignAll.slice(assignAll.indexOf('AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression'));
  check(inOrder(assign, ['AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression', 'Let lRef be ? Evaluation of LeftHandSideExpression', 'Let lVal be ? GetValue (lRef)',
    'Let rRef be ? Evaluation of AssignmentExpression', 'Let r be ? ApplyStringOrNumericBinaryOperator (lVal, opText, rVal)', 'Perform ? PutValue (lRef, r)'])
    && assign.includes('<<= << >>= >> >>>= >>> &= & ^= ^ |= |'), 'lecture 11: 13.15.2 — the reference once, the table of operators, PutValue');
  check(inOrder(f('sec-void-operator-runtime-semantics-evaluation'), ['Let expr be ? Evaluation of UnaryExpression', 'Perform ? GetValue (expr)', 'Return undefined',
    'GetValue must be called even though its value is not used because it may have observable side-effects']), 'lecture 14: void — evaluate, GetValue, undefined; the note');
  check(inOrder(f('sec-typeof-operator-runtime-semantics-evaluation'), ['If IsUnresolvableReference (val) is true, return "undefined"', 'Set val to ? GetValue (val)'])
    && f('sec-getvalue').includes('If IsUnresolvableReference (V) is true, throw a ReferenceError exception'), 'lecture 14: typeof looks before GetValue, GetValue throws ReferenceError');

  // the pages of MDN
  const mdnPage = (slug) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/operators/${slug}/index.md`], { encoding: 'utf8' });
  const warned = ['bitwise_and', 'bitwise_or', 'bitwise_xor', 'bitwise_not', 'left_shift', 'right_shift', 'unsigned_right_shift', 'void']
    .map((s) => (mdnPage(s).match(/You may see people using `([^`]+)`/) || [])[1] || '-');
  check(JSON.stringify(warned) === JSON.stringify(['& -1', '| 0', '^ 0', '~~', '<< 0', '>> 0', '-', '-']), `lecture 12: six pages warn about ${warned.join(', ')}; >>> and void do not`);
  const and = mdnPage('bitwise_and');
  check(and.includes('For numbers, the operator returns a 32-bit integer') && and.includes('14 & 9;') && and.includes('// 8  (00000000000000000000000000001000)'), 'MDN Bitwise AND: a 32-bit integer, 14 & 9 is 8');
  check(mdnPage('bitwise_not').includes('Bitwise NOTing any 32-bit integer `x` yields `-(x + 1)`'), 'MDN Bitwise NOT: −(x + 1) for 32-bit integers');
  check(mdnPage('left_shift').includes('the actual shift offset will always be a positive integer between 0 and 31'), 'MDN Left shift: the count modulo 32');
  check(mdnPage('right_shift').includes('-9 >> 2; // -3') && mdnPage('unsigned_right_shift').includes('-9 >>> 2; // 1073741821'), 'scheme 2: −9 >> 2 and −9 >>> 2 are the examples of MDN');
  check(mdnPage('unsigned_right_shift').includes("Unsigned right shift doesn't work with BigInts.") && mdnPage('unsigned_right_shift_assignment').includes('c >>>= 2n; // 1n'),
    'lecture 10: the >>> page says it does not work with BigInts, the >>>= page shows the wrong 1n');
  check(mdnPage('left_shift_assignment').includes('`x <<= y` is equivalent to `x = x << y`, except that the expression `x` is only evaluated once'), 'lecture 11: MDN — x is evaluated once');
  const voidPage = mdnPage('void');
  check(hasAll(voidPage, ['void 2 === "2"; // (void 2) === \'2\', returns false', 'void function () {', 'SyntaxError: Malformed arrow function parameter list',
    'replaces the contents of the page with the returned value, unless the returned', 'checkbox.onclick = () => void doSomething();']),
  'lecture 14: MDN void — precedence, the IIFE, the arrow error, javascript: URLs, the non-leaking arrow');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('essentials/day-06/lecture.html').includes('<tr><td>побитовые</td><td><code>&amp; | ^ &lt;&lt; &gt;&gt;</code></td><td>курс 3</td></tr>'), 'lecture 1: the table of Essentials day 6 says «побитовые — курс 3»');
  const oneTwo = ['essentials', 'intermediate'].flatMap((c) => fs.readdirSync(path.join(ROOT, c)).filter((d) => /^day-\d+$/.test(d))
    .flatMap((d) => [d, `${d}/en`].filter((s) => fs.existsSync(path.join(ROOT, c, s))).flatMap((s) => fs.readdirSync(path.join(ROOT, c, s)).filter((x) => x.endsWith('.html')).map((x) => `${c}/${s}/${x}`))));
  const withVoid = oneTwo.filter((p) => /\bvoid\b/.test(read(p)));
  check(oneTwo.length > 200 && withVoid.length === 0, `lecture 1: void is in none of ${oneTwo.length} pages of courses 1–2${withVoid.length ? ` — ${withVoid.join(', ')}` : ''}`);
  check(read('essentials/day-06/lecture.html').includes('<strong>остаток</strong> от деления') && read('essentials/day-16/lecture.html').includes('(5).toString(2)')
    && read('essentials/day-18/lecture.html').includes('Math.clz32') && read('essentials/day-18/lecture.html').includes('Math.imul'),
  'lecture 2–4: % — Essentials 6, toString(2) — 16, clz32 and imul — 18');
  check(read('essentials/day-27/lecture.html').includes('Свойства <code>onclick</code>') && read('essentials/day-27/lecture.html').includes('<code>preventDefault</code>: отменить действие браузера')
    && read('essentials/day-30/lecture.html').includes('задержка больше 2147483647 мс'), 'lecture 4, 14: onclick and preventDefault — Essentials 27, the delay over 2147483647 — 30');
  check(read('intermediate/day-21/lecture.html').includes('BigInt.asIntN') && read('advanced/day-03/lecture.html').includes("Identifier 'undefined' has already been declared")
    && read('advanced/day-04/lecture.html').includes('2<sup>32</sup> − 2'), 'lecture 4, 14: asIntN — course 2 day 21; undefined is a name — day 3; the last index 2^32 − 2 — day 4');

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = read('advanced/day-06/lecture.html');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '6').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 17 && unlinked.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 6, not linked: ${unlinked.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '6').map((c) => c[0]);
  const notLinked = pages.filter((p) => !lecture.includes(`https://developer.mozilla.org/en-US/docs/${p}"`));
  check(pages.length === 14 && notLinked.length === 0, `plan: ${pages.length} MDN pages of day 6, not linked: ${notLinked.join(', ') || 'none'}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
