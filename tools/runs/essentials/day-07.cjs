// Day 7, section 8: the sentence under the isAdmin example, RU and EN, read from the page in Chrome,
// and both lines of the example computed in Chrome for all 8 combinations.
//   node tools/runs/essentials/day-07.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-07/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const sub of ['', 'en/']) {
    await p.goto(ROOT + sub + 'lecture.html');
    const text = await p.evaluate(() => {
      const box = [...document.querySelectorAll('.mistake')].find((d) => d.textContent.includes('isAdmin || isOwner'));
      return box.innerText.split('\n').find((l) => /isPublic = true/.test(l));
    });
    console.log((sub || 'ru/') + ': ' + text);
  }
  const rows = await p.evaluate(() => {
    const out = [];
    for (const isAdmin of [true, false]) for (const isOwner of [true, false]) for (const isPublic of [true, false]) {
      const a = isAdmin || isOwner && isPublic;
      const c = (isAdmin || isOwner) && isPublic;
      out.push(`isAdmin=${isAdmin} isOwner=${isOwner} isPublic=${isPublic}: ${a} ${c}${a !== c ? '  <- differ' : ''}`);
    }
    return out;
  });
  console.log(rows.join('\n'));
  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  await b.close();
})();
