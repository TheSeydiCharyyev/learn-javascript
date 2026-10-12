// Day 35, RU and EN, in Chrome.
// Section 11, the whole program as the page shows it: inside load() every line of the try block has the same indent,
// and the "// day 35" comments of load() start in one column (counted on the rendered text, where => is two
// characters, not the five of =&gt; in the source).
// Section 8: the remark about innerHTML points to the part of day 25 that really holds it — its number and title.
// The whole "Word cards" run of the day is day-35-cards.cjs.
//   node tools/runs/essentials/day-35.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    await p.goto(`${ROOT}day-35/${sub}lecture.html`);
    const r = await p.evaluate(() => {
      const pre = [...document.querySelectorAll('pre.code')].find((x) => x.textContent.includes('async function load()') && x.textContent.includes('deck, current'));
      const remark = [...document.querySelectorAll('p')].find((x) => x.textContent.includes('innerHTML') && /дня 25|of day 25/.test(x.textContent));
      return { code: pre.innerText, remark: remark.textContent.replace(/\s+/g, ' ') };
    });
    const lines = r.code.split('\n');
    const s = lines.findIndex((l) => l.startsWith('async function load()'));
    const tryAt = lines.findIndex((l, i) => i > s && l.trim() === 'try {');
    const catchAt = lines.findIndex((l, i) => i > tryAt && l.trim().startsWith('} catch'));
    const body = lines.slice(tryAt + 1, catchAt).filter((l) => l.trim());
    const indents = [...new Set(body.map((l) => l.length - l.trimStart().length))];
    check(indents.length === 1, `load(): the try block lines are indented by ${indents.join(', ')}`);
    const cols = body.filter((l) => /; +\/\/ (день|day) 35/.test(l)).map((l) => l.indexOf('//'));
    check(new Set(cols).size === 1, `load(): the day 35 comments start in columns ${cols.join(', ')}`);

    const m = r.remark.match(/(?:раздел|section) (\d+) [«“]([^»”]+)[»”] (?:дня|of day) 25/);
    await p.goto(`${ROOT}day-25/${sub}lecture.html`);
    const heads = await p.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()));
    const hit = m && heads.find((h) => h === `${m[1]}. ${m[2]}`);
    check(!!hit && !/разбор|walkthrough/.test(r.remark.match(/innerHTML[^;]*;/)[0]), `section 8 points to day 25: ${m ? `${m[1]} «${m[2]}»` : 'no section number'}; day 25 has "${hit || '—'}"`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
