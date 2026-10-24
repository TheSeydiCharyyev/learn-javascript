// Course 2, day 26, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. A block whose first line is
// "// app.js" is a file instead: it is served as http://127.0.0.1:5500/app.js to a page that loads it, as Live Server
// would, and its console output must equal the <pre class="plain-out"> right after it, line by line — these are the
// stack traces of the day, with real line and column numbers. The context is Ashgabat + ru-RU, as on days 21–25.
//   node tools/runs/intermediate/day-26.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-26.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box (or a plain-out after a
// file block) equals its output; a lecture block with none of these is a problem; every EXPECT key is in exactly one
// block. Extra runs cover the claims of the prose: the counts and texts of the MDN error reference (read from the local
// mdn-content clone and the coverage map), the error table, the stack claims (a real mouse click, a timer, frame names,
// when the stack string is made), the three experiments of «Карточки», the notes, and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-26');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
const REV = '5a81c288fb72';
const COVERAGE = path.join(__dirname, '../../../docs/coverage/mdn-javascript.csv');
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.subtype !== 'date' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  // DevTools prints an error object as its stack; the day never prints one, so mark it for a failing check
  if (a.subtype === 'error') return `<error object ${a.description.split(LF)[0]}>`;
  if (a.subtype === 'regexp' || a.subtype === 'date') return a.description;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    const items = a.preview.properties.map((p) => (/^\d+$/.test(p.name) ? inner(p) : `${p.name}: ${inner(p)}`));
    return `${name === 'Array' ? '' : name}(${n}) [${items.join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');

// the MDN error reference, as the local clone of mdn-content has it
const git = (...args) => execFileSync('git', [`--git-dir=${GIT}`, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const mdnPage = (p) => git('show', `${REV}:files/en-us/web/javascript/${p}/index.md`);
const titleOf = (md) => md.match(/^title: (.*)$/m)[1].replace(/^(['"])(.*)\1$/, '$2');
const messageOf = (md) => md.split('## Message')[1].split('## Error type')[0].split(LF).filter((l) => l.trim() && !l.startsWith('```'));
const csv = (text) => {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === LF) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};

