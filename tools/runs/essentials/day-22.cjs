// Day 22, RU and EN, in Chrome.
// Section 15: the "Report card" program is taken from the page and run, its output is compared with the result-box.
// The error text the section quotes for makeRow() without "= {}" (a pattern with defaults) must be the one Chrome gives;
// so must the section 9 text for `const { z } = undefined;` and the start of the self-check text for a pattern without
// defaults. Experiment 3 is done with the copy written in its text: a name changed in the copy must not reach the
// original, a mark changed in the copy must — that is why "the results are different".
//   node tools/runs/essentials/day-22.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-22/').replace(/\\/g, '/');
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
    await p.goto(ROOT + sub + 'lecture.html');
    const page = await p.evaluate(() => {
      const blocks = [];
      let box = null, guard = null, tryit = null;
      for (let el = document.querySelector('#tabel').nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
        if (el.matches('pre.code')) blocks.push(el.textContent);
        if (el.matches('.result-box') && !box) box = el.innerText.split('\n').filter(Boolean);
        if (el.matches('p') && el.textContent.includes('= {}') && el.querySelector('code + code, code')) guard = guard || el;
        if (el.matches('.try-it')) tryit = el;
      }
      const third = [...tryit.querySelectorAll('strong')].find((s) => /Третий|The third/.test(s.textContent));
      let copy = null;
      for (let n = third.nextSibling; n && !copy; n = n.nextSibling) if (n.nodeName === 'CODE') copy = n.textContent;
      const s9 = [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.startsWith('const { z } = undefined;'));
      const self = [...document.querySelectorAll('.selfcheck li')].find((li) => li.textContent.includes('makeRow({ name } = {})'));
      return { program: blocks[1], box, guard: guard.textContent.replace(/\s+/g, ' '),
        guardCode: [...guard.querySelectorAll('code')].map((c) => c.textContent).find((t) => t.startsWith('TypeError')),
        copy, s9, self: [...self.querySelectorAll('code')].map((c) => c.textContent).find((t) => t.startsWith('TypeError')) };
    });
    const r = await p.evaluate(([src, copyOf, s9]) => {
      const out = [];
      const log = console.log;
      console.log = (...a) => out.push(a.join(' '));
      try { new Function(src)(); } finally { console.log = log; }
      const body = src.replace(/\nconsole\.log[\s\S]*$/, '');
      const err = (code) => { try { new Function(code)(); return 'no error'; } catch (e) { return `${e.name}: ${e.message}`; } };
      const copy = (expr) => new Function(body + `
        const original = students[0].name, mark = students[0].marks[0];
        const copy = ${expr};
        copy[0].name = "X";
        const nameReached = students[0].name !== original;
        copy[0].marks[0] = 2;
        return { nameReached, markReached: students[0].marks[0] !== mark };`)();
      return {
        out,
        noGuard: err(body.replace('} = {}) {', '}) {') + '\nmakeRow();'),
        s9: err(s9.split('\n')[0]),
        plain: err('function makeRow({ name }) { return name; }\nmakeRow();'),
        page: copy(copyOf), spread: copy('[...students]'),
      };
    }, [page.program, page.copy, page.s9]);
    r.out.forEach((l, i) => check(l === page.box[i], `chrome = box: ${l}`));
    check(r.noGuard === page.guardCode, `section 15, makeRow() without "= {}": chrome "${r.noGuard}", page "${page.guardCode}"`);
    check(page.s9.includes('// ' + r.s9), `section 9, const { z } = undefined: chrome "${r.s9}"`);
    check(r.plain.startsWith(page.self.replace(/\.\.\.$/, '')), `self-check, a pattern without defaults: chrome "${r.plain}", page "${page.self}"`);
    console.log(`     experiment 3 with ${page.copy}: name reaches the original ${r.page.nameReached}, mark ${r.page.markReached}; with [...students]: name ${r.spread.nameReached}, mark ${r.spread.markReached}`);
    check(!r.page.nameReached && r.page.markReached, 'experiment 3: the name stays, the mark changes in the original — the results are different');
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
