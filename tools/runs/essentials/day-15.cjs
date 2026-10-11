// Day 15, section 8 "Printing at the borders", RU and EN, in Chrome. The code blocks of the section run in the order
// of the text (countPresent with its two border prints, then each call), the console lines are rebuilt from Chrome's
// preview objects the way DevTools prints them ("(3) [1, 0, 1]"), and compared with the comments under the calls,
// the groups result-box, and the two call lines of the notes page.
//   node tools/runs/essentials/day-15.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-15/').replace(/\\/g, '/');
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const show = (a) => {
  if (a.type === 'string') return a.value;
  if (a.subtype === 'array') return `(${a.description.match(/\d+/)[0]}) [${a.preview.properties.map((p) => (p.type === 'string' ? q(p.value) : p.value)).join(', ')}]`;
  return String(a.value ?? a.description);
};
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const same = (chrome, page, what) => {
    const ok = chrome.length === page.length && chrome.every((l, i) => l === page[i]);
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${what}`);
    chrome.forEach((l, i) => { if (l !== page[i]) console.log(`       chrome: ${l}\n       page:   ${page[i]}`); });
  };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Runtime.enable');
    let lines = [];
    cdp.on('Runtime.consoleAPICalled', (e) => lines.push(e.args.map(show).join(' ')));
    const run = async (code) => { lines = []; await cdp.send('Runtime.evaluate', { expression: `(() => {\n${code}\n})()` }); await p.waitForTimeout(150); return lines; };

    await p.goto(ROOT + sub + 'lecture.html');
    const s8 = await p.evaluate(() => {
      const blocks = [];
      let box = null;
      for (let el = document.querySelector('#borders').nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
        if (el.matches('pre.code')) blocks.push(el.textContent);
        if (el.matches('.result-box') && !box) box = el.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      }
      return { blocks, box };
    });
    const [def, call1, call2, groups] = s8.blocks;
    // the comment lines under a call are what it prints; a "←" note at the end is a remark, not output
    const said = (block) => block.split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3).replace(/\s*←.*$/, '').trim());
    same(await run(def + '\n' + call1.split('\n')[0]), said(call1), `lecture: ${call1.split('\n')[0]}`);
    same(await run(def + '\n' + call2.split('\n')[0]), said(call2), `lecture: ${call2.split('\n')[0]}`);
    same(await run(def + '\n' + groups), s8.box, 'lecture: the groups result-box');

    await p.goto(ROOT + sub + 'student.html');
    const notes = await p.evaluate(() => [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.includes('function countPresent')));
    const src = notes.split('\n');
    const at = src.findIndex((l) => l.startsWith('countPresent('));
    const nDef = src.slice(0, at).join('\n');
    for (const l of src.slice(at).filter((x) => x.startsWith('countPresent('))) {
      const [code, comment] = [l.slice(0, l.indexOf('//')).trim(), l.slice(l.indexOf('//') + 3).replace(/\s*←.*$/, '')];
      same(await run(nDef + '\n' + code), comment.split(/\s{2,}/).map((s) => s.trim()), `notes: ${l.trim()}`);
    }
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
