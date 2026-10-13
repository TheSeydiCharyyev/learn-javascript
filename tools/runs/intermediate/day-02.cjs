// Course 2, day 2, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin, so localStorage works), the way a student would paste it.
// Console output is rebuilt from Chrome's preview objects, as DevTools prints it: "(2) [5, 3]", strings in arrays
// in single quotes. Uncaught errors are printed with their V8 message, after "! ".
//   node tools/runs/intermediate/day-02.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-02.cjs --quiet    only the checks
// Checks: the output of a lecture block equals EXPECT for its first line (EXPECT_FULL: for a line it contains);
// a result-box right after a block equals its output; every "expression;   // value" line of a task example
// gives that value with the reference solution in SOLUTIONS. A block that goes on from the one before it
// (PRELUDE) runs after that block's code.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-02');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'array') {
    const items = a.preview.properties.map((p) => (p.type === 'string' ? q(p.value) : p.value));
    return `(${a.description.match(/\d+/)[0]}) [${items.join(', ')}]`;
  }
  if (a.type === 'object' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${p.type === 'string' ? q(p.value) : p.value}`).join(', ')}}`;
  return String(a.value ?? a.description);
};

// expected output (console lines, then "! message" for an uncaught error) by the first line of a block
const EXPECT = {
  'const group = {': ['2'],
  'function whoAmI() {': ['true'],
  'function describe() {': ['Аман, оценок: 3', 'Мерет, оценок: 2'],
  'const school = {': ['1-А'],
  'const quiz = {': ['undefined bread', 'undefined water'],
  'const button = document.createElement("button");': ['true'],
  'const timer = {': ['Прошло: 1'],
  'const student = {': ["! Cannot read properties of undefined (reading 'length')"],
  'function describe(prefix) {': ['Студент Сапар, оценок: 4'],
  'function list() {': ['школа, еда, дом'],
  'console.log(describe.apply(sapar, ["Студент"]));   // Студент Сапар, оценок: 4': ['Студент Сапар, оценок: 4'],
  'const marks = [5, 4, 9, 3];': ['9', '9'],
  'const card = { word: "teacher", show() { return this.word; } };': ['teacher', 'teacher', 'teacher'],
  'function multiply(a, b) {': ['42', '1'],
  'const date = new Date(2026, 9, 14);': ['! this is not a Date object.'],
  'const find = document.querySelector;': ['! Illegal invocation'],
  'function hello() {': ['! Bind must be called on a function'],
  'const find = document.querySelector.bind(document);': ['true'],
};
// blocks whose first line is shared: told apart by a line they contain
const EXPECT_FULL = {
  'console.log(tools[0]());': ['1', 'bread', 'bread', 'undefined'],
  'console.log(whoAmI.call(null));': ['true', 'object', 'object'],
  'word.addEventListener("click", progress.learn.bind(progress));': ["(1) ['4']"],
  'console.log(this === card, this === globalThis);   // шаг 1': ['false true', 'Карточка: undefined'],
  'const count = progress.count;': ['2', "! Cannot read properties of undefined (reading 'length')"],
  'known.addEventListener("click", progress.learn);': ["! Cannot read properties of undefined (reading 'push')"],
  'setTimeout(card.show, 0);    // Карточка: undefined': ['Карточка: teacher', 'Карточка: undefined'],
  'const showCard = card.show.bind(card);   // новая функция': ['Карточка: teacher'],
  'setTimeout(function () {': ['Карточка: teacher', 'Карточка: teacher', 'Карточка: teacher'],
  'console.log(counter.inc.bind(counter) === counter.inc.bind(counter));': ['false', '1'],
  'const onClick = counter.inc.bind(counter);': ['1'],
};
// a block that goes on from an earlier one: its first line -> a line of the earlier block it needs
const PRELUDE = {
  'console.log(describe.apply(sapar, ["Студент"]));   // Студент Сапар, оценок: 4': 'function describe(prefix) {',
};

// The examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  sum: 'function sum() { return [].reduce.call(arguments, (total, n) => total + n, 0); }',
  format: 'function format(currency, amount) { return `${amount.toFixed(2)} ${currency}`; }',
  myBind: 'function myBind(fn, thisValue, ...preset) { return (...args) => fn.call(thisValue, ...preset, ...args); }',
};
const checkable = (code) => {
  const names = Object.keys(SOLUTIONS).filter((n) => new RegExp(`\\b${n}\\b`).test(code));
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

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
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
      const p = await ctx.newPage();
      const out = [];
      p.on('pageerror', (e) => out.push(`! ${e.message}`));
      await p.goto('http://day.test/');
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Runtime.enable');
      cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
      const pre = PRELUDE[blk.code.split('\n')[0]];
      const before = pre ? blocks.find((x) => x.code.startsWith(pre)).code + '\n' : '';
      const run = blk.example ? checkable(blk.code) : before + blk.code;
      await p.addScriptTag({ content: run }).catch((e) => out.push(`! ${e.message.split('\n')[0]}`));
      await p.waitForTimeout(blk.code.includes('setTimeout') ? 400 : 80);
      if (blk.example) {
        for (const l of out.filter((x) => x.startsWith('EX-'))) check(l.startsWith('EX-OK'), `${name} #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(!out.some((l) => l.startsWith('! ')), `${name} #${i} example runs with the reference solution: ${out.filter((l) => l.startsWith('! ')).join(' | ') || 'no errors'}`);
      }
      await p.close();

      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      const full = Object.keys(EXPECT_FULL).find((k) => blk.code.includes(k));
      let want = name === 'lecture' && !blk.cheat ? (full ? EXPECT_FULL[full] : EXPECT[first]) : undefined;
      // a prelude block prints its own lines first: only the lines of this block are compared
      if (pre && Array.isArray(want)) out.splice(0, out.length - want.length);
      // a cheatsheet is a list of reminders: it only has to run without an error
      if (blk.cheat) check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`);
      if (Array.isArray(want)) check(JSON.stringify(out) === JSON.stringify(want), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
    }
  }
  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
