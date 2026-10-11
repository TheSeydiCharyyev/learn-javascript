// Day 35: the "Word cards" polishing on a real page served by Live Server, in a 360-wide phone context
// (isMobile, touch). index.html and app.js are built step by step from the day 33/34 programs and the blocks of the
// day 35 lecture; clicks, taps, dialogs, reloads and broken files are real. Errors, asserts and browser messages are caught.
//   node tools/runs/essentials/day-35-cards.cjs <day-33 lecture> <day-34 lecture> <day-35 lecture> <day-35 student> <day-35 tasks>
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const LiveServer = require('live-server');
const dec = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
const blocks = (f, kind) => [...fs.readFileSync(f, 'utf8').matchAll(new RegExp(`<pre class="${kind}">([\\s\\S]*?)<\\/pre>`, 'g'))].map((m) => dec(m[1]));
const must = (s, from, to) => { if (!s.includes(from)) throw new Error('not found: ' + from.slice(0, 80)); return s.replace(from, to); };
const line = (code, n) => code.split('\n')[n - 1];
const noComment = (l) => l.replace(/\s*\/\/.*$/, '');
const fnText = (src, head) => { const s = src.indexOf(head); if (s < 0) throw new Error('no ' + head); const e = src.indexOf('\n}', s); return src.slice(s, e + 2); };
const [p33, p34, pl, ps, pt] = process.argv.slice(2);
const A = blocks(p33, 'code js'), B = blocks(p34, 'code js');
const J = blocks(pl, 'code js'), H = blocks(pl, 'code html'), SJ = blocks(ps, 'code js'), TJ = blocks(pt, 'code js');
const lectureHtml = fs.readFileSync(pl, 'utf8');

// day 33/34: the starting point
const FRAME33 = blocks(p33, 'code html')[0];
const WORDS = A[0], TESTDECK = A[19], PLAN = A[28];
const WHOLE34 = B[29].split('\n').map((l) => (/^\/\/ 5\. /.test(l) ? TESTDECK + '\n\n' + B[11] : l)).join('\n');
// section 4: the long test word from the lecture text
const TEST = dec(lectureHtml.match(/<code>(\{ "id": 8,[^<]*)<\/code>/)[1]);
const WORDS_LONG = WORDS.split('\n').map((l) => (l.includes('"id": 8') ? '  ' + TEST : l)).join('\n');
const WORDS_COMMA = WORDS.replace(/\}\n\]$/, '},\n]');

// the page, step by step
const VIEWPORT = line(H[0], 2);
const F3 = must(FRAME33, '<meta charset="UTF-8">', '<meta charset="UTF-8">\n  ' + VIEWPORT);
const F4a = must(F3, '  </style>', '  ' + line(H[1], 2).trim().replace(/^/, '  ') + '\n  </style>');
const F4b = must(F4a, 'cursor: pointer; }', 'cursor: pointer; overflow-wrap: anywhere; }');
const F35 = H[4];

// the program, step by step
const READ = J[8];
const APP6 = must(must(WHOLE34, 'const KEY = "cards:learned";\n', 'const KEY = "cards:learned";\n\n' + READ + '\n\n'),
  'let learned = JSON.parse(localStorage.getItem(KEY)) ?? [];', noComment(J[9]));
