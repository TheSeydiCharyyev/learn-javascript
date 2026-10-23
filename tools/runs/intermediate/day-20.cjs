// Course 2, day 20, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: a regex as its literal, an array with its extra named
// properties after the elements, objects with the constructor's name in front when it is not Object; an uncaught
// error is "! message" (V8 text). A lone surrogate is never printed: Chrome's preview shows it as U+FFFD, so the
// pages print code units in hex instead.
//   node tools/runs/intermediate/day-20.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-20.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture block with neither is a problem; every EXPECT key is in exactly one block. Extra runs
// cover the claims of the prose (at by code units, u and v together, v and graphemes, Map keys are not normalized,
// the form is case-sensitive, invalid escapes in tagged templates, String.raw with missing substitutions, the twelve
// error texts, String(symbol), length in strict mode), the three experiments of «Карточки», the lines of the notes
// and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-20');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.subtype !== 'regexp' && p.value === 'Object') return '{…}';
  return p.value;
};
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.type === 'undefined') return 'undefined';
  if (a.type === 'symbol') return a.description;
  if (a.subtype === 'null') return 'null';
  if (a.subtype === 'regexp') return a.description;
  if (a.subtype === 'array') {
    const [, name, n] = a.description.match(/^(.*)\((\d+)\)$/);
    const items = a.preview.properties.map((p) => (/^\d+$/.test(p.name) ? inner(p) : `${p.name}: ${inner(p)}`));
    return `${name === 'Array' ? '' : name}(${n}) [${items.join(', ')}${a.preview.overflow ? ', …' : ''}]`;
  }
  if (a.type === 'object' && a.preview) {
    const head = a.className && a.className !== 'Object' ? `${a.className} ` : '';
    return `${head}{${a.preview.properties.map((p) => `${p.name}: ${inner(p)}`).join(', ')}${a.preview.overflow ? ', …' : ''}}`;
  }
  return String(a.value ?? a.unserializableValue ?? a.description);
};
const clean = (m) => m.replace("Failed to execute 'appendChild' on 'Node': ", '');

