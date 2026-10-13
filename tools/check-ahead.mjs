// A lesson of day N must not use constructs that the course introduces later than day N.
// The student has not seen them yet, so the example stops being readable.
//
//   node tools/check-ahead.mjs            every day that has a folder
//   node tools/check-ahead.mjs 14         only day 14 (of every course that has it)
//   node tools/check-ahead.mjs --table    print the construct table and exit
//   node tools/check-ahead.mjs --root DIR check another course tree (used by the test)
//
// Only <pre class="code js"> blocks are checked: that is the code the student copies and runs.
// Prose, inline <code> and HTML samples are not checked — there a construct is named, not used.
//
// A deliberate preview is excused in two ways:
//   1. a comment on the same line that names the day or the course:  // день 22   // курс 2
//      (on an English page: // day 22   // course 2)
//   2. an HTML comment right before the block:  <!-- ahead-ok: причина -->
//
// The table below is kept by hand. A row is:
//   id     short name, unique
//   title  what the student sees, in Russian
//   day    the day of course 1 where the construct is taught; 0 — a later course
//   from   the day from which the course already uses it in code (default: same as day)
//          set it when the course shows a construct in action before explaining it
//   where  for day 0: which course explains it
//   day2   the day of course 2 where the construct is taught (docs/plan-2-intermediate.md); every row
//          with where: 'курс 2' has it
//   re     what to look for, after strings and comments have been blanked out
//
// In course 2 everything taught in course 1 (day > 0) is known from day 1; a row with day2 may be used
// from that day on; a row of course 3 is never allowed. The excusing comment names a day of the same course.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const rootAt = argv.indexOf('--root'); // another course tree instead of the repository — used by the test
const ROOT = rootAt === -1 ? path.join(import.meta.dirname, '..') : path.resolve(argv[rootAt + 1]);
if (rootAt !== -1) argv.splice(rootAt, 2);
const COURSE_DIR = { 1: 'essentials', 2: 'intermediate', 3: 'advanced', 4: 'web-apis' };

// Days that tour the language instead of teaching one piece of it. In module E1 of course 1
// ("что такое JavaScript", "инструменты", "обзор языка") a construct from a later day is the
// point of the page, not a slip, so those days are reported as SKIP and never fail the gate.
const TOUR_DAYS = { 1: [1, 2, 3] };
const TOUR_REASON = 'знакомство с языком, показы будущего — замысел модуля E1';

