// Layout check for the written day pages and their translations in day-NN/en/: no horizontal overflow
// at phone, tablet and desktop widths, no JS errors, every code block highlighted, no Russian label
// (CSS ::before) on a translated page. Also prints the word count of each page.
//
//   NODE_PATH=C:/Users/seydi/goose/ui/node_modules node tools/check-pages.cjs
//   NODE_PATH=... node tools/check-pages.cjs 3                 only day 3 of essentials
//   NODE_PATH=... node tools/check-pages.cjs intermediate 3    only day 3 of course 2
// The course folder is optional and defaults to essentials.
// Playwright comes from the goose folder; the browser is the installed Chrome.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const COURSES = ['essentials', 'intermediate', 'advanced', 'web-apis'];
const args = process.argv.slice(2);
const wrong = args.filter((a) => !COURSES.includes(a) && !/^\d+$/.test(a));
if (wrong.length) { console.log(`unknown argument: ${wrong.join(' ')} (a course folder: ${COURSES.join(', ')}, or day numbers)`); process.exit(1); }
const COURSE = args.find((a) => COURSES.includes(a)) ?? 'essentials';
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const days = (fs.existsSync(path.join(ROOT, COURSE)) ? fs.readdirSync(path.join(ROOT, COURSE)) : [])
  .filter((d) => /^day-\d+$/.test(d))
  .filter((d) => !only.length || only.includes(Number(d.slice(4))));
const PAGES = days.flatMap((d) => ['', 'en/']
  .filter((sub) => fs.existsSync(path.join(ROOT, COURSE, d, sub)))
  .flatMap((sub) => ['lecture', 'student', 'tasks'].map((f) => `${d}/${sub}${f}.html`)));
const SIZES = [[360, 780], [414, 800], [768, 1024], [1280, 900], [640, 360]];
const URL = 'file:///' + path.join(ROOT, COURSE).replace(/\\/g, '/') + '/';

(async () => {
  if (!PAGES.length) { console.log(`no day folders found in ${COURSE}/`); process.exit(1); }
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const problems = [];
  for (const [w, h] of SIZES) {
    const mobile = w < 1024 || h < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const p of PAGES) {
      await page.goto(URL + p);
      await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('body *')].filter((el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          if (el.getBoundingClientRect().right <= vw + 1) return false;
          let a = el.parentElement;
          while (a && a !== document.body) {
            if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= vw + 1) return false;
            a = a.parentElement;
          }
          return true;
        }).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
        const text = document.querySelector('.container').innerText;
        return {
          overflow: document.documentElement.scrollWidth - vw,
          over: [...new Set(over)],
          words: (text.match(/[\p{L}\p{N}]+/gu) || []).length,
          code: document.querySelectorAll('pre.code').length,
          plain: [...document.querySelectorAll('pre.code')].filter((el) => !el.querySelector('span')).length,
          svg: document.querySelectorAll('figure.scheme svg').length,
          mdn: document.querySelectorAll('a[href*="developer.mozilla.org"]').length,
          ruLabels: document.documentElement.lang === 'ru' ? [] : [...new Set([...document.querySelectorAll('body *')]
            .map((el) => getComputedStyle(el, '::before').content).filter((c) => /[А-Яа-яЁё]/.test(c)))],
        };
      });
      if (w === 360) console.log(`${p.padEnd(25)} ${String(r.words).padStart(5)} слов, код ${r.code}, схем ${r.svg}, ссылок MDN ${r.mdn}`);
      if (w === 360 && r.ruLabels.length) problems.push(`${p}: Russian labels — ${r.ruLabels.join(', ')}`);
      if (r.overflow > 0) problems.push(`${p} @${w}x${h}: overflow ${r.overflow} (${r.over.join(', ')})`);
      if (r.plain) problems.push(`${p} @${w}: ${r.plain} code blocks without highlighting`);
    }
    if (errors.length) problems.push(`${w}x${h}: JS errors — ${errors.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : `${PAGES.length} pages: no overflow, no JS errors, every code block highlighted`);
  process.exit(problems.length ? 1 : 0);
})();
