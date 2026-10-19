// Course 2, day 14, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object, a subclass of Array with its name too, a symbol as Symbol(description), and a Map with its entries:
// Map(2) {'book' => 'книга', 'water' => 'вода'} (an object inside an entry is {…}; a preview stops after 5 entries);
// an uncaught error is "! message" (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script
// is cut off).
//   node tools/runs/intermediate/day-14.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-14.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem; every EXPECT key is in exactly one block.
// Extra runs cover the claims of the prose (size is read-only, -0 becomes 0, the constructor errors, live iteration,
// a key deleted and re-added in forEach is visited again — guarded, never endless —, getOrInsertComputed is lazy,
// what WeakMap accepts and lacks, Symbol.species, the constructor calls set, an entry may be { 0, 1 }), the three
// experiments of «Карточки» and reference solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-14');
const PAGES = ['lecture', 'student', 'tasks'];
const quiet = process.argv.includes('--quiet');

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
// a value inside a preview, as DevTools prints it in a collapsed object or array
const inner = (p) => {
  if (p.type === 'string') return q(p.value);
  if (p.type === 'function') return 'ƒ';
  if (p.type === 'accessor') return '(...)';
  if (p.type === 'object' && p.subtype === 'null') return 'null';
  if (p.type === 'object' && p.subtype !== 'array' && p.value === 'Object') return '{…}';
  return p.value;
};
// a key or a value inside a Map preview (an ObjectPreview, one level deep)
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

