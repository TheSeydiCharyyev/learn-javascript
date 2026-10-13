// Course 2, day 3, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would paste it. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it; an uncaught error is "! message" (V8 text; the prefix that
// Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-03.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-03.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; extra runs (EXTRA) cover what one block cannot: the "Cards" program without "use strict",
// var name and let name on one page, two scripts of one page (task 5), strict variants of tasks 1, 4 and 6.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-03');
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

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  '// день 4 Essentials: опечатка создала': ['0 5 Карточка: undefined'],
  '// ReferenceError: totl is not defined': ['! totl is not defined'],
  'console.log("старт");': ['старт', '5'],
  'function isStrict() {': ['true true'],
  'console.log(delete o.x, JSON.stringify(o));': ['false {"x":1}'],
  "o.x = 2;   // TypeError": ["! Cannot assign to read only property 'x' of object '#<Object>'"],
  'console.log(who.call(null));': ['undefined', 'null', 'number'],
  "count();   // TypeError: Cannot read properties of undefined (reading 'learned')": ["! Cannot read properties of undefined (reading 'learned')"],
  'console.log(010, 0o10);': ['8 8'],
  'console.log(sloppy(1), strict(1));': ['10 1'],
  'quiz.positon = 1;': ['0', "(2) ['position', 'positon']"],
  'console.log(globalThis === window, globalThis === self);': ['true true', 'true', 'function'],
  'function c() {}\n\nconsole.log(a, b);': ['1 2', '1 undefined', 'function'],
  'var name = 5;': ['string 5'],
  'console.log(JSON.stringify(globalThis.name));': ['number 5', '""'],
  'let undefined = 5;': ["! Identifier 'undefined' has already been declared"],
  'function has(feature) {': ['true false'],
  'box.id = "progressBox";': ['true', 'true'],
  'console.log(this === globalThis);   // true': ['true', 'undefined'],
  'globalThis.cards = { version: 2, words: [] };': ['2'],
  // tasks
  'settings.size = 14;': ['светлая undefined 1'],
  '// А\n"use strict";': ['undefined'],
  '// Б': ['undefined true'],
  '// В': ['начало', 'true'],
  'console.log(box.who() === box);': ['true', 'true', 'object', 'true'],
  'console.log(globalThis.a, globalThis.b, globalThis.c, typeof globalThis.d);': ['var undefined undefined function'],
  'cuont = 0;': ["(2) ['totl', 'cuont']"],
  'console.log(sloppy(1, 2));': ['(4) [10, 20, 10, 20]', '(4) [10, 2, 1, 20]'],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };

  // runs scripts one after another on one fresh page; returns console lines and errors, and the page for more questions
  const runOnPage = async (scripts) => {
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    for (const code of scripts) await p.addScriptTag({ content: code }).catch((e) => out.push(`! ${clean(e.message.split('\n')[0])}`));
    await p.waitForTimeout(scripts.some((c) => c.includes('setTimeout')) ? 400 : 80);
    return { out, p };
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
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const { out, p } = await runOnPage([blk.code]);
      await p.close();
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(JSON.stringify(out) === JSON.stringify(EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (blk.box) check(JSON.stringify(out) === JSON.stringify(blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
    }
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const strip = (code) => code.replace(/^"use strict";\n/, '');
  const strictOf = (code) => `"use strict";\n${code}`;

  // lecture, section 13: the same program without "use strict" — the table of the section, and two stray globals
  {
    const { out, p } = await runOnPage([strip(find('lecture', 'positon = (position + 1)'))]);
    const stray = await p.evaluate(() => [globalThis.positon, globalThis.flipped]);
    await p.close();
    check(JSON.stringify(out) === JSON.stringify(['сейчас: bread', 'дальше: bread', 'перевёрнута: true', 'перевёрнута: true']),
      `lecture 13 without "use strict": ${JSON.stringify(out)}`);
    check(stray[0] === 1 && stray[1] === true, `lecture 13 without "use strict": globalThis.positon = ${stray[0]}, globalThis.flipped = ${stray[1]}`);
  }
  // lecture, section 11: why "a new tab" — after var name the window keeps "5", even after a reload
  {
    const { out, p } = await runOnPage([find('lecture', 'var name = 5;'), find('lecture', 'console.log(JSON.stringify(globalThis.name));')]);
    await p.reload();
    const kept = await p.evaluate(() => globalThis.name);
    await p.close();
    check(JSON.stringify(out) === JSON.stringify(['string 5', 'number 5', '"5"']), `lecture 11: the let block on the same tab after var: ${JSON.stringify(out)}`);
    check(kept === '5', `lecture 11: window.name after a reload: "${kept}"`);
  }
  // lecture, section 9: in strict mode a name that matches an element id is found when read, but not assigned
  {
    const { out, p } = await runOnPage([find('lecture', 'box.id = "progressBox";'),
      '"use strict";\nconsole.log(typeof progressBox);\nprogressBox = 5;']);
    await p.close();
    check(JSON.stringify(out.slice(2)) === JSON.stringify(['object', '! progressBox is not defined']),
      `lecture 9: strict read and write of an id name: ${JSON.stringify(out.slice(2))}`);
  }
  // tasks 1, 4, 6 in strict mode
  {
    const t1 = (await runOnPage([strictOf(find('tasks', 'settings.size = 14;'))]));
    await t1.p.close();
    check(t1.out[0] === "! Cannot assign to read only property 'theme' of object '#<Object>'", `task 1 strict: ${t1.out[0]}`);
    const t4 = await runOnPage([strictOf(find('tasks', 'console.log(box.who() === box);'))]);
    await t4.p.close();
    check(JSON.stringify(t4.out) === JSON.stringify(['false', 'false', 'number', 'true']), `task 4 strict: ${JSON.stringify(t4.out)}`);
    const t6 = await runOnPage([strictOf(find('tasks', 'cuont = 0;'))]);
    await t6.p.close();
    check(t6.out[0] === '! totl is not defined', `task 6 strict: ${t6.out[0]}`);
  }
  // task 5: two scripts of one page
  {
    const first = 'let shared = 1;\nvar old = 2;';
    const second = 'console.log(shared, old, globalThis.shared, globalThis.old);';
    const r = await runOnPage([first, `${second}\nlet shared = 3;`]);
    await r.p.close();
    check(r.out.length === 1 && r.out[0] === "! Identifier 'shared' has already been declared", `task 5, second script with let shared: ${JSON.stringify(r.out)} — nothing printed`);
    const r2 = await runOnPage([first, second]);
    await r2.p.close();
    check(JSON.stringify(r2.out) === JSON.stringify(['1 2 undefined 2']), `task 5, second script without it: ${JSON.stringify(r2.out)}`);
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