const EXPECT = {
  // lecture
  'throw new ValidationError("оценка 9 вне диапазона 2–5", "mark");': ['true true ValidationError mark ValidationError: оценка 9 вне диапазона 2–5'],
  'const lessons = undefined;': ["TypeError | Cannot read properties of undefined (reading 'length')"],
  'const e = new Error("Malformed input");': ["ParseError: Malformed input (1) ['name']"],
  'const e1 = new Error("fatal error");': ['"Error: fatal error" "Error: fatal error" "fatal error" "" "hello"'],
  'console.log("до ошибки");': ["! Unexpected token ';'"],
  'document.querySelector("[");': ['SyntaxError false DOMException true'],
  'readDeck("{word: \'book\'}");': ['Error: колода не прочитана ← SyntaxError true'],
  '"cause" in new Error("x", "строка")': ['false false false true 0'],
  'function checkMarks(marks) {': ['в табеле есть оценки вне 2–5 | BadMark (2) [9, 0]'],
  'class NoName extends Error {}': ['Error Error: x NoName true'],
  'const d = Object.getOwnPropertyDescriptor(new Error("x"), "stack");': ['function function false false'],
  'function down(n) {': ['(3) [10, 3, 0]'],
  // tasks
  'class AppError extends Error {\n  constructor(message) {': ['ошибка программы: Error: нет имени', 'ошибка программы: Error: настройки не сохранены false', 'неизвестно'],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext(MAIN);
  let appjs = '';
  await ctx.route('http://day.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  await ctx.route('http://127.0.0.1:5500/**', (r) => (r.request().url().endsWith('/app.js')
    ? r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: appjs })
    : r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body><script src="app.js"></script></body>' })));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  const listen = async (p, out) => {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
  };
  const runOnPage = async (scripts) => {
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    await listen(p, out);
    for (const code of scripts) {
      await p.addScriptTag({ content: code }).catch((e) => {
        const line = `! ${clean(e.message.split(LF)[0])}`;
        if (out.at(-1) !== line) out.push(line);
      });
    }
    await p.waitForTimeout(80);
    await p.close();
    return out;
  };
  // a file of the day, as Live Server serves it; a click, when asked, is a real mouse click
  const runFile = async (code, { click = false } = {}) => {
    appjs = code;
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${e.message}`));
    await listen(p, out);
    await p.goto('http://127.0.0.1:5500/index.html');
    if (click) await p.click('button');
    await p.waitForTimeout(80);
    await p.close();
    return out.join(LF).split(LF);
  };

  const all = {};
  for (const name of PAGES) {
    const src = await ctx.newPage();
    await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
    const blocks = await src.evaluate(() => [...document.querySelectorAll('pre.code.js')].map((pre) => {
      const next = pre.nextElementSibling;
      return {
        code: pre.textContent,
        box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
        plain: next && next.matches('pre.plain-out') ? next.textContent.split('\n') : null,
        cheat: !!pre.closest('.cheatsheet'),
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);
    for (const [i, blk] of blocks.entries()) {
      const first = blk.code.split(LF)[0];
      const isFile = first === '// app.js';
      const out = isFile ? await runFile(blk.code) : await runOnPage([blk.code]);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}${isFile ? ' (app.js)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      check(!out.some((l) => l.startsWith('<error object')), `${name} #${i}: no error object printed`);
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (isFile) {
        check(!!blk.plain && same(out, blk.plain), `${name} #${i} (app.js): plain-out = output (${out.length} lines)${blk.plain && same(out, blk.plain) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.plain)}`}`);
        continue;
      }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)${same(out, blk.box) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(blk.box)}`}`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const tasks = fs.readFileSync(path.join(DAY, 'tasks.html'), 'utf8');

  // lecture 2: the MDN error reference — pages, kinds, courses, how a page is built
  {
    const files = git('ls-tree', '--name-only', REV, 'files/en-us/web/javascript/reference/errors/').trim().split(LF).filter((f) => !f.endsWith('index.md'));
    const titles = files.map((f) => titleOf(mdnPage(f.replace('files/en-us/web/javascript/', ''))));
    const kinds = {};
    for (const t of titles) { const k = t.split(':')[0]; kinds[k] = (kinds[k] ?? 0) + 1; }
    const rest = titles.length - kinds.SyntaxError - kinds.TypeError - kinds.RangeError - kinds.ReferenceError;
    check(titles.length === 131 && kinds.SyntaxError === 72 && kinds.TypeError === 37 && kinds.RangeError === 11 && kinds.ReferenceError === 5 && rest === 6 && kinds.Warning === 2 && kinds.URIError === 1 && kinds.InternalError === 1 && kinds.AggregateError === 1 && kinds.Error === 1,
      `lecture 2: 131 pages, 72/37/11/5 and 6 others: ${titles.length} ${JSON.stringify(kinds)}`);
    const rows = csv(fs.readFileSync(COVERAGE, 'utf8')).filter((r) => r.path && r.path.startsWith('Web/JavaScript/Reference/Errors/'));
    const byCourse = (c) => rows.filter((r) => r.course === c).length;
    check(rows.length === 131 && byCourse('1') === 53 && byCourse('2') === 75 && byCourse('') === 3, `lecture 2: 53 in Essentials, 75 in course 2, 3 left: ${rows.length} ${byCourse('1')} ${byCourse('2')} ${byCourse('')}`);
    for (const t of ['Unexpected token', 'missing ) after argument list', "'x' is not iterable", 'invalid assignment to const "x"', 'invalid array length', 'BigInt division by zero', '"x" is not defined']) {
      check(titles.some((x) => x.endsWith(`: ${t}`)), `lecture 2: a page titled «…: ${t}»`);
    }
    const sample = mdnPage('reference/errors/not_defined');
    check(['## Message', '## Error type', '## What went wrong?', '## Examples', 'example-bad', 'example-good'].every((s) => sample.includes(s)), 'lecture 2: a page has Message, Error type, What went wrong?, Examples with bad and good code');
    const index = mdnPage('reference/errors');
    check(index.includes('Errors displayed in the Web console may include a link to the corresponding page') && index.includes('Together, these two properties provide a starting point'), 'lecture 2: the index promises a console link and calls name + message a starting point');
    const v8 = "TypeError: Cannot read properties of undefined (reading 'x') (V8-based)";
    const withV8 = files.filter((f) => messageOf(mdnPage(f.replace('files/en-us/web/javascript/', ''))).includes(v8)).map((f) => f.split('/').at(-1));
    check(same(withV8, ['no_properties', 'unexpected_type']), `lecture 2 and task 2: "Cannot read properties of undefined" is on two pages: ${withV8}`);
    check(titleOf(mdnPage('reference/errors/unexpected_type')) === 'TypeError: "x" is (not) "y"' && titleOf(mdnPage('reference/errors/no_properties')) === 'TypeError: null/undefined has no properties', 'lecture 2 and task 2: the titles of the two pages');
    const json = mdnPage('reference/errors/json_bad_parse');
    check(titleOf(json) === 'SyntaxError: JSON.parse: bad parsing' && messageOf(json).length === 31 && messageOf(json).every((l) => l.startsWith('SyntaxError: JSON.parse: ')) && !json.includes('Unexpected end of JSON input'), `lecture 2 and task 2: JSON.parse page lists 31 Firefox texts and no V8 text (${messageOf(json).length})`);
    const pages = {
      invalid_const_assignment: ['TypeError: invalid assignment to const "x"', 'TypeError: Assignment to constant variable. (V8-based)'],
      is_not_iterable: ["TypeError: 'x' is not iterable", 'TypeError: x is not iterable (V8-based & Firefox)'],
      too_much_recursion: ['InternalError: too much recursion', 'RangeError: Maximum call stack size exceeded (Chrome)'],
    };
    for (const [file, [title, line]] of Object.entries(pages)) {
      const md = mdnPage(`reference/errors/${file}`);
      check(titleOf(md) === title && messageOf(md).includes(line), `task 2: «${title}» lists «${line}»`);
    }
  }
  // lecture 3, 5, 8, 13: what the prose says the MDN pages say
  {
    const has = (p, s) => mdnPage(`reference/global_objects/${p}`).includes(s);
    check(has('error/error', 'avoids ambiguity with the other non-standard `Error(message, fileName, lineNumber)` signature'), 'lecture 8: a string as options — the old fileName signature');
    check(has('rangeerror', 'cabbage') && has('rangeerror', '"apple", "banana", or "carrot"'), 'lecture 5: RangeError for a value not in a list of strings');
    check(has('error/cause', 'you can instead provide the cause as structured data') && has('error', 'you should prefer to use error cause to discriminate between different errors'), 'lecture 8: structured cause; libraries should not make users parse message');
    check(has('error/stack', "In Chrome and Safari, it's a data property") && has('error/stack', 'looking to standardize it') && has('error/stack', 'promise handlers all begin their own call chain'), 'lecture 13: the page calls stack a data property in Chrome, not standard yet, promise handlers start a chain');
    check(has('error/capturestacktrace', 'Avoid MyError itself in the stack trace') && has('error/stacktracelimit', 'Error.stackTraceLimit = 2'), 'lecture 14: the examples of captureStackTrace and stackTraceLimit');
    check(has('error', 'super(message, options);') && has('error', 'Need to pass `options` as the second parameter'), 'lecture 11: MyError passes options to super');
    check(has('error/iserror', 'Normalizing caught errors') && has('error/iserror', 'branded check'), 'lecture 12: isError is a branded check; normalizing caught values');
  }

  // lecture 3: Error without new, message to string
  await extra('console.log(String(Error(42)), Object.getPrototypeOf(Error("a")) === Error.prototype, new Error(null).message, Error.length);', ['Error: 42 true null 1'], 'lecture 3: Error() without new, message through ToString');
  // lecture 6: Temporal throws RangeError on a bad string; eval and new Function throw a catchable SyntaxError; strict assignment
  await extra(errOf('Temporal.PlainDate.from("abc")'), ['RangeError Temporal error: Invalid character while parsing year value.'], 'lecture 6: Temporal on an unreadable string — RangeError');
  await extra(errOf('new Function("a b")'), ["SyntaxError Unexpected identifier 'b'"], 'lecture 6: new Function — a SyntaxError that catch sees');
  await extra(errOf('eval("hoo bar")'), ["SyntaxError Unexpected identifier 'bar'"], 'lecture 6: eval — a SyntaxError that catch sees');
  await extra('"use strict";\ntry { undeclaredTotal = 1; } catch (e) { console.log(e.name, e.message); }', ['ReferenceError undeclaredTotal is not defined'], 'lecture 6: strict mode, assignment to an undeclared name');
  // lecture 7: the six NativeError constructors
  await extra('for (const E of [TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError]) console.log(E.name, E("x") instanceof E, E.length, Object.getPrototypeOf(E) === Error, Object.hasOwn(E.prototype, "name"), E.prototype.message === "", new E("m", { cause: 1 }).cause);',
    ['TypeError true 1 true true true 1', 'RangeError true 1 true true true 1', 'SyntaxError true 1 true true true 1', 'ReferenceError true 1 true true true 1', 'EvalError true 1 true true true 1', 'URIError true 1 true true true 1'], 'lecture 7: one shape for the six kinds');
  // lecture 12: causes() with Error.isError goes through errors of another window, with instanceof it stops
  await extra(`function* causes(err) { yield err; if (Error.isError(err) && "cause" in err) yield* causes(err.cause); }
function* old(err) { yield err; if (err instanceof Error && "cause" in err) yield* old(err.cause); }
document.body.innerHTML = "<iframe></iframe>";
const FE = document.querySelector("iframe").contentWindow.Error;
const e = new Error("верх", { cause: new FE("рамка", { cause: new FE("низ") }) });
console.log([...causes(e)].length, [...old(e)].length, typeof Error.isError);`, ['3 2 function'], 'lecture 12: the chain does not break on an error of another window');
  check(typeof Error.isError === 'undefined' && process.version.startsWith('v22.'), `lecture 12: Node 22 has no Error.isError (${process.version}: ${typeof Error.isError})`);
  // lecture 13: the stack demo with a real mouse click ends at the handler
  {
    const demo = all.lecture.find((x) => x.code.includes('function translationOf(card) {'));
    const noClick = demo.code.replace(/\ndocument\.querySelector\("button"\)\.click\(\);\s*$/, '');
    check(noClick !== demo.code, 'lecture 13: the demo without its click() line');
    const out = await runFile(noClick, { click: true });
    check(same(out, demo.plain.slice(0, -1)), `lecture 13: a real click — the same stack without its last line: ${JSON.stringify(out)}`);
    const num = (s) => Number(s);
    const at = demo.plain.map((l) => l.match(/app\.js:(\d+):\d+/)).filter(Boolean).map((m) => num(m[1]));
    check(same(at, [4, 7, 7, 12, 17]), `lecture 13: the prose names lines 4, 7, 7 and 17: ${at}`);
    check(lecture.includes('строка 4; её') && lecture.includes('стрелка из строки 7') && lecture.includes('в строке 17'), 'lecture 13: the line numbers in the prose');
  }
  await extra('setTimeout(() => console.log((new Error("t").stack.match(/ at /g) ?? []).length), 0);', ['1'], 'lecture 13: a timer starts its own chain — one frame');
  {
    const out = await runFile(`const frameOf = (e, n = 1) => e.stack.split(String.fromCharCode(10))[n].trim().split(" (")[0];
class Journal {
  constructor() { this.frame = frameOf(new Error("c")); }
  get average() { return frameOf(new Error("g")); }
}
const obj = { show() { return frameOf(new Error("s")); } };
function* gen() { yield frameOf(new Error("y"), 2); }
const evalLine = eval("new Error('e')").stack.split(String.fromCharCode(10))[1];
document.body.innerHTML = "<button>x</button>";
const frames = [new Journal().frame, new Journal().average, obj.show(), gen().next().value, frameOf({ stack: evalLine }, 0), evalLine.includes("eval at")];
document.querySelector("button").addEventListener("click", () => console.log([...frames, frameOf(new Error("h"))].join(" | ")));
document.querySelector("button").click();`);
    check(same(out, ['at new Journal | at get average | at Object.show | at gen.next | at eval | true | at HTMLButtonElement.<anonymous>']), `lecture 13: the frame names of the table: ${JSON.stringify(out)}`);
  }
  {
    const out = await runFile(`class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}