// expected output by a line the block contains; the first key found in the block wins, so keys are unique lines
const EXPECT = {
  // lecture
  'byStudent.set(aman, 5).set(meret, 3);': ["3 (1) ['[object Object]']", '5 3 2'],
  'dict.set("book", "книга").set("water", "вода").set("bread", "хлеб");': ['3 книга undefined true', 'true false 2', "Map(2) {'book' => 'учебник', 'bread' => 'хлеб'}", '0'],
  'm.set(NaN, "не число").set(-0, "ноль");': ['6 первый undefined', 'число строка не число ноль'],
  'wrong["book"] = "книга";': ['книга false 0 undefined'],
  'const dict = new Map(Object.entries(words));': ["вода Map(2) {'book' => 'книга', 'water' => 'вода'}", "{book: 'книга', water: 'вода'} {}", '[["book","книга"],["water","вода"]]'],
  'const merged = new Map([...first, ...second]);': ["Map(3) {1 => 'uno', 2 => 'dos', 3 => 'three'} false"],
  'const obj = { b: 2, a: 1, 10: "десять", 2: "два" };': ["(4) ['b', 'a', 10, 2]", "(4) ['a', 10, 2, 'b']", "(4) ['2', '10', 'b', 'a']"],
  'const safe = new Map();': ["string (2) ['constructor', 'book'] 1 3"],
  'byTopic.getOrInsert("еда", []).push("bread");': ["Map(3) {'book' => 3, 'water' => 2, 'bread' => 1}", "(2) ['bread', 'water'] 2"],
  'const bySize = Map.groupBy': ["(2) ['школа', 'еда'] (2) ['bread', 'water']", "(1) ['book'] undefined"],
  'function memo(fn) {': ['number 1 | string 1 | number 1 2'],
  'const visits = new WeakMap();': ['3 true true false', 'undefined undefined undefined', '! Invalid value used as weak map key'],
  'function stats(student) {': ['4.67 5 1', 'false 2'],
  // tasks
  'marks[{ name: "Аман" }] = 5;': ["(2) ['1', '[object Object]'] строка", '3 число undefined'],
  'm.set("c", 30);': ["(3) ['c', 'b', 'a'] 3 30", "Map(3) {'c' => 30, 'b' => 2, 'a' => 10}"],
};

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await b.newContext();
  await ctx.route('http://day.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>run</title><body></body>' }));
  let bad = 0, checked = 0;
  const check = (ok, text) => { checked++; if (!ok) bad++; if (!ok || !quiet) console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // runs scripts one after another on one fresh page; returns console lines and errors
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
        example: !!pre.closest('.example'),
      };
    }));
    await src.close();
    all[name] = blocks;
    if (!quiet) console.log(`\n===== ${name}: ${blocks.length} blocks`);

    for (const [i, blk] of blocks.entries()) {
      const out = await runOnPage([blk.code]);
      const first = blk.code.split('\n')[0];
      if (!quiet) {
        console.log(`\n--- ${name} #${i}${blk.cheat ? ' (cheatsheet)' : ''}${blk.example ? ' (example)' : ''}: ${first}`);
        for (const l of out) console.log(`    > ${l}`);
      }
      if (blk.cheat) { check(!out.some((l) => l.startsWith('! ')), `${name} #${i} (cheatsheet) runs without an error`); continue; }
      if (blk.example) continue;
      const key = Object.keys(EXPECT).find((k) => blk.code.includes(k));
      if (key && name !== 'student') check(same(out, EXPECT[key]), `${name} #${i} ${first.trim().slice(0, 50)}: ${JSON.stringify(out)}`);
      if (!key && name !== 'student' && !blk.box) check(false, `${name} #${i} ${first.trim().slice(0, 50)}: no EXPECT key and no result-box`);
      if (blk.box) check(same(out, blk.box), `${name} #${i}: result-box = output (${out.length} lines)`);
      if (name === 'student') check(!out.some((l) => l.startsWith('! ')), `student #${i} runs without an error`);
    }
  }

  // every EXPECT key is used by exactly one block, so a key cannot silently match the wrong block
  for (const k of Object.keys(EXPECT)) {
    const n = [...all.lecture, ...all.tasks].filter((x) => x.code.includes(k)).length;
    check(n === 1, `EXPECT key in exactly one block (${n}): ${k.slice(0, 50)}`);
  }

  const find = (page, line) => all[page].find((x) => x.code.includes(line)).code;
  const extra = async (code, want, text) => {
    const out = await runOnPage(Array.isArray(code) ? code : [code]);
    check(same(out, want), `${text}: ${JSON.stringify(out)}`);
  };

  // lecture 2: size is a getter without a setter
  await extra('const m = new Map([[1, 1]]);\nm.size = 10;\nconsole.log(m.size, Object.getOwnPropertyDescriptor(Map.prototype, "size").set);', ['1 undefined'], 'lecture 2: size = 10 is ignored');
  await extra('"use strict";\nconst m = new Map();\nm.size = 10;', ['! Cannot set property size of #<Map> which has only a getter'], 'lecture 2: in strict mode');
  // lecture 3: -0 is stored as +0
  await extra('const m = new Map([[-0, "ноль"]]);\nconsole.log(Object.is([...m.keys()][0], 0), m.get(0), m.get(-0));', ['true ноль ноль'], 'lecture 3: the key -0 becomes 0');
  // lecture 5: the constructor errors
  await extra('const m = Map();', ["! Constructor Map requires 'new'"], 'lecture 5: Map() without new');
  await extra('WeakMap();', ["! Constructor WeakMap requires 'new'"], 'lecture 12: WeakMap() without new');
  await extra('new Map([1, 2]);', ['! Iterator value 1 is not an entry object'], 'lecture 5: not an entry');
  await extra('new Map({ a: 1 });', ['! object is not iterable (cannot read property Symbol(Symbol.iterator))'], 'lecture 5: a plain object');
  await extra('const first = new Map([[1, { n: 1 }]]);\nconst copy = new Map(first);\ncopy.get(1).n = 2;\nconsole.log(first.get(1).n);', ['2'], 'lecture 5: the copy is shallow');
  // lecture 6: live iteration; a re-added key is visited again (guarded)
  await extra('const m = new Map([[1, "a"], [2, "b"], [3, "c"]]);\nconst seen = [];\nfor (const [k] of m) {\n  seen.push(k);\n  if (k === 1) {\n    m.delete(2);\n    m.set(4, "d");\n  }\n}\nconsole.log(seen);', ['(3) [1, 3, 4]'], 'lecture 6: added entries are visited, deleted ones are not');
  await extra('const m = new Map([[1, "a"], [2, "b"]]);\nlet visits = 0;\nm.forEach((value, key) => {\n  visits++;\n  if (key === 1 && visits < 5) {\n    m.delete(1);\n    m.set(1, value);\n  }\n});\nconsole.log(visits);', ['5'], 'lecture 6: a key deleted and re-added in forEach comes again');
  await extra('const m = new Map([["a", 1]]);\nconsole.log(String(m.keys()), Object.getPrototypeOf(Object.getPrototypeOf(m.keys())) === Iterator.prototype);', ['[object Map Iterator] true'], 'lecture 6 and 13: Map iterators inherit from Iterator.prototype');
  // lecture 8: getOrInsertComputed is lazy, getOrInsert is not
  await extra('let calls = 0;\nconst make = (key) => {\n  calls++;\n  return key.toUpperCase();\n};\nconst m = new Map([["a", "есть"]]);\nm.getOrInsert("a", make("a"));\nconst before = calls;\nm.getOrInsertComputed("a", make);\nm.getOrInsertComputed("b", make);\nconsole.log(before, calls, m.get("b"));', ['1 2 B'], 'lecture 8: getOrInsertComputed calls the function only when needed');
  await extra('console.log(Object.groupBy([{ k: { short: true } }], (x) => x.k));', ["{[object Object]: Array(1)}"], 'lecture 8: Object.groupBy turns object keys into strings');
  // lecture 10: what WeakMap accepts and lacks
  await extra('new WeakMap().set(Symbol.for("cards.learned"), 1);', ['! Invalid value used as weak map key'], 'lecture 10: a registered symbol');
  await extra('const s = Symbol("метка");\nconst wm = new WeakMap([[s, 1]]);\nconsole.log(wm.get(s), wm.get(1), wm.has("x"), wm.delete(5));', ['1 undefined false false'], 'lecture 10: Symbol() is a key; get/has/delete with primitives do not throw');
  await extra('const wm = new WeakMap();\nfor (const x of wm) {}', ['! wm is not iterable'], 'lecture 10: for...of over a WeakMap');
  await extra('console.log(Object.getOwnPropertyNames(WeakMap.prototype));', ["(7) ['constructor', 'delete', 'get', 'set', 'has', 'getOrInsert', 'getOrInsertComputed']"], 'lecture 10: no size, clear, keys');
  // lecture 11: the cache does not see changes
  await extra(`${find('lecture', 'function stats(student) {').split('\nconst aman')[0]}\nconst aman = { name: "Аман", marks: [5, 4, 5] };\nstats(aman);\naman.marks.push(2);\nconsole.log(stats(aman).avg.toFixed(2));\ncache.delete(aman);\nconsole.log(stats(aman).avg.toFixed(2), computed);`,
    ['4.67', '4.00 2'], 'lecture 11: a stale value until delete');
  // lecture 12: Symbol.species; old constructors without new
  await extra('const d = Object.getOwnPropertyDescriptor(Map, Symbol.species);\nconsole.log(typeof d.get, d.set, Map[Symbol.species] === Map, typeof Date(), typeof String(5), typeof new String(5), Array(2).length, typeof Object(), Error("x").message);',
    ['function undefined true string string object 2 object x'], 'lecture 12: species getter; old constructors without new');
  // lecture 13: the constructor calls set; an entry may be { 0, 1 }
  await extra('class Logged extends Map {\n  set(key, value) {\n    console.log("set", key);\n    return super.set(key, value);\n  }\n}\nconst m = new Logged([["a", 1], ["b", 2]]);\nconsole.log(m.size, new Map([{ 0: "k", 1: "v" }]).get("k"));', ['set a', 'set b', '2 v'], 'lecture 13: AddEntriesFromIterable calls set and reads "0" and "1"');

  // lecture 14, the three experiments of «Карточки»
  {
    const cards = find('lecture', 'const byTopic = Map.groupBy(cards');
    const withMap = cards.replace('const stats = new WeakMap();', 'const stats = new Map();');
    check(withMap !== cards, 'lecture 14, experiment 1: WeakMap replaced by Map');
    const base = await runOnPage([cards]);
    const out1 = await runOnPage([`${withMap}\nconsole.log(stats.size, [...stats.values()].map((s) => s.tries));`]);
    check(same(out1.slice(0, 5), base) && out1[5] === '3 (3) [1, 2, 1]', `lecture 14, experiment 1: the same output; Map has size and can be listed: ${JSON.stringify(out1[5])}`);
    const asObject = cards.replace('const byId = new Map(cards.map((card) => [card.id, card]));', 'const byId = {};\nfor (const card of cards) byId[card.id] = card;').replace('const card = byId.get(id);', 'const card = byId[id];');
    check(asObject !== cards, 'lecture 14, experiment 2: byId as an object');
    const out2 = await runOnPage([`${asObject.split('\nconsole.log(byId.get(3)')[0]}\nconsole.log(byId[3].word, Object.keys(byId), typeof Object.keys(byId)[0]);`]);
    check(same(out2, ["bread (5) ['1', '2', '3', '4', '5'] string"]), `lecture 14, experiment 2: the keys became strings: ${JSON.stringify(out2)}`);
    const out3 = await runOnPage([`${cards}\nanswer(9, "что-то");`]);
    check(out3.at(-1) === '! Invalid value used as weak map key', `lecture 14, experiment 3: an unknown id: ${JSON.stringify(out3.at(-1))}`);
  }

  // task 2: the same with an object
  await extra('const o = { c: 3, a: 1 };\no.b = 2;\no.c = 30;\ndelete o.a;\no.a = 10;\no[10] = 1;\no[2] = 1;\nconsole.log(Object.keys(o));', ["(5) ['2', '10', 'c', 'b', 'a']"], 'task 2: the object order');
  // task 3: three errors of eight
  await extra(`const wm = new WeakMap();
const results = [];
const tryIt = (name, fn) => {
  try {
    results.push(\`\${name}: \${fn()}\`);
  } catch (e) {
    results.push(\`\${name}: ! \${e.message}\`);
  }
};
tryIt("1", () => wm.set("a", 1) && "ok");
tryIt("2", () => wm.set({}, 1) && "ok");
tryIt("3", () => wm.set(Symbol("x"), 1) && "ok");
tryIt("4", () => wm.set(Symbol.for("x"), 1) && "ok");
tryIt("5", () => wm.size);
tryIt("6", () => wm.get(1));
tryIt("7", () => wm.has("x"));
tryIt("8", () => {
  for (const x of wm) {}
  return "ok";
});
console.log(results.join(" | "));`,
  ['1: ! Invalid value used as weak map key | 2: ok | 3: ok | 4: ! Invalid value used as weak map key | 5: undefined | 6: undefined | 7: false | 8: ! wm is not iterable'], 'task 3: three errors of eight');
  // task 4: frequencies
  await extra(`const wrong = ["вода", "хлеб", "вода", "дом", "вода", "хлеб", "constructor"];
const freq = new Map();
for (const w of wrong) freq.set(w, freq.getOrInsert(w, 0) + 1);
console.log(JSON.stringify([...freq].toSorted((a, b) => b[1] - a[1]).slice(0, 2)), freq.entries().map(([w, n]) => \`\${w}: \${n}\`).join(", "));
const obj = {};
for (const w of wrong) obj[w] = (obj[w] ?? 0) + 1;
console.log(typeof obj.constructor, freq.get("constructor"));`,
  ['[["вода",3],["хлеб",2]] вода: 3, хлеб: 2, дом: 1, constructor: 1', 'string 1'], 'task 4: the numbers of the criteria');
  // task 5: groups with object keys; the reversed dictionary
  await extra(`const students = [
  { name: "Аман", avg: 4.7 },
  { name: "Мерет", avg: 3.4 },
  { name: "Айна", avg: 4.9 },
  { name: "Сапар", avg: 4.1 },
];
const excellent = { label: "отлично" };
const good = { label: "хорошо" };
const groups = Map.groupBy(students, (s) => (s.avg >= 4.5 ? excellent : good));
console.log(groups.get(excellent).map((s) => s.name), groups.get(good).length, groups.get({ label: "отлично" }));
const dict = new Map([["book", "книга"], ["water", "вода"], ["bread", "хлеб"]]);
const back = new Map(dict.entries().map(([en, ru]) => [ru, en]));
console.log(back.get("вода"), JSON.stringify(Object.fromEntries(dict)));`,
  ["(2) ['Аман', 'Айна'] 2 undefined", 'water {"book":"книга","water":"вода","bread":"хлеб"}'], 'task 5: the numbers of the criteria');
  // task 6: memo on Map and WeakMap; the old memo
  await extra(`function memo(fn) {
  const cache = new Map();
  return function (key) {
    if (!cache.has(key)) cache.set(key, fn.call(this, key));
    return cache.get(key);
  };
}
function oldMemo(fn) {
  const cache = {};
  return function (key) {
    if (!Object.hasOwn(cache, key)) cache[key] = fn.call(this, key);
    return cache[key];
  };
}
let calls = 0;
let oldCalls = 0;
const describe = memo((x) => { calls++; return \`\${typeof x} \${x}\`; });
const oldDescribe = oldMemo((x) => { oldCalls++; return \`\${typeof x} \${x}\`; });
const keys = [1, "1", 1, NaN, NaN];
console.log(keys.map((k) => describe(k)).join(" | "), calls, keys.map((k) => oldDescribe(k)).join(" | "), oldCalls);
function memoObject(fn) {
  const cache = new WeakMap();
  return (obj) => cache.getOrInsertComputed(obj, fn);
}
let heavy = 0;
const total = memoObject((s) => {
  heavy++;
  return s.marks.reduce((a, b) => a + b);
});
const aman = { marks: [5, 4, 5] };
console.log(total(aman), total(aman), total({ marks: [5, 4, 5] }), heavy);`,
  ['number 1 | string 1 | number 1 | number NaN | number NaN 3 number 1 | number 1 | number 1 | number NaN | number NaN 2', '14 14 14 2'], 'task 6: the numbers of the criteria');
  // task 8: a map on two arrays
  await extra(`class ArrayMap {
  #keys = [];
  #values = [];
  #find(key) {
    return this.#keys.findIndex((k) => k === key || (k !== k && key !== key));
  }
  set(key, value) {
    const i = this.#find(key);
    if (i === -1) {
      this.#keys.push(key);
      this.#values.push(value);
    } else {
      this.#values[i] = value;
    }
    return this;
  }
  get(key) {
    const i = this.#find(key);
    return i === -1 ? undefined : this.#values[i];
  }
  has(key) {
    return this.#find(key) !== -1;
  }
  delete(key) {
    const i = this.#find(key);
    if (i === -1) return false;
    this.#keys.splice(i, 1);
    this.#values.splice(i, 1);
    return true;
  }
  get size() {
    return this.#keys.length;
  }
}
const am = new ArrayMap().set(NaN, "не число").set(0, "ноль").set("1", "строка");
console.log(am.get(NaN), am.get(-0), am.has(1), am.size, am.delete("1"), am.size);`, ['не число ноль false 3 true 2'], 'task 8: SameValueZero by hand');
  // task 9: Map and JSON
  await extra(`const progress = new Map([[1, { right: 2 }], [3, { right: 1 }]]);
const saved = JSON.stringify([...progress]);
const restored = new Map(JSON.parse(saved));
console.log(saved, restored.get(1).right, restored.get("1"), restored.get(1) === progress.get(1));
const asObject = Object.fromEntries(progress);
console.log(Object.keys(asObject), typeof Object.keys(asObject)[0]);
const objKey = new Map([[{ id: 1 }, "x"]]);
const back = new Map(JSON.parse(JSON.stringify([...objKey])));
console.log(back.get({ id: 1 }), [...back.keys()][0].id);`,
  ['[[1,{"right":2}],[3,{"right":1}]] 2 undefined false', "(2) ['1', '3'] string", 'undefined 1'], 'task 9: the numbers of the criteria');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
