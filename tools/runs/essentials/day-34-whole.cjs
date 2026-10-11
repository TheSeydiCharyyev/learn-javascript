// Which parts of the day 34 program (built from day 33 blocks and the day 34 sections) are not word for word in section 14.
//   node tools/runs/essentials/day-34-whole.cjs <day-33 lecture> <day-34 lecture>
const fs = require('node:fs');
const dec = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const blocks = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/<pre class="code js">([\s\S]*?)<\/pre>/g)].map((m) => dec(m[1]));
const [p33, pl] = process.argv.slice(2);
const A = blocks(p33), J = blocks(pl);
const W = J[29];
const parts = { 'checkData (33 #10)': A[9], 'state (33 #11)': A[10], 'elements (33 #13)': A[12], 'deck (33 #21)': A[20], 'load (33 #25)': A[24],
  'current (34 #1, no comment line)': J[0].split('\n').slice(1).join('\n'), 'makeTopicButtons (34 #18)': J[17], 'card listener (34 #5)': J[4],
  'Again listener (34 #10)': J[9], 'topics listener (34 #19)': J[18], 'render (34 #24)': J[23], 'reset listener (34 #25)': J[24] };
for (const [k, v] of Object.entries(parts)) {
  if (W.includes(v)) { console.log('same  ' + k); continue; }
  console.log('DIFF  ' + k);
  const a = v.split('\n');
  for (const l of a) if (!W.includes(l)) console.log('        not in section 14: ' + JSON.stringify(l));
}
