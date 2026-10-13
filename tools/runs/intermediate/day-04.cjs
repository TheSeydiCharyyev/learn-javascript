// Course 2, day 4, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it; an uncaught error is "! message" (V8 text; the prefix that
// Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-04.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-04.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; extra runs cover the toString text, task 5 (delete name), task 7 (Fibonacci numbers and calls),
// task 8 (the log line of a reference "logged") and task 9 without its first line.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-04');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') {
    const items = a.preview.properties.map((p) => (p.type === 'string' ? q(p.value) : p.value));
    return `(${a.description.match(/\d+/)[0]}) [${items.join(', ')}]`;
  }
  return String(a.value ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');
const STRICT_CALLEE = "! 'caller', 'callee', and 'arguments' properties may not be accessed on strict mode functions or the arguments objects for calls to them";

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'console.log(greet instanceof Object);': ['function', 'true', 'greet 1'],
  'console.log(greet.name, sum.name, add.name, named.name);': ['greet sum add inner', 'show go', 'bound greet', '""'],
  'const samples = [': ['(7) [2, 1, 0, 1, 0, 1, 2]'],
  'function run(check) {': ['проверено: слово', 'проверено подробно: слово'],
  'console.log(greet.name);   // greet — запись молча не сработала': ['greet'],
  "// TypeError: Cannot assign to read only property 'name'": ["! Cannot assign to read only property 'name' of function 'function greet() {}'"],
  'console.log(Object.keys(greet));': ['2', "(1) ['calls']"],
  'function show() {': ['object false', '2 a undefined', 'перебор: a', 'перебор: b'],
  'function toArray() {': ['(3) [Array(2), Array(2), Array(2)]'],
  'console.log(sloppy(1), strict(1));   // 99 1': ['99 1'],
  'function withDefault(a = 0) {': ['1'],
  'return arguments.callee;': [STRICT_CALLEE],
  'const inner = () => arguments.length;   // arguments функции outer': ['1'],
  'const plus = new Function("a", "b", "return a + b");': ['5', 'anonymous', '7'],
  'const f = new Function("return typeof secret");': ['undefined'],
  '// SyntaxError: Illegal return statement': ['! Illegal return statement'],
  'const start = once((topic) => {': ['старт: еда', 'еда', 'еда'],
  'const fastSquare = memo(square);': ['16 16 25', '2', '"" square'],
  'const search = debounce(': ['ищем: wat'],
  // tasks
  'console.log(first.name, second.name, third.name, fourth.name);': ['first second third inner', 'fifth sixth bound first anonymous'],
  'function (a, b, c) {}.length,': ['3 1 0 2 2 1'],
  'console.log(total(5, 4, 3));': ['12'],
  'console.log(wrap(1, 2, 3, 4));': ['4'],
  'console.log(fib(10), fib.calls);': ['55 177'],
  'const level = "весь скрипт";': ["(2) ['функция test', 'весь скрипт']"],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };

  // runs scripts one after another on one fresh page; returns console lines and errors
  const runOnPage = async (scripts) => {
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    for (const code of scripts) await p.addScriptTag({ content: code }).catch((e) => out.push(`! ${clean(e.message.split('\n')[0])}`));
    await p.waitForTimeout(scripts.some((c) => c.includes('setTimeout')) ? 500 : 80);
    await p.close();
    return out;
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
        cheat: !!pre.closest('.cheatsheet'),
        example: !!pre.closest('.example'),
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const out = await runOnPage([blk.code]);
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}${blk.example ? ' (example)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) continue; // examples call the student's function — checked below with a reference one
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(JSON.stringify(out) === JSON.stringify(EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;

  // lecture, section 10: toString gives the source with its comment; built-in and bound functions have none
  {
    const out = await runOnPage([find('lecture', 'console.log(greet.toString());')]);
    check(out[0].startsWith('function greet(student) {') && out[0].includes('// приветствие') && out[0].split('\n').length === 4,
      `lecture 10: toString is the whole source, 4 lines with the comment: ${JSON.stringify(out[0])}`);
    check(out[1] === 'function max() { [native code] }' && out[2] === 'function () { [native code] }', `lecture 10: ${out[1]} | ${out[2]}`);
  }
  // task 5: delete greet.name works (configurable) and the name falls back to the empty one of Function.prototype
  {
    const out = await runOnPage(['function greet() {}\nconsole.log(delete greet.name, JSON.stringify(greet.name));']);
    check(out[0] === 'true ""', `task 5: delete greet.name → ${out[0]}`);
  }
  // task 7: the numbers and the calls of the criteria
  {
    const fib = find('tasks', 'console.log(fib(10), fib.calls);').replace('console.log(fib(10), fib.calls);', '');
    const out = await runOnPage([`${fib}
fib.calls = 0;
const slow = fib(20);
const slowCalls = fib.calls;
function memo(fn) {
  const cache = {};
  return function (key) {
    if (!Object.hasOwn(cache, key)) {
      cache[key] = fn.call(this, key);
    }
    return cache[key];
  };
}
let real = 0;
const fastFib = memo(function (n) { real = real + 1; return n < 2 ? n : fastFib(n - 1) + fastFib(n - 2); });
const fast = fastFib(20);
const fastCalls = real;
real = 0;
const thirty = fastFib(30);
const kind = memo((x) => typeof x);
console.log(slow, slowCalls, fast, fastCalls, thirty, real, kind(1), kind("1"));`]);
    check(out[0] === '6765 21891 6765 21 832040 10 number number', `task 7: fib(20), calls, fastFib(20), calls, fastFib(30), new calls, the key hole: ${out[0]}`);
  }
  // task 8: the log line of the example, with a reference logged
  {
    const ex = find('tasks', 'const greet = logged(');
    const said = ex.match(/в консоли: (.*)$/m)[1];
    const out = await runOnPage([`function logged(fn) {
  return function (...args) {
    const result = fn.apply(this, args);
    console.log(\`\${fn.name}(\${args.map((a) => JSON.stringify(a)).join(", ")}) → \${JSON.stringify(result)}\`);
    return result;
  };
}
${ex}`]);
    check(out[0] === said, `task 8: the log line "${out[0]}", the example says "${said}"`);
  }
  // task 9 without its first line
  {
    const code = find('tasks', 'const level = "весь скрипт";').replace('const level = "весь скрипт";\n', '');
    const out = await runOnPage([code]);
    check(out[0] === '! level is not defined', `task 9 without the first line: ${out[0]}`);
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