const EXPECT = {
  // lecture
  'smile.charCodeAt(0), smile.codePointAt(0));': ['2 1 55357 128578', "(2) ['d83d', 'de42'] true"],
  'const [hi, lo] = [smile.charCodeAt(0)': ['d83d de42 128578', 'true true 1 1 17e'],
  'const s = "Aý🙂👍🏽";': ["8 5 (5) ['A', 'ý', '🙂', '👍', '🏽']", '41 FD 1F642 1F44D 1F3FD', '4 2 5 3'],
  'const msg = "Привет 🙂!";': ['10 9 128578 56898', '!🙂 тевирП false false', 'a 1', '🙂 2'],
  'const cut = "Привет 🙂".slice(0, 8);': ['false Привет \uFFFD true', '(6) [false, false, false, false, true, true]', 'https://example.com/search?q=%EF%BF%BD', '! URI malformed'],
  'console.log(/^.$/.test("🙂"), /^.$/u.test("🙂")': ['false true false true false', "true true true (2) ['🙂', '🙂']", "3 (2) ['a', '🙂'] -🙂- 5"],
  'const text = "Salam, dünýä!': ["(7) ['Salam', 'dünýä', 'Привет', 'мир', 'Hello', 'world', 'Гүлнар']", "(6) ['Salam', 'd', 'n', 'Hello', 'world', '2026']", "a ε Л (3) ['I', 'C', 'C']", 'null ٢ true false'],
  'function getPrices(str) {': ["(3) ['$19.99', '€18.99', '¥2000']", 'Мы вы true false'],
  'console.log(/\\bкот\\b/u.test("кот")': ['false true false true'],
  'const TURKMEN = ': ["false true (2) ['Г', 'А']", 'true true false false true', "(4) ['🇹🇲', '👍🏽', '🙂', '👨‍👦'] true v false"],
  'const e1 = "\\u00E9", e2 = "e\\u0301";': ['\u00E9 e\u0301 false 1 2', 'true true false true', 'ff 1 x2 true'],
  'const plain = (s) =>': ['Gulnar dunya corek nandu', 'иод елка 4'],
  'const wordRe = (w) =>': ['Hi\\n5! 6 5', 'C:\\Users\\new \\d+\\.\\d+ ^d+.d+$ true', 'true (?<!\\p{L})\\x6aaý(?!\\p{L})'],
  'const html = (strings, ...values) =>': ['12 13 t0e1s2t \\unicode'],
  'String?.raw`Hello`;': ['! Invalid tagged template on optional chain'],
  'console.log(/\\-/.test("-")': ['true true true true true true true', '! Invalid regular expression: /\\-/u: Invalid escape'],
  'console.log(Object.getOwnPropertyNames(new String("ab"))': ["(3) ['0', '1', 'length'] {value: 2, writable: false, enumerable: false, configurable: false}", "[object String Iterator] true {value: 'a', done: false} 2"],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  const runOnPage = async (scripts) => {
    const p = await ctx.newPage();
    const out = [];
    p.on('pageerror', (e) => out.push(`! ${clean(e.message)}`));
    await p.goto('http://day.test/');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => out.push(e.args.map(show).join(' ')));
    for (const code of scripts) await p.addScriptTag({ content: code }).catch((e) => out.push(`! ${clean(e.message.split('\n')[0])}`));
    await p.waitForTimeout(80);
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
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);
    for (const [i, blk] of blocks.entries()) {
      const out = await runOnPage([blk.code]);
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const head = (code) => code.split('\nconsole.log(')[0];
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 3: at works by code units
  await extra('const msg = "Привет 🙂!";\nconsole.log(msg.at(7) === "\\uD83D", msg.charAt(7).length, Array.from(msg).length);', ['true 1 9'], 'lecture 3: at and charAt by code units, Array.from by code points');
  // lecture 7: u and v together; v does not make graphemes one character
  await extra(errOf('new Function("/a/uv")'), ['SyntaxError Invalid regular expression flags'], 'lecture 7: /a/uv');
  await extra(errOf('new RegExp("a", "uv")'), ["SyntaxError Invalid flags supplied to RegExp constructor 'uv'"], 'lecture 7: new RegExp with uv');
  await extra('console.log(/[🇺🇳]/v.test("🇺"), /\\p{L}/v.test("ý"));', ['true true'], 'lecture 7: v does not make a flag one character');
  // lecture 8: Map keys and === are not normalized; the form is case-sensitive
  await extra('console.log(new Map([["\\u00E9", 1]]).has("e\\u0301"), "\\u00E9" === "e\\u0301".normalize());', ['false true'], 'lecture 8: Map keys are not normalized');
  await extra(errOf('"a".normalize("nfc")'), ['RangeError The normalization form should be one of NFC, NFD, NFKC, NFKD.'], 'lecture 8: normalize("nfc")');
  await extra(errOf('"a".normalize("NFX")'), ['RangeError The normalization form should be one of NFC, NFD, NFKC, NFKD.'], 'lecture 8 and 10: normalize("NFX")');
  // lecture 9: an invalid escape — SyntaxError untagged, undefined cooked in a tag; String.raw fills missing places
  await extra(errOf('new Function("return `\\\\unicode`")'), ['SyntaxError Invalid Unicode escape sequence'], 'lecture 9: `\\unicode` without a tag');
  await extra('const first = (s) => [s[0], s.raw[0]];\nconsole.log(first`\\unicode`, String.raw({ raw: ["a", "b", "c"] }, 1), String.raw({ raw: [] }) === "");', ["(2) [undefined, '\\unicode'] a1bc true"], 'lecture 9: cooked undefined, raw kept; missing substitutions');
  // lecture 10: the twelve error texts
  for (const [src, flags, msg] of [
    ['\\\\q', 'u', '/\\q/u: Invalid escape'], ['\\\\x1', 'u', '/\\x1/u: Invalid escape'],
    ['{', 'u', '/{/u: Lone quantifier brackets'], [']', 'u', '/]/u: Lone quantifier brackets'], ['}', 'u', '/}/u: Lone quantifier brackets'],
    ['1{', 'u', '/1{/u: Incomplete quantifier'], ['\\\\00', 'u', '/\\00/u: Invalid decimal escape'],
    ['[\\\\s-1]', 'u', '/[\\s-1]/u: Invalid character class'], ['\\\\u{123456}', 'u', '/\\u{123456}/u: Invalid Unicode escape'],
    ['\\\\p{x}', 'u', '/\\p{x}/u: Invalid property name'], ['[|]', 'v', '/[|]/v: Invalid character in character class'],
    ['[&&]', 'v', '/[&&]/v: Invalid set operation in character class'],
    ['[^\\\\p{RGI_Emoji_Flag_Sequence}]', 'v', '/[^\\p{RGI_Emoji_Flag_Sequence}]/v: Negated character class may contain strings'],
  ]) await extra(errOf(`new RegExp("${src}", "${flags}")`), [`SyntaxError Invalid regular expression: ${msg}`], `lecture 10: ${msg}`);
  await extra(errOf('new Function("String?.raw`Hello`")'), ['SyntaxError Invalid tagged template on optional chain'], 'lecture 10: a tag with ?.');
  // lecture 11: String(symbol); length is read-only — an error in strict mode
  await extra('console.log(String(Symbol("x")));', ['Symbol(x)'], 'lecture 11: String(symbol)');
  await extra('"use strict";\nconst s = "ab";\ns.length = 5;', ["! Cannot assign to read only property 'length' of string 'ab'"], 'lecture 11: length in strict mode');
  // lecture 12: the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const fold = (s) =>');
    const top = head(cards);
    check(top !== cards && !top.includes('console.log'), 'lecture 12: the program without its output lines');
    const noStrip = top.replace('s.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase()', 's.normalize("NFD").toLowerCase()');
    check(noStrip !== top, 'lecture 12, experiment 1: fold without replace');
    await extra(`${noStrip}\nconsole.log(findCards("corek"));`, ['(0) []'], 'lecture 12, experiment 1: nothing found');
    const bySlice = top.replace('([...s].length > n ? [...s].slice(0, n).join("") + "…" : s)', '(s.length > n ? s.slice(0, n) + "…" : s)');
    check(bySlice !== top, 'lecture 12, experiment 2: short by slice');
    await extra(`${bySlice}\nconsole.log(short("🙂🙂🙂", 3).isWellFormed(), short("🙂🙂🙂", 3).length);`, ['false 4'], 'lecture 12, experiment 2: a lone half');
    const noU = top.replace('/^\\p{L}+(?: \\p{L}+)*$/u', '/^\\p{L}+(?: \\p{L}+)*$/');
    check(noU !== top, 'lecture 12, experiment 3: WORDS without u');
    await extra(`${noU}\nconsole.log(checkTranslation("çörek"), checkTranslation("p{L}"));`, ['false true'], 'lecture 12, experiment 3: p{L} passes');
  }
  // self-check 2
  await extra('console.log(/^\\p{L}+$/.test("çörek"), /^\\p{L}+$/u.test("çörek"));', ['false true'], 'lecture, self-check 2');
  // notes: the main block
  await extra('console.log("🙂".length, [..."🙂"].length, /^.$/u.test("🙂"), "Gülnar dünýä".match(/\\p{L}+/gu), "e\\u0301".normalize() === "\\u00E9", String.raw`\\d+\\.\\d+`.length);',
    ["2 1 true (2) ['Gülnar', 'dünýä'] true 8"], 'notes: the main block');

  // task 1
  await extra('const list = ["Мары", "Gülnar", "🙂", "🇹🇲", "👍🏽", "e\\u0301", "👨‍👦"];\nconsole.log(list.map((s) => `${s.length}/${[...s].length}`), "e\\u0301".normalize().length);',
    ["(7) ['4/4', '6/6', '2/1', '4/2', '4/2', '2/2', '5/3'] 1"], 'task 1: the numbers of the criteria');
  // task 2
  await extra('console.log([/^.$/.test("🙂"), /^.$/u.test("🙂"), /^\\w+$/.test("dünýä"), /^\\p{L}+$/u.test("dünýä"), /\\p{L}/.test("p{L}"), /\\bкот\\b/u.test("кот")].join(" "), /(?<!\\p{L})кот(?!\\p{L})/u.test("кот"), [/^.$/v.test("🙂"), /^\\p{L}+$/v.test("dünýä"), /\\bкот\\b/v.test("кот")].join(" "));',
    ['false true false true true false true true true false'], 'task 2: the six answers, the fix, v');
  // task 3
  await extra('const e1 = "\\u00E9", e2 = "e\\u0301";\nconsole.log(e1 === e2, e1.normalize() === e2.normalize(), [...e2].map((c) => c.codePointAt(0).toString(16)), e2.includes("e"), e1.includes("e"), "\\uFB00".normalize("NFC") === "\\uFB00", "\\uFB00".normalize("NFKC"));',
    ["false true (2) ['65', '301'] true false true ff"], 'task 3: the numbers of the criteria');
  // task 4
  await extra(`const reverse = (s) => [...s].reverse().join("");
const truncate = (s, n) => ([...s].length > n ? [...s].slice(0, n).join("") + "…" : s);
console.log(reverse("Привет 🙂!"), truncate("Сегодня 🙂 сдали экзамен", 9), truncate("suw", 9), reverse("Привет 🙂!").isWellFormed(), truncate("Сегодня 🙂 сдали экзамен", 9).isWellFormed());
console.log("Привет 🙂!".split("").reverse().join("").isWellFormed(), "Сегодня 🙂 сдали экзамен".slice(0, 9).isWellFormed(), reverse("👍🏽") === "🏽👍");`,
  ['!🙂 тевирП Сегодня 🙂… suw true true', 'false false true'], 'task 4: the numbers of the criteria');
  // task 5
  await extra(`const text = "Salam, dünýä! Привет, мир! Hello, world! Гүлнар 2026";
const words = text.match(/\\p{L}+/gu);
const byScript = Map.groupBy(words, (w) => (/\\p{sc=Cyrillic}/u.test(w) ? "кириллица" : "латиница"));
console.log(words.length, byScript.get("латиница").length, byScript.get("кириллица").length, text.match(/\\p{N}+/gu), text.match(/\\w+/g));`,
  ["7 4 3 (1) ['2026'] (6) ['Salam', 'd', 'n', 'Hello', 'world', '2026']"], 'task 5: the numbers of the criteria');
  // task 6
  await extra(`const names = ["Gülnar", "Aýna", "Ýusup", "Şatlyk", "Йомут"];
const fold = (s) => s.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase();
const search = (q) => names.filter((n) => fold(n).includes(fold(q)));
const fold2 = (s) => s.normalize("NFD").replace(/(?<=\\p{Script=Latin})\\p{M}+/gu, "").normalize().toLowerCase();
const search2 = (q) => names.filter((n) => fold2(n).includes(fold2(q)));
const queries = ["gul", "ayna", "yusup", "satl", "йом"];
console.log(queries.map((q) => search(q).join()), fold2("йод") === "йод", fold("йод"), queries.map((q) => search2(q).join()));`,
  ["(5) ['Gülnar', 'Aýna', 'Ýusup', 'Şatlyk', 'Йомут'] true иод (5) ['Gülnar', 'Aýna', 'Ýusup', 'Şatlyk', 'Йомут']"], 'task 6: the numbers of the criteria');
  // task 7
  await extra('const isName = (s) => /^\\p{Lu}\\p{Ll}+(?: \\p{Lu}\\p{Ll}+)*$/u.test(s.normalize());\nconsole.log(["Gülnar", "Aýna Meredowa", "Гүлнар", "Ýusup"].map(isName), ["gülnar", "Gülnar2", "Gülnar  Ata"].map(isName), isName("Gu\\u0308lnar"), /^\\p{Lu}\\p{Ll}+$/u.test("Gu\\u0308lnar"), /^[A-Z][a-z]+$/.test("Ýusup"));',
    ['(4) [true, true, true, true] (3) [false, false, false] true false false'], 'task 7: the numbers of the criteria');
  // task 8
  await extra('const glue = (parts, values) => parts.reduce((acc, s, i) => acc + s + (i < values.length ? `[${values[i]}]` : ""), "");\nconst mark = (strings, ...values) => glue(strings, values);\nconst markRaw = (strings, ...values) => glue(strings.raw, values);\nconst count = (strings, ...values) => `${strings.length} ${values.length}`;\nconsole.log(mark`Итого ${5} из ${10}.`, count`Итого ${5} из ${10}.`, mark`a\\n${1}`.length, markRaw`a\\n${1}`.length, String.raw({ raw: ["a", "b", "c"] }, 1, 2));',
    ['Итого [5] из [10]. 3 2 5 6 a1b2c'], 'task 8: the numbers of the criteria');
  // task 9
  await extra('const isTurkmenWord = (w) => /^[[a-zäçňöşüýž]--[cqvx]]+$/iv.test(w);\nconst emoji = "Ура 🇹🇲 👍🏽 🙂".match(/\\p{RGI_Emoji}/gv);\nconsole.log(["çörek", "ÇÖREK", "cat", "señor"].map(isTurkmenWord), "Gülnar Aýna Мерет Гүлнар".match(/[\\p{sc=Cyrillic}&&\\p{Lu}]/gv), emoji.length, emoji.reduce((n, e) => n + [...e].length, 0), /[\\|]/v.test("a|b"));',
    ["(4) [true, true, false, false] (2) ['М', 'Г'] 3 5 true"], 'task 9: the numbers of the criteria');
  await extra(errOf('new RegExp("[|]", "v")'), ['SyntaxError Invalid regular expression: /[|]/v: Invalid character in character class'], 'task 9: the error');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
