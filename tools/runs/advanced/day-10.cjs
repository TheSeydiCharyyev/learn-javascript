// Course 3, day 10, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. Console output of scripts is rebuilt from Chrome's preview
// objects, as DevTools prints it (null as "null"); an uncaught error is printed as "Uncaught TypeError: …". A block
// that waits for a timer gets 700 ms before its page closes, a block with import() 400 ms.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-10.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-10.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; in the notes the output equals the comments of the lines
// that print it; the quoted lines of main.js (day 34 of course 2) are the real ones; the cheatsheet runs without an
// error; the homework of the notes; the examples of the tasks run with reference solutions, the predictions of the
// tasks and what their criteria ask to find; the experiments the lecture only tells about (f()++ and f() += 1 at
// run time, this inside with, super.m(), a private field under delete, the attributes of
// Function.prototype[Symbol.hasInstance], the iterator a destructuring assignment closes); what the lecture says about
// the text of ECMA-262 2026 (chapter 13 and the operations it calls) is checked against tools/.cache/ecma262-2026.html;
// the MDN pages of the footer exist in tools/.cache/mdn-content.git; the days it points to say what it says; the
// reference table holds all 64 rows of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-10');
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
  'tasks #0': ['abc=-4 abc=512', 'okab=3 a=undefined', 'abc=да a=0'],
  'tasks #1': ['true false true false false', "TypeError: Cannot delete property 'fixed' of #<Object> | true",
    'SyntaxError: Delete of an unqualified identifier in strict mode. | ok | ok'],
  'tasks #2': ['undefined object undefined undefined', 'undefined | ReferenceError: notDeclared is not defined | ReferenceError: notDeclared is not defined',
    "ReferenceError: Cannot access 'soon' before initialization string function object"],
  'tasks #3': ['true 1,2'],
  'tasks #9': ['1 {"b":2} ключ, чтение a, чтение b'],
};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const TO_PRIMITIVE = `const toPrimitive = (x) => {
  if (x === null || (typeof x !== "object" && typeof x !== "function")) return x;
  const exotic = x[Symbol.toPrimitive];
  if (exotic !== undefined) return exotic.call(x, "default");
  for (const name of ["valueOf", "toString"]) {
    const result = typeof x[name] === "function" ? x[name]() : x;
    if (result === null || (typeof result !== "object" && typeof result !== "function")) return result;
  }
  throw new TypeError("Cannot convert object to primitive value");
};`;
const SOLUTIONS = {
  add: `${TO_PRIMITIVE}
function add(a, b) {
  const l = toPrimitive(a);
  const r = toPrimitive(b);
  if (typeof l === "string" || typeof r === "string") return \`\${l}\${r}\`;
  const ln = typeof l === "bigint" ? l : Number(l);
  const rn = typeof r === "bigint" ? r : Number(r);
  if (typeof ln !== typeof rn) throw new TypeError("Cannot mix BigInt and other types, use explicit conversions");
  return ln + rn;
}`,
  instanceOf: `function ordinaryHasInstance(C, O) {
  if (typeof C !== "function") return false;
  if (O === null || (typeof O !== "object" && typeof O !== "function")) return false;
  const P = C.prototype;
  if (P === null || (typeof P !== "object" && typeof P !== "function")) throw new TypeError("Function has non-object prototype in instanceof check");
  for (let proto = Object.getPrototypeOf(O); proto !== null; proto = Object.getPrototypeOf(proto)) {
    if (proto === P) return true;
  }
  return false;
}
function instanceOf(v, target) {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) throw new TypeError("Right-hand side of 'instanceof' is not an object");
  const handler = target[Symbol.hasInstance];
  if (handler !== undefined && handler !== null) {
    if (typeof handler !== "function") throw new TypeError("Symbol.hasInstance is not a function");
    return Boolean(handler.call(target, v));
  }
  if (typeof target !== "function") throw new TypeError("Right-hand side of 'instanceof' is not callable");
  return ordinaryHasInstance(target, v);
}`,
  chain: `function chain(base, links) {
  if (base === null || base === undefined) return undefined;
  let value = base;
  let thisValue;
  for (const [kind, arg] of links) {
    if (kind === "get") {
      if (value === null || value === undefined) throw new TypeError("Cannot read properties of " + value);
      thisValue = value;
      value = value[arg];
    } else {
      if (typeof value !== "function") throw new TypeError("is not a function");
      value = value.apply(thisValue, arg);
      thisValue = undefined;
    }
  }
  return value;
}`,
  currentWord: `function currentWord(opened, chosen, position) {
  const card = opened.get(chosen)?.cardAt(position);
  if (card === undefined) return "колода не загружена";
  return card?.word ?? "на сегодня всё";
}`,
  compoundAdd: `function ref(base, name) {
  return { base, name };
}
function toKey(r) {
  if (typeof r.name !== "string" && typeof r.name !== "symbol") r.name = String(r.name);
  return r.name;
}
function getValue(r) {
  if (r.base === null || r.base === undefined) throw new TypeError("Cannot read properties of " + r.base);
  return r.base[toKey(r)];
}
function putValue(r, value) {
  if (r.base === null || r.base === undefined) throw new TypeError("Cannot set properties of " + r.base);
  r.base[toKey(r)] = value;
}
function compoundAdd(r, rhs) {
  const left = getValue(r);
  const right = rhs();
  putValue(r, left + right);
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
  '// main.js, день 34 курса 2 — текущая карточка': 'intermediate/day-34/lecture.html',
};
const ATTEMPT = 'const attempt = (f) => { try { return String(f()); } catch (e) { return `${e.name}: ${e.message}`; } };\n';
const PARSE = 'const parse = (code) => { try { new Function(code); return "ok"; } catch (e) { return `${e.name}: ${e.message}`; } };\n';
const wait = (code) => (code.includes('setTimeout') ? 700 : code.includes('import(') ? 400 : 100);

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
    const out = await runScript(ctx, `${ATTEMPT}const log = [];
const f = () => { log.push("f"); return {}; };
console.log(attempt(() => { f()++; }), "|", attempt(() => { f() += 1; }), "|", log.join(" "));
const box = { tag: "объект", who() { return this === box ? this.tag : "не box"; } };
with (box) { console.log(who()); }
class A { who() { return this.name; } }
class B extends A { name = "B"; who() { return "B→" + super.who(); } }
console.log(new B().who());`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(['ReferenceError: Invalid left-hand side expression in postfix operation | ReferenceError: Invalid left-hand side in assignment | f f', 'объект', 'B→B']),
      `lecture 4, 7, 14, 17: f()++ and f() += 1 call f, then ReferenceError; inside with a name call takes this from WithBaseObject; super.m() finds the method above and keeps our this ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `${PARSE}console.log(parse("class A { #p; m() { delete this.#p; } }"), "|", parse("f() ||= 1"), "|", parse("a?.\\n\`x\`"));
const d = Object.getOwnPropertyDescriptor(Function.prototype, Symbol.hasInstance);
console.log(d.writable, d.enumerable, d.configurable, Function.prototype[Symbol.hasInstance].name);
const steps = [];
const iterable = { [Symbol.iterator]() { let i = 0; return { next() { steps.push("next"); return { value: i++, done: false }; }, return() { steps.push("return"); return {}; } }; } };
let p, r;
[p] = iterable;
console.log(p, steps.join(" "), NaN <= 1);`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify(["SyntaxError: Private fields can not be deleted | SyntaxError: Invalid left-hand side in assignment | SyntaxError: Invalid tagged template on optional chain",
      'false false false [Symbol.hasInstance]', '0 next return false']),
    `lecture 6, 8, 11, 12, 14: a private field cannot be deleted; f() ||= 1 is an early error; ?. with a template on the next line too; Function.prototype[Symbol.hasInstance] is locked; a destructuring assignment closes the iterator; NaN <= 1 is false ${JSON.stringify(out)}`);
  }
  // notes, homework 1–3: the log of two assignments, where a?.b.c() breaks, the order of an array pattern
  {
    const out = await runScript(ctx, `${ATTEMPT}const log = [];
const v = (name, value) => { log.push(name); return value; };
const obj = { x: 0 };
v("o", obj)[v("k", "x")] = v("r", 1) + v("s", 2);
const first = log.join(" ");
log.length = 0;
v("o", obj)[v("k", "x")] ||= v("r", 1);
console.log(first, "|", log.join(" "), obj.x);
const call = (a) => attempt(() => a?.b.c());
const a3 = { b: { c() { return this === a3.b; } } };
console.log(call(null), "|", call({}), "|", call(a3));
const steps = [];
const target = { set x(val) { steps.push("запись x=" + val); } };
const t = () => { steps.push("цель"); return target; };
const iterable = { [Symbol.iterator]() { let i = 0; return { next() { steps.push("next"); return { value: ++i, done: false }; }, return() { steps.push("return"); return {}; } }; } };
[t().x] = iterable;
console.log(steps.join(", "));`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(['o k r s | o k 3', "undefined | TypeError: Cannot read properties of undefined (reading 'c') | true", 'цель, next, запись x=1, return']),
      `student homework 1–3: = evaluates all four, ||= stops after the key; a?.b.c() — undefined, TypeError, true; an array pattern takes the target before next and closes the iterator ${JSON.stringify(out)}`);
  }
  // tasks 4–8: what the criteria ask to find, with the reference solutions
  {
    const out = await runScript(ctx, `${SOLUTIONS.add}
${SOLUTIONS.instanceOf}
const pairs = [[1, 2], ["1", 2], [[1], [2]], [null, true], [undefined, 1], [1n, 2n], ["1", 1n], [{}, []], [new Date(0), 1], [true, "x"]];
console.log(pairs.every(([a, b]) => String(add(a, b)) === String(a + b)), String(add("1", 1n)));
const calls = [];
const original = ordinaryHasInstance;
ordinaryHasInstance = (C, O) => { calls.push(C.name); return original(C, O); };
function F() {}
const G = function G() {};
const g = new G();
Object.setPrototypeOf(G, null);
console.log(instanceOf(new F(), F), instanceOf(g, G), calls.join() || "никто");`, 'tasks-criteria-1.html');
    check(JSON.stringify(out) === JSON.stringify(['true 11', 'true true G']),
      `tasks 4, 5: add agrees with + on ten pairs ("1" + 1n too); ordinaryHasInstance runs only for G without a prototype — F answers through Function.prototype[Symbol.hasInstance] ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `${ATTEMPT}${SOLUTIONS.chain}
${SOLUTIONS.currentWord}
const obj = { n: 5, m() { return this.n; } };
const pairs = [[() => chain(null, [["get", "a"], ["get", "b"]]), () => null?.a.b], [() => chain({ a: { b: 2 } }, [["get", "a"], ["get", "b"]]), () => ({ a: { b: 2 } })?.a.b],
  [() => chain({ a: null }, [["get", "a"], ["get", "b"]]), () => ({ a: null })?.a.b], [() => chain(obj, [["get", "m"], ["call", []]]), () => obj?.m()],
  [() => chain({}, [["get", "nope"], ["call", []]]), () => ({})?.nope()]];
const kind = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log(pairs.every(([mine, real]) => kind(mine) === kind(real)));
let asked = 0;
const opened = new Map([["home", { cardAt: (p) => { asked++; return p < 2 ? { word: "window" } : null; } }]]);
const merged = (chosen, p) => opened.get(chosen)?.cardAt(p) ?? null;
console.log(currentWord(opened, "food", 0), asked, merged("food", 0), merged("home", 5));
let conversions = 0;
const key = { toString() { conversions++; return "k"; } };
const o = { k: 1 };
o[key] += 1;
console.log(o.k, conversions);`, 'tasks-criteria-2.html');
    check(JSON.stringify(out) === JSON.stringify(['true', 'колода не загружена 0 null null', '2 2']),
      `tasks 6–8: chain agrees with the language on the five lines; no cardAt without a deck, ?? null merges both cases; o[key] += 1 converts the key twice in Chrome ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));

  const chapter = [['sec-identifiers', '13.1'], ['sec-primary-expression', '13.2'], ['sec-left-hand-side-expressions', '13.3'], ['sec-update-expressions', '13.4'], ['sec-unary-operators', '13.5'],
    ['sec-exp-operator', '13.6'], ['sec-multiplicative-operators', '13.7'], ['sec-additive-operators', '13.8'], ['sec-bitwise-shift-operators', '13.9'], ['sec-relational-operators', '13.10'],
    ['sec-equality-operators', '13.11'], ['sec-binary-bitwise-operators', '13.12'], ['sec-binary-logical-operators', '13.13'], ['sec-conditional-operator', '13.14'], ['sec-assignment-operators', '13.15'],
    ['sec-comma-operator', '13.16']];
  const captions = [...spec.matchAll(/<emu-table[^>]*caption="([^"]*)"/g)].map((m) => m[1]);
  check(chapter.every(([id, n]) => new RegExp(`> ${n.replace('.', '\\.')} `).test(f(id))) && f('sec-additive-operators').includes('AdditiveExpression [?Yield, ?Await] + MultiplicativeExpression [?Yield, ?Await]')
    && !captions.some((c) => /precedence/i.test(c)),
  `lecture 1: chapter 13 goes from identifiers to the comma; addition is built of multiplications; no table of precedence among ${captions.length} tables`);
  check(inOrder(f('sec-evaluatestringornumericbinaryexpression'), ['Let lRef be ? Evaluation of leftOperand', 'Let lVal be ? GetValue (lRef)', 'Let rRef be ? Evaluation of rightOperand', 'Let rVal be ? GetValue (rRef)', 'Return ? ApplyStringOrNumericBinaryOperator (lVal, opText, rVal)'])
    && f('sec-addition-operator-plus-runtime-semantics-evaluation').includes('Return ? EvaluateStringOrNumericBinaryExpression (AdditiveExpression, +, MultiplicativeExpression)'),
  'lecture 2, 10: 13.15.4 — left operand, GetValue, right, GetValue, the operation; addition goes there');
  const assign = f('sec-assignment-operators-runtime-semantics-evaluation');
  check(inOrder(assign, ['Let lRef be ? Evaluation of LeftHandSideExpression', 'Let rRef be ? Evaluation of AssignmentExpression', 'Perform ? PutValue (lRef, rVal). Return rVal',
    'AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression Let lRef be ? Evaluation of LeftHandSideExpression', 'Let lVal be ? GetValue (lRef). Let rRef be ? Evaluation of AssignmentExpression',
    'Let r be ? ApplyStringOrNumericBinaryOperator (lVal, opText, rVal). Perform ? PutValue (lRef, r)', 'If ToBoolean (lVal) is false, return lVal', 'If ToBoolean (lVal) is true, return lVal', 'If lVal is neither undefined nor null, return lVal'])
    && hasAll(assign, ['it is a runtime error if lRef in step 1.e, 3, 2, 2, 2 is an unresolvable reference. If it is, a ReferenceError exception is thrown',
      'to an accessor property with the attribute value { [[Set]] : undefined }, or to a non-existent property of an object for which the IsExtensible predicate returns the value false. In these cases a TypeError exception is thrown']),
  'lecture 2, 14: 13.15.2 — the reference first; += reads before the right side; &&=, ||=, ??= return early without a write; the note about strict code');
  check(f('sec-property-accessors').includes('MemberExpression. IdentifierName is identical in its behaviour to MemberExpression [ < identifier-name-string > ]')
    && f('sec-evaluate-property-access-with-expression-key').includes('NOTE: In most cases, ToPropertyKey will be performed on propertyNameValue immediately after this step. However, in the case of a[b] = c, it will not be performed until after evaluation of c')
    && f('sec-evaluate-property-access-with-identifier-key').includes('Let propertyNameString be the StringValue of identifierName')
    && inOrder(f('sec-property-accessors-runtime-semantics-evaluation'), ['Let baseReference be ? Evaluation of MemberExpression', 'Let baseValue be ? GetValue (baseReference)', 'Return ? EvaluatePropertyAccessWithExpressionKey (baseValue, Expression, strict)']),
  'lecture 3: dot = brackets; the object, GetValue, then the key; the key goes into the reference as it is — a[b] = c converts it after c');
  const getValue = f('sec-getvalue'), putValue = f('sec-putvalue');
  check(inOrder(getValue, ['If IsUnresolvableReference (V) is true, throw a ReferenceError exception', 'Let baseObj be ? ToObject (V. [[Base]])', 'If V. [[ReferencedName]] is not a property key, then Set V. [[ReferencedName]] to ? ToPropertyKey (V. [[ReferencedName]])'])
    && putValue.includes('If V. [[ReferencedName]] is not a property key, then Set V. [[ReferencedName]] to ? ToPropertyKey (V. [[ReferencedName]])')
    && assign.includes('Let lVal be ? GetValue (lRef)') && assign.includes('Perform ? PutValue (lRef, r)'),
  'lecture 3, 14: GetValue throws on a null base (ToObject) and writes the ready key into the same reference; PutValue converts only a key that is not ready; += passes one lRef to both — so toString once');
  check(inOrder(f('sec-evaluatecall'), ['If IsPropertyReference (ref) is true, then Let thisValue be GetThisValue (ref)', 'Let thisValue be refEnv. WithBaseObject ()', 'Else, Let thisValue be undefined',
    'Let argList be ? ArgumentListEvaluation of arguments', 'If func is not an Object, throw a TypeError exception', 'If IsCallable (func) is false, throw a TypeError exception',
    'If tailPosition is true, perform PrepareForTailCall ()', 'Return ? Call (func, thisValue, argList)'])
    && f('sec-object-environment-records-withbaseobject').includes('If envRec. [[IsWithEnvironment]] is true, return envRec. [[BindingObject]]. Return undefined')
    && hasAll(f('sec-function-calls-runtime-semantics-evaluation'), ['ref. [[ReferencedName]] is "eval"', 'Return ? PerformEval (evalArg, strictCaller, true)']),
  'lecture 4: EvaluateCall — this from the reference (WithBaseObject only for with), arguments, the checks, tail call, Call; direct eval is apart');
  check(inOrder(f('sec-evaluatenew'), ['Let constructor be ? GetValue (ref)', 'Let argList be ? ArgumentListEvaluation of arguments', 'If IsConstructor (constructor) is false, throw a TypeError exception', 'Return ? Construct (constructor, argList)'])
    && inOrder(f('sec-argument-lists-runtime-semantics-argumentlistevaluation'), ['Let iteratorRecord be ? GetIterator (spreadObj, sync)', 'Let next be ? IteratorStepValue (iteratorRecord). If next is done, return list']),
  'lecture 5: EvaluateNew — the constructor, the arguments, then IsConstructor; spread takes an iterator and steps until done');
  check(inOrder(f('sec-optional-chaining-evaluation'), ['Let baseValue be ? GetValue (baseReference)', 'If baseValue is either undefined or null, then Return undefined', 'Return ? ChainEvaluation of OptionalChain with arguments baseValue and baseReference'])
    && hasAll(f('sec-optional-chaining-chain-evaluation'), ['OptionalChain : ?. Arguments', 'Return ? EvaluateCall (baseValue, baseReference, Arguments, tailCall)', 'Return ? EvaluatePropertyAccessWithExpressionKey (newValue, Expression, strict)'])
    && f('sec-optional-chains').includes('An optional chain is a chain of one or more property accesses and function calls, the first of which begins with the token ?.'),
  'lecture 6: 13.3.9 — one check for null before the whole chain; ChainEvaluation uses the same access and EvaluateCall with the reference');
  const att = f('sec-static-semantics-assignmenttargettype');
  // the productions are listed in groups, each group ends with its answer: the first "Return" after the chain is its
  check(att.slice(att.indexOf('LeftHandSideExpression : OptionalExpression')).match(/Return (\w+)/)?.[1] === 'invalid'
    && hasAll(f('sec-left-hand-side-expressions-static-semantics-early-errors'), ['OptionalChain : ?. TemplateLiteral OptionalChain TemplateLiteral It is a Syntax Error if any source text is matched by this production']),
  'lecture 6: an optional chain is an invalid assignment target (8.6.4); a template after ?. is an early error (13.3.1.1)');
  check(f('sec-update-expressions-static-semantics-early-errors').includes('It is an early Syntax Error if the AssignmentTargetType of LeftHandSideExpression is invalid')
    && inOrder(f('sec-postfix-increment-operator-runtime-semantics-evaluation'), ['Let oldValue be ? ToNumeric (? GetValue (lhs))', 'Perform ? PutValue (lhs, newValue)', 'Return oldValue'])
    && f('sec-unary-plus-operator-runtime-semantics-evaluation').includes('Return ? ToNumber (? GetValue (expr))')
    && f('sec-unary-minus-operator-runtime-semantics-evaluation').includes('Let oldValue be ? ToNumeric (? GetValue (expr))')
    && f('sec-logical-not-operator-runtime-semantics-evaluation').includes('Let oldValue be ToBoolean (? GetValue (expr))')
    && f('sec-exp-operator').includes('UpdateExpression [?Yield, ?Await] ** ExponentiationExpression [?Yield, ?Await]'),
  'lecture 7: ++ is an early error only for invalid; old value after ToNumeric; + ToNumber, - ToNumeric, ! ToBoolean; ** takes an UpdateExpression on the left');
  check(inOrder(f('sec-delete-operator-runtime-semantics-evaluation'), ['If ref is not a Reference Record, return true', 'If IsUnresolvableReference (ref) is true, then Assert : ref. [[Strict]] is false. Return true',
    'If IsSuperReference (ref) is true, throw a ReferenceError exception', 'Let baseObj be ? ToObject (ref. [[Base]])', 'If deleteStatus is false and ref. [[Strict]] is true, throw a TypeError exception',
    'Return ? base. DeleteBinding (ref. [[ReferencedName]])'])
    && hasAll(f('sec-delete-operator-static-semantics-early-errors'), ['It is a Syntax Error if IsStrict (the UnaryExpression) is true and the derived UnaryExpression is PrimaryExpression : IdentifierReference', 'MemberExpression : MemberExpression. PrivateIdentifier', 'expressions such as delete (((foo))) produce early errors because of recursive application of the first rule'])
    && f('sec-declarative-environment-records-deletebinding-n').includes('If the binding for N in envRec cannot be deleted, return false')
    && f('sec-global-environment-records-deletebinding-n').includes('If ! DclRec. HasBinding (N) is true, then Return ! DclRec. DeleteBinding (N)'),
  'lecture 8: the steps of delete; a name in strict code and a private field are early errors, through parentheses too; let at the top is in the declarative part and cannot be deleted');
  check(inOrder(f('sec-typeof-operator-runtime-semantics-evaluation'), ['If IsUnresolvableReference (val) is true, return "undefined"', 'Set val to ? GetValue (val)', 'Normative Optional',
    'If val has an [[IsHTMLDDA]] internal slot, return "undefined"', 'If val has a [[Call]] internal method, return "function". Return "object"'])
    && f('sec-toboolean').includes('If argument is an Object and argument has an [[IsHTMLDDA]] internal slot, return false'),
  'lecture 9, 13: typeof — unresolvable, GetValue, [[IsHTMLDDA]], [[Call]]; ToBoolean knows [[IsHTMLDDA]] too');
  const apply = f('sec-applystringornumericbinaryoperator');
  check(inOrder(apply, ['If opText is +, then Let lPrim be ? ToPrimitive (lVal)', 'If lPrim is a String or rPrim is a String', 'Let lNum be ? ToNumeric (lVal)', 'If SameType (lNum, rNum) is false, throw a TypeError exception'])
    && hasAll(apply, ['No hint is provided in the calls to ToPrimitive', 'Dates handle the absence of a hint as if string were given', 'Step 1.c differs from step 3 of the IsLessThan algorithm, by using the logical-or operation instead of the logical-and operation']),
  'lecture 10: + — ToPrimitive without a hint (Date — string), a string on either side, ToNumeric, one numeric type; note 2 — "or" against IsLessThan "and"');
  const rel = f('sec-relational-operators-runtime-semantics-evaluation');
  check(hasAll(rel, ['Let r be ? IsLessThan (lVal, rVal, true). If r is undefined, return false', 'Let r be ? IsLessThan (rVal, lVal, false). If r is undefined, return false', 'Let r be ? IsLessThan (rVal, lVal, false). If r is either true or undefined, return false. Return true',
    'If rVal is not an Object, throw a TypeError exception', 'RelationalExpression : PrivateIdentifier in ShiftExpression']),
  'lecture 11: < passes LeftFirst true, > swaps the operands with false; <= — not (right < left); in needs an object; #x in');
  check(inOrder(f('sec-instanceofoperator'), ['If target is not an Object, throw a TypeError exception', 'Let instOfHandler be ? GetMethod (target, %Symbol.hasInstance%)', 'Return ToBoolean (? Call (instOfHandler, target, «V»))',
    'If IsCallable (target) is false, throw a TypeError exception', 'Return ? OrdinaryHasInstance (target, V)', 'Steps 4 and 5 provide compatibility with previous editions'])
    && f('sec-function.prototype-%symbol.hasinstance%').includes('This property has the attributes { [[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : false }'),
  'lecture 12: InstanceofOperator — object, Symbol.hasInstance with ToBoolean, callable, OrdinaryHasInstance; steps 4–5 for compatibility; the inherited method is locked');
  check(hasAll(f('sec-binary-logical-operators'), ['ShortCircuitExpression', 'CoalesceExpressionHead'])
    && hasAll(f('sec-binary-logical-operators-runtime-semantics-evaluation'), ['If ToBoolean (lVal) is false, return lVal', 'If ToBoolean (lVal) is true, return lVal', 'If lVal is neither undefined nor null, return lVal'])
    && f('sec-conditional-operator-runtime-semantics-evaluation').includes('Let lVal be ToBoolean (? GetValue (lRef))'),
  'lecture 13: ?? lives in its own grammar branch; && and || return an operand; ?? looks at null and undefined; ?: — ToBoolean');
  const early = f('sec-assignment-operators-static-semantics-early-errors');
  check(inOrder(early, ['it is a Syntax Error if the AssignmentTargetType of LeftHandSideExpression is invalid', 'AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression It is a Syntax Error if the AssignmentTargetType of LeftHandSideExpression is invalid',
    'LeftHandSideExpression ??= AssignmentExpression It is a Syntax Error if the AssignmentTargetType of LeftHandSideExpression is not simple']),
  'lecture 14: 13.15.1 — = and += forbid only invalid, &&=, ||=, ??= need simple');
  check(inOrder(f('sec-runtime-semantics-keyeddestructuringassignmentevaluation'), ['Let lRef be ? Evaluation of DestructuringAssignmentTarget', 'Let v be ? GetV (value, propertyName)', 'If Initializer is present and v is undefined'])
    && hasAll(f('sec-runtime-semantics-destructuringassignmentevaluation'), ['ObjectAssignmentPattern : { } Perform ? RequireObjectCoercible (value)', 'ArrayAssignmentPattern : [ ] Let iteratorRecord be ? GetIterator (value, sync). Return ? IteratorClose (iteratorRecord, NormalCompletion (unused))'])
    && f('sec-destructuring-assignment-static-semantics-early-errors').includes('it is a Syntax Error if the AssignmentTargetType of LeftHandSideExpression is not simple'),
  'lecture 15: the target before the read, the default only for undefined; {} checks null, [] takes and closes an iterator; targets must be simple');
  check(inOrder(f('sec-tagged-templates-runtime-semantics-evaluation'), ['Let tagRef be ? Evaluation of MemberExpression', 'Let tagFunc be ? GetValue (tagRef)', 'Return ? EvaluateCall (tagFunc, tagRef, TemplateLiteral, tailCall)'])
    && inOrder(f('sec-template-literals-runtime-semantics-argumentlistevaluation'), ['Let siteObj be GetTemplateObject (templateLiteral)', 'Let remaining be ? ArgumentListEvaluation of SubstitutionTemplate']),
  'lecture 16: a tagged template is EvaluateCall with the reference of the tag; the template object, then the substitutions');
  check(f('sec-regular-expression-literals-runtime-semantics-evaluation').includes('Return ! RegExpCreate (pattern, flags)')
    && f('sec-runtime-semantics-propertydefinitionevaluation').includes('If isProtoSetter is true, then If propValue is an Object or propValue is null, then Perform ! object. [[SetPrototypeOf]] (propValue)')
    && inOrder(f('sec-numeric-types-number-remainder'), ['Let q be truncate (quotient)', 'Let r be ℝ (n) - (ℝ (d) × q)'])
    && inOrder(f('sec-comma-operator-runtime-semantics-evaluation'), ['Perform ? GetValue (lRef)', 'Return ? GetValue (rRef)']),
  'lecture 17: a regexp literal makes a new object; __proto__: sets the prototype; the remainder truncates — the sign of the dividend; the comma');
  check(inOrder(f('sec-makesuperpropertyreference'), ['Let env be GetThisEnvironment ()', 'Let baseValue be GetSuperBase (env)', '[[ThisValue]] : actualThis'])
    && f('sec-getsuperbase').includes('Let home be envRec. [[FunctionObject]]. [[HomeObject]]'),
  'lecture 17: super.m — the base is the prototype of [[HomeObject]], [[ThisValue]] is our this');

  // the MDN pages of the footer
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/reference/operators/${p}/index.md`], { encoding: 'utf8' });
  check(['optional_chaining', 'delete', 'typeof', 'instanceof'].every((p) => mdn(p).startsWith('---\ntitle:')), 'footer: the MDN pages Optional chaining, delete, typeof, instanceof are in the cache');
  check(f('sec-object-environment-records-deletebinding-n').includes('Let bindingObject be envRec. [[BindingObject]]. Return ? bindingObject. [[Delete]] (N)')
    && f('sec-runtime-semantics-propertydestructuringassignmentevaluation').includes('Let name be ? Evaluation of PropertyName. Perform ? KeyedDestructuringAssignmentEvaluation of AssignmentElement with arguments value and name')
    && inOrder(f('sec-runtime-semantics-restdestructuringassignmentevaluation'), ['Let lRef be ? Evaluation of DestructuringAssignmentTarget', 'Perform ? CopyDataProperties (restObj, value, excludedNames)', 'Return ? PutValue (lRef, restObj)'])
    && f('sec-runtime-semantics-destructuringassignmentevaluation').includes('Let excludedNames be ? PropertyDestructuringAssignmentEvaluation of AssignmentPropertyList with argument value. Return ? RestDestructuringAssignmentEvaluation of AssignmentRestProperty with arguments value and excludedNames')
    && fs.readFileSync(path.join(ROOT, 'advanced/day-07/lecture.html'), 'utf8').includes('CopyDataProperties'),
  'tasks 2, 9: delete of a var name ends in [[Delete]] of the global object too; the key, then the keyed step; the rest gets excludedNames and copies with CopyDataProperties (day 7)');
  check(hasAll(mdn('optional_chaining'), ['### Short-circuiting', '### Invalid optional chaining'])
    && /^id="sec-runtime-semantics-iteratordestructuringassignmentevaluation"[^>]*> 13\.15\.5\.5 /.test(f('sec-runtime-semantics-iteratordestructuringassignmentevaluation'))
    && f('sec-runtime-semantics-iteratordestructuringassignmentevaluation').includes('If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then Let lRef be ? Evaluation of DestructuringAssignmentTarget'),
  'student homework 3, 4: 13.15.5.5 takes the target before the iterator step; MDN Optional chaining has the sections Short-circuiting and Invalid optional chaining');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('advanced/day-04/lecture.html').includes('(card.show)()') && read('advanced/day-04/lecture.html').includes('запятая')
    && read('advanced/day-05/lecture.html').includes('LeftFirst') && read('advanced/day-05/lecture.html').includes('new Date(0) + 1')
    && read('advanced/day-06/lecture.html').includes('Оператор void') && read('advanced/day-07/lecture.html').includes('OrdinarySetWithOwnDescriptor')
    && read('advanced/day-07/lecture.html').includes('OrdinaryHasInstance') && read('advanced/day-08/lecture.html').includes('f() = 1'),
  'lecture: course 3 — parentheses and the comma (day 4), LeftFirst and Date (5), void (6), a read-only property in the prototype and OrdinaryHasInstance (7), f() = 1 (8)');
  check(read('intermediate/day-06/lecture.html').includes('document.all') && read('intermediate/day-06/lecture.html').includes('||=')
    && /#\w+ in /.test(read('intermediate/day-09/lecture.html')) && read('intermediate/day-11/lecture.html').includes('подробно — курс 3')
    && read('intermediate/day-20/lecture.html').includes('Invalid tagged template on optional chain') && read('intermediate/day-31/lecture.html').includes('import.meta')
    && read('intermediate/day-10/lecture.html').includes('super'),
  'lecture: course 2 — document.all and ||= (day 6), #x in (9), super (10), Symbol.hasInstance left to course 3 (11), the template error (20), import.meta (31)');
  const spRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine);
  const dayOf = (id) => { const r = spRows.find((c) => c[0] === id); return r ? `${r[6]}.${r[7]}` : '?'; };
  const days = { 'sec-tail-position-calls': '3.12', 'sec-eval-x': '3.13', 'sec-with-statement': '3.31', 'sec-proxy-objects': '3.16', 'sec-array-exotic-objects': '3.15' };
  const wrong = Object.entries(days).filter(([id, d]) => dayOf(id) !== d).map(([id]) => `${id}=${dayOf(id)}`);
  check(wrong.length === 0, `lecture: the days of the plan it names — tail calls 12, eval 13, Proxy 16, array exotic 15, with 31 ${wrong.join(', ')}`);

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-10/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = spRows.filter((c) => c[6] === '3' && c[7] === '10').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 64 && refRows.length === 64 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 10, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine).filter((c) => c[5] === '3' && c[6] === '10');
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 10`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
