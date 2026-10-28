// Course 3, day 1, in Chrome: every <pre class="code js"> block of the lecture runs as a real <script> of its own on a
// clean page, the way a student would paste it into a file. Console output is rebuilt from Chrome's preview objects,
// as DevTools prints it: strings bare at the top level, in single quotes inside objects. An uncaught error is printed as
// the console shows it: "Uncaught SyntaxError: …". The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-01.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-01.cjs --quiet    only the checks
// Checks: a result-box right after a block equals its output; a block without a result-box has EXPECT for its first
// line; the quoted method of the neighbour (day 35 of course 2) is the real one; the cheatsheet runs without an error;
// what the lecture says about the text of ECMA-262 2026 is checked against tools/.cache/ecma262-2026.html; the three
// experiments of the try-it box; every row of the day's plan is a link to tc39.es and every anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '../../..');
const DAY = path.join(ROOT, 'advanced/day-01');
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
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a block without a result-box: its output by the first line ("Uncaught …" for an error the console prints)
const EXPECT = {
  'console.log("начало");': ["Uncaught SyntaxError: Identifier 'mark' has already been declared"],
  // the tasks ask to predict these: the answers live here, not on the page
  'const marks = [10, 20, 30, 40];': ['30 30 40', '10 10 10', 'undefined undefined'],
  'const say = (word) => {': ['один', 'два', 'три', 'четыре', '7'],
  'const mark = { valueOf() { console.log("valueOf вызван"); return 5; } };': ['valueOf вызван', 'NaN'],
  'const days = [1, 2, 1];': ['2 0 2', '-1 -1 -1'],
};

// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  includesRecord: `const normal = (value) => ({ type: "normal", value });
const thrown = (value) => ({ type: "throw", value });
function toObjectRecord(x) {
  if (x === null || x === undefined) return thrown(new TypeError("Cannot convert undefined or null to object"));
  return normal(Object(x));
}
function includesRecord(o, search) {
  const record = toObjectRecord(o);                    // 1. Let O be ? ToObject(this value).
  if (record.type !== "normal") return record;
  const obj = record.value;
  const len = obj.length;
  if (len === 0) return normal(false);                 // 3.
  for (let k = 0; k < len; k++) {                      // 10.
    const element = obj[k];
    if (element === search || (element !== element && search !== search)) return normal(true);
  }
  return normal(false);                                // 11.
}`,
  due: `function due(cards, progress, today) {
  return cards.filter((c) => !progress.has(c.id) || Temporal.PlainDate.compare(progress.get(c.id).next, today) <= 0);
}`,
  includesBySteps: `function includesBySteps(o, search, fromIndex) {
  if (o === null || o === undefined) throw new TypeError("Cannot convert undefined or null to object");
  const obj = Object(o);                                                  // 1. ToObject
  let len = Math.trunc(Number(obj.length)) || 0;                          // 2. LengthOfArrayLike
  len = Math.min(Math.max(len, 0), 2 ** 53 - 1);
  if (len === 0) return false;                                            // 3.
  const num = Number(fromIndex);                                          // 4. ToIntegerOrInfinity
  let n = Number.isNaN(num) ? 0 : Number.isFinite(num) ? Math.trunc(num) : num;
  if (n === Infinity) return false;                                       // 6.
  if (n === -Infinity) n = 0;                                             // 7.
  let k = n >= 0 ? n : Math.max(len + n, 0);                              // 8–9.
  for (; k < len; k++) {                                                  // 10.
    const element = obj[String(k)];
    if (element === search || (element !== element && search !== search)) return true;
  }
  return false;                                                           // 11.
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
  '// deck.js соседа, день 35 курса 2 — только этот метод': 'intermediate/day-35/lecture.html',
};

