// Day 11, RU and EN, in Chrome, two checks of where the text sends the student.
// 1. Section 13: the sentence before the pro-tip points to the day where the rule "try...catch is not a replacement
//    for checks" was given. The day number is read from the sentence, that day's lecture is opened and must hold the
//    rule; the day before day 11 (yesterday) must not. No "yesterday" in the sentence.
// 2. Section 2, marks.entries(): the paragraph after the code block and the comment in the notes name the days and
//    courses where the student meets the parts of the line. Every Essentials day named must hold destructuring
//    (the only day allowed is 22); every course named must be the course of Array/entries in the coverage map
//    (docs/coverage/mdn-javascript.csv), and that course's day must explain entries(). Day 20 has no entries at all.
//   node tools/runs/essentials/day-11.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = 'file:///' + path.join(__dirname, '../../../essentials/').replace(/\\/g, '/');
const REPO = path.join(__dirname, '../../..');
const RULE = { 'ru/': /try\.\.\.catch — не замена\s+проверкам/, 'en/': /try\.\.\.catch is not a replacement\s+for checks/ };
const DESTRUCTURING = { 'ru/': /деструктуризац/i, 'en/': /destructuring/i };

const csv = fs.readFileSync(path.join(REPO, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n');
const head = csv[0].split(',');
const entriesRow = csv.find((l) => l.startsWith('Web/JavaScript/Reference/Global_Objects/Array/entries,')).split(',');
const ENTRIES = { course: Number(entriesRow[head.indexOf('course')]), day: Number(entriesRow[head.indexOf('day')]) };
const COURSE_DIR = { 2: 'intermediate', 3: 'advanced', 4: 'web-apis' };

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let bad = 0;
  const text = async (url) => { await p.goto(url); return p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')); };
  console.log(`coverage map: Array/entries — course ${ENTRIES.course}, day ${ENTRIES.day}`);

  // one place that names days and courses for marks.entries()
  const checkPlace = async (lang, where, sentence) => {
    const days = [...sentence.matchAll(/(?:дня|день|day|days) (\d+)(?: (?:и|and) (\d+))?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number);
    const courses = [...sentence.matchAll(/(?:курс|курсе|course) (\d)/g)].map((m) => Number(m[1]));
    const sub = lang === 'ru/' ? '' : 'en/';
    let ok = courses.length === 1 && courses[0] === ENTRIES.course && days.every((d) => d === 22);
    for (const d of days) ok = ok && DESTRUCTURING[lang].test(await text(`${ROOT}day-${String(d).padStart(2, '0')}/${sub}lecture.html`));
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${lang} ${where}: days ${JSON.stringify(days)}, courses ${JSON.stringify(courses)} — ${sentence}`);
  };

  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    // 1. section 13
    await p.goto(`${ROOT}day-11/${sub}lecture.html`);
    const sentence = await p.evaluate(() => {
      const h = document.querySelector('#whencatch');
      return h.nextElementSibling.textContent.replace(/\s+/g, ' ');
    });
    const day = Number((sentence.match(/(?:дня|day) (\d+)/) || [])[1]);
    const yesterday = /вчера|yesterday/i.test(sentence);
    const there = RULE[lang].test(await text(`${ROOT}day-${String(day).padStart(2, '0')}/${sub}lecture.html`));
    const inDay10 = RULE[lang].test(await text(`${ROOT}day-10/${sub}lecture.html`));
    console.log(`${lang} sentence: ${sentence}`);
    console.log(`${lang} points to day ${day}: rule there ${there}; rule in day 10 (yesterday) ${inDay10}; word "yesterday" in the sentence ${yesterday}`);
    if (!there || yesterday || inDay10) bad++;

    // 2. section 2, marks.entries(): the lecture paragraph and the comment in the notes
    await p.goto(`${ROOT}day-11/${sub}lecture.html`);
    const para = await p.evaluate(() => {
      const pre = [...document.querySelectorAll('pre.code.js')].find((x) => x.textContent.includes('marks.entries()'));
      return pre.nextElementSibling.textContent.replace(/\s+/g, ' ').trim();
    });
    await checkPlace(lang, 'lecture', para);
    await p.goto(`${ROOT}day-11/${sub}student.html`);
    const comment = await p.evaluate(() => {
      const line = [...document.querySelectorAll('pre.code.js')].flatMap((x) => x.textContent.split('\n')).find((l) => l.includes('marks.entries()'));
      return line.slice(line.indexOf('//') + 2).trim();
    });
    await checkPlace(lang, 'student comment', comment);
    const day20 = [];
    for (const page of ['lecture', 'student', 'tasks']) if (/entries/.test(await text(`${ROOT}day-20/${sub}${page}.html`))) day20.push(page);
    if (day20.length) bad++;
    console.log(`${day20.length ? 'BAD ' : 'OK  '} ${lang} day 20 pages that mention entries: ${day20.length ? day20.join(', ') : 'none'}`);
  }

  // the course-2 day of Array/entries explains entries()
  const course2 = path.join(REPO, COURSE_DIR[ENTRIES.course], `day-${String(ENTRIES.day).padStart(2, '0')}`, 'lecture.html');
  const explained = fs.existsSync(course2) && /entries\(\)/.test(fs.readFileSync(course2, 'utf8'));
  if (!explained) bad++;
  console.log(`${explained ? 'OK  ' : 'BAD '} course ${ENTRIES.course}, day ${ENTRIES.day} explains entries(): ${explained}`);

  console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
