// Course 3, day 11, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. Console output of scripts is rebuilt from Chrome's preview
// objects, as DevTools prints it (null as "null"); an uncaught error is printed as "Uncaught TypeError: …". A block
// that waits for a timer gets 700 ms before its page closes, a block with an async function or import() 400 ms.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-11.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-11.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; in the notes the output equals the comments of the lines
// that print it; the homework of the notes; the examples of the tasks run with reference solutions, the predictions of
// the tasks and what their criteria ask to find; the quoted lines of main.js (day 34 of course 2) are the
// real ones; the cheatsheet runs without an error; the experiments the lecture only tells about (an error inside
// finally hides the first one, break in for await closes an async generator, early errors of a catch parameter, of a
// labelled function and of const); what the lecture says about the text of ECMA-262 2026 (chapter 14 and the
// operations it calls) is checked against tools/.cache/ecma262-2026.html; the MDN pages of the footer exist in
// tools/.cache/mdn-content.git; the days it points to say what it says; the reference table holds all 50 rows of the
// day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-11');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
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
  // null comes as an object with subtype null and no description
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a block without a result-box: its output by "page #index" or by the first line; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ['ReferenceError', 'есть', 'ReferenceError 1 ReferenceError'],
  'tasks #1': ['0,1,2', '0.5,2', '3,3,3', '10,20,30', '10,10'],
  'tasks #2': ['case 1 case 2 два | case 1 case 2 case 3 три | case 1 case 2 case 3 иначе три', '21'],
  'tasks #8': ['из var | undefined', "ok | SyntaxError: Identifier 'e' has already been declared"],
};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  forLet: `function forLet(header, test, step, body) {
  let env = { ...header };
  while (true) {
    if (!test(env)) return;
    body(env);
    env = { ...env };
    step(env);
  }
}`,
  caseBlock: `function caseBlock(input, clauses) {
  const d = clauses.findIndex((c) => !c.selector);
  const A = d === -1 ? clauses : clauses.slice(0, d);
  const B = d === -1 ? [] : clauses.slice(d + 1);
  const runFrom = (list, start) => {
    for (let k = start; k < list.length; k++) if (list[k].body()) return true;
    return false;
  };
  for (let k = 0; k < A.length; k++) {
    if (A[k].selector() === input) {
      if (runFrom(A, k) || d === -1) return;
      if (clauses[d].body()) return;
      runFrom(B, 0);
      return;
    }
  }
  if (d === -1) return;
  for (let k = 0; k < B.length; k++) {
    if (B[k].selector() === input) {
      runFrom(B, k);
      return;
    }
  }
  if (clauses[d].body()) return;
  runFrom(B, 0);
}`,
  tryStatement: `function tryStatement(block, catcher, finalizer) {
  const B = block();
  const C = B.type === "throw" && catcher ? catcher(B.value) : B;
  if (!finalizer) return C;
  const F = finalizer();
  return F.type === "normal" ? C : F;
}`,
  openDeck: `async function openDeck(ui, load) {
  ui.loading = true;
  try {
    try {
      await load();
    } catch (err) {
      if (!err.cause) throw err;
      ui.error = \`\${err.message}: \${err.cause.message}\`;
    }
  } finally {
    ui.loading = false;
  }
}`,
  enumerate: `function* enumerate(obj) {
  const visited = new Set();
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc) {
      visited.add(key);
      if (desc.enumerable) yield key;
    }
  }
  const proto = Object.getPrototypeOf(obj);
  if (proto === null) return;
  for (const key of enumerate(proto)) if (!visited.has(key)) yield key;
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
  '// main.js, день 34 курса 2 — openDeck': 'intermediate/day-34/lecture.html',
};
const ATTEMPT = 'const attempt = (f) => { try { return String(f()); } catch (e) { return `${e.name}: ${e.message}`; } };\n';
const PARSE = 'const parse = (code) => { try { new Function(code); return "ok"; } catch (e) { return `${e.name}: ${e.message}`; } };\n';
const wait = (code) => (code.includes('setTimeout') ? 700 : code.includes('import(') || code.includes('async') ? 400 : 100);

// run code as the only <script> of a page; returns console lines and uncaught errors in order
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
      else if (EXPECT[`${name} #${i}`] ?? EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[`${name} #${i}`] ?? EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
    }
  }

  // what the lecture only tells about
  {
    const out = await runScript(ctx, `${ATTEMPT}${PARSE}console.log(attempt(() => { try { throw new Error("первая"); } finally { throw new Error("из finally"); } }));
console.log(parse("try {} catch ([a, a]) {}"), "|", parse("try {} catch (e) { let e; }"), "|", parse("try {} catch (e) { var e; }"));
console.log(parse("l: function f() {}"), "|", parse("'use strict'; l: function f() {}"), "|", parse("const k;"));
const log = [];
async function* source() { try { yield 1; yield 2; } finally { log.push("finally async-генератора"); } }
(async () => {
  for await (const v of source()) { log.push(v); break; }
  console.log(log.join(", "));
})();`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(['Error: из finally',
      "SyntaxError: Identifier 'a' has already been declared | SyntaxError: Identifier 'e' has already been declared | ok",
      "ok | SyntaxError: In strict mode code, functions can only be declared at top level or inside a block. | SyntaxError: Missing initializer in const declaration",
      '1, finally async-генератора']),
    `lecture 3, 10, 14, 15: an error in finally hides the first; catch parameter names (var e is allowed by Annex B); a labelled function only in non-strict code; const needs a value; break in for await closes an async generator ${JSON.stringify(out)}`);
  }
  // notes, homework 1–3: closures of a loop that changes i itself, a switch with default first, a shadowing own key
  {
    const out = await runScript(ctx, `const byLet = [];
for (let i = 0; i < 4; i++) { byLet.push(() => i); i++; }
const byVar = [];
for (var j = 0; j < 4; j++) { byVar.push(() => j); j++; }
const run = (input) => {
  const log = [];
  switch (input) {
    default: log.push("d");
    case 1: log.push("1"); break;
    case 2: log.push("2");
  }
  return log.join(" ");
};
const o = Object.create({ a: 1, b: 2 });
Object.defineProperty(o, "a", { value: 0, enumerable: false });
const keys = [];
for (const k in o) keys.push(k);
console.log(byLet.map((f) => f()).join(), "|", byVar.map((f) => f()).join(), "|", run(2), "|", run(3), "|", run(1), "|", keys.join(" "));`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(['1,3 | 4,4 | 2 | d 1 | 1 | b']),
      `student homework 1–3: let gives 1,3 and var 4,4; default first — 2, "d 1", 1; the own non-enumerable a hides the prototype a ${JSON.stringify(out)}`);
  }
  // tasks 4–8: what the criteria ask to find, with the reference solutions
  {
    const out = await runScript(ctx, `${SOLUTIONS.forLet}
${SOLUTIONS.caseBlock}
${SOLUTIONS.tryStatement}
const fns = [];
forLet({ i: 0 }, (e) => e.i < 3, (e) => { e.i++; }, (e) => { fns.push(() => e.i); e.i += 0.5; });
const envs = new Set();
forLet({ i: 0 }, (e) => { envs.add(e); return e.i < 2; }, (e) => { e.i++; }, () => {});
console.log(fns.map((f) => f()).join(), envs.size);
const log = [];
const clause = (name, value, stop) => ({ selector: () => { log.push("?" + name); return value; }, body: () => { log.push(name); return stop; } });
const clauses = [clause("a", 1, false), { body: () => { log.push("default"); return false; } }, clause("b", 2, true), clause("c", 3, false)];
const sel = (name, v) => { log.push("?" + name); return v; };
const real = (input) => { log.length = 0; switch (input) { case sel("a", 1): log.push("a"); default: log.push("default"); case sel("b", 2): log.push("b"); break; case sel("c", 3): log.push("c"); } return log.join(" "); };
const model = (input) => { log.length = 0; caseBlock(input, clauses); return log.join(" "); };
console.log([1, 2, 3, 9].every((x) => real(x) === model(x)));
const kind = (f) => { try { return "return " + f(); } catch (e) { return "throw " + e; } };
const f1 = () => { try { return 1; } finally { "уборка"; } };
const f3 = () => { try { return 1; } finally { return 2; } };
const f4 = () => { try { throw "x"; } catch { throw "из catch"; } finally { 0; } };
const normal = (value) => ({ type: "normal", value });
const ret = (value) => ({ type: "return", value });
const thr = (value) => ({ type: "throw", value });
const show = (c) => c.type + " " + c.value;
console.log(kind(f1) === show(tryStatement(() => ret(1), null, () => normal("уборка"))), kind(f3) === show(tryStatement(() => ret(1), null, () => ret(2))),
  kind(f4) === show(tryStatement(() => thr("x"), () => thr("из catch"), () => normal(0))));`, 'tasks-criteria-1.html');
    check(JSON.stringify(out) === JSON.stringify(['0.5,2 3', 'true', 'true true true']),
      `tasks 4–6: forLet gives 0.5,2 like the language and makes three copies for two passes; caseBlock = switch on 1, 2, 3, 9; tryStatement = real try in functions ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `${SOLUTIONS.openDeck}
${SOLUTIONS.enumerate}
const ui = { loading: false, error: "" };
openDeck(ui, () => { throw new TypeError("опечатка"); }).catch((e) => console.log("наружу:", e.message, ui.loading));
const forIn = (obj) => { const keys = []; for (const k in obj) keys.push(k); return keys.join(" "); };
const arr = [7, 8];
const withProto = Object.create({ x: 1, y: 2 });
withProto.z = 3;
Object.defineProperty(withProto, "x", { value: 0, enumerable: false });
console.log([{ b: 1, 1: 2, a: 3 }, arr, withProto].every((o) => [...enumerate(o)].join(" ") === forIn(o)));`, 'tasks-criteria-2.html');
    check(JSON.stringify(out) === JSON.stringify(['true', 'наружу: опечатка false']),
      `tasks 7, 8: the error without cause itself goes out (catch rethrows it) and the loading is off; enumerate agrees with for-in on three objects ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));

  check(hasAll(f('sec-statement-semantics-runtime-semantics-evaluation'), ['HoistableDeclaration : GeneratorDeclaration AsyncFunctionDeclaration AsyncGeneratorDeclaration Return empty', 'HoistableDeclaration : FunctionDeclaration Return ? Evaluation of FunctionDeclaration'])
    && !f('sec-statement-semantics-runtime-semantics-evaluation').includes('ClassDeclaration')
    && f('sec-function-definitions-runtime-semantics-evaluation').includes('FunctionDeclaration : function BindingIdentifier (FormalParameters) { FunctionBody } Return empty'),
  'lecture 1: 14.1.1 — a function declaration evaluates to nothing; a class is not a hoistable declaration');
  const bdi = f('sec-blockdeclarationinstantiation');
  check(inOrder(bdi, ['Let declarations be the LexicallyScopedDeclarations of code', 'If IsConstantDeclaration of d is true, then Perform ! env. CreateImmutableBinding (dn, true)', 'Perform ! env. CreateMutableBinding (dn, false)',
    'Let fo be InstantiateFunctionObject of d with arguments env and privateEnv', 'Perform ! env. InitializeBinding (fn, fo)'])
    && (bdi.match(/Normative Optional If the host is a web browser or otherwise supports Block-Level Function Declarations Web Legacy Compatibility Semantics/g) || []).length === 2
    && f('sec-block-level-function-declarations-web-legacy-compatibility-semantics').includes('B.3.2 Block-Level Function Declarations Web Legacy Compatibility Semantics')
    && f('sec-block-runtime-semantics-evaluation').includes('Let blockEnv be NewDeclarativeEnvironment (oldEnv)'),
  'lecture 2: BlockDeclarationInstantiation — const immutable, the rest mutable and uninitialized, functions made at once; two Normative Optional inserts of B.3.2; a new environment on every entry');
  check(hasAll(f('sec-let-and-const-declarations-static-semantics-early-errors'), ['It is a Syntax Error if the BoundNames of BindingList contains "let"', 'It is a Syntax Error if the BoundNames of BindingList contains any duplicate entries', 'It is a Syntax Error if Initializer is not present and IsConstantDeclaration of the LexicalDeclaration containing this LexicalBinding is true'])
    && inOrder(f('sec-let-and-const-declarations-runtime-semantics-evaluation'), ['LexicalBinding : BindingIdentifier Let lhs be ! ResolveBinding (StringValue of BindingIdentifier). Perform ! InitializeReferencedBinding (lhs, undefined)', 'Let value be ? NamedEvaluation of Initializer with argument bindingId', 'Perform ! InitializeReferencedBinding (lhs, value)', 'Return ? BindingInitialization of BindingPattern with arguments value and env'])
    && f('sec-declarative-environment-records-setmutablebinding-n-v-s').includes('If the binding for N in envRec is a strict binding, set S to true'),
  'lecture 3: let/const — "let", duplicates and const without a value are early errors; let x; initializes to undefined; the initializer first, then the binding; a strict binding throws on write in any code');
  const vs = f('sec-variable-statement-runtime-semantics-evaluation');
  check(hasAll(vs, ['VariableDeclaration : BindingIdentifier Return empty', 'Let lhs be ? ResolveBinding (bindingId)', 'Perform ? PutValue (lhs, value)',
    "If a VariableDeclaration is nested within a with statement and the BindingIdentifier in the VariableDeclaration is the same as a property name of the binding object of the with statement's Object Environment Record, then step 5 will assign value to the property"]),
  'lecture 4: var x; returns empty; var x = v is ResolveBinding and PutValue; the note about with');
  check(f('sec-expression-statement').includes('[lookahead ∉ { {, function, async [no LineTerminator here] function, class, let [ }]')
    && f('sec-expression-statement').includes('An ExpressionStatement cannot start with the two token sequence let [')
    && f('sec-if-statement-static-semantics-early-errors').includes('It is a Syntax Error if IsLabelledFunction (Statement) is true')
    && f('sec-functiondeclarations-in-ifstatement-statement-clauses').includes('B.3.3 FunctionDeclarations in IfStatement Statement Clauses')
    && f('sec-labelled-statements-static-semantics-early-errors').includes('unless that source text is non-strict code and the host is a web browser or otherwise supports Labelled Function Declarations')
    && inOrder(f('sec-islabelledfunction'), ['If stmt is not a LabelledStatement, return false', 'If item is LabelledItem : FunctionDeclaration, return true', 'Return IsLabelledFunction (subStmt)']),
  'lecture 5: an expression statement cannot start with {, function, class, let [; a labelled function under if is an early error; Annex B.3.3 lets a function be the body of if; 14.13.1 and IsLabelledFunction');
  check(inOrder(f('sec-loopcontinues'), ['If completion is a normal completion, return true', 'If completion is not a continue completion, return false', 'If completion. [[Target]] is empty, return true', 'If labelSet contains completion. [[Target]], return true'])
    && inOrder(f('sec-runtime-semantics-dowhileloopevaluation'), ['Let stmtResult be Completion (Evaluation of Statement)', 'If LoopContinues (stmtResult, labelSet) is false, return ? UpdateEmpty (stmtResult, V)', 'Let exprRef be ? Evaluation of Expression'])
    && f('sec-rules-of-automatic-semicolon-insertion').includes('The previous token is) and the inserted semicolon would then be parsed as the terminating semicolon of a do-while statement (14.7.2)'),
  'lecture 6: LoopContinues; do-while goes from continue to the test; the ASI rule for a do-while');
  const forLoop = f('sec-runtime-semantics-forloopevaluation');
  check(hasAll(forLoop, ['Let loopEnv be NewDeclarativeEnvironment (oldEnv)', 'If isConst is false, let perIterationLets be boundNames ; else let perIterationLets be a new empty List',
    'ForStatement : for (var VariableDeclarationList ; Expression opt ; Expression opt) Statement Perform ? Evaluation of VariableDeclarationList', 'Return ? ForBodyEvaluation (test, increment, Statement, «», labelSet)'])
    && inOrder(f('sec-forbodyevaluation'), ['Perform ? CreatePerIterationEnvironment (perIterationBindings)', 'If ToBoolean (testValue) is false, return V', 'Let result be Completion (Evaluation of stmt)',
      'If LoopContinues (result, labelSet) is false, return ? UpdateEmpty (result, V)', 'Perform ? CreatePerIterationEnvironment (perIterationBindings). If increment is not empty'])
    && inOrder(f('sec-createperiterationenvironment'), ['Let thisIterationEnv be NewDeclarativeEnvironment (outer)', 'Let lastValue be ? lastIterationEnv. GetBindingValue (bn, true)', 'Perform ! thisIterationEnv. InitializeBinding (bn, lastValue)']),
  'lecture 7: for (let…) — a header environment; const copies nothing, var makes no environments; a copy before the test and before the increment');
  check(inOrder(f('sec-runtime-semantics-forinofheadevaluation'), ['Let newEnv be NewDeclarativeEnvironment (oldEnv)', 'Perform ! newEnv. CreateMutableBinding (name, false)', 'Let exprRef be Completion (Evaluation of expr)',
    'If exprValue is either undefined or null, then Return Completion Record { [[Type]] : break', 'Let obj be ! ToObject (exprValue)', 'Return ? GetIterator (exprValue, iteratorKind)']),
  'lecture 8: the head of for-in/of in an environment with uninitialized names; null in for-in — a break record; ToObject; for-of — GetIterator');
  const enumerate = f('sec-enumerate-object-properties');
  check(hasAll(enumerate, ['Returned property keys do not include keys that are Symbols', 'A property that is deleted before it is processed by the iterator \'s next method is ignored',
    'the newly added properties are not guaranteed to be processed in the active enumeration', 'a property of a prototype is not processed if it has the same name as a property that has already been processed',
    'The values of [[Enumerable]] attributes are not considered when determining if a property of a prototype object has already been processed', 'EnumerateObjectProperties must obtain the own property keys of the target object by calling its [[OwnPropertyKeys]] internal method'])
    && inOrder(f('sec-ordinaryownpropertykeys'), ['array index', 'in ascending numeric index order', 'is a String and P is not an array index', 'in ascending chronological order of property creation']),
  'lecture 9: EnumerateObjectProperties — no symbols, deleted skipped, added not promised, prototype names once, [[Enumerable]] not counted; own keys: indexes ascending, then strings by creation');
  const body = f('sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset');
  check(hasAll(body, ['Let iterationEnv be NewDeclarativeEnvironment (oldEnv)', 'If iteratorKind is async, set nextResult to ? Await (nextResult)', 'If done is true, return V',
    'If iteratorKind is async, return ? AsyncIteratorClose (iteratorRecord, status). Return ? IteratorClose (iteratorRecord, status)'])
    && f('sec-runtime-semantics-forinofheadevaluation').includes('If iterationKind is async-iterate, let iteratorKind be async'),
  'lecture 10: for-of — a new environment on every step; done — no IteratorClose; abrupt — IteratorClose or AsyncIteratorClose; for await takes an async iterator');
  check(hasAll(f('sec-runtime-semantics-labelledevaluation'), ['BreakableStatement : SwitchStatement', 'If stmtResult is a break completion, then If stmtResult. [[Target]] is empty',
    'Let newLabelSet be the list-concatenation of labelSet and «label»', 'If stmtResult is a break completion and stmtResult. [[Target]] is label, then Set stmtResult to NormalCompletion (stmtResult. [[Value]])'])
    && f('sec-continue-statement-runtime-semantics-evaluation').includes('Return Completion Record { [[Type]] : continue, [[Value]] : empty, [[Target]] : label }')
    && f('sec-break-statement-runtime-semantics-evaluation').includes('Return Completion Record { [[Type]] : break, [[Value]] : empty, [[Target]] : label }'),
  'lecture 11: break and continue only make records; LabelledEvaluation — the label set, a break of its label becomes normal, a switch turns only an unlabelled break into normal');
  const cbe = f('sec-runtime-semantics-caseblockevaluation');
  check(inOrder(cbe, ['If found is false, then Set found to ? CaseClauseIsSelected (C, input)', 'If found is false, then For each CaseClause C of B', 'Let defaultR be Completion (Evaluation of DefaultClause)',
    'NOTE: The following is another complete iteration of the second CaseClauses'])
    && f('sec-runtime-semantics-caseclauseisselected').includes('Return IsStrictlyEqual (input, clauseSelector)')
    && inOrder(f('sec-switch-statement-runtime-semantics-evaluation'), ['Let blockEnv be NewDeclarativeEnvironment (oldEnv)', 'Perform BlockDeclarationInstantiation (CaseBlock, blockEnv)', 'Let R be Completion (CaseBlockEvaluation of CaseBlock with argument switchValue)']),
  'lecture 12: CaseBlockEvaluation — A, then the selectors of B, default, then the bodies of B again; IsStrictlyEqual; one environment for the whole case block');
  check(f('sec-return-statement-runtime-semantics-evaluation').includes('ReturnStatement : return ; Return ReturnCompletion (undefined)')
    && f('sec-throw-statement-runtime-semantics-evaluation').includes('Return ThrowCompletion (exprValue)')
    && hasAll(f('sec-debugger-statement-runtime-semantics-evaluation'), ['If an implementation-defined debugging facility is available and enabled', 'Return empty']),
  'lecture 13: return without an expression — undefined; throw — any value; debugger — empty without a debugger');
  check(hasAll(f('sec-try-statement-static-semantics-early-errors'), ['It is a Syntax Error if the BoundNames of CatchParameter contains any duplicate elements', 'It is a Syntax Error if any element of the BoundNames of CatchParameter also occurs in the LexicallyDeclaredNames of Block'])
    && inOrder(f('sec-runtime-semantics-catchclauseevaluation'), ['Let catchEnv be NewDeclarativeEnvironment (oldEnv)', 'Let status be Completion (BindingInitialization of CatchParameter with arguments thrownValue and catchEnv)', 'Catch : catch Block Return ? Evaluation of Block'])
    && hasAll(f('sec-try-statement-runtime-semantics-evaluation'), ['TryStatement : try Block Catch Finally Let B be Completion (Evaluation of Block). If B is a throw completion, let C be Completion (CatchClauseEvaluation of Catch with argument B. [[Value]]). Else, let C be B. Let F be Completion (Evaluation of Finally). If F is a normal completion, set F to C. Return ? UpdateEmpty (F, undefined)']),
  'lecture 14, 15: catch — its parameter names; its own environment and a pattern parameter; B, C, F — F normal gives C, else F');

  // the MDN pages of the footer
  check(['for', 'for...in', 'for...of', 'switch', 'try...catch'].every((p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/statements/${p}/index.md`], { encoding: 'utf8' }).startsWith('---\ntitle:')),
    'footer: the MDN pages for, for...in, for...of, switch, try...catch are in the cache');
  check(f('sec-variablestatements-in-catch-blocks').includes('They do not shadow the same-named bindings introduced by the CatchParameter and hence the Initializer for such var declarations will assign to the corresponding catch parameter rather than the var binding')
    && f('sec-try-statement-static-semantics-early-errors').includes('unless CatchParameter is CatchParameter : BindingIdentifier and the host is a web browser or otherwise supports VariableStatements in Catch Blocks')
    && f('sec-enumerate-object-properties').includes('function * EnumerateObjectProperties (obj) { const visited = new Set ()'),
  'tasks 8, 9: the note of 14.7.5.9 has the generator; B.3.4 — var in catch assigns to the parameter; 14.15.1 allows it only for a plain name');
  const tryPage = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/statements/try...catch/index.md'], { encoding: 'utf8' });
  check(hasAll(tryPage, ['### The finally block', '### Returning from a finally block']) && /> 14\.7\.4\.3 ForBodyEvaluation/.test(f('sec-forbodyevaluation'))
    && /> 14\.7\.5\.9 EnumerateObjectProperties/.test(f('sec-enumerate-object-properties')),
  'student homework 1, 3, 4: 14.7.4.3 and 14.7.5.9 are where the notes say; MDN try...catch has The finally block and Returning from a finally block');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('advanced/day-04/lecture.html').includes('Completion Record') && read('advanced/day-04/lecture.html').includes('return и finally') && read('advanced/day-03/lecture.html').includes('12.10.1')
    && read('advanced/day-05/lecture.html').includes('ToObject') && read('advanced/day-05/lecture.html').includes('IsStrictlyEqual') && read('advanced/day-07/lecture.html').includes('IteratorClose')
    && read('advanced/day-08/lecture.html').includes('BlockDeclarationInstantiation') && read('advanced/day-09/lecture.html').includes('debugger'),
  'lecture: course 3 — Completion Record and finally (day 4), ASI (3), ToObject and IsStrictlyEqual (5), IteratorClose (7), the block environment (8), the debugger (9)');
  check(read('intermediate/day-11/lecture.html').includes('OrdinaryOwnPropertyKeys') && read('intermediate/day-29/lecture.html').includes('for await')
    && read('intermediate/day-26/lecture.html').includes('finally') && read('intermediate/day-01/lecture.html').includes('GetIdentifierReference'),
  'lecture: course 2 — the order of own keys (day 11), for await (29), finally (26), the name lookup (1)');
  const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
  const dayOf = (id) => { const r = spRows.find((c) => c[0] === id); return r ? `${r[6]}.${r[7]}` : '?'; };
  const days = { 'sec-with-statement': '3.31', 'sec-block-level-function-declarations-web-legacy-compatibility-semantics': '3.31', 'sec-class-definitions': '3.12' };
  const wrong = Object.entries(days).filter(([id, d]) => dayOf(id) !== d).map(([id]) => `${id}=${dayOf(id)}`);
  const plan = read('docs/plan-3-advanced.md');
  check(wrong.length === 0 && /\*\*25\. [^*]*using/.test(plan), `lecture: the days of the plan it names — with and Annex B 31, classes 12, using 25 ${wrong.join(', ')}`);

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-11/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = spRows.filter((c) => c[6] === '3' && c[7] === '11').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 50 && refRows.length === 50 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 11, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine).filter((c) => c[5] === '3' && c[6] === '11');
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 11`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
