// Day 14, RU and EN, in Chrome.
// Section 14: the "Report card" program is taken from the page and run, its output is compared with the result-box.
// Experiment 3 is done as a student would: an early branch for valid.length === 0 goes into makeReport; the reports
// that changed and the ones that did not must be the ones the try-it text names.
// Section 16: the sentence about three dots in a call points to day 22 (not "tomorrow"), the example call is in this
// day with the note "day 22", and day 22 really spreads an array in a call.
//   node tools/runs/essentials/day-14.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/').replace(/\\/g, '/');
const STAYED = { 'ru/': 'остались прежними', 'en/': 'stayed the same' };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const run = (code) => p.evaluate((src) => {
    const out = [];
    const log = console.log;
    console.log = (...a) => out.push(a.join(' '));
    try { new Function(src)(); } finally { console.log = log; }
    return out;
  }, code);
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    await p.goto(`${ROOT}day-14/${sub}lecture.html`);
    const page = await p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      const box = el.nextElementSibling;
      let t = box;
      while (t && !t.matches('.try-it')) t = t.nextElementSibling;
      const next = [...document.querySelectorAll('#next ~ p')].find((x) => x.textContent.includes('marksArray'));
      const example = [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => /makeReport\("[^"]+", \.\.\.marksArray\)/.test(x));
      return { code: el.textContent, box: box.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
        tryit: t.innerText.replace(/\s+/g, ' '), next: next.textContent.replace(/\s+/g, ' '), example };
    });
    const before = await run(page.code);
    before.forEach((l, i) => check(l === page.box[i], `chrome = box: ${l}`));

    // experiment 3: the early branch right after `const valid = ...`
    const withBranch = page.code.replace(/(\n  const valid = [^\n]+\n)/, '$1  if (valid.length === 0) return `${name}: —`;\n');
    check(withBranch !== page.code, 'the early branch went into makeReport');
    const after = await run(withBranch);
    const name = (l) => l.slice(0, l.indexOf(':'));
    const last = name(before[before.length - 1]);
    const changed = before.filter((l, i) => l !== after[i]).map(name);
    const same = before.filter((l, i) => l === after[i]).map(name);
    console.log(`experiment 3: changed ${changed.join(', ')}; the same ${same.join(', ')}`);
    const third = page.tryit.slice(page.tryit.search(/Третий|The third/));
    const stayed = third.split(/(?<=\.)\s/).find((s) => s.includes(STAYED[lang])) || '';
    const rest = third.replace(stayed, '');
    check(changed.includes(last), `the last report (${last}) changed`);
    for (const n of changed.filter((n) => n !== last)) check(rest.includes(n) && !stayed.includes(n), `${n} is named as changed`);
    for (const n of same) check(stayed.includes(n), `${n} is named as the same`);
    console.log(`  try-it: ${third}`);

    // section 16
    check(/дня 22|day 22/.test(page.next) && !/завтрашн|tomorrow/i.test(page.next), `section 16 points to day 22: ${page.next}`);
    check(/\/\/ (день|day) 22/.test(page.example || ''), `the example call is in this day with the note day 22: ${(page.example || '').split('\n').pop()}`);
    await p.goto(`${ROOT}day-22/${sub}lecture.html`);
    const spread = await p.evaluate(() => [...document.querySelectorAll('pre.code')].some((x) => /\w\(\.\.\.\w+\)/.test(x.textContent)));
    check(spread, 'day 22 spreads an array in a call: f(...array)');
  }
  console.log(`\nerrors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