function make() { return new ValidationError("m"); }
const late = new Error("y");
late.stack;
late.name = "Late";
console.log(make().stack, late.stack.split(String.fromCharCode(10))[0], String(late));`);
    check(out[0] === 'ValidationError: m' && out[1].startsWith('    at make (') && !out.join(LF).includes('new ValidationError') && out.at(-1).endsWith('Error: y Late: y'),
      `lecture 13–14: name set in the constructor is in the stack; no frame of the constructor; a later name is not: ${JSON.stringify(out)}`);
  }
  await extra('window.addEventListener("error", (event) => console.log(event.message));\nsetTimeout(() => { throw new RangeError("x"); }, 0);', ['Uncaught RangeError: x', '! x'], 'lecture 13: an uncaught error starts with «Uncaught»');
  // lecture 14: captureStackTrace on a plain object, the Firefox-only properties
  await extra('const o = {};\nError.captureStackTrace(o);\nconst e = new Error("x");\nconsole.log(typeof o.stack, Error.isError(o), e.fileName, e.lineNumber, e.columnNumber, Error.stackTraceLimit);', ['string false undefined undefined undefined 10'], 'lecture 14: a stack on a plain object; fileName, lineNumber, columnNumber are undefined; the default limit');
  // lecture 15: the error table, row by row
  for (const [expr, want] of [
    ['(class C extends Error { constructor(m) { this.x = 1; super(m); } }, new (class C extends Error { constructor(m) { this.x = 1; super(m); } })("x"))', "ReferenceError Must call super constructor in derived class before accessing 'this' or returning from derived constructor"],
    ['new Error(Symbol("s"))', 'TypeError Cannot convert a Symbol value to a string'],
    ['Error.prototype.toString.call(5)', 'TypeError Method Error.prototype.toString called on incompatible receiver 5'],
    ['Error.captureStackTrace(5)', 'TypeError invalid_argument'],
    ['(class A extends Error.prototype {})', 'TypeError Class extends value Error is not a constructor or null'],
  ]) await extra(errOf(expr), [want], `lecture 15: ${expr.slice(0, 70)}`);
  await extra('try { 1; }', ['! Missing catch or finally after try'], 'lecture 15: try without catch and finally');
  await extra('console.log("a");\nthrow\nnew Error("x");', ['! Illegal newline after throw'], 'lecture 15: a line break after throw');
  await extra('try { 1; } catch (e) { let e = 2; }', ["! Identifier 'e' has already been declared"], 'lecture 15: let with the name of the catch parameter');
  await extra('function g() { try { throw new Error("первая"); } finally { throw new Error("вторая"); } }\ntry { g(); } catch (e) { console.log(e.message, e.cause); }', ['вторая undefined'], 'lecture 15: throw in finally loses the first error');
  // lecture 16: the prototype is not an error and cannot be replaced
  await extra('const d = Object.getOwnPropertyDescriptor(Error, "prototype");\nconsole.log(d.writable, d.enumerable, d.configurable, Object.prototype.toString.call(Error.prototype), Object.hasOwn(Error.prototype, "stack"));', ['false false false [object Object] false'], 'lecture 16: Error.prototype is fixed and is not an error');
  // lecture 17: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'class CardsError extends Error {');
    const program = cards.split('\nfor (const text of texts) {')[0];
    check(program !== cards, 'lecture 17: the program without its loop');
    const lines = `${program}\nconsole.log(texts.map((t) => { try { return start(t); } catch (e) { return String(e); } }).join(" | "));`;
    const noOptions = lines.replace('super(message, options);\n    this.name = new.target.name;', 'super(message);\n    this.name = new.target.name;');
    check(noOptions !== lines, 'lecture 17, experiment 1: options removed from super in CardsError');
    await extra(noOptions, ["колода: 2 карточки | карточка 2: у «suw» нет перевода | файл колоды повреждён | в файле не список карточек | TypeError: Cannot read properties of null (reading 'word')"], 'lecture 17, experiment 1: the third line lost its cause');
    const generalFirst = lines.replace('    if (e instanceof CardError) return', '    if (e instanceof CardsError) return e.message;\n    if (e instanceof CardError) return');
    check(generalFirst !== lines, 'lecture 17, experiment 2: CardsError checked first');
    await extra(generalFirst, ["колода: 2 карточки | у «suw» нет перевода | файл колоды повреждён | в файле не список карточек | TypeError: Cannot read properties of null (reading 'word')"], 'lecture 17, experiment 2: lines 2 and 3 lost their details');
    const hole = lines.replace('  data.forEach((card, i) => {\n', '  data.forEach((card, i) => {\n    if (typeof card !== "object" || card === null) throw new CardError("не карточка", i);\n');
    check(hole !== lines, 'lecture 17, experiment 3: the hole closed');
    await extra(hole, ['колода: 2 карточки | карточка 2: у «suw» нет перевода | файл колоды повреждён: Unexpected end of JSON input | в файле не список карточек | карточка 1: не карточка'], 'lecture 17, experiment 3: the fifth line');
  }
  // notes: the comments of the two blocks
  await extra('console.log(String(new RangeError("оценка 9")), JSON.stringify(new Error("x")), "cause" in new Error("x", { cause: undefined }), Error.isError(Object.create(Error.prototype)), typeof new Error("где я").stack, Object.hasOwn(new Error("колода пуста", { cause: "no-cards" }), "cause"));',
    ['RangeError: оценка 9 {} true false string true'], 'notes: the main block');
  await extra(`${find('student', 'class ValidationError extends AppError {}')}\nconsole.log(String(new ValidationError("нет имени")));`, ['ValidationError: нет имени'], 'notes: the class template');

  // task 1
  await extra(`const err = (f) => { try { return String(f()); } catch (e) { return e.name; } };
