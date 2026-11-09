// Every written day page must carry the licence footer: who the source is, under what licence it
// comes, under what licence this page goes out, and where the full terms live. Phase 5 of the spec
// lists this as a per-day check; with 144 days ahead it is a gate, not something checked by eye.
//
//   node tools/check-license.mjs            all written days
//   node tools/check-license.mjs 3          only day 3 (of every course)
// The pages are read as the site builds them (site/out, `pnpm build` in site/ first — stage 4 of the move to
// Next.js, 09.11.2026): the footer is the <div class="sources"> of the built page, as HTML again.
import fs from 'node:fs';
import path from 'node:path';
import site from './lib/site.cjs';

const ROOT = path.join(import.meta.dirname, '..');
const COURSE_DIR = ['essentials', 'intermediate', 'advanced', 'web-apis'];

// what the footer of every page has to contain; a translation in day-NN/en/ is one folder deeper
const NEEDS = (sub) => [
  ['ссылка на MDN', /href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/[^"]+"/],
  ['авторы MDN', /Mozilla Contributors/],
  ['лицензия источника CC BY-SA 2.5', /href="https:\/\/creativecommons\.org\/licenses\/by-sa\/2\.5\/"/],
  ['лицензия курса CC BY-SA 4.0', /href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/"/],
  ['ссылка на LICENSE', sub ? /href="\.\.\/\.\.\/\.\.\/LICENSE"/ : /href="\.\.\/\.\.\/LICENSE"/],
];
const LANG_DIRS = ['', 'en/'];

const only = process.argv.slice(2).map(Number);
const lines = [];
let bad = 0, checked = 0;

for (const dir of COURSE_DIR) {
  const courseDir = path.join(ROOT, dir);
  if (!fs.existsSync(courseDir)) continue;
  const days = fs.readdirSync(courseDir).filter((d) => /^day-\d+$/.test(d)).sort();
  for (const day of days) {
    if (only.length && !only.includes(Number(day.slice(4)))) continue;
    for (const sub of LANG_DIRS) {
      const dayDir = path.join(courseDir, day, sub);
      if (!fs.existsSync(dayDir)) continue;
      for (const rel of site.dayPages(`${dir}/${day}${sub ? `/${sub.slice(0, -1)}` : ''}`)) {
        checked++;
        const p = site.page(rel);
        const blocks = p.all('div.sources').map((n) => p.outer(n));
        if (blocks.length !== 1) {
          bad++;
          lines.push(`FAIL  ${rel}: блоков .sources ${blocks.length}, нужен ровно 1`);
          continue;
        }
        const missing = NEEDS(sub).filter(([, re]) => !re.test(blocks[0])).map(([name]) => name);
        if (missing.length) {
          bad++;
          lines.push(`FAIL  ${rel}: в подписи нет — ${missing.join('; ')}`);
        } else {
          lines.push(`PASS  ${rel}`);
        }
      }
    }
  }
}

// the file the footers point at has to exist and name both licences
const licensePath = path.join(ROOT, 'LICENSE');
if (!fs.existsSync(licensePath)) {
  bad++;
  lines.push('FAIL  LICENSE: файла нет, а подписи на него ссылаются');
} else {
  const text = fs.readFileSync(licensePath, 'utf8');
  const missing = [
    ['MIT', /MIT License/],
    ['CC BY-SA 4.0', /Attribution-ShareAlike 4\.0 International/],
  ].filter(([, re]) => !re.test(text)).map(([name]) => name);
  if (missing.length) {
    bad++;
    lines.push(`FAIL  LICENSE: нет полного текста — ${missing.join('; ')}`);
  } else {
    lines.push('PASS  LICENSE: оба полных текста на месте');
  }
}

console.log(lines.join('\n') || 'no written days found');
console.log(`pages checked: ${checked}, without a proper licence footer: ${bad}`);
process.exit(bad ? 1 : 0);
