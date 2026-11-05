# CR count and BOM for every .html under a folder, read as bytes (grep in Git Bash lies about \r).
#   python tools/check-bytes.py essentials/day-07
import pathlib, sys

# site/ (Next.js) keeps installed packages and build output here; they are not our pages.
SKIP = {'node_modules', '.next', 'out'}

files = [f for f in sorted(pathlib.Path(sys.argv[1]).rglob('*.html')) if not SKIP & set(f.parts)]
bad = 0
for f in files:
    b = f.read_bytes()
    cr = b.count(b'\r')
    bom = b.startswith(b'\xef\xbb\xbf')
    if cr or bom:
        bad += 1
        print(f'{f}: CR {cr}, BOM {bom}')
print(f'checked {len(files)} files, problems {bad}')
