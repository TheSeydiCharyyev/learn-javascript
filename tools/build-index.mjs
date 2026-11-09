// Rebuilds the course parts of index.html from the plans: course cards in the hero, sidebar links and module cards,
// course by course, once in Russian and once in English (js/lang.js shows the English lists in EN mode, the Russian
// ones otherwise). A day becomes a link when its folder exists; the rest are shown as "скоро" / "coming soon".
// In the English list a day links to its en/ pages when they exist, otherwise to the Russian ones, marked RU.
//   node tools/build-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { MODULES } from './plan-modules.mjs';
import { PLAN } from './plan-days.mjs';
import { DAY_TITLES_EN, MODULE_NAMES_EN } from './plan-en.mjs';
import { COURSES, LOOK, TEXT } from './home-data.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

const moduleName = {
  ru: Object.fromEntries(MODULES.map(([id, , , name]) => [id, name])),
  en: MODULE_NAMES_EN,
};
const folderOf = (c, day) => `${c.dir}/day-${String(day).padStart(2, '0')}`;
// a page is written in HTML or MDX; a day is ready when its three pages are (09.11.2026 — before, when its folder
// was: day 21 of Advanced, paused with only its lecture, would have shown up; the site's home page, site/lib/home-lists.ts,
// has the same rule)
const written = (rel) => ['.html', '.mdx'].some((ext) => fs.existsSync(path.join(ROOT, rel + ext)));
const ready = (c, day) => ['lecture', 'student', 'tasks'].every((p) => written(`${folderOf(c, day)}/${p}`));
const hasEn = (c, day) => written(`${folderOf(c, day)}/en/lecture`);

// the English list falls back to the Russian pages of a day that is not translated yet
const pagesOf = (c, day, lang) => (lang === 'en' && hasEn(c, day) ? `${folderOf(c, day)}/en` : folderOf(c, day));
const titleOf = (c, day, title, lang) => (lang === 'ru' ? title
  : DAY_TITLES_EN[c.no][day] + (hasEn(c, day) ? '' : ' <span class="lang-note">RU</span>'));
// the anchor of a course section; the Russian and the English lists are both in the page, so each has its own id
const anchorOf = (c, lang) => `course-${c.no}-${lang}`;

// group the days of a course into modules, keeping project days together in one group at their place
const groupsOf = (c) => {
  const groups = [];
  for (const [day, module, title] of PLAN[c.no].days) {
    const id = module ?? 'PROJECTS';
    const last = groups.at(-1);
    if (last && last.id === id) last.days.push({ day, title });
    else groups.push({ id, days: [{ day, title }] });
  }
  return groups;
};
const groupName = (g, lang) => (g.id === 'PROJECTS' ? TEXT[lang].projects : moduleName[lang][g.id]);

const cards = (lang) => {
  const t = TEXT[lang];
  const items = COURSES.map((c) => {
    const days = PLAN[c.no].days;
    const done = days.filter(([d]) => ready(c, d)).length;
    return `                <a class="course-card" href="#${anchorOf(c, lang)}">` +
      `<div class="course-card-label">${t.courseNo} ${c.no}</div><div class="course-card-name">${c.name}</div>` +
      `<div class="course-card-about">${c.about[lang]}</div><div class="course-card-status">${t.status(done, days.length)}</div></a>`;
  }).join('\n');
  return `            <div class="course-cards">\n${items}\n            </div>`;
};

const sidebar = (lang) => COURSES.map((c) => {
  const head = `        <div class="sidebar-course">${TEXT[lang].courseNo} ${c.no} &middot; ${c.name}</div>`;
  const groups = groupsOf(c).map((g) => {
    const links = g.days.map(({ day, title }) => (ready(c, day)
      ? `            <a href="${pagesOf(c, day, lang)}/lecture.html" class="sidebar-link"><span class="sidebar-num">${day}</span> ${titleOf(c, day, title, lang)}</a>`
      : `            <span class="sidebar-link sidebar-soon"><span class="sidebar-num">${day}</span> ${titleOf(c, day, title, lang)}</span>`)).join('\n');
    return `        <div class="sidebar-group">\n            <div class="sidebar-group-title">${LOOK[g.id][1]} ${groupName(g, lang)}</div>\n${links}\n        </div>`;
  }).join('\n\n');
  return `${head}\n${groups}`;
}).join('\n\n');

const modules = (lang) => COURSES.map((c) => {
  const t = TEXT[lang];
  const head = `        <div class="course-head" id="${anchorOf(c, lang)}">\n` +
    `            <div class="course-label">${t.courseNo} ${c.no}</div>\n            <h2 class="course-title">${c.name}</h2>\n` +
    `            <p class="course-about">${c.about[lang]}</p>\n        </div>`;
  const parts = groupsOf(c).map((g) => {
    const [colour, icon] = LOOK[g.id];
    const range = g.days.length > 1 ? `${t.days} ${g.days[0].day}&ndash;${g.days.at(-1).day}` : `${t.day} ${g.days[0].day}`;
    const items = g.days.map(({ day, title }) => {
      const at = pagesOf(c, day, lang);
      const links = ready(c, day)
        ? `<div class="card-links"><a href="${at}/lecture.html" class="card-link lecture">&#x1F468;&#x200D;&#x1F3EB; ${t.lecture}</a>` +
          `<a href="${at}/student.html" class="card-link student">&#x1F468;&#x200D;&#x1F393; ${t.student}</a>` +
          `<a href="${at}/tasks.html" class="card-link tasks">&#x1F4CB; ${t.tasks}</a></div>`
        : `<div class="card-soon">${t.soon}</div>`;
      return `                <div class="lesson-card${ready(c, day) ? '' : ' lesson-card-soon'}">` +
        `<div class="card-number" style="background: linear-gradient(135deg, ${colour});">${String(day).padStart(2, '0')}</div>` +
        `<div class="card-title">${titleOf(c, day, title, lang)}</div>${links}</div>`;
    }).join('\n');
    return `        <div class="module">\n            <div class="module-header">\n` +
      `                <div class="module-icon" style="background: linear-gradient(135deg, ${colour});">${icon}</div>\n` +
      `                <div>\n                    <div class="module-title">${groupName(g, lang)}</div>\n` +
      `                    <div class="module-count">${range} &bull; ${t.course(c)}</div>\n                </div>\n            </div>\n` +
      `            <div class="card-grid">\n${items}\n            </div>\n        </div>`;
  }).join('\n\n');
  return `${head}\n\n${parts}`;
}).join('\n\n');

// the English list starts hidden, so that a page without JavaScript shows one list, not two
const both = (build) => `        <div data-list="ru">\n${build('ru')}\n        </div>\n` +
  `        <div data-list="en" class="lang-hidden">\n${build('en')}\n        </div>`;

let html = fs.readFileSync(INDEX, 'utf8');
const region = (name, content) => {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(html)) throw new Error(`markers ${name} not found in index.html`);
  html = html.replace(re, `${start}\n${content}\n        ${end}`);
};
region('courses:cards', both(cards));
region('days:sidebar', both(sidebar));
region('days:modules', both(modules));
fs.writeFileSync(INDEX, html);

for (const c of COURSES) {
  const days = PLAN[c.no].days;
  const readyDays = days.filter(([d]) => ready(c, d)).map(([d]) => d);
  const enDays = days.filter(([d]) => hasEn(c, d)).map(([d]) => d);
  console.log(`index.html, course ${c.no} (${c.dir}): ${days.length} days in ${groupsOf(c).length} groups; ` +
    `ready: ${readyDays.join(', ') || 'none'}; in English: ${enDays.join(', ') || 'none'}`);
}
