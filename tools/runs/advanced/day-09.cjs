// Course 3, day 9, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. Console output of scripts is rebuilt from Chrome's preview
// objects, as DevTools prints it (null as "null"); an uncaught error is printed as "Uncaught TypeError: …". A block
// that waits for a timer or for the "load" of a frame gets 700 ms before its page closes, a block with import() 400 ms.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-09.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-09.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; in the notes the output equals the comments of the lines
// that print it; the quoted lines of main.js (day 35 of course 2) are the real ones; the cheatsheet runs without an error;
// the homework of the notes; the experiments the lecture only tells about (a real click of a
// person, the call frames and scopes the debugger gets, the species of a subclass, the same module from import());
// what the lecture says about the text of ECMA-262 2026 (chapter 9 and the operations that call it, found by a search
// of the callers) is checked against tools/.cache/ecma262-2026.html; what it says about MDN — against
// tools/.cache/mdn-content.git; the days it points to say what it says; the reference table holds all 25 rows of
// ECMA-262 and both MDN pages of the day's plan as links and every tc39.es anchor exists.
// The DevTools window itself (the names Call Stack, Scope, Local, Script, Global and the click on a frame) was checked
// once by hand through the CDP target of DevTools, see HANDOFF.md, day 9 of course 3.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-09');
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

// a block without a result-box: its output by "page #index" or by the first line
const EXPECT = {};

// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = {
  '// main.js, день 35 курса 2 — поиск по всем колодам': 'intermediate/day-35/lecture.html',
};
// the helper of the lecture: names of the frames under the caller, the top frame of a script as «скрипт»
const STACK = String.raw`const stack = () => new Error().stack.split("\n").slice(2)
  .map((line) => line.trim().slice(3).split(" (")[0])
  .map((name) => (name.includes("://") ? "скрипт" : name)).join(" ← ");
`;
const wait = (code) => (code.includes('setTimeout') || code.includes('"load"') ? 700 : code.includes('import(') ? 400 : 100);

// run code as the only <script> of a page; act(page) runs after the page is loaded (a click of a person);
// returns console lines and uncaught errors in order
async function runScript(ctx, code, file = 'run.html', act = null) {
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
  if (act) await act(p);
  await p.waitForTimeout(wait(code));
  await p.close();
  await ctx.unroute(`http://day.test/${file}`);
  return out;
}

