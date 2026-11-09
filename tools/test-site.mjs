// Behaviour test for tools/lib/site.cjs (the built site for the checks): node tools/test-site.mjs
// Needs a fresh build (cd site && pnpm build). The freshness check is tried by moving one MDX file's time forward for
// a moment; the time is put back at the end, even on a failure.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LIB = path.join(import.meta.dirname, 'lib', 'site.cjs');
const load = () => { delete require.cache[require.resolve(LIB)]; return require(LIB); };
const site = load();
const { ROOT } = site;

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// the built file of a page
const LECTURE = 'essentials/day-01/lecture.html';
check('builtFile: a built page', fs.existsSync(site.builtFile(LECTURE)));
check('builtFile: a page that is not built', throws(() => site.builtFile('essentials/day-99/lecture.html'), /is missing/));

// the page as a tree: what the MDX file says
const mdx = fs.readFileSync(path.join(ROOT, 'essentials/day-01/lecture.mdx'), 'utf8');
const fences = [...mdx.matchAll(/^```js[^\n]*\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
const p = site.page(LECTURE);
const blocks = p.all('pre.code.js');
check('page: one pre.code.js per ```js block of the MDX', blocks.length === fences.length && fences.length > 0, `${blocks.length} | ${fences.length}`);
check('page: a block\'s text is the code, without the highlighting', p.text(blocks[0]) === fences[0], JSON.stringify(p.text(blocks[0]).slice(0, 80)));
check('page: lang', p.lang === 'ru' && site.page('essentials/day-01/en/lecture.html').lang === 'en');
check('page: Next.js\'s scripts are in the file, not in the tree', p.html.includes('self.__next_f') && !p.all('script').some((s) => /self\.__next_f/.test(p.text(s))));
check('page: descendant selector', p.all('div.lesson-nav a.nav-link').length === 2, String(p.all('div.lesson-nav a.nav-link').length));
check('page: attribute selector', p.all('a[href]').length > 0 && p.all('pre[data-highlighted="1"]').length === p.all('pre.code').length, `${p.all('pre[data-highlighted="1"]').length} | ${p.all('pre.code').length}`);
check('page: a selector it does not know', throws(() => p.all('div > p'), /selector not supported/));
check('page: the licence footer', /CC BY-SA/.test(p.text(p.first('div.sources'))));

// the freshness check: a source newer than the build
const src = path.join(ROOT, 'essentials/day-01/lecture.mdx');
const { atime, mtime } = fs.statSync(src);
try {
  fs.utimesSync(src, atime, new Date(Date.now() + 60_000));
  check('builtFile: a source newer than the build', throws(() => load().builtFile(LECTURE), /older than essentials\/day-01\/lecture\.mdx/));
} finally {
  fs.utimesSync(src, atime, mtime);
}
check('builtFile: the time put back', fs.statSync(src).mtimeMs === mtime.getTime());

// the local server
const { base, close } = await site.serve();
const get = async (u) => { const r = await fetch(base + u); return [r.status, r.headers.get('content-type')]; };
try {
  const [s1, t1] = await get(LECTURE);
  check('serve: a page', s1 === 200 && /text\/html/.test(t1), `${s1} ${t1}`);
  check('serve: the home page at /', (await get(''))[0] === 200);
  check('serve: a route (no .html)', (await get('essentials/day-01/student'))[0] === 200);
  check('serve: a missing address', (await get('nothing-here.html'))[0] === 404);
} finally {
  await close();
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