const THROW_EMPTY = line(J[13], 2);
const APP7 = [
  [/  console\.assert\(words\.length > 0, [^\n]*\n/, ''],
  ['    words = await response.json();\n', '    words = await response.json();\n    ' + THROW_EMPTY + '\n'],
  ['    checkData();\n', '    checkData();\n    ' + noComment(J[11]) + '\n'],
  ['    render();\n  } catch', '    render();\n    trainer.hidden = false;\n  } catch'],
  ['const topics = document.querySelector(".topics");', 'const trainer = document.querySelector("#trainer");\nconst topics = document.querySelector(".topics");'],
].reduce((s, [a, b]) => { if (typeof a === 'string') return must(s, a, b); if (!a.test(s)) throw new Error('no ' + a); return s.replace(a, b); }, APP6);
const SHUFFLE = J[21];
const APP10a = must(APP7, '// 4. ', SHUFFLE + '\n\n// 4. ');
const APP10b = must(APP10a, '    makeTopicButtons();\n', '    makeTopicButtons();\n    ' + line(J[24], 2) + '\n');
const OLD_TC = B[11], NEW_TC = J[26];
const APP10c = must(APP10b, OLD_TC, NEW_TC);
// section 11: the whole program with its "unchanged" lines filled in
const APP11 = J[28].split('\n').map((l) => {
  if (/^\/\/ deck, current, makeTopicButtons, render/.test(l)) return ['function deck()', 'function current()', 'function makeTopicButtons()', 'function render()'].map((h) => fnText(WHOLE34, h)).join('\n\n');
  if (/^\/\/ 5\. /.test(l)) return TESTDECK + '\n\n' + NEW_TC;
  if (/^\/\/ 6\. /.test(l)) return WHOLE34.slice(WHOLE34.indexOf('// 6. '));
  return l;
}).join('\n');
// section 8: the neighbor's variant of the day 34 program
const NEIGHBOR = must(must(must(WHOLE34, 'let learned = JSON.parse(localStorage.getItem(KEY)) ?? [];', noComment(J[15])), fnText(WHOLE34, 'function render()'), J[16]),
  fnText(WHOLE34, 'knowButton.addEventListener').replace(/\n}$/, '\n});').replace(/\n}\);\);$/, '\n});'), J[17]).replace(/\brender\(\);/g, 'f();');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards35-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const del = (rel) => fs.rmSync(path.join(root, rel), { force: true });

const stmts = (code) => {
  const ls = code.split('\n'); const out = [];
  ls.forEach((l, i) => {
    if (!l.trim() || l.trim().startsWith('//')) return;
    const m = l.match(/^(.*?;)\s*(\/\/.*)?$/);
    let claim = m && m[2] ? m[2] : '';
    if (!claim && ls[i + 1] && ls[i + 1].trim().startsWith('//')) claim = ls[i + 1].trim();
    out.push({ k: i + 1, code: m ? m[1] : l, claim });
  });
  return out;
};
const FMT = `function () {
  const fmt = (v, d) => {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v !== 'object') return String(v);
    if (v instanceof Element) return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + '>';
    if (d > 3) return '...';
    if (Array.isArray(v)) return '[' + v.map((x) => fmt(x, d + 1)).join(', ') + ']';
    return '{' + Object.entries(v).map(([k, x]) => k + ': ' + fmt(x, d + 1)).join(', ') + '}';
  };
  return fmt(this, 0);
}`;

