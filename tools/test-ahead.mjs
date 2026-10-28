// Behaviour test for check-ahead: node tools/test-ahead.mjs
// Builds a tiny course tree in the system temp folder and runs the real tool against it
// with --root, so the lessons of the repository are never touched.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const TOOLS = import.meta.dirname;
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ahead-'));
const page = (body) => `<html><body><div class="container">${body}</div></body></html>`;
const js = (code) => `<pre class="code js">${code}</pre>`;

const write = (course, day, body) => {
  const dir = path.join(root, course, `day-${String(day).padStart(2, '0')}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'lecture.html'), page(body));
};
const run = (day) => {
  const r = spawnSync('node', [path.join(TOOLS, 'check-ahead.mjs'), '--root', root, String(day)], { encoding: 'utf8' });
  return { out: r.stdout, code: r.status };
};
// the tree holds exactly one day of one course
const only = (day, course = 'essentials') => {
  for (const c of ['essentials', 'intermediate', 'advanced']) fs.rmSync(path.join(root, c), { recursive: true, force: true });
  return (body) => { write(course, day, body); return run(day); };
};
const course2 = (day) => only(day, 'intermediate');
const course3 = (day) => only(day, 'advanced');

try {
  // 1. a construct from a later day is found, and the day fails
  let r = only(9)(js('const city = user?.city;'));
  check('?. на дне 9 поймана', r.out.includes('необязательная цепочка') && r.code === 1, r.out.split('\n')[0]);

  // 2. the same construct on its own day is fine
  r = only(22)(js('const city = user?.city;'));
  check('?. на дне 22 разрешена', !r.out.includes('необязательная цепочка') && r.code === 0);

  // 3. `from` lets the course use a construct before the day that explains it
  r = only(5)(js('function add(a, b) { return a + b; }'));
  check('function на дне 5 разрешён полем from', r.code === 0, r.out.split('\n')[0]);

  // 4. a construct of a later course is always a problem
  r = only(19)(js('class User { }'));
  check('class пойман на любом дне', r.out.includes('курс 2') && r.code === 1);

  // 5. strings and comments are not code
  r = only(9)(js('const s = "user?.city";\n// сравните с user?.city'));
  check('в строке и в комментарии не ищем', r.code === 0, r.out.split('\n')[0]);

  // 6. a marker in the line comment excuses the line
  r = only(9)(js('const city = user?.city;   // день 22'));
  check('пометка «// день 22» снимает вопрос', r.code === 0, r.out.split('\n')[0]);

  // 7. a marker naming an earlier day does not excuse it
  r = only(9)(js('const city = user?.city;   // день 15'));
  check('пометка на более ранний день не снимает', r.code === 1);

  // 8. the HTML comment before the block excuses the whole block
  r = only(9)(`<!-- ahead-ok: день 22 -->\n${js('const city = user?.city;\nconst zip = user?.zip;')}`);
  check('пометка ahead-ok перед блоком снимает весь блок', r.code === 0, r.out.split('\n')[0]);

  // 9. HTML samples are not JavaScript
  r = only(9)('<pre class="code html">&lt;!-- комментарий --&gt;\n&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
  check('блок html не проверяется', r.code === 0, r.out.split('\n')[0]);

  // 10. days 1-3 tour the language and never fail
  r = only(3)(js('class User { }\nfetch("/api");'));
  check('дни 1–3 помечены SKIP', r.out.includes('SKIP') && r.code === 0);

  // 11. the two shapes that used to be confused: rest parameter is not spread
  r = only(14)(js('function makeReport(name = required("name"), ...marks) { return marks.length; }'));
  check('остаточный параметр не принят за spread', r.code === 0, r.out.split('\n')[0]);
  r = only(14)(js('makeReport("Аман", ...marksArray);'));
  check('spread в вызове пойман на дне 14', r.out.includes('spread') && r.code === 1);

  // 12. a for loop is not a default parameter
  r = only(10)(js('for (let i = 0; i &lt; 3; i++) { }'));
  check('цикл for не принят за параметр по умолчанию', r.code === 0, r.out.split('\n')[0]);

  // 13. classList.replace is the class-list method of day 25, not the string method of course 2
  r = only(25)(js('el.classList.replace("absent", "late");'));
  check('classList.replace не принят за строковый replace', r.code === 0, r.out.split('\n')[0]);
  r = only(25)(js('const s = text.replace("a", "b");'));
  check('строковый replace на дне 25 пойман', r.out.includes('курс 2') && r.code === 1);

  // 14. built-in event constructors of day 27 are not "own constructors" of course 2
  r = only(27)(js('const bus = new EventTarget();\nbus.dispatchEvent(new Event("ping"));'));
  check('new Event и new EventTarget не приняты за свой конструктор', r.code === 0, r.out.split('\n')[0]);
  r = only(27)(js('const user = new User("Аман");'));
  check('свой конструктор по-прежнему пойман', r.out.includes('курс 2') && r.code === 1);

  // 15. every row of the table is well formed and unique
  const src = fs.readFileSync(path.join(TOOLS, 'check-ahead.mjs'), 'utf8');
  const rows = [...src.matchAll(/\{ id: '([\w-]+)', title: '([^']+)', day: (\d+),(?: from: (\d+),)?/g)];
  const ids = rows.map((m) => m[1]);
  const badFrom = rows.filter((m) => m[4] && Number(m[4]) > Number(m[3]));
  check(`таблица: ${rows.length} строк, все id разные`, new Set(ids).size === ids.length);
  check('таблица: from не бывает позже дня разбора', badFrom.length === 0, badFrom.map((m) => m[1]).join(', '));

  // 16. --table prints the whole table
  const table = spawnSync('node', [path.join(TOOLS, 'check-ahead.mjs'), '--table'], { encoding: 'utf8' });
  check('--table печатает все строки', table.stdout.split('\n').length >= rows.length && table.status === 0);

  // 17. course 2: what course 1 taught is known from day 1, the day numbers are those of course 2
  r = course2(3)(js('const n = Math.round(4.6);\nconst city = user?.city;\nif (e instanceof TypeError) { }'));
  check('курс 2: конструкции курса 1 разрешены с дня 1', r.code === 0, r.out.split('\n')[0]);
  r = course2(5)(js('class User { }'));
  check('курс 2: class на дне 5 пойман с днём 8', r.out.includes('день 8') && r.code === 1, r.out.split('\n')[1]);
  r = course2(8)(js('class User { }'));
  check('курс 2: class на дне 8 разрешён', r.code === 0, r.out.split('\n')[0]);
  r = course2(10)(js('const key = Symbol("id");'));
  check('курс 2: Symbol на дне 10 пойман', r.out.includes('день 11') && r.code === 1);
  r = course2(11)(js('const key = Symbol("id");'));
  check('курс 2: Symbol на дне 11 разрешён', r.code === 0, r.out.split('\n')[0]);

  // 18. course 2: day2 wins over a course 1 day — Object.create was only an error sample in course 1
  r = course2(6)(js('const dict = Object.create(null);'));
  check('курс 2: Object.create на дне 6 пойман', r.out.includes('день 7') && r.code === 1);
  r = only(12)(js('Object.create();'));
  check('курс 1: Object.create на дне 12 разрешён', r.code === 0, r.out.split('\n')[0]);

  // 19. course 2: course 3 is never allowed; the excusing comment names a day of course 2
  r = course2(31)(js('const p = new Proxy({}, {});'));
  check('курс 2: Proxy пойман как курс 3', r.out.includes('курс 3') && r.code === 1);
  r = course2(5)(js('class User { }   // день 8'));
  check('курс 2: пометка «// день 8» снимает вопрос', r.code === 0, r.out.split('\n')[0]);
  r = course2(5)(js('class User { }   // день 6'));
  check('курс 2: пометка на день раньше разбора не снимает', r.code === 1);

  // 20. course 2 has no tour days: day 1 is checked like any other
  r = course2(1)(js('class User { }'));
  check('курс 2: день 1 не SKIP', !r.out.includes('SKIP') && r.code === 1);

  // 21. every row of course 2 says on which day of course 2 it is taught
  const noDay2 = src.split('\n').filter((l) => /^\s*\{ id: .*where: 'курс 2'/.test(l) && !/day2: \d+/.test(l));
  check('таблица: у каждой строки курса 2 есть day2', noDay2.length === 0, noDay2.join(' | '));

  // 22. course 3: what courses 1 and 2 taught is known from day 1; course 3 has no tour days either
  r = course3(1)(js('class User { }\nconst today = Temporal.Now.plainDateISO();\nconst city = user?.city;'));
  check('курс 3: конструкции курсов 1 и 2 разрешены с дня 1', r.code === 0 && !r.out.includes('SKIP'), r.out.split('\n')[0]);

  // 23. course 3: Proxy and Reflect have their own days
  r = course3(15)(js('const p = new Proxy({}, {});'));
  check('курс 3: Proxy на дне 15 пойман с днём 16', r.out.includes('день 16') && r.code === 1, r.out.split('\n')[1]);
  r = course3(16)(js('const p = new Proxy({}, {});'));
  check('курс 3: Proxy на дне 16 разрешён', r.code === 0, r.out.split('\n')[0]);
  r = course3(16)(js('Reflect.get(target, key, receiver);'));
  check('курс 3: Reflect на дне 16 пойман с днём 17', r.out.includes('день 17') && r.code === 1, r.out.split('\n')[1]);

  // 24. course 3: the excusing comment names a day of course 3
  r = course3(10)(js('const p = new Proxy({}, {});   // день 16'));
  check('курс 3: пометка «// день 16» снимает вопрос', r.code === 0, r.out.split('\n')[0]);
  r = course3(10)(js('const p = new Proxy({}, {});   // день 12'));
  check('курс 3: пометка на день раньше разбора не снимает', r.code === 1);

  // 25. course 3: a Web API of course 4 is a tool here — never allowed without a comment that names course 4
  r = course3(22)(js('const worker = new Worker("worker.js");'));
  check('курс 3: Worker пойман как курс 4', r.out.includes('курс 4') && r.code === 1, r.out.split('\n')[1]);
  r = course3(22)(js('const worker = new Worker("worker.js");   // курс 4'));
  check('курс 3: пометка «// курс 4» снимает вопрос', r.code === 0, r.out.split('\n')[0]);

  // 26. course 2: course 3 is still never allowed, also the new rows
  r = course2(31)(js('const buffer = new ArrayBuffer(8);'));
  check('курс 2: ArrayBuffer пойман как курс 3', r.out.includes('курс 3') && r.code === 1);

  // 27. methods named like old features are not the old features
  r = course3(10)(js('const copy = marks.with(1, 5);\nconst first = date.with({ day: 1 });\nconst safe = RegExp.escape("c++");'));
  check('.with() и RegExp.escape() не приняты за устаревшее', r.code === 0, r.out.split('\n')[0]);
  r = course3(10)(js('with (Math) { console.log(PI); }'));
  check('курс 3: инструкция with на дне 10 поймана с днём 31', r.out.includes('день 31') && r.code === 1, r.out.split('\n')[1]);

  // 28. every row of course 3 says on which day of course 3 it is taught
  const noDay3 = src.split('\n').filter((l) => /^\s*\{ id: .*where: 'курс 3'/.test(l) && !/day3: \d+/.test(l));
  check('таблица: у каждой строки курса 3 есть day3', noDay3.length === 0, noDay3.join(' | '));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
