// Course 3, day 8, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. A block whose first line starts with "// в консоли" is
// console input, run line by line through Runtime.evaluate with replMode, as on day 4. Console output of scripts is
// rebuilt from Chrome's preview objects, as DevTools prints it (null as "null"); an uncaught error is printed as
// "Uncaught TypeError: …". A block with import() (modules from data: addresses) gets 400 ms before its page closes.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-08.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-08.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the quoted lines of main.js (day 33 of course 2, a block
// with data-page) are the real ones; the cheatsheet runs without an error; the experiments the lecture only tells
// about; what the lecture says about the text of ECMA-262 2026 (chapter 8 and the early errors and evaluations that use
// it) is checked against tools/.cache/ecma262-2026.html; the days it points to say what it says; the reference table
// holds all 33 rows of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-08');
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
  // null comes as an object with subtype null and no description
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};
// what the console prints after an input: strings in quotes, the rest as in console.log
const echo = (a) => (a.type === 'string' ? q(a.value) : show(a));

// a block without a result-box: its output by "page #index" or by the first line; the tasks ask to predict these
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
  '// main.js, день 33 курса 2 — заглушки и слушатели': 'intermediate/day-33/lecture.html',
};
const PARSE = 'const parse = (code) => { try { new Function(code); return "ok"; } catch (e) { return e.name + ": " + e.message; } };\n';

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
  await p.waitForTimeout(code.includes('import(') ? 400 : 100);
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
      else if (EXPECT[`${name} #${i}`] ?? EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[`${name} #${i}`] ?? EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
    }
  }

  // what the lecture only tells about
  {
    const out = await runScript(ctx, `${PARSE}console.log(parse("let { a, b: [c, ...d] } = { b: [] }; let b;"), "|", parse("let { a, b: [c, ...d] } = { b: [] }; let d;"), "|", parse("class Card {} let Card;"), "|", parse("function f(x, { y } = {}, ...z) { let y; }"));
const inner = "'data:text/javascript,export default 1; export const y = 2;'";
Promise.allSettled([import("data:text/javascript,import x, { y as z } from " + inner + "; const y = 5; export const r = [x, z, y];"), import("data:text/javascript,import x, { y as z } from " + inner + "; const z = 5;")])
  .then(([ok, bad]) => console.log(ok.value.r.join(), "|", bad.reason.name + ": " + bad.reason.message));`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(["ok | SyntaxError: Identifier 'd' has already been declared | SyntaxError: Identifier 'Card' has already been declared | SyntaxError: Identifier 'y' has already been declared",
      "1,2,5 | SyntaxError: Identifier 'z' has already been declared"]),
    `lecture 3, the table: b is a key and not a name, d is; Card; y of the parameters; an import binds the local z, not the outer y ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `let a1 = 1;
a1 &&= () => {};
let a2 = null;
a2 ??= function () {};
var v = () => {};
function p(cb = () => {}) { return cb.name; }
const { q = class {} } = {};
console.log([a1, a2, v].map((f) => f.name).join(), p(), q.name);
const s = document.createElement("script");
s.textContent = "(() => new.target)";
document.body.append(s);`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify(['a1,a2,v cb q', "Uncaught SyntaxError: Failed to execute 'append' on 'Element': new.target expression is not allowed here"]),
      `lecture 9, 10: &&=, ??=, var, a parameter default and a destructuring default name the function; an arrow is transparent for new.target at the top of a script ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const __proto__ = { admin: true };
const short = { __proto__ };
const computed = { ["__proto__"]: { admin: true } };
const literal = { "__proto__": { admin: true } };
console.log(Object.hasOwn(short, "__proto__"), short.admin, Object.hasOwn(computed, "__proto__"), computed.admin, Object.hasOwn(literal, "__proto__"), literal.admin);
import("data:text/javascript,export const out = typeof render; function render() {}").then((m) => console.log(m.out));
const button = document.createElement("button");
let n = 0;
button.addEventListener("click", () => n++);
button.removeEventListener("click", () => n++);
button.click();
console.log(n);`, 'told-3.html');
    check(JSON.stringify(out) === JSON.stringify(['true undefined true undefined false true', '1', 'function']),
      `lecture 14, 15: the shorthand and the computed key make an own "__proto__", the quoted key sets the prototype; a module function is ready before its line; another equal arrow does not remove a listener ${JSON.stringify(out)}`);
  }
  // notes, homework 1 and 2: two functions in a block in strict code; five names
  {
    const out = await runScript(ctx, `${PARSE}const a = function b() {};
let c;
c = class {};
const { d = function () {} } = {};
console.log(parse("'use strict'; { function f() {} function f() {} }"), [a, c, ({ ["x" + 1]: () => {} }).x1, [() => {}][0], d].map((f) => JSON.stringify(f.name)).join(" "));`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(["SyntaxError: Identifier 'f' has already been declared \"b\" \"c\" \"x1\" \"\" \"d\""]),
      `student homework 1, 2: strict code forbids the two functions; b, c, x1, "", d ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const secnum = (id, text) => f(id).includes(text);
  check(f('sec-algorithm-conventions-syntax-directed-operations').includes("chain productions have an implicit definition for every operation that might be applied to that production's left-hand side nonterminal. The implicit definition simply reapplies the same operation"),
    'lecture 1: 5.2.2 — a chain production without its own piece passes the operation down');
  check(f('sec-evaluation').includes('The definitions for this operation are distributed over the "ECMAScript Language" sections of this specification. Each definition appears after the defining occurrence of the relevant productions')
    && secnum('sec-additive-operators', '13.8 Additive Operators') && secnum('sec-if-statement', '14.6 The if Statement'), 'lecture 2: 8.1 is distributed; addition is 13.8, if is 14.6');
  const bound = f('sec-static-semantics-boundnames');
  check(hasAll(bound, ['"*default*" is used within this specification as a synthetic name', 'This "*default*" string is never accessible to ECMAScript code', 'ModuleExportName as ImportedBinding Return the BoundNames of ImportedBinding']),
    'lecture 3: BoundNames — *default* is a synthetic name never seen by code; an import binds its local name');
  check(f('sec-static-semantics-isconstantdeclaration').includes('LetOrConst : let Return false. LetOrConst : const Return true') && f('sec-static-semantics-declarationpart').includes('Declaration : LexicalDeclaration Return LexicalDeclaration'),
    'lecture 3: IsConstantDeclaration — const is true; DeclarationPart returns the declaration');
  check(hasAll(f('sec-static-semantics-lexicallydeclarednames'), ['Block : { } Return a new empty List', 'If Statement is Statement : LabelledStatement, return the LexicallyDeclaredNames of LabelledStatement. Return a new empty List', 'StatementListItem : Declaration Return the BoundNames of Declaration'])
    && hasAll(f('sec-static-semantics-vardeclarednames'), ['StatementListItem : Declaration Return a new empty List', 'VariableStatement : var VariableDeclarationList ; Return the BoundNames of VariableDeclarationList', 'IfStatement : if (Expression) Statement Return the VarDeclaredNames of Statement']),
  'lecture 4: lexical names stay in their block, var names go through statements; declarations are not var');
  check(f('sec-static-semantics-lexicallyscopeddeclarations').includes('8.2.5 Static Semantics: LexicallyScopedDeclarations') && f('sec-static-semantics-varscopeddeclarations').includes('8.2.7 Static Semantics: VarScopedDeclarations'),
    'lecture 4: 8.2.5 and 8.2.7 are the lists of declarations');
  check(inOrder(f('sec-block-static-semantics-early-errors'), ['14.2.1 Static Semantics: Early Errors', 'It is a Syntax Error if the LexicallyDeclaredNames of StatementList contains any duplicate entries, unless the host is a web browser',
    'The duplicate entries are only bound by FunctionDeclarations', 'It is a Syntax Error if any element of the LexicallyDeclaredNames of StatementList also occurs in the VarDeclaredNames of StatementList'])
    && hasAll(f('sec-function-definitions-static-semantics-early-errors'), ['15.2.1 Static Semantics: Early Errors', 'It is a Syntax Error if any element of the BoundNames of FormalParameters also occurs in the LexicallyDeclaredNames of FunctionBody']),
  'lecture 4, 6: 14.2.1 — duplicates (the browser exception for functions), lexical and var; 15.2.1 — parameters and lexical names');
  check(inOrder(f('sec-block-runtime-semantics-evaluation'), ['14.2.2 Runtime Semantics: Evaluation', 'Let blockEnv be NewDeclarativeEnvironment (oldEnv)', 'Perform BlockDeclarationInstantiation (StatementList, blockEnv)'])
    && hasAll(f('sec-blockdeclarationinstantiation'), ['14.2.3 BlockDeclarationInstantiation', 'LexicallyScopedDeclarations of code']), 'lecture 4: a block gets a new environment on every entry and its bindings from LexicallyScopedDeclarations');
  check(f('sec-switch-statement-static-semantics-early-errors').includes('It is a Syntax Error if the LexicallyDeclaredNames of CaseBlock contains any duplicate entries')
    && f('sec-try-statement-static-semantics-early-errors').includes('It is a Syntax Error if any element of the BoundNames of CatchParameter also occurs in the LexicallyDeclaredNames of Block')
    && hasAll(f('sec-variablestatements-in-catch-blocks'), ['B.3.4 VariableStatements in Catch Blocks', 'may contain var declarations that bind a name that is also bound by the CatchParameter']),
  'lecture 5: all cases of a switch are one list; a catch parameter and a let clash; var in catch is Annex B');
  check(hasAll(f('sec-static-semantics-toplevellexicallydeclarednames'), ['If Declaration is Declaration : HoistableDeclaration, then Return a new empty List', 'At the top level of a function, or script, function declarations are treated like var declarations rather than like lexical declarations'])
    && ['sec-static-semantics-toplevellexicallyscopeddeclarations', 'sec-static-semantics-toplevelvardeclarednames', 'sec-static-semantics-toplevelvarscopeddeclarations'].every((id) => f(id).includes('Static Semantics: TopLevel')),
  'lecture 6: 8.2.8 — at the top a function is like var; 8.2.9–8.2.11');
  check(hasAll(f('sec-module-semantics-static-semantics-early-errors'), ['It is a Syntax Error if the LexicallyDeclaredNames of ModuleItemList contains any duplicate entries', 'It is a Syntax Error if any element of the LexicallyDeclaredNames of ModuleItemList also occurs in the VarDeclaredNames of ModuleItemList'])
    && f('sec-source-text-module-record-initialize-environment').includes('InstantiateFunctionObject of d with arguments env and privateEnv'),
  'lecture 6, 15: a module uses the plain lexical names; its functions are made while the module is prepared');
  check(['sec-static-semantics-containsduplicatelabels', 'sec-static-semantics-containsundefinedbreaktarget', 'sec-static-semantics-containsundefinedcontinuetarget'].every((id, i) => f(id).includes(`8.3.${i + 1} Static Semantics: Contains`))
    && inOrder(f('sec-scripts-static-semantics-early-errors'), ['It is a Syntax Error if ContainsDuplicateLabels of StatementList with argument «» is true',
      'It is a Syntax Error if ContainsUndefinedBreakTarget of StatementList with argument «» is true', 'It is a Syntax Error if ContainsUndefinedContinueTarget of StatementList with arguments «»']),
  'lecture 8: the three label checks 8.3.1–8.3.3 and the early errors of a script that use them');
  const contains = f('sec-static-semantics-contains');
  check(hasAll(contains, ['Note 1 Static semantic rules that depend upon substructure generally do not look into function definitions', 'ArrowFunction : ArrowParameters => ConciseBody If symbol is not one of NewTarget, SuperProperty, SuperCall, super, or this, return false'])
    && f('sec-static-semantics-computedpropertycontains').includes('PropertyName : ComputedPropertyName Return the result of ComputedPropertyName Contains symbol'),
  'lecture 9: Contains does not look into functions, an arrow is transparent for this, super, new.target; ComputedPropertyContains — computed keys');
  check(f('sec-static-semantics-hasname').includes('ClassExpression : class ClassTail Return false')
    && f('sec-static-semantics-isfunctiondefinition').includes('PrimaryExpression : CoverParenthesizedExpressionAndArrowParameterList Let expr be the ParenthesizedExpression that is covered by CoverParenthesizedExpressionAndArrowParameterList. Return IsFunctionDefinition of expr')
    && inOrder(f('sec-isanonymousfunctiondefinition'), ['If IsFunctionDefinition of expr is false, return false', 'Let hasName be HasName of expr', 'If hasName is true, return false', 'Return true'])
    && f('sec-static-semantics-isidentifierref').includes('PrimaryExpression : IdentifierReference Return true')
    && f('sec-runtime-semantics-namedevaluation').includes('ParenthesizedExpression : (Expression) Assert : IsAnonymousFunctionDefinition (Expression) is true. Return ? NamedEvaluation of Expression with argument name'),
  'lecture 10: HasName, IsFunctionDefinition through parentheses, IsAnonymousFunctionDefinition, IsIdentifierRef, NamedEvaluation through parentheses');
  const assign = f('sec-assignment-operators-runtime-semantics-evaluation');
  check((assign.match(/NamedEvaluation of AssignmentExpression with argument lhs/g) || []).length === 4
    && assign.includes('If IsAnonymousFunctionDefinition (AssignmentExpression) is true and IsIdentifierRef of LeftHandSideExpression is true')
    && f('sec-let-and-const-declarations-runtime-semantics-evaluation').includes('If IsAnonymousFunctionDefinition (Initializer) is true, then Let value be ? NamedEvaluation of Initializer with argument bindingId')
    && f('sec-runtime-semantics-propertydefinitionevaluation').includes('If IsAnonymousFunctionDefinition (AssignmentExpression) is true and isProtoSetter is false, then Let propValue be ? NamedEvaluation of AssignmentExpression with argument propKey')
    && hasAll(f('sec-exports-runtime-semantics-evaluation'), ['16.2.3.7 Runtime Semantics: Evaluation', 'NamedEvaluation of AssignmentExpression with argument "default"']),
  'lecture 10: NamedEvaluation in =, &&=, ||=, ??= to a plain name, let/const, an object key, export default (16.2.3.7)');
  check(hasAll(f('sec-setfunctionname'), ['10.2.9 SetFunctionName', 'set name to the string-concatenation of "[", description, and "]"', 'If prefix is present'])
    && f('sec-function.prototype.bind').includes('SetFunctionName (F, targetName, "bound")') && f('sec-createdynamicfunction').includes('SetFunctionName (F, "anonymous")'),
  'lecture 10, 11: SetFunctionName (10.2.9) — [symbol] and prefixes; bind — "bound"; new Function — "anonymous"');
  check(f('sec-runtime-semantics-instantiatefunctionobject').includes('8.6.1 Runtime Semantics: InstantiateFunctionObject')
    && f('sec-runtime-semantics-bindinginitialization').includes('undefined is passed for environment to indicate that a PutValue operation should be used to assign the initialization value. This is the case for var statements and formal parameter lists of some non-strict functions')
    && f('sec-runtime-semantics-iteratorbindinginitialization').includes('the formal parameter bindings are preinitialized in order to deal with the possibility of multiple parameters with the same name')
    && hasAll(f('sec-parameter-lists-static-semantics-early-errors'), ['UniqueFormalParameters : FormalParameters It is a Syntax Error if the BoundNames of FormalParameters contains any duplicate elements', 'It is a Syntax Error if IsSimpleParameterList of FormalParameterList is false and the BoundNames of FormalParameterList contains any']),
  'lecture 7, 12: InstantiateFunctionObject; the notes of 8.6.2–8.6.3 about PutValue and repeated parameters; 15.1.1');
  check(f('sec-static-semantics-assignmenttargettype').includes('If the host is a web browser or otherwise supports Runtime Errors for Function Call Assignment Targets and IsStrict (this CallExpression) is false, then Return web-compat. Return invalid')
    && inOrder(assign, ['Let lRef be ? Evaluation of LeftHandSideExpression', 'If the AssignmentTargetType of LeftHandSideExpression is web-compat, throw a ReferenceError exception'])
    && f('sec-runtime-errors-for-function-call-assignment-targets').includes('B.3.9 Runtime Errors for Function Call Assignment Targets'),
  'lecture 13: web-compat only in non-strict browser code, otherwise invalid; the left side is evaluated before the ReferenceError; B.3.9');
  check(hasAll(f('sec-object-initializer-static-semantics-early-errors'), ['13.2.5.1 Static Semantics: Early Errors', 'contains any duplicate entries for "__proto__" and at least two of those entries were obtained from productions of the form PropertyDefinition : PropertyName : AssignmentExpression'])
    && f('sec-static-semantics-propname').includes('PropertyDefinition : IdentifierReference Return the StringValue of IdentifierReference') && f('sec-static-semantics-propname').includes('ComputedPropertyName : [ AssignmentExpression ] Return empty'),
  'lecture 14: 13.2.5.1 counts only "key: value" entries; PropName — a shorthand has its name, a computed key is empty');

  check(f('sec-block-static-semantics-early-errors').includes('IsStrict (this production) is false. The duplicate entries are only bound by FunctionDeclarations'),
    'student homework 1: the exception of 14.2.1 — non-strict code and only function declarations');
  const mdnName = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/reference/global_objects/function/name/index.md'], { encoding: 'utf8' });
  check(mdnName.includes('### JavaScript compressors and minifiers') && mdnName.includes("Such transformations often change a function's name at build time"),
    'student homework 4: MDN Function: name has the section about compressors that change names');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('advanced/day-01/lecture.html').includes('5.2.2') && read('advanced/day-02/lecture.html').includes('new Function'), 'lecture 1, 2: day 1 met 5.2.2, day 2 had parse with new Function');
  check(read('essentials/day-04/lecture.html').includes("Identifier 'sum' has already been declared") && read('essentials/day-04/lecture.html').includes('мёртв')
    && /подъём|поднима/.test(read('essentials/day-12/lecture.html')) && read('essentials/day-10/lecture.html').includes('<strong>метку</strong>'),
  'lecture 4, 7, 8: has already been declared and the dead zone — Essentials 4, hoisting — 12, labels — 10');
  check(read('intermediate/day-04/lecture.html').includes('greet.bind(null).name') && read('intermediate/day-02/lecture.html').includes('.bind(') && /замыкан/.test(read('intermediate/day-01/lecture.html'))
    && read('intermediate/day-07/lecture.html').includes('__proto__: base') && read('intermediate/day-30/lecture.html').includes("Identifier 'total' has already been declared"),
  'lecture 4, 10, 14: name and "bound" — course 2 day 4, bind — 2, closures — 1, __proto__ in a literal — 7, two scripts — 30');

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-08/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '8').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 33 && refRows.length === 33 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 8, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '8').map((c) => c[0]);
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 8`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
