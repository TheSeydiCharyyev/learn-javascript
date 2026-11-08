# CR count and BOM for every page file under a folder — .html, and since stage 2 of the move to Next.js the .mdx
# pages and their .svg schemes — read as bytes (grep in Git Bash lies about \r).
#   python tools/check-bytes.py essentials/day-07
import pathlib, sys

# site/ (Next.js) keeps installed packages and build output here; they are not our pages.
SKIP = {'node_modules', '.next', 'out'}

root = pathlib.Path(sys.argv[1])
files = sorted(f for pattern in ('*.html', '*.mdx', '*.svg') for f in root.rglob(pattern) if not SKIP & set(f.parts))
bad = 0
for f in files:
    b = f.read_bytes()
    cr = b.count(b'\r')
    bom = b.startswith(b'\xef\xbb\xbf')
    if cr or bom:
        bad += 1
        print(f'{f}: CR {cr}, BOM {bom}')
print(f'checked {len(files)} files, problems {bad}')
