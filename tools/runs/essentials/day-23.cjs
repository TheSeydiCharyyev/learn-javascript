// Day 23, RU and EN, in Chrome.
// The MDN page about bad JSON: its title and the number of wordings quoted in section 8 are compared with the
// mdn/content source (the clone in tools/.cache of coverage-export; skipped if there is none).
// Section 8: every JSON.parse example runs, the message must be the one in its comment.
// Experiment 1 (the three breakages of `saved`) and task 3 (five broken strings) run too: where Chrome gives no
// position ("Unexpected token"), the texts must say what to write down instead.
//   node tools/runs/essentials/day-23.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ROOT = 'file:///' + path.join(__dirname, '../../../essentials/day-23/').replace(/\\/g, '/');
const MDN = path.join(__dirname, '../../.cache/mdn-content.git');
const NO_POSITION = { 'ru/': /позиции нет|позицию не называет/, 'en/': /no position|does not name\s+the position/ };
(async () => {
  let mdn = null;
  if (fs.existsSync(MDN)) {
    const src = execFileSync('git', ['--git-dir', MDN, 'show', 'HEAD:files/en-us/web/javascript/reference/errors/json_bad_parse/index.md'], { encoding: 'utf8' });
    mdn = { title: src.match(/^title: "(.*)"$/m)[1], count: src.split('\n').filter((l) => l.startsWith('SyntaxError: JSON.parse')).length };
    console.log(`MDN source: "${mdn.title}", ${mdn.count} wordings`);
  } else console.log('MDN source: no clone in tools/.cache, the title check is skipped');
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  let bad = 0;
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'BAD '} ${text}`); };
  const parse = (p, texts) => p.evaluate((ts) => ts.map((t) => { try { JSON.parse(t); return 'no error'; } catch (e) { return `${e.name}: ${e.message}`; } }), texts);
  for (const sub of ['', 'en/']) {
    const lang = sub || 'ru/';
    console.log(`\n=== ${lang}`);
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(ROOT + sub + 'lecture.html');
    const L = await p.evaluate(() => {
      const box = [...document.querySelectorAll('#parse-errors ~ .mistake')][0].innerText.replace(/\s+/g, ' ');
      const s8 = [];
      for (let el = document.querySelector('#parse-errors').nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) if (el.matches('pre.code')) s8.push(el.textContent);
      const code = [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.includes('const saved = `['));
      const tryit = [...document.querySelectorAll('.try-it')].find((t) => t.textContent.includes('saved')).innerText.replace(/\s+/g, ' ');
      return { box, s8, saved: code.slice(code.indexOf('`') + 1, code.indexOf('`', code.indexOf('`') + 1)), tryit };
    });
    if (mdn) {
      check(L.box.includes(mdn.title), `the title quoted for MDN is "${mdn.title}"`);
      check(L.box.includes(`${mdn.count} `), `the number of wordings is ${mdn.count}`);
    }
    // section 8: each JSON.parse line and the comment right under it
    for (const block of L.s8.filter((x) => x.includes('JSON.parse('))) {
      const lines = block.split('\n');
      // only calls with a string literal: JSON.parse("…"); or JSON.parse('…');
      const pairs = lines.map((l, i) => [l, lines[i + 1]]).filter(([l, c]) => /^JSON\.parse\((["']).*\1\);$/.test(l) && c && c.startsWith('// '));
      const got = await parse(p, pairs.map(([l]) => new Function(`return ${l.slice('JSON.parse('.length, l.lastIndexOf(')'))};`)()));
      pairs.forEach(([l, c], i) => check(c.slice(3) === got[i], `section 8: ${l} → ${got[i]}`));
    }
    // experiment 1
    const key = L.saved.match(/"(\w+)":/)[1];
    const e1 = await parse(p, [L.saved.replace(`"${key}":`, `${key}:`), L.saved.replace(`"${key}":`, `'${key}':`), L.saved.replace(/\}\s*\]\s*$/, '},\n]')]);
    e1.forEach((m, i) => console.log(`     experiment 1, way ${i + 1}: ${m.replace(/\n/g, ' ')}`));
    const noPos = e1.some((m) => !m.includes('position'));
    check(!noPos || (NO_POSITION[lang].test(L.tryit) && /Unexpected token/.test(L.box)), 'experiment 1: a way without a position is covered by the try-it text and the mistake box');
    // task 3
    await p.goto(ROOT + sub + 'tasks.html');
    const T = await p.evaluate(() => {
      const code = [...document.querySelectorAll('pre.code')].map((x) => x.textContent).find((x) => x.startsWith('const broken = ['));
      const task = [...document.querySelectorAll('.task')].find((t) => t.textContent.includes('const broken'));
      return { strings: new Function(code + '\nreturn broken;')(), criteria: task.querySelector('.criteria').innerText.replace(/\s+/g, ' ') };
    });
    const t3 = await parse(p, T.strings);
    t3.forEach((m, i) => console.log(`     task 3, line ${i + 1}: ${m}`));
    check(t3.every((m) => m.includes('position')) || NO_POSITION[lang].test(T.criteria), `task 3: lines without a position are covered by the criteria: ${T.criteria}`);
    // notes
    await p.goto(ROOT + sub + 'student.html');
    const remember = await p.evaluate(() => [...document.querySelectorAll('.remember')].map((x) => x.innerText).find((x) => /MDN/.test(x)).replace(/\s+/g, ' '));
    check(/Unexpected token/.test(remember), `notes: ${remember}`);
    console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    await p.close();
  }
  console.log(bad ? `\nPROBLEMS ${bad}` : '\nall match');
  await b.close();
})();
