// Day 26, RU and EN, in Chrome: scheme 3 (create top-down, attach bottom-up, insert once). The label of step 3
// must keep at least 6 px from both edges of the scheme and stand under the horizontal part of the green arrow.
//   node tools/runs/essentials/day-26.cjs
// Playwright (and live-server) come from NODE_PATH, see the header of tools/check-day.sh.
const { chromium } = require('playwright');
const ROOT = 'file:///' + require('node:path').join(__dirname, '../../../essentials/day-26/').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  let bad = 0;
  for (const sub of ['', 'en/']) {
    await p.goto(ROOT + sub + 'lecture.html');
    const r = await p.evaluate(() => {
      const svg = document.querySelectorAll('figure.scheme svg')[2];
      const vb = svg.viewBox.baseVal;
      const t = [...svg.querySelectorAll('text')].find((x) => x.textContent.startsWith('3.'));
      const bb = t.getBBox();
      // the green arrow: M x1 y1 L x1 y2 L x2 y2 L x2 y3 — its horizontal part is x1..x2
      const d = [...svg.querySelectorAll('path')].find((x) => x.getAttribute('stroke') === '#10b981').getAttribute('d');
      const n = d.match(/[\d.]+/g).map(Number);
      return { text: t.textContent, left: bb.x - vb.x, right: vb.x + vb.width - bb.x - bb.width, center: bb.x + bb.width / 2, from: n[0], to: n[4] };
    });
    const ok = r.left >= 6 && r.right >= 6 && r.center >= r.from && r.center <= r.to;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${sub || 'ru/'} "${r.text}": margins ${r.left.toFixed(1)}/${r.right.toFixed(1)}, centre ${r.center.toFixed(1)}, arrow ${r.from}..${r.to}`);
  }
  console.log(bad ? `PROBLEMS ${bad}` : 'all match');
  await b.close();
})();