const CONSTRUCTS = [
  // --- инструменты и объявления ---
  { id: 'console', title: 'console.log и соседи', day: 2, re: /\bconsole\.\w+\s*\(/ },
  { id: 'let-const', title: 'let / const', day: 4, from: 3, re: /\b(?:let|const)\s+[A-Za-z_$]/ },
  { id: 'var', title: 'var', day: 4, from: 3, re: /\bvar\s+[A-Za-z_$]/ },
  { id: 'global-this', title: 'globalThis (var в глобальном объекте)', day: 4, re: /\bglobalThis\b/ },

  // --- операторы ---
  { id: 'typeof', title: 'typeof', day: 5, from: 4, re: /\btypeof\b/ },
  { id: 'bigint-literal', title: 'литерал BigInt 9n', day: 5, re: /\b\d+n\b/ },
  { id: 'exponent', title: 'возведение в степень **', day: 6, re: /\*\*/ },
  { id: 'increment', title: '++ и --', day: 6, from: 4, re: /\+\+|--/ },
  { id: 'strict-eq', title: '=== и !==', day: 7, from: 5, re: /===|!==/ },
  { id: 'logical', title: '&& и ||', day: 7, re: /&&|\|\|/ },
  { id: 'nullish', title: 'оператор ??', day: 7, re: /\?\?(?!=)/ },
  { id: 'ternary', title: 'тернарный оператор ? :', day: 7, re: /\?[^?.]*?:/ },

  // --- управление потоком ---
  { id: 'if', title: 'if / else', day: 9, from: 4, re: /\bif\s*\(/ },
  { id: 'switch', title: 'switch', day: 9, re: /\bswitch\s*\(/ },
  { id: 'for', title: 'цикл for', day: 10, from: 4, re: /\bfor\s*\([^)]*;/ },
  { id: 'while', title: 'while / do...while', day: 10, re: /\bwhile\s*\(/ },
  { id: 'break', title: 'break / continue', day: 10, from: 8, re: /\b(?:break|continue)\b/ },
  { id: 'for-of', title: 'for...of', day: 11, from: 4, re: /\bfor\s*\(\s*(?:const|let|var)?\s*[\w[{$]+\s+of\b/ },
  { id: 'for-in', title: 'for...in', day: 11, re: /\bfor\s*\(\s*(?:const|let|var)?\s*[\w[{$]+\s+in\b/ },
  { id: 'try', title: 'try / catch', day: 11, re: /\btry\s*\{/ },
  { id: 'throw', title: 'throw', day: 11, re: /\bthrow\b/ },
  { id: 'instanceof', title: 'instanceof (вид ошибки в catch)', day: 11, re: /\binstanceof\b/ },

  // --- функции ---
  { id: 'function', title: 'объявление function', day: 12, from: 4, re: /\bfunction\b/ },
  { id: 'return', title: 'return', day: 12, from: 4, re: /\breturn\b/ },
  { id: 'arrow', title: 'стрелочная функция =>', day: 13, from: 3, re: /=>/ },
  { id: 'default-param', title: 'параметр по умолчанию', day: 14, re: /function[\s\w$]*\([^()]*[A-Za-z_$][\w$]*\s*=\s*[^=][^()]*\)|\([^()]*[A-Za-z_$][\w$]*\s*=\s*[^=][^()]*\)\s*=>/ },
  { id: 'arguments', title: 'arguments (против ...rest)', day: 13, re: /\barguments\b/ },
  { id: 'rest-param', title: 'остаточный параметр ...', day: 14, re: /function[\s\w$]*\([\s\S]*?\.\.\.[\w$]+\s*\)|\([\s\S]*?\.\.\.[\w$]+\s*\)\s*=>/ },

  // --- строки и числа ---
  { id: 'template', title: 'шаблонная строка `${}`', day: 16, from: 3, re: /`/ },
  { id: 'str-methods', title: 'методы строк (slice, trim, padStart…)', day: 16, re: /\.(?:charAt|substring|startsWith|endsWith|toLowerCase|toUpperCase|trimStart|trimEnd|padStart|padEnd|repeat|charCodeAt|codePointAt)\s*\(/ },
  { id: 'trim', title: '.trim()', day: 16, re: /\.trim\s*\(/ },
  { id: 'number-fn', title: 'Number, parseInt, parseFloat', day: 17, from: 5, re: /\b(?:parseInt|parseFloat|Number)\s*\(/ },
  { id: 'number-static', title: 'Number.isNaN и соседи', day: 17, from: 5, re: /\bNumber\.\w+/ },
  { id: 'tofixed', title: '.toFixed()', day: 17, from: 3, re: /\.toFixed\s*\(/ },
  { id: 'date', title: 'Date', day: 17, re: /\bnew\s+Date\b|\bDate\.\w+/ },
  { id: 'to-iso', title: '.toISOString() (ошибка Invalid Date)', day: 17, re: /\.toISOString\s*\(/ },
  { id: 'math', title: 'Math.*', day: 18, from: 5, re: /\bMath\.\w+/ },

  // --- массивы ---
  { id: 'arr-basic', title: 'push / pop / shift / unshift', day: 19, from: 2, re: /\.(?:push|pop|shift|unshift)\s*\(/ },
  { id: 'arr-edit', title: 'splice / reverse / fill / copyWithin', day: 19, re: /\.(?:splice|reverse|fill|copyWithin|toReversed|toSpliced)\s*\(/ },
  { id: 'arr-join', title: '.join()', day: 19, from: 2, re: /\.join\s*\(/ },
  { id: 'arr-static', title: 'Array.isArray, Array.from, Array.of', day: 19, from: 3, re: /\bArray\.\w+/ },
  { id: 'arr-search', title: 'indexOf / includes / at / lastIndexOf', day: 19, from: 7, re: /\.(?:indexOf|includes|at|lastIndexOf)\s*\(/ },
  { id: 'arr-iter', title: 'forEach / map / filter / reduce / sort', day: 20, from: 3, re: /\.(?:forEach|map|filter|find|findIndex|reduce|some|every|sort|flat|flatMap|toSorted)\s*\(/ },

  // --- объекты ---
  { id: 'obj-literal', title: 'литерал объекта { ключ: значение }', day: 21, from: 4, re: /\{\s*[A-Za-z_$][\w$]*\s*:\s*[^:]/ },
  { id: 'obj-static', title: 'Object.keys и соседи', day: 21, from: 4, re: /\bObject\.\w+/ },
  { id: 'freeze-is', title: 'Object.freeze и Object.is', day: 5, from: 4, re: /\bObject\.(?:freeze|is)\b/ },
  { id: 'delete', title: 'оператор delete', day: 21, re: /\bdelete\s+/ },
  { id: 'in', title: 'оператор in', day: 21, re: /["'\w$]\s+in\s+[A-Za-z_$]/, not: /\bfor\s*\(/ },
  { id: 'spread-call', title: 'spread ... в вызове или литерале', day: 22, re: /[([,{]\s*\.\.\.[\w$[{]/, not: /function[\s\w$]*\([\s\S]*?\.\.\.|\([\s\S]*?\.\.\.[\s\S]*?\)\s*=>/ },
  { id: 'destructuring', title: 'деструктуризация', day: 22, re: /\b(?:const|let|var)\s*[[{][^;=]*\]?\}?\s*=/ },
  { id: 'optional-chain', title: 'необязательная цепочка ?.', day: 22, re: /\?\./ },
  { id: 'json', title: 'JSON.parse / JSON.stringify', day: 23, from: 7, re: /\bJSON\.\w+/ },

  // --- страница и события ---
  { id: 'dom-find', title: 'поиск элементов на странице', day: 24, re: /\b(?:document|getElementById|querySelector|querySelectorAll|getElementsBy\w+|closest|matches)\s*[.(]/ },
  { id: 'dom-edit', title: 'innerHTML, classList, style, dataset', day: 25, re: /\.(?:innerHTML|innerText|textContent|classList|dataset|setAttribute|getAttribute|removeAttribute|hasAttribute)\b/ },
  { id: 'dom-create', title: 'createElement, append, remove', day: 26, re: /\.(?:createElement|createTextNode|append|prepend|appendChild|insertBefore|removeChild|replaceChild|cloneNode|replaceWith)\s*\(/ },
  { id: 'events', title: 'addEventListener и объект события', day: 27, re: /\.(?:addEventListener|removeEventListener|dispatchEvent|preventDefault|stopPropagation)\s*\(/ },
  { id: 'forms', title: 'формы, alert / confirm / prompt', day: 28, re: /\b(?:alert|confirm|prompt)\s*\(/ },

  // --- асинхронность ---
  { id: 'timers', title: 'setTimeout / setInterval', day: 30, from: 3, re: /\b(?:setTimeout|setInterval|clearTimeout|clearInterval)\s*\(/ },
  { id: 'promise', title: 'Promise, then, catch, finally', day: 30, re: /\bnew\s+Promise\b|\bPromise\.\w+|\.then\s*\(/ },
  { id: 'fetch', title: 'fetch', day: 31, re: /\bfetch\s*\(/ },
  { id: 'async', title: 'async / await', day: 31, re: /\basync\b|\bawait\b/ },
  { id: 'storage', title: 'localStorage / sessionStorage', day: 31, re: /\b(?:local|session)Storage\b/ },

  // --- курс 2: в курсе 1 не разбирается, day2 — день курса 2 ---
  { id: 'this', title: 'this', day: 0, where: 'курс 2', day2: 2, re: /\bthis\b/ },
  { id: 'call-bind', title: 'call, apply, bind', day: 0, where: 'курс 2', day2: 2, re: /\.(?:call|apply|bind)\s*\(/ },
  { id: 'accessor', title: 'геттер и сеттер get / set', day: 0, where: 'курс 2', day2: 5, re: /\b(?:get|set)\s+#?[A-Za-z_$][\w$]*\s*\(/ },
  { id: 'descriptor', title: 'Object.defineProperty и дескрипторы', day: 0, where: 'курс 2', day2: 5, re: /\bObject\.(?:defineProperty|defineProperties|getOwnPropertyDescriptors?|getOwnPropertyNames)\b|\.propertyIsEnumerable\s*\(/ },
  { id: 'obj-protect', title: 'Object.seal, preventExtensions, isFrozen', day: 0, where: 'курс 2', day2: 6, re: /\bObject\.(?:isFrozen|seal|isSealed|preventExtensions|isExtensible)\b/ },
  { id: 'logical-assign', title: '&&=, ||=, ??=', day: 0, where: 'курс 2', day2: 6, re: /&&=|\|\|=|\?\?=/ },
  { id: 'prototype', title: 'prototype, Object.getPrototypeOf', day: 0, where: 'курс 2', day2: 7, re: /\.prototype\b|__proto__|\bObject\.(?:getPrototypeOf|setPrototypeOf)\b|\.isPrototypeOf\s*\(/ },
  // в курсе 1 стоит только примером ошибки (день 12), в курсе 2 разбирается в день 7
  { id: 'object-create', title: 'Object.create', day: 12, day2: 7, re: /\bObject\.create\b/ },
  { id: 'new-own', title: 'new со своим конструктором', day: 0, where: 'курс 2', day2: 7, re: /\bnew\s+(?!Date\b|Error\b|TypeError\b|RangeError\b|SyntaxError\b|ReferenceError\b|Promise\b|Array\b|Object\b|String\b|Number\b|Boolean\b|Function\b|Map\b|Set\b|Event\b|EventTarget\b|CustomEvent\b|MouseEvent\b|KeyboardEvent\b)[A-Z][\w$]*/ },
  { id: 'class', title: 'class', day: 0, where: 'курс 2', day2: 8, re: /\bclass\s+[A-Za-z_$]/ },
  { id: 'private-static', title: 'приватные #поля и static', day: 0, where: 'курс 2', day2: 9, re: /#[A-Za-z_$]|\bstatic\s+[A-Za-z_$#{*]/ },
  { id: 'extends', title: 'extends, super, new.target', day: 0, where: 'курс 2', day2: 10, re: /\bextends\b|\bsuper\b|\bnew\.target\b/ },
  { id: 'symbol', title: 'Symbol', day: 0, where: 'курс 2', day2: 11, re: /\bSymbol\s*[.(]/ },
  { id: 'generator', title: 'генератор function* / yield', day: 0, where: 'курс 2', day2: 12, re: /function\s*\*|\byield\b/ },
  { id: 'iterator', title: 'Iterator и его методы', day: 0, where: 'курс 2', day2: 13, re: /\bIterator\.\w+|\.(?:take|drop|toArray)\s*\(/ },
  { id: 'map', title: 'Map / WeakMap', day: 0, where: 'курс 2', day2: 14, re: /\bnew\s+(?:Map|WeakMap)\b|\bMap\.groupBy\b/ },
  { id: 'set', title: 'Set / WeakSet и операции над множествами', day: 0, where: 'курс 2', day2: 15, re: /\bnew\s+(?:Set|WeakSet)\b|\.(?:union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\s*\(/ },
  { id: 'regexp', title: 'регулярное выражение', day: 0, where: 'курс 2', day2: 17, re: /=\s*\/(?![/*])[^\n]*\/[gimsuy]*|\.(?:test|match|matchAll)\s*\(/ },
  { id: 'regexp-groups', title: 'matchAll, exec, lastIndex', day: 0, where: 'курс 2', day2: 18, re: /\.(?:matchAll|exec)\s*\(|\.lastIndex\b/ },
  { id: 'str-split', title: '.split / .replace / RegExp.escape', day: 0, where: 'курс 2', day2: 19, re: /(?<!classList)\.(?:split|replace|replaceAll)\s*\(|\bRegExp\.escape\b/ },
  { id: 'unicode-str', title: 'String.raw, normalize, isWellFormed', day: 0, where: 'курс 2', day2: 20, re: /\bString\.raw\b|\.(?:normalize|isWellFormed|toWellFormed)\s*\(/ },
  { id: 'bigint', title: 'BigInt() и его методы', day: 0, where: 'курс 2', day2: 21, re: /\bBigInt\b/ },
  { id: 'date-more', title: 'Date: разбор строк, UTC, сеттеры', day: 0, where: 'курс 2', day2: 21, re: /\bDate\.(?:UTC|parse)\b|\.(?:set(?:UTC)?(?:FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds)|setTime|getUTC\w+|getTimezoneOffset|getDay)\s*\(/ },
  { id: 'temporal', title: 'Temporal: PlainDate, PlainTime, Now', day: 0, where: 'курс 2', day2: 22, re: /\bTemporal\.\w+/ },
  { id: 'temporal-duration', title: 'Temporal.Duration, PlainYearMonth, PlainMonthDay', day: 0, where: 'курс 2', day2: 23, re: /\bTemporal\.(?:Duration|PlainYearMonth|PlainMonthDay)\b/ },
  { id: 'temporal-zoned', title: 'Temporal.Instant, ZonedDateTime', day: 0, where: 'курс 2', day2: 24, re: /\bTemporal\.(?:Instant|ZonedDateTime)\b|\.toTemporalInstant\s*\(|\bzonedDateTimeISO\b/ },
  { id: 'intl', title: 'Intl и localeCompare', day: 0, where: 'курс 2', day2: 25, re: /\bIntl\.\w+|\.localeCompare\s*\(/ },
  { id: 'error-more', title: 'cause и Error.isError', day: 0, where: 'курс 2', day2: 26, re: /\bError\.(?:isError|captureStackTrace)\b|\bcause\s*:/ },
  { id: 'promise-all', title: 'Promise.all и соседи', day: 0, where: 'курс 2', day2: 27, re: /\bPromise\.(?:all|allSettled|any|race|withResolvers|try)\b|\bAggregateError\b/ },
  { id: 'async-iter', title: 'for await и асинхронные генераторы', day: 0, where: 'курс 2', day2: 29, re: /\bfor\s+await\b|\basync\s+function\s*\*|\basync\s*\*|\bSymbol\.asyncIterator\b|\bArray\.fromAsync\b/ },
  { id: 'modules', title: 'import / export', day: 0, where: 'курс 2', day2: 30, re: /^\s*(?:import|export)\s/m },
  { id: 'dynamic-import', title: 'import() и import.meta', day: 0, where: 'курс 2', day2: 31, re: /\bimport\s*\(|\bimport\.meta\b/ },

  // --- курс 3 ---
  { id: 'proxy', title: 'Proxy / Reflect', day: 0, where: 'курс 3', re: /\b(?:Proxy|Reflect)\s*[.(]/ },
];

// the day of a course from which a construct may be used; Infinity — this course does not have it yet
const allowedFrom = (c, course) => {
  if (course === 1) return c.day === 0 ? Infinity : (c.from ?? c.day);
  if (course === 2 && c.day2) return c.day2;
  return c.day > 0 || c.day2 ? 1 : Infinity; // known from an earlier course, or a later course
};
// the day of a course that explains a construct; 0 — a later course explains it
const taughtOn = (c, course) => (course === 1 ? c.day : course === 2 ? c.day2 ?? 0 : 0);

if (argv.includes('--table')) {
  console.log('id                title                                                 день   с дня  курс 2');
  for (const c of CONSTRUCTS) {
    const day = c.day === 0 ? c.where : String(c.day);
    const course2 = c.day2 ? String(c.day2) : c.day > 0 ? 'с дня 1' : c.where;
    console.log(`${c.id.padEnd(17)} ${c.title.padEnd(52)} ${day.padEnd(6)} ${(c.day === 0 ? '' : String(c.from ?? c.day)).padEnd(6)} ${course2}`);
  }
  process.exit(0);
}

// Blank out strings and comments so that a construct is only found in real code.
// Same length in, same length out: the positions of what is left do not move.
const blank = (line) => {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      out += ch === quote ? ch : ' ';
      if (ch === quote && line[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && line[i + 1] === '/') return out + ' '.repeat(line.length - i);
    out += ch;
  }
  return out;
};

const EXCUSE = /(?:день|дня|дне|day)\s*(\d+)|(?:курс[а-я]*|course)\s*(\d+)/i;

const codeBlocks = (html) => {
  const blocks = [];
  const re = /(<!--[^>]*-->\s*)?<pre class="code js">([\s\S]*?)<\/pre>/g;
  let m;
  while ((m = re.exec(html))) {
    const before = m[1] || '';
    const text = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    blocks.push({ text, blockExcused: /ahead-ok/i.test(before), line: html.slice(0, m.index).split('\n').length });
  }
  return blocks;
};

const scan = (html, course, day) => {
  const found = [];
  for (const block of codeBlocks(html)) {
    block.text.split('\n').forEach((raw, i) => {
      const code = blank(raw);
      const comment = raw.slice(code.replace(/\s+$/, '').length);
      for (const c of CONSTRUCTS) {
        if (allowedFrom(c, course) <= day) continue;
        if (!c.re.test(code)) continue;
        if (c.not && c.not.test(code)) continue;
        if (block.blockExcused) continue;
        const taught = taughtOn(c, course);
        const excuse = comment.match(EXCUSE);
        if (excuse) {
          const named = Number(excuse[1] ?? excuse[2]);
          if (taught === 0 || named >= taught) continue;
        }
        found.push({ id: c.id, title: c.title, day: taught, where: c.where, line: block.line + i, code: raw.trim() });
      }
    });
  }
  return found;
};

const args = argv.filter((a) => !a.startsWith('-')).map(Number);
const results = [];
let problems = 0, checked = 0;

for (const [course, dir] of Object.entries(COURSE_DIR)) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  for (const folder of fs.readdirSync(base).sort()) {
    const day = Number(folder.replace('day-', ''));
    if (!day || (args.length && !args.includes(day))) continue;
    if (TOUR_DAYS[course]?.includes(day)) {
      results.push(`SKIP  day ${day} (${dir}): ${TOUR_REASON}`);
      continue;
    }
    checked++;
    const hits = [];
    // the translation in en/ is the same day and is held to the same rule
    for (const sub of ['', 'en/']) {
      const at = path.join(base, folder, sub);
      if (!fs.existsSync(at)) continue;
      for (const file of fs.readdirSync(at).filter((f) => f.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(at, file), 'utf8');
        for (const h of scan(html, Number(course), day)) hits.push({ ...h, file: `${dir}/${folder}/${sub}${file}` });
      }
    }
    problems += hits.length;
    results.push(`${hits.length ? 'FAIL' : 'PASS'}  day ${day} (${dir}): ${hits.length || 'no'} construct(s) from later days`);
    for (const h of hits) {
      const when = h.day === 0 ? h.where : `день ${h.day}`;
      results.push(`        ${h.file}:${h.line}  ${h.title} — ${when}`);
      results.push(`            ${h.code.length > 90 ? `${h.code.slice(0, 90)}…` : h.code}`);
    }
  }
}

console.log(results.join('\n') || 'no written days found');
console.log(`days checked: ${checked}, constructs from later days: ${problems}`);
process.exit(problems ? 1 : 0);
