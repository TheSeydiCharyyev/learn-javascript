// Course 3, day 25, in Chrome: using, await using, DisposableStack, AsyncDisposableStack, SuppressedError. Every block of
// the lecture runs as main.js of a folder on http://127.0.0.1 — the index.html of the lecture of day 22 (section 2 there;
// the lecture of day 25 sends the student to that folder: a module, so top-level await and using work). Output is
// awaited up to the number of lines of the result-box. The context is Ashgabat time, Russian.
//   node tools/runs/advanced/day-25.cjs            every block: output; checks below
//   node tools/runs/advanced/day-25.cjs --quiet    only the checks
// The source of the day is the draft of ECMA-262 2027 (decision of the author, 17.11.2026: the feature was merged into
// the draft on 24.06.2026, after the 2026 edition): tools/.cache/ecma262-draft-2026-11-12.html — "Draft ECMA-262 /
// November 12, 2026", its attributes put in quotes like the 2026 file; links go to https://tc39.es/ecma262/#….
// Checks: a result-box after a block equals its output; the cheatsheet runs without output; the experiments behind the
// text — the MDN page using draws the SuppressedError of its own example the other way round (Chrome and 7.5.4 put
// resource1 outside), the guide of MDN draws it right; the MDN example of two calls of await using gives required 2
// before required 1, and the same without the null resource — the null adds no await before an async resource; a null
// await using before a sync resource awaits (step 4.d: a microtask comes before the function settles, not so without
// it); an array iterator has [Symbol.dispose] but no return; the folder of day 22; every English quote of the lecture
// («…») is in the draft clauses of the day, the 27 MDN pages of the day or the output of Chrome; every step it names
// (7.5.2–7.5.4, 14.2.2, 14.3.1.3, 14.7.4.2, 14.7.5.7, 20.5.8.1.1, 27.1.3.3.17, 27.3.x, 27.4.3.4) is checked against
// the draft, and so are the texts it retells; the draft is the one of 12 November 2026 and has table 1 of 15 symbols
// (13 in 2026); the days it points to say what it says; the reference table holds all 27 rows of the day's plan (all
// MDN) with their marks and titles, every tc39.es anchor exists in the draft and every link whose text starts with a
// number names the section of that number; the footer names the draft.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const MDN_GIT = path.join(ROOT, 'tools/.cache/mdn-content.git');
const DAY = path.join(ROOT, 'advanced/day-25');
const DAY22 = path.join(ROOT, 'advanced/day-22');
const DRAFT = path.join(ROOT, 'tools/.cache/ecma262-draft-2026-11-12.html');
const DRAFT_RAW = path.join(ROOT, 'tools/.cache/ecma262-draft-2026-11-12.raw.html');
const SPEC_2026 = path.join(ROOT, 'tools/.cache/ecma262-2026.html');
const ORIGIN = 'http://127.0.0.1:5592';
const quiet = process.argv.includes('--quiet');

