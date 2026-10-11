// Day 34: the "Word cards" implementation on a real page served by Live Server. app.js is built step by step
// from the blocks of day 33 (the starting point) and of the day 34 lecture; clicks, dialogs and reloads are real.
// Uncaught errors, console.assert failures and dialogs are caught over CDP / Playwright.
//   node tools/runs/essentials/day-34-cards.cjs <day-33 lecture> <day-34 lecture> <day-34 student> <day-34 tasks>
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const LiveServer = require('live-server');
const dec = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
const blocks = (f, kind) => [...fs.readFileSync(f, 'utf8').matchAll(new RegExp(`<pre class="code ${kind}">([\\s\\S]*?)<\\/pre>`, 'g'))].map((m) => dec(m[1]));
const must = (s, from, to) => { if (!s.includes(from)) throw new Error('not found: ' + from.slice(0, 70)); return s.replace(from, to); };
const [p33, pl, ps, pt] = process.argv.slice(2);
const A = blocks(p33, 'js');   // day 33 lecture
const J = blocks(pl, 'js');    // day 34 lecture
const SJ = blocks(ps, 'js');
const TJ = blocks(pt, 'js');
const line = (code, n) => code.split('\n')[n - 1];
const dropLine = (code, n) => code.split('\n').filter((_, i) => i !== n - 1).join('\n');
const noComment = (l) => l.replace(/\s*\/\/.*$/, '');

// day 33: the starting point of day 34
const WORDS = A[0], CHECK = A[9], STATE = A[10], ELEMS = A[12], TESTDECK = A[19], DECK = A[20], RENDER33 = A[23], LOAD = A[24], PLAN = A[28];
const MTB_STUB = 'function makeTopicButtons() {\n}';
// day 34 lecture
const CURRENT = J[0], RENDER4 = J[3], CARD_L = J[4], KNOW_L = J[6], AGAIN_L = J[9], TESTCURRENT = J[11];
const BUG_CURRENT = must(CURRENT, line(CURRENT, 4), '  ' + line(J[13], 2));                 // section 7: no %
const KNOW_NOFLIP = must(KNOW_L, '  flipped = false;\n', '');                          // section 8
const MTB = J[17], TOPICS_L = J[18], HIGHLIGHT = J[19];
const SAVE = noComment(J[21]);
const RENDER9 = must(RENDER4, '\n}', '\n' + HIGHLIGHT.split('\n').map((l) => '  ' + l).join('\n') + '\n}');
const RENDER10 = must(RENDER9, '\n}', '\n  ' + SAVE + '\n}');
const RENDER_FINAL = J[23], RESET_L = J[24];
const RENDER_NOHIDE = RENDER_FINAL.split('\n').filter((l) => !/Button\.hidden/.test(l)).join('\n');   // section 12
const BUG_RESET = dropLine(J[27], 1);                                                                // section 13
const WHOLE = J[29].split('\n').map((l) => (/^\/\/ 5\. /.test(l) ? TESTDECK + '\n\n' + TESTCURRENT : l)).join('\n');
const KNOW_GUARD = (() => { const w = J[29]; const s = w.indexOf('knowButton.addEventListener'); return w.slice(s, w.indexOf('});', s) + 3); })();

