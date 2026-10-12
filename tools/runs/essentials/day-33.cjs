// Day 33, section 14, RU and EN, in Chrome: the wish list of the first draft of "Word cards". Its sum is computed,
// the budget of two days is taken from the paragraph under it ("180 minutes"), and the comment must give the sum and
// the ratio sum / budget rounded to one decimal ("в 2,3 раза" / "2.3 times").
//   node tools/runs/essentials/day-33.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-33/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    const p = await b.newPage();
    await p.goto(ROOT + sub + 'lecture.html');
    const r = await p.evaluate(() => {
      const pre = [...document.querySelectorAll('pre.code')].find((x) => x.textContent.startsWith('const wishes = ['));
      const lines = pre.textContent.split('\n');
      const last = lines[lines.length - 1];
      const sum = new Function(lines.slice(0, -1).join('\n') + '\nreturn ' + last.slice(0, last.indexOf(';')) + ';')();
      const budget = Number(pre.nextElementSibling.textContent.match(/(\d+) (минут|minutes)/)[1]);
      return { sum, budget, comment: last.slice(last.indexOf('//') + 3) };
    });
    const ratio = (r.sum / r.budget).toFixed(1);
    const said = (r.comment.match(/(\d+[.,]\d)/) || [])[1];
    const ok = r.comment.startsWith(String(r.sum)) && said && said.replace(',', '.') === ratio && !/вдвое|twice/.test(r.comment);
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${lang} sum ${r.sum}, two days ${r.budget}, ratio ${ratio}; comment: ${r.comment}`);
    await p.close();
  }
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
