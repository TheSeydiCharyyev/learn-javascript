// Compare the tag skeleton of a Russian page and its English twin: the sequence of opening tags
// with their class (and href for links, id for headings), ignoring text. Prints the differences.
//   node tools/compare-tags.cjs essentials/day-07/lecture.html essentials/day-07/en/lecture.html
const fs = require('node:fs');

function skeleton(file) {
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1];
    const id = (attrs.match(/\bid="([^"]*)"/) || [])[1];
    let href = (attrs.match(/\bhref="([^"]*)"/) || [])[1];
    if (href) href = href.replace(/^\.\.\/\.\.\/\.\.\//, '../../').replace(/^\.\.\/(lecture|student|tasks)\.html$/, 'LANG').replace(/^en\/(lecture|student|tasks)\.html$/, 'LANG');
    const parts = [tag];
    if (cls) parts.push('.' + cls);
    if (id) parts.push('#' + id);
    if (href && tag === 'a') parts.push('@' + href);
    if (tag === 'svg') parts.push('vb=' + (attrs.match(/viewBox="([^"]*)"/) || [])[1]);
    if (['rect', 'circle', 'path', 'line'].includes(tag)) parts.push(attrs.replace(/\s+/g, ' ').replace(/ \/$/, '').trim());
    if (tag === 'text') parts.push((attrs.match(/\bx="[^"]*" y="[^"]*"/) || [''])[0] + ' ' + (attrs.match(/font-size="[^"]*"/) || [''])[0]);
    out.push(parts.join(' '));
  }
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