const join = (...parts) => parts.join('\n\n') + '\n';
const S3 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB_STUB, RENDER33, LOAD, TESTDECK, 'load();');
const S4 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB_STUB, RENDER4, LOAD, TESTDECK, CARD_L, 'load();');
const S5 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB_STUB, RENDER4, LOAD, TESTDECK, CARD_L, KNOW_L, 'load();');
const S6 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB_STUB, RENDER4, LOAD, TESTDECK, TESTCURRENT, CARD_L, KNOW_L, AGAIN_L, 'load();');
const S7 = must(S6, CURRENT, BUG_CURRENT);
const S8 = must(S6, KNOW_L, KNOW_NOFLIP);
const S9 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB, RENDER9, LOAD, TESTDECK, TESTCURRENT, CARD_L, KNOW_L, AGAIN_L, TOPICS_L, 'load();');
const S10 = must(S9, RENDER9, RENDER10);
const S11 = join(STATE, ELEMS, CHECK, DECK, CURRENT, MTB, RENDER_FINAL, LOAD, TESTDECK, TESTCURRENT, CARD_L, KNOW_L, AGAIN_L, TOPICS_L, RESET_L, 'load();');
const S12 = must(S11, RENDER_FINAL, RENDER_NOHIDE);
const S13 = must(S11, RESET_L, BUG_RESET);
// task 8: the classmate's version differs from section 14 in three places
const CLASSMATE = must(must(must(WHOLE, line(CURRENT, 4), '  ' + line(TJ[0], 2)), '  learned.push(current().id);\n  flipped = false;\n', '  learned.push(current().id);\n'),
  '  learned = [];\n  position = 0;', '  ' + line(TJ[0], 9) + '\n  position = 0;');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards34-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
put('cards/index.html', blocks(p33, 'html')[0]);
put('cards/words.json', WORDS);

