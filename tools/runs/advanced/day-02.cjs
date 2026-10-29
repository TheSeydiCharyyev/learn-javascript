// Course 3, day 2, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. The code stands right after <script>, without a line break:
// the hashbang block of section 9 is legal only as the very first code point of a script. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught SyntaxError: …".
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-02.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-02.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output, in the notes the comments of console.log lines do, in the
// tasks EXPECT holds the answers of the predictions and SOLUTIONS make the examples checkable; the quoted line of the neighbour (day 35 of course 2) is
// the real one; the cheatsheet runs without an error; the experiments the lecture only tells about (hashbang not first,
// a BOM before #!, U+180E and trim, ZWJ inside a name, await in a module, yield in strict code); what the lecture says
// about the text of ECMA-262 2026 is checked against tools/.cache/ecma262-2026.html and what it quotes from MDN against
// the page in tools/.cache/mdn-content.git; every row of the day's plan is a link and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-02');
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
  'const lines = ["a+++b", "a+++++b", "a+ ++b", "x>>>=1", "c??=5", "ready?.5:0"];': ['a+++b разобрано',
    "a+++++b SyntaxError: Unexpected token '++'", 'a+ ++b разобрано', 'x>>>=1 разобрано', 'c??=5 разобрано', 'ready?.5:0 разобрано'],
  // U+FEFF is white space for the language but not for Unicode, U+0085 the other way round
  'const codes = [0x09, 0xA0, 0xFEFF, 0x3000, 0x2028, 0x85, 0x200B, 0x180E];': ['9 true true true true', 'a0 true true true true',
    'feff true true true false', '3000 true true true true', '2028 true true true true', '85 false false false true',
    '200b false false false false', '180e false false false false'],
  'const ýyl = 2026;': ['2026 true', 'да да нет нет да да нет нет нет'],
  'const variants = [': ['1 разобрано', '2 разобрано', "3 SyntaxError: Unexpected token '>'", "4 SyntaxError: Unexpected identifier 'ter'",
    '5 SyntaxError: missing ) after argument list', '6 разобрано'],
  'let total = 0;': ['10', '1', '1 g'],
  'function a() { "use strict"; return this; }': ['true true false false false false true'],
};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  invisible: `function invisible(code) {
  const found = [];
  for (let at = 0; at < code.length; at++) {
    const ch = code[at];
    if (ch === " " || ch === "\\n" || !/[\\p{White_Space}\\p{Cf}]/u.test(ch)) continue;
    const hex = "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    const kind = /[\\n\\r\\u2028\\u2029]/.test(ch) ? "перевод строки" : /\\s/.test(ch) ? "пробел" : "не пробел";
    found.push({ at, code: hex, kind });
  }
  return found;
}`,
  accessor: `function accessor(name) {
  return /^[$_\\p{ID_Start}][$\\p{ID_Continue}]*$/u.test(name) ? \`card.\${name}\` : \`card[\${JSON.stringify(name)}]\`;
}`,
  tokens: `const PUNCT = ["{", "(", ")", "[", "]", ".", "...", ";", ",", "<", ">", "<=", ">=", "==", "!=", "===", "!==",
  "+", "-", "*", "%", "**", "++", "--", "<<", ">>", ">>>", "&", "|", "^", "!", "~", "&&", "||", "??", "?", ":",
  "=", "+=", "-=", "*=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??=", "=>", "}", "/", "/="]
  .sort((a, b) => b.length - a.length);
function tokens(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    const skip = rest.match(/^(?:\\s+|\\/\\/[^\\n\\r\\u2028\\u2029]*|\\/\\*[\\s\\S]*?\\*\\/)/);
    if (skip) { i += skip[0].length; continue; }
    const m = rest.match(/^\\?\\.(?!\\d)/) || rest.match(/^(?:\\d+(?:\\.\\d*)?|\\.\\d+)/) || rest.match(/^[$_\\p{ID_Start}][$\\p{ID_Continue}]*/u);
    const token = m ? m[0] : PUNCT.find((p) => rest.startsWith(p));
    if (!token) throw new SyntaxError(\`Invalid or unexpected token at \${i}\`);
    out.push(token);
    i += token.length;
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
// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = {
  '// deck.js, день 35 курса 2 — одна строка метода know': 'intermediate/day-35/lecture.html',
};
// the parse helper of the lecture: new Function in try, the way ParseText returns a tree or an error
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
  await p.waitForTimeout(80);
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
      // the tasks ask to copy parse from the lecture to the top of every file
      const code = blk.code.includes('parse(') && !blk.code.includes('const parse') ? PARSE + blk.code : blk.code;
      const out = await runScript(ctx, blk.example ? checkable(code) : code, `${name}-${i}.html`);
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
    const out = await runScript(ctx, `${PARSE}console.log(parse("let a = 1, b = 2; a+++++b;").split(":")[0]);