(async () => {
  await new Promise((r) => LiveServer.start({ port: 5500, host: '127.0.0.1', root, open: false, logLevel: 0, wait: 50 }).on('listening', r));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const PHONE = { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
  let ctx, pg, cdp, logs = [], answer = true, delay = 0;
  const C = 'http://127.0.0.1:5500/cards/index.html';
  const settle = async () => { await pg.waitForFunction(() => document.querySelector('#loading') && document.querySelector('#loading').hidden, null, { timeout: 1500 }).catch(() => {}); await pg.waitForTimeout(80); };
  const attach = async () => {
    pg = await ctx.newPage(); cdp = await ctx.newCDPSession(pg); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => logs.push(e.type === 'assert' ? 'Assertion failed: ' + e.args.map((x) => x.value).join(' ') : e.args.map((x) => x.value ?? x.description).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => { const d = (e.exceptionDetails.exception?.description || '').split('\n'); logs.push(`[${e.exceptionDetails.text}] ${d[0]}${d.length > 1 ? ' {stack: ' + d.slice(1, 3).map((s) => s.trim().replace('http://127.0.0.1:5500/cards/', '')).join(' / ') + '}' : ''}`); });
    cdp.on('Log.entryAdded', (e) => { if (!/favicon/.test(e.entry.url || '')) logs.push(`[browser] ${e.entry.text}`); });
    pg.on('dialog', async (d) => { logs.push(`[${d.type()}] ${d.message()} -> ${answer ? 'OK' : 'Cancel'}`); if (answer) await d.accept(); else await d.dismiss(); });
    await pg.route('**/words.json', async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); await route.continue(); });
  };
  const fresh = async (frame, app, words = WORDS) => {
    if (ctx) await ctx.close();
    put('cards/index.html', frame); put('cards/app.js', app); if (words === null) del('cards/words.json'); else put('cards/words.json', words);
    await new Promise((r) => setTimeout(r, 250));
    ctx = await browser.newContext(PHONE); await attach(); await pg.goto(C); await settle();
  };
  const files = async (words) => { if (words === null) del('cards/words.json'); else put('cards/words.json', words); await new Promise((r) => setTimeout(r, 250)); };
  const reload = async () => { await pg.reload(); await settle(); };
  const flush = () => { const v = logs.splice(0).filter((t) => !/Live reload|favicon/.test(t)); return v.length ? '   log: ' + v.join(' | ') : ''; };
  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true, returnByValue: false });
    if (r.exceptionDetails) return 'THROWS ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0];
    const o = r.result;
    if (o.type === 'undefined') return 'undefined';
    if (o.subtype === 'null') return 'null';
    if (o.type === 'string') return JSON.stringify(o.value);
    if (o.type === 'function') return 'function';
    if (o.type !== 'object') return String(o.value ?? o.unserializableValue);
    const f = await cdp.send('Runtime.callFunctionOn', { functionDeclaration: FMT, objectId: o.objectId, returnByValue: true });
    return f.result.value;
  };
  const say = async (label, code) => { const r = await ev(code); await pg.waitForTimeout(60); console.log(`  ${label} → ${r}${flush()}`); };
  const lines = async (code, tag, only) => {
    for (const x of stmts(code).filter((x) => !only || only.includes(x.k))) {
      const r = await ev(x.code); await pg.waitForTimeout(60);
      console.log(`  ${tag}.${x.k} ${x.code} → ${r}${flush()}${x.claim ? '      ' + x.claim : ''}`);
    }
  };
  // what a person sees; built from the DOM only, so it works even when app.js crashed
  const SEE = `(() => { const q = (s) => document.querySelector(s); const vis = (e) => !!e && e.offsetParent !== null;
    return [vis(q("#loading")) ? q("#loading").textContent : "-", q("#error").textContent || "-",
      q("#trainer") ? (q("#trainer").hidden ? "trainer hidden" : "trainer shown") : "no trainer",
      vis(q("#card")) ? "card " + JSON.stringify(q("#card").textContent) : "no card",
      [...document.querySelectorAll("button")].filter(vis).map((b) => b.textContent).join("|") || "no buttons",
      vis(q("#counter")) ? q("#counter").textContent : "-", (q(".topics .active") || {}).textContent || "-"]; })()`;
  const see = async (label) => say(label.padEnd(30), SEE);
  const click = async (sel, times = 1) => { for (let i = 0; i < times; i++) { await pg.click(sel, { timeout: 2000 }); await pg.waitForTimeout(40); } };
  const tap = async (sel, times = 1) => { for (let i = 0; i < times; i++) { await pg.tap(sel, { timeout: 2000 }); await pg.waitForTimeout(40); } };
  const topicBtn = (n) => `.topics button:nth-child(${n})`;
  const scene = (n) => console.log(`\n=== ${n}`);
  // the text of the card against its frame: how far the text goes past the inner edge of the right border
  const FIT = `(() => { const c = document.querySelector("#card"); const r = document.createRange(); r.selectNodeContents(c);
    const t = r.getBoundingClientRect(), b = c.getBoundingClientRect(), cs = getComputedStyle(c);
    return [c.textContent, Math.round(t.width) + "px wide", "past the border " + Math.round(t.right - (b.right - parseFloat(cs.borderRightWidth))), Math.round(t.height / parseFloat(cs.fontSize) / 1.15) + " line(s)", "page " + document.documentElement.scrollWidth]; })()`;

  console.log('setup: test word ' + TEST + '; frame 35 has viewport, button rule, overflow-wrap, trainer: ' +
    [VIEWPORT, line(H[1], 2).trim(), 'overflow-wrap: anywhere', '<div id="trainer" hidden>'].every((s) => F35.includes(s)) +
    '; trainer block = section 7: ' + (F35.replace(/^ {2}/gm, '').includes(H[3]) || F35.includes(H[3].split('\n').map((l) => '  ' + l).join('\n'))));

  scene('1 the plan of day 35'); await fresh(F3, WHOLE34); await say('var plan', PLAN.replace(/^const plan/, 'var plan')); await lines(J[0], '#1');

  scene('3 viewport'); await fresh(FRAME33, WHOLE34); await lines(J[1], '#2'); await say('980 / 360', '(980 / 360).toFixed(2)');
  await fresh(F3, WHOLE34); await lines(J[2], '#3');

  scene('4 buttons and the long word');
  const GAP = 'Math.round(document.querySelector("#again").getBoundingClientRect().left - document.querySelector("#know").getBoundingClientRect().right)';
  await lines(J[3], '#4'); await say('gap between I know and Again', GAP);
  await fresh(F4a, WHOLE34); await lines(J[4], '#5'); await say('gap between I know and Again', GAP);
  await say('heights of all buttons', '[...document.querySelectorAll("button")].map((b) => b.textContent + " " + b.offsetHeight)');
  await fresh(F4a, WHOLE34, WORDS_LONG); await ev('position = 7; flipped = false; render();'); await say('long word, without overflow-wrap', FIT);
  await ev('flipped = true; render();'); await say('its translation, without overflow-wrap', FIT);
  await fresh(F4b, WHOLE34, WORDS_LONG); await ev('position = 7; flipped = true; render();'); await say('the translation, overflow-wrap: anywhere', FIT);
  await ev('position = 0; flipped = false; render();'); await say('a short word, overflow-wrap: anywhere', FIT);

  scene('5 edge cases (the day 34 program)'); await fresh(F4b, WHOLE34); await see('opened, normal');
  for (const k of [1, 2, 3]) { await lines(J[5], '#6', [k]); await reload(); await see('reloaded'); }
  await ev('localStorage.clear()'); await files(null); await reload(); await see('no words.json');
  await click('#again'); await see('then a click on Again');
  await files('[]'); await reload(); await see('words.json is []');
  await files(WORDS_COMMA); await reload(); await see('an extra comma');
  await files(WORDS);

  scene('6 walkthrough: broken storage'); await ev('localStorage.setItem("cards:learned", "[object Object]")'); await reload(); await see('reloaded with [object Object]');
  await lines(J[7], '#8');
  await fresh(F4b, APP6); await ev('localStorage.setItem("cards:learned", "[object Object]")'); await reload(); await lines(J[10], '#11', [2]); await see('the page');
  await ev('localStorage.setItem("cards:learned", "5")'); await reload(); await say('with "5"', '[learned, localStorage.getItem("cards:learned")]'); await see('the page');
  await ev('localStorage.clear()'); await reload(); await say('without the key', '[learned, JSON.parse(null)]');

  scene('7 data is checked at the entrance'); await fresh(F35, APP7); await see('opened');
  await ev('localStorage.setItem("cards:learned", "[1, 2, 3, 4, 5, 6, 7, 8, 99]")'); await reload(); await lines(J[12], '#13');
  for (const [label, val] of [['[object Object]', '[object Object]'], ['5', '5']]) { await ev(`localStorage.setItem("cards:learned", ${JSON.stringify(val)})`); await reload(); await see(label); await say('  storage', 'localStorage.getItem("cards:learned")'); }
  await ev('localStorage.setItem("cards:learned", "[1, 2, 3, 4, 5, 6, 7, 8, 99]")'); await reload(); await see('number 99');
  await ev('localStorage.clear()'); await files(null); await reload(); await see('no words.json');
  await files('[]'); await reload(); await see('empty []');
  await files(WORDS_COMMA); await reload(); await see('an extra comma');
  await files(WORDS);

  scene('8 the neighbor'); await fresh(F4b, NEIGHBOR); await see('opened');
  await click(topicBtn(4)); await see('topic 4'); await click('#know', 2); await lines(J[18], '#19'); await lines(J[19], '#20');
  await click('#know'); await see('I know on the learned topic');
  await lines(J[20], '#21');
  answer = true; await click('#reset'); await see('Start over, OK'); await say('storage after the reset', '[localStorage.getItem("learned"), localStorage.getItem("cards:learned")]');
  await click('#know'); await reload(); await see('I know, reloaded'); await say('learned after the reload', 'learned');

  scene('10 shuffle'); await fresh(F35, APP10a); await lines(J[22], '#23');
  await say('count', J[23].split('\n').slice(0, 8).join('\n').replace('function count', 'var count = function'));
  for (let k = 0; k < 3; k++) await lines(J[23], '#24 run ' + (k + 1), [9, 10]);
  await fresh(F35, APP10b);
  for (let k = 0; k < 6; k++) { const first = await ev('words[0].word'); if (first !== '"book"') break; await reload(); }
  await say('words after the load', 'words.map((w) => w.word)'); await lines(J[25], '#26');
  await fresh(F35, APP10c);
  for (let k = 0; k < 5; k++) { await say(`reload ${k + 1}: ids, topic buttons`, '[words.map((w) => w.id).join(""), [...topics.children].map((b) => b.textContent).join(" ")]'); await lines(J[27], '#28'); await reload(); }

  scene('11 the whole program'); console.log('  APP11 = APP10c (whitespace aside): ' + (APP11.replace(/\s+/g, ' ').length === APP10c.replace(/\s+/g, ' ').length) + ', same functions: ' +
    ['function readLearned()', 'function checkData()', 'function shuffle(list)', 'async function load()', 'function testCurrent()'].map((h) => h + ' ' + (fnText(APP11, h).replace(/\s*\/\/[^\n]*/g, '').replace(/\s+/g, ' ') === fnText(APP10c, h).replace(/\s*\/\/[^\n]*/g, '').replace(/\s+/g, ' '))).join(', '));

  scene('12 the check on a phone (section 11 page and program)'); delay = 300; await fresh(F35, APP11); delay = 0;
  if (ctx) await ctx.close(); ctx = await browser.newContext(PHONE); await attach(); delay = 300; await pg.goto(C); await pg.waitForTimeout(100);
  await see('while loading'); await settle(); delay = 0; await see('opened'); await say('innerWidth, scrollWidth', '[innerWidth, document.documentElement.scrollWidth]');
  await tap('#card'); await see('tap on the card'); await tap('#card'); await see('one more tap');
  await tap(topicBtn(3)); await see('topic 3'); await tap('#know', 3); await see('I know three times');
  await reload(); await see('reloaded');
  await say('words of topic 3', 'words.filter((w) => w.topic === topics.children[2].dataset.topic).map((w) => w.word)');
  answer = true; await tap('#reset'); await see('Start over, OK');
  await ev('localStorage.setItem("cards:learned", "5")'); await reload(); await see('"5" in storage, reloaded');
  await say('heights of all buttons', '[...document.querySelectorAll("button")].map((b) => b.offsetHeight).join(" ")'); await say('innerWidth, scrollWidth', '[innerWidth, document.documentElement.scrollWidth]');
  await files(null); await reload(); await see('words.json renamed'); await files(WORDS);

  scene('13 plan and fact'); await reload(); await say('var plan', PLAN.replace(/^const plan/, 'var plan')); await lines(J[29], '#30');
  scene('14 the last check'); await reload(); await lines(J[30], '#31');
  scene('cheatsheet'); await lines(J[31], '#32', [3]);

  scene('notes');
  console.log('  notes readLearned = lecture (comments aside): ' + (fnText(SJ[0], 'function readLearned()').split('\n').map(noComment).join('\n') === READ));
  console.log('  notes loop = the loop of shuffle (comments aside): ' + SHUFFLE.includes(SJ[1].split('\n').map(noComment).map((l) => '  ' + l).join('\n')));
  console.log('  notes load lines = lecture: ' + [line(SJ[0], 11), line(SJ[0], 12), noComment(line(SJ[0], 13))].every((l, i) => [THROW_EMPTY, noComment(J[11]), 'trainer.hidden = false;'][i] === l));

  scene('tasks: task 3, five reloads'); await fresh(F35, APP11); const orders = new Set();
  for (let k = 0; k < 5; k++) { const o = await ev('words.map((w) => w.id).join("")'); orders.add(o); await say(`reload ${k + 1}`, '[words.map((w) => w.id).join(""), [...topics.children].map((b) => b.textContent).join(" ")]'); await reload(); }
  console.log('  different orders: ' + orders.size);
  scene('tasks: task 9, simpleShuffle'); await say('simpleShuffle and count', TJ[0].replace('function simpleShuffle', 'var simpleShuffle = function') + '\n' + J[23].split('\n').slice(0, 8).join('\n').replace('function count', 'var count = function') + '\n' + 'count(simpleShuffle)');
  await say('again', 'count(simpleShuffle)'); await say('shuffle', 'count(shuffle)');

  await browser.close(); LiveServer.shutdown(); fs.rmSync(root, { recursive: true, force: true });
  process.exit(0);
})();
