// The highlighter must only wrap tokens: strip the tags and you get the original code back.
// node tools/test-highlight.mjs
// The highlighter is the site's, run at build time: site/lib/highlight.ts, turned into JavaScript here by the TypeScript
// of site/node_modules (until 11.11.2026 this tested js/highlight.js, which the HTML pages ran in the browser — gone
// with them, stage 4 of the move to Next.js).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.join(import.meta.dirname, '..');
const ts = createRequire(import.meta.url)(path.join(ROOT, 'site', 'node_modules', 'typescript'));
const source = fs.readFileSync(path.join(ROOT, 'site', 'lib', 'highlight.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { highlightCode: highlight } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const strip = (html) => html.replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const samples = {
  js: [
    'const name = "Мир";\nconsole.log(`Привет, ${name}!`); // вывод',
    'let a = 5 / 2, b = a > 2 && a < 10;\n/* многострочный\n   комментарий */\nif (b) { alert("да"); }',
    "const s = 'кавычки \\' внутри';\nconst t = \"и <теги> и &амперсанд\";",
    'arr.push(1n); arr.map((x) => x * 2.5e3);\nclass User extends Person { #secret = null; }',
    'const re = "a/b"; // слэш в строке\nconst obj = { key: [1, 2, 3], nested: { deep: true } };',
  ],
  html: [
    '<!DOCTYPE html>\n<html lang="ru">\n<body>\n  <h1 class="title">Привет</h1>\n  <!-- комментарий -->\n  <script src="app.js" defer></script>\n</body>\n</html>',
    '<input type="checkbox" checked>\n<p>Текст с &amp; и <b>жирным</b></p>',
  ],
};

const results = [];
for (const [lang, list] of Object.entries(samples)) {
  list.forEach((code, i) => {
    const out = highlight(code, lang);
    const back = strip(out);
    results.push(`${back === code ? 'PASS' : 'FAIL'}  ${lang} sample ${i + 1}: text unchanged` + (back === code ? '' : `\n  in:  ${JSON.stringify(code)}\n  out: ${JSON.stringify(back)}`));
    const tokens = (out.match(/<span class="tok-/g) || []).length;
    results.push(`${tokens > 0 ? 'PASS' : 'FAIL'}  ${lang} sample ${i + 1}: ${tokens} tokens marked`);
  });
}
// the classes the stylesheet paints must be the ones the highlighter produces
const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'css', 'book.css'), 'utf8');
const used = new Set([...Object.entries(samples).flatMap(([lang, l]) => l.map((c) => highlight(c, lang))).join('').matchAll(/tok-([a-z]+)/g)].map((m) => m[1]));
const styled = new Set([...css.matchAll(/\.tok-([a-z]+)/g)].map((m) => m[1]));
const unstyled = [...used].filter((t) => !styled.has(t));
results.push(`${unstyled.length ? 'FAIL' : 'PASS'}  every token class has a colour in book.css` + (unstyled.length ? ` — missing: ${unstyled.join(', ')}` : ` (${[...used].sort().join(', ')})`));

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
