// Home page tab title in every language mode: first visit, each switcher button, reload, and the way in from an English day page.
//   node tools/check-home-title.cjs
// The pages are the built site (site/out, `pnpm build` in site/ first — stage 4 of the move to Next.js, 09.11.2026),
// served by tools/lib/site.cjs. The RU/EN button and "← Course" move by Next.js's router, without a load: after a
// click the check waits for the address and the page's language to change.
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const site = require('./lib/site.cjs');
(async () => {
  site.builtFile('index.html'); site.builtFile('essentials/day-36/lecture.html'); site.builtFile('essentials/day-36/en/lecture.html');
  const { base, close } = await site.serve();
  const root = base.replace(/\/$/, '');
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const state = async (label) => console.log(`${label.padEnd(34)} title "${await p.title()}"  html lang ${await p.evaluate(() => document.documentElement.lang)}  stored ${await p.evaluate(() => localStorage.getItem('javascript-essentials-lang'))}`);
  // a click that moves to another page by the router: wait for the new address
  const move = async (selector) => { const before = p.url(); await Promise.all([p.waitForURL((u) => u.href !== before), p.click(selector)]); await p.waitForTimeout(150); };
  await p.goto(`${root}/index.html`); await p.waitForTimeout(150); await state('first visit');
  for (const lang of ['en', 'ru', 'tk', 'tr', 'en']) { await p.click(`.lang-opt[data-set-lang="${lang}"]`); await p.waitForTimeout(60); await state(`button ${lang}`); }
  await p.reload(); await p.waitForTimeout(150); await state('reload in en');
  await p.goto(`${root}/essentials/day-36/lecture.html`); await move('.lesson-nav .lang-btn');
  await move('.nav-home'); await state('day 36 → EN → Course');
  await p.click('.lang-opt[data-set-lang="ru"]'); await p.waitForTimeout(60); await state('button ru');
  console.log('title element:', await p.evaluate(() => document.querySelector('title').outerHTML));
  console.log(errors.length ? 'JS ERRORS: ' + errors.join(' | ') : 'no JS errors');
  await b.close();
  await close();
})();
