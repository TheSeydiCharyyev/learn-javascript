// Course 2, day 16 (project day: a group journal on classes), in Chrome. The journal is put together from the lecture:
// the page is the markup of section 7 (app.js replaced by an inline script at the end of <body>), and app.js is the
// program parts in the order of the lecture. Every "check the step" block runs as a script after the parts written
// before it (with the clicks and typing the text asks for), the way a student types it into the console. Console output
// is rebuilt from Chrome's preview objects, as DevTools prints it (see day-15.cjs); an uncaught error is "! message".
//   node tools/runs/intermediate/day-16.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-16.cjs --quiet    only the checks
// Checks: a program part loads without an error; a check block's output equals EXPECT for a line it contains or its
// result-box; every EXPECT key is in exactly one block; the whole program (section 15) has the same lines as the parts;
// the scenario and the edge cases of section 15 on the whole program; the four bugs of sections 13–14 on patched
// copies; the claims of the prose; the two experiments; the notes run on the journal page; reference solutions of
// tasks 1–9 (task 9: the fragments are put into the whole program and the three complaints come true).
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-16');
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
const pv = (o) => {
  if (o.type === 'string') return q(o.description);
  if (o.type === 'object' && o.subtype === 'array') return o.description;
  if (o.type === 'object' && o.subtype === 'null') return 'null';
  if (o.type === 'object') return '{…}';
  return o.description;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'map' || a.subtype === 'weakmap') {
    const entries = (a.preview.entries ?? []).map((e) => `${pv(e.key)} => ${pv(e.value)}`);
    return `${a.description} {${entries.join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  if (a.subtype === 'set' || a.subtype === 'weakset') {
    if (!a.preview.entries) return `${a.description} {<empty>}`;
    return `${a.description} {${a.preview.entries.map((e) => pv(e.value)).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    return `${name === 'Array' ? '' : name}(${n}) [${a.preview.properties.map(inner).join(', ')}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');

// the program parts of the lecture, by their first line, in the order of the text
const PARTS = ['"use strict";', 'class Student {', 'class Group {', 'const group = new Group(SETTINGS.title);', 'const title = document.querySelector("#title");', 'function format(average) {', 'function isVisible(student) {', 'function submitWith(form, action) {', 'function studentOf(element) {'];
const WHOLE = '// app.js — журнал группы';

// expected output of a check block by a line it contains
const EXPECT = {
  'SETTINGS.marks.push(6);': ['true true true', '! Cannot add property 4, object is not extensible'],
  'gulnar.addMark(7);': ['1 Гүлнар (2) [5, 4] 4.5 true', '2', '! Оценка 7: можно только 2, 3, 4, 5'],
  'group.add(" Аман ");': ["3 Мерет 3.5 (3) ['классы', 'Map', 'Set']", '4.39 undefined', '! Аман уже в группе'],
  'console.log(rows.children.length, filters.children.length, title.textContent === "");': ['0 2 true'],
  'const row = makeRow(group.get(1));': ['1 excellent 5, 4, 5 4.67 5'],
  'console.log(group.size, group.get(4).name, rows.children.length, error.textContent);': ['4 Сапар 4 Сапар уже в группе'],
  'console.log(group.get(3).marks, group.get(3).average.toFixed(2), group.size, rows.children.length);': ['(3) [5, 5, 3] 4.33 2 1', 'Учеников: 2 · средний по группе: 4.50 · отличников: 1'],
  'group.get(1).marks.push(9);': ['(4) [5, 4, 5, 9] 5.75'],
  '["Сапар", "Гүлнар"].forEach(group.add);': ['! Iterator.from called on non-object'],
  'group.get(1).addMark("5");': ['! Оценка 5: можно только 2, 3, 4, 5'],
  'const [first] = new Map([[1, group.get(1)]]);': ['2 undefined undefined'],
};
// what a student does on the page before typing the block (the text of the lecture says it)
const ACTIONS = {
  'console.log(group.size, group.get(4).name, rows.children.length, error.textContent);': async (p) => {
    await p.fill('#new-student input', '  Сапар  ');
    await p.press('#new-student input', 'Enter');
    await p.fill('#new-student input', 'Сапар');
    await p.press('#new-student input', 'Enter');
  },
  'console.log(group.get(3).marks, group.get(3).average.toFixed(2), group.size, rows.children.length);': async (p) => {
    await p.click('tr[data-id="3"] button[data-mark="3"]');
    await p.click('tr[data-id="2"] .delete');
    await p.click('.filters button[data-filter="excellent"]');
  },
};
// a check block that runs on a patched program: the bug the text shows
const PATCH = {
  'group.get(1).marks.push(9);': [['return [...this.#marks];', 'return this.#marks;']],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let ctx = await b.newContext();
  let html = '';
  const route = (c) => c.route('http://journal.test/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await route(ctx);
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // reads the blocks of a page
  const blocksOf = async (name) => {
    const src = await ctx.newPage();
    await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
    const r = await src.evaluate(() => ({
      js: [...document.querySelectorAll('pre.code.js')].map((pre) => {
        const next = pre.nextElementSibling;
        return {
          code: pre.textContent,
          box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          cheat: !!pre.closest('.cheatsheet'),
        };
      }),
      html: [...document.querySelectorAll('pre.code.html')].map((pre) => pre.textContent),
      scenario: [...document.querySelectorAll('table.scenario tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.replace(/ /g, ' ').trim())),
    }));
    await src.close();
    return r;
  };
  const lecture = await blocksOf('lecture');
  const markup = lecture.html[0];
  check(lecture.html.length === 1 && /<script src="app\.js" defer><\/script>/.test(markup), 'lecture: one markup block that loads app.js');
  const pageWith = (js) => markup.replace(/\s*<script src="app\.js" defer><\/script>/, '').replace('</body>', `<script>\n${js}\n</script>\n</body>`);

  // opens the journal with a program; returns the page, its console lines and a way to run a script on it
  const open = async (js, c = ctx) => {
    html = pageWith(js);
    const p = await c.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    const cdp = await c.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    await p.goto('http://journal.test/');
    await p.waitForTimeout(50);
    const run = async (code) => {
      await p.addScriptTag({ content: code }).catch((e) => out.push(`! ${clean(e.message.split('\n')[0])}`));
      await p.waitForTimeout(50);
    };
    return { p, out, cdp, run };
  };
  const patch = (js, pairs) => {
    let r = js;
    for (const [from, to] of pairs) {
      check(r.includes(from), `patch applies: ${from.slice(0, 60)}`);
      r = r.replace(from, to);
    }
    return r;
  };
  const text = (p, sel) => p.$eval(sel, (el) => el.textContent);
  const names = (p) => p.$$eval('#students tr', (trs) => trs.map((tr) => tr.children[0].textContent));

  // ---- lecture: parts and check blocks in order
  let parts = [];
  let whole = null;
  if (!quiet) console.log(`\n===== lecture: ${lecture.js.length} blocks`);
  for (const [i, blk] of lecture.js.entries()) {
    const first = blk.code.split('\n')[0];
    if (blk.cheat) {
      const { out, p } = await open('');
      const r = await (async () => { const o = []; await p.addScriptTag({ content: blk.code }).catch((e) => o.push(e.message)); return o; })();
      check(r.length === 0 && out.length === 0, `lecture #${i} (cheatsheet) runs without an error`);
      await p.close();
      continue;
    }
    if (first === WHOLE) { whole = blk.code; continue; }
    if (PARTS.some((k) => blk.code.startsWith(k))) {
      parts.push(blk.code);
      const { out, p } = await open(parts.join('\n\n'));
      if (!quiet) console.log(`\n--- part ${parts.length}: ${first}`);
      check(out.length === 0, `part ${parts.length} (${first.slice(0, 40)}) loads without an error or output: ${JSON.stringify(out)}`);
      await p.close();
      continue;
    }
    const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
    const program = PATCH[key] ? patch(parts.join('\n\n'), PATCH[key]) : parts.join('\n\n');
    const { out, p, run } = await open(program);
    if (ACTIONS[key]) await ACTIONS[key](p);
    await run(blk.code);
    if (!quiet) {
      console.log(`\n--- lecture #${i} (after ${parts.length} parts): ${first}`);
      for (const l of out) console.log(`    > ${l}`);
    }
    if (key) check(same(out, EXPECT[key]), `lecture #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
    if (blk.box) check(same(out, blk.box), `lecture #${i}: result-box = output (${out.length} lines)`);
    if (!key && !blk.box) check(false, `lecture #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
    check(!out.some((l) => l.includes('{<empty>}')), `lecture #${i}: no empty Set is printed`);
    await p.close();
  }
  check(parts.length === PARTS.length, `all ${PARTS.length} program parts found (${parts.length})`);
  for (const k of Object.keys(EXPECT)) {
    const n = lecture.js.filter((x) => x.code.split('\n')[0] !== WHOLE && x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  // ---- section 15: the whole program has the lines of the parts (comments and blank lines aside), render() last
  const lines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).sort();
  check(whole !== null && same(lines(whole), lines(parts.join('\n'))), 'section 15: the whole program = the parts, line for line');
  check(whole.trim().endsWith('render();'), 'section 15: the first render() is the last line');

  // the scenario, step by step on one page
  {
    const steps = [
      async () => {},
      async (p) => { await p.click('#new-student button'); },
      async (p) => { await p.fill('#new-student input', '  Сапар  '); await p.press('#new-student input', 'Enter'); },
      async (p) => { await p.fill('#new-student input', 'Аман'); await p.press('#new-student input', 'Enter'); },
      async (p) => { await p.click('tr[data-id="4"] button[data-mark="4"]'); await p.click('tr[data-id="4"] button[data-mark="5"]'); },
      async (p) => { await p.fill('#new-topic input', ' Set '); await p.press('#new-topic input', 'Enter'); },
      async (p) => { await p.fill('#new-topic input', 'генераторы'); await p.press('#new-topic input', 'Enter'); },
      async (p) => { await p.click('.filters button[data-filter="excellent"]'); await p.click('tr[data-id="3"] .delete'); },
      async (p) => { await p.click('.filters button[data-filter="all"]'); },
    ];
    check(lecture.scenario.length === steps.length, `scenario: ${lecture.scenario.length} rows, ${steps.length} steps`);
    const { p, out } = await open(whole);
    for (const [i, [did, want]] of lecture.scenario.entries()) {
      await steps[i](p);
      let got;
      if (want.startsWith('Учеников')) got = await text(p, '#summary');
      else if (want.startsWith('Темы')) got = await text(p, '#topics');
      else if (want.startsWith('строки: ')) got = `строки: ${(await names(p)).join(', ')}`;
      else got = await text(p, '#error');
      check(got === want, `scenario ${i + 1} «${did}»: ${got}`);
      if (i === 5) check(await p.evaluate(() => document.activeElement === document.querySelector('#new-topic input')), 'scenario: after the repeated topic the cursor stays in the topic field');
    }
    check(out.length === 0, `scenario: no console output or errors: ${JSON.stringify(out)}`);
    await p.close();
  }
  // the empty name leaves the cursor in the field; the edge cases, each on a clean page
  {
    const edge = async (act, sel, want, label) => {
      const { p, out } = await open(whole);
      await act(p);
      const got = typeof sel === 'function' ? await sel(p) : await text(p, sel);
      check(got === want && out.length === 0, `edge: ${label}: ${JSON.stringify(got)} ${JSON.stringify(out)}`);
      await p.close();
    };
    await edge(async (p) => { await p.click('#new-student button'); }, (p) => p.evaluate(() => document.activeElement === document.querySelector('#new-student input')), true, 'an empty name keeps the cursor in the field');
    await edge(async (p) => { await p.fill('#new-student input', '     '); await p.press('#new-student input', 'Enter'); }, '#error', 'Напишите имя ученика', 'a name of spaces');
    await edge(async (p) => { await p.fill('#new-student input', 'аман'); await p.press('#new-student input', 'Enter'); }, '#summary', 'Учеников: 4 · средний по группе: 4.39 · отличников: 2', '«аман» is a fourth student');
    await edge(async (p) => { await p.fill('#new-student input', '<b>Мерет</b>'); await p.press('#new-student input', 'Enter'); }, (p) => p.$eval('tr[data-id="4"] td', (td) => `${td.textContent}|${td.children.length}`), '<b>Мерет</b>|0', 'markup in a name is text');
    await edge(async (p) => { for (const id of [1, 2, 3]) await p.click(`tr[data-id="${id}"] .delete`); }, '#summary', 'Учеников: 0 · средний по группе: — · отличников: 0', 'everybody deleted');
    await edge(async (p) => { await p.click('#new-student button'); await p.click('tr[data-id="1"] button[data-mark="5"]'); }, '#error', 'Напишите имя ученика', 'the message stays after a mark');
  }

  // ---- the bugs of sections 13–14 on patched copies of the whole program
  {
    const lost = patch(whole, [['submitWith(studentForm, (name) => group.add(name));', 'submitWith(studentForm, group.add);']]);
    const { p, out } = await open(lost);
    await p.fill('#new-student input', 'Сапар');
    await p.press('#new-student input', 'Enter');
    check(await text(p, '#error') === 'Iterator.from called on non-object' && out.length === 0, `section 14: group.add without the arrow, under the form: ${await text(p, '#error')}`);
    await p.close();
  }
  {
    const noNumber = patch(whole, [['student.addMark(Number(button.dataset.mark));', 'student.addMark(button.dataset.mark);']]);
    const { p, out, run } = await open(noNumber);
    await p.click('tr[data-id="1"] button[data-mark="5"]');
    await run('console.log(group.get(1).marks.length, document.querySelector("#students tr").children[1].textContent);');
    check(same(out, ['! Оценка 5: можно только 2, 3, 4, 5', '3 5, 4, 5']), `section 14: the mark without Number — nothing changes, an error in the console: ${JSON.stringify(out)}`);
    await p.close();
  }
  {
    const noNumber = patch(whole, [['return group.get(Number(element.closest("tr").dataset.id));', 'return group.get(element.closest("tr").dataset.id);']]);
    const { p, out } = await open(noNumber);
    await p.click('tr[data-id="1"] button[data-mark="5"]');
    check(same(out, ["! Cannot read properties of undefined (reading 'addMark')"]), `section 14: studentOf without Number: ${JSON.stringify(out)}`);
    await p.close();
  }
  {
    const pairs = patch(whole, [['yield* this.#students.values();', 'yield* this.#students;']]);
    const { p, out, run } = await open(pairs);
    await run('console.log(rows.children.length, Array.isArray([...group][0]));');
    check(same(out, ["! Cannot read properties of undefined (reading 'join')", '0 true']), `section 14: yield* without values(): ${JSON.stringify(out)}`);
    await p.close();
  }

  // ---- the claims of the prose
  {
    // section 3: in app.js (strict) the assignment throws; in the console it is ignored
    const { p, out, run } = await open(`${whole}\nSETTINGS.excellent = 4;`);
    check(same(out, ["! Cannot assign to read only property 'excellent' of object '#<Object>'"]), `section 3: in strict app.js: ${JSON.stringify(out)}`);
    await p.close();
    const o2 = await open(whole);
    await o2.run('SETTINGS.excellent = 4;\nconsole.log(SETTINGS.excellent);');
    check(same(o2.out, ['4.5']), `section 3: in the console it is ignored: ${JSON.stringify(o2.out)}`);
    await o2.p.close();
  }
  {
    // section 5: a Set alone would skip a repeat silently; the class says it
    const { p, out, run } = await open(whole);
    await run('const s = new Set(group.topics);\ns.add("Map");\nconsole.log(s.size);\ngroup.addTopic(" Map ");');
    check(same(out, ['3', '! Тема «Map» уже есть']), `section 5: a repeated topic: ${JSON.stringify(out)}`);
    await p.close();
  }
  {
    // section 4: the getters have no setters; private fields are out of reach in a script
    const { p, out, run } = await open(whole);
    await run('"use strict";\ngroup.get(1).name = "Айна";');
    await run('console.log(group.get(1).#marks);');
    check(same(out, ['! Cannot set property name of #<Student> which has only a getter', "! Private field '#marks' must be declared in an enclosing class"]), `section 4 and experiment 2: ${JSON.stringify(out)}`);
    // experiment 2: the DevTools console (REPL mode) lets one read #marks
    const cdp = await ctx.newCDPSession(p);
    const r = await cdp.send('Runtime.evaluate', { expression: 'group.get(1).#marks', replMode: true, returnByValue: true });
    check(same(r.result.value, [5, 4, 5]), `experiment 2: the console reads #marks: ${JSON.stringify(r.result.value)}`);
    await p.close();
  }
  {
    // experiment 1: the threshold 3.5 — three excellent students, one line changed
    const { p, out } = await open(patch(whole, [['excellent: 4.5,', 'excellent: 3.5,']]));
    check(await text(p, '#summary') === 'Учеников: 3 · средний по группе: 4.39 · отличников: 3' && out.length === 0, `experiment 1: ${await text(p, '#summary')}`);
    await p.close();
  }

  // ---- the notes: every block runs on the journal page (in a block of its own, so names do not clash)
  {
    const notes = await blocksOf('student');
    for (const [i, blk] of notes.js.entries()) {
      const { p, out, run } = await open(whole);
      await run(`{\n${blk.code}\n}`);
      check(out.length === 0, `student #${i} runs on the journal without an error: ${JSON.stringify(out)}`);
      await p.close();
    }
  }

  // ---- tasks
  const tasks = await blocksOf('tasks');
  check(tasks.js.length === 1 && tasks.js[0].code.includes('submitWith(topicForm, group.addTopic);'), 'tasks: the only code block is the fragment of task 9');
  const solve = async (js, code, want, label) => {
    const { p, out, run } = await open(js);
    await run(code);
    check(same(out, want), `${label}: ${JSON.stringify(out)}`);
    await p.close();
  };
  const upTo5 = parts.slice(0, 4).join('\n\n');
  await solve(upTo5, `const gulnar = new Student("Гүлнар");
gulnar.addMark(5).addMark(4);
console.log(gulnar.average, gulnar.isExcellent, gulnar.id, group.get(4));
try {
  gulnar.addMark("4");
} catch (e) {
  console.log(e.message);
}
group.get(1).name = "Айна";
console.log(group.get(1).name);`, ['4.5 true 4 undefined', 'Оценка 4: можно только 2, 3, 4, 5', 'Аман'], 'task 1: the console');
  {
    const { p, out } = await open(`${upTo5}\ngroup.get(1).name = "Айна";`);
    check(same(out, ['! Cannot set property name of #<Student> which has only a getter']), `task 1: the same line in app.js: ${JSON.stringify(out)}`);
    await p.close();
  }
  await solve(upTo5, `for (const s of group) console.log(\`\${s.name} \${s.average.toFixed(2)}\`);
console.log(Iterator.from(group).filter((s) => s.average < 4).map((s) => s.name).toArray(), Math.max(...Iterator.from(group).map((s) => s.average)));
group.add("Сапар");
console.log(Iterator.from(group).filter((s) => s.average === null).toArray().length, group.average.toFixed(2), group.size, group.length);`,
  ['Аман 4.67', 'Мерет 3.50', 'Айна 5.00', "(1) ['Мерет'] 5", '1 4.39 4 undefined'], 'task 2: the numbers of the criteria');
  {
    // task 3: after the scenario, a 2 for Сапар
    const { p, out, run } = await open(whole);
    await p.fill('#new-student input', '  Сапар  '); await p.press('#new-student input', 'Enter');
    await p.click('tr[data-id="4"] button[data-mark="4"]'); await p.click('tr[data-id="4"] button[data-mark="5"]');
    await p.fill('#new-topic input', 'генераторы'); await p.press('#new-topic input', 'Enter');
    await p.click('tr[data-id="3"] .delete');
    await run('console.log([...group].map((s) => s.name), group.topics.length);');
    await p.click('tr[data-id="4"] button[data-mark="2"]');
    const summary = await text(p, '#summary');
    check(same(out, ["(3) ['Аман', 'Мерет', 'Сапар'] 4"]) && summary === 'Учеников: 3 · средний по группе: 3.94 · отличников: 1', `task 3: ${JSON.stringify(out)} ${summary}`);
    await p.close();
  }
  // task 4: byAverage
  const withByAverage = patch(whole, [['  *[Symbol.iterator]() {', `  *byAverage() {
    yield* [...this].toSorted((a, b) => (b.average ?? -1) - (a.average ?? -1));
  }

  *[Symbol.iterator]() {`], ['let filter = "all";', 'let filter = "all";\nlet sorted = true;'], ['rows.append(...Iterator.from(group).filter(isVisible).map(makeRow));', 'rows.append(...Iterator.from(sorted ? group.byAverage() : group).filter(isVisible).map(makeRow));']]);
  {
    const { p, out, run } = await open(withByAverage);
    await run('console.log([...group.byAverage()].map((s) => s.name), [...group].map((s) => s.name));\ngroup.add("Сапар");\nconsole.log([...group.byAverage()].at(-1).name);');
    await p.click('.filters button[data-filter="excellent"]');
    check(same(out, ["(3) ['Айна', 'Аман', 'Мерет'] (3) ['Аман', 'Мерет', 'Айна']", 'Сапар']) && same(await names(p), ['Айна', 'Аман']), `task 4: ${JSON.stringify(out)} ${JSON.stringify(await names(p))}`);
    await p.close();
  }
  // task 5: visits
  const withVisits = patch(whole, [['  #marks = [];\n', '  #marks = [];\n  #visited = new Set();\n'], ['  get average() {\n    if (this.#marks.length === 0) return null;', `  get visited() {
    return new Set(this.#visited);
  }

  visit(topic) {
    this.#visited.add(topic);
  }

  get average() {
    if (this.#marks.length === 0) return null;`], ['  addTopic(topic) {', `  visit(id, topic) {
    if (!this.#topics.has(topic)) throw new Error(\`Нет темы «\${topic}»\`);
    this.get(id).visit(topic);
  }

  missed(id) {
    return new Set(this.#topics).difference(this.get(id).visited);
  }

  addTopic(topic) {`]]);
  await solve(withVisits, `group.visit(1, "классы");
group.visit(1, "Map");
console.log([...group.missed(1)], group.missed(3).size);
try {
  group.visit(1, "циклы");
} catch (e) {
  console.log(e.message);
}
group.visit(1, "Map");
console.log(group.get(1).visited.size);
group.addTopic("генераторы");
console.log(group.missed(1).size);`, ["(1) ['Set'] 3", 'Нет темы «циклы»', '2', '2'], 'task 5: the numbers of the criteria');
  // task 6: undoMark
  const withUndo = patch(whole, [['  addMark(mark) {', `  undoMark() {
    if (this.#marks.length === 0) throw new Error("Оценок нет");
    return this.#marks.pop();
  }

  addMark(mark) {`], ['  const del = document.createElement("button");', `  const undo = document.createElement("button");
  undo.textContent = "↶";
  undo.classList.add("undo");
  undo.disabled = student.marks.length === 0;
  actions.append(undo, " ");
  const del = document.createElement("button");`], ['  if (button.matches(".delete")) {', `  if (button.matches(".undo")) {
    student.undoMark();
  } else if (button.matches(".delete")) {`]]);
  {
    const { p, out, run } = await open(withUndo);
    await run('console.log(group.get(1).undoMark(), group.get(1).marks, group.get(1).average.toFixed(2), group.get(1).isExcellent);');
    await p.click('tr[data-id="2"] .undo');
    await p.click('tr[data-id="2"] .undo');
    const state = await p.$eval('tr[data-id="2"]', (tr) => `${tr.children[2].textContent} ${tr.querySelector('.undo').disabled}`);
    await run('group.get(2).undoMark();');
    check(same(out, ['5 (2) [5, 4] 4.50 true', '! Оценок нет']) && state === '— true', `task 6: ${JSON.stringify(out)} ${state}`);
    await p.close();
  }
  // task 7: two groups
  const withAdopt = patch(whole, [['  get(id) {', `  adopt(student) {
    if (!(student instanceof Student)) throw new TypeError("Принять можно только ученика");
    if (Iterator.from(this).some((s) => s.name === student.name)) throw new Error(\`\${student.name} уже в группе\`);
    this.#students.set(student.id, student);
  }

  get(id) {`]]);
  await solve(withAdopt, `const js1 = group;
const js2 = new Group("JS-2");
js2.add("Гүлнар");
js2.add("Сапар");
["классы", "генераторы", "регулярные выражения"].forEach((t) => js2.addTopic(t));
console.log([...new Set(js1.topics).intersection(new Set(js2.topics))], [...new Set(js1.topics).difference(new Set(js2.topics))]);
js2.adopt(js1.get(2));
js1.remove(2);
console.log(js1.size, js2.size, js2.get(2).marks, js1.get(2), js2.get(2).name);
for (const wrong of [js2.get(4), { name: "Айна" }]) {
  try {
    js2.adopt(wrong);
  } catch (e) {
    console.log(e.message);
  }
}`, ["(1) ['классы'] (2) ['Map', 'Set']", '2 3 (2) [3, 4] undefined Мерет', 'Гүлнар уже в группе', 'Принять можно только ученика'], 'task 7: the numbers of the criteria');
  // task 8: saving, with a context of its own (its own localStorage)
  {
    const withSave = patch(whole, [['  addMark(mark) {', `  toData() {
    return { id: this.#id, name: this.#name, marks: [...this.#marks] };
  }

  static fromData({ id, name, marks }) {
    const student = new Student(name);
    student.#id = id;
    Student.#count = Math.max(Student.#count, id);
    for (const mark of marks) student.addMark(mark);
    return student;
  }

  addMark(mark) {`], ['  addTopic(topic) {', `  toData() {
    return { title: this.#title, students: [...this].map((s) => s.toData()), topics: [...this.#topics] };
  }

  static fromData({ title, students, topics }) {
    const group = new Group(title);
    for (const data of students) {
      const student = Student.fromData(data);
      group.#students.set(student.id, student);
    }
    for (const topic of topics) group.addTopic(topic);
    return group;
  }

  addTopic(topic) {`], ['const group = new Group(SETTINGS.title);\ngroup.add("Аман").addMark(5).addMark(4).addMark(5);\ngroup.add("Мерет").addMark(3).addMark(4);\ngroup.add("Айна").addMark(5).addMark(5);\n["классы", "Map", "Set"].forEach((topic) => group.addTopic(topic));', `function startGroup() {
  const g = new Group(SETTINGS.title);
  g.add("Аман").addMark(5).addMark(4).addMark(5);
  g.add("Мерет").addMark(3).addMark(4);
  g.add("Айна").addMark(5).addMark(5);
  ["классы", "Map", "Set"].forEach((topic) => g.addTopic(topic));
  return g;
}
const saved = localStorage.getItem("journal");
const group = saved ? Group.fromData(JSON.parse(saved)) : startGroup();`], ['  filters.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));\n}', '  filters.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));\n  localStorage.setItem("journal", JSON.stringify(group.toData()));\n}']]);
    const own = await b.newContext();
    await route(own);
    const first = await open(whole, own);
    await first.run('console.log(JSON.stringify(group));');
    check(same(first.out, ['{}']), `task 8: JSON.stringify(group) before: ${JSON.stringify(first.out)}`);
    await first.p.close();
    const a = await open(withSave, own);
    check(await text(a.p, '#summary') === 'Учеников: 3 · средний по группе: 4.39 · отличников: 2', 'task 8: an empty storage gives the three students');
    await a.p.fill('#new-student input', 'Сапар'); await a.p.press('#new-student input', 'Enter');
    await a.p.click('tr[data-id="4"] button[data-mark="4"]'); await a.p.click('tr[data-id="4"] button[data-mark="5"]');
    await a.p.click('tr[data-id="2"] .delete');
    await a.p.reload();
    await a.p.waitForTimeout(50);
    const after = await names(a.p);
    const sapar = await a.p.$eval('tr[data-id="4"]', (tr) => tr.children[2].textContent);
    await a.p.fill('#new-student input', 'Гүлнар'); await a.p.press('#new-student input', 'Enter');
    await a.run('console.log(group.get(5).name, group.get(4).name, group.size);');
    check(same(after, ['Аман', 'Айна', 'Сапар']) && sapar === '4.50' && same(a.out, ['Гүлнар Сапар 4']), `task 8: after a reload ${JSON.stringify(after)} ${sapar}; a new student: ${JSON.stringify(a.out)}`);
    await a.p.close();
    // without Math.max the counter restarts: the new student takes number 4 and pushes Сапар out of the Map
    const noMax = patch(withSave, [['    Student.#count = Math.max(Student.#count, id);\n', '']]);
    const c = await open(noMax, own);
    await c.p.evaluate(() => localStorage.clear());
    await c.p.reload();
    await c.p.waitForTimeout(50);
    await c.p.fill('#new-student input', 'Сапар'); await c.p.press('#new-student input', 'Enter');
    await c.p.click('tr[data-id="2"] .delete');
    await c.p.reload();
    await c.p.waitForTimeout(50);
    await c.p.fill('#new-student input', 'Мерет'); await c.p.press('#new-student input', 'Enter');
    await c.run('console.log(group.get(4).name, [...group].map((s) => s.name));');
    check(same(c.out, ["Мерет (3) ['Аман', 'Айна', 'Мерет']"]), `task 8: without Math.max Сапар is lost: ${JSON.stringify(c.out)}`);
    await c.p.close();
    await own.close();
  }
  // task 9: the fragments in the whole program; the three complaints
  {
    const bugs = patch(whole, [['  get marks() {\n    return [...this.#marks];\n  }', '  get marks() {\n    return this.#marks;\n  }'], ['  get isExcellent() {', '  isExcellent() {'], ['  marks.textContent = student.marks.join(", ");', '  marks.textContent = student.marks.sort().join(", ");'], ['submitWith(topicForm, (topic) => group.addTopic(topic));', 'submitWith(topicForm, group.addTopic);']]);
    const fragment = tasks.js[0].code;
    for (const l of ['return this.#marks;', 'isExcellent() {', 'marks.textContent = student.marks.sort().join(", ");', 'submitWith(topicForm, group.addTopic);']) check(fragment.includes(l), `task 9: the fragment has «${l}»`);
    const { p, out, run } = await open(bugs);
    await run('console.log(group.get(1).marks.join());\ngroup.get(1).addMark(4);\nconsole.log(group.get(1).marks);\nrender();\nconsole.log(group.get(1).marks);');
    const lit = await p.$$eval('#students tr', (trs) => trs.filter((tr) => tr.classList.contains('excellent')).length);
    await p.click('.filters button[data-filter="excellent"]');
    const shown = (await names(p)).length;
    await p.fill('#new-topic input', 'генераторы'); await p.press('#new-topic input', 'Enter');
    const err = await text(p, '#error');
    check(same(out, ['4,5,5', '(4) [4, 5, 5, 4]', '(4) [4, 4, 5, 5]']) && lit === 3 && shown === 3 && err === "Cannot read properties of undefined (reading '#topics')", `task 9: ${JSON.stringify(out)} lit ${lit}, shown ${shown}, «${err}»`);
    await p.close();
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
