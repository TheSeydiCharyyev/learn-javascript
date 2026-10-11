// Every <text> of every figure.scheme svg: inside the viewBox, and inside the rect it sits in (if any).
//   node tools/svg-fit.cjs <page.html>
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto('file:///' + path.resolve(process.argv[2]).replace(/\\/g, '/'));
  await p.waitForTimeout(100);
  const out = await p.evaluate(() => {
    const res = [];
    document.querySelectorAll('figure.scheme svg').forEach((svg, si) => {
      const vb = svg.viewBox.baseVal;
      const rects = [...svg.querySelectorAll('rect')].map((r) => r.getBBox());
      svg.querySelectorAll('text').forEach((t) => {
        const bb = t.getBBox();
        const issues = [];
        if (bb.x < vb.x - 0.5 || bb.y < vb.y - 0.5 || bb.x + bb.width > vb.x + vb.width + 0.5 || bb.y + bb.height > vb.y + vb.height + 0.5) issues.push('вне viewBox');
        const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
        const host = rects.filter((r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height).sort((a, c) => a.width * a.height - c.width * c.height)[0];
        if (host && (bb.x < host.x + 2 || bb.x + bb.width > host.x + host.width - 2)) issues.push(`шире рамки: текст ${bb.x.toFixed(0)}..${(bb.x + bb.width).toFixed(0)}, рамка ${host.x}..${host.x + host.width}`);
        if (issues.length) res.push(`svg ${si + 1}: "${t.textContent.trim()}" — ${issues.join('; ')}`);
      });
      res.push(`svg ${si + 1}: проверено текстов ${svg.querySelectorAll('text').length}`);
    });
    return res;
  });
  console.log(out.join('\n'));
  await b.close();
})();
