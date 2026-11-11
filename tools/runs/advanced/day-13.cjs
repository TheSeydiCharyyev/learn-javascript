// Course 3, day 13, in Chrome: scripts, modules and eval. Every code block of the lecture runs on a page served on
// http://127.0.0.1:5500/, as Live Server would serve it:
//   - a js block without a file name is the only classic <script> of its page;
//   - a block whose first line is "<!-- index.html -->" is a page of its own (several <script> tags, a CSP <meta>);
//   - a block whose first line is "// name.js", or a block with data-file="name.json", is a file of the folder of its
//     section (a section is an h2; a later file with the same name replaces the earlier one), and a result-box after it
//     runs the folder with a page <script type="module" src="main.js"> (as the run of day 30 of course 2 does).
// The notes have no result-boxes: a js block prints what the comments of its console.log lines say ("// 3 — why"); a
// page prints what the "<!-- … -->" comments at the ends of its lines say; the files of a section run at the end of the
// section and print what the comments of their console.log lines say, file after file (the notes list them in the
// order they run). In the tasks a folder is the files of one task; a block without a result-box prints what EXPECT
// says for "tasks #N"; an example (".example") runs with the reference solutions of SOLUTIONS, and every
// "expression;   // value" line must give its comment; the experiments of the criteria run after the pages.
// Output is the console as DevTools shows it: console calls rebuilt from Chrome's preview objects, uncaught errors as
// "Uncaught SyntaxError: …" and the browser's own error messages. Every run gets a fresh browser context.
// The context is Ashgabat time and Russian, as in course 2.
//   node tools/runs/advanced/day-13.cjs            every block: code head, output; checks below
//   node tools/runs/advanced/day-13.cjs --quiet    only the checks
// Checks: a result-box right after a block equals the output of its run; every file of a section is used by a run;
// the quoted import lines of main.js (day 33 of course 2) are the real ones and the other modules of «Карточки» import
// what the lecture says; the cheatsheet runs without an error; the experiments the lecture only tells about (the
// window cannot be made non-extensible, let top and let name, what Chrome creates before a conflict, a runtime error
// stops a script in the middle, a failed dependency stops the next modules, a link error runs nothing, a named import
// from JSON, two stars from one module, an own export over a star, default names, the order of «Карточки» after a
// swap, import defer and import source, eval of a TrustedScript and a string timer under CSP, the forms of step 4 of
// PerformEval, a global let against var of eval, Function sees the global scope); what the lecture says about the text
// of ECMA-262 2026 (chapter 16, 19.2.1 and the operations they call) is checked against tools/.cache/ecma262-2026.html;
// what it says about MDN — against tools/.cache/mdn-content.git; the days it points to say what it says; the reference
// table holds all 14 rows of ECMA-262 and all 6 pages of MDN of the day's plan as links and every tc39.es anchor exists.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-13');
const SPEC = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const PAGES = ['lecture', 'student', 'tasks'];
// a block of the tasks without a result-box: its output by "tasks #index"; the tasks ask to predict these
const EXPECT = {
  'tasks #0': ["Uncaught SyntaxError: Identifier 'a' has already been declared", "Uncaught SyntaxError: Identifier 'b' has already been declared", '40 4', 'новая c',
    "Uncaught SyntaxError: Identifier 'c' has already been declared", '1 2 новая c 40'],
  'tasks #1': ['метод,глобальная,глобальная,метод', 'внешняя глобальная глобальная', 'undefined,object'],
  'tasks #2': ['1 0 SyntaxError number function', 'умолчание/тело undefined'],
  'tasks #5': ['16 42 kitap'],
  'tasks #10': ["Uncaught ReferenceError: Cannot access 'Deck' before initialization"],
  'tasks #12': ['ok SyntaxError ok SyntaxError SyntaxError SyntaxError'],
};
// Examples of the tasks call functions the student writes. These reference solutions make every
// "expression;   // value" line of an example checkable: the value must equal the comment (before " — ").
const SOLUTIONS = {
  declare: `function declare(record, script) {
  const { props, lex } = record;
  for (const n of script.lex) if (lex.has(n) || (props[n] && !props[n].configurable)) return \`SyntaxError: \${n}\`;
  for (const n of [...script.vars, ...script.functions]) if (lex.has(n)) return \`SyntaxError: \${n}\`;
  for (const n of [...script.functions].reverse()) {
    const p = props[n];
    if (p && !p.configurable && !(p.writable && p.enumerable)) return \`TypeError: \${n}\`;
  }
  for (const n of script.lex) lex.add(n);
  for (const n of script.functions) if (!props[n] || props[n].configurable) props[n] = { configurable: false, writable: true, enumerable: true };
  for (const n of script.vars) if (!props[n]) props[n] = { configurable: false, writable: true, enumerable: true };
  return "ok";
}`,
  evaluationOrder: `function evaluationOrder(graph, entry) {
  const marked = new Set();
  const order = [];
  const visit = (name) => {
    if (marked.has(name)) return;
    marked.add(name);
    for (const dep of graph[name]) visit(dep);
    order.push(name);
  };
  visit(entry);
  return order;
}`,
  getSetting: `function getSetting(settings, path) {
  return path.split(".").reduce((o, key) => o?.[key], settings);
}`,
  calc: `const OPS = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b };
function calc(a, op, b) {
  if (!Object.hasOwn(OPS, op)) throw new Error(\`нет операции «\${op}»\`);
  return OPS[op](a, b);
}`,
  parseDeck: `function parseDeck(text) {
  return JSON.parse(text);
}`,
  resolveExport: `function resolveExport(mods, name, exportName, resolveSet = []) {
  if (resolveSet.some(([m, n]) => m === name && n === exportName)) return null;
  resolveSet.push([name, exportName]);
  const m = mods[name];
  if ((m.local ?? []).includes(exportName)) return \`\${name}.\${exportName}\`;
  const forwarded = (m.indirect ?? {})[exportName];
  if (forwarded) return forwarded[1] === "*" ? \`\${forwarded[0]}.*\` : resolveExport(mods, forwarded[0], forwarded[1], resolveSet);
  if (exportName === "default") return null;
  let found = null;
  for (const star of m.star ?? []) {
    const r = resolveExport(mods, star, exportName, resolveSet);
    if (r === "ambiguous") return "ambiguous";
    if (r !== null) { if (found === null) found = r; else if (found !== r) return "ambiguous"; }
  }
  return found;
}`,
  namespaceKeys: `function exportedNames(mods, name, seen = []) {
  if (seen.includes(name)) return [];
  seen.push(name);
  const m = mods[name];
  const names = [...(m.local ?? []), ...Object.keys(m.indirect ?? {})];
  for (const star of m.star ?? []) for (const n of exportedNames(mods, star, seen)) if (n !== "default" && !names.includes(n)) names.push(n);
  return names;
}
function namespaceKeys(mods, name) {
  return exportedNames(mods, name).filter((n) => !["ambiguous", null].includes(resolveExport(mods, name, n))).sort();
}`,
};
const checkable = (code) => {
  const names = Object.keys(SOLUTIONS).filter((n) => code.includes(`${n}(`));
  const lines = code.split(LF).map((line) => {
    const m = line.match(/^(?!const |let )(.+?);\s*\/\/\s*(.+?)(?:\s+—.*)?$/);
    return m ? `__check(${JSON.stringify(m[1])}, () => (${m[1]}), ${JSON.stringify(m[2])});` : line;
  });
  return `function __check(text, fn, want) {
  const got = JSON.stringify(fn()), exp = JSON.stringify((0, eval)("(" + want + ")"));
  console.log((got === exp ? "EX-OK " : "EX-BAD ") + text + " = " + got + (got === exp ? "" : ", comment: " + want));
}
${names.map((n) => SOLUTIONS[n]).join(LF)}
${lines.join(LF)}`;
};
// the notes write the output in the comment of the line that prints it: "console.log(x);   // 3 — why"
const commented = (code) => code.split(LF).filter((l) => l.includes('console.log(') && l.includes('//'))
  .map((l) => l.slice(l.indexOf('//') + 2).trim().split(' — ')[0]);
