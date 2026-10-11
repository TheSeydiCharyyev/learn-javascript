// Home page tab title in every language mode: first visit, each switcher button, reload, and the way in from an English day page.
//   node tools/check-home-title.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const root = 'file:///' + path.join(__dirname, '..').replace(/\\/g, '/');
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const state = async (label) => console.log(`${label.padEnd(34)} title "${await p.title()}"  html lang ${await p.evaluate(() => document.documentElement.lang)}  stored ${await p.evaluate(() => localStorage.getItem('javascript-essentials-lang'))}`);
  await p.goto(`${root}/index.html`); await p.waitForTimeout(150); await state('first visit');
  for (const lang of ['en', 'ru', 'tk', 'tr', 'en']) { await p.click(`.lang-opt[data-set-lang="${lang}"]`); await p.waitForTimeout(60); await state(`button ${lang}`); }
  await p.reload(); await p.waitForTimeout(150); await state('reload in en');
  await p.goto(`${root}/essentials/day-36/lecture.html`); await p.click('.lesson-nav .lang-btn'); await p.waitForLoadState();
  await p.click('.nav-home'); await p.waitForLoadState(); await p.waitForTimeout(150); await state('day 36 → EN → Course');
  await p.click('.lang-opt[data-set-lang="ru"]'); await p.waitForTimeout(60); await state('button ru');
  console.log('title element:', await p.evaluate(() => document.querySelector('title').outerHTML));
  console.log(errors.length ? 'JS ERRORS: ' + errors.join(' | ') : 'no JS errors');
  await b.close();
})();
