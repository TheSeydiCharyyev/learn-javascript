// Day 36, RU and EN.
// Section 4: the comment "buttons from the data, makeTopicButtons of day N" must point to the day whose lecture has a
// working makeTopicButtons (a body with code), not the day 33 stub (a body with only a comment). Read in Chrome.
// (Section 7's indentation in the HTML file was checked too, until the page became MDX — see below.)
// The whole "Word cards" defense run of the day is day-36-cards.cjs.
//   node tools/runs/essentials/day-36.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const builtSite = require('../../lib/site.cjs'); // the built site (site/out) — stage 4 of the move to Next.js
const fs = require('node:fs');
const path = require('node:path');
const ESS = path.join(__dirname, '../../../essentials/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  // the body of the first makeTopicButtons in a lecture, comments and blank lines dropped
  const bodyIn = async (day, sub) => {
    await p.goto(builtSite.urlOfFile(path.join(ESS, `day-${day}`, sub, 'lecture.html')));
    return p.evaluate(() => {
      const code = [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.includes('function makeTopicButtons() {'));
      const from = code.indexOf('function makeTopicButtons() {');
      const lines = code.slice(from).split('\n');
      const end = lines.findIndex((l) => l === '}');
      return lines.slice(1, end).map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
    });
  };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    await p.goto(builtSite.urlOfFile(path.join(ESS, 'day-36', sub, 'lecture.html')));
    const comment = await p.evaluate(() => [...document.querySelectorAll('pre.code')].map((x) => x.textContent)
      .find((x) => x.includes('makeTopicButtons') && /(дня|of day) \d+:/.test(x)).split('\n').find((l) => l.includes('makeTopicButtons')));
    const day = Number(comment.match(/(?:дня|of day) (\d+)/)[1]);
    const named = await bodyIn(day, sub);
    const stub = await bodyIn(33, sub);
    check(named.length > 0, `${comment.trim()} → day ${day} has a working makeTopicButtons (${named.length} lines of code)`);
    console.log(`     day 33 has the stub: ${stub.length === 0}`);
    // (Section 7's indentation of 4 spaces in the HTML file was checked here until 11.11.2026: the page is MDX since
    // stage 2 of the move to Next.js — Markdown has no such indentation, the check went with the HTML file.)
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
