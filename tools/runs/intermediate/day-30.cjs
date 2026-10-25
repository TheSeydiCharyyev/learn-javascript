// Course 2, day 30, in Chrome: modules. A code block whose first line is "// name.js" (or "<!-- index.html -->" for an
// html block) is a file of the student's folder. Files pile up section by section (a section is an h2 of the page;
// a later file with the same name replaces the earlier one), and a result-box right after a block runs the folder as
// Live Server would: every file is served on http://127.0.0.1:5500/ (.js as text/javascript, a missing file as 404
// text/html), and the page is the section's index.html or a default one with <script type="module" src="main.js">.
// helpers.js (wait, later, failLater — the block of section 10 of the lecture, checked word for word) is in every
// folder. Every run gets a fresh browser context, so no module comes from a cache. Output is the console as DevTools
// shows it: console calls, uncaught errors ("Uncaught SyntaxError: …"), and the browser's own error messages (CORS,
// MIME type, a 404 while loading).
//   node tools/runs/intermediate/day-30.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-30.cjs --quiet    only the checks
// Checks: a result-box equals the output of its folder; every file block is used by a run of its section; the notes
// run without an error; extra runs cover the claims of the prose (what the MDN pages and ECMA-262 say, file://, a
// missing file, paths, MIME type, the error table, hoisting, deferred and once-only execution, the console, cycles,
// the three experiments of «Карточки») and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-30');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
const SPEC = path.join(__dirname, '../../.cache/ecma262-2026.html');
const REV = '5a81c288fb72';
const ORIGIN = 'http://127.0.0.1:5500';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);
const HELPERS = `export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const later = (value, ms) => new Promise((resolve) => setTimeout(resolve, ms, value));
export const failLater = (text, ms) => new Promise((resolve, reject) => {
  setTimeout(() => reject(new Error(text)), ms);
});`;
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'error') return `<error object ${a.description.split(LF)[0]}>`;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    return `${name === 'Array' ? '' : name}(${n}) [${a.preview.properties.map(inner).join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  // a module namespace object previews as Module {…, Symbol(Symbol.toStringTag): 'Module'}; the day never prints one
  if (a.type === 'object' && a.className === 'Module') return `<module namespace object>`;
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};

const mdnPage = (p) => execFileSync('git', [`--git-dir=${GIT}`, 'show', `${REV}:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
const has = (p, s) => mdnPage(p).includes(s);
const specRaw = fs.readFileSync(SPEC, 'utf8');
const spec = specRaw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const inSpec = (s) => spec.includes(s);

