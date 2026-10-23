// Course 2, day 15, in Chrome: every <pre class="code js"> block of the lecture, the notes and the tasks runs as a
// <script> of its own on a clean page (an http origin), the way a student would run a file. Console output is rebuilt
// from Chrome's preview objects, as DevTools prints it: objects with the constructor's name in front when it is not
// Object, a symbol as Symbol(description), a Map with its entries — Map(2) {'a' => 1, 'b' => 2} — and a Set with its
// elements — Set(2) {'a', 'b'} (an object inside is {…}; a preview stops after 5 entries; an empty Set has no entries
// in the preview, so it is printed as "Set(0) {<empty>}" and must not appear in the text); an uncaught error is
// "! message" (V8 text; the prefix that Playwright adds to a SyntaxError of an injected script is cut off).
//   node tools/runs/intermediate/day-15.cjs            every block: code head, output, errors; checks below
//   node tools/runs/intermediate/day-15.cjs --quiet    only the checks
// Checks: a block's output equals EXPECT for a line it contains (first match); a result-box right after a block
// equals its output; a lecture or tasks block with neither is a problem; every EXPECT key is in exactly one block.
// Extra runs cover the claims of the prose (size is read-only, -0 becomes 0, the constructor errors, live iteration,
// a value deleted and re-added in forEach is visited again — guarded, never endless —, the order of each operation,
// which side an operation walks, set-like arguments and their errors, what WeakSet accepts and lacks, the walk without
// marks, a double listener, Symbol.species, the spec of clear), the three experiments of «Карточки» and reference
// solutions of tasks 1–9.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');

