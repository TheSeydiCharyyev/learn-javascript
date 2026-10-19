// Days 3 and 5, RU and EN, in Chrome: every place that sends Symbol or BigInt to a course names the course the
// coverage map gives them (docs/coverage/mdn-javascript.csv, column course: Symbol — day 11 of course 2, BigInt —
// day 21 of course 2). A place is a paragraph, a table row or a list item whose text names Symbol (a symbol) or
// BigInt together with "курс N" / "course N"; also an <!-- ahead-ok: … --> comment right before a code block that
// uses Symbol. The rows of the day-3 table "what is studied where" must not put Symbol into course 3.
//   node tools/runs/essentials/day-05.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const csv = fs.readFileSync(path.join(ROOT, 'docs/coverage/mdn-javascript.csv'), 'utf8').split('\n');
const head = csv[0].split(',');
const courseOf = (name) => {
  const row = csv.find((l) => l.startsWith(`Web/JavaScript/Reference/Global_Objects/${name},`)).split(',');
  return Number(row[head.indexOf('course')]);
};
const WANT = { Symbol: courseOf('Symbol'), BigInt: courseOf('BigInt') };
const PAGES = [];
for (const day of ['day-03', 'day-05']) for (const sub of ['', 'en/']) for (const p of ['lecture', 'student', 'tasks']) PAGES.push(`essentials/${day}/${sub}${p}.html`);

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  let bad = 0, places = 0;
  console.log(`coverage map: Symbol — course ${WANT.Symbol}, BigInt — course ${WANT.BigInt}`);
  for (const file of PAGES) {
    await p.goto('file:///' + path.join(ROOT, file).replace(/\\/g, '/'));
    const found = await p.evaluate(() => [...document.querySelectorAll('p, tr, li')]
      .filter((el) => !el.querySelector('p, tr, li'))
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
      .filter((t) => /Symbol|символ|BigInt/i.test(t) && /(?:курс|курсе|course) \d/.test(t)));
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of html.matchAll(/<!--\s*ahead-ok:([^>]*)-->\s*<pre class="code js">([\s\S]*?)<\/pre>/g)) {
      if (/Symbol\s*\(/.test(m[2])) found.push(`ahead-ok:${m[1]}(block with Symbol)`);
    }
    for (const t of found) {
      places++;
      const courses = [...t.matchAll(/(?:курс|курсе|course) (\d)/g)].map((x) => Number(x[1]));
      const names = ['Symbol', 'BigInt'].filter((n) => (n === 'Symbol' ? /Symbol|символ/i : /BigInt/).test(t));
      const ok = names.every((n) => courses.includes(WANT[n])) && !(names.includes('Symbol') && courses.includes(3));
      if (!ok) bad++;
      console.log(`${ok ? 'OK  ' : 'BAD '} ${file}: ${t.slice(0, 150)}`);
    }
  }
  console.log(`places: ${places}, ${bad ? `PROBLEMS ${bad}` : 'all match'}`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
