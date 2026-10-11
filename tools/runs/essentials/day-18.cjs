// Day 18, RU and EN, in Chrome.
// Section 15: the "Report card" program is taken from the page and run, its output is compared with the result-box.
// Experiment 3 on the program's data: the spread (max - min of the valid marks) of every student; nobody has zero,
// so the text must not ask who has it at zero; the one with the largest spread must be a single student.
// Scheme "Math.random → a die": every step label (x=14) must end at least 6 px before the outer edge of the stroke
// of the bar or cells on its row.
//   node tools/runs/essentials/day-18.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-18/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const page = await p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      const box = el.nextElementSibling;
      let t = box;
      while (t && !t.matches('.try-it')) t = t.nextElementSibling;
      return { code: el.textContent, box: box.innerText.split('\n').filter(Boolean), tryit: t.innerText.replace(/\s+/g, ' ') };
    });
    const calls = [...page.code.matchAll(/console\.log\(makeRow\(("[^"]*"), (.*)\)\);/g)].map((m) => `[${m[1]}, [${m[2]}]]`);
    const res = await p.evaluate(([code, calls]) => {
      const out = [];
      const log = console.log;
      console.log = (...a) => out.push(a.join(' '));
      let spreads;
      try {
        spreads = new Function(`${code}\nreturn [${calls.join(', ')}].map(([name, raw]) => {
          const valid = raw.map(toMark).filter(isValidMark);
          return [name, valid.length ? maxOf(valid) - minOf(valid) : null];
        });`)();
      } finally { console.log = log; }
      return { out, spreads };
    }, [page.code, calls]);
    res.out.forEach((l, i) => check(l === page.box[i], `chrome = box: ${l}`));
    console.log('     spreads: ' + res.spreads.map(([n, s]) => `${n} ${s === null ? '—' : s}`).join(', '));
    const values = res.spreads.map(([, s]) => s).filter((s) => s !== null);
    const max = Math.max(...values);
    const third = page.tryit.slice(page.tryit.search(/Третий|The third/));
    check(!values.includes(0) && !/У кого она нулевая|Who has it at zero/.test(third), `nobody has zero, and the text does not ask who: ${third}`);
    check(values.filter((s) => s === max).length === 1 && /больше всех|largest/.test(third), `one student has the largest spread (${res.spreads.find(([, s]) => s === max)[0]}, ${max})`);

    const gaps = await p.evaluate(() => {
      const svg = [...document.querySelectorAll('figure.scheme svg')].find((s) => s.textContent.includes('Math.random()'));
      const rects = [...svg.querySelectorAll('rect')].map((r) => ({ bb: r.getBBox(), sw: parseFloat(r.getAttribute('stroke-width') || 0) }));
      const texts = [...svg.querySelectorAll('text')];
      return texts.filter((t) => t.getAttribute('x') === '14').map((t) => {
        const bb = t.getBBox();
        const row = rects.filter((r) => r.bb.y < bb.y + bb.height && r.bb.y + r.bb.height > bb.y && r.bb.x > bb.x);
        const edge = row.length ? Math.min(...row.map((r) => r.bb.x - r.sw / 2)) : null;
        // a row without a bar (step 4): the next text on the row
        const next = texts.filter((o) => o !== t && Math.abs(o.getBBox().y - bb.y) < 4 && o.getBBox().x > bb.x).map((o) => o.getBBox().x);
        const right = edge ?? Math.min(...next);
        return [t.textContent, Math.round((right - bb.x - bb.width) * 10) / 10];
      });
    });
    for (const [label, gap] of gaps) check(gap >= 6, `scheme: "${label}" ends ${gap} px before the bar`);
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
