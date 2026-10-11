# Put the EN button into the lesson-nav of the three Russian pages of a day that now has en/.
#   python tools/add-en-links.py 2
import io
import os
import re
import sys

day = int(sys.argv[1])
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "essentials", "day-%02d" % day)
LINK = ("    <a href=\"en/{p}.html\" class=\"lang-btn\" hreflang=\"en\" lang=\"en\" "
        "onclick=\"try {{ localStorage.setItem('javascript-essentials-lang', 'en'); }} catch (e) {{}}\">EN</a>\n")

for p in ["lecture", "student", "tasks"]:
    assert os.path.exists(os.path.join(BASE, "en", p + ".html")), "no en/%s.html" % p
    path = os.path.join(BASE, p + ".html")
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        text = f.read()
    assert "\r" not in text, p + ": CRLF"
    navs = list(re.finditer(r'<div class="lesson-nav">\n.*?\n</div>\n', text, re.S))
    assert len(navs) == 1, "%s: %d lesson-nav blocks" % (p, len(navs))
    nav = navs[0].group(0)
    assert "lang-btn" not in nav, p + ": already has a language button"
    new = nav[:-len("</div>\n")] + LINK.format(p=p) + "</div>\n"
    text = text[:navs[0].start()] + new + text[navs[0].end():]
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print("EN link added to day-%02d/%s.html" % (day, p))
