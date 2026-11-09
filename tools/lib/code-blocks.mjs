// The JavaScript blocks of a day page for check-ahead, read from its source — the MDX file (a ```js block) or, for a
// day not moved yet, the HTML file (<pre class="code js">). Stage 4 of the move (09.11.2026): check-ahead is a check
// for the author, so it reads what the author edits — the excusing marker before a block is a comment there
// ({/* ahead-ok: … */} in MDX, <!-- ahead-ok: … --> in HTML) and does not reach the built page, and a line number
// points into that file.
// A block: { text (the code, as the student copies it), blockExcused (an ahead-ok marker right before it), line (the
// file's line of the code's first line) }.

export const htmlJsBlocks = (html) => {
  const blocks = [];
  const re = /(<!--[^>]*-->\s*)?<pre class="code js">([\s\S]*?)<\/pre>/g;
  let m;
  while ((m = re.exec(html))) {
    const before = m[1] || '';
    const text = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    blocks.push({ text, blockExcused: /ahead-ok/i.test(before), line: html.slice(0, m.index).split('\n').length });
  }
  return blocks;
};

// A ```js block (its fence may say more: ```js file="config.json"; a longer fence holds ``` inside), and a comment
// {/* … */} right before it, blank lines between allowed. Inside a list item the fence is indented ("   ```js", day 14
// of Essentials): Markdown takes as much indentation off every line of the code.
export const mdxJsBlocks = (mdx) => {
  const blocks = [];
  const re = /(\{\/\*((?:(?!\*\/)[\s\S])*)\*\/\}\s*?)?^([ \t]*)(`{3,})js(?:[ \t][^\n]*)?\n([\s\S]*?)\n[ \t]*\4[ \t]*$/gm;
  let m;
  while ((m = re.exec(mdx))) {
    const fenceAt = m.index + (m[1]?.length ?? 0);
    const indent = m[3].length;
    const text = indent ? m[5].split('\n').map((l) => l.replace(new RegExp(`^ {0,${indent}}`), '')).join('\n') : m[5];
    blocks.push({ text, blockExcused: /ahead-ok/i.test(m[2] ?? ''), line: mdx.slice(0, fenceAt).split('\n').length + 1 });
  }
  return blocks;
};