// "// name.js" or "<!-- name.html -->" on the first line of a block
const fileName = (code) => {
  const first = code.split(LF)[0].trim();
  const m = first.match(/^\/\/ ([\w./-]+\.js)$/) || first.match(/^<!-- ([\w./-]+\.html)(?: —.*)? -->$/);
  return m ? m[1] : null;
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // how long a page stays open: every number of three or four digits in the folder added up, plus a margin
  const waitFor = (site) => Math.min(4000, [...Object.values(site).join(LF).matchAll(/\b(\d{3,4})\b/g)].reduce((sum, m) => sum + Number(m[1]), 500));
  // run a folder: { files }, served on ORIGIN, or written to a temporary folder and opened as file://
  const run = async (files, { ms, fileUrl, after } = {}) => {
    const site = { 'helpers.js': HELPERS, ...files };
    const page = site['index.html'] ? `<meta charset="utf-8">${LF}${site['index.html']}` : DEFAULT_PAGE;
    const ctx = await b.newContext(MAIN);
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      if (name === 'index.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (!(name in site)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
      const type = name.endsWith('.js') ? 'text/javascript' : 'text/plain';
      return r.fulfill({ contentType: `${type}; charset=utf-8`, body: site[name] });
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
    let dir = null;
    if (fileUrl) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'day30-'));
      for (const [n, t] of Object.entries({ ...site, 'index.html': page })) {
        fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true });
        fs.writeFileSync(path.join(dir, n), t);
      }
      await p.goto('file:///' + path.join(dir, 'index.html').replace(/\\/g, '/'));
    } else {
      await p.goto(`${ORIGIN}/index.html`);
    }
    await p.waitForTimeout(ms ?? waitFor(site));
    const extraOut = after ? await p.evaluate(after) : undefined;
    await ctx.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    return after ? { out, extraOut } : out;
  };

  // the blocks of a page in order: html and js, with their file name, section (h2 index) and result-box
  const all = {};
  {
    const ctx = await b.newContext(MAIN);
    for (const name of PAGES) {
      const src = await ctx.newPage();
      await src.goto('file:///' + path.join(DAY, `${name}.html`).replace(/\\/g, '/'));
      all[name] = await src.evaluate(() => [...document.querySelectorAll('pre.code')].map((pre) => {
        const next = pre.nextElementSibling;
        const heads = [...document.querySelectorAll('h2')];
        return {
          code: pre.textContent,
          html: pre.classList.contains('html'),
          section: heads.filter((h) => h.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).length,
          box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          cheat: !!pre.closest('.cheatsheet'),
          task: pre.closest('.task')?.querySelector('.task-title')?.textContent ?? null,
        };
      }));
      await src.close();
    }
    await ctx.close();
  }

  // the lecture and the notes: folders by section, a run at every result-box (lecture) or at the end of a section (notes)
  const used = new Set();
  for (const name of ['lecture', 'student']) {
    const blocks = all[name];
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);
    let site = {}, section = -1, pending = [];
    const flush = async (label, box) => {
      const out = await run(site);
      if (!quiet) {
        console.log(`\n--- ${name} ${label}: ${Object.keys(site).join(', ')}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      check(!out.some((l) => l.startsWith('<error object') || l.startsWith('<module')), `${name} ${label}: no error or module object printed`);
      if (box) check(same(out, box), `${name} ${label}: result-box = output (${out.length} lines)${same(out, box) ? '' : ` ${JSON.stringify(out)} vs ${JSON.stringify(box)}`}`);
      else check(!out.some((l) => /^Uncaught|Failed|blocked/.test(l)), `${name} ${label}: runs without an error ${JSON.stringify(out)}`);
      for (const i of pending) used.add(`${name} ${i}`);
      pending = [];
    };
    for (const [i, blk] of blocks.entries()) {
      if (blk.cheat) continue;
      if (blk.section !== section) {
        if (name === 'student' && pending.length) await flush(`section ${section} (end)`, null);
        site = {};
        section = blk.section;
        pending = [];
      }
      const file = fileName(blk.code);
      check(!!file, `${name} #${i}: the first line names a file (${blk.code.split(LF)[0]})`);
      if (!file) continue;
      site[file === 'index.html' ? 'index.html' : file] = blk.code;
      pending.push(i);
      if (blk.box) await flush(`#${i} (${file})`, blk.box);
    }
    if (name === 'student' && pending.length) await flush(`section ${section} (end)`, null);
    for (const [i, blk] of blocks.entries()) {
      if (!blk.cheat && fileName(blk.code)) check(used.has(`${name} ${i}`), `${name} #${i} (${fileName(blk.code)}) is used by a run of its section`);
    }
  }
  // the lecture's helpers.js is the one every folder gets
  check(all.lecture.filter((x) => fileName(x.code) === 'helpers.js').map((x) => x.code.split(LF).slice(1).join(LF)).join() === HELPERS, 'lecture: helpers.js is the HELPERS of the run, word for word');

  const lec = (line) => all.lecture.find((x) => x.code.includes(line)).code;
  const task = (line) => all.tasks.find((x) => x.code.includes(line)).code;
  const extra = async (files, want, text, opts) => {
    const res = await run(files, opts);
    const out = opts?.after ? res.out : res;
    const ok = typeof want === 'function' ? want(out, res.extraOut) : same(out, want);
    check(ok, `${text}: ${JSON.stringify(out)}${opts?.after ? ` | ${JSON.stringify(res.extraOut)}` : ''}`);
    return res;
  };
  const lecture = fs.readFileSync(path.join(DAY, 'lecture.html'), 'utf8');

  // what the prose says the MDN pages say
  const G = 'guide/modules';
  check(has(G, "you'll run into CORS errors due to JavaScript module security requirements") && has(G, 'modules use {{jsxref("Strict_mode", "strict mode", "", 1)}} automatically') && has(G, 'modules are deferred automatically') && has(G, 'Modules are only executed once, even if they have been referenced in multiple `<script>` tags') && has(G, "you won't be able to access them from the JavaScript console"), 'lecture 3, 10: CORS on file://, strict, deferred, once, not in the console');
  check(has(G, 'the graph can be evaluated using a depth-first traversal') && has(G, "Cyclic imports don't always fail") && has(G, 'Merge the two modules into one') && has(G, 'Move the shared code into a third module') && has(G, 'Import declarations are [hoisted]'), 'lecture 5, 11: depth-first, cycles do not always fail, three cures, hoisting');
  check(has(G, 'basically get redirected through the file and don\'t really exist there') && has(G, 'act as big [asynchronous functions]') && has(G, "it won't block other modules being loaded") && has(G, '## Avoiding naming conflicts') && has(G, 'The imported values are read-only views'), 'lecture 5, 7, 9, 10: pass-through, a big async function, siblings not blocked, naming conflicts, read-only views');
  check(has(G, 'Import maps') && has(G, '"imports"') && has(G, 'JavaScript will throw a `TypeError` if it attempts to import a module specifier that can\'t be resolved'), 'lecture 3: import maps, a bare name without a map is a TypeError');
  const I = 'reference/statements/import';
  check(has(I, '_Relative specifiers_ that start with `/`, `./`, or `../`') && has(I, '_Absolute specifiers_') && has(I, '_Bare specifiers_') && has(I, 'You cannot omit the file extension'), 'lecture 3: three kinds of paths; the extension');
  check(has(I, 'is not equivalent to `import defaultExport from "mod"` and then destructuring') && has(I, 'is a [sealed](/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isSealed) object with [`null` prototype]') && has(I, 'because of the high possibility of name conflicts') && has(I, 'any module holding an exported object can mutate the object') && has(I, '_live bindings_'), 'lecture 6, 7, 8: not destructuring; sealed with a null prototype; no import *; objects can be mutated; live bindings');
  const E = 'reference/statements/export';
  check(has(E, 'Export declarations are not subject to [temporal dead zone]') && has(E, 'using more than one `default` export will result in a {{jsxref("SyntaxError")}}') && has(E, 'If we want to export a single value representing an entire module') && has(E, 'Named exports are useful when you need to export several values') && has(E, '"barrel module"') && has(E, 'the default export of `mod` is not re-exported') && has(E, 'neither one is re-exported'), 'lecture 4, 6, 9: export before the declaration; one default; when default, when named; barrel; * without default; a conflict re-exports nothing');
  check(has('reference/errors/import_decl_module_top_level', 'SyntaxError: Cannot use import statement outside a module (V8-based)') && has('reference/errors/import_decl_module_top_level', 'title: "SyntaxError: import declarations may only appear at top level of a module"') && has('reference/errors/import_decl_module_top_level', '(Firefox)'), 'lecture 13: the error page — its title is the Firefox text, V8 has its own');
  // what the prose says ECMA-262 2026 says
  check(inSpec('Module code is always strict mode code.') && inSpec('The GetThisBinding concrete method of a Module Environment Record envRec takes no arguments and returns a normal completion containing undefined') && inSpec('It creates a new initialized immutable indirect binding for the name N') && inSpec('If the binding exists but is uninitialized a ReferenceError is thrown'), 'lecture 14: strict; this undefined; an immutable indirect binding; uninitialized — ReferenceError');
  check(inSpec('The duplicate ExportedNames rule implies that multiple export default ExportDeclaration items within a ModuleBody is a Syntax Error') && inSpec('It is a Syntax Error if ModuleItemList Contains super.') && inSpec('It is a Syntax Error if ModuleItemList Contains NewTarget.') && inSpec('It is a Syntax Error if the BoundNames of ImportDeclaration contains any duplicate entries.'), 'lecture 14: early errors 16.2.1.1 and 16.2.2.1');
  check(inSpec('new, unlinked, linking, linked, evaluating, evaluating-async, or evaluated') && inSpec('Table 52: Additional Fields of Source Text Module Records') && inSpec('[[StarExportEntries]]') && inSpec('[[IndirectExportEntries]]'), 'lecture 14: the statuses; the four lists of table 52');
  check(inSpec('Multiple different (referrer, moduleRequest.[[Specifier]], moduleRequest.[[Attributes]]) triples may map to the same Module Record instance') && inSpec('The list is sorted according to lexicographic code unit order') && inSpec('{ [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: false }') && /takes arguments P \(a property key\), V \(an ECMAScript language value\), and Receiver \(an ECMAScript language value\) and returns a normal completion containing false/.test(spec), 'lecture 14: the same module record; sorted keys; writable but [[Set]] is false');
  check(lecture.includes('import()</code> дня 31') || lecture.includes('день 31'), 'lecture: dynamic import is day 31');

  // lecture 3: file://, a missing extension, a bare name, the MIME type
  const words = { 'words.js': 'console.log("words.js выполняется");\nexport const words = ["book"];' };
  await extra({ ...words, 'main.js': 'import { words } from "./words.js";\nconsole.log(words);' }, (out) => out.length === 2 && /^Access to script at 'file:\/\/\/.*\/main\.js' from origin 'null' has been blocked by CORS policy/.test(out[0]) && out[1] === 'Failed to load resource: net::ERR_FAILED', 'lecture 3: file:// — blocked by CORS, nothing runs', { fileUrl: true });
  await extra({ ...words, 'main.js': 'import { words } from "./words";\nconsole.log(words);' }, ['Failed to load resource: the server responded with a status of 404 (Not Found)'], 'lecture 3: "./words" — 404, nothing runs');
  await extra({ ...words, 'main.js': 'import { words } from "words.js";\nconsole.log(words);' }, ['Uncaught TypeError: Failed to resolve module specifier "words.js". Relative references must start with either "/", "./", or "../".'], 'lecture 3: a bare name');
  await extra({ 'words.txt': 'export const w = 1;', 'main.js': 'import { w } from "./words.txt";\nconsole.log(w);' }, ['Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/plain". Strict MIME type checking is enforced for module scripts per HTML spec.'], 'lecture 3: not JavaScript — the MIME type');
  // lecture 4: export rules
  await extra({ 'main.js': 'function f() {\n  export const x = 1;\n}' }, ["Uncaught SyntaxError: Unexpected token 'export'"], 'lecture 4: export inside a function');
  await extra({ 'm.js': 'export const x = 1;\nconst y = 2;\nexport { y as x };', 'main.js': 'import "./m.js";\nconsole.log("main");' }, ["Uncaught SyntaxError: Duplicate export of 'x'"], 'lecture 4: a duplicate export');
  await extra({ 'm.js': 'export { x };\nconst x = 1;', 'main.js': 'import { x } from "./m.js";\nconsole.log(x);' }, ['1'], 'lecture 4: export before the declaration');
  // lecture 5: the same name twice; hoisting in the middle of the file
  {
    const main = lec('import * as tk from "./turkmen.js";').replace('import { name as enName, count as enCount } from "./english.js";\nimport * as tk from "./turkmen.js";', 'import { name, count } from "./english.js";\nimport { name, count } from "./turkmen.js";');
    check(main.includes('import { name, count } from "./turkmen.js";'), 'lecture 5: the imports without renaming');
    await extra({ 'english.js': lec('export const name = "английский";'), 'turkmen.js': lec('export const name = "туркменский";'), 'hello.js': lec('// hello.js'), 'main.js': main }, ["Uncaught SyntaxError: Identifier 'name' has already been declared"], 'lecture 5: the same name from two modules');
    await extra({ 'hello.js': lec('// hello.js'), 'main.js': 'console.log("первая строка main.js");\nimport "./hello.js";' }, ['hello.js: только побочный эффект', 'первая строка main.js'], 'lecture 5: an import in the middle of the file still runs first');
  }
  // lecture 6: default expressions and anonymous declarations; a named import is not destructuring
  await extra({ 'a.js': 'export default 1 + 1;', 'b.js': 'export default function () {}', 'c.js': 'export default class {}', 'main.js': 'import two from "./a.js";\nimport f from "./b.js";\nimport K from "./c.js";\nconsole.log(two, f.name, K.name);' }, ['2 default default'], 'lecture 6: export default 1 + 1; anonymous function and class are named "default"');
  await extra({ 'w.js': 'export default { book: "книга" };', 'main.js': 'import { book } from "./w.js";\nconsole.log(book);' }, ["Uncaught SyntaxError: The requested module './w.js' does not provide an export named 'book'"], 'lecture 6: a named import is not destructuring of the default');
  // lecture 7: an exported object can be changed, and everyone sees it
  await extra({ 'settings.js': 'export const settings = { theme: "light" };', 'a.js': 'import { settings } from "./settings.js";\nsettings.theme = "dark";', 'main.js': 'import "./a.js";\nimport { settings } from "./settings.js";\nconsole.log(settings.theme);' }, ['dark'], 'lecture 7: the properties of an exported object can be changed');
  // lecture 8: the namespace object
  await extra({ 'lesson.js': lec('export const title = "Модули";'), 'main.js': 'import * as lesson from "./lesson.js";\nconsole.log(Object.isExtensible(lesson), Object.isFrozen(lesson), JSON.stringify(Object.getOwnPropertyDescriptor(lesson, "day")));' }, ['false false {"value":30,"writable":true,"enumerable":true,"configurable":false}'], 'lecture 8, 14: not extensible, not frozen, a writable data property');
  // lecture 9: cards.js does not see what it passes on; a conflict of two export *
  await extra({ 'words.js': lec('export default "слова";'), 'stats.js': lec('// stats.js\nexport function percent'), 'cards.js': `${lec('export * as Stats from "./stats.js";')}\nconsole.log("cards.js:", typeof words, typeof pct);`, 'main.js': 'import "./cards.js";' }, ['cards.js: undefined undefined'], 'lecture 9: the barrel does not see the names it passes on');
  {
    const conflict = { 'words.js': 'export const a = 1;', 'stats.js': 'export const a = 3;', 'cards.js': 'export * from "./words.js";\nexport * from "./stats.js";' };
    await extra({ ...conflict, 'main.js': 'import * as cards from "./cards.js";\nconsole.log(cards.a, "a" in cards);' }, ['undefined false'], 'lecture 9: two export * with one name — the name is not there');
    await extra({ ...conflict, 'main.js': 'import { a } from "./cards.js";\nconsole.log(a);' }, ["Uncaught SyntaxError: The requested module './cards.js' contains conflicting star exports for name 'a'"], 'lecture 9, 13: importing it directly');
  }
  // lecture 10: deferred; once; twice for a classic script; not in the console
  await extra({ 'index.html': '<!-- index.html -->\n<head><script type="module" src="main.js"></script><script src="classic.js"></script></head>\n<body><p id="msg">готово</p></body>', 'main.js': 'console.log("модуль:", document.querySelector("#msg").textContent);', 'classic.js': 'console.log("обычный:", document.querySelector("#msg"));' }, ['обычный: null', 'модуль: готово'], 'lecture 10: a module in <head> runs after the page is parsed');
  await extra({ 'index.html': '<!-- index.html -->\n<script src="c.js"></script><script src="c.js"></script>\n<script type="module" src="m.js"></script><script type="module" src="m.js"></script>', 'c.js': 'console.log("обычный");', 'm.js': 'console.log("модуль");' }, ['обычный', 'обычный', 'модуль'], 'lecture 10: twice in the page — a classic script runs twice, a module once');
  await extra({ 'index.html': '<!-- index.html -->\n<script>const fromScript = 1;</script>\n<script type="module" src="main.js"></script>', 'main.js': 'const fromModule = 2;\nconsole.log(fromModule);' }, (out, x) => same(out, ['2']) && same(x, ['number', 'undefined']), 'lecture 10: the console sees a classic const, not a module const', { after: '[typeof fromScript, typeof fromModule]' });
  await extra({ 'main.js': 'console.log(new.target);' }, ['Uncaught SyntaxError: new.target expression is not allowed here'], 'lecture 14: new.target at the top level of a module');
  // lecture 11: a cycle that does not fail (the example of the guide)
  await extra({ 'first.js': 'import { second } from "./second.js";\nsetTimeout(() => console.log("first.js видит", second), 10);\nexport const first = 1;', 'second.js': 'import { first } from "./first.js";\nsetTimeout(() => console.log("second.js видит", first), 10);\nexport const second = 2;', 'main.js': 'import "./first.js";' }, ['second.js видит 1', 'first.js видит 2'], 'lecture 11: a cycle read later works');
  // lecture 13: the rest of the error table
  await extra({ 'index.html': '<!-- index.html -->\n<script src="main.js"></script>', 'main.js': 'import { words } from "./words.js";' }, ['Uncaught SyntaxError: Cannot use import statement outside a module'], 'lecture 13: import in a classic script');
  await extra({ 'index.html': '<!-- index.html -->\n<script src="words.js"></script>', 'words.js': 'export const words = [];' }, ["Uncaught SyntaxError: Unexpected token 'export'"], 'lecture 13: export in a classic script');
  await extra({ ...words, 'main.js': 'function load() {\n  import { words } from "./words.js";\n}' }, ["Uncaught SyntaxError: Unexpected token '{'"], 'lecture 13: import { } inside a function of a module');
  await extra({ ...words, 'main.js': 'if (true) {\n  import { words } from "./words.js";\n}' }, ["Uncaught SyntaxError: Unexpected token '{'"], 'lecture 13: import { } inside if');
  await extra({ 'm.js': 'export default 1;\nexport default 2;', 'main.js': 'import "./m.js";' }, ["Uncaught SyntaxError: Identifier '.default' has already been declared"], 'lecture 13: two export default');
  // lecture 14: a link error — nothing in the graph runs, not even the modules that loaded fine
  await extra({ ...words, 'stats.js': 'console.log("stats.js выполняется");\nexport const total = 1;', 'main.js': 'import { total } from "./stats.js";\nimport { words, count } from "./words.js";\nconsole.log("main.js");' }, ["Uncaught SyntaxError: The requested module './words.js' does not provide an export named 'count'"], 'lecture 14: a link error — no module runs');
  await extra({ 'stats.js': 'console.log("stats.js выполняется");\nnull.x;\nexport const total = 1;', 'main.js': 'import { total } from "./stats.js";\nconsole.log("main.js");' }, ['stats.js выполняется', "Uncaught TypeError: Cannot read properties of null (reading 'x')"], 'lecture 14: an error while running — the modules before it ran');

  // lecture 15: the three experiments of «Карточки»
  {
    const cards = { 'words.js': lec('{ id: 4, word: "apple", ru: "яблоко" },'), 'progress.js': lec('const LEARNED = Symbol.for("cards.learned");'), 'main.js': lec('import { learned, markLearned, isLearned } from "./progress.js";') };
    await extra(cards, (out) => out.length === 2 && /blocked by CORS policy/.test(out[0]), 'lecture 15, experiment 1: file:// — nothing runs', { fileUrl: true });
    await extra({ ...cards, 'main.js': `${cards['main.js']}\nlearned = 0;` }, ['выучено: 0', 'выучено: 2 из 4', 'повторить: water, apple', '{"id":1,"word":"book","ru":"книга"}', 'Uncaught TypeError: Assignment to constant variable.'], 'lecture 15, experiment 2: learned = 0 in main.js');
    const noExport = cards['progress.js'].replace('export function isLearned', 'function isLearned');
    check(noExport !== cards['progress.js'], 'lecture 15, experiment 3: export removed');
    await extra({ ...cards, 'progress.js': noExport }, ["Uncaught SyntaxError: The requested module './progress.js' does not provide an export named 'isLearned'"], 'lecture 15, experiment 3: not even «выучено: 0»');
  }

  // tasks: the blocks are files of the tasks; the folders with a main.js run as they are
  {
    const order = { 'z.js': task('console.log("z");'), 'x.js': task('console.log("x");'), 'y.js': task('console.log("y");'), 'main.js': task('console.log("main");') };
    await extra(order, ['z', 'x', 'y', 'main'], 'task 2: z, x, y, main');
    await extra({ ...order, 'index.html': '<!-- index.html -->\n<script type="module" src="main.js"></script>\n<script type="module" src="main.js"></script>' }, ['z', 'x', 'y', 'main'], 'task 2: main.js twice in the page — the same four lines');
    const cycle = { 'deck.js': task('export const deck = ["book", "water", "bread"];'), 'stats.js': task('export const size = deck.length;'), 'main.js': 'import "./deck.js";' };
    await extra(cycle, ["Uncaught ReferenceError: Cannot access 'deck' before initialization"], 'task 8: the cycle as given');
    await extra({ ...cycle, 'stats.js': 'import { deck } from "./deck.js";\nexport function describe() {\n  return `в колоде ${deck.length}`;\n}' }, ['в колоде 3'], 'task 8: fix 1 — read deck later');
    await extra({ 'words.js': 'export const deck = ["book", "water", "bread"];', 'deck.js': 'import { deck } from "./words.js";\nimport { describe } from "./stats.js";\nconsole.log(describe());\nexport { deck };', 'stats.js': 'import { deck } from "./words.js";\nexport const size = deck.length;\nexport function describe() {\n  return `в колоде ${size}`;\n}', 'main.js': 'import "./deck.js";' }, ['в колоде 3'], 'task 8: fix 2 — the deck in a third module');
  }
  // task 1
  await extra({ 'lesson.js': task('export function next() {'), 'main.js': `import * as L from "./lesson.js";
import lesson, { day, next } from "./lesson.js";
console.log(Object.keys(L), lesson);
next();
console.log(day);
try { day = 40; } catch (e) { console.log(e.name, e.message); }
try { L.title = "JSON"; } catch (e) { console.log(e.name, e.message); }
console.log(this, typeof window.title, typeof window.L);` }, ["(4) ['day', 'default', 'next', 'title'] урок", '31', 'TypeError Assignment to constant variable.', "TypeError Cannot assign to property 'title' of [object Module]", 'undefined undefined undefined'], 'task 1: lines 1–6 and 8');
  await extra({ 'lesson.js': task('export function next() {'), 'main.js': 'import { lesson } from "./lesson.js";' }, ["Uncaught SyntaxError: The requested module './lesson.js' does not provide an export named 'lesson'"], 'task 1: line 7');
  // task 3: lines 1–5 (line 6 is the file:// run of lecture 3)
  await extra({ 'index.html': '<!-- index.html -->\n<script src="main.js"></script>', 'words.js': 'export const words = [];', 'main.js': 'import { words } from "./words.js";' }, ['Uncaught SyntaxError: Cannot use import statement outside a module'], 'task 3, line 1');
  await extra({ 'words.js': 'export const words = [];', 'main.js': 'import { words } from "words.js";' }, ['Uncaught TypeError: Failed to resolve module specifier "words.js". Relative references must start with either "/", "./", or "../".'], 'task 3, line 2');
  await extra({ 'words.js': 'console.log("words.js");\nexport const words = [];\nfunction count() {\n  return 0;\n}', 'main.js': 'import { count } from "./words.js";' }, ["Uncaught SyntaxError: The requested module './words.js' does not provide an export named 'count'"], 'task 3, line 3: and no module ran');
  await extra({ 'main.js': 'export default 1;\nexport default 2;' }, ["Uncaught SyntaxError: Identifier '.default' has already been declared"], 'task 3, line 4');
  await extra({ 'log.js': 'export function log() {}', 'main.js': 'const debug = true;\nif (debug) { import { log } from "./log.js"; }' }, ["Uncaught SyntaxError: Unexpected token '{'"], 'task 3, line 5');
  // task 4
  {
    const journal = {
      'data.js': task('export const group = "JS-2";'),
      'calc.js': 'console.log("calc.js загружен");\nexport function average(marks) {\n  return marks.reduce((sum, mark) => sum + mark, 0) / marks.length;\n}\nexport function countFives(students) {\n  return students.flatMap((s) => s.marks).filter((m) => m === 5).length;\n}',
      'view.js': 'import { average } from "./calc.js";\nexport default function row(student) {\n  return `${student.name}: ${average(student.marks).toFixed(2)}`;\n}',
      'main.js': 'import students, { group } from "./data.js";\nimport { countFives } from "./calc.js";\nimport row from "./view.js";\nconsole.log(`Группа ${group}`);\nfor (const student of students) console.log(row(student));\nconsole.log("пятёрок:", countFives(students));',
    };
    await extra(journal, ['calc.js загружен', 'Группа JS-2', 'Сапар: 4.33', 'Гульнар: 4.67', 'Ильяс: 4.00', 'пятёрок: 4'], 'task 4: the output; calc.js runs once');
    await extra({ ...journal, 'calc.js': journal['calc.js'].replace('export function countFives', 'function countFives') }, ["Uncaught SyntaxError: The requested module './calc.js' does not provide an export named 'countFives'"], 'task 4: without export — not even «Группа JS-2»');
  }
  // task 5
  await extra({
    'attempts.js': 'export let attempts = 0;\nexport let lastWord = null;\nexport function attempt(word) {\n  attempts++;\n  lastWord = word;\n}\nexport function reset() {\n  attempts = 0;\n  lastWord = null;\n}',
    'stats.js': 'import { attempts, lastWord } from "./attempts.js";\nexport function summary() {\n  return `попыток: ${attempts}, последнее: ${lastWord}`;\n}',
    'main.js': 'import { attempts, attempt, reset } from "./attempts.js";\nimport { summary } from "./stats.js";\nattempt("book");\nattempt("water");\nattempt("bread");\nconsole.log(attempts, "|", summary());\nreset();\nconsole.log(attempts, "|", summary());\ntry { attempts = 0; } catch (e) { console.log(e.name, e.message); }',
  }, ['3 | попыток: 3, последнее: bread', '0 | попыток: 0, последнее: null', 'TypeError Assignment to constant variable.'], 'task 5: the numbers of the criteria');
  // task 6
  {
    const lib = {
      'lib/words.js': 'export const words = ["book", "water", "bread"];\nexport const count = words.length;\nexport default "Слова";',
      'lib/stats.js': 'export const count = 1;\nexport function percent(part, whole) {\n  return Math.round((part / whole) * 100);\n}',
      'lib/index.js': 'export * from "./words.js";\nexport * from "./stats.js";\nexport { default as title } from "./words.js";',
    };
    await extra({ ...lib, 'main.js': 'import * as lib from "./lib/index.js";\nconsole.log(Object.keys(lib), lib.count);' }, ["(3) ['percent', 'title', 'words'] undefined"], 'task 6: count disappears');
    await extra({ ...lib, 'main.js': 'import { count } from "./lib/index.js";' }, ["Uncaught SyntaxError: The requested module './lib/index.js' contains conflicting star exports for name 'count'"], 'task 6: importing count directly');
    const fixed = { ...lib, 'lib/index.js': 'export { words, count as wordCount } from "./words.js";\nexport { count as learnedCount, percent } from "./stats.js";\nexport { default as title } from "./words.js";' };
    await extra({ ...fixed, 'main.js': 'import * as lib from "./lib/index.js";\nconsole.log(Object.keys(lib), lib.wordCount, lib.learnedCount, lib.title, lib.percent(lib.learnedCount, lib.wordCount));' }, ["(5) ['learnedCount', 'percent', 'title', 'wordCount', 'words'] 3 1 Слова 33"], 'task 6: after the fix');
  }
  // task 7
  {
    const settings = (body) => `import { later, failLater } from "./helpers.js";\nconsole.log("settings.js: загружаю");\nexport const settings = ${body};`;
    const files = { 'theme.js': 'console.log("theme.js");\nexport const name = "theme";', 'main.js': 'import { settings } from "./settings.js";\nimport "./theme.js";\nconsole.log("тема:", settings.theme, performance.now() - window.started >= 300);', 'index.html': '<!-- index.html -->\n<script>window.started = performance.now();</script>\n<script type="module" src="main.js"></script>' };
    await extra({ ...files, 'settings.js': settings('await later({ theme: "dark" }, 300)') }, ['settings.js: загружаю', 'theme.js', 'тема: dark true'], 'task 7: the order; main.js after 300 ms');
    await extra({ ...files, 'settings.js': settings('await failLater("нет связи", 200)') }, ['settings.js: загружаю', 'theme.js', 'Uncaught Error: нет связи'], 'task 7: a rejected top-level await — main.js does not run');
  }
  // task 9
  await extra({
    'store.js': 'console.log("store.js");\nlet state = { learned: 0 };\nconst listeners = [];\nexport function get() {\n  return state;\n}\nexport function update(changes) {\n  state = { ...state, ...changes };\n  for (const fn of listeners) fn(state);\n}\nexport function subscribe(fn) {\n  listeners.push(fn);\n}',
    'header.js': 'import { subscribe } from "./store.js";\nsubscribe((s) => console.log("header:", s.learned));',
    'footer.js': 'import { subscribe } from "./store.js";\nsubscribe((s) => console.log("footer:", s.learned));',
    'main.js': 'import "./header.js";\nimport "./footer.js";\nimport * as store from "./store.js";\nstore.update({ learned: 2 });\nconsole.log(store.get().learned);\ntry { store.get = null; } catch (e) { console.log(e.name, e.message); }',
  }, (out, x) => same(out, ['store.js', 'header: 2', 'footer: 2', '2', "TypeError Cannot assign to property 'get' of [object Module]"]) && x === 'undefined', 'task 9: both subscribers, store.js once, state not in the console', { after: 'typeof state' });

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