// run code with the debugger on: at every pause, the frames (function, this, the scopes and the variables of the
// local and block scopes) as CDP gives them to DevTools; then resume
async function runPaused(ctx, code, file = 'paused.html') {
  const html = `<!doctype html><meta charset="utf-8"><title>paused</title><body><script>${code}\n</script></body>`;
  await ctx.route(`http://day.test/${file}`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const pauses = [];
  cdp.on('Debugger.paused', async (e) => {
    const frames = [];
    for (const fr of e.callFrames) {
      const scopes = [];
      for (const s of fr.scopeChain) {
        let vars = '';
        if (s.type === 'local' || s.type === 'block') {
          const props = await cdp.send('Runtime.getProperties', { objectId: s.object.objectId, ownProperties: true });
          vars = props.result.map((r) => `${r.name}=${r.value?.value ?? r.value?.description}`).join(',');
        }
        scopes.push(vars ? `${s.type}(${vars})` : s.type);
      }
      frames.push(`${fr.functionName || '(anonymous)'} this=${fr.this.className ?? fr.this.type}: ${scopes.join(' ')}`);
    }
    pauses.push(frames);
    await cdp.send('Debugger.resume');
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await p.goto(`http://day.test/${file}`);
  await p.waitForTimeout(300);
  await p.close();
  await ctx.unroute(`http://day.test/${file}`);
  return pauses;
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
// the first lines of the top-level steps of the first algorithm of a clause
const topSteps = (spec, id) => {
  const own = clause(spec, id);
  const alg = own.slice(own.indexOf('<emu-alg>'), own.indexOf('</emu-alg>'));
  const steps = [];
  let depth = 0;
  for (const m of alg.matchAll(/<(\/?)(ol|li)\b[^>]*>/g)) {
    if (m[2] === 'ol') depth += m[1] ? -1 : 1;
    else if (!m[1] && depth === 1) steps.push(flat(alg.slice(m.index + m[0].length, m.index + m[0].length + 200)).trim().slice(0, 60));
  }
  return steps;
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
        // the quoted page marks some blocks with data-page, so the tag may carry attributes
        const code = [...quoted.matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).join('\n');
        const lines = blk.code.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
        const missing = lines.filter((l) => !code.split('\n').some((c) => c.trim() === l));
        check(missing.length === 0, `${name} #${i}: quoted lines are in ${QUOTES[first]}${missing.length ? ` — missing: ${missing.join(' | ')}` : ''}`);
        continue;
      }
      const out = await runScript(ctx, blk.code, `${name}-${i}.html`);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('Uncaught')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (name === 'student') check(JSON.stringify(out) === JSON.stringify(commented(blk.code)), `${name} #${i}: output = comments ${JSON.stringify(out)}`);
      else if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else if (EXPECT[`${name} #${i}`] ?? EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[`${name} #${i}`] ?? EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
    }
  }

  // what the lecture only tells about
  {
    const out = await runScript(ctx, `const frame = document.createElement("iframe");
document.body.append(frame);
const other = frame.contentWindow;
console.log(other.location.href, other.origin === window.origin);
const attrs = (name) => { const d = Object.getOwnPropertyDescriptor(globalThis, name); return [d.writable, d.enumerable, d.configurable].join(" "); };
console.log(attrs("Infinity"), "|", attrs("undefined"), "|", Object.hasOwn(window, "document"), Object.hasOwn(window, "setTimeout"));
const proto = Array.prototype;
Array = null;
console.log(Array, Object.getPrototypeOf([1]) === proto);`, 'told-1.html');
    check(JSON.stringify(out) === JSON.stringify(['about:blank true', 'false false false | false false false | true true', 'null true']),
      `lecture 2, 6: a frame without an address is about:blank of our origin; Infinity and undefined are locked; document and setTimeout are own properties the host adds; Array can be replaced, a literal still takes %Array.prototype% ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const frame = document.createElement("iframe");
document.body.append(frame);
const other = frame.contentWindow;
console.log(other.Function("'use strict'; return this;")(), Function("return this")() === window);
class Tagged extends Array {}
const t = Tagged.from([1, 2, 3]);
const viaSpecies = [t.map((x) => x), t.filter(Boolean), t.slice(0), t.splice(0, 0), t.concat([]), t.flat(), t.flatMap((x) => x)];
console.log(viaSpecies.every((r) => r instanceof Tagged), [...t] instanceof Tagged, Array.from(t) instanceof Tagged);`, 'told-2.html');
    check(JSON.stringify(out) === JSON.stringify(['undefined true', 'true false false']),
      `lecture 4, 5: strict code gets no global this; the seven methods of ArraySpeciesCreate keep the subclass, spread and Array.from do not ask the constructor ${JSON.stringify(out)}`);
  }
  {
    const pauses = await runPaused(ctx, `function foo(b) {
  const a = 10;
  debugger;
  return a + b + 11;
}
function bar(x) {
  const y = 3;
  return foo(x * y);
}
const baz = bar(7);`);
    check(JSON.stringify(pauses) === JSON.stringify([['foo this=Window: local(b=21,a=10) script global', 'bar this=Window: local(x=7,y=3) script global', '(anonymous) this=Window: script global']]),
      `lecture 8: the debugger gets three frames foo, bar and the top of the script; Local, Script, Global; the variables of foo and of bar ${JSON.stringify(pauses)}`);
  }
  {
    const out = await runScript(ctx, `${STACK}async function load() {
  console.log("до await:", stack());
  await null;
  console.log("после await:", stack());
}
function start() { load(); }
start();
function factorial(n, acc = 1) {
  if (n <= 1) return acc;
  return factorial(n - 1, n * acc);
}
try { factorial(100000); } catch (e) { console.log(e.name); }`, 'told-3.html');
    check(JSON.stringify(out) === JSON.stringify(['до await: load ← start ← скрипт', 'RangeError', 'после await: load']),
      `lecture 9: after await the async function goes on in a new job, nobody under it; the non-strict example of MDN overflows the stack ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `function F() { return (() => new.target)(); }
console.log(F() === undefined, new F() === F);
Promise.resolve().then(() => { throw new Error("в then"); }).catch((e) => console.log("отказ:", e.message));
Promise.resolve().then(() => console.log("очередь идёт"));`, 'told-4.html');
    check(JSON.stringify(out) === JSON.stringify(['true true', 'очередь идёт', 'отказ: в then']),
      `lecture 11, 12: new.target in an arrow is the one of the outer function; an error in then rejects the promise and the queue goes on ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `${STACK}const button = document.createElement("button");
button.textContent = "жми";
document.body.append(button);
button.addEventListener("click", function onClick() { console.log("щелчок:", stack()); });
button.click();`, 'told-5.html', (p) => p.click('button'));
    check(JSON.stringify(out) === JSON.stringify(['щелчок: HTMLButtonElement.onClick ← скрипт', 'щелчок: HTMLButtonElement.onClick']),
      `lecture 13: button.click() from code runs the listener on top of the script, a click of a person is a task with nothing under it ${JSON.stringify(out)}`);
  }
  {
    const out = await runScript(ctx, `const frame = document.createElement("iframe");
frame.sandbox = "allow-scripts";
frame.srcdoc = "<p>чужая страница</p>";
document.body.append(frame);
frame.addEventListener("load", () => {
  const other = frame.contentWindow;
  console.log(typeof other.frames, typeof other.location);
  try { other.name; } catch (e) { console.log(e.name); }
  try { other.Array; } catch (e) { console.log(e.name); }
});
const url = "data:text/javascript,export const n = 1;";
Promise.all([import(url), import(url)]).then(([a, b]) => console.log("тот же модуль:", a === b));`, 'told-6.html');
    check(JSON.stringify(out) === JSON.stringify(['тот же модуль: true', 'object object', 'SecurityError', 'SecurityError']),
      `lecture 15, 16: frames and location of a foreign window are open, name and Array are not; import() of one address gives the same module ${JSON.stringify(out)}`);
  }
  // notes, homework 2 and 3: the methods of two realms on a foreign array; the realm of a then job is the handler's
  {
    const out = await runScript(ctx, `const frame = document.createElement("iframe");
document.body.append(frame);
const other = frame.contentWindow;
console.log(Array.prototype.filter.call(other.Array.of(1, 2), Boolean) instanceof Array, other.Array.prototype.slice.call([1]) instanceof Array, [...other.Array.of(1)] instanceof Array);
Promise.resolve(1).then(other.Function("x", "return [x];")).then((v) => console.log(v instanceof Array, v instanceof other.Array));`, 'hw.html');
    check(JSON.stringify(out) === JSON.stringify(['true false true', 'false true']),
      `student homework 2, 3: filter of the page — an array of the page, slice of the frame on our array — of the frame, spread — of the page; a frame handler makes a frame array ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);
  // the hooks are listed in 9.5 and the shared memory guidelines name them too; the real callers are the rest
  const realCallers = (op) => callers(op).filter((id) => !['sec-jobs', 'sec-shared-memory-guidelines', 'sec-jobcallback-records'].includes(id));
  // the id of the clause that defines an operation
  const idOf = (op) => spec.match(new RegExp(`<emu-clause[^>]*\\sid="([^"]+)"[^>]*\\saoid="${op}"`))?.[1];
  const same = (list, want) => JSON.stringify([...list].sort()) === JSON.stringify([...want].sort());

  check(['sec-environment-records', 'sec-privateenvironment-records', 'sec-code-realms', 'sec-execution-contexts', 'sec-jobs', 'sec-agents', 'sec-agent-clusters', 'sec-forward-progress', 'sec-weakref-processing-model', 'sec-clear-kept-objects', 'sec-addtokeptobjects']
    .every((id, i) => f(id).includes(`${['9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8', '9.9', '9.10', '9.11'][i]} `)),
  'lecture 1: chapter 9 — 9.1 environments, 9.2 private names, 9.3–9.8 today, 9.9–9.11 WeakRef');
  check(hasAll(f('sec-code-realms'), ['Before it is evaluated, all ECMAScript code must be associated with a realm', '[[AgentSignifier]]', '[[Intrinsics]]', '[[GlobalObject]]', '[[GlobalEnv]]',
    '[[TemplateMap]]', '[[LoadedModules]]', '[[HostDefined]]', 'Template objects are canonicalized separately for each realm',
    '[[LoadedModules]] in Realm Records is only used when running an import() expression in a context where there is no active script or module']),
  'lecture 2, 6: 9.3 — code belongs to a realm; the seven fields of table 19; template objects per realm; LoadedModules without an active script');
  check(hasAll(f('sec-ordinaryhasinstance'), ['Let P be ? Get (C, "prototype")', 'Repeat, Set O to ? O. [[GetPrototypeOf]] ()']) && f('sec-isarray').includes('If argument is an Array exotic object, return true')
    && f('sec-error.iserror').includes('If arg does not have an [[ErrorData]] internal slot, return false'),
  'lecture 3: instanceof walks the prototype chain; IsArray asks the object itself; Error.isError looks for [[ErrorData]]');
  check(hasAll(f('sec-execution-contexts'), ['The value of the Realm component of the running execution context is also called the current Realm Record'])
    && inOrder(f('sec-builtincallorconstruct'), ['Let calleeContext be a new execution context', 'Set the Function of calleeContext to F', 'Let calleeRealm be F. [[Realm]]', 'Set the Realm of calleeContext to calleeRealm', 'Push calleeContext onto the execution context stack'])
    && inOrder(f('sec-ordinarycallbindthis'), ['Let calleeRealm be F. [[Realm]]', 'If thisArgument is either undefined or null, then Let globalEnv be calleeRealm. [[GlobalEnv]]', 'Let thisValue be globalEnv. [[GlobalThisValue]]'])
    && f('sec-arraycreate').includes('If proto is not present, set proto to %Array.prototype%'),
  'lecture 4: the current realm; a built-in gets a context with F.[[Realm]] (10.3.3); this without an object is the global this of the function realm (10.2.1.2); ArrayCreate takes %Array.prototype%');
  const species = f('sec-arrayspeciescreate');
  const speciesSteps = topSteps(spec, 'sec-arrayspeciescreate');
  check(inOrder(species, ['Let isArray be ? IsArray (originalArray)', 'Let C be ? Get (originalArray, "constructor")', 'If IsConstructor (C) is true, then Let thisRealm be the current Realm Record',
    'Let realmC be ? GetFunctionRealm (C)', 'If SameValue (C, realmC. [[Intrinsics]].[[ %Array% ]]) is true, set C to undefined',
    'This maintains compatibility with Web browsers that have historically had that behaviour']) && speciesSteps[3].startsWith('If IsConstructor (C) is true'),
  `lecture 5: ArraySpeciesCreate — step 4 drops %Array% of another realm; the note about the browsers; step 4 is ${JSON.stringify(speciesSteps[3])}`);
  const speciesCallers = callers('ArraySpeciesCreate');
  check(['concat', 'filter', 'flat', 'flatmap', 'map', 'slice', 'splice'].every((m) => speciesCallers.includes(`sec-array.prototype.${m}`))
    && f('sec-getfunctionrealm').includes('If obj is a bound function exotic object, then Let boundTargetFunction be obj. [[BoundTargetFunction]]. Return ? GetFunctionRealm (boundTargetFunction)'),
  `lecture 5: the seven Array methods that call ArraySpeciesCreate; GetFunctionRealm of a bound function is the realm of its target ${JSON.stringify(speciesCallers)}`);
  check(inOrder(f('sec-initializehostdefinedrealm'), ['Let realm be a new Realm Record', 'Perform CreateIntrinsics (realm)', 'Set realm. [[AgentSignifier]] to AgentSignifier ()', 'Set realm. [[TemplateMap]] to a new empty List',
    'Set the Function of newContext to null', 'Set the ScriptOrModule of newContext to null', 'Push newContext onto the execution context stack',
    "If the host requires use of a specific object to serve as realm 's global object", "If the host requires that the this binding in realm 's global scope return an object other than the global object",
    'Perform ? SetDefaultGlobalBindings (realm)', 'Create any host-defined global object properties on global'])
    && hasAll(f('sec-createintrinsics'), ['Set fields of realmRec. [[Intrinsics]] with the values listed in Table 6', 'All values that are built-in function objects are created by performing CreateBuiltinFunction'])
    && hasAll(f('sec-setdefaultglobalbindings'), ['For each property of the Global Object specified in clause 19', 'the value of the [[Value]] attribute is the corresponding intrinsic object from realmRec']),
  'lecture 6: the steps of InitializeHostDefinedRealm in order; CreateIntrinsics — table 6; SetDefaultGlobalBindings — the properties of clause 19');
  check(f('sec-value-properties-of-the-global-object-nan').includes('{ [[Writable]] : false, [[Enumerable]] : false, [[Configurable]] : false }')
    && f('sec-globalthis').includes('{ [[Writable]] : true, [[Enumerable]] : false, [[Configurable]] : true }'),
  'lecture 6: the attributes of NaN and globalThis are written in clause 19');
  check(inOrder(f('sec-gettemplateobject'), ['Let realm be the current Realm Record', 'Let templateRegistry be realm. [[TemplateMap]]', 'If e. [[Site]] is the same Parse Node as templateLiteral, then Return e. [[Array]]', 'Perform ! SetIntegrityLevel (template, frozen)']),
    'lecture 6: GetTemplateObject finds the array by the place in the code in the TemplateMap of the current realm and freezes it');
  const ec = f('sec-execution-contexts');
  check(hasAll(ec, ['At any point in time, there is at most one execution context per agent that is actually executing code', 'The running execution context is always the top element of this stack',
    'A new execution context is created whenever control is transferred from the executable code associated with the currently running execution context to executable code that is not associated with that execution context',
    'code evaluation state', 'ScriptOrModule', 'LexicalEnvironment', 'VariableEnvironment', 'PrivateEnvironment', 'The Generator that this execution context is evaluating',
    'If the context is evaluating the code of a Script or Module, the value is null', 'some ECMAScript features require non-LIFO transitions of the running execution context',
    'It is impossible for ECMAScript code to directly access or observe an execution context']),
  'lecture 7, 9: 9.4 — one running context on top of the stack; tables 20–22; Function null for a script; non-LIFO transitions; a context cannot be observed');
  check(!spec.includes('id="sec-error.prototype.stack"') && !spec.includes('setTimeout') && !spec.includes('queueMicrotask'),
    'lecture 7, 12, 13: the 2026 text has no Error.prototype.stack, no setTimeout and no queueMicrotask');
  check(f('sec-isintailposition').includes('If IsStrict (call) is false, return false') && f('sec-preparefortailcall').includes('Discard all resources associated with the current execution context'),
    'lecture 9: a tail call is only for strict code (15.10.1); it discards the context of the caller (15.10.3)');
  check(inOrder(f('sec-resolvebinding'), ["Set env to the running execution context 's LexicalEnvironment", 'Let strict be IsStrict', 'Return ? GetIdentifierReference (env, name, strict)'])
    && ['sec-identifiers-runtime-semantics-evaluation', 'sec-let-and-const-declarations-runtime-semantics-evaluation', 'sec-variable-statement-runtime-semantics-evaluation', 'PropertyDestructuringAssignmentEvaluation', 'ForIn/OfBodyEvaluation']
      .every((c) => callers('ResolveBinding').includes(c)),
  `lecture 10: ResolveBinding — the LexicalEnvironment of the running context and GetIdentifierReference; called for names, let, const, var, destructuring, for heads ${JSON.stringify(callers('ResolveBinding'))}`);
  check(inOrder(f('sec-putvalue'), ['If IsUnresolvableReference (V) is true, then If V. [[Strict]] is true, throw a ReferenceError exception', 'Let globalObj be GetGlobalObject ()'])
    && f('sec-getglobalobject').includes('Let currentRealm be the current Realm Record. Return currentRealm. [[GlobalObject]]') && same(callers('GetGlobalObject'), ['PutValue']),
  `lecture 10: PutValue — ReferenceError in strict code, else the global object of the current realm; GetGlobalObject is called only by PutValue ${JSON.stringify(callers('GetGlobalObject'))}`);
  check(inOrder(f('sec-getthisenvironment'), ["Let env be the running execution context 's LexicalEnvironment", 'Repeat, Let exists be env. HasThisBinding ()', 'If exists is true, return env', 'Let outer be env. [[OuterEnv]]',
    'always terminate because the list of environments always ends with the global environment which has a this binding'])
    && f('sec-declarative-environment-records-hasthisbinding').includes('Return false') && f('sec-function-environment-records-hasthisbinding').includes('If envRec. [[ThisBindingStatus]] is lexical, return false. Return true')
    && f('sec-global-environment-records-hasthisbinding').includes('Return true') && f('sec-module-environment-records-hasthisbinding').includes('Return true')
    && f('sec-module-environment-records-getthisbinding').includes('Return undefined'),
  'lecture 11: GetThisEnvironment walks [[OuterEnv]] to the first record with this; a block — no, a function — no only for an arrow, global and module — yes, module this is undefined');
  check(f('sec-resolvethisbinding').includes('Let envRec be GetThisEnvironment (). Return ? envRec. GetThisBinding ()') && same(callers('ResolveThisBinding'), ['sec-this-keyword-runtime-semantics-evaluation'])
    && f('sec-function-environment-records-getthisbinding').includes('If envRec. [[ThisBindingStatus]] is uninitialized, throw a ReferenceError exception')
    && f('sec-getnewtarget').includes('Return envRec. [[NewTarget]]') && callers('GetThisEnvironment').includes('sec-super-keyword-runtime-semantics-evaluation'),
  `lecture 11: ResolveThisBinding — only the keyword this calls it; ReferenceError before super(); GetNewTarget — [[NewTarget]]; super walks the same way ${JSON.stringify(callers('ResolveThisBinding'))}`);
  const jobs = f('sec-jobs');
  check(hasAll(jobs, ['A Job is an Abstract Closure with no parameters that initiates an ECMAScript computation when no other ECMAScript computation is currently in progress',
    "when there is no running context in the agent for which the job is scheduled and that agent 's execution context stack is empty", 'after which the execution context stack must be empty',
    'Only one Job may be actively undergoing evaluation at any point in time in an agent', 'it must run to completion before evaluation of any other Job starts',
    'The Abstract Closure must return a normal completion, implementing its own handling of errors', 'web browsers and Node.js treat Promise-handling Jobs as a higher priority than other work',
    'HostEnqueueGenericJob, HostEnqueueFinalizationRegistryCleanupJob, HostEnqueuePromiseJob, and HostEnqueueTimeoutJob']),
  'lecture 12: 9.5 — an empty stack before and after, one job at a time and to the end, its own errors; note 1 — promise jobs higher; the four hooks');
  check(hasAll(f('sec-hostenqueuepromisejob'), ['Jobs must run in the same order as the HostEnqueuePromiseJob invocations that scheduled them', 'Let scriptOrModule be GetActiveScriptOrModule () at the time HostEnqueuePromiseJob is invoked',
    'The realm for Jobs returned by NewPromiseReactionJob is usually the result of calling GetFunctionRealm on the handler'])
    && ['PerformPromiseThen', 'TriggerPromiseReactions', 'CreateResolvingFunctions'].every((c) => realCallers('HostEnqueuePromiseJob').includes(c)),
  `lecture 12: 9.5.5 — the order, the active script or module, the realm of the handler; called by PerformPromiseThen, TriggerPromiseReactions and resolve ${JSON.stringify(realCallers('HostEnqueuePromiseJob'))}`);
  const generic = realCallers('HostEnqueueGenericJob'), timeout = realCallers('HostEnqueueTimeoutJob');
  check(same(generic, ['EnqueueResolveInAgentJob']) && same(timeout, ['EnqueueAtomicsWaitAsyncTimeoutJob'])
    && [...generic, ...timeout].every((op) => /^id="[^"]+"[^>]*> 25\.4\./.test(f(idOf(op)))) && f('sec-hostenqueuetimeoutjob').includes('to be performed after at least milliseconds milliseconds'),
  `lecture 12: HostEnqueueGenericJob and HostEnqueueTimeoutJob are called only from Atomics (25.4) ${JSON.stringify([...generic, ...timeout])}`);
  check(f('sec-hostmakejobcallback').includes('promise.then(thenAction) calls MakeJobCallback on thenAction at the time of invoking Promise.prototype.then, not at the time of scheduling the reaction Job')
    && f('sec-jobcallback-records').includes('uses the host-defined value to propagate the incumbent settings object')
    && f('sec-hostcalljobcallback').includes('It must perform and return the result of Call (jobCallback. [[Callback]], V, argumentsList)'),
  'lecture 12: HostMakeJobCallback at the time of then; HTML keeps its own data there; HostCallJobCallback must be a plain Call');
  const agents = f('sec-agents');
  check(hasAll(agents, ['An agent comprises a set of ECMAScript execution contexts, an execution context stack, a running execution context, an Agent Record, and an executing thread',
    'Except for the executing thread, the constituents of an agent belong exclusively to that agent', 'provided none of the agents sharing the thread have an Agent Record whose [[CanBlock]] field is true',
    'Some web browsers share a single executing thread across multiple unrelated tabs', '[[LittleEndian]]', '[[CanBlock]]', '[[Signifier]]', '[[IsLockFree1]]', '[[IsLockFree2]]', '[[IsLockFree8]]',
    '[[CandidateExecution]]', '[[KeptAlive]]', '[[ModuleAsyncEvaluationCount]]', 'There is no [[IsLockFree4]] field: 4-byte atomic operations are always lock-free',
    'representing the list of objects and/or symbols to be kept alive until the end of the current Job']),
  'lecture 14: 9.6 — what an agent is, the shared thread only without CanBlock, the note about tabs; the fields of table 24; no IsLockFree4');
  check(f('sec-agentsignifier').includes('Return AR. [[Signifier]]') && f('sec-agentcansuspend').includes('Return AR. [[CanBlock]]')
    && f('sec-agentcansuspend').includes("it may be reasonable to disallow suspending a document's main event handling thread, while still allowing workers' event handling threads to suspend")
    && same(callers('IncrementModuleAsyncEvaluationCount'), ['InnerModuleEvaluation']) && callers('AgentSignifier').includes('InitializeHostDefinedRealm'),
  'lecture 14: AgentSignifier, AgentCanSuspend and its note about windows and workers; the module counter is used by InnerModuleEvaluation; a realm takes the signifier');
  check(hasAll(f('sec-agent-clusters'), ['An agent cluster is a maximal set of agents that can communicate by operating on shared memory', 'Every agent belongs to exactly one agent cluster',
    'All agents within a cluster must have the same value for the [[LittleEndian]] field', 'All agents within a cluster must have the same values for the [[IsLockFree1]] field',
    'All agents within a cluster must have different values for the [[Signifier]] field', 'it must not leave some agents in the cluster active while other agents in the cluster are deactivated indefinitely',
    'Either terminate all the agents in the cluster'])
    && hasAll(f('sec-forward-progress'), ['An agent becomes blocked when its running execution context waits synchronously and indefinitely for an external event', "Only agents whose Agent Record 's [[CanBlock]] field is true can become blocked",
      'every unblocked agent with a dedicated executing thread eventually makes forward progress', 'in a set of agents that share an executing thread, one agent eventually makes forward progress',
      'an agent does not cause another agent to become blocked except via explicit APIs that provide blocking']),
  'lecture 15: 9.7 — shared memory, one cluster each, same LittleEndian and IsLockFree, other Signifier, no partial stop, terminate all; 9.8 — blocked, CanBlock, three guarantees');
  check(hasAll(f('sec-getactivescriptormodule'), ['Let ec be the topmost execution context on the execution context stack whose ScriptOrModule component is not null'])
    && ['EvaluateImportCall', 'sec-meta-properties-runtime-semantics-evaluation'].every((c) => callers('GetActiveScriptOrModule').includes(c)),
  'reference table: GetActiveScriptOrModule — the topmost context with a script or module; import() and import.meta use it');

  // what the lecture says about MDN
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const model = mdn('reference/execution_model');
  const factorial = model.slice(model.indexOf('function factorial'), model.indexOf('```', model.indexOf('function factorial')));
  check(hasAll(model, ['Each agent is analogous to a thread', '**Heap**', '**Queue**', '**Stack**', 'every `iframe` executes in a different realm, though it may be in the same agent as the parent window',
    'an array constructed in another realm will have a different prototype object', 'Currently, only Safari (JavaScriptCore) implements PTC', 'Each job is processed completely before any other job is processed',
    'Microtasks have higher priority', 'A good practice to follow is to make job processing short']) && factorial.includes('return factorial(n - 1, n * acc);') && !factorial.includes('use strict'),
  'lecture 1, 3, 9, 12: MDN — heap, queue, stack; an iframe is another realm in the same agent; only Safari has tail calls, its factorial is not strict; run-to-completion; microtasks first; short jobs');
  check(hasAll(model, ['_Similar-origin window agent_', '_Dedicated worker agent_', '_Shared worker agent_', '_Service worker agent_', '_Worklet agent_', 'usually a main document and its similar-origin iframes',
    'A `Window` object and a dedicated worker that it created.', 'A `Window` object and a service worker it created.',
    'A `Window` object A and the `Window` object of an `iframe` element that A created that cannot be same origin-domain with A.', 'In this case, all the agents in the cluster get terminated']),
  'lecture 14, 15: MDN — the agents of the web; a window with its dedicated worker is one cluster, with a service worker or a foreign frame — not; all agents of a cluster are terminated');
  const denied = mdn('reference/errors/property_access_denied');
  check(hasAll(denied, ['title: \'Error: Permission denied to access property "x"\'', 'DOMException: Blocked a frame with origin "x" from accessing a cross-origin frame. (Chromium-based)', 'DOMException: Permission denied to access property "x" on cross-origin object (Firefox)'])
    && !denied.includes('Failed to read a named property'),
  'lecture 15: MDN — the title is the text of Firefox, the text of Chromium has no "Failed to read a named property" in front');
  check(mdn('reference/global_objects/error/stack').includes('  - non-standard'), 'lecture 7: MDN — Error.prototype.stack is non-standard');
  check(model.includes('### Never blocking') && model.includes('some legacy exceptions exist like `alert()` or synchronous XHR'),
    'student homework 4: MDN — the section Never blocking names two legacy exceptions, alert() and synchronous XHR');

  // the days the lecture points to
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  check(read('intermediate/day-28/lecture.html').includes('Устройство цикла событий целиком описывает страница MDN «Execution model»') && read('advanced/day-01/lecture.html').includes('Хозяин и реализация'),
    'lecture 1: course 2 day 28 left the page Execution model to course 3; the host is day 1');
  check(read('advanced/day-04/lecture.html').includes('реалма (день 9)') && read('advanced/day-07/lecture.html').includes('реалм функции — день 9'),
    'lecture 4, 5: day 4 promised %Array% of the current realm, day 7 promised GetFunctionRealm');
  check(read('intermediate/day-26/lecture.html').includes('contentWindow.Error') && read('intermediate/day-26/lecture.html').includes('<strong>клеймо</strong>'),
    'lecture 2, 3: course 2 day 26 — an error from a frame and the brand of Error.isError');
  check(read('intermediate/day-03/lecture.html').includes('globalThis видит только var') && read('intermediate/day-03/lecture.html').includes('[[GlobalThisValue]]')
    && read('intermediate/day-02/lecture.html').includes('HasThisBinding') && read('intermediate/day-01/lecture.html').includes('GetIdentifierReference'),
  'lecture 2, 8, 10, 11: course 2 — two parts of the global record (day 3), HasThisBinding of an arrow (day 2), GetIdentifierReference (day 1)');
  check(read('intermediate/day-09/lecture.html').includes('<title>День 9 — Приватные элементы') && read('intermediate/day-12/lecture.html').includes('<title>День 12 — Генераторы')
    && read('intermediate/day-14/lecture.html').includes('WeakMap</title>') && read('intermediate/day-31/lecture.html').includes('берёт тот же объект модуля')
    && read('advanced/day-03/lecture.html').includes('тегированном') && read('intermediate/day-28/lecture.html').includes('Тело, разрезанное await'),
  'lecture 6, 7, 9, 16: course 2 — private names 9, generators 12, WeakMap 14, the same module 31, await 28; tagged templates — day 3');
  const rowsOf = (file, course) => fs.readFileSync(path.join(ROOT, `docs/coverage/${file}`), 'utf8').split('\n').map(csvLine);
  const spRows = rowsOf('ecma262.csv');
  const dayOf = (id) => { const r = spRows.find((c) => c[0] === id); return r ? `${r[6]}.${r[7]}` : '?'; };
  const days = { 'sec-environment-records': '2.1', 'sec-privateenvironment-records': '2.9', 'sec-promise-jobs': '2.28', 'sec-ordinaryhasinstance': '3.7', 'sec-getfunctionrealm': '3.7',
    'sec-template-literals': '3.10', 'sec-tail-position-calls': '3.12', 'sec-module-semantics': '3.13', 'sec-array-exotic-objects': '3.15', 'sec-dataview-objects': '3.21',
    'sec-atomics-object': '3.22', 'sec-memory-model': '3.23', 'sec-weakref-processing-model': '3.24' };
  const wrong = Object.entries(days).filter(([id, d]) => dayOf(id) !== d).map(([id]) => `${id}=${dayOf(id)}`);
  check(wrong.length === 0, `lecture: the days of the plan it names — environments, private names, promise jobs, templates, tail calls, modules, arrays, DataView, Atomics, memory, WeakRef ${wrong.join(', ') || ''}`);

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-09/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = spRows.filter((c) => c[6] === '3' && c[7] === '9').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 25 && refRows.length === 25 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 9, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const pages = rowsOf('mdn-javascript.csv').filter((c) => c[5] === '3' && c[6] === '9').map((c) => c[0]);
  const pagesMissing = pages.filter((p) => !refTable.includes(`https://developer.mozilla.org/en-US/docs/${p}"`));
  check(pages.length === 2 && pagesMissing.length === 0, `plan: ${pages.length} MDN pages of day 9 in the reference table, missing: ${pagesMissing.join(', ') || 'none'}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
