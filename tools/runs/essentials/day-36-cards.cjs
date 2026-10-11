// Day 36: the defense of the "Word cards". The day 35 page and program (built from the day 33/34/35 lectures) are served
// by Live Server on 0.0.0.0, so the same files can be opened at 127.0.0.1 and at the network address; every experiment of
// the lecture is run for real. Timers of the lecture are sped up 600 times (a minute = 100 ms).
//   node tools/runs/essentials/day-36-cards.cjs <day-33 lecture> <day-34 lecture> <day-35 lecture> <day-36 lecture> <day-36 student> <day-36 tasks>
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
const [p33, p34, p35, pl, ps, pt] = process.argv.slice(2);
const A = blocks(p33, 'code js'), B = blocks(p34, 'code js'), C35 = blocks(p35, 'code js'), H35 = blocks(p35, 'code html');
const J = blocks(pl, 'code js'), H = blocks(pl, 'code html'), SJ = blocks(ps, 'code js'), TJ = blocks(pt, 'code js');
const lectureHtml = fs.readFileSync(pl, 'utf8');

// the day 35 result: the page of section 11 and the program of section 11 with its "unchanged" lines filled in
const WORDS = A[0], TESTDECK = A[19], PLAN = A[28];
const WHOLE34 = B[29].split('\n').map((l) => (/^\/\/ 5\. /.test(l) ? TESTDECK + '\n\n' + B[11] : l)).join('\n');
const F35 = H35[4];
const APP35 = C35[28].split('\n').map((l) => {
  if (/^\/\/ deck, current, makeTopicButtons, render/.test(l)) return ['function deck()', 'function current()', 'function makeTopicButtons()', 'function render()'].map((h) => fnText(WHOLE34, h)).join('\n\n');
  if (/^\/\/ 5\. /.test(l)) return TESTDECK + '\n\n' + C35[26];
  if (/^\/\/ 6\. /.test(l)) return WHOLE34.slice(WHOLE34.indexOf('// 6. '));
  return l;
}).join('\n');
const TESTINPUT = J[15];
const APP = must(APP35, '\n// 6. ', '\n' + TESTINPUT + '\n\n// 6. ');   // the program the students defend: day 35 + testInput of section 5
// section 4: the deck kept in a variable
const STORED = [line(J[10], 1), '', ...J[10].split('\n').slice(2, 5)].join('\n');
// insert a line after the first line that contains the needle
const afterLine = (src, needle, insert) => { const ls = src.split('\n'); const i = ls.findIndex((l) => l.includes(needle)); if (i < 0) throw new Error('no line ' + needle); ls.splice(i + 1, 0, insert); return ls.join('\n'); };
const APP_STORED = must(afterLine(must(must(APP, fnText(APP, 'function current()'), STORED.split('\n').slice(2).join('\n')), 'const KEY = "cards:learned";\n', 'const KEY = "cards:learned";\n' + line(J[10], 1) + '\n'),
  'words = shuffle(words);', '    cards = deck();'), '  position = 0;\n  flipped = false;\n  render();\n});\n\nresetButton', '  position = 0;\n  flipped = false;\n  cards = deck();\n  render();\n});\n\nresetButton');
// section 4: topic buttons written in the markup, makeTopicButtons not called
const F_MARKUP = must(F35, '    <p class="topics"></p>\n', H[0].split('\n').map((l) => '    ' + l).join('\n') + '\n');
const APP_NO_MTB = must(APP, '    makeTopicButtons();\n', '');
const inline = (id) => dec(lectureHtml.match(new RegExp(`<code>(\\{ "id": ${id},[^<]*)<\\/code>`))[1]);
const STREET = inline(9), DOOR = inline(7);
const plus = (entry) => WORDS.replace(/\}\n\]$/, '},\n  ' + entry + '\n]');
// section 7: shuffle moved above the buttons
const APP_SHUFFLE_FIRST = must(APP.split('\n').filter((l) => !l.includes('words = shuffle(words);')).join('\n'), '    makeTopicButtons();\n', '    words = shuffle(words);\n    makeTopicButtons();\n');

