// Day 8: the "Report card" code of section 14 is taken from the page and run in Chrome, RU and EN.
// Console output is rebuilt from Chrome's own preview objects (CDP Runtime.consoleAPICalled) the way
// DevTools prints them: "(4) [5, 4, 3, 5]", strings in single quotes. Compared with the result-box.
// Also: section 9 points to the section that really holds the "Report card".
//   node tools/runs/essentials/day-08.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-08/').replace(/\\/g, '/');
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.subtype === 'array') {
    const items = a.preview.properties.map((p) => (p.type === 'string' ? q(p.value) : p.value));
    return `(${a.description.match(/\d+/)[0]}) [${items.join(', ')}]`;
  }
  return String(a.value);
};
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  for (const sub of ['', 'en/']) {
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const info = await p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      const box = el.nextElementSibling;
      const pointer = [...document.querySelectorAll('p')].find((x) => /в «Табеле»|in the “Report card”/.test(x.textContent));
      return { heading: h.textContent, code: el.textContent, box: box.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
        pointer: pointer.textContent.replace(/\s+/g, ' ').match(/[^.]*(«Табеле»|“Report card”)[^.]*\./)[0].trim() };
    });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Runtime.enable');
    const lines = [];
    cdp.on('Runtime.consoleAPICalled', (e) => lines.push(e.args.map(show).join(' ')));
    await cdp.send('Runtime.evaluate', { expression: info.code });
    await p.waitForTimeout(200);
    const lang = sub || 'ru/';
    console.log(`${lang} heading: ${info.heading}`);
    console.log(`${lang} pointer: ${info.pointer}`);
    lines.forEach((l, i) => {
      const same = l === info.box[i];
      if (!same) bad++;
      console.log(`${lang} chrome: ${l}\n${lang} box:    ${info.box[i]}  ${same ? 'OK' : 'DIFFERENT'}`);
    });
    if (lines.length !== info.box.length) { bad++; console.log(`${lang} lines: chrome ${lines.length}, box ${info.box.length}`); }
    console.log(`${lang} errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
