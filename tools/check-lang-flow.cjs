// A student's path for one day: each Russian page -> EN button -> English twin -> RU button -> back,
// the "Course" link from the English page -> home page language; then the home page card of the day in RU and EN mode.
//   node tools/check-lang-flow.cjs <day>
// The pages are the built site (site/out, `pnpm build` in site/ first — stage 4 of the move to Next.js, 09.11.2026),
// served by tools/lib/site.cjs. The buttons and links move by Next.js's router, without a load: after a click the check
// waits for the address and the page's language; the addresses are routes ("…/en/lecture", the home page "/"). The
// home page is switched to Russian by its RU button (there is no global setLang any more).
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const site = require('./lib/site.cjs');
(async () => {
  const dayArg = process.argv[2];
  const dd = String(dayArg).padStart(2, '0');
  for (const sub of ['', 'en/']) for (const page of ['lecture', 'student', 'tasks']) site.builtFile(`essentials/day-${dd}/${sub}${page}.html`);
  const { base, close } = await site.serve();
  const root = base.replace(/\/$/, '');
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // a click that moves to another page by the router: the new address, then the page's language
  const move = async (selector, lang) => {
    const before = p.url();
    await Promise.all([p.waitForURL((u) => u.href !== before), p.click(selector)]);
    await p.waitForFunction((l) => document.documentElement.lang === l, lang);
    await p.waitForTimeout(100);
  };
  for (const page of ['lecture', 'student', 'tasks']) {
    await p.goto(`${root}/essentials/day-${dd}/${page}.html`);
    const btn = await p.$('.lesson-nav .lang-btn');
    const box = await btn.boundingBox();
    const label = await btn.innerText();
    await move('.lesson-nav .lang-btn', 'en');
    const en = await p.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector('h1').innerText, stored: localStorage.getItem('javascript-essentials-lang') }));
    const enUrl = p.url().replace(root, '');
    await move('.lesson-nav .lang-btn', 'ru');
    const back = p.url().replace(root, '');
    const stored = await p.evaluate(() => localStorage.getItem('javascript-essentials-lang'));
    console.log(`${page}: button ${label} ${Math.round(box.width)}x${Math.round(box.height)} -> ${enUrl} [${en.lang}, stored ${en.stored}] "${en.h1}" -> back ${back} [stored ${stored}]`);
  }
  await p.goto(`${root}/essentials/day-${dd}/en/lecture.html`);
  await p.evaluate(() => localStorage.setItem('javascript-essentials-lang', 'en'));
  await move('.nav-home', 'en'); await p.waitForTimeout(150);
  for (const mode of ['en', 'ru']) {
    if (mode === 'ru') { await p.click('.lang-opt[data-set-lang="ru"]'); await p.waitForTimeout(100); }
    const r = await p.evaluate((n) => {
      const visible = (el) => el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
      const card = [...document.querySelectorAll('.lesson-card')].filter(visible)[n - 1];
      const side = [...document.querySelectorAll('.sidebar-link')].filter(visible).find((a) => a.querySelector('.sidebar-num') && a.querySelector('.sidebar-num').innerText.trim() === String(n));
      return { lang: document.documentElement.lang, card: card && card.querySelector('.card-title').innerText, links: card && [...card.querySelectorAll('a')].map((a) => a.getAttribute('href')),
        side: side && side.getAttribute('href'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, Number(dayArg));
    console.log(`home ${mode}: ${JSON.stringify(r)}`);
  }
  console.log(errors.length ? 'JS ERRORS: ' + errors.join(' | ') : 'no JS errors');
  await b.close();
  await close();
})();
