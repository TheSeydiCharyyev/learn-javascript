#!/usr/bin/env bash
# Every check of one changed day, on the site as it builds (stage 4 of the move to Next.js, 11.11.2026): the site is
# built first — the checks read site/out and stop if it is older than the pages. Then: where the day has its English
# twin in day-NN/en/, code blocks and tag skeleton RU against EN (compare-code, compare-tags); the schemes (svg-fit,
# svg-overlap, svg-margin, on the pages that have them); the repository checks and tests; check-pages; CR and BOM by
# bytes. A run of the day's programs in Chrome is not here: it is different for every day, see tools/runs/.
#
#   bash tools/check-day.sh 7                 day 7 of Essentials
#   bash tools/check-day.sh 20 advanced       day 20 of course 3
# NODE_PATH must hold the folders with playwright and live-server (Windows: separated by ;), for example
#   export NODE_PATH="C:/Users/seydi/goose/ui/node_modules;C:/Users/seydi/.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules"
N=$1
COURSE=${2:-essentials}
D=$(printf 'day-%02d' "$N")
cd "$(dirname "$0")/.." || exit 1
if [ -z "$NODE_PATH" ]; then echo 'NODE_PATH is not set, see the header of tools/check-day.sh'; exit 1; fi
if [ ! -d "$COURSE/$D" ]; then echo "no folder $COURSE/$D"; exit 1; fi

# a page is written when its MDX file is, or its HTML file (a day not moved yet)
written() { [ -f "${1%.html}.mdx" ] || [ -f "$1" ]; }

echo "### build"
mkdir -p tools/.cache
if (cd site && pnpm build > ../tools/.cache/check-day-build.log 2>&1); then echo "pnpm build: ok"
else echo "pnpm build: FAIL (tools/.cache/check-day-build.log)"; tail -20 tools/.cache/check-day-build.log; exit 1; fi

if [ -d "$COURSE/$D/en" ]; then
  echo "### code blocks and tags, RU against EN ($COURSE/$D)"
  for p in lecture student tasks; do
    written "$COURSE/$D/$p.html" && written "$COURSE/$D/en/$p.html" || continue
    echo "-- $p: compare-code"; node tools/compare-code.cjs "$COURSE/$D/$p.html" "$COURSE/$D/en/$p.html"
    echo "-- $p: compare-tags"; node tools/compare-tags.cjs "$COURSE/$D/$p.html" "$COURSE/$D/en/$p.html"
  done
fi

echo "### schemes"
for p in lecture student tasks; do
  for lang in "" "en/"; do
    f="$COURSE/$D/$lang$p.html"
    written "$f" || continue
    grep -qsE '<Scheme |class="scheme"' "${f%.html}.mdx" "$f" || continue
    echo "-- $f: svg-fit (problems only)"; node tools/svg-fit.cjs "$f" | grep -v 'проверено текстов'
    echo "-- $f: svg-overlap";             node tools/svg-overlap.cjs "$f" 3
    echo "-- $f: svg-margin";              node tools/svg-margin.cjs "$f" 4
  done
done

echo "### repository checks"
for t in check-ahead check-lesson-links check-license check-langs; do
  out=$(node "tools/$t.mjs" 2>&1); code=$?; echo "$t: exit $code"; [ $code -ne 0 ] && echo "$out" | tail -15
done
pass=0; fail=0
for t in tools/test-*.mjs; do
  out=$(node "$t" 2>&1)
  pass=$((pass + $(echo "$out" | grep -c 'PASS'))); fail=$((fail + $(echo "$out" | grep -c 'FAIL')))
done
echo "tests: PASS $pass, FAIL $fail"
node tools/check-pages.cjs "$COURSE" "$N" 2>&1 | tail -8

echo "### bytes"
python tools/check-bytes.py "$COURSE/$D"
echo "### git"
git status --short
