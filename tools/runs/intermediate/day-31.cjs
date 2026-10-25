// Course 2, day 31, in Chrome: dynamic import, import.meta, JSON modules, JSON.parse and JSON.stringify. As on day 30,
// a code block is a file of the student's folder: its first line is "// name.js" or "<!-- index.html -->", or the block
// has data-file="name.json" (JSON allows no comments). Unlike day 30, the folder is one for the whole page — files pile
// up from the top, a later file with the same name replaces the earlier one — and only index.html belongs to its
// section (an h2): a section without one gets a default page with <script type="module" src="main.js">. A result-box
// right after a block runs the folder as Live Server would, on http://127.0.0.1:5500/ (.js as text/javascript, .json as
// application/json, a missing file as 404 text/html), in a fresh browser context; buttons are clicked when CLICKS says
// so. Output is the console as DevTools shows it: console calls, uncaught errors, and the browser's own error messages
// of the "javascript" source (CORS, MIME type); network messages (a 404 while loading) are left out, the prose
// mentions them.
//   node tools/runs/intermediate/day-31.cjs            every run: files, output; checks below
//   node tools/runs/intermediate/day-31.cjs --quiet    only the checks
// Checks: a result-box equals the output of its folder; every file block is used by a run; the notes run without an
// error; extra runs cover the claims of the prose (what the MDN pages and ECMA-262 say, when quiz.js is requested,
// the errors of import(), import.meta and JSON modules, the reviver and replacer details, raw JSON, the three
// experiments of «Карточки») and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DAY = path.join(__dirname, '../../../intermediate/day-31');
const PAGES = ['lecture', 'student', 'tasks'];
const MAIN = { timezoneId: 'Asia/Ashgabat', locale: 'ru-RU' };
const GIT = path.join(__dirname, '../../.cache/mdn-content.git');
const SPEC = path.join(__dirname, '../../.cache/ecma262-2026.html');
const REV = '5a81c288fb72';
const ORIGIN = 'http://127.0.0.1:5500';
const quiet = process.argv.includes('--quiet');
const LF = String.fromCharCode(10);
const DEFAULT_PAGE = '<!doctype html><meta charset="utf-8"><title>run</title><body><script type="module" src="main.js"></script></body>';
// buttons to click after the page has loaded, by a line of the folder's main.js
const CLICKS = {
  'document.querySelector("#start").addEventListener': ['#start', '#start'],
  'document.querySelector("#lesson").addEventListener': ['#lesson'],
};

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
  if (a.type === 'object' && a.className === 'Module') return '<module namespace object>';
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};

const mdnPage = (p) => execFileSync('git', [`--git-dir=${GIT}`, 'show', `${REV}:files/en-us/web/javascript/${p}/index.md`], { encoding: 'utf8' });
const has = (p, s) => mdnPage(p).includes(s);
const specRaw = fs.readFileSync(SPEC, 'utf8');
const spec = specRaw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const inSpec = (s) => spec.includes(s);