// run code as the only <script> of a page; returns console lines and uncaught errors in order
async function runScript(ctx, code, file = 'run.html') {
  const html = `<!doctype html><meta charset="utf-8"><title>run</title><body><script>\n${code}\n</script></body>`;
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
  await p.waitForTimeout(80);
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
// top-level steps of the first algorithm of a clause
const topSteps = (html) => {
  const alg = html.slice(html.indexOf('<emu-alg'), html.indexOf('</emu-alg>'));
  let depth = 0, top = 0;
  for (const m of alg.matchAll(/<(\/?)(ol|li)\b/g)) {
    if (m[2] === 'ol') depth += m[1] ? -1 : 1;
    else if (!m[1] && depth === 1) top++;
  }
  return top;
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
        example: !!pre.closest('.example'),
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
      else if (EXPECT[first]) check(JSON.stringify(out) === JSON.stringify(EXPECT[first]), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: neither a result-box nor EXPECT`);
      // the comment of the early-error block is the console line itself
      if (first === 'console.log("начало");') check(blk.code.includes(`// ${EXPECT[first][0]}`), `${name} #${i}: the last comment is the console line`);
    }
  }

  // section 11: the next <script> of the same page still runs
  {
    const html = '<!doctype html><meta charset="utf-8"><script>console.log("начало");\nlet mark = 4;\nlet mark = 5;\n</script><script>console.log("второй скрипт");</script>';
    await ctx.route('http://day.test/two.html', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const out = [];
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    cdp.on('Runtime.exceptionThrown', () => out.push('error'));
    await cdp.send('Runtime.enable');
    await p.goto('http://day.test/two.html');
    await p.waitForTimeout(80);
    await p.close();
    check(JSON.stringify(out) === JSON.stringify(['error', 'второй скрипт']), `lecture 11: an early error stops only its own script ${JSON.stringify(out)}`);
  }

  // section 13, try-it: the three experiments
  {
    const out = await runScript(ctx, `const broken = { get length() { throw new Error("нет длины"); } };
try { Array.prototype.includes.call(broken, 1); } catch (e) { console.log(e.name + ": " + e.message); }
console.log(Array.prototype.includes.call("Salam", "a"));
const lesson = {
  length: "2",
  get 0() { console.log("читаем 0"); return "kitap"; },
  get 1() { console.log("читаем 1"); return "suw"; },
  get 2() { console.log("читаем 2"); return "çörek"; },
};
console.log(Array.prototype.includes.call(lesson, "çörek"));`, 'tryit.html');
    check(JSON.stringify(out) === JSON.stringify(['Error: нет длины', 'true', 'читаем 0', 'читаем 1', 'false']), `lecture 13 try-it: length getter error, a string, length "2" ${JSON.stringify(out)}`);
  }

  // task 4: every step of at with ? can throw, and the step that comes first wins
  {
    const out = await runScript(ctx, `const show = (f) => { try { f(); } catch (e) { console.log(e.name + ": " + e.message); } };
show(() => Array.prototype.at.call(null, 0));
show(() => Array.prototype.at.call({ get length() { throw new Error("длина"); } }, 0));
show(() => [1].at(Symbol("n")));
show(() => Array.prototype.at.call({ length: 1, get 0() { throw new Error("элемент"); } }, 0));
show(() => Array.prototype.at.call({ get length() { throw new Error("длина"); } }, Symbol("n")));`, 'task4.html');
    check(out.length === 5 && out[0].startsWith('TypeError: ') && JSON.stringify(out.slice(1)) === JSON.stringify(['Error: длина', 'TypeError: Cannot convert a Symbol value to a number', 'Error: элемент', 'Error: длина']),
      `tasks 4: steps 1, 2, 3, 7 of at throw, step 2 before step 3 ${JSON.stringify(out)}`);
  }

  // task 7: a string date still works with compare, and <= still throws because of today
  {
    const out = await runScript(ctx, `const today = Temporal.PlainDate.from("2026-10-28");
console.log(Temporal.PlainDate.compare("2026-10-27", today));
try { console.log("2026-10-27" <= today); } catch (e) { console.log(e.name); }`, 'task7.html');
    check(JSON.stringify(out) === '["-1","TypeError"]', `tasks 7: compare takes a string date, <= still throws ${JSON.stringify(out)}`);
  }

  // section 15: a Temporal date has no Symbol.toPrimitive, so OrdinaryToPrimitive calls valueOf
  {
    const out = await runScript(ctx, 'console.log(typeof Temporal.PlainDate.prototype[Symbol.toPrimitive]);', 'toprim.html');
    check(JSON.stringify(out) === '["undefined"]', `lecture 15: PlainDate has no Symbol.toPrimitive ${JSON.stringify(out)}`);
  }
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const words = textOf(spec);
  for (const w of ['console', 'setTimeout', 'alert', 'Temporal']) {
    const n = (words.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length;
    check(n === 0, `lecture 2, 5: "${w}" occurs ${n} times in ECMA-262 2026`);
  }
  check(Math.round(fs.statSync(SPEC).size / 1e5) / 10 === 7.5, `lecture 8: the copy of the 2026 edition is ${fs.statSync(SPEC).size} bytes, about 7,5 MB`);
  check(topSteps(clause(spec, 'sec-array.prototype.includes')) === 11, 'lecture 13: Array.prototype.includes has 11 steps');
  check(topSteps(clause(spec, 'sec-tointegerorinfinity')) === 5, 'lecture 8: ToIntegerOrInfinity has 5 steps');
  check(/returns either a normal completion containing either an integer, \+∞, or -∞, or a throw completion/.test(flat(clause(spec, 'sec-tointegerorinfinity'))), 'lecture 8: the header of ToIntegerOrInfinity');
  check(/implementation-approximated/.test(textOf(clause(spec, 'sec-math.sin'))), 'lecture 5: the last step of Math.sin is implementation-approximated');
  check(/implementation-defined/.test(textOf(clause(spec, 'sec-date.parse'))), 'lecture 5: Date.parse of a non-ISO string is implementation-defined');
  const terms = new Set([...spec.matchAll(/<span class="secnum">4\.4\.(\d+)<\/span>/g)].map((m) => m[1])).size;
  check(terms === 42, `lecture 7: clause 4.4 has ${terms} terms`);
  const rel = flat(clause(spec, 'sec-relational-operators-runtime-semantics-evaluation'));
  check(/<= ShiftExpression .*?Let r be \? IsLessThan ?\(rVal, lVal, false\)\. If r is either true or undefined, return false\./.test(rel), 'lecture 15: a <= b is IsLessThan(rVal, lVal, false), negated');
  check(/Let methodNames be «"valueOf", "toString"»/.test(flat(clause(spec, 'sec-ordinarytoprimitive'))), 'lecture 15: with hint number OrdinaryToPrimitive tries valueOf first');
  const shorthand = flat(clause(spec, 'sec-shorthands-for-unwrapping-completion-records'));
  check(/If record is an abrupt completion, return record\./.test(shorthand), 'lecture 12: ? returns an abrupt record to the caller');

  // tasks: what they say about the text
  check(/implementation-defined/.test(flat(clause(spec, 'sec-math.random'))), 'tasks 1: Math.random uses an implementation-defined algorithm');
  check(topSteps(clause(spec, 'sec-array.prototype.at')) === 7 && (flat(clause(spec, 'sec-array.prototype.at')).match(/\? /g) || []).length === 4
    && /Return \? Get ?\(O, ! ToString/.test(flat(clause(spec, 'sec-array.prototype.at'))), 'tasks 4: at has 7 steps, 4 of them with ?, the last one with ! ToString');
  check(/Let k be min ?\(n, len - 1\)/.test(flat(clause(spec, 'sec-array.prototype.lastindexof'))) && topSteps(clause(spec, 'sec-array.prototype.lastindexof')) === 9,
    'tasks 9: lastIndexOf has 9 steps, step 6 takes min(n, len - 1)');
  check(/IsStrictlyEqual/.test(flat(clause(spec, 'sec-array.prototype.indexof'))), 'tasks 6: indexOf compares with IsStrictlyEqual');
  const max = flat(clause(spec, 'sec-math.max'));
  check(/Let highest be -∞/.test(max) && max.indexOf('ToNumber') < max.indexOf('If number is NaN'), 'tasks 6: Math.max starts from -∞ and converts every argument before the NaN check');

  // notes, homework 1: both clauses have steps with ?, the first of them can throw
  for (const id of ['sec-map.prototype.get', 'sec-string.prototype.at']) {
    const steps = flat(clause(spec, id));
    check(/\? \w+/.test(steps), `student homework 1: ${id} has steps with ?`);
  }

  // every row of the day's plan is a link, every anchor of the lecture exists
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = fs.readFileSync(path.join(ROOT, 'docs/coverage/ecma262.csv'), 'utf8').split('\n').map(csvLine)
    .filter((c) => c[6] === '3' && c[7] === '1').map((c) => c[0]);
  const unlinked = rows.filter((id) => !anchors.has(id));
  check(rows.length === 66 && unlinked.length === 0, `plan: ${rows.length} rows of day 1, not linked: ${unlinked.join(', ') || 'none'}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