console.log([
  () => String(new RangeError("оценка 9")),
  () => \`\${new TypeError().message === ""} \${Object.hasOwn(new TypeError(), "message")}\`,
  () => Error("x") instanceof Error,
  () => JSON.stringify(new Error("x")),
  () => "cause" in new Error("x", { cause: undefined }),
  () => Error.isError({ __proto__: Error.prototype }),
  () => new SyntaxError("x") instanceof TypeError,
  () => typeof InternalError,
].map(err).join(" | "));`, ['RangeError: оценка 9 | true false | true | {} | true | false | false | undefined'], 'task 1: the eight answers');
  // task 3: Сапар is not in marks
  {
    const code = find('tasks', 'const marks = { Аман: [5, 4], Мерет: [] };');
    const sapar = code.replace('report(["Аман", "Мерет"])', 'report(["Аман", "Сапар"])');
    check(sapar !== code, 'task 3: Сапар instead of Мерет');
    const out = await runFile(sapar);
    check(out[0] === "TypeError: Cannot read properties of undefined (reading 'length')", `task 3: with Сапар — ${out[0]}`);
  }
  // task 4
  await extra(`class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }
}
const GROUPS = ["JS-1", "JS-2"];
function checkStudent(data) {
  if (typeof data.name !== "string" || data.name.trim() === "") throw new ValidationError("нужно имя", "name", data.name);
  if (!Number.isInteger(data.age) || data.age < 14 || data.age > 60) throw new ValidationError(\`возраст \${data.age} вне диапазона 14–60\`, "age", data.age);
  if (!GROUPS.includes(data.group)) throw new ValidationError(\`группы \${data.group} нет: есть \${GROUPS.join(", ")}\`, "group", data.group);
  return data;
}
function form(data) {
  try {
    return checkStudent(data) === data ? "принят" : "?";
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return \`\${e.field}: \${e.message}\`;
  }
}
const out = [{ name: "Аман", age: 17, group: "JS-1" }, { name: "", age: 17, group: "JS-1" }, { name: "Мерет", age: 9, group: "JS-1" }, { name: "Сапар", age: 20, group: "PY-1" }].map(form);
let e;
try { checkStudent({ name: "Мерет", age: 9, group: "JS-1" }); } catch (x) { e = x; }
let rethrown;
try { form(null); } catch (x) { rethrown = x.name; }
console.log(out.join(" | "));
console.log(String(e), e instanceof Error, Error.isError(e), e.value, JSON.stringify(e), rethrown);`,
  ['принят | name: нужно имя | age: возраст 9 вне диапазона 14–60 | group: группы PY-1 нет: есть JS-1, JS-2', 'ValidationError: возраст 9 вне диапазона 14–60 true true 9 {"name":"ValidationError","field":"age","value":9} TypeError'], 'task 4: the numbers of the criteria');
  // task 5
  const APP = `class AppError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}`;
  await extra(`${APP}
class ValidationError extends AppError {
  constructor(message, field, options) {
    super(message, options);
    this.field = field;
  }
}
class NotFoundError extends AppError {}
function handle(e) {
  if (e instanceof ValidationError) return \`Проверьте поле «\${e.field}»\`;
  if (e instanceof NotFoundError) return \`Не найдено: \${e.message}\`;
  if (e instanceof AppError) return \`Ошибка программы: \${e.message}\`;
  throw e;
}
const t = new TypeError("t");
let thrown;
try { handle(t); } catch (x) { thrown = x === t; }
console.log([new ValidationError("возраст 9", "age"), new NotFoundError("слово «kitap»"), new AppError("колода пуста")].map(handle).join(" | "));
console.log(new NotFoundError("x").stack.startsWith("NotFoundError: x"), new AppError("y", { cause: 1 }).cause, new NotFoundError("z", { cause: 2 }).cause, new ValidationError("v", "f", { cause: 3 }).cause, thrown);`,
  ['Проверьте поле «age» | Не найдено: слово «kitap» | Ошибка программы: колода пуста', 'true 1 2 3 true'], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`${APP}
function readSettings(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AppError("настройки не прочитаны", { cause: err });
  }
}
function startApp(text) {
  try {
    return readSettings(text);
  } catch (err) {
    throw new AppError("программа не запущена", { cause: err });
  }
}
function explain(e) {
  const parts = [String(e)];
  while (Error.isError(e) && "cause" in e) {
    e = e.cause;
    parts.push(String(e));
  }
  return parts.join(" ← ");
}
let chain;
try { startApp(""); } catch (e) { chain = explain(e); }
console.log(JSON.stringify(startApp('{"theme": "dark"}')), "|", chain);
console.log(explain(new AppError("x", { cause: "нет файла" })), "|", explain(new Error("один")));`,
  ['{"theme":"dark"} | AppError: программа не запущена ← AppError: настройки не прочитаны ← SyntaxError: Unexpected end of JSON input', 'AppError: x ← нет файла | Error: один'], 'task 6: the numbers of the criteria');
  // task 7
  await extra(`function toError(value) {
  if (Error.isError(value)) return value;
  if (typeof value === "object" && value !== null && typeof value.message === "string") return new Error(value.message, { cause: value });
  return new Error(String(value), { cause: value });
}
const byInstanceof = (value) => (value instanceof Error ? value : new Error(String(value), { cause: value }));
document.body.innerHTML = "<iframe></iframe>";
const frameError = new (document.querySelector("iframe").contentWindow.Error)("из рамки");
const r = new RangeError("r");
const obj = { message: "нет сети", code: 503 };
const s = toError("нет сети");
const o = toError(obj);
console.log(toError(r) === r, s.message, s.cause, o.message, o.cause === obj, toError(404).message, toError(frameError) === frameError, byInstanceof(frameError) === frameError);`,
  ['true нет сети нет сети нет сети true 404 true false'], 'task 7: the numbers of the criteria');
  // task 8: in a file, so that the top level has a frame of its own
  {
    const out = await runFile(`function where() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 1;
  const obj = {};
  Error.captureStackTrace(obj, where);
  Error.stackTraceLimit = limit;
  const m = obj.stack.match(/at (\\S+) \\(/);
  return m ? m[1] : "верхний уровень";
}
function lesson() { return where(); }
const journal = { show() { return where(); } };
class Journal { render() { return where(); } }
console.log(lesson(), journal.show(), new Journal().render(), where(), Error.stackTraceLimit);`);
    check(same(out, ['lesson Object.show Journal.render верхний уровень 10']), `task 8: the numbers of the criteria: ${JSON.stringify(out)}`);
  }
  // task 9: the four fixes
  {
    const code = find('tasks', 'function save(text) {');
    const fixed = code
      .replace('  constructor(message) {\n    super(message);\n  }', '  constructor(message, options) {\n    super(message, options);\n    this.name = new.target.name;\n  }')
      .replace('  if (e instanceof AppError) return `ошибка программы: ${String(e)}`;\n  if (e instanceof ValidationError) return `поле ${e.field}`;\n  return "неизвестно";',
        '  if (e instanceof ValidationError) return `поле ${e.field}`;\n  if (e instanceof AppError) return `ошибка программы: ${String(e)}`;\n  throw e;')
      .replace('console.log(handle(new TypeError("опечатка")));', 'try { handle(new TypeError("опечатка")); } catch (e) { console.log("брошена:", String(e)); }');
    check(fixed.split('throw e;').length === 2 && fixed.includes('this.name = new.target.name') && fixed.includes('брошена'), 'task 9: the fixes applied');
    await extra(fixed, ['поле name', 'ошибка программы: AppError: настройки не сохранены true', 'брошена: TypeError: опечатка'], 'task 9: after the fixes');
  }
  check(tasks.includes('«ошибка программы: Error: нет имени»') && tasks.includes('«поле name»'), 'task 9: the criteria quote the output');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