// statements of a block, one per line; the claim is the trailing comment or the whole-line comment right below
const stmts = (code) => {
  const ls = code.split('\n');
  const out = [];
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
  let ctx, pg, cdp, logs = [], answer = true, delay = 0;
  const C = 'http://127.0.0.1:5500/cards/index.html';
  const settle = async () => { await pg.waitForFunction(() => document.querySelector('#loading') && document.querySelector('#loading').hidden, null, { timeout: 1500 }).catch(() => {}); await pg.waitForTimeout(80); };
  const attach = async () => {
    pg = await ctx.newPage(); cdp = await ctx.newCDPSession(pg); await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', (e) => logs.push(e.type === 'assert' ? 'Assertion failed: ' + e.args.map((x) => x.value).join(' ') : e.args.map((x) => x.value ?? x.description).join(' ')));
    cdp.on('Runtime.exceptionThrown', (e) => logs.push(`[${e.exceptionDetails.text}] ${(e.exceptionDetails.exception?.description || '').split('\n')[0]}`));
    pg.on('dialog', async (d) => { logs.push(`[${d.type()}] ${d.message()} -> ${answer ? 'OK' : 'Cancel'}`); if (answer) await d.accept(); else await d.dismiss(); });
    await pg.route('**/words.json', async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); await route.continue(); });
  };
  const fresh = async (code) => {
    if (ctx) await ctx.close();
    put('cards/app.js', code); await new Promise((r) => setTimeout(r, 250));
    ctx = await browser.newContext(); await attach(); await pg.goto(C); await settle();
  };
  const reload = async () => { await pg.reload(); await settle(); };
  const flush = () => { const v = logs.splice(0).filter((t) => !/Live reload|favicon/.test(t)); return v.length ? '   log: ' + v.join(' | ') : ''; };
  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, replMode: true, awaitPromise: true, returnByValue: false });
    if (r.exceptionDetails) return 'THROWS ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0];
    const o = r.result;
    if (o.type === 'undefined') return 'undefined';
    if (o.subtype === 'null') return 'null';
    if (o.type === 'string') return JSON.stringify(o.value);
    if (o.type !== 'object' && o.type !== 'function') return String(o.value ?? o.unserializableValue);
    if (o.type === 'function') return 'function';
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
  const SHOW = '[card.textContent, counter.textContent, knowButton.hidden, againButton.hidden, (topics.querySelector(".active") || {}).textContent, document.querySelector("#loading").hidden, document.querySelector("#error").textContent, position, flipped]';
  const show = async (label) => say(label.padEnd(28), SHOW);
  const click = async (sel, times = 1) => { for (let i = 0; i < times; i++) { await pg.click(sel, { timeout: 2000 }); await pg.waitForTimeout(40); } };
  const topicBtn = (n) => `.topics button:nth-child(${n})`;
  const scene = (n) => console.log(`\n=== ${n}`);

  scene('3 current'); await fresh(S3); await show('opened'); await lines(J[1], '#2'); await lines(J[2], '#3');

  scene('4 flip'); await fresh(S4); await show('opened');
  await click('#card'); await show('a click on the card'); await click('#card'); await show('one more click'); await lines(J[5], '#6');
  await ev('learned = [1, 2, 3, 4, 5, 6, 7, 8]; render();'); await show('learned all, render');
  await click('#card'); await show('a click on the empty deck');
  await fresh(must(S4, 'flipped = !flipped;', 'flipped = true;')); await click('#card'); await show('task 1, flipped = true: click'); await click('#card'); await show('task 1, flipped = true: again');

  scene('5 I know'); await fresh(S5); await click('#know'); await lines(J[7], '#8');

  scene('6 again'); await fresh(S6); await lines(J[10], '#11');
  await say('before testCurrent', '[learned, topic, position]'); await say('testCurrent()', 'testCurrent()'); await say('after testCurrent', '[learned, topic, position]');
  await say('testDeck()', 'testDeck()');
  await click('#again', 8); await show('8 x Again');
  await fresh(S6); await click('#again', 7); await show('7 x Again'); await click('#know'); await show('I know at the last card');
  await fresh(S6);
  for (const b of ['#know', '#again', '#again', '#know', '#again', '#card', '#know', '#again', '#again', '#know', '#again', '#again']) await click(b);
  await show('12 mixed clicks'); await say('learned', 'learned'); await lines(J[8], '#9');
  await fresh(S6); await ev('topic = words.find((w) => w.word === "house").topic; position = 0; flipped = false; render();');
  await show('topic of house'); await click('#know'); await lines(J[12], '#13', [2]); await click('#again'); await lines(J[12], '#13', [4]);

  scene('7 bug: the deck ran out'); await fresh(S7); await click('#again', 7); await show('7 x Again'); await click('#again'); await show('8th Again');
  await lines(J[14], '#15', [2]); await lines(J[15], '#16');

  scene('8 bug: a hint too early'); await fresh(S8); await click('#card'); await show('a click on book'); await click('#know'); await show('I know'); await lines(J[16], '#17');

  scene('9 topics'); await fresh(S9); await show('opened'); await lines(J[20], '#21', [1]);
  await click(topicBtn(4)); await show('a click on topic 4'); await lines(J[20], '#21', [3]); await say('testDeck()', 'testDeck()');
  await click(topicBtn(2)); await click(topicBtn(1)); await click(topicBtn(3)); await say('buttons after 4 clicks', '[...topics.children].map((b) => b.textContent)');

  scene('10 save'); await fresh(S10); await click('#know'); await reload(); await lines(J[22], '#23');

  scene('11 empty deck and start over'); await fresh(S11); await click(topicBtn(4)); await click('#know', 2); await lines(J[25], '#26');
  answer = false; await click('#reset'); await show('Start over, Cancel');
  answer = true; await click('#reset'); await show('Start over, OK'); await say('topic', 'topic');

  scene('12 bug: I know on an empty deck'); await fresh(S12); await click(topicBtn(4)); await click('#know', 2); await show('topic 4 learned');
  await click('#know'); await show('a click on I know');
  await fresh(S11); await click(topicBtn(4)); await click('#know', 2); await say('S11: knowButton.click() on the empty deck', 'knowButton.click(); learned');

  scene('13 bug: start over reset nothing'); await fresh(S13); await click('#know', 2); await click('#reset'); await show('2 x I know, Start over, OK');
  await reload(); await show('reloaded'); await lines(J[28], '#29');

  scene('14 the whole program');
  console.log('  section 14 = sections 3–11 + the guard of section 12 (same parts, order aside): ' +
    (WHOLE.includes(CURRENT.split('\n').slice(1).join('\n')) && WHOLE.includes(RENDER_FINAL) && WHOLE.includes(MTB) && WHOLE.includes(CARD_L) && WHOLE.includes(AGAIN_L) && WHOLE.includes(TOPICS_L) && WHOLE.includes(RESET_L) && WHOLE.includes(LOAD) && WHOLE.includes(CHECK) && WHOLE.includes(DECK) && WHOLE.includes(STATE) && WHOLE.includes(ELEMS) && KNOW_GUARD === must(KNOW_L, '() => {\n', '() => {\n  if (current() === null) return;\n')));

  scene('15 the scenario'); delay = 300; if (ctx) await ctx.close(); put('cards/app.js', WHOLE); await new Promise((r) => setTimeout(r, 250));
  ctx = await browser.newContext(); await attach(); await pg.goto(C); await pg.waitForTimeout(100);
  await say('while loading', '[document.querySelector("#loading").hidden, document.querySelector("#loading").textContent, document.querySelector("#card").textContent]');
  await settle(); delay = 0; await show('opened');
  await click('#card'); await show('a click'); await click('#card'); await show('one more click');
  await click('#know'); await show('I know'); await click('#again'); await show('Again');
  await click('#card'); await show('a click'); await click('#again'); await show('Again');
  await click(topicBtn(4)); await show('topic 4'); await click('#know'); await show('I know'); await click('#know'); await show('I know');
  await reload(); await show('reloaded');
  answer = false; await click('#reset'); await show('Start over, Cancel'); answer = true; await click('#reset'); await show('Start over, OK');
  await click(topicBtn(3)); await click('#know'); await click('#again', 2); await click('#card');
  await say('before the checks', '[learned, topic, position, flipped]'); await lines(J[30], '#31'); await say('after the checks', '[learned, topic, position, flipped]');
  await ev('localStorage.setItem("cards:learned", "[1, 2")'); await reload(); await say('broken storage, reloaded', '[document.querySelector("#loading").hidden, document.querySelector("#loading").textContent, document.querySelector("#card").textContent]');

  scene('16 plan and fact'); await fresh(WHOLE); await say('const plan', PLAN.replace(/^const plan/, 'var plan')); await lines(J[31], '#32'); await lines(J[32], '#33'); await lines(J[33], '#34');
  scene('cheatsheet: the last line'); await lines(J[35], '#36', [J[35].split('\n').length]);

  scene('17 what next'); await fresh(WHOLE); await click('#know'); await click('#again'); await lines(J[34], '#35');

  scene('notes');
  console.log('  notes #1 = lecture current + Again listener (without comments): ' + (SJ[0].split('\n').map(noComment).join('\n') === [CURRENT.split('\n').slice(1).join('\n'), AGAIN_L].join('\n\n')));
  await fresh(WHOLE); await click(topicBtn(4)); await click('#know', 2); await lines(line(SJ[1], 1), 'notes#2', [1]);
  await say('the cheatsheet line 2 of notes #2 in a function', `(() => { ${noComment(line(SJ[1], 2))} return "not empty"; })()`);

  scene('tasks: task 6, listeners from the console on the empty deck'); await say('knowButton.click(); againButton.click(); card.click()', 'knowButton.click(); againButton.click(); card.click(); [learned, position, card.textContent]');
  scene('tasks: task 7, reset survives a reload'); await fresh(WHOLE); await click('#know', 2); await click('#reset'); await reload(); await say('learned, counter', '[learned, counter.textContent]');
  scene('tasks: task 8, the classmate'); await fresh(CLASSMATE); await click('#again', 7); await show('7 x Again'); await click('#again'); await show('8th Again');
  await fresh(CLASSMATE); await click('#card'); await click('#know'); await show('flipped, I know');
  await fresh(CLASSMATE); await click('#know', 2); await click('#reset'); await show('2 x I know, Start over, OK'); await reload(); await show('reloaded');
  await say('learned, storage', '[learned, localStorage.getItem("cards:learned")]');

  await browser.close(); LiveServer.shutdown(); fs.rmSync(root, { recursive: true, force: true });
  process.exit(0);
})();
