// Day 19, RU and EN, in Chrome: the three examples with Turkmen words (days of the week in section 3, the splice
// list in section 5, the schedule in section 11). Each block runs; every console.log value is compared with the value
// written in its comment. The Turkmen words are in Turkmen Latin — no Cyrillic letter in the arrays of days and of
// the splice list — and the code of these two blocks is the same in RU and EN (comments aside).
//   node tools/runs/essentials/day-19.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-19/').replace(/\\/g, '/');
const PICK = { days: 'const days = [', list: 'const list = [', schedule: 'const schedule = [' };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const code = {};
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const blocks = await p.evaluate((pick) => {
      const all = [...document.querySelectorAll('pre.code')].map((x) => x.textContent);
      return Object.fromEntries(Object.entries(pick).map(([k, start]) => [k, all.find((x) => x.startsWith(start))]));
    }, PICK);
    code[lang] = blocks;
    for (const [name, src] of Object.entries(blocks)) {
      const got = await p.evaluate((s) => {
        const out = [];
        const log = console.log;
        console.log = (v) => out.push(JSON.stringify(v));
        try { new Function(s)(); } finally { console.log = log; }
        return out;
      }, src);
      // the value in a comment is what stands before " — " (a remark after it is not a value)
      const said = src.split('\n').filter((l) => l.startsWith('console.log(')).map((l) => {
        const c = l.includes('//') ? l.slice(l.indexOf('//') + 3).split(' — ')[0].trim() : '';
        try { return JSON.stringify(JSON.parse(c)); } catch { return null; }
      });
      said.forEach((s, i) => { if (s !== null) check(s === got[i], `${name}: chrome ${got[i]}, comment ${s}`); });
    }
    for (const name of ['days', 'list']) {
      const arrays = [...blocks[name].matchAll(/\[[^\]]*\]/g)].map((m) => m[0]).join(' ');
      check(!/[а-яёүғө]/i.test(arrays), `${name}: no Cyrillic in the arrays: ${arrays}`);
    }
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  const noComments = (s) => s.split('\n').map((l) => l.replace(/\s*\/\/.*$/, '')).join('\n');
  console.log('');
  for (const name of ['days', 'list']) check(noComments(code['ru/'][name]) === noComments(code['en/'][name]), `${name}: the code is the same in RU and EN`);
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
