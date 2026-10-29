// Course 3, day 4, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. A block whose first line starts with "// в консоли" is
// console input: every next line goes through Runtime.evaluate with replMode on one page, as DevTools runs it, and the
// output is what the console echoes — the completion value, a string in quotes. Console output of scripts is rebuilt
// from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …".
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-04.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-04.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the quoted lines of the «Знаю» button (day 34 of
// course 2) are the real ones; the cheatsheet runs without an error; the experiments the lecture only tells about;
// what the lecture says about the text of ECMA-262 2026 is checked against tools/.cache/ecma262-2026.html and what it
// takes from MDN against the page in tools/.cache/mdn-content.git; every row of the day's plan is a link and every
// tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-04');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const PAGES = ['lecture'];
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

// a block without a result-box: its output by the first line
const EXPECT = {};
// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = {
  '// main.js, день 34 курса 2 — кнопка «Знаю»': 'intermediate/day-34/lecture.html',
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
  await p.waitForTimeout(100);
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
      const consoleBlock = first.startsWith('// в консоли');
      const out = consoleBlock ? await runConsole(ctx, blk.code, `${name}-${i}.html`) : await runScript(ctx, blk.code, `${name}-${i}.html`);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : consoleBlock ? ' (console)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('Uncaught')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else if (EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
    }
  }

  // what the lecture only tells about
  {
    const out = await runScript(ctx, `const attempt = (f) => { try { return String(f()); } catch (e) { return e.name + ": " + e.message; } };
const card = { word: "kitap", show() { return this === card; } };
console.log(attempt(() => "x".repeat(2 ** 30)), 2n ** 0n, attempt(() => new card.show()));
"kitap".x = 1;
console.log("kitap".x, typeof (() => {}), (() => {}) instanceof Object);`, 'told.html');
    check(JSON.stringify(out) === '["RangeError: Invalid string length 1n TypeError: card.show is not a constructor","undefined function true"]',
      `lecture 2, 4, 12, 13, 1: the string limit of Chrome, 2n ** 0n, a sloppy write to a string is lost, a method is not a constructor, a function is an Object ${JSON.stringify(out)}`);
  }
  // section 15: module code is strict, so this of a plain call is undefined there
  {
    const out = await runScript(ctx, 'console.log(typeof this, (function () { return this; })());', 'module.html', ' type="module"');
    check(JSON.stringify(out) === '["undefined undefined"]', `lecture 15: module code is strict ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  check(/The possible value types are exactly those defined in this clause/.test(flat(clause(spec, 'sec-ecmascript-data-types-and-values'))), 'lecture 1: chapter 6 — exactly these types');
  check(/The ECMAScript language types are Undefined, Null, Boolean, String, Symbol, Number, BigInt, and Object/.test(flat(clause(spec, 'sec-ecmascript-language-types'))), 'lecture 1: 6.1 — eight language types');
  const typeofOp = flat(clause(spec, 'sec-typeof-operator-runtime-semantics-evaluation'));
  check(/IsUnresolvableReference ?\(val\) is true, return "undefined"/.test(typeofOp) && /If val is null, return "object"/.test(typeofOp) && /If val has a \[\[Call\]\] internal method, return "function"/.test(typeofOp),
    'lecture 1, 12: typeof — unresolvable gives "undefined", null gives "object", [[Call]] gives "function"');
  const string = flat(clause(spec, 'sec-ecmascript-language-types-string-type'));
  check(/16-bit unsigned integer values/.test(string) && /maximum length of 2 ?53 - 1 elements/.test(string), 'lecture 2: String — 16-bit elements, up to 2^53 − 1');
  check(/Each Symbol is unique and immutable\. Each Symbol has an immutable \[\[Description\]\] internal slot/.test(flat(clause(spec, 'sec-ecmascript-language-types-symbol-type'))), 'lecture 2: Symbol — unique, [[Description]]');
  check(/%Symbol\.iterator%/.test(flat(clause(spec, 'sec-well-known-symbols'))), 'lecture 2: 6.1.5.1 — %Symbol.iterator% is a well-known symbol');
  const number = flat(clause(spec, 'sec-ecmascript-language-types-number-type'));
  check(/exactly 18,437,736,874,454,810,627 \(that is, 2 ?64 - 2 ?53 \+ 3\) values/.test(number) && /as a single special NaN value/.test(number)
    && /there is both a positive zero and a negative zero/.test(number), 'lecture 3: Number — 2^64 − 2^53 + 3 values, one NaN, two zeros');
  check(/all the positive and negative integers whose magnitude is no greater than 2 ?53 are representable/.test(number) && /the one with an even significand is chosen/.test(number)
    && /2 ?1024/.test(number), 'lecture 3: integers to 2^53, ties to an even significand, the extra values 2^1024');
  const numeric = flat(clause(spec, 'sec-numeric-types'));
  check(/BigInt::divide either a normal completion containing a BigInt or a throw completion/.test(numeric) && /BigInt::unsignedRightShift a throw completion/.test(numeric)
    && /Number::add/.test(numeric) && /provides no implicit conversion among these types/.test(numeric), 'lecture 4: table 2 — BigInt operations that throw, no implicit conversion');
  check(/BigInts act as two's complement binary strings, with negative numbers treated as having bits set infinitely to the left/.test(flat(clause(spec, 'sec-ecmascript-language-types-bigint-type'))), 'lecture 4: 6.1.6.2 — two\'s complement, ones to the left');
  const object = flat(clause(spec, 'sec-object-type'));
  check(/A property key is either a String or a Symbol/.test(object) && /including the empty String, are valid as property keys/.test(object)
    && /to 𝔽 ?\(2 ?53 - 1\)/.test(object) && /to 𝔽 ?\(2 ?32 - 2\)/.test(object) && /"-0" is neither an integer index nor an array index/.test(object),
  'lecture 5: keys are Strings or Symbols; integer index, array index, "-0"');
  const attributes = flat(clause(spec, 'sec-property-attributes'));
  check(['[[Value]]', '[[Writable]]', '[[Get]]', '[[Set]]', '[[Enumerable]]', '[[Configurable]]'].every((w) => attributes.includes(w))
    && /\[\[Writable\]\] data property a Boolean false/.test(attributes) && /\[\[Enumerable\]\] data property or accessor property a Boolean false/.test(attributes), 'lecture 6: table 3 — six attributes, false by default');
  const internal = flat(clause(spec, 'sec-object-internal-methods-and-internal-slots'));
  const essential = ['[[GetPrototypeOf]]', '[[SetPrototypeOf]]', '[[IsExtensible]]', '[[PreventExtensions]]', '[[GetOwnProperty]]', '[[DefineOwnProperty]]',
    '[[HasProperty]]', '[[Get]]', '[[Set]]', '[[Delete]]', '[[OwnPropertyKeys]]'];
  const table4 = internal.slice(internal.indexOf('Table 4'), internal.indexOf('Table 5'));
  check(essential.every((m) => table4.includes(`${m} (`)) && /\[\[Call\]\]/.test(internal.slice(internal.indexOf('Table 5'))) && /\[\[Construct\]\]/.test(internal.slice(internal.indexOf('Table 5'))),
    'lecture 7: table 4 — the eleven essential internal methods, table 5 — [[Call]] and [[Construct]]');
  check(/Internal slots are not object properties and they are not inherited/.test(internal) && /An exotic object is an object that is not an ordinary object/.test(internal)
    && /a TypeError exception is thrown/.test(internal), 'lecture 7: slots are not properties; exotic objects; a missing method throws');
  check(/Proxy objects maintain these invariants by means of runtime checks/.test(flat(clause(spec, 'sec-invariants-of-the-essential-internal-methods'))), 'lecture 7: 6.1.7.3 — Proxy checks the invariants at run time');
  check(/%name% means the intrinsic object, associated with the current realm/.test(flat(clause(spec, 'sec-well-known-intrinsic-objects'))), 'lecture 7: 6.1.7.4 — %name% of the current realm');
  check(/such values cannot be stored as properties of objects or values of ECMAScript language variables/.test(flat(clause(spec, 'sec-ecmascript-specification-types'))), 'lecture 8: 6.2 — specification values are not stored in variables');
  check(/Enums have no characteristics other than their name/.test(flat(clause(spec, 'sec-enum-specification-type'))), 'lecture 8: 6.2.1 — an enum is only its name');
  const lists = flat(clause(spec, 'sec-list-and-record-specification-type'));
  check(/«1, 2» defines a List value/.test(lists) && /A new empty List can be expressed as «»/.test(lists) && /\{ \[\[Field1\]\] ?: 42, \[\[Field2\]\] ?: false/.test(lists), 'lecture 8: List «1, 2», «», a Record literal');
  const apply = flat(clause(spec, 'sec-function.prototype.apply'));
  check(apply.indexOf('IsCallable') < apply.indexOf('CreateListFromArrayLike') && apply.indexOf('CreateListFromArrayLike') < apply.lastIndexOf('Call (func, thisArg, argList)'),
    'lecture 8: apply checks the function, builds a List with CreateListFromArrayLike, then calls');
  check(/distinct from the ECMAScript collection type of the same name/.test(flat(clause(spec, 'sec-set-and-relation-specification-type'))), 'lecture 8: 6.2.3 — not the Set object');
  const completion = flat(clause(spec, 'sec-completion-record-specification-type'));
  check(/\[\[Type\]\] normal, break, continue, return, or throw/.test(completion) && /\[\[Value\]\] any value except a Completion Record/.test(completion)
    && /\[\[Target\]\] a String or empty/.test(completion) && /abrupt completion refers to any Completion Record with a \[\[Type\]\] value other than normal/.test(completion)
    && /Callable objects that are defined in this specification only return a normal completion or a throw completion/.test(completion), 'lecture 9: table 7 — three fields; abrupt; callables return normal or throw');
  check(/completionRecord\. ?\[\[Value\]\] is not empty, return \? completionRecord/.test(flat(clause(spec, 'sec-updateempty'))), 'lecture 9: UpdateEmpty keeps a value that is not empty');
  check(/If F is a normal completion, set F to B/.test(flat(clause(spec, 'sec-try-statement-runtime-semantics-evaluation'))), 'lecture 11: 14.15.3 — a normal finally gives back the record of the block');
  const reference = flat(clause(spec, 'sec-reference-record-specification-type'));
  check(['[[Base]]', '[[ReferencedName]]', '[[Strict]]', '[[ThisValue]]'].every((w) => reference.includes(w)) && /A \[\[Base\]\] of unresolvable indicates that the binding could not be resolved/.test(reference)
    && /Super Reference Record/.test(reference), 'lecture 12: table 8 — four fields, unresolvable, the super reference');
  check(/If IsUnresolvableReference ?\(V\) is true, throw a ReferenceError exception/.test(flat(clause(spec, 'sec-getvalue'))), 'lecture 12: GetValue of an unresolvable name throws ReferenceError');
  const putValue = flat(clause(spec, 'sec-putvalue'));
  check(/If V\. ?\[\[Strict\]\] is true, throw a ReferenceError exception\. Let globalObj be GetGlobalObject/.test(putValue) && /If succeeded is false and V\. ?\[\[Strict\]\] is true, throw a TypeError exception/.test(putValue)
    && /ToObject ?\(V\. ?\[\[Base\]\]\)/.test(putValue) && /is not accessible outside of the above abstract operation/.test(putValue), 'lecture 12: PutValue — global object or ReferenceError, TypeError only in strict code, ToObject of a primitive');
  check(/If IsUnresolvableReference ?\(ref\) is true, then Assert ?: ref\. ?\[\[Strict\]\] is false\. Return true/.test(flat(clause(spec, 'sec-delete-operator-runtime-semantics-evaluation'))), 'lecture 12: delete of an unresolvable name is true');
  check(/If IsPropertyReference ?\(ref\) is true, then Let thisValue be GetThisValue ?\(ref\)/.test(flat(clause(spec, 'sec-evaluatecall'))), 'lecture 13: EvaluateCall takes this from GetThisValue');
  const thisValue = flat(clause(spec, 'sec-getthisvalue'));
  check(/If IsSuperReference ?\(V\) is true, return V\. ?\[\[ThisValue\]\]\. Return V\. ?\[\[Base\]\]/.test(thisValue), 'lecture 13: GetThisValue — [[ThisValue]] for super, else [[Base]]');
  check(/This may be of type Reference/.test(flat(clause(spec, 'sec-grouping-operator-runtime-semantics-evaluation'))) && /Return \? GetValue ?\(rRef\)/.test(flat(clause(spec, 'sec-comma-operator-runtime-semantics-evaluation'))),
    'lecture 13: parentheses keep the reference, the comma calls GetValue');
  check(/If desc has a \[\[Get\]\] field or desc has a \[\[Set\]\] field, then If desc has a \[\[Value\]\] field or desc has a \[\[Writable\]\] field, throw a TypeError exception/.test(flat(clause(spec, 'sec-topropertydescriptor'))),
    'lecture 14: ToPropertyDescriptor rejects accessor and data fields together');
  check(/which differs from any other Private Name, even if they are otherwise indistinguishable/.test(flat(clause(spec, 'sec-private-names'))), 'lecture 14: 6.2.12 — a Private Name is unique');
  check(/the behaviour of name resolution in nested functions and blocks/.test(flat(clause(spec, 'sec-lexical-environment-and-environment-record-specification-types')))
    && /sequence of byte-sized \(8 bit\) numeric values/.test(flat(clause(spec, 'sec-data-blocks'))) && /values are captured with the verb "capture"/.test(flat(clause(spec, 'sec-abstract-closure'))),
  'lecture 14: Environment Record, Data Block, Abstract Closure');

  // the source page of MDN, in the cached copy of mdn/content
  const mdn = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/guide/data_structures/index.md'], { encoding: 'utf8' });
  check(/`typeof null` returns `"object"`/.test(mdn) || /typeof null === "object"/.test(mdn), 'MDN: Data structures speaks of typeof null');

  // the button handler of day 34 is an arrow, and know is called on the deck
  const day34 = fs.readFileSync(path.join(ROOT, 'intermediate/day-34/lecture.html'), 'utf8');
  check(day34.includes('knowButton.addEventListener("click", () =&gt; {'), 'lecture 15: the handler of the «Знаю» button in day 34 is an arrow');

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '4').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 23 && unlinked.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 4, not linked: ${unlinked.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '4').map((c) => c[0]);
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 4`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
