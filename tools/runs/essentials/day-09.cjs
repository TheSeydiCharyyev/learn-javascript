// Day 9, section 14, experiment 1, RU and EN, in Chrome. The program is taken from the page; the marks
// for the experiment are taken from the try-it text. Four runs: page data as is, page data with the
// first two verdict branches swapped, then the same two with the try-it marks. The page data must
// give the same verdict both times (that was the finding); the try-it marks must change it.
//   node tools/runs/essentials/day-09.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-09/').replace(/\\/g, '/');
// swap the bodies of the first two verdict branches: if (A) { X } else if (B) { Y } -> if (B) { Y } else if (A) { X }
const swap = (code) => code.replace(
  /if \(average >= ([\d.]+)\) \{\n(\s+verdict = [^\n]+)\n\} else if \(average >= ([\d.]+)\) \{\n(\s+verdict = [^\n]+)\n\}/,
  (m, a, x, b2, y) => `if (average >= ${b2}) {\n${y}\n} else if (average >= ${a}) {\n${x}\n}`);
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const sub of ['', 'en/']) {
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const info = await p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      let t = el;
      while (t && !t.matches('.try-it')) t = t.nextElementSibling;
      return { code: el.textContent, tryit: t.innerText.replace(/\s+/g, ' ') };
    });
    const marks = info.tryit.match(/\[[\d, ]+\]/)[0];
    const withMarks = info.code.replace(/const marks = \[[^\]]*\];/, `const marks = ${marks};`);
    const swapped = swap(info.code);
    if (swapped === info.code) throw new Error('swap did not apply');
    const runs = [['page data', info.code], ['page data, swapped', swapped],
      [`${marks}`, withMarks], [`${marks}, swapped`, swap(withMarks)]];
    const lang = sub || 'ru/';
    console.log(`${lang} try-it: ${info.tryit.match(/(Первый|The first)\.[^.]*\.[^.]*\.[^.]*\./)[0]}`);
    for (const [name, code] of runs) {
      const first = await p.evaluate((src) => {
        const out = [];
        const log = console.log;
        console.log = (...a) => out.push(a.join(' '));
        try { new Function(src)(); } finally { console.log = log; }
        return out[0];
      }, code);
      console.log(`${lang} ${name.padEnd(22)} ${first}`);
    }
    console.log(`${lang} errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  await b.close();
})();
