// Course 3, day 3, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. The code stands right after <script>, without a line break,
// as on day 2. Console output is rebuilt from Chrome's preview objects, as DevTools prints it; an uncaught error is
// printed as "Uncaught SyntaxError: …". The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-03.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-03.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output, in the notes the comments of console.log lines do, in the
// tasks EXPECT holds the answers of the predictions and SOLUTIONS make the examples checkable; the quoted lines of render (day 33 of course 2) are the
// real ones; the cheatsheet runs without an error; the experiments the lecture only tells about (undefined cannot be
// redefined, a space after \ at the end of a line, trailing commas in a module, the values of scheme 1, the tagged
// template at the start of a line, …); what the lecture says about the text of ECMA-262 2026 is checked against
// tools/.cache/ecma262-2026.html and what it quotes from MDN against the pages in tools/.cache/mdn-content.git; every
// row of the day's plan is a link and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-03');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const PAGES = ['lecture', 'student', 'tasks'];
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

// a block without a result-box: its output by the first line; the tasks ask to predict these, the answers live here
const EXPECT = {
  'const codes = ["0b1_0", "0B11", "0o_7", "0x1F_FFn", "1_0.5_0", "1e-1_0", "08", "0.1e1n"];': ['0b1_0 → 2', '0B11 → 3',
    '0o_7 → Invalid or unexpected token', '0x1F_FFn → 8191', '1_0.5_0 → 10.5', '1e-1_0 → 1e-10', '08 → 8', '0.1e1n → Invalid or unexpected token'],
  'const strings = [': ['1 3', '2 Invalid hexadecimal escape sequence', '3 2', '4 4', '5 2', '6 1', '7 3', '8 2'],
  'function f(a, b,) {}': ['2 3 2 2', '2 2 -1'],
  'const bodies = [': ['1 TypeError: 1 is not a function', '2 TypeError: [1,2][(0 , 1)].forEach is not a function', '3 TypeError: "a" is not a function',
    "4 ReferenceError: Cannot access 'n' before initialization", '5 ReferenceError: g is not defined', '6 1'],
  'const restricted = [': ['1 undefined', '2 {"ok":true}', '3 2', '4 SyntaxError: Illegal newline after throw', "5 SyntaxError: Unexpected token '=>'",
    '6 4', '7 "вышли"'],
  'const parts = (strings) => strings.map((s, i) => `${JSON.stringify(s)} ${JSON.stringify(strings.raw[i])}`).join(" | ");': ["\"a\\tb\" \"a\\\\tb\"",
    "\"A\" \"\\\\u{41}\" | undefined \"\\\\x\"", "\"$5 ${x}\" \"$5 \\\\${x}\""],
};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  looseJSON: `function looseJSON(text) {
  let out = "", inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\\\") out += text[++i];
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === "," && /^\\s*[\\]}]/.test(text.slice(i + 1))) continue;
    out += ch;
  }
  return JSON.parse(out);
}`,
  asiHazards: `function asiHazards(code) {
  const found = [];
  let prev = "";
  code.split("\\n").forEach((line, i) => {
    const t = line.trim();
    if (t === "") return;
    if (prev && /^[(\\[\`+\\-/]/.test(t) && !/^\\/[/*]/.test(t) && !/[;{,]$/.test(prev)) found.push(i + 1);
    prev = t;
  });
  return found;
}`,
  numericValue: `function numericValue(text) {
  const big = text.endsWith("n");
  const body = big ? text.slice(0, -1) : text;
  const prefixed = /^0[xob]/i.test(body);
  const digit = prefixed ? { x: "[0-9a-f]", o: "[0-7]", b: "[01]" }[body[1].toLowerCase()] : "\\\\d";
  const part = \`\${digit}+(?:_\${digit}+)*\`;
  const ok = prefixed ? new RegExp(\`^\${part}$\`, "i").test(body.slice(2))
    : new RegExp(\`^(?:\${part}(?:\\\\.(?:\${part})?)?|\\\\.\${part})(?:e[+-]?\${part})?$\`, "i").test(body) && !/^0_/.test(body);
  if (!ok || (big && !prefixed && /[.e]/i.test(body))) throw new SyntaxError(\`Invalid number \${text}\`);
  const clean = body.replaceAll("_", "");
  return big ? BigInt(clean) : Number(clean);
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
// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = {
  '// main.js, день 33 курса 2 — строки render': 'intermediate/day-33/lecture.html',
};
// the parse helper of day 2: new Function in try, the way ParseText returns a tree or an error
const PARSE = `const parse = (code) => {
  try {
    new Function(code);
    return "разобрано";
  } catch (e) {
    return \`\${e.name}: \${e.message}\`;
  }
};
`;

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
// the terminals of one production, as the spec writes them
const terminals = (spec, name) => {
  const prod = spec.match(new RegExp(`<emu-production name="${name}"[\\s\\S]*?</emu-production>`))[0];
  return [...prod.matchAll(/<emu-t>([\s\S]*?)<\/emu-t>/g)].map((m) => textOf(m[1]));
};

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
        const code = [...quoted.matchAll(/<pre class="code js">([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).join('\n');
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
    const out = await runScript(ctx, `${PARSE}const d = Object.getOwnPropertyDescriptor(globalThis, "undefined");
console.log(d.configurable, d.writable, (function () { const NaN = 1; return NaN; })());
console.log(0B11, 0O17, 2E2, parse("1e3n"), parse("let _100 = 1; _100;"), 0o777);`, 'told-numbers.html');
    check(JSON.stringify(out) === '["false false 1","3 15 200 SyntaxError: Invalid or unexpected token разобрано 511"]',
      `lecture 2, 3, 4, 5: undefined is not configurable, NaN is a name; 0B 0O E; 1e3n fails; _100 is a name; 0o777 ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, 'console.log(0xA0_B0n, 1_050.95e-2);', 'scheme1.html');
    check(JSON.stringify(out) === '["41136n 10.5095"]', `lecture, scheme 1: the values of 0xA0_B0n and 1_050.95e-2 ${JSON.stringify(out)}`);
  }
  // section 6: a space after the backslash is an escape of the space, and the LF after it is not allowed
  {
    const out = await runScript(ctx, `${PARSE}console.log(parse('"a\\\\ ' + String.fromCharCode(10) + 'b"'));`, 'continuation.html');
    check(JSON.stringify(out) === '["SyntaxError: Invalid or unexpected token"]', `lecture 6: a space after \\ at the end of the line ${JSON.stringify(out)}`);
  }
  // section 7: the rows of the escape table
  {
    const out = await runScript(ctx, 'console.log("\\ý" === "ý", [..."\\b\\f\\v\\0"].map((c) => c.charCodeAt(0)).join(" "), "\\08".length);', 'escapes.html');
    check(JSON.stringify(out) === '["true 8 12 11 0 2"]', `lecture 7: \\ý is ý; \\b \\f \\v \\0; \\08 is \\0 and 8 ${JSON.stringify(out)}`);
  }
  // section 8: each regex has its own lastIndex
  {
    const out = await runScript(ctx, `const vowels = () => /[aeiou]/g;
const first = vowels();
first.test("salam");
console.log(first.lastIndex, vowels().lastIndex);`, 'lastindex.html');
    check(JSON.stringify(out) === '["2 0"]', `lecture 8: two evaluations — two lastIndex ${JSON.stringify(out)}`);
  }
  // section 9: CR LF becomes LF in the raw text too
  {
    const out = await runScript(ctx, `const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raw = new Function("return String.raw\`a" + CR + LF + "b\`")();
console.log(raw.length, raw.charCodeAt(1));`, 'raw.html');
    check(JSON.stringify(out) === '["3 10"]', `lecture 9: String.raw also turns CR LF into LF ${JSON.stringify(out)}`);
  }
  // section 11: the rows of the table that have no block — a template and a regex at the start of a line
  {
    const tpl = await runScript(ctx, 'const s = "a"\n`b`.length', 'asi-template.html');
    const re = await runScript(ctx, 'const hi = 2, g = { exec: () => [1] }, c = 0\nlet a = 10\n/hi/g.exec(c)\nconsole.log(a)', 'asi-regex.html');
    // the second line divides: 10 / hi / g.exec(c) is 10 / 2 / [1]
    check(JSON.stringify(tpl) === '["Uncaught TypeError: \\"a\\" is not a function"]' && JSON.stringify(re) === '["5"]',
      `lecture 11: a template at the start of a line is a tagged template, a regex — division ${JSON.stringify([tpl, re])}`);
  }
  // section 13: trailing commas in a module, in import() and in its absence
  {
    const mod = await runScript(ctx, `import { x, } from "data:text/javascript,export const x = 1, y = 2;";
const a = 1, b = 2;
export { a, b, };
const m = await import("data:text/javascript,const z = 3; export { z, };",);
console.log(x, Object.keys(m).join(" "));`, 'module.html', ' type="module"');
    check(JSON.stringify(mod) === '["1 z"]', `lecture 13: import { x, }, export { a, b, }, import(…,) in a module ${JSON.stringify(mod)}`);
    const out = await runScript(ctx, `${PARSE}console.log(parse('import("./x.js",)'), parse("import(,)"));`, 'import-commas.html');
    check(JSON.stringify(out) === '["разобрано SyntaxError: Unexpected token \',\'"]', `lecture 13: import("./x.js",) parses, import(,) does not ${JSON.stringify(out)}`);
  }
  // section 14: the call throws before the assignment — the counter stays empty, loading does not start
  {
    const out = await runScript(ctx, `const counter = { textContent: "" }, cards = [1, 2, 3], deck = { size: 8 }
let started = false
try {
  counter.textContent = \`На сегодня: \${cards.length} из \${deck.size}\`
  (async () => { started = true })()
} catch (e) {
  console.log(e.name, JSON.stringify(counter.textContent), started)
}`, 'cards-state.html');
    check(JSON.stringify(out) === '["TypeError \\"\\" false"]', `lecture 14: the counter is not updated and loading does not start ${JSON.stringify(out)}`);
  }
  // tasks: what the criteria ask to find
  {
    const out = await runScript(ctx, `${PARSE}${SOLUTIONS.looseJSON}
${SOLUTIONS.asiHazards}
${SOLUTIONS.numericValue}
const naive = (t) => { try { return JSON.parse(t.replace(/,\\s*([\\]}])/g, "$1")); } catch (e) { return e.name; } };
console.log(parse('"use strict"; return 08').split(":")[0], parse('"use strict"; return "\\\\08"').split(":")[0], parse('"use strict"; return "\\\\0"'), [, 1].includes(undefined));
console.log(JSON.stringify(naive('{"text": "a, ]"}')), JSON.stringify(naive('{"text": "\\\\"a, }"}')));
try { looseJSON("[1, , 2]"); } catch (e) { console.log(e.name); }
console.log(JSON.stringify(asiHazards("if (ok) {\\n}\\n(1)")), new Function("if (true) {}\\n(1)\\nreturn 'не склеилось'")(), new Function("const f = function () { return 5 }\\n(1)\\nreturn f")());
const bad = ["1__0", "1_", "0_1", "0x_1", "1.5n"];
console.log(bad.map((t) => { try { numericValue(t); return "нет"; } catch (e) { return e.name; } }).join(" "), bad.map((t) => parse(t).split(":")[0]).join(" "));
console.log(String(numericValue("9007199254740993")), String(numericValue("9007199254740993n")), Number("0x1F"), Number("1e3"), Number("1_0"), parse("\`\\\\x\`"));`, 'criteria.html');
    check(JSON.stringify(out) === JSON.stringify(['SyntaxError SyntaxError разобрано true', '{"text":"a]"} {"text":"\\"a}"}', 'SyntaxError', '[3] не склеилось 5',
      'SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError SyntaxError',
      '9007199254740992 9007199254740993 31 1000 NaN SyntaxError: Invalid hexadecimal escape sequence']),
    `tasks 1, 2, 3, 5, 6, 8, 9: strict 08 and "\\08", includes finds the hole, the naive regex eats commas in strings, [1, , 2] still throws, the linter is noisy after a block but a function expression glues, the bad numbers fail like Chrome, A.6 knows 0x and e but not _, untagged \\x fails ${JSON.stringify(out)}`);
  }
  // notes, homework 1: _ right after 0x is an error, between two hex digits it is not
  {
    const out = await runScript(ctx, `${PARSE}console.log(parse("0x_FF").split(":")[0], parse("0xF_F"), 0xF_F);`, 'hw1.html');
    check(JSON.stringify(out) === '["SyntaxError разобрано 255"]', `student homework 1: 0x_FF fails, 0xF_F is 255 ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  check(/NullLiteral :: null/.test(flat(clause(spec, 'sec-null-literals'))) && /BooleanLiteral :: true false/.test(flat(clause(spec, 'sec-boolean-literals'))),
    'lecture 2: NullLiteral :: null, BooleanLiteral :: true false');
  const reserved = terminals(spec, 'ReservedWord');
  check(['null', 'true', 'false'].every((w) => reserved.includes(w)) && !['undefined', 'NaN', 'Infinity'].some((w) => reserved.includes(w)),
    'lecture 2: null, true, false are reserved words, undefined, NaN, Infinity are not');
  const numeric = flat(clause(spec, 'sec-literals-numeric-literals'));
  check(numeric.includes('NumericLiteral :: DecimalLiteral DecimalBigIntegerLiteral NonDecimalIntegerLiteral [+Sep] NonDecimalIntegerLiteral [+Sep] BigIntLiteralSuffix LegacyOctalIntegerLiteral'),
    'lecture 3: the five forms of NumericLiteral, n only after integers');
  check(['0b BinaryDigits [?Sep] 0B', '0o OctalDigits [?Sep] 0O', '0x HexDigits [?Sep] 0X', 'ExponentIndicator :: one of e E'].every((w) => numeric.includes(w)),
    'lecture 3: prefixes and the exponent in both cases');
  check(/The SourceCharacter immediately following a NumericLiteral must not be an IdentifierStart or DecimalDigit/.test(numeric) && /3in is an error and not the two input elements 3 and in/.test(numeric),
    'lecture 3: after a number — not a name start or a digit, the example 3in');
  check(numeric.includes('NumericLiteralSeparator :: _') && numeric.includes('DecimalDigits [Sep] :: DecimalDigit DecimalDigits [?Sep] DecimalDigit [+Sep] DecimalDigits [+Sep] NumericLiteralSeparator DecimalDigit'),
    'lecture 4: the rule DecimalDigits[Sep] as the lecture writes it');
  check(/HexDigits \[~Sep\] but only if the MV of HexDigits ≤ 0x10FFFF/.test(flat(clause(spec, 'sec-template-literal-lexical-components'))), 'lecture 4: CodePoint is HexDigits[~Sep]');
  const conversions = flat(clause(spec, 'sec-number-conversions'));
  check(/NonDecimalIntegerLiteral \[~Sep\]/.test(conversions) && /DecimalDigits \[~Sep\]/.test(conversions), 'lecture 4, 15: A.6 — numeric strings are [~Sep]');
  check(/excluding all occurrences of NumericLiteralSeparator/.test(flat(clause(spec, 'sec-static-semantics-mv'))), 'lecture 5: MV skips the separators');
  const value = flat(clause(spec, 'sec-numericvalue'));
  check(/Return RoundMVResult ?\(MV of DecimalLiteral\)/.test(value) && /Return the BigInt value for the MV of NonDecimalIntegerLiteral/.test(value), 'lecture 5: NumericValue — RoundMVResult for Number, exact for BigInt');
  const round = flat(clause(spec, 'sec-roundmvresult'));
  check(/has 20 or fewer significant digits, return 𝔽 ?\(n\)/.test(round) && /implementation-defined choice/.test(round), 'lecture 5: RoundMVResult — 20 significant digits, then an implementation-defined choice');
  check(/NumericLiteral :: LegacyOctalIntegerLiteral DecimalIntegerLiteral :: NonOctalDecimalIntegerLiteral It is a Syntax Error if IsStrict/.test(flat(clause(spec, 'sec-numeric-literals-early-errors'))),
    'lecture 5: 12.9.3.1 — both legacy forms are errors in strict code');
  const strings = flat(clause(spec, 'sec-literals-string-literals'));
  check(/except for the closing quote code points, U\+005C \(REVERSE SOLIDUS\), U\+000D \(CARRIAGE RETURN\), and U\+000A \(LINE FEED\)/.test(strings)
    && strings.includes('DoubleStringCharacter :: SourceCharacter but not one of " or \\ or LineTerminator <LS> <PS>'), 'lecture 6: note 1 and <LS> <PS> as their own lines of the rule');
  check(strings.includes('LineContinuation :: \\ LineTerminatorSequence') && /such as \\n or \\u000A/.test(strings)
    && /Basic Multilingual Plane are encoded as a single code unit/.test(strings), 'lecture 6: LineContinuation, note 2 on \\n, UTF-16');
  check(strings.includes("SingleEscapeCharacter :: one of ' \" \\ b f n r t v") && strings.includes('0 [lookahead ∉ DecimalDigit ]')
    && strings.includes('HexEscapeSequence :: x HexDigit HexDigit') && /NonEscapeCharacter :: SourceCharacter but not one of EscapeCharacter or LineTerminator/.test(strings),
  'lecture 7: the rows of the escape table');
  check(flat(clause(spec, 'sec-string-literals-early-errors')).includes('function invalid () { "\\7" ; "use strict" ; }'), 'lecture 7: the example of 12.9.4.1');
  const regexp = flat(clause(spec, 'sec-literals-regular-expression-literals'));
  check(/used by the input element scanner to find the end of the regular expression literal/.test(regexp) && /never compare as === to each other/.test(regexp)
    && /use: \/\(\?:\)\//.test(regexp) && /RegularExpressionFlags :: \[empty\] RegularExpressionFlags IdentifierPartChar/.test(regexp), 'lecture 8: the scanner finds the end, never ===, /(?:)/, flags are name parts');
  const template = flat(clause(spec, 'sec-template-literal-lexical-components'));
  check(['NoSubstitutionTemplate :: ` TemplateCharacters opt `', 'TemplateHead :: ` TemplateCharacters opt ${', 'TemplateMiddle :: } TemplateCharacters opt ${',
    'TemplateTail :: } TemplateCharacters opt `', '$ [lookahead ≠ { ]'].every((w) => template.includes(w)), 'lecture 9: head, middle, tail; $ without {');
  check(/The TV of TemplateCharacter :: \\ NotEscapeSequence is undefined/.test(flat(clause(spec, 'sec-static-semantics-tv')))
    && /The TRV of LineTerminatorSequence :: <CR> <LF> is the String value consisting of the code unit 0x000A/.test(flat(clause(spec, 'sec-static-semantics-trv'))),
  'lecture 9: a wrong escape gives undefined, CR LF gives LF in the raw text');
  check(/Most ECMAScript statements and declarations must be terminated with a semicolon/.test(flat(clause(spec, 'sec-automatic-semicolon-insertion'))), 'lecture 10: 12.10 — most statements end with ;');
  const rules = flat(clause(spec, 'sec-rules-of-automatic-semicolon-insertion'));
  check(/There are three basic rules of semicolon insertion/.test(rules) && /offending token/.test(rules) && /separated from the previous token by at least one LineTerminator/.test(rules)
    && /The offending token is }/.test(rules) && /terminating semicolon of a do-while statement/.test(rules) && /the end of the input stream of tokens is encountered/.test(rules)
    && /restricted production/.test(rules), 'lecture 10: three rules, the offending token, }, do-while, the end of input, restricted productions');
  check(/a semicolon is never inserted automatically if the semicolon would then be parsed as an empty statement or if that semicolon would become one of the two semicolons in the header of a for statement/.test(rules),
    'lecture 10: the overriding condition — no empty statement, not in the head of for');
  const restricted = rules.slice(rules.indexOf('The following are the only restricted productions'), rules.indexOf('The practical effect'));
  check(['UpdateExpression', 'ContinueStatement', 'BreakStatement', 'ReturnStatement', 'ThrowStatement', 'YieldExpression', 'ArrowFunction', 'AsyncFunctionDeclaration'].every((w) => restricted.includes(w)),
    'lecture 12: the list of restricted productions in the note of 12.10.1');
  const examples = flat(clause(spec, 'sec-examples-of-automatic-semicolon-insertion'));
  check(['{ 1 2 } 3', 'for (a; b)', 'return a + b', 'if (a > b) else c = d', '{ 1 ; 2 ;} 3 ;'].every((w) => examples.includes(w)), 'lecture 10, 12: the examples of 12.10.2');
  const lists = flat(clause(spec, 'sec-asi-interesting-cases-in-statement-lists'));
  check(['An opening parenthesis', 'An opening square bracket', 'A template literal', 'Unary + or -', 'A RegExp literal'].every((w) => lists.includes(w)), 'lecture 11: the five starts of a line of 12.10.3.1');
  check(/UpdateExpression\. ContinueStatement\. BreakStatement\. ReturnStatement\. YieldExpression\. Async Function Definitions/.test(flat(clause(spec, 'sec-no-lineterminator-here-automatic-semicolon-insertion-list'))),
    'lecture 12: 12.10.3.2.1 — productions with optional operands');
  check(/Annex A \(informative\) Grammar Summary/.test(flat(clause(spec, 'sec-grammar-summary'))), 'lecture 15: Annex A is informative');
  const annexA = ['sec-lexical-grammar', 'sec-expressions', 'sec-statements', 'sec-functions-and-classes', 'sec-scripts-and-modules', 'sec-number-conversions', 'sec-time-zone-offset-string-format', 'sec-regular-expressions'];
  check(annexA.every((id, i) => new RegExp(`A\\.${i + 1} `).test(flat(clause(spec, id)).slice(0, 120))), 'lecture 15: A.1–A.8 in this order');
  check(/UTCOffset ::: ASCIISign Hour/.test(flat(clause(spec, 'sec-time-zone-offset-string-format'))), 'lecture 15: A.7 — the offset of a time zone');

  // tasks 9: the raw value keeps the backslash of both kinds of escapes
  const trv = flat(clause(spec, 'sec-static-semantics-trv'));
  check(['TemplateEscapeSequence', 'NotEscapeSequence'].every((w) => trv.includes(`The TRV of TemplateCharacter :: \\ ${w} is the string-concatenation of the code unit 0x005C (REVERSE SOLIDUS)`)),
    'tasks 9: 12.9.6.2 — TRV keeps the backslash of an escape and of a NotEscapeSequence');

  // notes, homework 1 and 3: the rule HexDigits[Sep] and the last example of 12.10.2
  check(numeric.includes('HexDigits [Sep] :: HexDigit HexDigits [?Sep] HexDigit [+Sep] HexDigits [+Sep] NumericLiteralSeparator HexDigit'), 'student homework 1: the rule HexDigits[Sep]');
  check(examples.includes('a = b + c (d + e). print ()') && /is not transformed by automatic semicolon insertion, because the parenthesized expression/.test(examples), 'student homework 3: the last example of 12.10.2');

  // what the lecture quotes from MDN, in the cached copy of mdn/content
  const mdnPage = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/${p}/index.md`], { encoding: 'utf8' });
  const commas = mdnPage('trailing_commas');
  check(/JavaScript allows trailing commas wherever a comma-separated list of values is accepted and more values may be expected after the last item/.test(commas)
    && /reduces the number of lines that need to be changed/.test(commas), 'MDN: where trailing commas are allowed and why');
  check(/If more than one trailing comma is used, an elision \(or hole\) is produced/.test(commas) && /Trailing commas don't affect the \[`length`\]/.test(commas), 'MDN: holes, length of a function');
  check(/trailing commas are not allowed after the rest element|a trailing comma is not allowed after the rest element/.test(commas) && /trailing commas are not allowed in JSON/.test(commas), 'MDN: not after the rest element, not in JSON');
  check(/only allowed in \[dynamic imports\]\([^)]*\) if the runtime also implements the second `options` parameter/.test(commas) && /from matching "exactly `n`" to matching "at least `n`"/.test(commas),
    'MDN: import() with options; the quantifier changes its meaning');
  check(commas.includes('### Trailing commas in destructuring') && /a trailing comma is not allowed after the rest element/.test(commas), 'student homework 4: MDN has the section on destructuring with the rest element');
  const lexical = mdnPage('lexical_grammar');
  check(/Within classes, class fields and generator methods can be a pitfall as well/.test(lexical) && lexical.includes(';(() => {'), 'MDN: class fields before a generator; ;( at the start of a line');

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '3').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 20 && unlinked.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 3, not linked: ${unlinked.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '3').map((c) => c[0]);
  const noLink = pages.filter((p) => !lecture.includes(`https://developer.mozilla.org/en-US/docs/${p}"`));
  check(pages.length === 1 && noLink.length === 0, `plan: ${pages.length} MDN page of day 3, not linked: ${noLink.join(', ') || 'none'}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
