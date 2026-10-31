// Course 3, day 12, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. Console output of scripts is rebuilt from Chrome's preview
// objects, as DevTools prints it (null as "null"); an uncaught error is printed as "Uncaught TypeError: …". A block
// that waits for a timer gets 700 ms before its page closes, a block with an async function or import() 400 ms.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-12.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-12.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the quoted lines of card.js (day 33 of course 2) are the
// real ones; the cheatsheet runs without an error; the experiments the lecture only tells about (the prototype of a
// class is read-only, class methods are not enumerable, gen() instanceof gen, early errors of names, of yield and await
// in parameters and of classes, a default {} and null, .catch() of an async function against an async generator); what
// the lecture says about the text of ECMA-262 2026 (chapter 15 and the operations it calls) is checked against
// tools/.cache/ecma262-2026.html; the MDN pages of the footer exist in tools/.cache/mdn-content.git and MDN says only
// Safari has tail calls; the days it points to say what it says; the reference table holds all 71 rows of the day's
// plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-12');
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
  '// card.js, день 33 курса 2 — конструктор Card': 'intermediate/day-33/lecture.html',
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
    const out = await runScript(ctx, `${ATTEMPT}${PARSE}function F() {}
class K {}
class M { m() {} get word() { return ""; } }
const flags = (o, key) => { const d = Object.getOwnPropertyDescriptor(o, key); return [d.writable, d.enumerable, d.configurable].map(Number).join(""); };
const before = K.prototype;
K.prototype = {};
console.log(flags(F, "prototype"), flags(K, "prototype"), flags(K.prototype, "constructor"), K.prototype === before, attempt(() => { "use strict"; K.prototype = {}; }));
console.log(Object.keys(M.prototype).length, Object.getOwnPropertyNames(M.prototype).join());
function* gen() {}
async function af() {}
async function* agen() {}
console.log(gen() instanceof gen, attempt(() => new gen()), "prototype" in af, typeof agen.prototype);
console.log(parse("'use strict'; function eval() {}"), "|", parse("function f() { super.x; }"));
console.log(parse("function* g(a = yield) {}"), "|", parse("async function a(b = await 1) {}"), "|", parse("async function* g(a = await 1) {}"));`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify([
      "100 000 101 true TypeError: Cannot assign to read only property 'prototype' of function 'class K {}'",
      '0 constructor,m,word',
      'true TypeError: gen is not a constructor false object',
      "SyntaxError: Unexpected eval or arguments in strict mode | SyntaxError: 'super' keyword unexpected here",
      'SyntaxError: Yield expression not allowed in formal parameter | SyntaxError: Illegal await-expression in formal parameters of async function | SyntaxError: Illegal await-expression in formal parameters of async function']),
    `lecture 5, 6, 9, 11: prototype of a function 100, of a class 000 (a strict write throws); class methods are not enumerable; gen() instanceof gen though new gen() throws; no prototype on an async function; eval as a strict name, super in a function, yield and await in parameters ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `${ATTEMPT}${PARSE}console.log(["class A { static prototype() {} }", "class A { constructor = 1; }", "class A { #x; #x; }", "class A { static { return; } }",
  "class A { static { arguments; } }", "class A { x = super(); }"].map(parse).join(" | "));
class CardsError extends Error { constructor(message) { super(message); this.name = "CardsError"; } }
class Card2 { constructor({ id, word, translation } = {}) { if (!Number.isInteger(id)) throw new CardsError(\`у карточки «\${word}» нет номера\`); } }
console.log(attempt(() => new Card2()), "|", attempt(() => new Card2(null)), "|", Card2.length);
const boom = () => { throw new Error("умолчание"); };
async function af(x = boom()) {}
async function* ag(x = boom()) {}
af().catch((e) => console.log("catch поймал:", e.message));
console.log(attempt(() => ag().next().catch(() => "не дойдёт")));`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify([
      "SyntaxError: Classes may not have a static property named 'prototype' | SyntaxError: Classes may not have a field named 'constructor' | SyntaxError: Identifier '#x' has already been declared | SyntaxError: Illegal return statement | SyntaxError: 'arguments' is not allowed in class field initializer or static initialization block | SyntaxError: 'super' keyword unexpected here",
      "CardsError: у карточки «undefined» нет номера | TypeError: Cannot destructure property 'id' of '(intermediate value)(intermediate value)(intermediate value)' as it is null. | 0",
      'Error: умолчание',
      'catch поймал: умолчание']),
    `lecture 5, 10, 17: more early errors of 15.7.1; a default {} saves from undefined only, length 0; .catch() catches the default of an async function, an async generator throws before it ${JSON.stringify(out)}`);
  }
  // notes, homework 1–2 and the table: length and a var copy of a parameter; the order of a class with extends and a
  // static block before a key; a generator's prototype has no own constructor
  {
    const out = await runScript(ctx, `function f(a, { b } = {}, ...c) {}
function two(a = () => x, x = 2) { var x = 3; return [a(), x].join(); }
const log = [];
const say = (text, v) => { log.push(text); return v; };
class A extends say("e", Object) { static { say("b"); } [say("k", "m")]() {} static s = say("s", 1); }
const before = log.join(" ");
new A();
function* gen() {}
console.log(f.length, "|", two(), "|", before, "|", log.join(" "), "|", Object.hasOwn(gen.prototype, "constructor"), gen.prototype.constructor === Object.getPrototypeOf(gen));`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(['1 | 2,3 | e k b s | e k b s | false true']),
      `student homework 1, 2 and the table: length 1 and the var copy 2,3; extends, key, block, static field, nothing on new; no own constructor on gen.prototype ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);

  check(f('sec-ecmascript-language-functions-and-classes').includes('Various ECMAScript language elements cause the creation of ECMAScript function objects (10.2)')
    && f('sec-ordinaryfunctioncreate').includes('OrdinaryFunctionCreate (functionPrototype, sourceText, ParameterList, Body, thisMode, env, privateEnv)')
    && f('sec-ordinaryfunctioncreate').includes('Let len be the ExpectedArgumentCount of ParameterList. Perform SetFunctionLength (F, len)'),
  'lecture 1, 2: the note of chapter 15; OrdinaryFunctionCreate takes seven arguments and makes length from ExpectedArgumentCount');
  {
    const makers = callers('MakeConstructor');
    const others = ['InstantiateArrowFunctionExpression', 'InstantiateAsyncArrowFunctionExpression', 'DefineMethod', 'MethodDefinitionEvaluation', 'InstantiateGeneratorFunctionObject',
      'InstantiateGeneratorFunctionExpression', 'InstantiateAsyncGeneratorFunctionObject', 'InstantiateAsyncGeneratorFunctionExpression', 'InstantiateAsyncFunctionObject', 'InstantiateAsyncFunctionExpression'];
    check(['InstantiateOrdinaryFunctionObject', 'InstantiateOrdinaryFunctionExpression', 'ClassDefinitionEvaluation'].every((c) => makers.includes(c)) && !others.some((c) => makers.includes(c)),
      `lecture 1: in chapter 15 only function and class call MakeConstructor ${JSON.stringify(makers)}`);
  }
  check(f('sec-static-semantics-expectedargumentcount').includes('A FormalParameter without an initializer is allowed after the first parameter with an initializer but such parameters are considered to be optional with undefined as their default value')
    && hasAll(f('sec-static-semantics-issimpleparameterlist'), ['BindingElement : BindingPattern Return false', 'SingleNameBinding : BindingIdentifier Initializer Return false', 'FormalParameters : FunctionRestParameter Return false'])
    && hasAll(f('sec-static-semantics-containsexpression'), ['SingleNameBinding : BindingIdentifier Return false', 'SingleNameBinding : BindingIdentifier Initializer Return true', 'BindingProperty : PropertyName : BindingElement Let has be IsComputedPropertyKey of PropertyName'])
    && f('sec-parameter-lists-static-semantics-early-errors').includes('It is a Syntax Error if IsSimpleParameterList of FormalParameterList is false and the BoundNames of FormalParameterList contains any duplicate elements')
    && f('sec-functiondeclarationinstantiation').includes('If strict is true or simpleParameterList is false, then Let ao be CreateUnmappedArgumentsObject (argumentsList)'),
  'lecture 2: the note of 15.1.5; a simple list is only names; code in a list is an initializer or a computed key; duplicates only in a simple list; a mapped arguments only for a simple list in non-strict code');
  const fdi = f('sec-functiondeclarationinstantiation');
  check(inOrder(fdi, ['Let hasParameterExpressions be ContainsExpression of formals', 'NOTE: Arrow functions never have an arguments object',
    'bindings created by direct eval calls in the formal parameter list are outside the environment where parameters are declared', 'Perform ! env. CreateMutableBinding (paramName, false)',
    'Perform ? IteratorBindingInitialization of formals with arguments iteratorRecord and usedEnv', 'If hasParameterExpressions is false, then NOTE: Only a single Environment Record is needed for the parameters and top-level vars',
    'closures created by expressions in the formal parameter list do not have visibility of declarations in the function body. Let varEnv be NewDeclarativeEnvironment (env)',
    'NOTE: A var with the same name as a formal parameter initially has the same value as the corresponding initialized parameter', 'If strict is true, then Let lexEnv be varEnv', 'Let lexEnv be NewDeclarativeEnvironment (varEnv)',
    'Perform ! varEnv. SetMutableBinding (fn, fo, false)'])
    && f('sec-runtime-semantics-evaluatefunctionbody').includes('Perform ? FunctionDeclarationInstantiation (functionObject, argumentsList). Perform ? Evaluation of FunctionStatementList'),
  'lecture 3: FunctionDeclarationInstantiation — parameters and arguments, an environment for eval in parameters, defaults now, one environment without code, else a new one for var with the parameter values, let/const below (strict — the same), functions in the var environment; EvaluateFunctionBody calls it first');
  check(inOrder(f('sec-runtime-semantics-evaluategeneratorbody'), ['Perform ? FunctionDeclarationInstantiation (functionObject, argumentsList)', 'Let G be ? OrdinaryCreateFromConstructor (functionObject, "%GeneratorPrototype%"'])
    && inOrder(f('sec-runtime-semantics-evaluateasyncgeneratorbody'), ['Perform ? FunctionDeclarationInstantiation (functionObject, argumentsList)', 'Let generator be ? OrdinaryCreateFromConstructor (functionObject, "%AsyncGeneratorPrototype%"'])
    && ['sec-runtime-semantics-evaluateasyncfunctionbody', 'sec-runtime-semantics-evaluateasyncconcisebody'].every((id) => inOrder(f(id), ['Let completion be Completion (FunctionDeclarationInstantiation (functionObject, argumentsList))',
      'If completion is an abrupt completion, then Perform ! Call (promiseCapability. [[Reject]], undefined, «completion. [[Value]]»)', 'Return ReturnCompletion (promiseCapability. [[Promise]])']))
    && f('sec-generator-function-definitions').includes('YieldExpression cannot be used within the FormalParameters of a generator function because any expressions that are part of FormalParameters are evaluated before the resulting Generator is in a resumable state')
    && f('sec-generator-function-definitions-static-semantics-early-errors').includes('It is a Syntax Error if FormalParameters Contains YieldExpression is true')
    && f('sec-async-function-definitions-static-semantics-early-errors').includes('It is a Syntax Error if FormalParameters Contains AwaitExpression is true'),
  'lecture 5: a generator and an async generator run FunctionDeclarationInstantiation with ? before the object; an async function and an async arrow reject the promise; note 2 of 15.5; yield and await in parameters');
  {
    const gfo = f('sec-runtime-semantics-instantiategeneratorfunctionobject');
    const afo = f('sec-runtime-semantics-instantiateasyncfunctionobject');
    check(hasAll(gfo, ['Let F be OrdinaryFunctionCreate (%GeneratorFunction.prototype%', 'Let prototype be OrdinaryObjectCreate (%GeneratorPrototype%)',
      'Perform ! DefinePropertyOrThrow (F, "prototype", PropertyDescriptor { [[Value]] : prototype, [[Writable]] : true, [[Enumerable]] : false, [[Configurable]] : false })']) && !gfo.includes('MakeConstructor')
      && afo.includes('Let F be OrdinaryFunctionCreate (%AsyncFunction.prototype%') && !afo.includes('"prototype"'),
    'lecture 1, 5: a generator gets its prototype property directly, without MakeConstructor; an async function gets none');
  }
  check(inOrder(f('sec-runtime-semantics-instantiateordinaryfunctionobject'), ['Let F be OrdinaryFunctionCreate (%Function.prototype%, sourceText, FormalParameters, FunctionBody, non-lexical-this, env, privateEnv)', 'Perform SetFunctionName (F, name)', 'Perform MakeConstructor (F)', 'Perform SetFunctionName (F, "default")'])
    && f('sec-function-definitions-runtime-semantics-evaluation').includes('FunctionDeclaration : function BindingIdentifier (FormalParameters) { FunctionBody } Return empty')
    && f('sec-runtime-semantics-evaluatefunctionbody').includes('Return ReturnCompletion (undefined)')
    && hasAll(f('sec-makeconstructor'), ['If writablePrototype is not present, set writablePrototype to true', 'Perform ! DefinePropertyOrThrow (prototype, "constructor", PropertyDescriptor { [[Value]] : F, [[Writable]] : writablePrototype, [[Enumerable]] : false, [[Configurable]] : true })',
      'Perform ! DefinePropertyOrThrow (F, "prototype", PropertyDescriptor { [[Value]] : prototype, [[Writable]] : writablePrototype, [[Enumerable]] : false, [[Configurable]] : false })'])
    && ['FunctionDeclarationInstantiation', 'BlockDeclarationInstantiation', 'GlobalDeclarationInstantiation'].every((c) => callers('InstantiateFunctionObject').includes(c)),
  `lecture 6: InstantiateOrdinaryFunctionObject — OrdinaryFunctionCreate, SetFunctionName ("default" without a name), MakeConstructor; a declaration evaluates to empty; the end of a body returns undefined; the flags of prototype and constructor; declarations are made on entry ${JSON.stringify(callers('InstantiateFunctionObject'))}`);
  check(hasAll(f('sec-function-definitions-static-semantics-early-errors'), ['it is a Syntax Error if the StringValue of BindingIdentifier is either "eval" or "arguments"',
    'It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true and IsSimpleParameterList of FormalParameters is false', 'It is a Syntax Error if any element of the BoundNames of FormalParameters also occurs in the LexicallyDeclaredNames of FunctionBody',
    'It is a Syntax Error if FunctionBody Contains SuperProperty is true', 'The LexicallyDeclaredNames of a FunctionBody does not include identifiers bound using var or function declarations'])
    && f('sec-static-semantics-functionbodycontainsusestrict').includes('If the Directive Prologue of FunctionBody contains a Use Strict Directive, return true'),
  'lecture 6: 15.2.1 — eval and arguments in strict code, "use strict" with a non-simple list, a parameter in let of the body (var is fine), super; 15.2.2');
  check(inOrder(f('sec-runtime-semantics-instantiateordinaryfunctionexpression'), ['Let funcEnv be NewDeclarativeEnvironment (outerEnv)', 'Perform ! funcEnv. CreateImmutableBinding (name, false)', 'Perform ! funcEnv. InitializeBinding (name, closure)',
    'The BindingIdentifier in a FunctionExpression can be referenced from inside the FunctionExpression \'s FunctionBody to allow the function to call itself recursively', 'cannot be referenced from and does not affect the scope enclosing the FunctionExpression'])
    && inOrder(f('sec-declarative-environment-records-setmutablebinding-n-v-s'), ['If the binding for N in envRec is a strict binding, set S to true', 'If S is true, throw a TypeError exception']),
  'lecture 7: a named function expression — funcEnv with an immutable binding, strict false; seen inside, not outside; a write throws only in strict code');
  check(hasAll(f('sec-arrow-function-definitions'), ['ArrowParameters [?Yield, ?Await] [no LineTerminator here] => ConciseBody', '[lookahead ≠ { ] ExpressionBody', 'ArrowFormalParameters [Yield, Await] : (UniqueFormalParameters [?Yield, ?Await])'])
    && f('sec-parameter-lists-static-semantics-early-errors').includes('UniqueFormalParameters : FormalParameters It is a Syntax Error if the BoundNames of FormalParameters contains any duplicate elements')
    && f('sec-runtime-semantics-instantiatearrowfunctionexpression').includes('OrdinaryFunctionCreate (%Function.prototype%, sourceText, ArrowParameters, ConciseBody, lexical-this, env, privateEnv)')
    && !f('sec-runtime-semantics-instantiatearrowfunctionexpression').includes('MakeConstructor')
    && f('sec-runtime-semantics-instantiatearrowfunctionexpression').includes('An ArrowFunction does not define local bindings for arguments, super, this, or new.target')
    && f('sec-ordinarycallbindthis').includes('If thisMode is lexical, return unused')
    && f('sec-runtime-semantics-evaluateconcisebody').includes('ConciseBody : ExpressionBody Perform ? FunctionDeclarationInstantiation (functionObject, argumentsList). Return ? Evaluation of ExpressionBody')
    && f('sec-arrow-function-definitions-runtime-semantics-evaluation').includes('Let exprValue be ? GetValue (exprRef). Return ReturnCompletion (exprValue)'),
  'lecture 8: no line break before =>, a body cannot start with {, unique parameters; lexical-this and no MakeConstructor; no own arguments, super, this, new.target; OrdinaryCallBindThis returns for lexical; a concise body returns its value');
  check(f('sec-runtime-semantics-definemethod').includes('Perform MakeMethod (closure, object)') && !f('sec-runtime-semantics-definemethod').includes('MakeConstructor')
    && f('sec-runtime-semantics-methoddefinitionevaluation').includes('Perform SetFunctionName (closure, propKey, "get")')
    && f('sec-runtime-semantics-propertydefinitionevaluation').includes('MethodDefinitionEvaluation of MethodDefinition with arguments object and true')
    && f('sec-static-semantics-classelementevaluation').includes('Return ? MethodDefinitionEvaluation of MethodDefinition with arguments object and false')
    && f('sec-object-initializer-static-semantics-early-errors').includes('PropertyDefinition : MethodDefinition It is a Syntax Error if HasDirectSuper of MethodDefinition is true')
    && hasAll(f('sec-class-definitions-static-semantics-early-errors'), ['It is a Syntax Error if the PropName of MethodDefinition is not "constructor" and HasDirectSuper of MethodDefinition is true', 'It is a Syntax Error if the PropName of MethodDefinition is "constructor" and SpecialMethod of MethodDefinition is true'])
    && f('sec-static-semantics-specialmethod').includes('MethodDefinition : GeneratorMethod AsyncMethod AsyncGeneratorMethod get ClassElementName () { FunctionBody } set ClassElementName (PropertySetParameterList) { FunctionBody } Return true'),
  'lecture 9: DefineMethod — MakeMethod, no MakeConstructor; a getter is named "get …"; a literal passes enumerable true, a class false; super() in a literal method (13.2.5); super() only in a constructor; SpecialMethod');
  check(hasAll(f('sec-class-definitions'), ['A class definition is always strict mode code', 'ClassStaticBlockStatementList : StatementList [~Yield, +Await, ~Return] opt'])
    && hasAll(f('sec-class-definitions-static-semantics-early-errors'), ['It is a Syntax Error if ClassHeritage is not present and the following algorithm returns true',
      'It is a Syntax Error if the PrototypePropertyNameList of ClassElementList contains more than one occurrence of "constructor"', 'unless the name is used once for a getter and once for a setter and in no other entries',
      'It is a Syntax Error if the StringValue of PrivateIdentifier is "#constructor"', 'It is a Syntax Error if Initializer is present and ContainsArguments of Initializer is true', 'It is a Syntax Error if ClassStaticBlockStatementList Contains await is true'])
    && f('sec-static-semantics-allprivateidentifiersvalid').includes('MemberExpression : MemberExpression. PrivateIdentifier If names contains the StringValue of PrivateIdentifier'),
  'lecture 10: a class is strict code; a static block is [+Await, ~Return]; 15.7.1 — super() without extends, one constructor, a getter-setter pair, #constructor, arguments in a field, await in a block; #name only in its class');
  const cde = f('sec-runtime-semantics-classdefinitionevaluation');
  check(inOrder(cde, ['Let classEnv be NewDeclarativeEnvironment (env)', 'Perform ! classEnv. CreateImmutableBinding (classBinding, true)', 'Let classPrivateEnvironment be NewPrivateEnvironment (outerPrivateEnvironment)',
    'Let superclassRef be Completion (Evaluation of ClassHeritage)', 'Else if IsConstructor (superclass) is false, then Throw a TypeError exception', 'If protoParent is not an Object and protoParent is not null, throw a TypeError exception',
    'Let proto be OrdinaryObjectCreate (protoParent)', 'Let F be CreateBuiltinFunction (defaultConstructor, 0, className', 'Perform MakeClassConstructor (F)', 'Perform MakeConstructor (F, false, proto)',
    'Perform ! DefineMethodProperty (proto, "constructor", F, false)', 'Let element be Completion (ClassElementEvaluation of e with argument proto)', 'Let element be Completion (ClassElementEvaluation of e with argument F)',
    'Perform ! classEnv. InitializeBinding (classBinding, F)', 'Set F. [[Fields]] to instanceFields', 'Perform ! PrivateMethodOrAccessorAdd (F, method)', 'For each element elementRecord of staticElements',
    'Let result be Completion (Call (elementRecord. [[BodyFunction]], F))'])
    && cde.includes('If superclass is null, then Let protoParent be null. Let constructorParent be %Function.prototype%'),
  'lecture 11–13: ClassDefinitionEvaluation — classEnv and the name without a value, private names, extends and its two TypeErrors, proto, F (default 0 and the name, class constructor, read-only prototype), constructor, elements in order, the name, static elements; extends null');
  check(hasAll(cde, ['If NewTarget is undefined, throw a TypeError exception', 'If IsConstructor (func) is false, throw a TypeError exception', 'Let result be ? Construct (func, args, NewTarget)',
    'Let result be ? OrdinaryCreateFromConstructor (NewTarget, "%Object.prototype%")', 'Perform ? InitializeInstanceElements (result, F)', 'observably calls the %Symbol.iterator% method on %Array.prototype%, this function does not'])
    && f('sec-runtime-semantics-bindingclassdeclarationevaluation').includes('Perform ? InitializeBoundName (className, value, env)')
    && f('sec-class-definitions-runtime-semantics-evaluation').includes('ClassExpression : class BindingIdentifier ClassTail Let className be the StringValue of BindingIdentifier'),
  'lecture 13, 14: the default constructor — new only, Construct of the parent with NewTarget, or an object; fields; the note about the array iterator; the outer binding of a declaration; a named class expression');
  check(hasAll(f('sec-runtime-semantics-classfielddefinitionevaluation'), ['Let name be ? Evaluation of ClassElementName', 'Perform MakeMethod (initializer, homeObject)', 'The function created for initializer is never directly accessible to ECMAScript code'])
    && f('sec-runtime-semantics-classstaticblockdefinitionevaluation').includes('Perform MakeMethod (bodyFunction, homeObject)')
    && f('sec-runtime-semantics-evaluateclassstaticblockbody').includes('Perform ! FunctionDeclarationInstantiation (functionObject, «»)'),
  'lecture 15: a field — the key now, the value a hidden method; a static block — a hidden method; its body runs FunctionDeclarationInstantiation');
  const tail = f('sec-static-semantics-hascallintailposition');
  check(hasAll(f('sec-isintailposition'), ['If IsStrict (call) is false, return false', 'If body is the FunctionBody of a GeneratorBody, return false', 'If body is the FunctionBody of an AsyncFunctionBody, return false',
    'If body is the FunctionBody of an AsyncGeneratorBody, return false', 'If body is an AsyncConciseBody, return false'])
    && hasAll(tail, ['ConditionalExpression : ShortCircuitExpression ? AssignmentExpression : AssignmentExpression Let has be HasCallInTailPosition of the first AssignmentExpression',
      'LogicalANDExpression : LogicalANDExpression && BitwiseORExpression Return HasCallInTailPosition of BitwiseORExpression', 'CoalesceExpression : CoalesceExpressionHead ?? BitwiseORExpression Return HasCallInTailPosition of BitwiseORExpression',
      'Expression : AssignmentExpression Expression, AssignmentExpression Return HasCallInTailPosition of AssignmentExpression with argument call',
      'TryStatement : try Block Catch Return HasCallInTailPosition of Catch with argument call', 'TryStatement : try Block Finally try Block Catch Finally Return HasCallInTailPosition of Finally with argument call',
      'ForInOfStatement : for (LeftHandSideExpression of AssignmentExpression) Statement for (var ForBinding of AssignmentExpression) Statement for (ForDeclaration of AssignmentExpression) Statement CaseBlock : { } Return false',
      'CallExpression : CoverCallExpressionAndAsyncArrowHead CallExpression Arguments CallExpression TemplateLiteral If this CallExpression is call, return true'])
    && inOrder(tail, ['AdditiveExpression : AdditiveExpression + MultiplicativeExpression', 'AwaitExpression CallExpression : SuperCall', 'TemplateLiteral Return false'])
    && f('sec-preparefortailcall').includes('Discard all resources associated with the current execution context'),
  'lecture 16: IsInTailPosition — strict code, not a generator or async; HasCallInTailPosition — both branches of ?:, the right of && ?? and the comma, catch without finally, only finally, not for-of, not + or await; PrepareForTailCall');
  {
    const asked = callers('IsInTailPosition');
    const prepare = callers('PrepareForTailCall');
    check(asked.includes('ChainEvaluation') && asked.some((c) => c.includes('function-calls')) && asked.some((c) => c.includes('tagged-templates'))
      && f('sec-evaluatecall').includes('If tailPosition is true, perform PrepareForTailCall ()')
      && ['EvaluateCall', 'sec-function.prototype.call', 'sec-function.prototype.apply'].every((c) => prepare.includes(c)),
    `lecture 16: a call, an optional chain and a tagged template ask IsInTailPosition; EvaluateCall, call and apply do PrepareForTailCall ${JSON.stringify(asked)} ${JSON.stringify(prepare)}`);
  }

  // the MDN pages of the footer; what the lecture says about MDN
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  check(['reference/functions', 'reference/functions/default_parameters', 'reference/functions/arrow_functions', 'reference/classes', 'reference/classes/static_initialization_blocks'].every((p) => mdn(p).startsWith('---\ntitle:')),
    'footer: the MDN pages Functions, Default parameters, Arrow function expressions, Classes, Static initialization blocks are in the cache');
  check(mdn('reference/execution_model').includes('Currently, only Safari (JavaScriptCore) implements PTC'), 'lecture 16: MDN — only Safari has tail calls');
  {
    const classes = mdn('reference/classes');
    const order = classes.slice(classes.indexOf('### Evaluation order'), classes.indexOf('## Examples'));
    check([1, 2, 3, 4, 5, 6, 7].every((n) => order.includes(`\n${n}. `)) && !order.includes('\n8. ')
      && order.includes('However, because the `constructor` definition is only a method definition, this step is not observable')
      && order.includes('Private instance methods and accessors are saved to be installed on the instance directly later. This step is not observable'),
    'student homework 4: MDN Classes, Evaluation order — seven points, the 2nd and the 4th "not observable"');
  }
  check(hasAll(tail, ['Statement : VariableStatement EmptyStatement ExpressionStatement', 'ReturnStatement : return Expression ; Return HasCallInTailPosition of Expression with argument call'])
    && /> 15\.10\.2 Static Semantics: HasCallInTailPosition/.test(f('sec-static-semantics-hascallintailposition'))
    && /> 15\.7\.14 Runtime Semantics: ClassDefinitionEvaluation/.test(f('sec-runtime-semantics-classdefinitionevaluation')),
  'student homework 3: an expression statement such as cleanup() is never a tail call, return passes the check to its expression; 15.10.2 and 15.7.14 are where the notes say');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('advanced/day-09/lecture.html').includes('OrdinaryCallBindThis') && read('advanced/day-09/lecture.html').includes('ResolveThisBinding') && read('advanced/day-09/lecture.html').includes('хвостовые вызовы')
    && hasAll(read('advanced/day-08/lecture.html'), ['NamedEvaluation', 'IteratorBindingInitialization', 'SetFunctionName', 'Duplicate parameter name not allowed in this context'])
    && read('advanced/day-08/tasks.html').includes('9. Незнакомые разделы: простой список параметров') && read('advanced/day-08/tasks.html').includes('function f(a = () =&gt; x) { var x = "внутренний"; return a(); }')
    && read('advanced/day-07/lecture.html').includes('InitializeInstanceElements')
    && hasAll(read('advanced/day-11/lecture.html'), ['BlockDeclarationInstantiation', 'Assignment to constant variable', 'не трогает привязку']),
  'lecture: course 3 — OrdinaryCallBindThis, ResolveThisBinding and tail calls (day 9); names, IteratorBindingInitialization, duplicate parameters and task 9 (8); InitializeInstanceElements (7); blocks, const and var x; (11)');
  check(read('intermediate/day-01/lecture.html').includes('замыкан') && read('intermediate/day-03/lecture.html').includes('non-simple parameter list')
    && hasAll(read('intermediate/day-04/lecture.html'), ['length: сколько параметров ждёт', 'arguments в двух режимах', 'toString: исходный текст'])
    && read('intermediate/day-08/lecture.html').includes('Как класс создаётся') && read('intermediate/day-10/lecture.html').includes('Откуда super знает родителя')
    && read('intermediate/day-12/lecture.html').includes('yield*') && read('intermediate/day-28/lecture.html').includes('async-функции изнутри')
    && read('intermediate/day-29/lecture.html').includes('async function*') && read('intermediate/day-33/lecture.html').includes('throw new CardsError(`Не удалось загрузить колоду «${info.name}»`, { cause });'),
  'lecture: course 2 — closures (day 1), "use strict" and a non-simple list (3), length, arguments, toString (4), how a class is made (8), super (10), yield* (12), async (28, 29), loadDeck wraps the cause (33)');
  const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
  const dayOf = (id) => { const r = spRows.find((c) => c[0] === id); return r ? `${r[6]}.${r[7]}` : '?'; };
  const days = { 'sec-ecmascript-function-objects': '3.14', 'sec-functiondeclarationinstantiation': '3.14', 'sec-globaldeclarationinstantiation': '3.13', 'sec-eval-x': '3.13' };
  const wrong = Object.entries(days).filter(([id, d]) => dayOf(id) !== d).map(([id]) => `${id}=${dayOf(id)}`);
  check(wrong.length === 0, `lecture: the days of the plan it names — function objects and FunctionDeclarationInstantiation 14, GlobalDeclarationInstantiation and eval 13 ${wrong.join(', ')}`);

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-12/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = spRows.filter((c) => c[6] === '3' && c[7] === '12').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 71 && refRows.length === 71 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 12, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const full = spRows.filter((c) => c[6] === '3' && c[7] === '12' && c[9] === 'подробно').map((c) => c[0]);
  const marked = [...refTable.matchAll(/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
  check(full.length === 7 && JSON.stringify(full) === JSON.stringify(marked), `plan: the 7 rows "подробно" are marked so in the table ${JSON.stringify(marked)}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine).filter((c) => c[5] === '3' && c[6] === '12');
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 12`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
