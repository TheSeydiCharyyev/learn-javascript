// Course 2, day 1, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin, so localStorage works), the way a student would paste it.
// Console output is rebuilt from Chrome's preview objects, as DevTools prints it: "(2) [5, 3]", strings in arrays
// in single quotes. Uncaught errors are printed with their V8 message.
//   node tools/runs/intermediate/day-01.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-01.cjs --quiet    only the checks
// Checks: the output of a block equals EXPECT for its first line; a result-box right after a block equals its
// output; in section 12 a click on the button "еда" prints the line written in the comment.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-01');
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
  'const KEY = "cards:learned";': [],
  'learned = [1, 2];   // так мы проверяли колоду на дне 33': [],
  'const city = "Мары";                    // глобальная': ['Салам, Аман!', 'Салам, Мары!', 'undefined'],
  'const city = "Мары";': ['Мары'],
  'function report(student) {': ['Мерет, школа № 5: 5'],
  'const mark = 5;                    // весь скрипт': ['Сапар 4', '5'],
  'console.log(name);         // пустая строка, а не ошибка': ['', 'string'],
  'function makeCounter() {': null, // two blocks start like this, checked by their full text below
  'let count = 0;                 // снаружи — одна на всех': ['3'],
  'let lesson = "замыкания";': ['Тема: замыкания', 'Тема: this'],
  'function remember(value) {': ['еда', 'дом'],
  'function makeRangeCheck(min, max) {': ['(2) [5, 3]', 'true false'],
  'const min = 2;': ['(2) [5, 3]'],
  'function makeScore() {': ['9', 'undefined'],
  'function makeList() {': ["(2) ['bread', 'взлом']"],
  'for (var i = 1; i <= 3; i++) {': ['var: 4', 'var: 4', 'var: 4', 'let: 1', 'let: 2', 'let: 3'],
  'function makeLogger(n) {': ['фабрика: 1', 'фабрика: 2', 'фабрика: 3'],
  'const topics = ["школа", "еда", "дом"];': [],
  'function showCount(button, words) {': [],
};
const EXPECT_FULL = {
  // section 6: one counter
  'const next = makeCounter();': ['1', '2', '3'],
  // section 7: two counters
  'const a = makeCounter();': ['4', '1'],
};

// The examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  makeCounter: `function makeCounter(start = 0, step = 1) {
  let value = start;
  return () => { value += step; return value; };
}`,
  makeRangeCheck: 'function makeRangeCheck(min, max) { return (n) => n >= min && n <= max; }',
  makeOneOf: 'function makeOneOf(list) { return (x) => list.includes(x); }',
  makeProgress: `localStorage.removeItem("cards:learned");
function makeProgress(key) {
  const learned = JSON.parse(localStorage.getItem(key)) ?? [];
  const save = () => localStorage.setItem(key, JSON.stringify(learned));
  return {
    learn: (id) => { if (!learned.includes(id)) { learned.push(id); save(); } },
    has: (id) => learned.includes(id),
    count: () => learned.length,
    list: () => [...learned],
    reset: () => { learned.length = 0; localStorage.removeItem(key); },
  };
}`,
  makeHistory: `function makeHistory(initial) {
  const states = [initial];
  return {
    set: (value) => { states.push(value); },
    undo: () => { if (states.length === 1) return false; states.pop(); return true; },
    value: () => states.at(-1),
  };
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
      const run = blk.example ? checkable(blk.code) : blk.code;
      await p.addScriptTag({ content: run }).catch((e) => out.push(`! ${e.message.split('\n')[0]}`));
      await p.waitForTimeout(blk.code.includes('setTimeout') ? 400 : 80);
      if (blk.example) {
        for (const l of out.filter((x) => x.startsWith('EX-'))) check(l.startsWith('EX-OK'), `${name} #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(!out.some((l) => l.startsWith('! ')), `${name} #${i} example runs with the reference solution: ${out.filter((l) => l.startsWith('! ')).join(' | ') || 'no errors'}`);
      }
      // section 12: the buttons are there, a click on "еда" must print what the comment says
      if (blk.code.includes('Выбрана тема')) {
        await p.click('button:has-text("еда")');
        await p.waitForTimeout(30);
        const said = blk.code.match(/нажали «еда»: (.*)$/m)[1];
        check(out.at(-1) === said, `${name} #${i}: click on «еда» prints "${out.at(-1)}", the comment says "${said}"`);
      }
      await p.close();

      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      const full = Object.keys(EXPECT_FULL).find((k) => blk.code.includes(k));
      const want = name === 'lecture' && !blk.cheat ? (full ? EXPECT_FULL[full] : EXPECT[first]) : undefined;
      // a cheatsheet is a list of reminders: it only has to run without an error
      if (blk.cheat) check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`);
      if (Array.isArray(want)) {
        const got = blk.code.includes('Выбрана тема') ? out.slice(0, -1) : out;
        check(JSON.stringify(got) === JSON.stringify(want), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(got)}`);
      }
      if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
    }
  }
  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