const fileName = (blk) => {
  if (blk.file) return blk.file;
  const first = blk.code.split(LF)[0].trim();
  const m = first.match(/^\/\/ ([\w./-]+\.js)$/) || first.match(/^<!-- ([\w./-]+\.html)(?: —.*)? -->$/);
  return m ? m[1] : null;
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  const waitFor = (site) => Math.min(3000, [...Object.values(site).join(LF).matchAll(/\b(\d{3,4})\b/g)].reduce((sum, m) => (Number(m[1]) > 2100 ? sum : sum + Number(m[1])), 500));
  // run a folder; returns { out, requests, value } — value is page.evaluate(after) when asked
  const run = async (files, { clicks, after, ms } = {}) => {
    const site = { ...files };
    const page = site['index.html'] ? `<meta charset="utf-8">${LF}${site['index.html']}` : DEFAULT_PAGE;
    const ctx = await b.newContext(MAIN);
    const requests = [];
    await ctx.route(`${ORIGIN}/**`, (r) => {
      const name = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
      requests.push(name);
      if (name === 'index.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: page });
      if (!(name in site)) return r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: `<!DOCTYPE html><title>Error</title><pre>Cannot GET /${name}</pre>` });
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : name.endsWith('.css') ? 'text/css' : 'text/plain';
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
    cdp.on('Log.entryAdded', (e) => { if (e.entry.level === 'error' && e.entry.source !== 'network') out.push(e.entry.text); });
    await p.goto(`${ORIGIN}/index.html`);
    await p.waitForTimeout(ms ?? waitFor(site));
    const own = Object.keys(CLICKS).find((k) => Object.values(site).some((code) => code.includes(k)));
    for (const sel of clicks ?? (own ? CLICKS[own] : [])) {
      await p.click(sel);
      await p.waitForTimeout(300);
    }
    const value = after ? await p.evaluate(after) : undefined;
    await ctx.close();
    return { out, requests, value };
  };

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
          file: pre.dataset.file ?? null,
          section: heads.filter((h) => h.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).length,
          box: next && next.matches('.result-box') ? next.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          cheat: !!pre.closest('.cheatsheet'),
        };
      }));
      await src.close();
    }
    await ctx.close();
  }

  // the lecture and the notes: one folder for the page, index.html per section; a run at every result-box (lecture)
  // or at the end of a section (notes)
  const used = new Set();
  for (const name of ['lecture', 'student']) {
    const blocks = all[name];
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);
    let site = {}, section = -1, pending = [];
    const flush = async (label, box) => {
      const { out } = await run(site);
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
        delete site['index.html'];
        section = blk.section;
      }
      const file = fileName(blk);
      check(!!file, `${name} #${i}: the block names its file (${blk.code.split(LF)[0]})`);
      if (!file) continue;
      site[file] = blk.code;
      pending.push(i);
      if (blk.box) await flush(`#${i} (${file})`, blk.box);
    }
    if (name === 'student' && pending.length) await flush(`section ${section} (end)`, null);
    for (const [i, blk] of blocks.entries()) {
      if (!blk.cheat && fileName(blk)) check(used.has(`${name} ${i}`), `${name} #${i} (${fileName(blk)}) is used by a run`);
    }
  }
  // the JSON blocks are valid JSON
  for (const name of PAGES) {
    for (const blk of all[name].filter((x) => x.file && x.file.endsWith('.json'))) {
      let ok = true;
      try { JSON.parse(blk.code); } catch { ok = false; }
      check(ok, `${name}: ${blk.file} is valid JSON`);
    }
  }

  const lec = (line) => all.lecture.find((x) => x.code.includes(line)).code;
  const lecFile = (file, line) => all.lecture.find((x) => fileName(x) === file && x.code.includes(line)).code;
  const task = (line) => all.tasks.find((x) => x.code.includes(line)).code;
  const extra = async (files, want, text, opts) => {
    const res = await run(files, opts);
    const ok = typeof want === 'function' ? want(res.out, res) : same(res.out, want);
    check(ok, `${text}: ${JSON.stringify(res.out)}${opts?.after ? ` | ${JSON.stringify(res.value)}` : ''}`);
    return res;
  };
  const main = (code) => ({ 'main.js': code });

  // what the prose says the MDN pages say
  const IM = 'reference/operators/import';
  check(has(IM, '`import` itself is a keyword, not a function') && has(IM, '`import()` never synchronously throws an error') && has(IM, "Future imports don't even result in HTTP requests or disk access") && has(IM, 'you must rename the `default` key because `default` is a reserved word'), 'lecture 1–3: a keyword; never throws; no second request; renaming default');
  check(has(IM, 'Only evaluation failures are cached; if a module fails to load or link, the next import may try to load and link the module again') && has(IM, 'Do not export a function called `then()`') && has(IM, 'the asynchronous dynamic import syntax is always available') && has(IM, 'Use dynamic import only when necessary') && has(IM, '### Importing on-demand in response to user action') && has(IM, 'Promise.all('), 'lecture 2–4: caching of failures; then; classic scripts; only when necessary; on user action; Promise.all');
  check(has('reference/operators/import.meta', 'extensible [`null`-prototype]') && has('reference/operators/import.meta', 'using `import.meta` outside of a module') && has('reference/operators/import.meta', 'the URL of the containing document (for inline scripts)') && has('reference/operators/import.meta', 'The spec doesn\'t specify any properties'), 'lecture 5: null prototype, extensible; only in modules; inline — the page; host properties');
  check(has('reference/operators/import.meta/resolve', 'This allows `import.meta.resolve()` to be a _synchronous_ operation') && has('reference/operators/import.meta/resolve', '### Not an ECMAScript feature') && has('reference/operators/import.meta/resolve', '`new URL()` is not aware of import maps'), 'lecture 5: resolve is synchronous, not ECMAScript, new URL ignores import maps');
  const W = 'reference/statements/import/with';
  check(has(W, 'the file extension in the URL cannot be used to identify a file\'s type') && has(W, 'then the file would be parsed and executed as code') && has(W, 'JSON modules only have one default export') && has(W, '`"json"`, `"text"` and `"css"`') && has(W, 'dynamic imports are cached for the lifetime of the environment'), 'lecture 6: MIME, not the extension; executing a "JSON"; one default; json, text, css in HTML; cached — use fetch');
  check(has('reference/global_objects/json/rawjson', 'has `null` prototype') && has('reference/global_objects/json/rawjson', 'is frozen') && has('reference/global_objects/json/rawjson', '**representing a primitive value**') && has('reference/global_objects/json/israwjson', 'tests whether a value is an object returned by'), 'lecture 9: raw JSON — null prototype, frozen, primitives only; isRawJSON');
  const BE = 'reference/errors/bigint_not_serializable';
  check(has(BE, 'TypeError: Do not know how to serialize a BigInt (V8-based)') && has(BE, 'title: "TypeError: BigInt value can\'t be serialized in JSON"') && has(BE, '(Firefox)') && has(BE, 'JSON.rawJSON(value.toString())'), 'lecture 9, 11: the error page — three texts, the Firefox title, the rawJSON replacer');
  // what the prose says ECMA-262 2026 says
  check(inSpec('In the case where there are duplicate name Strings within an object, lexically preceding values for the same key shall be overwritten.') && inSpec('If the property is unmodified and its value is primitive, the provided context object has a "source" property containing source text') && inSpec('It is not permitted for a conforming implementation of JSON.parse to extend the JSON grammars.') && inSpec('Return ? Call(reviver, holder, « name, val, context »).'), 'lecture 7, 12: duplicates; context.source; no extensions; Call(reviver, holder, …)');
  check(inSpec('Set spaceMV to min(10, spaceMV).') && inSpec('If the length of space ≤ 10, let gap be space; else let gap be the substring of space from 0 to 10.') && inSpec('throw a TypeError exception because the structure is cyclical') && spec.indexOf('Let toJSON be ? GetV(value, "toJSON").') < spec.indexOf('Set value to ? Call(state.[[ReplacerFunction]], holder, « key, value »).') && spec.indexOf('Set value to ? Call(state.[[ReplacerFunction]], holder, « key, value »).') < spec.indexOf('If value has an [[IsRawJSON]] internal slot, then'), 'lecture 8, 12: space ≤ 10; cycles; toJSON, then replacer, then raw JSON');
  check(inSpec('If jsonString is the empty String, throw a SyntaxError exception.') && inSpec('Perform ! SetIntegrityLevel(obj, frozen).') && inSpec('does not have a [[Construct]] internal method') && inSpec('The initial value of the %Symbol.toStringTag% property is the String value "JSON".'), 'lecture 12: rawJSON checks and freezes; JSON is not a constructor; [object JSON]');
  check(inSpec('IfAbruptRejectPromise(specifierString, promiseCapability).') && inSpec('If AllImportAttributesSupported(attributes) is false, then') && inSpec('The default implementation of HostGetImportMetaProperties is to return a new empty List.') && inSpec('Set importMeta to OrdinaryObjectCreate(null).') && inSpec('Return CreateDefaultExportSyntheticModule(parseResult.[[Value]]).') && inSpec('entry.[[Key]] is "type" and entry.[[Value]] is "json"') && !inSpec('"text"'),'lecture 12: import() rejects; attributes; import.meta; a JSON module has one default; no "text" type in the 2026 text');

  // lecture 2: quiz.js is not requested before the click, once with two clicks; destructuring the default
  {
    const s2 = { 'index.html': lec('<button id="start">'), 'quiz.js': lecFile('quiz.js', 'export default function start()'), 'main.js': lec('document.querySelector("#start").addEventListener') };
    await extra(s2, (out, res) => same(out, ['main.js: страница готова']) && !res.requests.includes('quiz.js'), 'lecture 2: no click — quiz.js not even requested', { clicks: [] });
    await extra(s2, (out, res) => res.requests.filter((r) => r === 'quiz.js').length === 1, 'lecture 2: two clicks — quiz.js requested once');
    await extra({ 'quiz.js': s2['quiz.js'], ...main('const { default: start, questions } = await import("./quiz.js");\nconsole.log(start(), questions.length);') }, ['quiz.js выполняется', 'викторина: 3 вопроса 3'], 'lecture 2: destructuring with default: start');
  }
  // lecture 3: the then trap; same namespace object as a static import
  await extra({ 'thenable.js': 'export function then(resolve) {\n  console.log("then() вызван");\n  resolve(1);\n}', ...main('import * as mod from "./thenable.js";\nconst mod2 = await import("./thenable.js");\nconsole.log(mod === mod2, mod2);') }, ['then() вызван', 'false 1'], 'lecture 3: an exported then makes the module thenable');
  await extra({ 'm.js': 'export const x = 1;', ...main('import * as mod from "./m.js";\nconsole.log(mod === await import("./m.js"));') }, ['true'], 'lecture 3: import() gives the same namespace object');
  // lecture 4: a query string makes another module; lecture 7: a trailing comma
  check(has(IM, 'import(`/my-module.js?t=${Date.now()}`);') && has(IM, 'this can lead to memory leaks') && has(IM, 'there is no way to manually clear the cache'), 'lecture 4: the ?t= trick, memory leaks, no way to clear the cache');
  await extra({ 'quiz.js': 'console.log("quiz.js выполняется");', ...main('await import("./quiz.js?t=1");\nawait import("./quiz.js?t=2");\nawait import("./quiz.js?t=1");') }, ['quiz.js выполняется', 'quiz.js выполняется'], 'lecture 4: two addresses — two modules');
  await extra(main('try {\n  JSON.parse("[1, 2,]");\n} catch (e) {\n  console.log(e.name, e.message);\n}\nconsole.log([1, 2,].length);'), ['SyntaxError Unexpected token \']\', "[1, 2,]" is not valid JSON', '2'], 'lecture 7: a trailing comma — JSON rejects, JavaScript accepts');
  // lecture 5: import.meta outside a module; inline module; extensible
  await extra({ 'index.html': '<script src="classic.js"></script>', 'classic.js': 'console.log(import.meta.url);' }, ["Uncaught SyntaxError: Cannot use 'import.meta' outside a module"], 'lecture 5, 11: import.meta in a classic script');
  await extra({ 'index.html': '<script type="module">console.log(import.meta.url);</script>' }, [`${ORIGIN}/index.html`], 'lecture 5: an inline module — the page address');
  await extra(main('import.meta.note = "своё";\nconsole.log(import.meta.note, import.meta === import.meta);'), ['своё true'], 'lecture 5, 12: properties can be added; the same object every time');
  // lecture 6: the table of JSON module errors; shared and not frozen; css and text
  const wjson = { 'words.json': '[{ "word": "book" }]' };
  await extra({ ...wjson, ...main('import words from "./words.json";\nconsole.log(words);') }, ['Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/json". Strict MIME type checking is enforced for module scripts per HTML spec.'], 'lecture 6: no with');
  await extra({ 'words.json': '{ "book": "книга" }', ...main('import { book } from "./words.json" with { type: "json" };\nconsole.log(book);') }, ["Uncaught SyntaxError: The requested module './words.json' does not provide an export named 'book'"], 'lecture 6: a named import');
  await extra({ ...wjson, ...main('import words from "./words.json" with { kind: "json" };\nconsole.log(words);') }, ['Uncaught SyntaxError: Invalid attribute key "kind".'], 'lecture 6: an unknown key');
  await extra({ ...wjson, ...main('import words from "./words.json" with { type: "jsn" };\nconsole.log(words);') }, ['Uncaught TypeError: "jsn" is not a valid module type.'], 'lecture 6: a wrong type');
  await extra({ 'words.js': 'export default 1;', ...main('import w from "./words.js" with { type: "json" };\nconsole.log(w);') }, ['Failed to load module script: Expected a JSON module script but the server responded with a MIME type of "text/javascript". Strict MIME type checking is enforced for module scripts per HTML spec.'], 'lecture 6: type json on a .js file');
  await extra({ 'words.json': '{ book: "книга" }', ...main('import words from "./words.json" with { type: "json" };\nconsole.log(words);') }, ["Uncaught SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)"], 'lecture 6: not JSON inside');
  await extra({ ...wjson, 'a.js': 'import words from "./words.json" with { type: "json" };\nwords.push({ word: "water" });', ...main('import "./a.js";\nimport words from "./words.json" with { type: "json" };\nconsole.log(words.length, Object.isFrozen(words));') }, ['2 false'], 'lecture 6: one array for all importers, not frozen');
  await extra({ 'note.txt': 'текст', 'style.css': 'body { color: red; }', ...main('try {\n  await import("./note.txt", { with: { type: "text" } });\n} catch (e) {\n  console.log(e.name, e.message);\n}\nconst css = await import("./style.css", { with: { type: "css" } });\nconsole.log(Object.prototype.toString.call(css.default));') }, ['TypeError "text" is not a valid module type.', '[object CSSStyleSheet]'], 'lecture 6: type text is not in Chrome 155, css is');
  // lecture 7: undefined deletes, a hole in an array; this is the holder; no source once the value is changed
  await extra(main('const r = JSON.parse(\'{"keep": 1, "drop": 2, "list": [1, 2, 3]}\', (key, value) => (key === "drop" || value === 2 ? undefined : value));\nconsole.log(JSON.stringify(r), r.list.length, 1 in r.list);\nJSON.parse(\'{"b": {"c": 2}}\', function (key, value) {\n  if (key === "c") console.log(JSON.stringify(this));\n  return value;\n});\nJSON.parse("[1, 2]", function (key, value, context) {\n  if (key === "0") this[1] = 20;\n  if (key === "1") console.log(value, JSON.stringify(context));\n  return value;\n});'), ['{"keep":1,"list":[1,null,3]} 3 false', '{"c":2}', '20 {}'], 'lecture 7: undefined deletes (a hole); this is the holder; a changed value has no source');
  // lecture 8: the property list takes numbers; toJSON gets the key; wrappers of BigInt throw
  await extra(main('console.log(JSON.stringify({ 7: "семь", a: 1 }, [7, "a"]));\nconst keys = [];\nconst item = { toJSON(key) { keys.push(key === "" ? \'""\' : key); return "x"; } };\nJSON.stringify(item);\nJSON.stringify({ first: item, list: [item] });\nconsole.log(keys.join(", "));\ntry { JSON.stringify([Object(1n)]); } catch (e) { console.log(e.name, e.message); }'), ['{"7":"семь","a":1}', '"", first, 0', 'TypeError Do not know how to serialize a BigInt'], 'lecture 8: numbers in the list; toJSON(key); a BigInt wrapper');
  // lecture 9 and 11: raw JSON rules; JSON is not a constructor
  await extra(main('for (const text of ["", " 1", "1 ", "-0.10", \'{"a": 1}\']) {\n  try {\n    console.log(JSON.stringify({ v: JSON.rawJSON(text) }));\n  } catch (e) {\n    console.log(e.name, e.message);\n  }\n}\ntry { new JSON(); } catch (e) { console.log(e.name, e.message); }\nconsole.log(Object.prototype.toString.call(JSON));'), ['SyntaxError Invalid value for JSON.rawJSON', 'SyntaxError Unexpected token \' \', " 1" is not valid JSON', 'SyntaxError Invalid value for JSON.rawJSON', '{"v":-0.10}', 'SyntaxError Unexpected token \'{\', "{"a": 1}" is not valid JSON', 'TypeError JSON is not a constructor', '[object JSON]'], 'lecture 9, 11, 12: empty, spaces, objects; -0.10 as is; new JSON(); [object JSON]');
  // lecture 11: the rest of the table
  await extra(main('const load = import;'), ["Uncaught SyntaxError: Unexpected token ';'"], 'lecture 11: import is not a value');
  await extra(main('for (const options of [5, { with: { foo: "bar" } }]) {\n  try {\n    await import("./m.js", options);\n  } catch (e) {\n    console.log(e.name, e.message);\n  }\n}'), ['TypeError The second argument to import() must be an object', 'TypeError Invalid attribute key "foo".'], 'lecture 11: the second argument of import()');
  await extra(main('try {\n  import.meta.resolve("cards");\n} catch (e) {\n  console.log(e.name, e.message);\n}'), ['TypeError Failed to resolve module specifier cards: Relative references must start with either "/", "./", or "../".'], 'lecture 11: import.meta.resolve of a bare name');

  // lecture 13: the three experiments of «Карточки»
  {
    const cards = {
      'words.json': all.lecture.find((x) => x.file === 'words.json' && x.code.includes('apple')).code,
      'storage.js': lec('export function save(data) {'),
      'index.html': lec('<button id="lesson">'),
      'ask.js': lec('console.log("ask.js загружен");'),
      'main.js': lec('const { default: ask } = await import("./ask.js");'),
    };
    const noWith = cards['main.js'].replace(' with { type: "json" }', '');
    check(noWith !== cards['main.js'], 'lecture 13, experiment 1: with removed');
    await extra({ ...cards, 'main.js': noWith }, ['Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/json". Strict MIME type checking is enforced for module scripts per HTML spec.'], 'lecture 13, experiment 1: nothing runs');
    const arrow = cards['storage.js'].replace('return JSON.stringify(data, function (key, value) {', 'return JSON.stringify(data, (key, value) => {');
    check(arrow !== cards['storage.js'], 'lecture 13, experiment 2: an arrow replacer');
    await extra({ ...cards, 'storage.js': arrow }, ["Uncaught TypeError: Cannot read properties of undefined (reading '')"], 'lecture 13, experiment 2, 11: this of an arrow in a module is undefined');
    await extra(cards, (out) => out.filter((l) => l === 'ask.js загружен').length === 1 && out.filter((l) => l === 'Как перевести «book»?').length === 3, 'lecture 13, experiment 3: three clicks — ask.js once', { clicks: ['#lesson', '#lesson', '#lesson'] });
  }

  // tasks
  // task 1
  await extra({ 'm.js': 'export default 5;', 'data.json': '{"a": 1}', ...main('console.log(import("./m.js") instanceof Promise, (await import("./m.js")).default, Object.keys(await import("./data.json", { with: { type: "json" } })), JSON.parse(\'{"x": 1, "x": 2}\').x, JSON.stringify({ a: 1 }, null, 15).split("\\n")[1].length);\ntry { JSON.stringify({ code: JSON.rawJSON("007") }); } catch (e) { console.log(e.name, e.message); }') }, ["true 5 (1) ['default'] 2 16", 'SyntaxError Unexpected number in JSON at position 1 (line 1 column 2)'], 'task 1: lines 1, 2, 5–8');
  await extra({ 'index.html': '<script type="module" src="app/main.js"></script>', 'app/main.js': 'console.log(import.meta.url);' }, [`${ORIGIN}/app/main.js`], 'task 1: line 4');
  // task 2
  await extra(main(task('const reviverKeys = [];')), ['0 b 1 a c ""', '"" a 0 1 b c'], 'task 2: the two orders');
  // task 3
  await extra({ 'index.html': '<script src="app.js"></script>', 'app.js': 'console.log(import.meta.url);' }, ["Uncaught SyntaxError: Cannot use 'import.meta' outside a module"], 'task 3, line 3');
  await extra(main('try {\n  await import("./lesson-5.js");\n} catch (e) {\n  console.log(e.name, e.message);\n}'), [`TypeError Failed to fetch dynamically imported module: ${ORIGIN}/lesson-5.js`], 'task 3, line 4: a rejected promise');
  await extra(main('try { JSON.stringify({ id: 1n }); } catch (e) { console.log(e.name, e.message); }\nconst p = import("./m.js", { with: { kind: "json" } });\nconsole.log(p instanceof Promise);\np.catch((e) => console.log(e.name, e.message));'), ['TypeError Do not know how to serialize a BigInt', 'true', 'TypeError Invalid attribute key "kind".'], 'task 3, lines 5–6');
  // task 4
  {
    const lang = (n, hello) => `console.log("${n}.js");\nexport default { hello: "${hello}" };`;
    await extra({ 'lang/ru.js': lang('ru', 'Привет'), 'lang/tk.js': lang('tk', 'Salam'), 'lang/en.js': lang('en', 'Hello'), ...main('async function loadLang(code) {\n  try {\n    return (await import(`./lang/${code}.js`)).default;\n  } catch {\n    console.log(`нет языка ${code}`);\n    return (await import("./lang/ru.js")).default;\n  }\n}\nconsole.log((await loadLang("tk")).hello);\nconsole.log((await loadLang("de")).hello);\nawait loadLang("tk");\nawait loadLang("tk");\nconst all = await Promise.all(["ru", "tk", "en"].map(loadLang));\nconsole.log(all.map((l) => l.hello).join(", "));') }, ['tk.js', 'Salam', 'нет языка de', 'ru.js', 'Привет', 'en.js', 'Привет, Salam, Hello'], 'task 4: the numbers of the criteria');
  }
  // task 5
  {
    const students = all.tasks.find((x) => x.file === 'students.json').code;
    const report = 'import students from "./students.json" with { type: "json" };\nexport function report() {\n  return students.map((s) => `${s.name}: ${(s.marks.reduce((a, m) => a + m, 0) / s.marks.length).toFixed(2)}`);\n}';
    await extra({ 'students.json': students, 'report.js': report, ...main('import { report } from "./report.js";\nconsole.log(report().join(" | "));') }, ['Аман: 4.67 | Мерет: 3.67 | Айна: 5.00'], 'task 5: without bonus.js');
    await extra({ 'students.json': students, 'report.js': report, 'bonus.js': 'import students from "./students.json" with { type: "json" };\nfor (const s of students) s.marks.push(5);', ...main('import "./bonus.js";\nimport { report } from "./report.js";\nconsole.log(report().join(" | "));') }, ['Аман: 4.75 | Мерет: 4.00 | Айна: 5.00'], 'task 5: bonus.js changes the shared array');
    await extra({ 'students.json': students, 'report.js': report, 'bonus.js': 'import students from "./students.json" with { type: "json" };\nexport const withBonus = JSON.parse(JSON.stringify(students));\nfor (const s of withBonus) s.marks.push(5);', ...main('import "./bonus.js";\nimport { report } from "./report.js";\nconsole.log(report().join(" | "));') }, ['Аман: 4.67 | Мерет: 3.67 | Айна: 5.00'], 'task 5: a copy leaves the report as it was');
  }
  // task 6
  await extra(main('const text = \'[{"id":9007199254740993,"score":4.5},{"id":18014398509481985,"score":5}]\';\nconsole.log(JSON.parse(text).map((x) => x.id).join());\nconst parseExact = (t) => JSON.parse(t, (key, value, context) => (key === "id" ? BigInt(context.source) : value));\nconst stringifyExact = (d) => JSON.stringify(d, (key, value) => (typeof value === "bigint" ? JSON.rawJSON(String(value)) : value));\nconst data = parseExact(text);\nconsole.log(data[0].id, data[1].id, typeof data[0].score);\nconsole.log(stringifyExact(data) === text);'), ['9007199254740992,18014398509481984', '9007199254740993n 18014398509481985n number', 'true'], 'task 6: the numbers of the criteria');
  // task 7
  {
    const storage = `export function save(data) {
  return JSON.stringify(data, function (key, value) {
    const original = this[key];
    if (original instanceof Map) return { $map: [...original] };
    if (original instanceof Set) return { $set: [...original] };
    if (original instanceof Temporal.PlainDate) return { $date: value };
    if (original instanceof Temporal.Duration) return { $duration: value };
    return value;
  });
}
export function load(text) {
  return JSON.parse(text, (key, value) => {
    if (value === null || typeof value !== "object") return value;
    if ("$map" in value) return new Map(value.$map);
    if ("$set" in value) return new Set(value.$set);
    if ("$date" in value) return Temporal.PlainDate.from(value.$date);
    if ("$duration" in value) return Temporal.Duration.from(value.$duration);
    return value;
  });
}`;
    await extra({ 'storage.js': storage, ...main('import { save, load } from "./storage.js";\nconst text = save({ topics: new Set(["food", "home"]), lesson: Temporal.Duration.from({ minutes: 45 }) });\nconsole.log(text);\nconst back = load(text);\nconsole.log(back.topics.has("home"), back.lesson.total("seconds"));\nconst old = load(save({ m: new Map([[1, Temporal.PlainDate.from("2026-10-26")]]) }));\nconsole.log(old.m.get(1).toString());') }, ['{"topics":{"$set":["food","home"]},"lesson":{"$duration":"PT45M"}}', 'true 2700', '2026-10-26'], 'task 7: the numbers of the criteria');
  }
  // task 8
  await extra(main(`function revive(value, reviver) {
  function walk(holder, key) {
    const val = holder[key];
    if (val !== null && typeof val === "object") {
      for (const k of Array.isArray(val) ? val.keys() : Object.keys(val)) {
        const name = String(k);
        const next = walk(val, name);
        if (next === undefined) delete val[name];
        else val[name] = next;
      }
    }
    return reviver.call(holder, key, val);
  }
  return walk({ "": value }, "");
}
const text = '{"a": [1, {"b": 2}], "c": 3}';
const keys = [];
revive(JSON.parse(text), function (key, value) {
  keys.push(key === "" ? '""' : key);
  if (key === "b") console.log(JSON.stringify(this));
  return value;
});
console.log(keys.join(" "));
const drop2 = (key, value) => (value === 2 ? undefined : value);
console.log(JSON.stringify(revive(JSON.parse(text), drop2)), JSON.stringify(JSON.parse(text, drop2)));`), ['{"b":2}', '0 b 1 a c ""', '{"a":[1,{}],"c":3} {"a":[1,{}],"c":3}'], 'task 8: the same order and result as JSON.parse');
  // task 9
  {
    const lesson = 'export const number = Number(import.meta.url.split("/").pop().replace(".js", ""));\nconsole.log(`урок ${number} загружен`);';
    await extra({ 'lessons/1.js': lesson, 'lessons/2.js': lesson, ...main('async function open(n) {\n  try {\n    const { number } = await import(`./lessons/${n}.js`);\n    console.log(`урок ${number}`);\n  } catch {\n    console.log(`урока ${n} нет`);\n  }\n}\nawait open(1);\nawait open(2);\nawait open(1);\nawait open(5);\nconsole.log(import.meta.resolve("./lessons/5.js"));') }, ['урок 1 загружен', 'урок 1', 'урок 2 загружен', 'урок 2', 'урок 1', 'урока 5 нет', `${ORIGIN}/lessons/5.js`], 'task 9: the numbers of the criteria');
  }

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
