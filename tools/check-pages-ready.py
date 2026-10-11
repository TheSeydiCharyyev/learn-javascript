# Is learn-javascript ready for GitHub Pages? Every local href/src of every tracked .html must point to a tracked
# file with the exact letter case (Pages is case-sensitive, Windows is not); no root-absolute paths; no Jekyll traps.
#   python tools/check-pages-ready.py
import os
import re
import subprocess
import sys
from urllib.parse import unquote, urlparse

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
files = subprocess.run(["git", "-c", "core.quotepath=false", "ls-files"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout.split("\n")
tracked = set(f for f in files if f)
html = [f for f in tracked if f.endswith(".html")]
bad, absolute, checked = [], [], 0
for page in html:
    text = open(os.path.join(ROOT, page), encoding="utf-8").read()
    text = re.sub(r"<pre[^>]*>[\s\S]*?</pre>|<code>[\s\S]*?</code>", "", text)
    for m in re.finditer(r'(?:href|src)="([^"]+)"', text):
        url = m.group(1)
        u = urlparse(url)
        if u.scheme or url.startswith("#") or url.startswith("mailto:") or url.startswith("//"):
            continue
        if url.startswith("/"):
            absolute.append((page, url))
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(page), unquote(u.path))).replace("\\", "/")
        if target.endswith("/"):
            target += "index.html"
        checked += 1
        if target not in tracked:
            bad.append((page, url, target))
print("pages:", len(html), "local links checked:", checked)
print("broken or wrong case:", len(bad))
for b in bad[:20]:
    print("  ", b)
print("root-absolute links:", len(absolute), absolute[:5])
print("files or folders starting with _ :", [f for f in tracked if any(p.startswith("_") for p in f.split("/"))][:5])
liquid = [f for f in tracked if f.endswith(".md") and re.search(r"\{\{|\{%", open(os.path.join(ROOT, f), encoding="utf-8").read())]
print(".md files with {{ or {% (Jekyll Liquid):", liquid)
print(".nojekyll present:", ".nojekyll" in tracked, "| root index.html:", "index.html" in tracked)