console.log(1_000);
console.log("\\u180E".trim().length);`, 'told.html');
    check(JSON.stringify(out) === '["SyntaxError","1000","1"]', `lecture 6, 2, 7: a+++++b is a SyntaxError, 1_000 in code is 1000, "\\u180E".trim().length is 1 ${JSON.stringify(out)}`);
  }
  {
    const space = await runScript(ctx, ' #!/usr/bin/env node\nconsole.log("пробел");', 'hb-space.html');
    const second = await runScript(ctx, 'console.log("первая");\n#!/usr/bin/env node', 'hb-second.html');
    const want = '["Uncaught SyntaxError: Invalid or unexpected token"]';
    check(JSON.stringify(space) === want && JSON.stringify(second) === want, `lecture 9: #! after a space and on the second line ${JSON.stringify([space, second])}`);
  }
  // section 9: the browser strips a BOM while decoding the file, so #! after it still works
  {
    const page = '<!doctype html><meta charset="utf-8"><script src="bom.js"></script>';
    await ctx.route('http://day.test/bom.html', (route) => route.fulfill({ contentType: 'text/html', body: page }));
    await ctx.route('http://day.test/bom.js', (route) => route.fulfill({ contentType: 'text/javascript',
      body: Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('#!/usr/bin/env node\nconsole.log("после метки");')]) }));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const out = [];
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', () => out.push('error'));
    await cdp.send('Runtime.enable');
    await p.goto('http://day.test/bom.html');
    await p.waitForTimeout(80);
    await p.close();
    check(JSON.stringify(out) === '["после метки"]', `lecture 9: a file with a BOM before #! runs in the browser ${JSON.stringify(out)}`);
  }
  // section 11: ZWNJ and ZWJ are ID_Continue, so a ZWJ inside a name makes another name
  {
    const out = await runScript(ctx, `const ZWNJ = String.fromCharCode(0x200C), ZWJ = String.fromCharCode(0x200D);
console.log(/^\\p{ID_Continue}$/u.test(ZWNJ), /^\\p{ID_Continue}$/u.test(ZWJ), /^\\p{ID_Start}$/u.test(ZWJ));
console.log(new Function("const ab = 1; const a" + ZWJ + "b = 2; return [ab, a" + ZWJ + "b];")());`, 'zwj.html');
    check(JSON.stringify(out) === '["true true false","(2) [1, 2]"]', `lecture 11: ZWNJ, ZWJ are ID_Continue, not ID_Start; ab and a+ZWJ+b are two names ${JSON.stringify(out)}`);
  }
  // section 12: await is reserved in a module, yield in strict code
  {
    const mod = await runScript(ctx, 'let await = 8;\nconsole.log(await);', 'await-module.html', ' type="module"');
    check(mod.length === 1 && mod[0].startsWith('Uncaught SyntaxError'), `lecture 12: let await in a module ${JSON.stringify(mod)}`);
    const out = await runScript(ctx, `${PARSE}console.log(parse('"use strict"; let yield = 1;'));
console.log(parse("let yield = 1;"));
console.log(parse("function* g() { let yield = 1; }"));
console.log(parse("async function f() { let await = 1; }"));`, 'yield.html');
    check(out.length === 4 && out[0].startsWith('SyntaxError') && out[1] === 'разобрано' && out[2].startsWith('SyntaxError') && out[3].startsWith('SyntaxError'),
      `lecture 12: yield is reserved in strict code and generators, await in async functions ${JSON.stringify(out)}`);
  }
  // tasks 2, 6, 8: what the criteria ask to find
  {
    const out = await runScript(ctx, `${PARSE}${SOLUTIONS.accessor}
${SOLUTIONS.tokens}
const ZWJ = String.fromCharCode(0x200D), NEL = String.fromCharCode(0x85), NBSP = String.fromCharCode(0xA0);
console.log(parse("let" + ZWJ + "x = 1;"));
console.log(["word", "ýyl", "if", "aýdym-saz", "2nji", ""].every((n) => parse("const card = {}; " + accessor(n) + ";") === "разобрано"));
console.log(tokens("a+++++b").join(" "), parse("let a = 1, b = 2; a+++++b;").split(":")[0]);
try { tokens("let" + NEL + "x"); } catch (e) { console.log(e.name); }
console.log(tokens("let" + NBSP + "x").length);`, 'criteria.html');
    check(JSON.stringify(out) === '["разобрано","true","a ++ ++ + b SyntaxError","SyntaxError","2"]',
      `tasks 2, 6, 8: let+ZWJ+x parses (a name), every accessor parses, a+++++b lexes and fails in syntax, U+0085 throws, U+00A0 is white space ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const lexical = flat(clause(spec, 'sec-lexical-and-regexp-grammars'));
  const goals = new Set(lexical.match(/InputElement\w+/g));
  check(goals.size === 5 && /two colons “ ?:: ?”/.test(lexical), `lecture 2: 5.1.2 names ${goals.size} goals InputElement… and two colons`);
  check(/if a MultiLineComment contains one or more line terminators, then it is replaced by a single line terminator/.test(lexical), 'lecture 9: 5.1.2 — a multi-line comment with a line terminator becomes one line terminator');
  check(/three colons “ ?::: ?”/.test(flat(clause(spec, 'sec-numeric-string-grammar'))) && /StringNumericLiteral/.test(flat(clause(spec, 'sec-numeric-string-grammar'))), 'lecture 2: 5.1.3 — StringNumericLiteral, three colons');
  const syntactic = flat(clause(spec, 'sec-syntactic-grammar'));
  check(/clauses 13 through 16/.test(syntactic) && /goal symbols Script and Module/.test(syntactic) && /just one colon “ ?: ?”/.test(syntactic)
    && /must cover an N/.test(syntactic) && /implementations are not required to use an analogous data structure/.test(syntactic),
  'lecture 2: 5.1.4 — clauses 13–16, Script or Module, one colon, "P must cover an N", parse nodes are not required');
  check(/actually has four alternative right-hand sides/.test(flat(clause(spec, 'sec-optional-symbols'))), 'lecture 3: a ForStatement with two opt has four right-hand sides');
  check(/for \(\[lookahead ≠ let \[ ?\] Expression \[~In/.test(flat(clause(spec, 'sec-for-statement'))), 'lecture 3: the head of for starts with Expression[~In]');
  check(flat(clause(spec, 'sec-expression-statement')).includes('[lookahead ∉ { {, function, async [no LineTerminator here] function, class, let [ }]'), 'lecture 3: the lookahead of 14.5, word for word');
  const source = flat(clause(spec, 'sec-source-text'));
  check(/SourceCharacter :: any Unicode code point/.test(source) && /encodings used to store and interchange ECMAScript source text is not relevant/.test(source)
    && /Java programming language/.test(source) && /within a comment is never interpreted/.test(source), 'lecture 4: 11.1 — code points, the encoding does not matter, Java and \\u000A in a comment');
  check(/canonically equivalent according to the Unicode Standard are not equal unless/.test(flat(clause(spec, 'sec-identifier-names'))), 'lecture 4: 12.7.1 — canonically equivalent names are not equal');
  check(/returns a Parse Node or a non-empty List of SyntaxError objects/.test(flat(clause(spec, 'sec-parsetext'))) && /parsing errors and\/or early errors/.test(flat(clause(spec, 'sec-parsetext'))), 'lecture 4: ParseText returns a tree or a list of syntax and early errors');
  const kinds = flat(clause(spec, 'sec-types-of-source-code'));
  check(/There are four types of ECMAScript code/.test(kinds) && ['Global code is', 'Eval code is', 'Function code is', 'Module code is'].every((w) => kinds.includes(w))
    && /does not include any source text that is parsed as the function code of a nested/.test(kinds), 'lecture 5: 11.2 — four types of code, a nested function is not part of the outer one');
  check(/either of the exact code point sequences "use strict" or 'use strict'/.test(flat(clause(spec, 'sec-directive-prologues-and-the-use-strict-directive')))
    && /may not contain an EscapeSequence/.test(flat(clause(spec, 'sec-directive-prologues-and-the-use-strict-directive'))), 'lecture 5: 11.2.1 — "use strict" exactly, without escapes');
  const strict = flat(clause(spec, 'sec-strict-mode-code'));
  check(/Module code is always strict mode code/.test(strict) && /All parts of a ClassDeclaration or a ClassExpression are strict mode code/.test(strict), 'lecture 5: 11.2.2 — modules and classes are always strict');
  check(/is not observable from the perspective of ECMAScript code/.test(flat(clause(spec, 'sec-non-ecmascript-functions'))), 'lecture 5: 11.2.3 — a built-in function on another language is not observable');
  const lexer = flat(clause(spec, 'sec-ecmascript-language-lexical-grammar'));
  check(/scanned from left to right, repeatedly taking the longest possible sequence of code points/.test(lexer), 'lecture 6: left to right, the longest possible sequence');
  check(/a = b \/hi\/g\. ?exec ?\(c\)\. ?map ?\(d\);/.test(lexer) && /a = b \/ hi \/ g\. ?exec/.test(lexer), 'lecture 6: the note of clause 12 — a = b, /hi/g on the next line is division');
  check(/The InputElementHashbangOrRegExp goal is used at the start of a Script or Module/.test(lexer), 'lecture 9: the hashbang goal is used only at the start');
  check(lexer.includes('InputElementTemplateTail :: WhiteSpace LineTerminator Comment CommonToken DivPunctuator TemplateSubstitutionTail'), 'lecture 6: InputElementTemplateTail takes TemplateSubstitutionTail instead of }');
  const white = flat(clause(spec, 'sec-white-space'));
  check(['U+0009', 'U+000B', 'U+000C', 'U+FEFF', 'Space_Separator'].every((w) => white.includes(w)) && !white.includes('U+0085') && /U\+00A0 \(NO-BREAK SPACE\) code points are part of <USP>/.test(white)
    && /intentionally excludes/.test(white), 'lecture 7: table 30 — TAB VT FF U+FEFF Space_Separator with U+00A0, no U+0085');
  check(/In ECMAScript source text <ZWNBSP> code points are treated as white space characters/.test(flat(clause(spec, 'sec-unicode-format-control-characters'))), 'lecture 7: 12.1 — U+FEFF further in the text is white space');
  const lines = flat(clause(spec, 'sec-line-terminators'));
  const table31 = lines.slice(lines.indexOf('Table 31'), lines.indexOf('Only the Unicode code points'));
  check(JSON.stringify(table31.match(/U\+[0-9A-F]{4}/g)) === '["U+000A","U+000D","U+2028","U+2029"]', `lecture 8: table 31 — ${table31.match(/U\+[0-9A-F]{4}/g).join(' ')}`);
  check(/should be considered a single SourceCharacter for the purpose of reporting line numbers/.test(lines) && /matched by the \\s class in regular expressions/.test(lines), 'lecture 8: CR LF is one for line numbers; \\s takes line terminators');
  const comments = flat(clause(spec, 'sec-comments'));
  check(/Multi-line comments cannot nest/.test(comments) && /the entire comment is considered to be a LineTerminator/.test(comments), 'lecture 9: comments do not nest; with a line terminator inside, a comment is a line terminator');
  check(/CommonToken :: IdentifierName PrivateIdentifier Punctuator NumericLiteral StringLiteral Template/.test(flat(clause(spec, 'sec-tokens')))
    && /The DivPunctuator, RegularExpressionLiteral, RightBracePunctuator, and TemplateSubstitutionTail productions derive additional tokens/.test(flat(clause(spec, 'sec-tokens'))), 'lecture 10: 12.6 — six common tokens and four more');
  const other = terminals(spec, 'OtherPunctuator');
  check(other.length > 50 && other[0] === '{' && other.at(-1) === '=>', `lecture 10: OtherPunctuator has ${other.length} signs, from ${other[0]} to ${other.at(-1)}`);
  check(/OptionalChainingPunctuator :: \?\. \[lookahead ∉ DecimalDigit ?\]/.test(flat(clause(spec, 'sec-punctuators'))), 'lecture 10: ?. [lookahead ∉ DecimalDigit]');
  const names = flat(clause(spec, 'sec-names-and-keywords'));
  check(/IdentifierStartChar :: UnicodeIDStart \$ _ IdentifierPartChar :: UnicodeIDContinue \$ AsciiLetter/.test(names) && !/ZWNJ|ZWJ/.test(names), 'lecture 11: a name is ID_Start $ _, then ID_Continue $ — no separate ZWNJ, ZWJ in 2026');
  const reserved = terminals(spec, 'ReservedWord');
  check(reserved.includes('enum') && !['let', 'async', 'of', 'get', 'static', 'eval', 'arguments'].some((w) => reserved.includes(w)), `lecture 12: ReservedWord (${reserved.length}) has enum, not let, async, of, get, static`);
  const keywords = flat(clause(spec, 'sec-keywords-and-reserved-words'));
  check(/there are five categories of identifier names/.test(keywords) && /await is reserved only inside async functions and modules/.test(keywords)
    && /in strict mode code : let, static, implements, interface, package, private, protected, and public/.test(keywords)
    && /as, async, from, get, meta, of, set, and target/.test(keywords), 'lecture 12: five categories; await in async functions and modules; strict and contextual lists');
  check(/it is not possible to declare a variable named "else" by spelling it els\\u\{65\}/.test(keywords) && /enum is not currently used as a keyword/.test(keywords)
    && /The names arguments and eval are not keywords, but they are subject to some restrictions in strict mode code/.test(keywords), 'lecture 12: els\\u{65}, enum for the future, note 3 on eval and arguments');
  const early = flat(clause(spec, 'sec-identifiers-static-semantics-early-errors'));
  check(/LabelIdentifier : yield It is a Syntax Error if IsStrict \(this production\) is true/.test(early)
    && /LabelIdentifier : await It is a Syntax Error if the goal symbol of the syntactic grammar is Module/.test(early), 'lecture 12: 13.1.1 — yield is an error in strict code, await in a module');

  // tasks: what they say about the text
  check(/A UnicodeEscapeSequence cannot be used to contribute a code point to an IdentifierName that would otherwise be invalid/.test(flat(clause(spec, 'sec-identifier-names'))), 'tasks 3: 12.7.1 — an escape cannot bring in an invalid code point');
  check(/ArrowParameters \[\?Yield, \?Await\] \[no LineTerminator here\] =>/.test(flat(clause(spec, 'sec-arrow-function-definitions'))), 'tasks 4: 15.3 — no line terminator before =>');
  check(/The syntactic grammar defines Identifier as an IdentifierName that is not a ReservedWord/.test(names)
    && /MemberExpression \[\?Yield, \?Await\]\. IdentifierName/.test(flat(clause(spec, 'sec-left-hand-side-expressions'))), 'tasks 6: Identifier is IdentifierName but not ReservedWord; after a dot — IdentifierName');
  const prologue = flat(clause(spec, 'sec-directive-prologues-and-the-use-strict-directive'));
  check(/consists entirely of a StringLiteral token followed by a semicolon/.test(prologue) && /may be inserted by automatic semicolon insertion/.test(prologue)
    && /longest sequence of ExpressionStatement/.test(prologue), 'tasks 9: 11.2.1 — the longest sequence of string-only statements, ASI may give the semicolon');

  // notes, homework 1: yield is in the list, let and async are not
  check(reserved.includes('yield') && !reserved.includes('let') && !reserved.includes('async'), 'student homework 1: ReservedWord has yield, not let, async');

  // what the lecture quotes from MDN, in the cached copy of mdn/content
  const mdn = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/lexical_grammar/index.md'], { encoding: 'utf8' });
  check(mdn.includes('ES2016 upgraded the reference Unicode standard from 5.1 to 8.0.0') && mdn.includes('"\\u180E".trim().length'), 'MDN: U+180E and trim after ES2016');
  check(mdn.includes('which contains U+200C (ZWNJ) and U+200D (ZWJ)'), 'MDN: ID_Continue contains ZWNJ and ZWJ');
  check(mdn.includes('/[$_\\p{ID_Start}][$\\p{ID_Continue}]*/u'), 'MDN: the regex of names');
  check(/stripped during UTF-8 decoding/.test(mdn) && /shell will not recognize the hashbang if it's preceded by a BOM/.test(mdn), 'MDN: a BOM before #! — stripped by the browser, breaks the shell');
  const older = mdn.slice(mdn.indexOf('#### Future reserved words in older standards'), mdn.indexOf('### Identifiers with special meanings'));
  check(['int', 'goto', 'abstract', 'boolean'].every((w) => older.includes(`- \`${w}\``)) && /ECMAScript 1 till 3/.test(older), 'MDN: int, goto, abstract, boolean — reserved by editions 1–3');
  const format = mdn.slice(mdn.indexOf('## Format-control characters'), mdn.indexOf('## White space'));
  check(/U\+200C .*Zero width non-joiner/.test(format) && /U\+200D .*Zero width joiner/.test(format), 'student homework 4: MDN has the section Format-control characters with ZWNJ and ZWJ');

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '2').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 29 && unlinked.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 2, not linked: ${unlinked.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '2').map((c) => c[0]);
  const noLink = pages.filter((p) => !lecture.includes(`https://developer.mozilla.org/en-US/docs/${p}"`));
  check(pages.length === 1 && noLink.length === 0, `plan: ${pages.length} MDN page of day 2, not linked: ${noLink.join(', ') || 'none'}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
