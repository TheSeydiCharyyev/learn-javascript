// Day 13, RU and EN, in Chrome.
// Section 4: the commented line `const add = n, m => n + m;` is run as a real <script>; the error message must be the
// one written next to it, and the name V8 points at (error column) must be the one the explanation below blames.
// Section 14: the "Report card" program is taken from the page and run, its output is compared with the result-box;
// the numbers must be the same as in the result-box of day 12, and the word that left the line is named in the text;
// the comment above `average` must describe what the code does (a line break after the arrow).
// Section 11 (fixed 13.10.2026): the object with sayNormal and sayArrow runs as a page <script>; both results must be
// the quoted values of their comments — the arrow gets the window, whose name is an empty string, not undefined.
//   node tools/runs/essentials/day-13.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/').replace(/\\/g, '/');
const WORD = { 'ru/': 'оценок', 'en/': 'marks' };
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const report = async (day, sub) => {
    await p.goto(`${ROOT}day-${day}/${sub}lecture.html`);
    return p.evaluate(() => {
      const h = document.querySelector('#tabel');
      let el = h.nextElementSibling;
      while (el && !el.matches('pre.code')) el = el.nextElementSibling;
      const box = el.nextElementSibling;
      const after = box.nextElementSibling;
      return { code: el.textContent, box: box.innerText.split('\n').map((s) => s.trim()).filter(Boolean), after: after.textContent.replace(/\s+/g, ' ') };
    });
  };
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    await p.goto(`${ROOT}day-13/${sub}lecture.html`);
    const s4 = await p.evaluate(() => {
      const pre = [...document.querySelectorAll('#short ~ pre.code')].find((x) => x.textContent.includes('const add = n, m'));
      let ex = pre.nextElementSibling;
      return { line: pre.textContent.split('\n')[0], explain: ex.innerHTML.replace(/\s+/g, ' ') };
    });
    const m = s4.line.match(/^\/\/ (.*?;)\s+→ (SyntaxError: .*)$/);
    // the line goes into the markup of a page, as a student would write it; the error event gives message and column
    const probe = await b.newPage();
    await probe.goto('data:text/html,' + encodeURIComponent(
      '<script>window.__e = []; addEventListener("error", (e) => __e.push([e.message, e.colno]));</script>'
      + `<script>\n${m[1]}\n</script>`));   // the code on a line of its own: the column counts from its start
    const err = (await probe.evaluate(() => window.__e))[0];
    await probe.close();
    const message = err[0].replace(/^Uncaught /, '');
    const name = m[1].slice(err[1] - 1).match(/^\w+/)[0];
    console.log(`section 4: ${m[1]} → ${message}, column ${err[1]} is "${name}"`);
    check(message === m[2], `the message on the page is the one Chrome gives: ${m[2]}`);
    check(s4.explain.includes(`<code>${name}</code>`) && !/не объявлена|not declared/.test(s4.explain), `the explanation blames ${name}: ${s4.explain.replace(/<[^>]+>/g, '').slice(-90)}`);

    // section 11: the arrow method reads this.name of the window
    const s11 = await p.evaluate(() => [...document.querySelectorAll('#this ~ pre.code')]
      .map((x) => x.textContent).find((t) => t.includes('sayArrow') && t.includes('${this.name}')));
    const said = (key) => s11.split('\n').find((l) => l.includes(key)).match(/\/\/ ("[^"]*")/)[1];
    const probe11 = await b.newPage();
    await probe11.goto('data:text/html,' + encodeURIComponent('<meta charset="utf-8"><script>\n' + s11
      + '\nwindow.__r = [JSON.stringify(student.sayNormal()), JSON.stringify(student.sayArrow())];\n</script>'));
    const got11 = await probe11.evaluate(() => window.__r);
    await probe11.close();
    check(got11[0] === said('sayNormal'), `section 11: sayNormal() = ${got11[0]}, comment ${said('sayNormal')}`);
    check(got11[1] === said('sayArrow'), `section 11: sayArrow() = ${got11[1]}, comment ${said('sayArrow')}`);

    const r13 = await report('13', sub);
    const r12 = await report('12', sub);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Runtime.enable');
    const lines = [];
    cdp.on('Runtime.consoleAPICalled', (e) => lines.push(e.args.map((a) => a.value).join(' ')));
    await cdp.send('Runtime.evaluate', { expression: r13.code });
    await p.waitForTimeout(200);
    await cdp.detach();
    lines.forEach((l, i) => check(l === r13.box[i], `chrome = box: ${l}`));
    check(lines.length === r13.box.length, `lines: chrome ${lines.length}, box ${r13.box.length}`);
    const nums = (s) => (s.match(/\d+(\.\d+)?/g) || []).join(' ');
    r12.box.forEach((l, i) => check(nums(l) === nums(r13.box[i]), `numbers of day 12 = day 13: ${nums(l)}`));
    const gone = r12.box.every((l) => l.includes(WORD[lang])) && r13.box.every((l) => !l.includes(WORD[lang]));
    check(gone && r13.after.includes(WORD[lang]), `the word "${WORD[lang]}" left the line and the text says so: ${r13.after}`);
    const code = r13.code.split('\n');
    const i = code.findIndex((l) => l.startsWith('const average'));
    check(/перенос после стрелки|line break after the arrow/.test(code[i - 1]) && code[i].trim().endsWith('=>'), `comment above average: ${code[i - 1]} | next line ends with =>`);
  }
  console.log(`\nerrors: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
