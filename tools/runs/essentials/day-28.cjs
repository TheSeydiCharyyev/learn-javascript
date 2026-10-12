// Day 28, RU and EN, in Chrome.
// Lecture, the mistake box of section 3: the habit (textContent) is from day 25, not "yesterday".
// Notes: in the submit example, every "// N." comment starts in the same column on the rendered page.
// Task 6: the criteria show «  МЕРЕТ» with both leading spaces on the rendered page; the three queries of the
// criteria are typed for real into the live search of section 13, put on the group page of day 24, and the number of
// students left visible must be the one the criteria name.
//   node tools/runs/essentials/day-28.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    await p.goto(`${ROOT}day-28/${sub}lecture.html`);
    const L = await p.evaluate(() => {
      const box = [...document.querySelectorAll('.mistake')].find((m) => m.textContent.includes('textContent')).innerText.replace(/\s+/g, ' ');
      const blocks = [];
      for (let el = document.querySelector('#live').nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) if (el.matches('pre.code')) blocks.push(el.textContent);
      return { box, html: blocks[0], js: blocks[1] };
    });
    check(/(дня|day) 25/.test(L.box) && !/[Вв]чера|yesterday/.test(L.box), `the habit is from day 25: ${L.box.slice(-70)}`);
    await p.goto(`${ROOT}day-25/${sub}lecture.html`);
    check(await p.evaluate(() => !!document.querySelector('#text') && document.querySelector('#text').textContent.includes('textContent')), 'day 25 has the section about textContent');

    await p.goto(`${ROOT}day-28/${sub}student.html`);
    const cols = await p.evaluate(() => {
      const pre = [...document.querySelectorAll('pre.code')].find((x) => x.textContent.includes('// 4.'));
      return pre.innerText.split('\n').filter((l) => /\/\/ {1,4}\S/.test(l)).map((l) => [l.indexOf('//'), l.trim().slice(0, 30)]);
    });
    check(new Set(cols.map(([c]) => c)).size === 1, `notes: comment columns ${cols.map(([c]) => c).join(', ')}`);

    await p.goto(`${ROOT}day-28/${sub}tasks.html`);
    const crit = await p.evaluate(() => [...document.querySelectorAll('.criteria li')].map((li) => li.innerText).find((t) => /МЕРЕТ|MERET/.test(t)));
    // «а» оставляет четверых, «ман» — одного, «  МЕРЕТ» — Мерет
    const queries = [...crit.matchAll(/[«“]([^»”]+)[»”] (?:— |оставляет |leaves )(\S+)/g)].map((m) => [m[1].replace(/ /g, ' '), m[2].replace(/[;,]$/, '')]);
    check(queries.length === 3, `task 6: three queries in the criteria: ${queries.map(([q]) => JSON.stringify(q)).join(', ')}`);
    check(/[«“]\s{2}(МЕРЕТ|MERET)/.test(crit.replace(/ /g, ' ')), `task 6: the rendered criteria keep two spaces: ${JSON.stringify(crit)}`);

    // the group page of day 24 with the search of section 13 above the list
    await p.goto(`${ROOT}day-24/${sub}lecture.html`);
    const group = await p.evaluate(() => [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.includes('<ul id="list">') && x.includes('</html>')));
    const page = group.replace('<ul id="list">', L.html + '\n    <ul id="list">').replace('</body>', `<script>\n${L.js}\n</script>\n</body>`);
    await p.setContent(page);
    const words = { 'four': 4, 'четверых': 4, 'one': 1, 'одного': 1 };
    for (const [q, want] of queries) {
      await p.fill('#search', '');
      await p.type('#search', q);
      const shown = await p.evaluate(() => [...document.querySelectorAll('#list li')].filter((li) => !li.hidden).map((li) => li.textContent));
      const ok = words[want] ? shown.length === words[want] : shown.length === 1 && shown[0] === want;
      check(ok, `typed ${JSON.stringify(q)}: shown ${shown.join(', ')} (criteria: ${want})`);
    }
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