const DAY = path.join(__dirname, '../../../intermediate/day-15');
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
// a key or a value inside a Map or Set preview (an ObjectPreview, one level deep)
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
    const entries = a.preview.entries.map((e) => pv(e.value));
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
  'const learnedSet = new Set([2, 2]);': ["2 (2) ['роман', 'повесть']", "1 Set(2) {'роман', 'повесть'}"],
  'topics.add("циклы").add("массивы").add("циклы");': ['2 true false', "true false Set(1) {'циклы'}", '0'],
  's.add(point).add({ x: 10 }).add(point);': ["Set(4) {NaN, 0, 1, '1'}", '6 true false'],
  'const points = new Set([{ x: 10, y: 20 }, { x: 20, y: 30 }]);': ['1 10'],
  'const unique = [...new Set(numbers)];': ['(4) [2, 13, 4, 5] бан', 'false'],
  'console.log(new Set(cards).size);': ['3', "(2) ['book', 'bread']"],
  'const text = JSON.stringify([...topics]);': ['{} ["циклы","классы"] true'],
  'console.log(new Set([...new Set(["water", "book", "bread"])].toSorted()));': ["(3) [1, 5, 'текст']", "(3) [5, 'текст', 1]", "Set(3) {'book', 'bread', 'water'}"],
  'const left2 = big.filter((w) => !learnedSet.has(w.id)).length;': ['5000 5000 true'],
  'deck.splice(deck.indexOf("house"), 1);': ["(2) ['book', 'bread'] -1", 'false 3 true'],
  'const small = new Set([1, 2, 3]);': ['Set(3) {1, 2, 3} Set(3) {1, 2, 3}'],
  'const onlyA = new Set([...a].filter((x) => !c.has(x)));': ['Set(2) {3, 4} Set(2) {1, 2} 6'],
  'const basics = new Set(["циклы", "массивы"]);': ['true true false', 'true true', 'false true'],
  'const present = new Set(["Аман", "Мерет", "Айна"]);': ["Set(2) {'Аман', 'Айна'} Set(1) {'Мерет'}", '! The .size property is NaN'],
  'const grades = new Set([5, 4, 3, 2]);': ['Set(2) {4, 2} Set(2) {5, 3} false'],
  'ws.add(aman).add(meret);': ['true true false true', 'false undefined undefined', '! Invalid value used in weak set'],
  'walk(group, () => count++);': ['4'],
  'console.log(bindOnce(button), bindOnce(button));': ['true false', '1'],
  'console.log(it.next().value, it.next().done);': ['1', '4 true'],
  'new Set([1]).union(other);': ["(3) ['has(1)', 'keys()', 'keys()']"],
  'console.log(Object.keys(["a", "b"]), Array(3).length, Array.isArray(Array.prototype));': ["(2) ['0', '1'] 3 true", '{value: 1, writable: true, enumerable: false, configurable: false}'],
  // tasks
  's.add("3").add(1).add(NaN).add(NaN);': ["4 (4) [1, '3', NaN, 3]", 'true false 2'],
  'if (x === 3) s.add(4);': ['(3) [1, 3, 4]', '5 1'],
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
      check(!out.some((l) => l.includes('{<empty>}')), `${name} #${i}: no empty Set is printed`);
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
  // the name of the error a call throws, and its message
  const errOf = (expr) => `try {\n  ${expr};\n  console.log("no error");\n} catch (e) {\n  console.log(e.name, e.message);\n}`;

  // lecture 2: size is a getter without a setter; the constructor needs new
  await extra('const s = new Set([1]);\ns.size = 10;\nconsole.log(s.size, Object.getOwnPropertyDescriptor(Set.prototype, "size").set);', ['1 undefined'], 'lecture 2: size = 10 is ignored');
  await extra('"use strict";\nconst s = new Set();\ns.size = 10;', ['! Cannot set property size of #<Set> which has only a getter'], 'lecture 2 and 12: in strict mode');
  await extra(errOf('Set()'), ["TypeError Constructor Set requires 'new'"], 'lecture 2 and 12: Set() without new');
  await extra(errOf('WeakSet()'), ["TypeError Constructor WeakSet requires 'new'"], 'lecture 12: WeakSet() without new');
  await extra('console.log(new Set(["циклы", "массивы"]).size, new Set().add(1).add(1).size);', ['2 1'], 'lecture 2: the constructor takes an iterable; a repeated add changes nothing');
  // lecture 3: -0 is stored as +0
  await extra('const s = new Set([-0]);\nconsole.log(Object.is([...s][0], 0), s.has(-0), s.has(0));', ['true true true'], 'lecture 3: -0 becomes 0');
  // lecture 4: repeats in a saved array disappear on reading
  await extra('console.log(new Set(JSON.parse("[1,1,2]")).size);', ['2'], 'lecture 4: repeats vanish when read');
  // lecture 5: keys, values, entries, the iterator chain, live iteration
  await extra('const s = new Set(["a"]);\nconsole.log(Set.prototype.entries === Set.prototype.values, String(s.values()), Object.getPrototypeOf(Object.getPrototypeOf(s.values())) === Iterator.prototype);', ['false [object Set Iterator] true'], 'lecture 5 and 13: entries is another function; Set iterators inherit from Iterator.prototype');
  await extra('const s = new Set([1, 2, 3]);\nconst seen = [];\nfor (const x of s) {\n  seen.push(x);\n  if (x === 1) {\n    s.delete(2);\n    s.add(4);\n  }\n}\nconsole.log(seen);', ['(3) [1, 3, 4]'], 'lecture 5: added values are visited, deleted ones are not');
  await extra('const s = new Set([1, 2]);\nlet visits = 0;\ns.forEach((v) => {\n  visits++;\n  if (v === 1 && visits < 5) {\n    s.delete(1);\n    s.add(1);\n  }\n});\nconsole.log(visits);', ['5'], 'lecture 5: a value deleted and re-added in forEach comes again');
  // lecture 6: two listeners count one click twice (lecture 11 too)
  await extra('let clicks = 0;\nconst button = document.createElement("button");\nbutton.addEventListener("click", () => clicks++);\nbutton.addEventListener("click", () => clicks++);\nbutton.click();\nconsole.log(clicks);', ['2'], 'lecture 11: a second listener counts a click twice');
  // lecture 7: the order of each operation; the originals stay
  await extra(`const groupA = new Set(["циклы", "массивы", "объекты", "классы"]);
const groupB = new Set(["классы", "Map", "циклы"]);
console.log(groupB.union(groupA), groupB.symmetricDifference(groupA));
console.log(new Set([3, 2, 1]).difference(new Set([1])), new Set([1, 2]).intersection(new Set([2, 1])), groupA.size, groupB.size);`,
  ["Set(5) {'классы', 'Map', 'циклы', 'массивы', 'объекты'} Set(3) {'Map', 'массивы', 'объекты'}", 'Set(2) {3, 2} Set(2) {1, 2} 4 3'], 'lecture 7: union and symmetricDifference start with this; difference keeps the order of this; the originals stay');
  // lecture 9: arrays are not set-like; a Set made of the array works; keys() of an array gives indices
  await extra('const present = new Set(["Аман", "Мерет", "Айна"]);\nconsole.log(present.union(new Set(["Сапар"])).size, [...["x", "y"].keys()]);', ['4 (2) [0, 1]'], 'lecture 9: a Set made of the array; keys() of an array');
  await extra(errOf('new Set([1]).union(new WeakSet())'), ['TypeError The .size property is NaN'], 'lecture 9 and 12: a WeakSet is not set-like');
  // lecture 10: what WeakSet accepts and lacks
  await extra('const ws = new WeakSet();\nconst s = Symbol("x");\nws.add(s).add(Symbol.iterator);\nconsole.log(ws.has(s), ws.has(Symbol.iterator), ws.delete(1), typeof ws.clear, Object.getOwnPropertyNames(WeakSet.prototype));', ["true true false undefined (4) ['constructor', 'delete', 'has', 'add']"], 'lecture 10: Symbol() and Symbol.iterator are fine; delete with a primitive; three methods');
  await extra(errOf('new WeakSet().add(Symbol.for("x"))'), ['TypeError Invalid value used in weak set'], 'lecture 10 and 12: a registered symbol');
  await extra(errOf('new WeakSet([1])'), ['TypeError Invalid value used in weak set'], 'lecture 12: the constructor checks too');
  await extra('const ws = new WeakSet();\nfor (const x of ws) {}', ['! ws is not iterable'], 'lecture 12: for...of over a WeakSet');
  // lecture 11: the walk without marks; JSON of a circle
  await extra(`const group = { title: "JS-1", students: [] };
const aman = { name: "Аман", group };
group.students.push(aman);
function walkNaive(value) {
  if (typeof value !== "object" || value === null) return;
  for (const inner of Object.values(value)) walkNaive(inner);
}
try {
  walkNaive(group);
} catch (e) {
  console.log(e.name, e.message);
}
try {
  JSON.stringify(group);
} catch (e) {
  console.log(e.name, e.message.split("\\n")[0]);
}`, ['RangeError Maximum call stack size exceeded', 'TypeError Converting circular structure to JSON'], 'lecture 11: without seen the walk overflows; JSON fails on the circle');
  // lecture 12: the error table and their names
  await extra(errOf('new Set(5)'), ['TypeError number 5 is not iterable (cannot read property Symbol(Symbol.iterator))'], 'lecture 12: new Set(5)');
  await extra(errOf('new Set([1]).union([1, 2])'), ['TypeError The .size property is NaN'], 'lecture 12: an array');
  await extra(errOf('new Set([1]).union({ size: -1, has() {}, keys() {} })'), ["RangeError '-1' is an invalid size"], 'lecture 12: a negative size');
  await extra(errOf('new Set([1]).union("ab")'), ['TypeError Set.prototype.union argument must be an object'], 'lecture 12: a string');
  await extra('const d = Object.getOwnPropertyDescriptor(Set, Symbol.species);\nconsole.log(typeof d.get, d.set, Set[Symbol.species] === Set);', ['function undefined true'], 'lecture 12: the species getter');
  // lecture 13: GetSetRecord, the receiver, which side each operation walks
  await extra(errOf('new Set([1]).union({ size: 1 })'), ['TypeError string "has" is not a function'], 'lecture 13: has is not a function');
  await extra(errOf('Set.prototype.union.call([1], new Set())'), ['TypeError Method Set.prototype.union called on incompatible receiver [object Array]'], 'lecture 13: this must be a Set');
  await extra(`const calls = [];
const other = {
  size: 2,
  has(x) {
    calls.push(\`has(\${x})\`);
    return x === 1;
  },
  keys() {
    calls.push("keys()");
    return [1, 9].values();
  },
};
const log = (name, result) => {
  console.log(name, result, calls.join(" ") || "-");
  calls.length = 0;
};
log("subset-big", new Set([1, 2, 3]).isSubsetOf(other));
log("subset-small", new Set([1]).isSubsetOf(other));
log("superset-small", new Set([1]).isSupersetOf(other));
log("superset-big", new Set([1, 9, 3]).isSupersetOf(other));
log("difference-small", new Set([1]).difference(other).size);
log("difference-big", new Set([1, 2, 3]).difference(other).size);
log("disjoint-small", new Set([1]).isDisjointFrom(other));
log("disjoint-big", new Set([1, 2, 3]).isDisjointFrom(other));
log("symmetric", new Set([1]).symmetricDifference(other).size);`,
  ['subset-big false -', 'subset-small true has(1)', 'superset-small false -', 'superset-big true keys()', 'difference-small 0 has(1)', 'difference-big 2 keys()', 'disjoint-small false has(1)', 'disjoint-big false keys()', 'symmetric 1 keys()'], 'lecture 13: which side each operation walks');
  // lecture 14, the three experiments of «Карточки»; the marks are not in the cards
  {
    const cards = find('lecture', 'const learnedA = new Set([1, 3]);');
    const base = await runOnPage([cards]);
    const noUnion = cards.replace('const learned = learnedA.union(savedB);', 'const learned = savedB;');
    check(noUnion !== cards, 'lecture 14, experiment 1: union replaced');
    const out1 = await runOnPage([noUnion]);
    check(out1[0] === 'Set(2) {1, 3} Set(2) {1, 4} Set(3) {2, 3, 5}', `lecture 14, experiment 1: number 3 is lost: ${JSON.stringify(out1[0])}`);
    const withString = cards.replace('learnedA.add(3);', 'learnedA.add(3);\nlearnedA.add("3");');
    check(withString !== cards, 'lecture 14, experiment 2: "3" added');
    const out2 = await runOnPage([withString]);
    check(out2[0].startsWith("Set(3) {1, 3, '3'} "), `lecture 14, experiment 2: a string next to the number: ${JSON.stringify(out2[0])}`);
    const withSet = cards.replace('const shown = new WeakSet();', 'const shown = new Set();');
    check(withSet !== cards, 'lecture 14, experiment 3: WeakSet replaced by Set');
    const out3 = await runOnPage([withSet]);
    check(same(out3, base), `lecture 14, experiment 3: the same output (${out3.length} lines)`);
    const out4 = await runOnPage([`${cards}\nconsole.log(Object.keys(cards[1]).length, learnedA.union(new Set()).size);`]);
    check(out4.at(-1) === '4 2', `lecture 14: the cards have no marks; union cannot delete: ${JSON.stringify(out4.at(-1))}`);
  }

  // task 2: without repeats
  await extra(`const genres = ["роман", "повесть", "роман", "стихи", "повесть"];
const hasRepeats = (arr) => new Set(arr).size !== arr.length;
console.log(["все", ...new Set(genres)], new Set("мерет").size, hasRepeats([1, 4, 2, 4]), hasRepeats([1, 4, 2]));`,
  ["(4) ['все', 'роман', 'повесть', 'стихи'] 4 true false"], 'task 2: the numbers of the criteria');
  // task 3: on paper
  await extra(`const a = new Set([1, 2, 3, 4]);
const b = new Set([3, 4, 5]);
console.log(a.union(b), a.intersection(b), a.difference(b), b.difference(a));
console.log(a.symmetricDifference(b), b.symmetricDifference(a), new Set([3, 4]).isSubsetOf(a), a.isDisjointFrom(new Set([5, 6])), a.isSupersetOf(new Set([3, 4])));`,
  ['Set(5) {1, 2, 3, 4, 5} Set(2) {3, 4} Set(2) {1, 2} Set(1) {5}', 'Set(3) {1, 2, 5} Set(3) {5, 1, 2} true true true'], 'task 3: the eight lines');
  // task 4: two groups
  await extra(`const groupA = new Set(["циклы", "массивы", "объекты", "классы", "Map"]);
const groupB = new Set(["классы", "Map", "Set", "генераторы"]);
console.log([...groupA.intersection(groupB)], groupA.symmetricDifference(groupB).size, [...groupA.difference(groupB)], groupA.union(groupB).size, groupA.size);
const need = new Set(["классы", "Map"]);
const need2 = new Set(["классы", "Map", "Set"]);
console.log(need.isSubsetOf(groupA), need.isSubsetOf(groupB), need2.isSubsetOf(groupA), need2.isSubsetOf(groupB));`,
  ["(2) ['классы', 'Map'] 5 (3) ['циклы', 'массивы', 'объекты'] 7 5", 'true true false true'], 'task 4: the numbers of the criteria');
  // task 5: the deck on a Set
  await extra(`const big = [];
for (let i = 1; i <= 10000; i++) big.push({ id: i, word: \`word\${i}\` });
const learnedList = [];
for (let i = 1; i <= 5000; i++) learnedList.push(i);
const learned = new Set(learnedList);
let t = Date.now();
const byIncludes = big.filter((w) => !learnedList.includes(w.id)).length;
const includesMs = Date.now() - t;
t = Date.now();
const byHas = big.filter((w) => !learned.has(w.id)).length;
const hasMs = Date.now() - t;
const before = learned.size;
learned.add(7).add(7);
learned.add(10001).add(10001);
const restored = new Set(JSON.parse(JSON.stringify([...new Set([1, 2, 3])])));
console.log(byIncludes, byHas, includesMs > hasMs, learned.size - before, JSON.stringify([...new Set([1, 2, 3])]), restored.has(2), restored.size);`,
  ['5000 5000 true 1 [1,2,3] true 3'], 'task 5: the numbers of the criteria');
  // task 6: a Map and an own set-like object
  await extra(`const present = new Set(["Аман", "Мерет", "Айна", "Сапар"]);
const marks = new Map([["Аман", 5], ["Айна", 4]]);
console.log([...present.difference(marks)]);
try {
  present.difference([...marks.keys()]);
} catch (e) {
  console.log(e.message);
}
let hasCalls = 0;
let keysCalls = 0;
const upTo100 = {
  size: 100,
  has(n) {
    hasCalls++;
    return Number.isInteger(n) && n >= 1 && n <= 100;
  },
  *keys() {
    keysCalls++;
    for (let n = 1; n <= 100; n++) yield n;
  },
};
const common = new Set([0, 5, 100, 101]).intersection(upTo100);
console.log(common, hasCalls, keysCalls, new Set([5, 50]).isSubsetOf(upTo100));`,
  ["(2) ['Мерет', 'Сапар']", 'The .size property is NaN', 'Set(2) {5, 100} 4 0 true'], 'task 6: the numbers of the criteria');
  // task 7: a circle of three students; bindOnce
  await extra(`const group = { title: "JS-1", students: [] };
for (const name of ["Аман", "Мерет", "Айна"]) group.students.push({ name, group });
function walk(value, visit, seen = new WeakSet()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  visit(value);
  for (const inner of Object.values(value)) walk(inner, visit, seen);
}
let count = 0;
const names = [];
walk(group, (obj) => {
  count++;
  if (typeof obj.name === "string") names.push(obj.name);
});
console.log(count, names);
${find('lecture', 'function bindOnce(button) {').split('\nconst button')[0]}
const first = document.createElement("button");
const second = document.createElement("button");
console.log(bindOnce(first), bindOnce(first), bindOnce(first), bindOnce(second));
first.click();
console.log(clicks);`,
  ["5 (3) ['Аман', 'Мерет', 'Айна']", 'true false false true', '1'], 'task 7: the numbers of the criteria');
  // task 8: the operations by hand
  await extra(`function union(a, b) {
  const result = new Set(a);
  for (const x of b.keys()) result.add(x);
  return result;
}
function intersection(a, b) {
  const result = new Set();
  for (const x of a) if (b.has(x)) result.add(x);
  return result;
}
function difference(a, b) {
  const result = new Set(a);
  for (const x of b.keys()) result.delete(x);
  return result;
}
function symmetricDifference(a, b) {
  const result = new Set(a);
  for (const x of b.keys()) {
    if (a.has(x)) result.delete(x);
    else result.add(x);
  }
  return result;
}
function isSubsetOf(a, b) {
  if (a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
const same = (x, y) => x.size === y.size && x.isSubsetOf(y);
const a = new Set([1, 2, 3, 4]);
const c = new Set([3, 4, 5, 6]);
console.log(same(union(a, c), a.union(c)), same(intersection(a, c), a.intersection(c)), same(difference(a, c), a.difference(c)), same(symmetricDifference(a, c), a.symmetricDifference(c)));
const big = new Set([4, 3, 2, 1]);
const small = new Set([1, 2, 3]);
console.log([...intersection(big, small)], [...big.intersection(small)]);
const unionOf = (a, b) => {
  const result = new Set(a);
  for (const x of b) result.add(x);
  return result;
};
const map = new Map([[2, "two"]]);
console.log([...unionOf(new Set([1]), map)][1], [...union(new Set([1]), map)]);
let asked = 0;
console.log(isSubsetOf(new Set([1, 2, 3]), { size: 2, has: () => { asked++; return true; } }), asked);`,
  ['true true true true', "(3) [3, 2, 1] (3) [1, 2, 3]", "(2) [2, 'two'] (2) [1, 2]", 'false 0'], 'task 8: the numbers of the criteria');
  // task 9: the same with forEach
  await extra('const s = new Set([1, 2, 3]);\nconst seen = [];\ns.forEach((x) => {\n  seen.push(x);\n  if (x === 1) s.delete(2);\n  if (x === 3) s.add(4);\n});\nconsole.log(seen);', ['(3) [1, 3, 4]'], 'task 9: forEach gives the same');

  await b.close();
  console.log(`\nchecks: ${checked}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  process.exit(bad ? 1 : 0);
})();
