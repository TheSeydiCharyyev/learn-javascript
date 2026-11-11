// Texts that share a line in a figure.scheme svg (same baseline y): the gap between neighbours,
// smallest first. A negative gap means the texts overlap.
//   node tools/svg-overlap.cjs <page.html> [how many to show]
// The page is the built site (site/out, `pnpm build` in site/ first — stage 4 of the move to Next.js, 09.11.2026),
// served by tools/lib/site.cjs; the argument is still the page's path (essentials/day-07/lecture.html).
// Playwright comes from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
const site = require('./lib/site.cjs');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const rel = path.relative(site.ROOT, path.resolve(process.argv[2])).replace(/\\/g, '/');
  site.builtFile(rel); // built and fresh, or stop here
  const { base, close } = await site.serve();
  await p.goto(base + rel);
  await p.waitForTimeout(100);
  const rows = await p.evaluate(() => {
    const res = [];
    document.querySelectorAll('figure.scheme svg').forEach((svg, si) => {
      const byY = {};
      svg.querySelectorAll('text').forEach((t) => {
        const y = t.getAttribute('y');
        const bb = t.getBBox();
        (byY[y] = byY[y] || []).push({ text: t.textContent.trim(), x0: bb.x, x1: bb.x + bb.width });
      });
      for (const [y, list] of Object.entries(byY)) {
        list.sort((a, c) => a.x0 - c.x0);
        for (let i = 1; i < list.length; i++) {
          res.push({ svg: si + 1, y, gap: Math.round(list[i].x0 - list[i - 1].x1), left: list[i - 1].text.slice(0, 40), right: list[i].text.slice(0, 40) });
        }
      }
    });
    return res;
  });
  rows.sort((a, c) => a.gap - c.gap);
  for (const r of rows.slice(0, Number(process.argv[3] || 10))) console.log(`svg ${r.svg} y=${r.y}  gap ${r.gap}  "${r.left}" | "${r.right}"`);
  if (!rows.length) console.log('no texts share a line');
  await b.close();
  await close();
})();