const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
const NET = lan ? lan.address : 'localhost';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards36-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

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
  await new Promise((r) => LiveServer.start({ port: 5500, host: '0.0.0.0', root, open: false, logLevel: 0, wait: 50 }).on('listening', r));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const PHONE = { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
  let ctx, pg, cdp, logs = [], answer = true;
  const LOCAL = 'http://127.0.0.1:5500/cards/index.html', NETURL = `http://${NET}:5500/cards/index.html`;
  const settle = async (p = pg) => { await p.waitForFunction(() => document.querySelector('#loading') && document.querySelector('#loading').hidden, null, { timeout: 1500 }).catch(() => {}); await p.waitForTimeout(80); };
  const attach = async (url = LOCAL) => {
    pg = await ctx.newPage(); cdp = await ctx.newCDPSession(pg); await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => logs.push({ t: e.timestamp, s: e.type === 'assert' ? 'Assertion failed: ' + e.args.map((x) => x.value).join(' ') : e.type === 'timeEnd' ? '[timeEnd] ' + e.args.map((x) => x.value).join(' ') : e.args.map((x) => x.value ?? x.description).join(' ') }));
    cdp.on('Runtime.exceptionThrown', (e) => logs.push({ t: e.timestamp, s: `[${e.exceptionDetails.text}] ${(e.exceptionDetails.exception?.description || '').split('\n').slice(0, 3).map((x) => x.trim().replace(/http:\/\/[^/]+\/cards\//, '…/')).join(' / ')}` }));
    pg.on('dialog', async (d) => { logs.push({ s: `[${d.type()}] ${d.message()} -> ${answer ? 'OK' : 'Cancel'}` }); if (answer) await d.accept(); else await d.dismiss(); });
    await pg.goto(url); await settle();
  };
  const fresh = async (frame, app, words = WORDS, url = LOCAL) => {
    if (ctx) await ctx.close();
    put('cards/index.html', frame); put('cards/app.js', app); put('cards/words.json', words);
    await new Promise((r) => setTimeout(r, 250));
    ctx = await browser.newContext(PHONE); await attach(url);
  };
  const reload = async () => { await pg.reload(); await settle(); };
  const flush = () => { const v = logs.splice(0).map((x) => x.s).filter((t) => !/Live reload|favicon/.test(t)); return v.length ? '   log: ' + v.join(' | ') : ''; };
  const ev = async (expression, c = cdp) => {
    const r = await c.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true, returnByValue: false });
    if (r.exceptionDetails) return 'THROWS ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0];
    const o = r.result;
    if (o.type === 'undefined') return 'undefined';
    if (o.subtype === 'null') return 'null';
    if (o.type === 'string') return JSON.stringify(o.value);
    if (o.type === 'function') return 'function';
    if (o.type !== 'object') return String(o.value ?? o.unserializableValue);
    const f = await c.send('Runtime.callFunctionOn', { functionDeclaration: FMT, objectId: o.objectId, returnByValue: true });
    return f.result.value;
  };
  const say = async (label, code) => { const r = await ev(code); await pg.waitForTimeout(60); console.log(`  ${label} → ${r}${flush()}`); };
  const lines = async (code, tag, only) => {
    for (const x of stmts(code).filter((x) => !only || only.includes(x.k))) {
      const r = await ev(x.code); await pg.waitForTimeout(60);
      console.log(`  ${tag}.${x.k} ${x.code} → ${r}${flush()}${x.claim ? '      ' + x.claim : ''}`);
    }
  };
  const click = async (sel, times = 1) => { for (let i = 0; i < times; i++) { await pg.click(sel, { timeout: 2000 }); await pg.waitForTimeout(40); } };
  const topicBtn = (n) => `.topics button:nth-child(${n})`;
  const scene = (n) => console.log(`\n=== ${n}`);
  const BUTTONS = '[...topics.children].map((b) => b.textContent).join(" ")';

  console.log(`setup: network address ${NET}; street ${STREET}; door ${DOOR}`);

  scene('1 the seven minutes'); await fresh(F35, APP); await say('run #1 (const defense)', J[0].replace(/^const defense/, 'var defense').split('\n').slice(0, 7).join('\n') + ' defense.length');
  await lines(J[0], '#1', [8]); await lines(J[1], '#2'); await say('run #3 (schedule)', J[2].split('\n').slice(0, 8).join('\n').replace(/^function schedule/, 'var schedule = function')); await lines(J[2], '#3', [9]);
  // the timers: a minute is 100 ms
  logs.length = 0;
  await ev('var __st = window.setTimeout; window.setTimeout = (f, ms, ...a) => __st(f, ms / 600, ...a);');
  const t0 = Date.now(); await ev(J[3]); await pg.waitForTimeout(1000);
  console.log('  timers (minute = 100 ms): ' + logs.splice(0).map((x) => `${((x.t - t0) / 100).toFixed(1)}: ${x.s}`).join(' | '));
  console.log('  claimed: ' + J[4].split('\n').slice(1).map((l) => l.replace(/^\/\/ /, '')).join(' | '));
  await ev('window.setTimeout = __st');

  scene('3 the demo'); await fresh(F35, APP); await click('#know'); await lines(J[5], '#6'); await click('#again'); await lines(J[6], '#7');
  if (ctx) await ctx.close(); put('cards/words.json', WORDS); ctx = await browser.newContext(PHONE);
  await attach(NETURL); await click('#know', 2); await say(`at ${NET}: counter`, 'counter.textContent');
  const pNet = pg, cNet = cdp; await attach(LOCAL); await lines(J[7], '#8', [3]);
  console.log('  127.0.0.1 never opened in a fresh context → ' + await (async () => { const c2 = await browser.newContext(); const p2 = await c2.newPage(); await p2.goto('http://127.0.0.1:5500/cards/words.json'); const v = await p2.evaluate(() => localStorage.getItem('cards:learned')); await c2.close(); return JSON.stringify(v); })());
  await fresh(F35, APP); await lines(J[8], '#9');

  scene('4 one decision: the deck kept in a variable'); await fresh(F35, APP_STORED);
  let tries = 0; while ((await ev('card.textContent')) !== '"teacher"' && tries < 80) { await reload(); tries++; }
  console.log(`  "teacher" came first after ${tries} reloads`); flush();
  await click('#know', 2); await lines(J[11], '#12');
  scene('4 topic buttons in the markup vs from the data'); await fresh(F_MARKUP, APP_NO_MTB, plus(STREET)); await say('markup buttons', BUTTONS); await lines(J[12], '#13', [2]);
  await fresh(F35, APP, plus(STREET)); await say('data buttons', BUTTONS); await lines(J[12], '#13', [4]);
  await ev(`topics.querySelector('[data-topic="' + words[0].topic + '"]')`);

  scene('5 one mistake'); await fresh(F35, WHOLE34); await ev('localStorage.setItem("cards:learned", "[object Object]")'); await reload(); console.log('  day 34 program, broken storage:' + flush());
  await fresh(F35, APP); await say('before testInput', 'localStorage.getItem("cards:learned")'); await lines(J[16], '#17');
  console.log('  program lines of section 7 are in the program: ' + J[17].split('\n').map(noComment).every((l) => APP.includes(l)));

  scene('7 two words with one number'); await fresh(F35, APP, plus(DOOR)); console.log('  loaded:' + flush()); await lines(J[18], '#19', [1]);
  await click(topicBtn(4)); let n = 0; while ((await ev('current().word')) !== '"door"' && n < 5) { await click('#again'); n++; }
  await say(`after ${n} x Again`, 'current().word'); await click('#know'); await lines(J[18], '#19', [3, 4]);

  scene('7 two tabs'); await fresh(F35, APP); const pB = pg, cB = cdp; await attach(LOCAL); // A is the newer page
  await click('#know', 2); await lines(J[19], '#20', [2]);
  pg = pB; cdp = cB; await click('#know'); await lines(J[19], '#20', [4]);
  await ctx.pages()[1].reload(); await settle(ctx.pages()[1]); console.log('  A reloaded: ' + await ctx.pages()[1].evaluate(() => document.querySelector('#counter').textContent));

  scene('7 ten fast clicks'); await fresh(F35, APP); await say('run #21', J[20].split('\n')[0] + ' learned.length'); await lines(J[20], '#21', [2]);

  scene('7 ten thousand words'); await fresh(F35, APP); await say('run #22', J[21] + ' words.length');
  for (let k = 0; k < 5; k++) { await ev('console.time("render"); render(); console.timeEnd("render");'); console.log(`  render run ${k + 1}:` + flush()); }
  await say('filter with includes, ms x5', '[1,2,3,4,5].map(() => { const t = performance.now(); big.filter((w) => !learned.includes(w.id)).length; return Math.round((performance.now() - t) * 10) / 10; })');
  await lines(J[23], '#24');
  await say('filter with Set, ms x5', '[1,2,3,4,5].map(() => { const t = performance.now(); big.filter((w) => !learnedSet.has(w.id)).length; return Math.round((performance.now() - t) * 10) / 10; })');
  await say('storage length after the experiment', 'JSON.parse(localStorage.getItem("cards:learned")).length');
  await reload(); await say('reloaded: counter', 'counter.textContent');

  scene('7 numbers, not words'); await lines(J[24], '#25');
  scene('7 shuffle above the buttons'); await fresh(F35, APP_SHUFFLE_FIRST);
  for (let k = 0; k < 3; k++) { await lines(J[25], '#26 reload ' + (k + 1)); await reload(); }
  await fresh(F35, APP); for (let k = 0; k < 6; k++) { await lines(J[27], '#28 reload ' + (k + 1)); await reload(); }
  console.log('  program order lines (#27) are in the program: ' + J[26].split('\n').map(noComment).every((l) => APP.includes('    ' + l)));

  scene('9 marks'); await lines(J[28], '#29');
  scene('10 the course in one program');
  const ALL = APP + '\n' + WHOLE34;
  for (let b = 29; b <= 36; b++) { const code = J[b].split('\n').filter((l) => !l.trim().startsWith('//')).map(noComment); console.log(`  #${b + 1}: every line in the program: ${code.every((l) => ALL.includes(l.trim()))}${code.filter((l) => !ALL.includes(l.trim())).map((l) => ' MISSING ' + JSON.stringify(l)).join('')}`); }
  await say('E1 line with the topic of three words', `topic = words.find((w) => w.word === "bread").topic; ${noComment(line(J[29], 2))} topic = "${(await ev('topic')).replace(/"/g, '')}"; "done"`);
  scene('11 Map'); await lines(J[37], '#38');
  scene('12 retrospective'); await say('var plan', PLAN.replace(/^const plan/, 'var plan')); await lines(J[38], '#39');
  scene('13 the last check'); await reload(); await lines(J[39], '#40');

  scene('notes'); console.log('  notes testInput = lecture: ' + (SJ[1] === TESTINPUT) + '; notes lines are in the lecture: ' + SJ[0].split('\n').filter((l) => l && !l.startsWith('//')).map(noComment).every((l) => J.some((b) => b.includes(l))));
  scene('tasks: task 8, a reference solution with MINUTE = 1000');
  await fresh(F35, APP); logs.length = 0;
  const T8 = `var MINUTE = 1000;
${J[0].split('\n').slice(0, 7).join('\n').replace(/^const defense/, 'var defense')}
${J[2].split('\n').slice(0, 8).join('\n')}
schedule(defense).forEach((s, i) => {
  setTimeout(() => console.log("start " + s.part), s.at * MINUTE);
  if (defense[i].minutes > 0.5) setTimeout(() => console.log("30 s left: " + s.part), (s.at + defense[i].minutes - 0.5) * MINUTE);
});
setTimeout(() => console.log("time is up"), 7 * MINUTE);`;
  const t1 = Date.now(); await ev(T8); await pg.waitForTimeout(7400);
  console.log('  ' + logs.splice(0).map((x) => `${((x.t - t1) / 1000).toFixed(1)} s ${x.s}`).join(' | '));

  scene('tasks: task 9, Space flips the card');
  const SPACE = (prevent) => `document.addEventListener("keydown", (event) => {
  if (event.key !== " ") return;
  ${prevent ? 'event.preventDefault();' : ''}
  if (current() === null) return;
  flipped = !flipped;
  render();
});`;
  for (const prevent of [false, true]) {
    await fresh(F35, APP + '\n' + SPACE(prevent)); const first = await ev('card.textContent');
    await pg.focus('body'); await pg.keyboard.press(' '); const a = await ev('card.textContent'); await pg.keyboard.press(' '); const b = await ev('card.textContent');
    console.log(`  ${prevent ? 'with' : 'without'} preventDefault, focus on the page: ${first} → Space ${a} → Space ${b}`);
    await click('#know'); const l1 = await ev('learned.length'); await pg.keyboard.press(' '); await pg.waitForTimeout(80);
    console.log(`  ${prevent ? 'with' : 'without'} preventDefault, clicked I know (learned ${l1}), Space with focus on it → learned ${await ev('learned.length')}, card ${await ev('card.textContent')}, flipped ${await ev('flipped')}${flush()}`);
    await click(topicBtn(4)); await ev('learned.push(...words.filter((w) => w.topic === topic).map((w) => w.id)); render();'); await pg.focus('body'); await pg.keyboard.press(' ');
    console.log(`  learned topic, Space → ${await ev('card.textContent')}${flush() || ' (no red lines)'}`);
  }

  await browser.close(); LiveServer.shutdown(); fs.rmSync(root, { recursive: true, force: true });
  process.exit(0);
})();
