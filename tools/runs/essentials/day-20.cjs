// Day 20 finding: module names in the day pages must be the ones the home page shows (built from
// tools/plan-modules.mjs and tools/plan-en.mjs). In Chrome, RU and EN: the home page in that language gives the
// visible modules and their days; then every lecture of days 1–36 is opened. The name in quotes in the header line
// under the title must be the module of that day (a project day may name the module it follows); every quoted
// module name in the text ("модуль «…»", "module “…”") must be one of the home page modules.
//   node tools/runs/essentials/day-20.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../').replace(/\\/g, '/');
const QUOTED = { ru: /[Мм]одул[ьяеию]{0,2}\s+«([^»]+)»/g, en: /[Mm]odule\s+“([^”]+)”|“([^”]+)”\s+module/g };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let bad = 0, checked = 0;
  for (const lang of ['ru', 'en']) {
    await p.goto(ROOT + 'index.html');
    await p.evaluate((l) => setLang(l), lang);
    await p.waitForTimeout(100);
    const modules = await p.evaluate(() => [...document.querySelectorAll('.module')].filter((m) => m.offsetParent !== null).map((m) => ({
      title: m.querySelector('.module-title').innerText.trim(),
      days: [...m.querySelectorAll('.card-number')].map((c) => Number(c.innerText)),
    })));
    const titles = new Set(modules.map((m) => m.title));
    const moduleOf = (d) => (modules.find((m) => m.days.includes(d)) || {}).title;
    console.log(`\n=== ${lang}: ${modules.length} modules on the home page`);
    for (let d = 1; d <= 36; d++) {
      const dd = String(d).padStart(2, '0');
      await p.goto(`${ROOT}essentials/day-${dd}/${lang === 'en' ? 'en/' : ''}lecture.html`);
      const page = await p.evaluate(() => ({ head: document.querySelector('.day-head p').innerText, body: document.body.innerText }));
      const named = (s) => [...s.matchAll(QUOTED[lang])].map((m) => m[1] || m[2]);
      const head = named(page.head);
      const project = /проектн|project/i.test(page.head);
      for (const h of head) {
        checked++;
        const ok = project ? titles.has(h) : h === moduleOf(d);
        if (!ok) { bad++; console.log(`BAD  day ${d} header: "${h}", the home page: "${moduleOf(d)}"`); }
      }
      for (const t of named(page.body).filter((t) => !head.includes(t))) {
        checked++;
        if (!titles.has(t)) { bad++; console.log(`BAD  day ${d} text: "${t}" is not a module of the home page`); }
      }
    }
  }
  console.log(`\nquoted module names checked: ${checked}; errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
