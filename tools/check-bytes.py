# CR count and BOM for every .html under a folder, read as bytes (grep in Git Bash lies about \r).
#   python tools/check-bytes.py essentials/day-07
import pathlib, sys

bad = 0
for f in sorted(pathlib.Path(sys.argv[1]).rglob('*.html')):
    b = f.read_bytes()
    cr = b.count(b'\r')
    bom = b.startswith(b'\xef\xbb\xbf')
    if cr or bom:
        bad += 1
        print(f'{f}: CR {cr}, BOM {bom}')
print(f'checked {len(list(pathlib.Path(sys.argv[1]).rglob("*.html")))} files, problems {bad}')
