// Serves the built site (site/out) at http://localhost:4173 — the whole site as a host would serve it: a route
// ("…/day-01/student", where the day bar's links lead) gives its "….html" file, and the old addresses with ".html"
// work too. `next dev` knows only the routes: there the day bar works, but the links written with ".html" (the home
// page's, "← Курс") lead to 404 — use `pnpm preview` to read the site.
//   pnpm preview              build, then serve
//   node scripts/serve.mjs    serve what is already built; PORT=5000 for another port
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  "": "text/plain; charset=utf-8", // LICENSE
};

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.log("site/out is not built yet: run `pnpm build` (or `pnpm preview`) first");
  process.exit(1);
}

// The file for an address: the file itself, index.html of a folder, or "<address>.html" (as most hosts do).
function resolve(urlPath) {
  const file = path.join(OUT, urlPath);
  if (file !== OUT && !file.startsWith(OUT + path.sep)) return null; // no way out of site/out
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (fs.existsSync(path.join(file, "index.html"))) return path.join(file, "index.html");
  if (fs.existsSync(file + ".html")) return file + ".html";
  return null;
}

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("bad address");
      return;
    }
    const file = resolve(urlPath);
    if (!file) {
      const notFound = path.join(OUT, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] });
      fs.createReadStream(notFound).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`site/out at http://localhost:${PORT}/  (Ctrl+C to stop)`));
