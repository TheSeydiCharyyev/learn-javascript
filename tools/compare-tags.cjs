// Compare the tag skeleton of a Russian page and its English twin: the sequence of opening tags
// with their class (and href for links, id for headings), ignoring text. Prints the differences.
//   node tools/compare-tags.cjs essentials/day-07/lecture.html essentials/day-07/en/lecture.html
// The pages are read as the site builds them (site/out, `pnpm build` in site/ first — stage 4 of the move to
// Next.js, 09.11.2026): the elements of <body> in order (the <head> is Next.js's, the same for both). The links
// between the two pages are routes there ("en/lecture", "../lecture"), still written LANG.
const path = require('node:path');
const site = require('./lib/site.cjs');

const relOf = (f) => path.relative(site.ROOT, path.resolve(f)).replace(/\\/g, '/');

function skeleton(file) {
  const p = site.page(relOf(file));
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      if (!c.tagName) continue;
      const tag = c.tagName.toLowerCase();
      const at = (name) => p.attr(c, name);
      // the attributes as written, for the shapes of a scheme
      const attrs = c.attrs.map((a) => `${a.name}="${a.value}"`).join(' ');
      const cls = at('class'), id = at('id');
      let href = at('href');
      if (href) href = href.replace(/^\.\.\/\.\.\/\.\.\//, '../../').replace(/^\.\.\/(lecture|student|tasks)(\.html)?$/, 'LANG').replace(/^en\/(lecture|student|tasks)(\.html)?$/, 'LANG');
      const parts = [tag];
      if (cls) parts.push('.' + cls);
      if (id) parts.push('#' + id);
      if (href && tag === 'a') parts.push('@' + href);
      if (tag === 'svg') parts.push('vb=' + at('viewBox'));
      if (['rect', 'circle', 'path', 'line'].includes(tag)) parts.push(attrs);
      if (tag === 'text') parts.push(`${at('x') !== undefined && at('y') !== undefined ? `x="${at('x')}" y="${at('y')}"` : ''} ${at('font-size') !== undefined ? `font-size="${at('font-size')}"` : ''}`);
      out.push(parts.join(' '));
      // inside a code block the built page has the highlighting's spans — the code, not the page's structure (the HTML
      // files had none there)
      if (tag === 'pre' && p.classes(c).includes('code')) continue;
      walk(c.content ?? c);
    }
  };
  walk(p.body);
  return out;
}

const [a, b] = process.argv.slice(2);
const A = skeleton(a), B = skeleton(b);
// simple LCS-based diff
const n = A.length, m = B.length;
const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
let i = 0, j = 0, diffs = 0;
while (i < n || j < m) {
  if (i < n && j < m && A[i] === B[j]) { i++; j++; continue; }
  if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { console.log(`+ en[${j}] ${B[j]}`); j++; diffs++; }
  else { console.log(`- ru[${i}] ${A[i]}`); i++; diffs++; }
}
console.log(`ru tags ${n}, en tags ${m}, differences ${diffs}`);
