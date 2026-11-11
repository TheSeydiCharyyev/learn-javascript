// For every <text> of every figure.scheme svg: its width and the free space left and right inside
// the smallest rect that holds it (or inside the viewBox). Sorted by the smallest margin.
//   node tools/svg-margin.cjs <page.html> [how many to show]
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
      const vb = svg.viewBox.baseVal;
      const rects = [...svg.querySelectorAll('rect')].map((r) => r.getBBox());
      svg.querySelectorAll('text').forEach((t) => {
        const bb = t.getBBox();
        const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
        const host = rects.filter((r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height)
          .sort((a, c) => a.width * a.height - c.width * c.height)[0] || { x: vb.x, width: vb.width };
        res.push({ svg: si + 1, text: t.textContent.trim().slice(0, 60), w: Math.round(bb.width),
          left: Math.round(bb.x - host.x), right: Math.round(host.x + host.width - bb.x - bb.width), box: Math.round(host.width) });
      });
    });
    return res;
  });
  rows.sort((a, c) => Math.min(a.left, a.right) - Math.min(c.left, c.right));
  for (const r of rows.slice(0, Number(process.argv[3] || 8))) console.log(`svg ${r.svg}  box ${r.box}  text ${r.w}  margins ${r.left}/${r.right}  "${r.text}"`);
  await b.close();
  await close();
})();
