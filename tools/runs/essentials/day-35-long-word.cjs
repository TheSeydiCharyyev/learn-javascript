// Day 35, section 4: which test words fit into the card at 32px on a 360 phone and which stick out.
// The page is the day-33 frame of the "Cards" with the viewport line and the button rule of sections 3–4.
//   node tools/runs/essentials/day-35-long-word.cjs <day-33 lecture> <word> <word> ...
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const fs = require('node:fs');
const dec = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const [p33, ...words] = process.argv.slice(2);
let html = dec(fs.readFileSync(p33, 'utf8').match(/<pre class="code html">([\s\S]*?)<\/pre>/)[1]);
html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">')
  .replace('</style>', '  button { font-size: 18px; padding: 10px 16px; margin: 0 8px 8px 0; }\n  </style>').replace('<script src="app.js" defer></script>', '');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await p.setContent(html);
  const font = await p.evaluate(() => getComputedStyle(document.querySelector('#card')).fontFamily);
  console.log(`innerWidth ${await p.evaluate(() => innerWidth)}, card font: ${font}`);
  for (const w of words) {
    for (const wrap of ['normal', 'anywhere']) {
      const r = await p.evaluate(([w, wrap]) => {
        const c = document.querySelector('#card');
        c.style.overflowWrap = wrap; c.textContent = w;
        const range = document.createRange(); range.selectNodeContents(c);
        const text = range.getBoundingClientRect();
        const box = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        const inner = box.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { text: Math.round(text.width), inner: Math.round(inner), right: Math.round(text.right - (box.right - parseFloat(cs.borderRightWidth))), page: document.documentElement.scrollWidth, lines: Math.round(text.height / parseFloat(cs.lineHeight || 37) ) };
      }, [w, wrap]);
      console.log(`${w.padEnd(24)} wrap ${wrap.padEnd(8)} text ${r.text} in ${r.inner}; past the right border by ${r.right}; page scrollWidth ${r.page}`);
    }
  }
  await b.close();
})();
