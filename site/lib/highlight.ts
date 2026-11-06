// The course's syntax highlighter, run at build time: the same rules as js/highlight.js (which the HTML pages run in
// the browser), so a highlighted block is the same markup, span for span. Kept in step with js/highlight.js until the
// HTML pages are retired (stage 2 of the move to MDX); compare-site checks that both give the same DOM.
const KEYWORDS = /^(await|async|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)$/;
const VALUES = /^(true|false|null|undefined|NaN|Infinity)$/;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, text: string) => `<span class="tok-${cls}">${esc(text)}</span>`;

function js(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\/\/[^\n]*/.exec(rest)) || (m = /^\/\*[\s\S]*?\*\//.exec(rest))) { out += span("com", m[0]); i += m[0].length; continue; }
    if ((m = /^"(?:\\.|[^"\\])*"/.exec(rest)) || (m = /^'(?:\\.|[^'\\])*'/.exec(rest)) || (m = /^`(?:\\.|[^`\\])*`/.exec(rest))) {
      out += span("str", m[0]); i += m[0].length; continue;
    }
    if ((m = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?n?/i.exec(rest))) { out += span("num", m[0]); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = m[0], after = rest.slice(word.length), before = code.slice(0, i);
      const cls = KEYWORDS.test(word) ? "key"
        : VALUES.test(word) ? "val"
        : /^\s*\(/.test(after) ? "fn"
        : /\.\s*$/.test(before) ? "prop"
        : /^[A-Z]/.test(word) ? "cls" : "id";
      out += span(cls, word); i += word.length; continue;
    }
    if ((m = /^[{}()[\];,.]+/.exec(rest))) { out += span("punc", m[0]); i += m[0].length; continue; }
    if ((m = /^[=+\-*/%<>!?&|:^~]+/.exec(rest))) { out += span("op", m[0]); i += m[0].length; continue; }
    out += esc(code[i]); i++;
  }
  return out;
}

function html(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^<!--[\s\S]*?-->/.exec(rest))) { out += span("com", m[0]); i += m[0].length; continue; }
    if ((m = /^<\/?[A-Za-z][\w-]*/.exec(rest))) { out += span("tag", m[0]); i += m[0].length; continue; }
    if ((m = /^\s+[A-Za-z-]+(?==)/.exec(rest))) { out += span("attr", m[0]); i += m[0].length; continue; }
    if ((m = /^"(?:[^"]*)"/.exec(rest)) || (m = /^'(?:[^']*)'/.exec(rest))) { out += span("str", m[0]); i += m[0].length; continue; }
    if ((m = /^\/?>/.exec(rest))) { out += span("tag", m[0]); i += m[0].length; continue; }
    out += esc(code[i]); i++;
  }
  return out;
}

export function highlightCode(code: string, lang: "js" | "html"): string {
  return lang === "html" ? html(code) : js(code);
}
