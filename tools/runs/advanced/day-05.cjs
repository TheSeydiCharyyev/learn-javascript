// Course 3, day 5, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. A block whose first line starts with "// в консоли" is
// console input, run line by line through Runtime.evaluate with replMode, as on day 4. Console output of scripts is
// rebuilt from Chrome's preview objects, as DevTools prints it; an uncaught error is printed as "Uncaught TypeError: …".
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-05.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-05.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; the quoted lines of the deck buttons (day 34 of course 2)
// are the real ones; the cheatsheet runs without an error; the experiments the lecture only tells about; what the
// lecture says about the text of ECMA-262 2026 is checked against tools/.cache/ecma262-2026.html and what it takes from
// MDN against the page in tools/.cache/mdn-content.git; every row of the day's plan is a link and every tc39.es anchor
// exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-05');
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
  '// main.js, день 34 курса 2 — кнопки колод': 'intermediate/day-34/lecture.html',
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
// the steps of a clause in the order they are written: every word must come after the one before
const inOrder = (text, words) => words.every((w, i) => text.includes(w) && (i === 0 || text.indexOf(words[i - 1]) < text.indexOf(w)));

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
const log = [];
const v = { valueOf() { log.push("valueOf"); return 1; }, toString() { log.push("toString"); return "2"; } };
console.log(Number(v), log.join(" "));
const plain = {};
console.log(plain.valueOf() === plain, [1, 2].toString() === [1, 2].join(), ({}).toString());
console.log(+"   ", +"\\t\\n", attempt(() => String.prototype.at.call(null, 0)));
const k1 = {}, k2 = {}, o = {};
o[k1] = 1; o[k2] = 2;
console.log(Object.keys(o).length, o[k1]);`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(['1 valueOf', 'true true [object Object]', '0 0 TypeError: String.prototype.at called on null or undefined', '1 2']),
      `lecture 2, 3, 5, 7, 8: Number(x) asks for a number; Object.prototype.valueOf returns the object, Array toString is join; a string of white space is 0; string methods check null; two objects make one key ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const attempt = (f) => { try { return String(f()); } catch (e) { return e.name + ": " + e.message; } };
