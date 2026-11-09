// Every page of the coverage map that a day is responsible for must appear in that day's own pages
// as a link to MDN. This is the gate of phase 5: the lesson doubles as a reference.
//
//   node tools/check-lesson-links.mjs            all days that have a folder
//   node tools/check-lesson-links.mjs 1 19       only these days of course 1
// The pages are read as the site builds them (site/out, `pnpm build` in site/ first — stage 4 of the move to
// Next.js, 09.11.2026): the <body> of each, without Next.js's own scripts (they repeat the page's text).
import fs from 'node:fs';
import path from 'node:path';
import { readCsv } from './lib/csv.mjs';
import site from './lib/site.cjs';

const ROOT = path.join(import.meta.dirname, '..');
const COV = path.join(ROOT, 'docs', 'coverage');
const COURSE_DIR = { 1: 'essentials', 2: 'intermediate', 3: 'advanced', 4: 'web-apis' };
const MDN = 'https://developer.mozilla.org/en-US/docs/';

const want = new Map(); // "course/day" -> [{path, depth}]
for (const file of ['mdn-javascript.csv', 'mdn-webapi.csv']) {
  for (const r of readCsv(path.join(COV, file)).records) {
    if (!r.course || !r.day) continue;
    const key = `${r.course}/${r.day}`;
    if (!want.has(key)) want.set(key, []);
    want.get(key).push({ path: r.path, depth: r.depth });
  }
}

const args = process.argv.slice(2).map(Number);
const results = [];
let missingTotal = 0, checked = 0;

for (const [key, rows] of [...want].sort((a, b) => Number(a[0].split('/')[1]) - Number(b[0].split('/')[1]))) {
  const [course, day] = key.split('/').map(Number);
  if (args.length && !args.includes(day)) continue;
  const dayDir = path.join(ROOT, COURSE_DIR[course], `day-${String(day).padStart(2, '0')}`);
  if (!fs.existsSync(dayDir)) continue; // the day has not been written yet
  // a translation in en/ doubles as the same reference, so it links the same pages
  for (const sub of ['', 'en']) {
    const dir = path.join(dayDir, sub);
    if (!fs.existsSync(dir)) continue;
    checked++;
    const html = site.dayPages(path.relative(ROOT, dir).replace(/\\/g, '/')).map((rel) => { const p = site.page(rel); return p.inner(p.body); }).join('\n');
    const linked = new Set([...html.matchAll(/https:\/\/developer\.mozilla\.org\/en-US\/docs\/([^"'\s)]+)/g)].map((m) => decodeURI(m[1]).replace(/#.*$/, '').toLowerCase()));
    const missing = rows.filter((r) => !linked.has(r.path.toLowerCase()));
    const planned = new Set(rows.map((r) => r.path.toLowerCase()));
    const extra = [...linked].filter((l) => !planned.has(l));
    missingTotal += missing.length;
    results.push(`${missing.length ? 'FAIL' : 'PASS'}  day ${day} (${COURSE_DIR[course]}${sub ? `/${sub}` : ''}): ${rows.length} pages planned, ${rows.length - missing.length} linked` +
      (extra.length ? `, ${extra.length} extra link(s)` : ''));
    for (const m of missing) results.push(`        missing (${m.depth}): ${MDN}${m.path}`);
    for (const e of extra) results.push(`        extra: ${MDN}${e}`);
  }
}

console.log(results.join('\n') || 'no written days found');
console.log(`days checked: ${checked}, pages not linked: ${missingTotal}`);
process.exit(missingTotal ? 1 : 0);
