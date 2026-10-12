// Day 29, section 8 "Add a task", RU and EN, in Chrome. The to-do app is put together from the blocks of the lecture
// (sections 4–8: data, markup, elements, makeItem, render, the submit listener) and a task is added through the form
// for real (typed, Enter). The console lines under the section must give what their comments say. The sentence about
// what is new must place the two new lines (tasks.push and nextId++) where they are: in the middle of the listener.
//   node tools/runs/essentials/day-29.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-29/').replace(/\\/g, '/');
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
    const L = await p.evaluate(() => {
      const bySection = {};
      let sec = null;
      for (const el of document.querySelectorAll('h2[id], pre.code')) {
        if (el.tagName === 'H2') { sec = el.id; bySection[sec] = []; continue; }
        if (sec) bySection[sec].push({ kind: el.className, code: el.textContent });
      }
      const sentence = [...document.querySelectorAll('#add ~ p')][0].textContent.replace(/\s+/g, ' ');
      return { bySection, sentence };
    });
    const S = L.bySection;
    const listener = S.add[0].code;
    const html = S.markup.find((x) => x.kind === 'code html').code;
    const js = [S.data[0].code, S.markup.find((x) => x.code.startsWith('const form')).code, S.item[0].code, S.render[0].code, listener, 'render();'].join('\n\n');
    // the page of the lecture; app.js (loaded with defer from <head>) becomes an inline script at the end of <body>,
    // which runs at the same moment: after the markup is parsed
    const page = html.replace(/\s*<script[^>]*src="[^"]*"[^>]*><\/script>/, '').replace('</body>', `<script>\n${js}\n</script>\n</body>`);
    check(page !== html && !/src="app\.js"/.test(page), 'app.js is replaced by the program inline');
    await p.setContent(page);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Runtime.enable');
    // a line typed into the console: global scope, the value shown the way the lecture writes it
    const consoleLine = async (c) => {
      const r = await cdp.send('Runtime.evaluate', { expression: c, replMode: true, returnByValue: true });
      if (r.exceptionDetails) return 'THROWS ' + r.exceptionDetails.exception.description.split('\n')[0];
      const v = r.result.value;
      return v && typeof v === 'object' ? '{' + Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'string' ? `'${x}'` : x}`).join(', ') + '}' : String(v);
    };

    const example = S.add[1].code.split('\n');
    const typed = example[0].match(/[«“]([^»”]+)[»”]/)[1];
    await p.fill('form input[name="text"]', '');
    await p.type('form input[name="text"]', typed);
    await p.press('form input[name="text"]', 'Enter');
    await p.waitForTimeout(100);
    for (const l of example.slice(1)) {
      const code = l.slice(0, l.indexOf('//')).trim();
      const said = l.slice(l.indexOf('//') + 3).trim();
      const got = await consoleLine(code);
      check(got === said, `typed "${typed}", Enter → ${code} ${got} (comment: ${said})`);
    }
    // the two new lines and where they are in the listener body
    const body = listener.split('\n').slice(1, -1).map((l) => l.trim()).filter(Boolean);
    const i = body.findIndex((l) => l.startsWith('tasks.push('));
    const middle = i > 0 && body[i + 1] === 'nextId++;' && i + 2 < body.length;
    check(middle && /в середине|in the middle/.test(L.sentence) && !/последние|last two/.test(L.sentence),
      `tasks.push and nextId++ are lines ${i + 1}–${i + 2} of ${body.length}: "${L.sentence.match(/(Новое|What is new)[^:]*/)[0]}"`);
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