console.log(attempt(() => new ArrayBuffer(-1)), Array.isArray(new Proxy([], {})), attempt(() => "kitap".includes(/k/)));
console.log(JSON.stringify(["b", "B", "a", "ä"].sort((x, y) => x.localeCompare(y, "de"))), Symbol.iterator == "Symbol(Symbol.iterator)");`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify(['RangeError: Invalid array buffer length true TypeError: First argument to String.prototype.includes must not be a regular expression',
      '["a","ä","b","B"] false']),
    `lecture 9, 11, 13, 14: ToIndex throws RangeError, IsArray sees through Proxy, includes rejects a regex, localeCompare sorts by the alphabet, a symbol is not == its text ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  check(/These operations are not a part of the ECMAScript language/.test(flat(clause(spec, 'sec-abstract-operations'))), 'lecture 1: chapter 7 — not a part of the language');
  check(/The BigInt type has no implicit conversions in the ECMAScript language/.test(flat(clause(spec, 'sec-type-conversion'))), 'lecture 1: 7.1 — BigInt has no implicit conversions');
  const toPrimitive = flat(clause(spec, 'sec-toprimitive'));
  check(/If input is an Object, then Let exoticToPrim be \? GetMethod ?\(input, %Symbol\.toPrimitive%\)/.test(toPrimitive) && /If preferredType is not present, then Let hint be "default"/.test(toPrimitive)
    && /If preferredType is not present, set preferredType to number/.test(toPrimitive) && /only Dates \(see 21\.4\.4\.45\) and Symbol objects/.test(toPrimitive) && /Return input/.test(toPrimitive),
  'lecture 2, 3: ToPrimitive — Symbol.toPrimitive with "default", otherwise number; only Dates and Symbols override; a primitive is returned');
  const ordinary = flat(clause(spec, 'sec-ordinarytoprimitive'));
  check(/If hint is string, then Let methodNames be «"toString", "valueOf"»/.test(ordinary) && /Else, Let methodNames be «"valueOf", "toString"»/.test(ordinary)
    && /If result is not an Object, return result\. Throw a TypeError exception/.test(ordinary), 'lecture 3: OrdinaryToPrimitive — order of names, an object result is skipped, then TypeError');
  const toBoolean = flat(clause(spec, 'sec-toboolean'));
  check(/If argument is one of undefined, null, \+0 𝔽, -0 𝔽, NaN, 0 ℤ, or the empty String, return false/.test(toBoolean) && /\[\[IsHTMLDDA\]\] internal slot, return false/.test(toBoolean),
    'lecture 4: ToBoolean — seven false values and [[IsHTMLDDA]]');
  check(/Let primValue be \? ToPrimitive ?\(value, number\)\. If primValue is a BigInt, return primValue/.test(flat(clause(spec, 'sec-tonumeric'))), 'lecture 5: ToNumeric keeps a BigInt');
  const toNumber = flat(clause(spec, 'sec-tonumber'));
  check(/If argument is either a Symbol or a BigInt, throw a TypeError exception\. If argument is undefined, return NaN\. If argument is either null or false, return \+0 𝔽\. If argument is true, return 1 𝔽\. If argument is a String, return StringToNumber/.test(toNumber)
    && /ToPrimitive ?\(argument, number\)/.test(toNumber), 'lecture 5: ToNumber — the table and number for objects');
  check(/Let literal be ParseText ?\(str, StringNumericLiteral\)\. If literal is a List of errors, return NaN/.test(flat(clause(spec, 'sec-stringtonumber'))), 'lecture 5: StringToNumber — the numeric string grammar or NaN');
  const conversions = flat(clause(spec, 'sec-number-conversions'));
  check(/StrNumericLiteral ::: StrDecimalLiteral NonDecimalIntegerLiteral \[~Sep\] StrDecimalLiteral ::: StrUnsignedDecimalLiteral \+ StrUnsignedDecimalLiteral - StrUnsignedDecimalLiteral StrUnsignedDecimalLiteral ::: Infinity/.test(conversions)
    && /StringNumericLiteral ::: StrWhiteSpace opt/.test(conversions), 'lecture 5: A.6 — a sign only for decimals, Infinity as a word, white space alone is allowed');
  const toString = flat(clause(spec, 'sec-tostring'));
  check(/If argument is a Symbol, throw a TypeError exception/.test(toString) && /return Number::toString ?\(argument, 10\)/.test(toString) && /ToPrimitive ?\(argument, string\)/.test(toString), 'lecture 6: ToString — Symbol throws, numbers by Number::toString, objects with string');
  const numToString = flat(clause(spec, 'sec-numeric-types-number-tostring'));
  check(/If x is either \+0 𝔽 or -0 𝔽, return "0"/.test(numToString) && /n is in the inclusive interval from -5 to 21/.test(numToString), 'lecture 6: Number::toString — "0" for −0, positional for n from −5 to 21');
  check(/If NewTarget is undefined and value is a Symbol, return SymbolDescriptiveString ?\(value\)\. Let s be \? ToString/.test(flat(clause(spec, 'sec-string-constructor-string-value'))), 'lecture 6: String(value) looks at a Symbol before ToString');
  const toObject = flat(clause(spec, 'sec-toobject'));
  check(/If argument is either undefined or null, throw a TypeError exception/.test(toObject) && /\[\[StringData\]\]/.test(toObject) && /\[\[NumberData\]\]/.test(toObject), 'lecture 7: ToObject — wrappers with slots, null throws');
  check(/If argument is either undefined or null, throw a TypeError exception\. Return unused/.test(flat(clause(spec, 'sec-requireobjectcoercible'))), 'lecture 7: RequireObjectCoercible');
  check(/Let key be \? ToPrimitive ?\(argument, string\)\. If key is a Symbol, then Return key\. Return ! ToString ?\(key\)/.test(flat(clause(spec, 'sec-topropertykey'))), 'lecture 8: ToPropertyKey — string hint, a Symbol stays');
  check(/If len ≤ 0, return \+0 𝔽\. Return 𝔽 ?\(min ?\(len, 2 ?53 - 1\)\)/.test(flat(clause(spec, 'sec-tolength'))), 'lecture 9: ToLength — from 0 to 2^53 − 1');
  check(/If integer is not in the inclusive interval from 0 to 2 ?53 - 1, throw a RangeError exception/.test(flat(clause(spec, 'sec-toindex'))), 'lecture 9: ToIndex — RangeError');
  check(/If argument is "-0", return -0 𝔽\. Let n be ! ToNumber ?\(argument\)\. If ! ToString ?\(n\) is argument, return n\. Return undefined/.test(flat(clause(spec, 'sec-canonicalnumericindexstring'))), 'lecture 9: CanonicalNumericIndexString');
  const toBigInt = flat(clause(spec, 'sec-tobigint'));
  check(/Undefined Throw a TypeError exception\. Null Throw a TypeError exception\. Boolean Return 1n if prim is true and 0n if prim is false/.test(toBigInt) && /Number Throw a TypeError exception/.test(toBigInt)
    && /If n is undefined, throw a SyntaxError exception/.test(toBigInt), 'lecture 10: table 12 — Number throws, a bad string is SyntaxError');
  check(/Let literal be ParseText ?\(str, StringIntegerLiteral\)/.test(flat(clause(spec, 'sec-stringtobigint'))), 'lecture 10: StringToBigInt — the integer grammar');
  check(/If prim is a Number, return \? NumberToBigInt ?\(prim\)\. Return \? ToBigInt ?\(prim\)/.test(flat(clause(spec, 'sec-bigint-constructor-number-value'))), 'lecture 10: BigInt(value) — its own NumberToBigInt for numbers');
  check(/If argument is a Proxy exotic object/.test(flat(clause(spec, 'sec-isarray'))) && /If argument has a \[\[Call\]\] internal method, return true/.test(flat(clause(spec, 'sec-iscallable')))
    && /If argument has a \[\[Construct\]\] internal method, return true/.test(flat(clause(spec, 'sec-isconstructor'))) && /Return \? O\. ?\[\[IsExtensible\]\] ?\(\)/.test(flat(clause(spec, 'sec-isextensible-o'))),
  'lecture 11: IsArray (with Proxy), IsCallable, IsConstructor, IsExtensible');
  check(/Get ?\(argument, %Symbol\.match%\)/.test(flat(clause(spec, 'sec-isregexp'))) && /\[\[RegExpMatcher\]\] internal slot, return true/.test(flat(clause(spec, 'sec-isregexp')))
    && /\[\[IsUnpairedSurrogate\]\] is true, return false/.test(flat(clause(spec, 'sec-isstringwellformedunicode'))) && /If x is a Number and y is a Number, return true/.test(flat(clause(spec, 'sec-sametype'))),
  'lecture 11: IsRegExp (Symbol.match, slot), IsStringWellFormedUnicode, SameType');
  check(/treating all NaN values as equivalent and by differentiating \+0 𝔽 from -0 𝔽/.test(flat(clause(spec, 'sec-samevalue'))) && /treats \+0 𝔽 and -0 𝔽 as equivalent/.test(flat(clause(spec, 'sec-samevaluezero')))
    && /If x is a String, then If x and y have the same length and the same code units in the same positions, return true/.test(flat(clause(spec, 'sec-samevaluenonnumber'))),
  'lecture 12: SameValue, SameValueZero, SameValueNonNumber');
  check(/via SameValueZero ?\(x, y\), to test value equality, ignoring the difference between \+0 𝔽 and -0 𝔽, as in Array, Map, and Set methods/.test(flat(clause(spec, 'sec-numeric-types'))),
    'lecture 12: table 2 says SameValueZero "as in Array, Map, and Set methods"');
  check(/Set key to CanonicalizeKeyedCollectionKey ?\(key\)\. For each Record .*SameValue ?\(p\. ?\[\[Key\]\], key\)/.test(flat(clause(spec, 'sec-map.prototype.set')))
    && /If key is -0 𝔽, return \+0 𝔽/.test(flat(clause(spec, 'sec-canonicalizekeyedcollectionkey'))) && /SameValueZero ?\(searchElement, elementK\)/.test(flat(clause(spec, 'sec-array.prototype.includes'))),
  'lecture 12, 15: Map.set — −0 → +0, then SameValue; includes — SameValueZero');
  check(/NOTE: SameValue returns true for NaN values which may be distinguishable by other means/.test(flat(clause(spec, 'sec-validateandapplypropertydescriptor'))), 'lecture 12: ValidateAndApplyPropertyDescriptor compares by SameValue');
  check(inOrder(flat(clause(spec, 'sec-comparearrayelements')), ['Let xString be ? ToString (x)', 'Let xSmaller be ! IsLessThan (xString, yString, true)']), 'lecture 13: sort without a comparator compares strings with IsLessThan');
  const lessThan = flat(clause(spec, 'sec-islessthan'));
  check(/If LeftFirst is true, then Let px be \? ToPrimitive ?\(x, number\)/.test(lessThan) && /Else, NOTE: The order of evaluation needs to be reversed to preserve left to right evaluation/.test(lessThan)
    && /If px is a String and py is a String/.test(lessThan) && /If px is a BigInt and py is a String, then Let ny be StringToBigInt/.test(lessThan) && /Let nx be \? ToNumeric ?\(px\)/.test(lessThan)
    && /lexicographic ordering by code unit differs from ordering by code point/.test(lessThan), 'lecture 13: IsLessThan — number hint, LeftFirst, strings by code units, BigInt and strings, note 2');
  const loose = flat(clause(spec, 'sec-islooselyequal'));
  check(inOrder(loose, ['If SameType (x, y) is true, then Return IsStrictlyEqual', 'If x is null and y is undefined, return true', '[[IsHTMLDDA]]',
    'If x is a Number and y is a String, return ! IsLooselyEqual (x, ! ToNumber (y))', 'If x is a BigInt and y is a String, then Let n be StringToBigInt (y). If n is undefined, return false',
    'If x is a Boolean, return ! IsLooselyEqual (! ToNumber (x), y)', 'If x is either a String, a Number, a BigInt, or a Symbol and y is an Object, return ! IsLooselyEqual (x, ? ToPrimitive (y))',
    'If x is a BigInt and y is a Number']) && /Return false\.?$/.test(loose.trim()), 'lecture 14: IsLooselyEqual — the eight steps in this order, ToPrimitive without a hint');
  check(/If SameType ?\(x, y\) is false, return false\. If x is a Number, then Return Number::equal ?\(x, y\)\. Return SameValueNonNumber/.test(flat(clause(spec, 'sec-isstrictlyequal'))), 'lecture 14: IsStrictlyEqual');

  // the source page of MDN and the save of the Cards
  const mdn = execFileSync('git', ['-C', MDN_GIT, 'show', 'HEAD:files/en-us/web/javascript/guide/equality_comparisons_and_sameness/index.md'], { encoding: 'utf8' });
  check(/SameValueZero/.test(mdn) && /Object\.is\(\)/.test(mdn), 'MDN: Equality comparisons and sameness speaks of SameValueZero and Object.is()');
  const day33 = fs.readFileSync(path.join(ROOT, 'intermediate/day-33/lecture.html'), 'utf8');
  check(day33.includes('{"$map":[[1,'), 'lecture 15: save of day 33 writes progress as a list of pairs {"$map":[[1, …]]}');
  const day33decks = fs.readFileSync(path.join(ROOT, 'intermediate/day-33/lecture.html'), 'utf8');
  check(day33decks.includes('{ "id": "school", "name": "школа" }') && day33decks.includes('{ "id": 1, "word": "book"'), 'lecture 15: deck ids are strings, card ids are numbers');

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '5').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 30 && unlinked.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 5, not linked: ${unlinked.join(', ') || 'none'}`);
  const pages = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[5] === '3' && c[6] === '5').map((c) => c[0]);
  check(pages.length === 0, `plan: ${pages.length} MDN pages of day 5`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
