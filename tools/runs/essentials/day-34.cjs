// Day 34, section 2 "Where we start", RU and EN, in Chrome: the table of features is read from the page; the number
// of rows marked "ready" and of half-ready rows ("we read but do not write") must be the ones the sentence under the
// table names, and the number of plan tasks left must match the task column. Also, in the source of the lecture no
// paragraph starts with a space after <p>.
// The whole "Word cards" run of the day is day-34-cards.cjs.
//   node tools/runs/essentials/day-34.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const DIR = path.join(__dirname, '../../../essentials/day-34/');
const NUM = { 'ru/': { Три: 3, Четыре: 4, пять: 5 }, 'en/': { Three: 3, Four: 4, Five: 5 } };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    await p.goto('file:///' + path.join(DIR, sub, 'lecture.html').replace(/\\/g, '/'));
    const r = await p.evaluate(() => {
      const table = document.querySelector('#start ~ table');
      const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim()));
      return { rows, sentence: table.nextElementSibling.textContent.replace(/\s+/g, ' ') };
    });
    const ready = r.rows.filter((c) => /^(готово|ready)$/.test(c[2])).length;
    const half = r.rows.filter((c) => /читаем, но не пишем|we read, but do not write/.test(c[2])).length;
    const tasks = new Set(r.rows.map((c) => c[3]).filter(Boolean)).size;
    const words = r.sentence.split(/[^A-Za-zА-Яа-яЁё]+/).filter((w) => NUM[lang][w] !== undefined).map((w) => NUM[lang][w]);
    console.log(`     table: ready ${ready}, half ${half}, tasks ${tasks}; sentence: ${r.sentence.slice(0, 120)}…`);
    check(words[0] === ready && (half === 0 || /наполовину|half done/.test(r.sentence)), `ready rows ${ready}${half ? ` and ${half} half done` : ''} as in the sentence`);
    check(words[1] === tasks, `${tasks} plan tasks left as in the sentence`);
    const src = fs.readFileSync(path.join(DIR, sub, 'lecture.html'), 'utf8');
    const spaced = src.split('\n').filter((l) => /<p> \S/.test(l));
    check(spaced.length === 0, `no "<p> " in the source${spaced.length ? ': ' + spaced[0].trim().slice(0, 60) : ''}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
