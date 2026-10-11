// Day 11, section 13, RU and EN, in Chrome: the sentence before the pro-tip points to the day where the rule
// "try...catch is not a replacement for checks" was given. The day number is read from the sentence, that day's
// lecture is opened and must hold the rule; the day before day 11 (yesterday) must not. No "yesterday" in the sentence.
//   node tools/runs/essentials/day-11.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/').replace(/\\/g, '/');
const RULE = { 'ru/': /try\.\.\.catch — не замена\s+проверкам/, 'en/': /try\.\.\.catch is not a replacement\s+for checks/ };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let bad = 0;
  const text = async (url) => { await p.goto(url); return p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')); };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
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
  }
  console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