const LF = String.fromCharCode(10);
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => (p.type === 'string' ? q(p.value) : p.type === 'function' ? 'ƒ' : p.value);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map(inner).join(', ')}]`;
  if (a.type === 'object' && a.subtype !== 'error' && a.preview) return `{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}}`;
  return String(a.value ?? a.unserializableValue ?? a.description);
};

// a folder of files on ORIGIN (index.html must be there); console lines and uncaught errors in order. A fresh context
// each time.
async function runFolder(b, files, { lines = 0, ms = 15000, settle = 150 } = {}) {
  const ctx = await b.newContext({ timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html';
    if (!(name in files)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.html') ? 'text/html' : 'text/plain';
    return route.fulfill({ contentType: `${type}; charset=utf-8`, body: files[name] });
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const out = [];
  cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails;
    out.push(`Uncaught ${(d.exception?.description ?? d.text).split(LF)[0]}`);
  });
  await cdp.send('Runtime.enable');
  const t0 = Date.now();
  await p.goto(`${ORIGIN}/index.html`);
  while (out.length < lines && Date.now() - t0 < ms) await p.waitForTimeout(20);
  await p.waitForTimeout(settle);
  await ctx.close();
  return out;
}

// one line of docs/coverage/*.csv: a title with a comma is in double quotes
const csvLine = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
// flat text; "R. [[Order]]" (a tag between) is written "R.[[Order]]"
const flat = (html) => textOf(html).replace(/\s+/g, ' ').replace(/ ([,.)»])/g, '$1').replace(/([(«]) /g, '$1').replace(/\. \[\[/g, '.[[');
// the own part of a clause: from its id to the first nested clause
const clause = (spec, id) => {
  const at = spec.indexOf(`id="${id}"`);
  if (at === -1) return '';
  const rest = spec.slice(at);
  const next = rest.slice(10).search(/<emu-(clause|annex)\b/);
  return next === -1 ? rest : rest.slice(0, next + 10);
};
const hasAll = (text, words) => words.every((w) => text.includes(w));
// the numbers of every step whose own text holds the words, as the spec writes them: 1, a, i, 1, a, i, …
const stepPaths = (html, needle) => {
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const fmt = (p) => p.map((n, i) => (i % 3 === 0 ? n : i % 3 === 1 ? String.fromCharCode(96 + n) : roman[n - 1])).join('.');
  const re = /<(\/?)(ol|li)\b[^>]*>/g;
  let depth = -1;
  const counts = [], cur = [], found = [];
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === 'ol') { if (m[1]) depth--; else { depth++; counts[depth] = 0; } continue; }
    if (m[1] || depth < 0) continue;
    counts[depth]++; cur[depth] = counts[depth]; cur.length = depth + 1;
    const rest = html.slice(re.lastIndex);
    if (flat(rest.slice(0, rest.search(/<ol\b|<\/li>/))).includes(needle)) found.push(fmt(cur));
  }
  return found;
};
// a piece of code with one place changed: the place must be there exactly once
const swap = (code, from, to) => (code.split(from).length === 2 ? code.replace(from, () => to) : null);

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  console.log(`chrome ${b.version()}`);
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // the blocks of the lecture in page order, with the section each one is in; the folder of day 22
  const ctx0 = await b.newContext();
  const src = await ctx0.newPage();
  await src.goto(builtSite.urlOfFile(path.join(DAY, 'lecture.html')));
  const items = await src.evaluate(() => [...document.querySelectorAll('h2, pre.code, .result-box')].map((el) => {
    if (el.tagName === 'H2') return { kind: 'h2', section: Number((el.textContent.match(/^(\d+)\./) || [])[1] || 0) };
    if (el.matches('.result-box')) return { kind: 'box', lines: el.innerText.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { kind: 'code', lang: el.classList.contains('js') ? 'js' : 'html', file: el.dataset.file || null, code: el.textContent, cheat: !!el.closest('.cheatsheet') };
  }));
  const lectureText = await src.evaluate(() => document.querySelector('.container').innerText);
  await src.goto(builtSite.urlOfFile(path.join(DAY22, 'lecture.html')));
  const indexHtml = await src.evaluate(() => [...document.querySelectorAll('pre.code[data-file]')].find((pre) => pre.dataset.file === 'index.html')?.textContent);
  await ctx0.close();

  let section = 0;
  for (const it of items) { if (it.kind === 'h2') section = it.section; else it.section = section; }
  const js = items.filter((x) => x.kind === 'code' && x.lang === 'js');
  const blocks = js.filter((x) => !x.file && !x.cheat);
  const boxes = items.filter((x) => x.kind === 'box');
  check(js.length === 22 && js.filter((x) => x.file).length === 0 && js.filter((x) => x.cheat).length === 1 && blocks.length === 21
    && items.filter((x) => x.kind === 'code' && x.lang !== 'js').length === 0 && boxes.length === 21,
  `lecture: 22 js blocks (21 with a result-box and the cheatsheet), 21 result-boxes (${js.length}, ${boxes.length})`);
  check(!!indexHtml && indexHtml.includes('<script type="module" src="main.js"></script>')
    && lectureText.includes('Блоки дня — это main.js в папке дня 22: страница грузит его модулем, а в модуле можно и await, и using на верхнем уровне.'),
  'lecture 1: the blocks are main.js of the folder of day 22 — its index.html loads main.js as a module');
  const page = (main) => ({ 'index.html': indexHtml, 'main.js': main });

  // the result-boxes: the block before each one
  let last = null, n = 0;
  for (const it of items) {
    if (it.kind === 'h2') continue;
    if (it.kind === 'code') { last = it.cheat ? null : it; continue; }
    n++;
    const label = `lecture ${it.section}, box ${n}`;
    if (!last) { check(false, `${label}: no block before it`); continue; }
    const out = await runFolder(b, page(last.code), { lines: it.lines.length });
    if (!quiet) { console.log(`\n--- ${label}: ${last.code.split(LF)[0].slice(0, 70)}`); for (const l of out) console.log(`    > ${l}`); }
    check(same(out, it.lines), `${label}: result-box = output ${JSON.stringify(out)}`);
    last = null;
  }
  check(n === 21, `lecture: every result-box had a block before it (${n})`);
  const outputs = boxes.flatMap((x) => x.lines).join(LF);

  // the cheatsheet runs without output
  {
    const out = await runFolder(b, page(js.find((x) => x.cheat).code));
    check(out.length === 0, `lecture (cheatsheet) runs without output or error ${JSON.stringify(out)}`);
  }

  // section 14: the MDN example of two calls without the null resource gives the same order — the null adds no await
  // before an async resource; a null before a sync resource awaits (step 4.d) — without it the function settles first
  {
    const out = await runFolder(b, page(`class Resource {
  #name;
  constructor(name) { this.#name = name; }
  async [Symbol.asyncDispose]() { console.log("Disposing resource " + this.#name); }
}
async function example1() {
  await using required = new Resource("required 1");
  await using optional = new Resource("optional");
  await using another = new Resource("another 1");
}
async function example2() {
  await using required = new Resource("required 2");
  await using another = new Resource("another 2");
}
example1();
example2();`), { lines: 5 });
    const twoCalls = boxes.find((x) => x.lines[0] === 'Disposing resource another 1');
    check(!!twoCalls && twoCalls.section === 14 && same(out, twoCalls.lines),
      `lecture 14: without the null resource in the second call the order is the same — ${JSON.stringify(out)}`);
    const withNull = await runFolder(b, page(`const res = (name) => ({ [Symbol.dispose]() { console.log("закрыт " + name); } });
async function f() {
  using s = res("sync");
  await using n = null;
  console.log("тело");
}
f().then(() => console.log("f готова"));
Promise.resolve().then(() => console.log("микрозадача"));`), { lines: 4 });
    const withoutNull = await runFolder(b, page(`const res = (name) => ({ [Symbol.dispose]() { console.log("закрыт " + name); } });
async function f() {
  using s = res("sync");
  console.log("тело");
}
f().then(() => console.log("f готова"));
Promise.resolve().then(() => console.log("микрозадача"));`), { lines: 4 });
    check(same(withNull, ['тело', 'закрыт sync', 'микрозадача', 'f готова']) && same(withoutNull, ['тело', 'закрыт sync', 'f готова', 'микрозадача']),
      `lecture 14, step 4.d: a null await using before a sync resource awaits once — the microtask comes before the function settles ${JSON.stringify(withNull)}; without the null it settles first ${JSON.stringify(withoutNull)}`);
  }

  // section 12: an array iterator has [Symbol.dispose] (on the prototype) but no return — step 3 does nothing
  {
    const out = await runFolder(b, page(`const it = [1, 2].values();
console.log(typeof it[Symbol.dispose], Object.hasOwn(it, Symbol.dispose), it.return, it[Symbol.dispose](), it.next().value);`), { lines: 1 });
    check(same(out, ['function false undefined undefined 1']), `lecture 12: an array iterator has [Symbol.dispose] from the prototype, no return — the call does nothing, the iterator goes on ${JSON.stringify(out)}`);
  }
  await b.close();

  // the draft: the snapshot of 12 November 2026; the clauses of the day
  const spec = fs.readFileSync(DRAFT, 'utf8');
  const raw = fs.readFileSync(DRAFT_RAW, 'utf8');
  const spec26 = fs.readFileSync(SPEC_2026, 'utf8');
  const f = (id) => flat(clause(spec, id));
  const num = (id) => (clause(spec, id).match(/<span class="secnum">([^<]+)<\/span>/) || [])[1];
  const at = (id, needle) => stepPaths(clause(spec, id), needle);
  const symbols = (s) => {
    const seg = s.slice(s.indexOf('id="sec-well-known-symbols"'));
    const table = seg.slice(seg.indexOf('<table'), seg.indexOf('</table>'));
    return (table.match(/<tr>/g) || []).length - 1;
  };
  // the title has no-break spaces between the words
  check(/<title>ECMAScript®\s2027\sLanguage\sSpecification<\/title>/.test(raw) && raw.includes('Draft ECMA-262 / November 12, 2026')
    && !spec26.includes('id="sec-disposablestack-objects"') && symbols(spec) === 15 && symbols(spec26) === 13
    && lectureText.includes('Ссылки дня ведут на черновик tc39.es/ecma262 от 12 ноября 2026 года'),
  `draft: ECMAScript 2027, «Draft ECMA-262 / November 12, 2026»; DisposableStack is not in ECMA-262 2026; table 1 of the well-known symbols — ${symbols(spec)} rows (2026: ${symbols(spec26)})`);

  // MDN pages of the day
  const mdn = (p) => execFileSync('git', ['-C', MDN_GIT, 'show', `HEAD:files/en-us/web/javascript/${p.toLowerCase()}/index.md`], { encoding: 'utf8' });
  // a comment of a code block that goes on in the next line is one sentence: "has been\n    // added" → "has been added"
  const plain = (md) => md.replace(/\n[ \t]*\/\/ /g, ' ').replace(/\{\{\w+\("[^"]*",\s*"([^"]+)"[^)]*\)\}\}/g, '$1').replace(/\{\{\w+\("([^"]+)"\)\}\}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`/g, '').replace(/\*\*/g, '').replace(/\b_([^_]+)_\b/g, '$1').replace(/\s+/g, ' ');
  const mdRows = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n').map(csvLine);
  const dayRows = mdRows.filter((c) => c[5] === '3' && c[6] === '25');
  const md = Object.fromEntries(dayRows.map((c) => [c[0], mdn(c[0].replace(/^Web\/JavaScript\//, ''))]));
  const M = Object.fromEntries(Object.entries(md).map(([k, v]) => [k, plain(v)]));
  const guide = md['Web/JavaScript/Guide/Resource_management'];
  const usingPage = md['Web/JavaScript/Reference/Statements/using'];
  const awaitUsing = md['Web/JavaScript/Reference/Statements/await_using'];

  // every English quote of the lecture is in the draft clauses of the day, an MDN page of the day or the output of Chrome
  {
    const ids = ['sec-operations-on-disposable-objects', 'sec-disposableresource-records', 'sec-adddisposableresource', 'sec-getdisposemethod', 'sec-disposeresources',
      'sec-let-and-const-declarations', 'sec-let-and-const-declarations-static-semantics-early-errors', 'sec-bindingevaluation', 'sec-block-runtime-semantics-evaluation',
      'sec-scripts-static-semantics-early-errors', 'sec-switch-statement-static-semantics-early-errors', 'sec-symbol.dispose', 'sec-symbol.asyncdispose',
      'sec-suppressederror', 'sec-suppressederror.prototype.message', 'sec-disposable-interface', 'sec-asyncdisposable-interface', 'sec-disposablestack-objects',
      'sec-asyncdisposablestack-objects', 'sec-iterator.prototype-%symbol.dispose%'];
    const corpus = [...ids.map(f), ...Object.values(M), outputs].join(' ');
    const quotes = [...lectureText.matchAll(/«([A-Za-z][^»]*)»/g)].map((m) => m[1].replace(/\s+/g, ' '));
    const missing = quotes.filter((x) => !corpus.includes(x));
    check(quotes.length >= 30 && missing.length === 0, `quotes: ${quotes.length} English quotes of the lecture, not found in the draft clauses of the day, the 27 MDN pages or the output of Chrome: ${missing.join(' | ') || 'none'}`);
    // the quotes the lecture gives to the draft: each in its place of the lecture and in its own clause (a phrase that
    // is also on MDN would pass the corpus above)
    const fromDraft = [
      ['Шаг 4 проходит стек «in reverse List order»', 'sec-disposeresources', 'in reverse List order'],
      ['В черновике это ранние ошибки: «It is a Syntax Error if ContainsUsing of StatementList is true»', 'sec-scripts-static-semantics-early-errors', 'It is a Syntax Error if ContainsUsing of StatementList is true'],
      ['записывает пустую запись async-dispose — «to ensure we will still perform an Await»', 'sec-adddisposableresource', 'to ensure we will still perform an Await'],
      ['повторный вызов «should avoid repeating clean-up logic against the already-disposed resource and should not throw an exception»', 'sec-disposable-interface', 'should avoid repeating clean-up logic against the already-disposed resource and should not throw an exception'],
      ['И честно добавляет: «However, this requirement is not enforced»', 'sec-disposable-interface', 'However, this requirement is not enforced'],
    ];
    const lost = fromDraft.filter(([inLecture, id, quote]) => !lectureText.replace(/\s+/g, ' ').includes(inLecture) || !f(id).includes(quote)).map(([, id, quote]) => `${num(id)} «${quote.slice(0, 30)}»`);
    check(lost.length === 0, `quotes: ${fromDraft.length} quotes the lecture gives to the draft stand in their places and in their clauses (7.5.4, 16.1.1, 7.5.2, 27.2.1.1 twice): ${lost.join(' | ') || 'all'}`);
  }

  // section 9: the MDN page using draws its own example the other way round; the guide draws the same case right
  {
    const box9 = boxes.find((x) => x.section === 9);
    check(usingPage.includes(`  suppressed: SuppressedError: An error was suppressed during disposal${LF}    suppressed: Error: Can't dispose resource1${LF}    error: Error: Error in main block${LF}  error: Error: Can't dispose resource2`)
      && !!box9 && same(box9.lines, ["error: Can't dispose resource1", "suppressed.error: Can't dispose resource2", 'suppressed.suppressed: Error in main block'])
      && lectureText.includes("снаружи error — «Can't dispose resource2», внутри suppressed — «Can't dispose resource1», рядом error — «Error in main block»"),
    'lecture 9: MDN using («Error handling») puts resource2 outside and «Error in main block» as an error inside; Chrome puts resource1 outside and the error of the block deepest');
    check(hasAll(guide, ['console.error(e.error); // Error: Failed to release lock on reader', 'console.error(e.suppressed.suppressed); // Error: Failed to read', 'console.error(e.suppressed.error); // Error: Failed to release lock on writer']),
      'lecture 8: the guide of MDN draws the chain as Chrome gives it — e.error reader, e.suppressed.error writer, e.suppressed.suppressed the error of the body');
  }

  // section 14: MDN gives required 1 before required 2 and explains it with the null; its first example is right
  {
    check(awaitUsing.includes(`// Disposing resource optional${LF}// Disposing resource required 1${LF}// Disposing resource required 2`)
      && awaitUsing.includes('the `required 2` resource is disposed in the same tick as `required 1`')
      && awaitUsing.includes(`// Example call${LF}// Microtask done${LF}// Example done`) && awaitUsing.includes(`// Example call${LF}// Example done${LF}// Microtask done`),
    'lecture 14: MDN await using — the output of two calls has required 1 before required 2 (Chrome: the other way); its first example (Example call, Microtask done, Example done) is the one Chrome gives');
  }

  // the MDN texts the lecture retells
  {
    check(hasAll(M['Web/JavaScript/Guide/Resource_management'], ['MyReader.prototype[Symbol.dispose] = MyReader.prototype.releaseLock', 'URL.createObjectURL(exampleBlob)', 'URL.revokeObjectURL',
      'this.#disposables = disposer.move();', 'is already saved at the time of declaration', 'The resource can be null or undefined'])
      && hasAll(M['Web/JavaScript/Reference/Statements/using'], ['At the top level of a script', 'At the top level of a switch statement', 'In the initializer of a for...in loop',
        'Inside any function body or class static initialization block', 'At the top level of a module', 'export using is invalid syntax'])
      && hasAll(M['Web/JavaScript/Reference/Statements/await_using'], ['for (using x of y)', 'for await (using x of y)', 'for (await using x of y)', 'for await (await using x of y)',
        'The [Symbol.asyncDispose] property is tried first, and falls back to [Symbol.dispose]']),
    'MDN: the guide — the alias of releaseLock, adopt with URL.createObjectURL and revokeObjectURL, move() in a constructor, the method saved at declaration, null allowed; using — where it can and cannot be; await using — the four loops, asyncDispose first, then dispose');
  }

  // the steps the lecture names
  const steps = [
    ['sec-bindingevaluation', 'Perform ? AddDisposableResource (base.[[DisposableResourceStack]], value, kind)', '5.d'],
    ['sec-block-runtime-semantics-evaluation', 'Set blockValue to Completion (DisposeResources (blockEnv.[[DisposableResourceStack]], blockValue))', '6'],
    ['sec-adddisposableresource', 'If kind is sync-dispose, return unused', '2.a'],
    ['sec-adddisposableresource', 'we record that the resource was evaluated to ensure we will still perform an Await', '2.b'],
    ['sec-adddisposableresource', '[[Kind]] : async-dispose, [[DisposeMethod]] : undefined', '2.c'],
    ['sec-adddisposableresource', 'If method is undefined, throw a TypeError exception', '3.b'],
    ['sec-getdisposemethod', 'If value is not an Object, throw a TypeError exception', '1'],
    ['sec-getdisposemethod', 'If kind is sync-dispose, return ? GetMethod (value, %Symbol.dispose%)', '2'],
    ['sec-getdisposemethod', 'Let asyncMethod be ? GetMethod (value, %Symbol.asyncDispose%)', '4'],
    ['sec-getdisposemethod', 'Let syncMethod be ? GetMethod (value, %Symbol.dispose%)', '6'],
    ['sec-getdisposemethod', 'Return CreateBuiltinFunction (closure, 0, "", «»)', '10'],
    ['sec-disposeresources', 'For each element resource of disposableResourceStack, in reverse List order, do', '4'],
    ['sec-disposeresources', 'If kind is sync-dispose, needsAwait is true, and hasAwaited is false, then', '4.d'],
    ['sec-disposeresources', 'If result is a normal completion and kind is async-dispose, then', '4.e.ii'],
    ['sec-disposeresources', 'If outputCompletion is a throw completion, then', '4.e.iii.1'],
    ['sec-disposeresources', 'Let error be a newly created SuppressedError object', '4.e.iii.1.c'],
    ['sec-disposeresources', 'Set outputCompletion to result', '4.e.iii.2.a'],
    ['sec-disposeresources', 'Set needsAwait to true', '4.f.ii'],
    ['sec-disposeresources', 'If needsAwait is true and hasAwaited is false, then', '5'],
    ['sec-runtime-semantics-forloopevaluation', 'Set forDecl to Completion (DisposeResources (loopEnv.[[DisposableResourceStack]], forDecl))', '8.a'],
    ['sec-runtime-semantics-forloopevaluation', 'Set bodyResult to Completion (DisposeResources (loopEnv.[[DisposableResourceStack]], bodyResult))', '13'],
    ['sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset', 'Let status be Completion (AddDisposableResource (base.[[DisposableResourceStack]], nextValue, declKind))', '8.h.vii.4.d'],
    ['sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset', 'Set result to Completion (DisposeResources (iterationEnv.[[DisposableResourceStack]], result))', '8.k.i'],
    ['sec-suppressederror', 'If NewTarget is undefined, let newTarget be the active function object', '1'],
    ['sec-suppressederror', 'If message is not undefined, then', '3'],
    ['sec-suppressederror', 'Perform CreateNonEnumerableDataPropertyOrThrow (obj, "error", error)', '4'],
    ['sec-suppressederror', 'Perform CreateNonEnumerableDataPropertyOrThrow (obj, "suppressed", suppressed)', '5'],
    ['sec-iterator.prototype-%symbol.dispose%', 'Let return be ? GetMethod (obj, "return")', '2'],
    ['sec-iterator.prototype-%symbol.dispose%', 'If return is not undefined, then', '3'],
    ['sec-disposablestack', 'If NewTarget is undefined, throw a TypeError exception', '1'],
    ['sec-disposablestack.prototype.adopt', 'If disposableStack.[[DisposableState]] is disposed, throw a ReferenceError exception', '3'],
    ['sec-disposablestack.prototype.adopt', 'Return ? Call (onDispose, undefined, «value»)', '5.a'],
    ['sec-disposablestack.prototype.defer', 'If disposableStack.[[DisposableState]] is disposed, throw a ReferenceError exception', '3'],
    ['sec-disposablestack.prototype.defer', 'If IsCallable (onDispose) is false, throw a TypeError exception', '4'],
    ['sec-disposablestack.prototype.dispose', 'If disposableStack.[[DisposableState]] is disposed, return undefined', '3'],
    ['sec-disposablestack.prototype.dispose', 'Return ? DisposeResources (disposableStack.[[DisposableResourceStack]], NormalCompletion (undefined))', '5'],
    ['sec-disposablestack.prototype.move', 'If disposableStack.[[DisposableState]] is disposed, throw a ReferenceError exception', '3'],
    ['sec-disposablestack.prototype.move', 'Set newDisposableStack.[[DisposableResourceStack]] to disposableStack.[[DisposableResourceStack]]', '6'],
    ['sec-disposablestack.prototype.move', 'Set disposableStack.[[DisposableResourceStack]] to a new empty List', '7'],
    ['sec-disposablestack.prototype.move', 'Set disposableStack.[[DisposableState]] to disposed', '8'],
    ['sec-disposablestack.prototype.use', 'If disposableStack.[[DisposableState]] is disposed, throw a ReferenceError exception', '3'],
    ['sec-disposablestack.prototype.use', 'Perform ? AddDisposableResource (disposableStack.[[DisposableResourceStack]], value, sync-dispose)', '4'],
    ['sec-asyncdisposablestack.prototype.disposeAsync', 'If asyncDisposableStack.[[AsyncDisposableState]] is disposed, return undefined', '3'],
    ['sec-asyncdisposablestack.prototype.disposeAsync', 'Set asyncDisposableStack.[[AsyncDisposableState]] to disposed', '4'],
  ];
  const wrong = steps.filter(([id, needle, k]) => at(id, needle).join() !== k).map(([id, needle, k]) => `${num(id)} «${needle.slice(0, 40)}» ${JSON.stringify(at(id, needle))}≠${k}`);
  check(wrong.length === 0, `draft: ${steps.length} step numbers the lecture names (7.5.2–7.5.4, 14.2.2, 14.3.1.3, 14.7.4.2, 14.7.5.7, 20.5.8.1.1, 27.1.3.3.17, 27.3.1.1, 27.3.3.x, 27.4.3.4): ${wrong.join('; ') || 'all right'}`);
  const nums = { 'sec-operations-on-disposable-objects': '7.5', 'sec-disposableresource-records': '7.5.1', 'sec-adddisposableresource': '7.5.2', 'sec-getdisposemethod': '7.5.3',
    'sec-disposeresources': '7.5.4', 'sec-let-and-const-declarations': '14.3.1', 'sec-bindingevaluation': '14.3.1.3', 'sec-block-runtime-semantics-evaluation': '14.2.2',
    'sec-runtime-semantics-forloopevaluation': '14.7.4.2', 'sec-for-in-and-for-of-statements': '14.7.5',
    'sec-runtime-semantics-forin-div-ofbodyevaluation-lhs-stmt-iterator-lhskind-labelset': '14.7.5.7', 'sec-switch-statement-static-semantics-early-errors': '14.12.1',
    'sec-scripts-static-semantics-early-errors': '16.1.1', 'sec-suppressederror': '20.5.8.1.1', 'sec-disposablestack': '27.3.1.1', 'sec-asyncdisposablestack-objects': '27.4',
    'sec-disposablestack.prototype-%symbol.dispose%': '27.3.3.8', 'sec-asyncdisposablestack.prototype-%symbol.asyncdispose%': '27.4.3.8', 'sec-well-known-symbols': '6.1.5.1' };
  const wrongNums = Object.entries(nums).filter(([id, k]) => num(id) !== k).map(([id, k]) => `${id}: ${num(id)}≠${k}`);
  check(wrongNums.length === 0, `draft: ${Object.keys(nums).length} section numbers the lecture names, also without links (7.5.1, 14.7.5, 27.3.1.1, …): ${wrongNums.join('; ') || 'all right'}`);

  // the texts the lecture retells
  {
    check(f('sec-let-and-const-declarations').includes('using [no LineTerminator here] BindingList [?In, ?Yield, ?Await, ~Pattern]')
      && hasAll(f('sec-disposableresource-records'), ['[[ResourceValue]]', '[[Kind]] sync-dispose or async-dispose', '[[DisposeMethod]]'])
      && f('sec-scripts-static-semantics-early-errors').includes('It is a Syntax Error if ContainsUsing of StatementList is true')
      && f('sec-switch-statement-static-semantics-early-errors').includes('It is a Syntax Error if ContainsUsing of StatementList is true')
      && f('sec-for-in-and-for-of-statements').includes('ForDeclaration [?Yield, ?Await, ~Using] in Expression') && !f('sec-for-in-and-for-of-statements-static-semantics-early-errors').includes('Using')
      && lectureText.includes('14.7.5: грамматика, ForDeclaration с ~Using') && !lectureText.includes('14.7.5.1')
      && f('sec-static-semantics-isconstantdeclaration').includes('UsingDeclaration : using BindingList ; AwaitUsingDeclaration : CoverAwaitExpressionAndAwaitUsingDeclarationHead BindingList ; Return true')
      && f('sec-let-and-const-declarations-static-semantics-early-errors').includes('It is a Syntax Error if Initializer is not present and IsConstantDeclaration of the LexicalDeclaration containing this LexicalBinding is true')
      && f('sec-function-definitions-runtime-semantics-evaluation').includes('DisposeResources') && f('sec-runtime-semantics-evaluateclassstaticblockbody').includes('DisposeResources')
      && f('sec-source-text-module-record-execute-module').includes('DisposeResources'),
    'draft: 14.3.1 — using without a line break and without patterns; 7.5.1 — the three fields; 16.1.1 and 14.12.1 — ContainsUsing; for…in — the grammar of 14.7.5 (ForDeclaration with ~Using), not an early error of 14.7.5.1, and the lecture says so; 14.3.1.1 with IsConstantDeclaration (true for using) — an initializer is required; 15.2.6, 15.7.12, 16.2.1.7.3.2 call DisposeResources');
    check(f('sec-disposablestack.prototype-%symbol.dispose%').includes('The initial value of the %Symbol.dispose% property is %DisposableStack.prototype.dispose%')
      && f('sec-asyncdisposablestack.prototype-%symbol.asyncdispose%').includes('The initial value of the %Symbol.asyncDispose% property is %AsyncDisposableStack.prototype.disposeAsync%')
      && f('sec-suppressederror.prototype.message').includes('is the empty String')
      && f('sec-disposablestack-objects').includes('one of two mutually exclusive states: disposed or pending')
      && hasAll(f('sec-disposable-interface'), ['should avoid repeating clean-up logic against the already-disposed resource and should not throw an exception', 'However, this requirement is not enforced']),
    'draft: 27.3.3.8 and 27.4.3.8 — the same functions as dispose and disposeAsync; 20.5.8.3.2 — the empty message; 27.3 — pending and disposed; 27.2.1.1 — a second call should not throw, «not enforced»');
  }

  // the days the lecture points to, read as text without tags
  const read = (p) => (p.endsWith('.html') ? builtSite.htmlOfFile(path.join(ROOT, p)) : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  // a tag before a colon leaves a space: "DisposableStack</code>:" → "DisposableStack:"
  const pageText = (p) => flat(read(p)).replace(/ :/g, ':');
  {
    check(pageText('advanced/day-11/lecture.html').includes('Объявление using (день 25) в таком случае поступает иначе — не теряет, а склеивает обе ошибки в SuppressedError')
      && pageText('advanced/day-17/lecture.html').includes('Chrome знает 15 таких свойств: 13 из таблицы 1 и два для объявления using — это день 25'),
    'lecture 8, 11: day 11 — using glues the errors into SuppressedError; day 17 — 15 symbols in Chrome, 13 in table 1, two for using');
    const i13 = pageText('intermediate/day-13/lecture.html'), i29 = pageText('intermediate/day-29/lecture.html');
    check(i13.includes('[Symbol.dispose]() вызывает return() итератора; он нужен объявлению using — курс 3')
      && i29.includes('вызывает и ждёт return() для объявления await using — курс 3') && i29.includes('в текст 2026 года ещё не вошёл'),
    'lecture 12: day 13 of course 2 — [Symbol.dispose] calls return() for using; day 29 — [Symbol.asyncDispose] for await using, not in the 2026 text');
    const a24 = pageText('advanced/day-24/lecture.html'), t24 = pageText('advanced/day-24/tasks.html');
    check(a24.includes('День 25 — using, await using и DisposableStack: как освобождать ресурсы точно в нужный момент') && t24.includes('openConnection(name, log)')
      && pageText('intermediate/day-26/lecture.html').includes('cause') && pageText('intermediate/day-27/lecture.html').includes('AggregateError'),
    'lecture 1, 10, 18: day 24 promised day 25 and has openConnection in task 6; days 26 and 27 of course 2 — cause and AggregateError');
    const plan = read('docs/plan-3-advanced.md').replace(/\s+/g, ' ');
    const mods = read('tools/plan-modules.mjs');
    check(plan.includes('| 25 | A6 | using, await using и DisposableStack |') && plan.includes('| 26 | A7 | ECMA-402 изнутри: языковые теги и согласование локалей |')
      && mods.includes("['A6', 3, 2, 'Управление ресурсами и памятью']"),
    'lecture 19: the plan — day 25 is the second and last day of A6, day 26 opens A7 «ECMA-402 изнутри: языковые теги и согласование локалей»');
  }

  // the reference table holds every row of the plan as a link with its mark, every anchor of the draft exists
  {
    const lecture = read('advanced/day-25/lecture.html');
    const refTable = lecture.slice(lecture.indexOf('<div class="ref">'), lecture.indexOf('<div class="cheatsheet">'));
    const refMdn = [...refTable.matchAll(/<tr><td><a href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"]+)">MDN: /g)].map((m) => m[1]);
    const refSpec = [...refTable.matchAll(/<tr><td><a href="https:\/\/tc39\.es\//g)];
    const mdnRows = dayRows.map((c) => c[0]);
    const missing = mdnRows.filter((p) => !refMdn.includes(p));
    check(mdnRows.length === 27 && refMdn.length === 27 && refSpec.length === 0 && missing.length === 0,
      `plan: ${mdnRows.length} rows of MDN for day 25 (no ECMA-262 rows), ${refMdn.length} rows in the reference table, missing: ${missing.join(', ') || 'none'}`);
    const fullMdn = dayRows.filter((c) => c[8] === 'подробно').map((c) => c[0]).sort();
    const markedMdn = [...refTable.matchAll(/en-US\/docs\/([^"]+)">MDN: [^<]*<\/a><\/td><td>.*?<\/td><td><span class="mark mark-full">/g)].map((m) => m[1]).sort();
    check(fullMdn.length === 9 && same(fullMdn, markedMdn), `plan: the 9 rows "подробно" are marked so in the table ${JSON.stringify(markedMdn.length)}`);
    const wrongTitle = dayRows.filter((c) => !refTable.includes(`${c[0]}">MDN: ${c[1].replace(/&/g, '&amp;')}</a>`)).map((c) => c[0]);
    check(wrongTitle.length === 0, `plan: every MDN row is named by its title from the map ${wrongTitle.join(', ')}`);
    const anchors = new Set([...lecture.matchAll(/https:\/\/tc39\.es\/ecma262\/#([\w.%-]+)/g)].map((m) => decodeURIComponent(m[1])));
    const gone = [...anchors].filter((a) => !spec.includes(`id="${a}"`));
    check(anchors.size >= 30 && gone.length === 0 && !/tc39\.es\/ecma262\/2026\//.test(lecture), `links: ${anchors.size} anchors of the draft (tc39.es/ecma262/#…), not in the draft: ${gone.join(', ') || 'none'}; no links to the 2026 edition`);
    const named = [...lecture.matchAll(/<a href="https:\/\/tc39\.es\/ecma262\/#([\w.%-]+)">([0-9][0-9.]*)[ <]/g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
    const wrongNum = named.filter(([id, k]) => num(id) !== k).map(([id, k]) => `${k}≠${num(id)} (${id})`);
    check(named.length >= 30 && wrongNum.length === 0, `links: ${named.length} links whose text starts with a number, wrong: ${wrongNum.join(', ') || 'none'}`);
    const footer = lecture.slice(lecture.indexOf('<div class="sources">'));
    const mdnLinks = (lecture.match(/developer\.mozilla\.org/g) || []).length;
    check(['JavaScript resource management, using, await using, DisposableStack, AsyncDisposableStack, SuppressedError и их', 'черновик спецификации <a href="https://tc39.es/ecma262/">ECMA-262 2027</a> от 12 ноября 2026 года', 'Mozilla Contributors'].every((s) => footer.includes(s))
      && mdnLinks === 35,
    `links: the footer names the MDN pages and the draft of ECMA-262 2027 of 12 November 2026; MDN is linked 35 times — 27 rows, sections 1, 4, 9, 11, 14, 15, 17, the footer (${mdnLinks})`);
  }

  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
