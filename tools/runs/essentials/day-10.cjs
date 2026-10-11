// Day 10, section 14, RU and EN, in Chrome: the "Report card" program is taken from the page and run, its console
// output is compared with the result-box; the loop kinds in the code are counted and compared with the sentence
// above the program; the title of the section, its line in the contents and the title of task 7 must be the same.
//   node tools/runs/essentials/day-10.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-10/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const info = await p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      const intro = el.textContent.replace(/\s+/g, ' ');
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      const box = el.nextElementSibling;
      return { heading: h.textContent.replace(/^\d+\.\s*/, ''), toc: document.querySelector('a[href="#tabel"]').textContent,
        intro, code: el.textContent, box: box.innerText.split('\n').map((s) => s.trim()).filter(Boolean) };
    });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Runtime.enable');
    const lines = [];
    cdp.on('Runtime.consoleAPICalled', (e) => lines.push(e.args.map((a) => a.value).join(' ')));
    await cdp.send('Runtime.evaluate', { expression: info.code });
    await p.waitForTimeout(200);
    await p.goto(ROOT + sub + 'tasks.html');
    const task = await p.evaluate(() => [...document.querySelectorAll('.task-title')].find((t) => /^7\./.test(t.textContent)).textContent.replace(/^7\.\s*/, ''));

    const kinds = {
      for: (info.code.match(/\bfor\s*\(/g) || []).length,
      while: (info.code.match(/\bwhile\s*\(/g) || []).length - (info.code.match(/\}\s*while\s*\(/g) || []).length,
      'do...while': (info.code.match(/\bdo\s*\{/g) || []).length,
    };
    const used = Object.keys(kinds).filter((k) => kinds[k] > 0);
    const named = Object.keys(kinds).filter((k) => new RegExp(`\\b${k.replace('...', '\\.\\.\\.')}\\b`).test(info.intro));
    console.log(`${lang} sentence: ${info.intro}`);
    console.log(`${lang} loops in the code: ${JSON.stringify(kinds)}; named in the sentence: ${named.join(', ') || 'none'}`);
    if (used.join() !== named.join()) { bad++; console.log(`${lang} DIFFERENT: used ${used.join(', ')}`); }
    console.log(`${lang} titles: section "${info.heading}" | contents "${info.toc}" | task 7 "${task}"`);
    if (!(info.heading === info.toc && info.toc === task)) { bad++; console.log(`${lang} DIFFERENT titles`); }
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