// a page of the notes: "<script>…</script>   <!-- output — why -->", the first line names the file
const htmlCommented = (code) => code.split(LF).slice(1).map((l) => l.match(/<!-- (.*) -->\s*$/)).filter(Boolean).map((m) => m[1].split(' — ')[0].trim());
const ORIGIN = 'http://127.0.0.1:5500';
const LF = String.fromCharCode(10);
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    return `${name === 'Array' ? '' : name}(${n}) [${a.preview.properties.map(inner).join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a block that is only a quotation: it does not run, its code lines must be found in the quoted page
const QUOTES = { '// main.js, день 33 курса 2 — импорты': 'intermediate/day-33/lecture.html' };
const ATTEMPT = 'const attempt = (f) => { try { return String(f()); } catch (e) { return `${e.name}: ${e.message}`; } };\n';
// "// name.js" or "<!-- index.html -->" on the first line of a block
const fileName = (code) => {
  const first = code.split(LF)[0].trim();
  const m = first.match(/^\/\/ ([\w./-]+\.js)$/) || first.match(/^<!-- ([\w./-]+\.html) -->$/);
  return m ? m[1] : null;
};
// a page of classic scripts, one string per <script>
const scripts = (...list) => ({ 'index.html': list.map((s) => `<script>${LF}${s}${LF}</script>`).join(LF) });
const waitFor = (files) => (/setTimeout|await|import\(/.test(Object.values(files).join(LF)) ? 900 : 300);

// run a folder { name: text } on ORIGIN; the page is its index.html or a module page with main.js
async function runSite(b, files, { ms } = {}) {
  const page = files['index.html'] ? `<!doctype html><meta charset="utf-8">${LF}${files['index.html']}` : DEFAULT_PAGE;
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  await ctx.route(`${ORIGIN}/**`, (r) => {
    const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if (name === 'index.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
    if (!(name in files)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/plain';
    return r.fulfill({ contentType: `${type}; charset=utf-8`, body: files[name] });
  });
  const p = await ctx.newPage();
  const out = [];
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails;
    const what = d.exception ? (d.exception.description ?? JSON.stringify(d.exception.value)).split(LF)[0] : '';
    out.push(`${d.text} ${what}`.trim());
  });
  cdp.on('Log.entryAdded', (e) => { if (e.entry.level === 'error') out.push(e.entry.text); });
  await p.goto(`${ORIGIN}/index.html`);
  await p.waitForTimeout(ms ?? waitFor(files));
  await ctx.close();
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

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);
  const extra = async (files, want, text) => { const out = await runSite(b, files); check(same(out, want), `${text} ${JSON.stringify(out)}`); };

  for (const name of PAGES) {
    const ctx = await b.newContext();
    const src = await ctx.newPage();
    await src.goto(builtSite.urlOfFile(path.join(DAY, `${name}.html`)));
    const blocks = await src.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => {
      const next = pre.nextElementSibling;
      const heads = [...document.querySelectorAll('h2')];
      return {
        code: pre.textContent,
        dataFile: pre.dataset.file ?? null,
        section: heads.filter((h) => h.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).length,
        box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
        cheat: !!pre.closest('.cheatsheet'),
        example: !!pre.closest('.example'),
        task: pre.closest('.task')?.querySelector('.task-title')?.textContent ?? null,
      };
    }));
    await ctx.close();
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    let site = {}, section = -1, order = [];
    const unused = new Set();
    const closeSection = async () => {
      if (name === 'student' && order.length) {
        const out = await runSite(b, { ...site });
        if (!quiet) { console.log(`\n--- ${name}, section ${section} [${Object.keys(site).join(' ')}]`); for (const l of out) console.log(`    > ${l}`); }
        check(same(out, order.flatMap(commented)), `${name}, section ${section}: the files print what their comments say ${JSON.stringify(out)}`);
        unused.clear();
      }
      for (const f of unused) check(false, `${name}, section ${section}: the file ${f} is used by no run`);
      unused.clear();
      order = [];
    };
    for (const [i, blk] of blocks.entries()) {
      const first = blk.code.split(LF)[0];
      // the files of a task make one folder; elsewhere a folder is a section
      const where = name === 'tasks' ? blk.task : blk.section;
      if (where !== section) { await closeSection(); site = {}; section = where; }
      const want = EXPECT[`${name} #${i}`];
      if (QUOTES[first]) {
        const quoted = fs.readFileSync(path.join(ROOT, QUOTES[first]), 'utf8');
        const code = [...quoted.matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).join(LF);
        const lines = blk.code.split(LF).slice(1).map((l) => l.trim()).filter(Boolean);
        const missing = lines.filter((l) => !code.split(LF).some((c) => c.trim() === l));
        check(missing.length === 0, `${name} #${i}: quoted lines are in ${QUOTES[first]}${missing.length ? ` — missing: ${missing.join(' | ')}` : ''}`);
        continue;
      }
      const file = blk.dataFile ?? fileName(blk.code);
      if (name === 'student' && file === 'index.html') {
        const out = await runSite(b, { 'index.html': blk.code });
        if (!quiet) { console.log(`\n--- ${name} #${i}: ${first}`); for (const l of out) console.log(`    > ${l}`); }
        check(same(out, htmlCommented(blk.code)), `${name} #${i}: the page prints what its comments say ${JSON.stringify(out)}`);
        continue;
      }
      if (file) {
        site[file] = blk.code;
        unused.add(file);
        if (name === 'student') order.push(blk.code);
        if (!blk.box && !want) { if (!quiet) console.log(`\n--- ${name} #${i}: file ${file} of section ${section}`); continue; }
      }
      const files = file ? { ...site } : { 'index.html': `<script>${LF}${blk.example ? checkable(blk.code) : blk.code}${LF}</script>` };
      const out = await runSite(b, files);
      if (file) for (const f of Object.keys(files)) unused.delete(f);
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}${file ? ` [${Object.keys(files).join(' ')}]` : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(out.length === 0, `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) {
        const lines = out.filter((l) => l.startsWith('EX-'));
        for (const l of lines) check(l.startsWith('EX-OK'), `${name} #${i} example: ${l.slice(l.indexOf(' ') + 1)}`);
        check(lines.length > 0 && lines.length === out.length, `${name} #${i} example runs with the reference solution: ${lines.length} lines`);
        continue;
      }
      if (want) check(same(out, want), `${name} #${i} ${first}: ${JSON.stringify(out)}`);
      else if (name === 'student') check(same(out, commented(blk.code)), `${name} #${i}: output = comments ${JSON.stringify(out)}`);
      else if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output ${JSON.stringify(out)}`);
      else check(false, `${name} #${i} ${first}: no result-box`);
    }
    await closeSection();
  }

  // the notes: the homework, in Chrome
  await extra(scripts('globalThis.x = 1; var y = 2;', 'let x = 10; let y = 20;', 'console.log(x, y);'), ["Uncaught SyntaxError: Identifier 'y' has already been declared", '1 2'],
    'student homework 1: let y meets a non-configurable var (step 1), so let x is not made either; the third script reads the property x and var y');
  await extra({ 'a.js': 'import "./b.js";\nimport "./c.js";\nconsole.log("a.js");', 'b.js': 'import "./c.js";\nconsole.log("b.js");', 'c.js': 'import "./a.js";\nconsole.log("c.js");', 'main.js': 'import "./a.js";\nconsole.log("main.js");' },
    ['c.js', 'b.js', 'a.js', 'main.js'], 'student homework 2: main → a → b → c → a (evaluating): c, b, a, main');
  await extra(scripts(`var v = "глобальная";
function f() { var v = "местная"; return [eval("v"), (eval)("v"), window.eval("v"), [eval][0]("v"), eval?.("v")].join(); }
console.log(f());`), ['местная,местная,глобальная,глобальная,глобальная'], 'student homework 3 and the table: only eval(…) and (eval)(…) are direct');

  // the tasks: what the criteria ask to find, with the reference solutions
  await extra(scripts('function c() {}', 'const d = Object.getOwnPropertyDescriptor(globalThis, "c"); console.log(d.writable, d.enumerable, d.configurable);'), ['true true false'],
    'task 1: a global function is writable, enumerable, not configurable — CanDeclareGlobalFunction lets it be declared again, a let cannot shadow it');
  {
    // task 4: the seven scripts of the example as a real page; Chrome agrees with the model except function NaN
    const specs = [{ lex: ['b'], vars: ['a'], functions: ['c'] }, { lex: ['a'], vars: [], functions: [] }, { lex: [], vars: ['b'], functions: [] }, { lex: ['d'], vars: [], functions: [] },
      { lex: [], vars: [], functions: ['c'] }, { lex: ['fresh', 'c'], vars: [], functions: [] }, { lex: [], vars: [], functions: ['NaN'] }];
    const text = (s) => [...s.lex.map((n) => `let ${n} = 0;`), ...s.vars.map((n) => `var ${n};`), ...s.functions.map((n) => `function ${n}() {}`), 'console.log("ok");'].join(' ');
    const out = await runSite(b, scripts('globalThis.d = 4;', ...specs.map(text), 'console.log(typeof fresh);'));
    const chrome = out.slice(0, -1).map((l) => l.replace(/^Uncaught (\w+): Identifier '(\w+)' has already been declared$/, '$1: $2'));
    const model = new Function(`${SOLUTIONS.declare}
const hard = { configurable: false, writable: false, enumerable: false };
const win = { props: { undefined: hard, NaN: hard, d: { configurable: true, writable: true, enumerable: true } }, lex: new Set() };
return ${JSON.stringify(specs)}.map((s) => declare(win, s));`)();
    check(same(chrome.slice(0, 6), model.slice(0, 6)) && model[6] === 'TypeError: NaN' && chrome[6] === 'SyntaxError: NaN' && out.at(-1) === 'undefined',
      `task 4: Chrome gives the model's answers to six scripts, SyntaxError instead of TypeError for function NaN; fresh was not made ${JSON.stringify(chrome)} ${JSON.stringify(model)}`);
  }
  {
    // task 5: the graphs of the example as folders, every module prints its name
    const graphs = [{ main: ['a', 'b'], a: ['c'], b: ['c'], c: [] }, { main: ['a'], a: ['b', 'c'], b: ['c'], c: ['a'] },
      { main: ['storage', 'load'], load: ['deck', 'card', 'errors'], card: ['errors'], deck: ['errors'], errors: [], storage: [] }];
    const order = new Function(`${SOLUTIONS.evaluationOrder}\nreturn evaluationOrder;`)();
    for (const g of graphs) {
      const files = Object.fromEntries(Object.entries(g).map(([n, deps]) => [`${n}.js`, `${deps.map((d) => `import "./${d}.js";`).join(LF)}\nconsole.log("${n}");`]));
      await extra(files, order(g, 'main'), `task 5: the folder of ${Object.keys(g).join(',')} runs in the model's order`);
    }
  }
  await extra({ 'index.html': `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'">\n<script>
const attempt = (f) => { try { return String(f()); } catch (e) { return e.name; } };
function oldSetting(settings, path) { return eval(\`settings.\${path}\`); }
function oldCalc(a, op, b) { return eval(\`\${a} \${op} \${b}\`); }
function oldDeck(text) { return eval(\`(\${text})\`); }
${SOLUTIONS.getSetting}
${SOLUTIONS.calc}
${SOLUTIONS.parseDeck}
const OPS_NO_CHECK = OPS;
const calcNoCheck = (a, op, b) => OPS_NO_CHECK[op](a, b);
console.log(attempt(() => oldSetting({ a: 1 }, "a")), attempt(() => oldCalc(6, "*", 7)), attempt(() => oldDeck("[1]")));
console.log(getSetting({ a: 1 }, "a"), calc(6, "*", 7), parseDeck("[1]").length, typeof calcNoCheck(1, "constructor", 2), attempt(() => calc(1, "constructor", 2)));
</script>` }, ['EvalError EvalError EvalError', '1 42 1 object Error'], 'task 6: under CSP the eval versions throw EvalError, the new ones work; without Object.hasOwn the "constructor" of the table answers');
  {
    // task 7: the two fixes
    const base = { 'deck.js': 'import { Card } from "./card.js";\nexport class Deck { constructor(words) { this.cards = words.map((w) => new Card(w)); } }\nconsole.log("deck.js");', 'main.js': 'import "./load.js";\nconsole.log("main.js");' };
    const eager = 'import { Deck } from "./deck.js";\nexport class Card { constructor(word) { this.word = word; } }\nexport const EMPTY = new Deck([]);\nconsole.log("card.js: пустая колода готова");';
    const lazy = 'import { Deck } from "./deck.js";\nexport class Card { constructor(word) { this.word = word; } }\nexport function emptyDeck() { return new Deck([]); }\nconsole.log("card.js", emptyDeck instanceof Function);';
    const deckFirst = 'import "./deck.js";\nimport "./card.js";\nconsole.log("load.js");';
    const cardFirst = 'import "./card.js";\nimport "./deck.js";\nconsole.log("load.js");';
    await extra({ ...base, 'card.js': eager, 'load.js': cardFirst }, ['deck.js', 'card.js: пустая колода готова', 'load.js', 'main.js'], 'task 7, fix 1: card.js first — deck.js runs first, Deck is ready');
    await extra({ ...base, 'card.js': lazy, 'load.js': deckFirst }, ['card.js true', 'deck.js', 'load.js', 'main.js'], 'task 7, fix 2: a function instead of EMPTY works with deck.js first');
    await extra({ ...base, 'card.js': lazy, 'load.js': cardFirst }, ['deck.js', 'card.js true', 'load.js', 'main.js'], 'task 7, fix 2: and with card.js first');
    await extra({ ...base, 'card.js': eager, 'load.js': cardFirst, 'main.js': 'import "./deck.js";\nimport "./load.js";\nconsole.log("main.js");' },
      ["Uncaught ReferenceError: Cannot access 'Deck' before initialization"], 'task 7: fix 1 breaks when another file imports deck.js before load.js');
  }
  {
    // task 8: the modules of the example as files; every local export holds its "module.name"
    const mods = { ru: { local: ['hello', 'yes', 'default'] }, tk: { local: ['hello', 'bye'] }, base: { local: ['hello'] }, a: { star: ['base'] }, b: { star: ['base'] }, all: { star: ['ru', 'tk'] },
      same: { star: ['a', 'b'] }, mine: { local: ['hello'], star: ['ru'] }, ns: { indirect: { ru: ['ru', '*'] } }, loop1: { star: ['loop2'] }, loop2: { star: ['loop1'] } };
    const files = Object.fromEntries(Object.entries(mods).map(([n, m]) => [`${n}.js`, [...(m.local ?? []).map((x) => (x === 'default' ? `export default "${n}.default";` : `export const ${x} = "${n}.${x}";`)),
      ...Object.entries(m.indirect ?? {}).map(([x, [from]]) => `export * as ${x} from "./${from}.js";`), ...(m.star ?? []).map((s) => `export * from "./${s}.js";`)].join(LF)]));
    const model = new Function(`${SOLUTIONS.resolveExport}\n${SOLUTIONS.namespaceKeys}\nreturn [resolveExport, namespaceKeys];`)();
    const cases = [['all', 'bye'], ['all', 'hello'], ['same', 'hello'], ['mine', 'hello'], ['ns', 'ru'], ['loop1', 'x']];
    const said = [], got = [];
    for (const [m, x] of cases) {
      const r = model[0](mods, m, x);
      said.push(r);
      const out = await runSite(b, { ...files, 'main.js': `import { ${x} } from "./${m}.js";\nconsole.log(typeof ${x} === "object" ? "${x === 'ru' ? 'ru' : '?'}.*" : ${x});` });
      got.push(/conflicting star exports/.test(out[0]) ? 'ambiguous' : /does not provide an export named/.test(out[0]) ? null : out[0]);
    }
    const keys = await runSite(b, { ...files, 'main.js': 'import * as all from "./all.js";\nconsole.log(Object.keys(all).join());' });
    check(same(said, got) && same(keys, [model[1](mods, 'all').join()]), `task 8: Chrome agrees with resolveExport on six cases and with namespaceKeys on all ${JSON.stringify(got)} ${JSON.stringify(keys)}`);
  }

  // what the lecture only tells about: scripts and the global record
  await extra(scripts(`${ATTEMPT}console.log(attempt(() => Object.preventExtensions(globalThis)));`, 'console.log("один"); null.x; console.log("не дойдём");', 'console.log("два");'),
    ['TypeError: Cannot prevent extensions', 'один', "Uncaught TypeError: Cannot read properties of null (reading 'x')", 'два'],
    'lecture 2, 4: the window cannot be made non-extensible; a runtime error stops a script after its first lines, the next script runs');
  await extra(scripts('let top = 1;', 'let name = "имя"; console.log(name, window.name === "", Object.getOwnPropertyDescriptor(window, "name").configurable, Object.getOwnPropertyDescriptor(window, "NaN").configurable);', 'console.log(twice()); function twice() { return 1; } function twice() { return 2; }'),
    ["Uncaught SyntaxError: Identifier 'top' has already been declared", 'имя true true false', '2'],
    'lecture 4, 5: let top is an error, let name is not (the property is configurable, NaN is not); of two functions the last one wins, made before the first line');
  {
    const report = 'console.log(["before", "made", "after", "fresh"].map((n) => n in window).join());';
    await extra(scripts('let a = 1;', 'var a = 2; var before = 1; function made() {}', report), ["Uncaught SyntaxError: Identifier 'a' has already been declared", 'false,false,false,false'],
      'lecture 5, Chrome: a conflict on the first name creates nothing');
    await extra(scripts('var a = 1;', 'let fresh = 1; var before = 1; let a = 2;', report, 'let fresh = 3; console.log(fresh);'), ["Uncaught SyntaxError: Identifier 'a' has already been declared", 'false,false,false,false', '3'],
      'lecture 5, Chrome: a conflict of a lexical name creates nothing, not even the let before it');
  }
  // modules
  await extra({ 'bad.js': 'console.log("bad.js");\nthrow new Error("сбой");', 'good.js': 'console.log("good.js");', 'main.js': 'import "./bad.js";\nimport "./good.js";\nconsole.log("main.js");' },
    ['bad.js', 'Uncaught Error: сбой'], 'lecture 9: an error of a dependency stops the walk, the next module does not run');
  await extra({ 'lib.js': 'console.log("lib.js");\nexport const a = 1;', 'main.js': 'import { b } from "./lib.js";\nconsole.log("main.js");' },
    ["Uncaught SyntaxError: The requested module './lib.js' does not provide an export named 'b'"], 'lecture 7: a link error — the dependency that linked does not run either');
  await extra({ 'words.json': '["kitap", "suw"]', 'main.js': 'console.log("main.js");\nimport { length } from "./words.json" with { type: "json" };' },
    ["Uncaught SyntaxError: The requested module './words.json' does not provide an export named 'length'"], 'lecture 6: a named import from JSON is a link error');
  await extra({ 'a.js': `import "./b.js";\nexport default function () { return "функция"; }`, 'c.js': 'import "./d.js";\nexport default () => "стрелка";',
    'b.js': `import fromA from "./a.js";\nconsole.log("b.js:", fromA(), fromA.name);`, 'd.js': `import fromC from "./c.js";\n${ATTEMPT}console.log("d.js:", attempt(() => fromC()));`, 'main.js': 'import "./a.js";\nimport "./c.js";' },
  ['b.js: функция default', "d.js: ReferenceError: Cannot access 'fromC' before initialization"], 'lecture 7: in a cycle export default function is ready at link time, an arrow is not');
  await extra({ 'base.js': 'export const hello = "привет";', 'ru.js': 'export * from "./base.js";', 'tk.js': 'export * from "./base.js";\nexport const own = 1;',
    'all.js': 'export * from "./ru.js";\nexport * from "./tk.js";', 'mine.js': 'export * from "./ru.js";\nexport const hello = "своё";',
    'main.js': 'import { hello } from "./all.js";\nimport { hello as mine } from "./mine.js";\nconsole.log(hello, mine);' },
  ['привет своё'], 'lecture 8: two stars of one binding are not ambiguous; an own export is stronger than a star');
  await extra({ 'f.js': 'export default function () {}', 'c.js': 'export default class {}', 'a.js': 'export default () => {};',
    'main.js': 'import f from "./f.js";\nimport c from "./c.js";\nimport a from "./a.js";\nconsole.log(f.name, c.name, a.name);' }, ['default default default'], 'lecture 10: the three anonymous default exports are named "default"');
  {
    const cards = { 'errors.js': 'console.log("errors.js");', 'card.js': 'import "./errors.js";\nconsole.log("card.js");', 'deck.js': 'import "./errors.js";\nconsole.log("deck.js");',
      'storage.js': 'console.log("storage.js");', 'main.js': 'import "./storage.js";\nimport "./load.js";\nconsole.log("main.js");' };
    await extra({ ...cards, 'load.js': 'import "./deck.js";\nimport "./card.js";\nimport "./errors.js";\nconsole.log("load.js");' },
      ['storage.js', 'errors.js', 'deck.js', 'card.js', 'load.js', 'main.js'], 'lecture 17: swap the imports of load.js — the order changes');
  }
  await extra({ 'x.js': 'console.log("x.js");\nexport const x = 1;', 'main.js': 'import defer * as ns from "./x.js";\nconsole.log(ns.x);' }, ["Uncaught SyntaxError: Unexpected token '*'"], 'lecture 10: import defer * as — SyntaxError in Chrome 156');
  await extra({ 'x.js': 'export const x = 1;', 'main.js': 'console.log(await import.defer("./x.js"));' }, ["Uncaught SyntaxError: Unexpected identifier 'defer'"], 'reference: import.defer() — SyntaxError in Chrome 156');
  await extra({ 'x.js': 'export const x = 1;', 'main.js': 'import source src from "./x.js";\nconsole.log(src);' }, ["Uncaught SyntaxError: Unexpected identifier 'src'"], 'reference: import source — SyntaxError in Chrome 156');
  await extra({ 'x.js': 'export const x = 1;', 'main.js': 'console.log(await import.source("./x.js"));' }, ["Uncaught SyntaxError: Unexpected identifier 'source'"], 'reference: import.source() — SyntaxError in Chrome 156');
  await extra({ 'x.js': 'export default "по умолчанию";', 'main.js': 'import defer from "./x.js";\nimport source from "./x.js";\nconsole.log(defer, source, typeof AbstractModuleSource, Object.getPrototypeOf(WebAssembly.Module) === Function.prototype);' },
    ['по умолчанию по умолчанию undefined true'], 'lecture 10, reference: defer and source are not reserved; there is no AbstractModuleSource in Chrome 156, WebAssembly.Module has no such parent');
  // eval
  await extra(scripts(`${ATTEMPT}const ts = trustedTypes.createPolicy("demo", { createScript: (s) => s }).createScript("1 + 1");
console.log(typeof ts, eval(ts), (0, eval)(ts), typeof eval(new String("2 + 2")), eval(42));`), ['object 2 2 object 42'],
  'lecture 12, 15: Chrome runs a TrustedScript (the text of 2026 returns a non-string as it is); a String object and a number come back');
  await extra({ 'index.html': `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'">\n<script>setTimeout("console.log('строка')", 0);</script>` },
    [`Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script: "script-src 'self' 'unsafe-inline'".${LF} The action has been blocked.`],
    'lecture 15: under CSP a string timer does not run, Chrome writes "The action has been blocked"');
  await extra(scripts(`${ATTEMPT}class Base {}
class Child extends Base { constructor() { super(); this.ok = attempt(() => eval("super.constructor === Base")); } }
class Plain { constructor() { this.err = attempt(() => eval("super()")); } }
console.log(attempt(() => eval("super.x")), "|", new Plain().err, "|", new Child().ok);`),
  ["SyntaxError: 'super' keyword unexpected here | SyntaxError: 'super' keyword unexpected here | true"], 'lecture 12, step 4: super.x outside a method and super() outside a derived constructor are SyntaxErrors');
  await extra(scripts('let g = 1;', `${ATTEMPT}console.log(attempt(() => (0, eval)("var g = 2")), "|", attempt(() => (0, eval)("let g = 2; g")), "|", g);`),
    ["SyntaxError: Identifier 'g' has already been declared | 2 | 1"], 'lecture 14: var of an indirect eval against a global let is a SyntaxError, a let of eval lives apart');
  await extra(scripts(`var scope = "глобальная";
function test() { var scope = "локальная"; return [eval("scope"), new Function("return scope")(), Function("s", '"use strict"; return s + "!"')(scope)].join(" | "); }
console.log(test());`), ['локальная | глобальная | локальная!'], 'lecture 16: Function parses its body in the global scope, values come as parameters');
  await b.close();

  // what the lecture says about the text of ECMA-262 2026
  const spec = fs.readFileSync(SPEC, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const callers = (op) => callersOf(spec, op);

  check(f('sec-scripts').includes('ScriptBody : StatementList [~Yield, ~Await, ~Return]')
    && hasAll(f('sec-parse-script'), ['If script is a List of errors, return script', '[[Realm]] : realm, [[ECMAScriptCode]] : script, [[LoadedModules]] : «», [[HostDefined]] : hostDefined',
      'the reporting of any errors must be deferred until the point where this specification actually performs ParseScript upon that source text'])
    && hasAll(f('sec-script-records'), ['[[Realm]]', '[[ECMAScriptCode]]', '[[LoadedModules]]', '[[HostDefined]]', 'Table 34']),
  'lecture 2: a script has no return and no yield or await operators; ParseScript returns the errors or a Script Record of four fields (table 34); errors are reported when ParseScript runs');
  check(hasAll(f('sec-scripts-static-semantics-early-errors'), ['It is a Syntax Error if the LexicallyDeclaredNames of ScriptBody contains any duplicate entries',
    'It is a Syntax Error if any element of the LexicallyDeclaredNames of ScriptBody also occurs in the VarDeclaredNames of ScriptBody', 'Contains super unless the source text containing super is eval code that is being processed by a direct eval',
    'Contains NewTarget unless the source text containing NewTarget is eval code that is being processed by a direct eval', 'ContainsDuplicateLabels', 'ContainsUndefinedBreakTarget', 'ContainsUndefinedContinueTarget', 'AllPrivateIdentifiersValid'])
    && f('sec-scriptisstrict').includes('If ScriptBody is present and the Directive Prologue of ScriptBody contains a Use Strict Directive, return true')
    && f('sec-script-semantics-runtime-semantics-evaluation').includes('Script : [empty] Return undefined'),
  'lecture 2, 3: 16.1.1 — repeated and conflicting names, super and new.target outside direct eval, labels, break and continue, #names; 16.1.2; an empty script gives undefined');
  check(inOrder(f('sec-runtime-semantics-scriptevaluation'), ['Let scriptContext be a new ECMAScript code execution context', 'Set the Function of scriptContext to null', 'Set the Realm of scriptContext to scriptRecord. [[Realm]]',
    'Set the ScriptOrModule of scriptContext to scriptRecord', 'Set the VariableEnvironment of scriptContext to globalEnv', 'Set the LexicalEnvironment of scriptContext to globalEnv', 'Push scriptContext onto the execution context stack',
    'Let result be Completion (GlobalDeclarationInstantiation (script, globalEnv))', 'If result is a normal completion, then Set result to Completion (Evaluation of script)', 'Set result to NormalCompletion (undefined)',
    'Suspend scriptContext and remove it from the execution context stack']),
  'lecture 3: ScriptEvaluation — a context with the realm, the script and the global record, on the stack; GlobalDeclarationInstantiation, then the text only if it did not throw; empty becomes undefined');
  check(hasAll(f('sec-HostLoadImportedModule'), ['referrer (a Script Record, a Cyclic Module Record, or a Realm Record)', 'An example of when referrer can be a Realm Record is in a web browser host'])
    && f('sec-HostLoadImportedModule').includes('onclick'),
  'lecture 3: HostLoadImportedModule gets a Script Record, a module or a realm (note 1: an onclick attribute)');
  const gdi = f('sec-globaldeclarationinstantiation');
  check(inOrder(gdi, ['For each element name of lexNames, do If HasLexicalDeclaration (env, name) is true, throw a SyntaxError exception', 'Let hasRestrictedGlobal be ? HasRestrictedGlobalProperty (env, name)',
    'If hasRestrictedGlobal is true, throw a SyntaxError exception', 'For each element name of varNames, do If HasLexicalDeclaration (env, name) is true, throw a SyntaxError exception', 'in reverse List order',
    'the last declaration is used', 'Let fnDefinable be ? CanDeclareGlobalFunction (env, fn). If fnDefinable is false, throw a TypeError exception', 'Let vnDefinable be ? CanDeclareGlobalVar (env, vn). If vnDefinable is false, throw a TypeError exception',
    'Block-Level Function Declarations Web Legacy Compatibility Semantics', 'Let strict be ScriptIsStrict of script. If strict is false', 'Perform ? CreateGlobalVarBinding (env, F, false)',
    'Lexically declared names are only instantiated here but not initialized', 'Perform ? CreateGlobalFunctionBinding (env, fn, fo, false)', 'Perform ? CreateGlobalVarBinding (env, vn, false)',
    'If any such errors are detected, no bindings are instantiated for the script', 'properties that are directly created on the global object result in global bindings that may be shadowed by let/const/class declarations'])
    && f('sec-hasrestrictedglobalproperty').includes('The global property "undefined" is an example of such a property')
    && f('sec-candeclareglobalfunction').includes('If existingProp. [[Configurable]] is true, return true. If IsDataDescriptor (existingProp) is true and existingProp has attribute values { [[Writable]] : true, [[Enumerable]] : true }, return true. Return false')
    && f('sec-candeclareglobalvar').includes('If hasProperty is true, return true. Return ? IsExtensible (globalObject)'),
  'lecture 4, 5: GlobalDeclarationInstantiation — lexical names against lexical and restricted (undefined), var against lexical, functions from the end, two TypeErrors, B.3.2 for a non-strict script, then lexical without values, functions, vars; note 2; CanDeclareGlobalFunction and CanDeclareGlobalVar');
  check(hasAll(f('sec-module-semantics-static-semantics-early-errors'), ['It is a Syntax Error if the ExportedNames of ModuleItemList contains any duplicate entries',
    'It is a Syntax Error if any element of the ExportedBindings of ModuleItemList does not also occur in either the VarDeclaredNames', 'It is a Syntax Error if ModuleItemList Contains super', 'It is a Syntax Error if ModuleItemList Contains NewTarget',
    'The duplicate ExportedNames rule implies that multiple export default ExportDeclaration items within a ModuleBody is a Syntax Error', 'checked during module linking prior to evaluation of a Module']),
  'lecture 6: 16.2.1.1 — repeated export names (two export default), an export of an undeclared name, super and new.target, the rest at link time');
  check(hasAll(f('sec-abstract-module-records'), ['[[Realm]]', '[[Environment]]', 'This field is set when the module is linked', '[[Namespace]]', 'LoadRequestedModules', 'GetExportedNames', 'ResolveExport', 'Link ()', 'Evaluate ()'])
    && hasAll(f('sec-cyclic-module-records'), ['new, unlinked, linking, linked, evaluating, evaluating-async, or evaluated', '[[EvaluationError]]', '[[DFSAncestorIndex]]', 'The List is in source text occurrence order of the imports',
      '[[CycleRoot]]', '[[HasTLA]]', '[[AsyncEvaluationOrder]]', '[[AsyncParentModules]]', '[[PendingAsyncDependencies]]'])
    && hasAll(f('sec-source-text-module-records'), ['[[Context]]', '[[ImportMeta]]', '[[ImportEntries]]', '[[LocalExportEntries]]', '[[IndirectExportEntries]]', '[[StarExportEntries]]'])
    && hasAll(f('sec-synthetic-module-records'), ['It has no imports or dependencies', 'JSON modules']) && f('sec-parse-json-module').includes('Return CreateDefaultExportSyntheticModule (parseResult. [[Value]])')
    && f('sec-create-default-export-synthetic-module').includes('SetSyntheticModuleExport (module, "default"')
    && f('sec-smr-resolveexport').includes('If module. [[ExportNames]] does not contain exportName, return null'),
  'lecture 6: Module Record, Cyclic Module Record, Source Text Module Record and Synthetic Module Record — the fields and methods named; JSON gives a synthetic module with "default"; its ResolveExport knows only its names');
  check(/> 16\.2\.1\.9 GetImportedModule/.test(f('sec-GetImportedModule')) && /> 16\.2\.1\.10 HostLoadImportedModule/.test(f('sec-HostLoadImportedModule'))
    && /> 16\.2\.1\.11 FinishLoadingImportedModule/.test(f('sec-FinishLoadingImportedModule')) && /> 16\.2\.1\.13 GetModuleNamespace/.test(f('sec-getmodulenamespace'))
    && /> 16\.2\.1\.6\.1\.3\.4 AsyncModuleExecutionFulfilled/.test(f('sec-async-module-execution-fulfilled')) && /> 16\.2\.1\.8\.2 ParseJSONModule/.test(f('sec-parse-json-module')),
  'lecture 6, 8, 9: the numbers 16.2.1.9, 16.2.1.10, 16.2.1.11, 16.2.1.13, 16.2.1.6.1.3.4, 16.2.1.8.2');
  check(hasAll(f('sec-moduledeclarationlinking'), ['For each Cyclic Module Record m of stack, do Assert : m. [[Status]] is linking. Set m. [[Status]] to unlinked'])
    && inOrder(f('sec-innermoduleinstantiation'), ['Set module. [[Status]] to linking', 'Set module. [[DFSAncestorIndex]] to index', 'For each ModuleRequest Record request of module. [[RequestedModules]]',
      'Perform ? module. InitializeEnvironment ()', 'Set requiredModule. [[Status]] to linked']),
  'lecture 7: Link — on an error every module of the stack is unlinked again; InnerModuleLinking — linking, an index, the requests in order, then InitializeEnvironment, a component becomes linked together');
  check(inOrder(f('sec-source-text-module-record-initialize-environment'), ['For each ExportEntry Record e of module. [[IndirectExportEntries]]', 'If resolution is either null or ambiguous, throw a SyntaxError exception',
    'Let env be NewModuleEnvironment (realm. [[GlobalEnv]])', 'If in. [[ImportName]] is namespace-object, then Let namespace be GetModuleNamespace (importedModule)', 'Perform CreateImportBinding (env, in. [[LocalName]], resolution. [[Module]], resolution. [[BindingName]])',
    'Perform ! env. InitializeBinding (dn, undefined)', 'Perform ! env. CreateImmutableBinding (dn, true)', 'Let fo be InstantiateFunctionObject of d with arguments env and privateEnv. Perform ! env. InitializeBinding (dn, fo)'])
    && f('sec-module-environment-records-getthisbinding').includes('Return undefined'),
  'lecture 1, 7: InitializeEnvironment — forwarded exports, a module record over the global one, imports, var = undefined, let/const/class without a value, functions now; this of a module is undefined');
  check(inOrder(f('sec-resolveexport'), ['If module and r. [[Module]] are the same Module Record and exportName is r. [[ExportName]], then Assert : This is a circular import request. Return null',
    'For each ExportEntry Record e of module. [[LocalExportEntries]]', 'For each ExportEntry Record e of module. [[IndirectExportEntries]]', 'If e. [[ImportName]] is all, then', '[[BindingName]] : namespace',
    'If exportName is "default", then', 'A default export cannot be provided by an export * from "mod" declaration', 'For each ExportEntry Record e of module. [[StarExportEntries]]',
    'If resolution. [[Module]] and starResolution. [[Module]] are not the same Module Record, return ambiguous', 'If resolution. [[BindingName]] is not starResolution. [[BindingName]], return ambiguous'])
    && f('sec-getexportednames').includes('If n is not "default", then') && f('sec-getexportednames').includes('GetExportedNames does not filter out or throw an exception for names that have ambiguous star export bindings')
    && hasAll(f('sec-getmodulenamespace'), ['If resolution is a ResolvedBinding Record, append name to unambiguousNames', 'GetModuleNamespace never throws. Instead, unresolvable names are simply excluded from the namespace']),
  'lecture 8: ResolveExport — a circle gives null, own exports, forwarded (a namespace for export * as), no "default" from a star, stars — ambiguous on different bindings; GetExportedNames without default and without filtering; GetModuleNamespace keeps only resolved names');
  check(inOrder(f('sec-innermoduleevaluation'), ['If module is not a Cyclic Module Record, then Perform ? EvaluateModuleSync (module)', 'If module. [[Status]] is either evaluating-async or evaluated, then If module. [[EvaluationError]] is empty, return index. Return ? module. [[EvaluationError]]',
    'If module. [[Status]] is evaluating, return index', 'Set module. [[Status]] to evaluating', 'For each ModuleRequest Record request of module. [[RequestedModules]]',
    'Set module. [[PendingAsyncDependencies]] to module. [[PendingAsyncDependencies]] + 1. Append module to requiredModule. [[AsyncParentModules]]', 'If module. [[PendingAsyncDependencies]] > 0 or module. [[HasTLA]] is true',
    'Set module. [[AsyncEvaluationOrder]] to IncrementModuleAsyncEvaluationCount ()', 'perform ExecuteAsyncModule (module)', 'Perform ? module. ExecuteModule ()', 'set requiredModule. [[Status]] to evaluated', 'set requiredModule. [[Status]] to evaluating-async', 'Set requiredModule. [[CycleRoot]] to module'])
    && hasAll(f('sec-moduleevaluation'), ['returns a Promise', 'Set m. [[Status]] to evaluated. Set m. [[EvaluationError]] to result'])
    && inOrder(f('sec-async-module-execution-fulfilled'), ['Perform GatherAvailableAncestors (module, execList)', 'sorted by their [[AsyncEvaluationOrder]] field in ascending order'])
    && f('sec-gather-available-ancestors').includes('Set m. [[PendingAsyncDependencies]] to m. [[PendingAsyncDependencies]] - 1'),
  'lecture 9, 17: InnerModuleEvaluation — a synthetic module at once, a remembered error, a cycle returns, requests in order, async dependencies counted, an order number, ExecuteAsyncModule or ExecuteModule, the component gets its root; Evaluate keeps the error; parents ready together run by AsyncEvaluationOrder');
  check(hasAll(f('sec-source-text-module-records'), ['import v from "mod"; "mod" "default" "v"', 'import * as ns from "mod"; "mod" namespace-object "ns"', 'import {x as v} from "mod"; "mod" "x" "v"', 'import "mod"; An ImportEntry Record is not created',
    'export {v as x}; "x" null null "v"', 'export {x} from "mod"; "x" "mod" "x" null', 'export default 42; "default" null null "*default*"', 'export * from "mod"; null "mod" all-but-default null', 'export * as ns from "mod"; "ns" "mod" all null', 'Table 54', 'Table 56'])
    && f('sec-exports-runtime-semantics-evaluation').includes('If IsAnonymousFunctionDefinition (AssignmentExpression) is true, then Let value be ? NamedEvaluation of AssignmentExpression with argument "default"')
    && f('sec-runtime-semantics-instantiateordinaryfunctionobject').includes('Perform SetFunctionName (F, "default")')
    && f('sec-runtime-semantics-bindingclassdeclarationevaluation').includes('ClassDeclaration : class ClassTail Let sourceText be the source text matched by ClassDeclaration. Return ? ClassDefinitionEvaluation of ClassTail with arguments undefined, "default"')
    && /> 15\.7\.15 Runtime Semantics: BindingClassDeclarationEvaluation/.test(f('sec-runtime-semantics-bindingclassdeclarationevaluation'))
    && /> 16\.2\.3\.7 Runtime Semantics: Evaluation/.test(f('sec-exports-runtime-semantics-evaluation')),
  'lecture 10: tables 54 and 56 for the nine forms; "default" — SetFunctionName in 15.2.4, ClassDefinitionEvaluation in 15.7.15, NamedEvaluation in 16.2.3.7');
  check(hasAll(f('sec-exports-static-semantics-early-errors'), ['ExportDeclaration : export NamedExports ; It is a Syntax Error if the ReferencedBindings of NamedExports contains any StringLiteral',
    'It is a Syntax Error if the StringValue of n is a ReservedWord or the StringValue of n is one of "implements", "interface", "let", "package", "private", "protected", "public", or "static"',
    'each ReferencedBindings of NamedExports is treated as an IdentifierReference'])
    && f('sec-exports').includes('ExportSpecifier : ModuleExportName ModuleExportName as ModuleExportName')
    && /> 16\.2\.1\.7\.2\.2 ResolveExport/.test(f('sec-resolveexport')) && /> 16\.2\.3\.1 Static Semantics: Early Errors/.test(f('sec-exports-static-semantics-early-errors')),
  'task 9: 16.2.3.1 — no string as a local reference, no reserved word (and static) as a reference, the note; the name after as is any ModuleExportName; the undeclared name is 16.2.1.1; task 8 is 16.2.1.7.2.2');
  check(['import defer', 'import source', 'AbstractModuleSource', 'TrustedScript', 'HostGetCodeForEval'].every((w) => !spec.includes(w)),
    'lecture 10, 15: the text of 2026 has no import defer, import source, AbstractModuleSource and no rule for TrustedScript');
  check(hasAll(f('sec-function-calls-runtime-semantics-evaluation'), ['If ref is a Reference Record, IsPropertyReference (ref) is false, and ref. [[ReferencedName]] is "eval", then If SameValue (func, %eval%) is true',
    'Return ? PerformEval (evalArg, strictCaller, true)', 'A CallExpression evaluation that executes step 6.a.v is a direct eval'])
    && f('sec-eval-x').includes('Return ? PerformEval (x, false, false)')
    && f('sec-grouping-operator-runtime-semantics-evaluation').includes('This algorithm does not apply GetValue to Evaluation of Expression')
    && f('sec-optional-chaining-chain-evaluation').includes('OptionalChain : ?. Arguments Let thisChain be this OptionalChain. Let tailCall be IsInTailPosition (thisChain). Return ? EvaluateCall (baseValue, baseReference, Arguments, tailCall)')
    && f('sec-tagged-templates-runtime-semantics-evaluation').includes('Return ? EvaluateCall (tagFunc, tagRef, TemplateLiteral, tailCall)')
    && /> 13\.3\.9\.2 Runtime Semantics: ChainEvaluation/.test(f('sec-optional-chaining-chain-evaluation')) && /> 13\.3\.11\.1 Runtime Semantics: Evaluation/.test(f('sec-tagged-templates-runtime-semantics-evaluation')),
  'lecture 11: a direct eval — a reference, not a property, named "eval", valued %eval%; eval(x) itself is PerformEval(x, false, false); parentheses keep the reference; ?. and a tag go to EvaluateCall');
  check(inOrder(f('sec-performeval'), ['If x is not a String, return x', 'Perform ? HostEnsureCanCompileStrings (evalRealm, «», x, direct)', 'Let thisEnvRec be GetThisEnvironment ()',
    'Let script be ParseText (x, Script). If script is a List of errors, throw a SyntaxError exception', 'If inFunction is false and body Contains NewTarget, throw a SyntaxError exception',
    'If inMethod is false and body Contains SuperProperty, throw a SyntaxError exception', 'If inDerivedConstructor is false and body Contains SuperCall, throw a SyntaxError exception',
    'If inClassFieldInitializer is true and ContainsArguments of body is true, throw a SyntaxError exception', 'If strictCaller is true, let strictEval be true. Else, let strictEval be ScriptIsStrict of script',
    'Let lexEnv be NewDeclarativeEnvironment (runningContext \'s LexicalEnvironment). Let varEnv be runningContext \'s VariableEnvironment', 'Let lexEnv be NewDeclarativeEnvironment (evalRealm. [[GlobalEnv]]). Let varEnv be evalRealm. [[GlobalEnv]]',
    'If strictEval is true, set varEnv to lexEnv', 'Let result be Completion (EvalDeclarationInstantiation (body, varEnv, lexEnv, privateEnv, strictEval))', 'Set result to NormalCompletion (undefined)',
    'Bindings introduced by let, const, or class declarations are always instantiated in a new LexicalEnvironment']),
  'lecture 12, 13: PerformEval — a non-string back as it is, the host, the this environment, parse as Script and four SyntaxErrors, strictness, the environments of direct, indirect and strict eval, then EvalDeclarationInstantiation; let always new');
  check(inOrder(f('sec-evaldeclarationinstantiation'), ['If varEnv is a Global Environment Record, then For each element name of varNames, do If HasLexicalDeclaration (varEnv, name) is true, throw a SyntaxError exception',
    'Repeat, while thisEnv and varEnv are not the same Environment Record', 'If thisEnv is not the Environment Record for a Catch clause, throw a SyntaxError exception', 'in reverse List order',
    'Perform ? CreateGlobalVarBinding (varEnv, vn, true)', 'Perform ! varEnv. CreateMutableBinding (vn, true)'])
    && f('sec-functiondeclarationinstantiation').includes('Perform ! varEnv. CreateMutableBinding (n, false)')
    && hasAll(f('sec-functiondeclarationinstantiation'), ['bindings created by direct eval calls in the formal parameter list are outside the environment where parameters are declared',
      'Non-strict functions use a separate Environment Record for top-level lexical declarations so that a direct eval can determine whether any var scoped declarations introduced by the eval code conflict'])
    && /> 19\.2\.1\.3 EvalDeclarationInstantiation/.test(f('sec-evaldeclarationinstantiation')),
  'lecture 13, 14: EvalDeclarationInstantiation — a global lexical name, no lexical name on the way to varEnv (but catch), functions from the end, deletable names; FunctionDeclarationInstantiation — not deletable, an environment for eval in defaults, a separate one for top-level let');
  check(f('sec-hostensurecancompilestrings').includes('The default implementation of HostEnsureCanCompileStrings is to return NormalCompletion (unused)')
    && f('sec-createdynamicfunction').includes('Perform ? HostEnsureCanCompileStrings (currentRealm, parameterStrings, bodyString, false)')
    && f('sec-native-error-types-used-in-this-standard-evalerror').includes('This exception is not currently used within this specification'),
  'lecture 15: HostEnsureCanCompileStrings does nothing by default; CreateDynamicFunction asks it too; EvalError is not used by the specification');

  // what the lecture says about MDN
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
  const pages = ['reference/global_objects/eval', 'reference/statements/import/defer', 'reference/statements/import/source', 'reference/operators/import/defer', 'reference/operators/import/source', 'reference/global_objects/abstractmodulesource'];
  check(pages.every((p) => mdn(p).startsWith('---\ntitle:')) && pages.slice(1, 5).every((p) => mdn(p).includes('status:\n  - experimental')),
    'footer: the six MDN pages are in the cache; import defer, import source and their import.*() forms are experimental');
  {
    const ev = mdn('reference/global_objects/eval');
    const reasons = ev.slice(ev.indexOf('### Never use direct eval()!'));
    check(hasAll(ev, ['including invoking it via an aliased variable, via a member access or other expression, or through the optional chaining', 'Indirect eval can be seen as if the code is evaluated within a separate `<script>` tag',
      'eval?.(`"use strict"; with (Math) console.log(PI);`)', 'always passing {{domxref("TrustedScript")}} objects instead of strings'])
      && inOrder(reasons, ['executes the code it\'s passed with the privileges of the caller', 'is slower than the alternatives', 'Minifiers give up on any minification', '#### Using indirect eval()', 'class Map {}', '#### Using the Function() constructor',
        '#### Using bracket accessors', '#### Using callbacks', '#### Using JSON']),
    'lecture 11, 12, 15, 16: MDN eval — the indirect forms, "a separate <script> tag", strictness shown with with, TrustedScript; caller\'s privileges, slower, minifiers; indirect eval first, the local Map, then Function, brackets, callbacks, JSON');
  }
  check(hasAll(mdn('reference/statements/import/defer'), ['`defer` is not a reserved word', 'the source code is linked but remains unevaluated'])
    && hasAll(mdn('reference/statements/import/source'), ['`source` is not a reserved word', 'the source code is parsed and compiled but remains unlinked and unevaluated'])
    && mdn('reference/global_objects/abstractmodulesource').includes('### AbstractModuleSource objects\n\n- [`WebAssembly.Module`]'),
  'lecture 10: MDN — defer: linked, not evaluated; source: compiled, not evaluated; neither word is reserved; AbstractModuleSource — only WebAssembly.Module');
  check(hasAll(mdn('reference/statements/import/defer').replace(/\s+/g, ' '), ['only the "namespace import" syntax is supported', 'because the execution is triggered by property access on the namespace object',
    'Reading a namespace property is synchronous, so it cannot wait for asynchronous module evaluation', 'are evaluated eagerly']),
  'student homework 4: MDN import defer — only a namespace import, as evaluation starts on a property access; a property read is synchronous, so modules with top-level await run eagerly');

  // the days and the modules of «Карточки» it points to
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  check(hasAll(read('intermediate/day-03/lecture.html'), ['Две половины глобальной области', 'разбираем в курсе 3', 'Cannot delete property'])
    && hasAll(read('intermediate/day-30/lecture.html'), ['Модуль и обычный скрипт', 'CreateImportBinding', 'не напечатает'])
    && read('intermediate/day-31/lecture.html').includes('import.meta') && read('intermediate/day-31/lecture.html').includes('with { type: "json" }'),
  'lecture: course 2 — two halves of the global scope, eval promised, delete false or TypeError (day 3); modules, import bindings, a link error runs nothing (30); JSON modules (31)');
  check(read('advanced/day-04/lecture.html').includes('Значение завершения в консоли') && hasAll(read('advanced/day-08/lecture.html'), ['LexicallyDeclaredNames', 'VarDeclaredNames', 'NamedEvaluation', 'Contains: super и new.target'])
    && hasAll(read('advanced/day-09/lecture.html'), ['Реалм', 'GetThisEnvironment', 'Object.isFrozen(first())']) && read('advanced/day-10/lecture.html').includes('скобки не теряют ссылку')
    && read('advanced/day-11/lecture.html').includes('B.3.2, день') && read('advanced/day-12/lecture.html').includes('для <code>eval</code> в умолчаниях, день 13')
    && read('advanced/day-12/lecture.html').includes('<figcaption>Окружения вызова функции с кодом в параметрах</figcaption>'),
  'lecture: course 3 — the completion value in the console (day 4); names, NamedEvaluation, super and new.target (8); realm, GetThisEnvironment, frozen template strings (9); parentheses keep the reference (10); B.3.2 (11); eval in defaults promised and the scheme of section 3 (12)');
  {
    const code33 = [...read('intermediate/day-33/lecture.html').matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1]));
    const of = (head) => code33.filter((c) => c.split(LF)[0] === head).pop() ?? '';
    const imports = (c) => c.split(LF).filter((l) => l.startsWith('import ')).map((l) => l.match(/"\.\/([\w.]+)"/)[1]).join();
    const storage = [...read('intermediate/day-31/lecture.html').matchAll(/<pre class="code js"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => textOf(m[1])).filter((c) => c.startsWith('// storage.js'));
    check(imports(of('// load.js')) === 'card.js,deck.js,errors.js' && imports(of('// card.js')) === 'errors.js' && imports(of('// deck.js')) === 'errors.js'
      && storage.length > 0 && storage.every((c) => !c.includes('import ')) && code33.some((c) => c.includes('await openDeck();')),
    `lecture 17: in «Карточки» load.js imports card, deck, errors; card and deck import errors; storage.js imports nothing; main.js awaits on the top ${imports(of('// load.js'))}`);
  }
  const plan = read('docs/plan-3-advanced.md');
  const csvRows = (file) => fs.readFileSync(path.join(ROOT, 'docs/coverage', file), 'utf8').split('\n').map(csvLine);
  const spRows = csvRows('ecma262.csv');
  const dayOf = (id) => { const r = spRows.find((c) => c[0] === id); return r ? `${r[6]}.${r[7]}` : '?'; };
  check(dayOf('sec-block-level-function-declarations-web-legacy-compatibility-semantics') === '3.31' && dayOf('sec-with-statement') === '3.31'
    && plan.includes('**14. Внутренние методы обычных объектов и функций.**') && read('docs/plan-0-overview.md').includes('| A4 Объекты изнутри |')
    && /W1 DOM[^|]*\|[^\n]*Trusted Types/.test(read('docs/plan-0-overview.md')),
  'lecture: B.3.2 and with are day 31; day 14 is the internal methods, module A4 «Объекты изнутри»; Trusted Types are course 4');

  // the reference table holds every row of the plan as a link, every anchor of the lecture exists
  const lecture = read('advanced/day-13/lecture.html');
  const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
  const refRows = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)">/g)].map((m) => m[1]);
  const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/2026\/#([\w.%-]+)/g)].map((m) => m[1]));
  const rows = spRows.filter((c) => c[6] === '3' && c[7] === '13').map((c) => c[0]);
  const notInTable = rows.filter((id) => !refRows.includes(id));
  check(rows.length === 14 && refRows.length === 14 && notInTable.length === 0, `plan: ${rows.length} rows of ECMA-262 for day 13, ${refRows.length} rows in the reference table, missing: ${notInTable.join(', ') || 'none'}`);
  const mdnRows = csvRows('mdn-javascript.csv').filter((c) => c[5] === '3' && c[6] === '13');
  const mdnInTable = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">/g)].map((m) => m[1]);
  check(mdnRows.length === 6 && mdnRows.every((c) => mdnInTable.includes(c[0])) && mdnInTable.length === 6, `plan: ${mdnRows.length} MDN pages of day 13, ${mdnInTable.length} in the reference table`);
  const full = [...spRows.filter((c) => c[6] === '3' && c[7] === '13' && c[9] === 'подробно').map((c) => c[0]), ...mdnRows.filter((c) => c[8] === 'подробно').map((c) => c[0])];
  const marked = [...refTable.matchAll(/#([\w.%-]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g), ...refTable.matchAll(/docs\/([^"]+)">[^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]);
  check(full.length === 6 && JSON.stringify(full) === JSON.stringify(marked), `plan: the 6 rows "подробно" are marked so in the table ${JSON.stringify(marked)}`);
  const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
  check(gone.length === 0, `links: ${anchors.size} anchors of tc39.es, not in the 2026 text: ${gone.join(', ') || 'none'}`);
  check(callers('EvalDeclarationInstantiation').includes('PerformEval') && callers('GlobalDeclarationInstantiation').includes('ScriptEvaluation') && callers('InitializeEnvironment').includes('InnerModuleLinking'),
    `who calls: PerformEval — EvalDeclarationInstantiation, ScriptEvaluation — GlobalDeclarationInstantiation, InnerModuleLinking — InitializeEnvironment`);

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
