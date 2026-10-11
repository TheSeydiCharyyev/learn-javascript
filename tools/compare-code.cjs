// Compare code blocks of a RU and an EN page line by line: the number of blocks, the number of lines,
// and the column where a trailing // comment (or a → arrow in a comment) starts.
//   node tools/compare-code.cjs essentials/day-07/lecture.html essentials/day-07/en/lecture.html
const fs = require('node:fs');
const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#8592;/g, '←').replace(/&amp;/g, '&');
const blocks = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/<pre class="(?:code js|plain-out)">([\s\S]*?)<\/pre>/g)].map((m) => decode(m[1]).split('\n'));
// column of a comment start outside strings: the first // that is not inside quotes or backticks
function commentCol(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}
const marks = (line) => { const out = []; for (const ch of ['→', '←']) { const i = line.indexOf(ch); if (i >= 0) out.push(ch + '@' + i); } return out.join(' '); };
const ru = blocks(process.argv[2]), en = blocks(process.argv[3]);
let bad = 0;
if (ru.length !== en.length) { console.log(`blocks: RU ${ru.length}, EN ${en.length}`); bad++; }
for (let b = 0; b < Math.min(ru.length, en.length); b++) {
  if (ru[b].length !== en[b].length) { console.log(`#${b + 1}: lines RU ${ru[b].length}, EN ${en[b].length}`); bad++; continue; }
  for (let l = 0; l < ru[b].length; l++) {
    const r = ru[b][l], e = en[b][l];
    const rc = commentCol(r), ec = commentCol(e);
    // a whole-line comment may change freely; a trailing one must start in the same column
    const trailing = rc > 0 && r.slice(0, rc).trim() !== '';
    if (trailing && rc !== ec) { console.log(`#${b + 1}:${l + 1} comment col RU ${rc}, EN ${ec}\n  RU ${r}\n  EN ${e}`); bad++; }
    if (!trailing && (rc > 0) !== (ec > 0)) { console.log(`#${b + 1}:${l + 1} comment presence differs\n  RU ${r}\n  EN ${e}`); bad++; }
    const rm = marks(r), em = marks(e);
    if (rm !== em && !(rc === 0)) { console.log(`#${b + 1}:${l + 1} arrows RU ${rm} EN ${em}\n  RU ${r}\n  EN ${e}`); bad++; }
  }
}
console.log(bad ? `${bad} differences` : `blocks ${ru.length}: lines and comment columns match`);
