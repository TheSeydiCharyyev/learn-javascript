// Translations of a day live in day-NN/en/. For every written day:
//   - a day with en/ has all three pages there, each marked lang="en" and free of Cyrillic letters
//     (except inside an element marked lang="ru", like the look-alike file name <span lang="ru">арр</span>.js);
//   - every Russian page links to its English twin, and the English page links back;
//   - a day without en/ has no link to an English version.
//
//   node tools/check-langs.mjs            all written days
//   node tools/check-langs.mjs 1          only day 1 (of every course)
// The pages are read as the site builds them (site/out, `pnpm build` in site/ first — stage 4 of the move to
// Next.js, 09.11.2026): the RU/EN button links to the other page's route ("en/lecture", "../lecture"); the language is
// the page's <html lang>; Cyrillic is looked for in the text and the attributes of <body> and in the title, outside
// the elements marked lang="ru" (the place is told by its text — a built page has no lines to count).
import fs from 'node:fs';
import path from 'node:path';
import site from './lib/site.cjs';

const ROOT = path.join(import.meta.dirname, '..');
const COURSE_DIR = ['essentials', 'intermediate', 'advanced', 'web-apis'];
const PAGES = ['lecture', 'student', 'tasks'];
const CYRILLIC = /[А-Яа-яЁё]/;

const langLink = (p, href) => p.all('a.lang-btn').some((a) => p.attr(a, 'href') === href);

// texts and attribute values with Cyrillic, outside the elements marked lang="ru"
function cyrillic(p) {
  const found = [];
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#text') { if (CYRILLIC.test(c.value)) found.push(c.value.trim()); continue; }
      // CSS is not the page's text: a built page carries the course CSS in <style> (lecture.css, book.css — Russian
      // labels and comments); a Russian label that shows on an English page is check-pages's (CSS ::before)
      if (!c.tagName || c.tagName === 'style' || c.tagName === 'script' || p.attr(c, 'lang') === 'ru') continue;
      for (const a of c.attrs) if (CYRILLIC.test(a.value)) found.push(`<${c.tagName} ${a.name}="${a.value}">`);
      walk(c.content ?? c);
    }
  };
  walk(p.body);
  if (p.title && CYRILLIC.test(p.title)) found.push(`<title>${p.title}</title>`);
  return found;
}

const only = process.argv.slice(2).map(Number);
const lines = [];
let bad = 0, checked = 0;

for (const dir of COURSE_DIR) {
  const courseDir = path.join(ROOT, dir);
  if (!fs.existsSync(courseDir)) continue;
  for (const day of fs.readdirSync(courseDir).filter((d) => /^day-\d+$/.test(d)).sort()) {
    if (only.length && !only.includes(Number(day.slice(4)))) continue;
    checked++;
    const problems = [];
    const hasEn = fs.existsSync(path.join(courseDir, day, 'en'));
    for (const page of PAGES) {
      const ruRel = `${dir}/${day}/${page}.html`, enRel = `${dir}/${day}/en/${page}.html`;
      if (!site.written(ruRel)) continue;
      const ru = site.page(ruRel);
      if (!hasEn) {
        if (ru.all('a[href]').some((a) => ru.attr(a, 'href').startsWith('en/'))) problems.push(`${page}.html links to en/, but the day has no translation`);
        continue;
      }
      if (!site.written(enRel)) { problems.push(`en/${page}.html is missing`); continue; }
      const en = site.page(enRel);
      if (!langLink(ru, `en/${page}`)) problems.push(`${page}.html has no EN link to en/${page}`);
      if (!langLink(en, `../${page}`)) problems.push(`en/${page}.html has no RU link to ../${page}`);
      if (en.lang !== 'en') problems.push(`en/${page}.html is not marked <html lang="en">`);
      for (const t of cyrillic(en)) problems.push(`en/${page}.html Cyrillic: ${t.slice(0, 80)}`);
    }
    if (problems.length) bad++;
    lines.push(`${problems.length ? 'FAIL' : 'PASS'}  ${dir}/${day}: ${hasEn ? 'ru + en' : 'ru only'}`);
    for (const p of problems) lines.push(`        ${p}`);
  }
}

console.log(lines.join('\n') || 'no written days found');
console.log(`days checked: ${checked}, with language problems: ${bad}`);
process.exit(bad ? 1 : 0);
