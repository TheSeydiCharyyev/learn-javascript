// Behaviour test for the coverage tools: node tools/test-coverage.mjs
// Works on the real docs/coverage (no network: the export uses tools/.cache) and restores it at the end.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { readCsv, writeCsv, parseCsv } from './lib/csv.mjs';

const TOOLS = import.meta.dirname;
const COV = path.join(TOOLS, '..', 'docs', 'coverage');
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const run = (script, args = []) => spawnSync('node', [path.join(TOOLS, script), ...args], { encoding: 'utf8' });
const snapshot = () => Object.fromEntries(fs.readdirSync(COV).map((f) => [f, fs.readFileSync(path.join(COV, f))]));
const original = snapshot();
const load = (f) => readCsv(path.join(COV, f));
const save = (f, csv) => writeCsv(path.join(COV, f), csv.header, csv.records);
const free = (records) => records.filter((r) => !r.course && !r.day && !r.depth); // rows nobody has taken yet
const covered = (out, file) => Number(new RegExp(`${file}\\.csv\\s+\\d+ rows\\s+covered\\s+(\\d+)`).exec(out)?.[1]);

try {
  // 1. CSV round trip: parse -> write -> identical bytes; every row has the header's column count
  for (const f of ['mdn-javascript.csv', 'mdn-webapi.csv', 'ecma262.csv', 'ecma402.csv']) {
    const raw = fs.readFileSync(path.join(COV, f), 'utf8');
    const widths = new Set(parseCsv(raw).map((r) => r.length));
    const { header, records } = load(f);
    const tmp = path.join(os.tmpdir(), 'rt-' + f);
    writeCsv(tmp, header, records);
    check(`${f}: round trip identical, ${records.length} rows, all rows ${[...widths]} columns`, fs.readFileSync(tmp, 'utf8') === raw && widths.size === 1);
  }
  // sections 2 and 3 need rows that nobody has taken; since the course 3 plan every language page and every spec
  // clause of level 1-3 has a course, so the working copy forgets courses 3 and 4 (section 4 brings the real maps back)
  for (const f of ['mdn-javascript.csv', 'mdn-webapi.csv', 'ecma262.csv', 'ecma402.csv']) {
    const csv = load(f);
    for (const x of csv.records) if (Number(x.course) >= 3) Object.assign(x, { course: '', day: '', lesson: '', depth: '' });
    save(f, csv);
  }
  const js = load('mdn-javascript.csv');
  const tricky = js.records.find((r) => r.path === 'Web/JavaScript/Reference/Errors/Not_a_function');
  check('title with quotes survives', tricky?.title === 'TypeError: "x" is not a function', JSON.stringify(tricky?.title));
  check('titles with commas present and parsed', js.records.some((r) => r.title.includes(',')));

  const before = run('coverage-check.mjs');
  const jsBefore = covered(before.stdout, 'mdn-javascript'), specBefore = covered(before.stdout, 'ecma262'), apiBefore = covered(before.stdout, 'mdn-webapi');

  // 2. export keeps assignments and reports new and gone pages
  const page = free(js.records)[0];
  Object.assign(page, { course: '2', day: '13', lesson: '1', depth: 'подробно', note: 'тест, с запятой' });
  const dropped = js.records.findIndex((r) => r !== page && !r.course);
  const droppedPath = js.records[dropped].path;
  js.records.splice(dropped, 1);
  js.records.push({ path: 'Web/JavaScript/Reference/Fake_page', title: 'Fake', page_type: '', status: '', browser_compat: '', course: '2', day: '5', lesson: '2', depth: 'кратко', note: '' });
  save('mdn-javascript.csv', js);
  const spec = load('ecma262.csv');
  const clause = spec.records.find((r) => r.number === 'B');
  Object.assign(clause, { course: '3', day: '10', lesson: '1', depth: 'кратко' });
  save('ecma262.csv', spec);

  const exp = run('coverage-export.mjs');
  check('export exits 0', exp.status === 0, exp.stderr.trim().split('\n').at(-1));
  check('export reports 1 new and 1 gone page', /mdn-javascript\.csv: \d+ rows, new 1, gone 1/.test(exp.stdout), exp.stdout.split('\n').find((l) => l.startsWith('mdn-javascript')));
  check('gone page is printed with its assignment', /gone: Web\/JavaScript\/Reference\/Fake_page\s+\(was assigned: 2 \/ 5 \/ 2 \/ кратко\)/.test(exp.stdout));
  const after = load('mdn-javascript.csv').records;
  const kept = after.find((r) => r.path === page.path);
  check('assignment kept after export', kept.course === '2' && kept.day === '13' && kept.depth === 'подробно' && kept.note === 'тест, с запятой', JSON.stringify(kept));
  check('page that came back is empty again', after.some((r) => r.path === droppedPath && !r.course));
  check('spec assignment kept after export', load('ecma262.csv').records.find((r) => r.number === 'B').course === '3');

  // 3. check: counting, spec levels, Web API scope, wrong values
  let r = run('coverage-check.mjs');
  check('check exits 0 with valid assignments', r.status === 0, `exit ${r.status}`);
  check('one more page counts as covered', covered(r.stdout, 'mdn-javascript') === jsBefore + 1 - 1 + 1, `${jsBefore} -> ${covered(r.stdout, 'mdn-javascript')}`);
  const deepB = load('ecma262.csv').records.filter((x) => x.number.startsWith('B.') && Number(x.level) >= 4).length;
  check('an assigned level 1 clause covers only its level 4+ clauses', covered(r.stdout, 'ecma262') === specBefore + 1 + deepB,
    `${specBefore} -> ${covered(r.stdout, 'ecma262')}, deep clauses of B ${deepB}`);
  const s3 = load('ecma262.csv');
  // a level 3 clause with deeper clauses, where neither it nor an ancestor is assigned yet
  const assigned = (n) => s3.records.some((y) => y.course && (n === y.number || n.startsWith(`${y.number}.`)));
  const l3 = s3.records.find((x) => x.level === '3' && !assigned(x.number) && s3.records.some((y) => y.number.startsWith(`${x.number}.`)));
  Object.assign(l3, { course: '3', day: '3', lesson: '1', depth: 'кратко' });
  save('ecma262.csv', s3);
  const kids = s3.records.filter((x) => x.number.startsWith(`${l3.number}.`)).length;
  r = run('coverage-check.mjs');
  check('an assigned level 3 clause covers its deeper clauses', covered(r.stdout, 'ecma262') === specBefore + 1 + deepB + 1 + kids, `${l3.number}, kids ${kids}`);

  const api = load('mdn-webapi.csv');
  const flagged = api.records.find((x) => x.status && !x.course);
  const stable = free(api.records).find((x) => !x.status);
  Object.assign(flagged, { course: '4', day: '1', lesson: '1', depth: 'кратко' });
  Object.assign(stable, { course: '4', day: '2', lesson: '1', depth: 'подробно' });
  save('mdn-webapi.csv', api);
  r = run('coverage-check.mjs');
  check('a stable page counts, a flagged page does not', covered(r.stdout, 'mdn-webapi') === apiBefore + 1, `${apiBefore} -> ${covered(r.stdout, 'mdn-webapi')}, flagged ${flagged.path}`);
  r = run('coverage-check.mjs', ['--strict']);
  check('--strict exits 1 while not everything is covered', r.status === 1);

  const w = load('mdn-javascript.csv');
  let next = 0;
  const pick = () => free(w.records)[next++]; // a different free row each time
  const wrong = [
    [pick(), { course: '4', day: '13', lesson: '1', depth: 'подробно' }, /course "4" \(1-3\)/, 'course 4 for a language page'],
    [pick(), { course: '1', day: '40', lesson: '1', depth: 'подробно' }, /day "40" \(1-36\)/, 'day out of range'],
    [pick(), { course: '1', day: '12', lesson: '1', depth: 'detailed' }, /depth "detailed"/, 'unknown depth'],
    [pick(), { course: '1' }, /day "" \(1-36\), lesson "" \(1-3\), depth ""/, 'partially filled row'],
  ];
  for (const [row, values] of wrong) Object.assign(row, values);
  w.records.push({ ...w.records.find((x) => x.path === page.path) });
  save('mdn-javascript.csv', w);
  r = run('coverage-check.mjs');
  check('check exits 1 on wrong values', r.status === 1, `exit ${r.status}`);
  for (const [, , re, what] of wrong) check(`reports ${what}`, re.test(r.stdout));
  check('reports duplicate key', new RegExp(`duplicate path: ${page.path}`).test(r.stdout));

  // 4. the day plans of courses 1-3 match what is written in the maps
  for (const f of Object.keys(original)) fs.writeFileSync(path.join(COV, f), original[f]);
  for (const [no, name] of [[1, 'Essentials'], [2, 'Intermediate'], [3, 'Advanced']]) {
    const plan = run('plan-days.mjs', [String(no)]);
    check(`plan-days: every row of course ${no} has a day`, plan.status === 0 && /rows without a day: 0/.test(plan.stdout));
    const planned = Number(new RegExp(`course ${no} \\(${name}\\): (\\d+) rows`).exec(plan.stdout)?.[1]);
    const inMaps = Object.keys(original).filter((f) => f.endsWith('.csv'))
      .reduce((a, f) => a + load(f).records.filter((x) => x.course === String(no)).length, 0);
    check(`the map holds exactly the planned rows of course ${no}`, planned === inMaps, `plan ${planned}, maps ${inMaps}`);
  }
  const mods = run('plan-modules.mjs');
  check('plan-modules: every row has a module', mods.status === 0 && /rows without a module: 0/.test(mods.stdout));
} finally {
  for (const f of fs.readdirSync(COV)) if (!(f in original)) fs.unlinkSync(path.join(COV, f));
  for (const [f, buf] of Object.entries(original)) fs.writeFileSync(path.join(COV, f), buf);
  check('docs/coverage restored byte for byte', Object.entries(snapshot()).every(([f, b]) => original[f] && Buffer.compare(original[f], b) === 0));
}
console.log(results.join('\n'));
process.exit(results.some((l) => l.startsWith('FAIL')) ? 1 : 0);
