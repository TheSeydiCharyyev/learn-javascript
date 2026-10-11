#!/usr/bin/env bash
# Every check of one changed day, the Russian pages against their English twins in day-NN/en/:
# code blocks and tag skeleton (compare-code, compare-tags), the schemes (svg-fit, svg-overlap, svg-margin,
# only on pages that have them), the repository checks and tests, check-pages, CR and BOM by bytes.
# A run of the day's programs in Chrome is not here: it is different for every day, see tools/runs/.
#
#   bash tools/check-day.sh 7
# NODE_PATH must hold the folders with playwright and live-server (Windows: separated by ;), for example
#   export NODE_PATH="C:/Users/seydi/goose/ui/node_modules;C:/Users/seydi/.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules"
N=$1
D=$(printf 'day-%02d' "$N")
cd "$(dirname "$0")/.." || exit 1
if [ -z "$NODE_PATH" ]; then echo 'NODE_PATH is not set, see the header of tools/check-day.sh'; exit 1; fi

echo "### code blocks and tags ($D)"
for p in lecture student tasks; do
  echo "-- $p: compare-code"; node tools/compare-code.cjs "essentials/$D/$p.html" "essentials/$D/en/$p.html"
  echo "-- $p: compare-tags"; node tools/compare-tags.cjs "essentials/$D/$p.html" "essentials/$D/en/$p.html"
done

echo "### schemes"
for p in lecture student tasks; do
  for lang in "" "en/"; do
    f="essentials/$D/$lang$p.html"
    grep -q 'class="scheme"' "$f" || continue
    echo "-- $f: svg-fit (problems only)"; node tools/svg-fit.cjs "$f" | grep -v 'проверено текстов'
    echo "-- $f: svg-overlap";             node tools/svg-overlap.cjs "$f" 3
    echo "-- $f: svg-margin";              node tools/svg-margin.cjs "$f" 4
  done
done

echo "### repository checks"
node tools/build-index.mjs >/dev/null && echo "build-index: ok" || echo "build-index: FAIL"
for t in check-ahead check-lesson-links check-license check-langs; do
  out=$(node "tools/$t.mjs" 2>&1); code=$?; echo "$t: exit $code"; [ $code -ne 0 ] && echo "$out" | tail -15
done
pass=0; fail=0
for t in tools/test-*.mjs; do
  out=$(node "$t" 2>&1)
  pass=$((pass + $(echo "$out" | grep -c 'PASS'))); fail=$((fail + $(echo "$out" | grep -c 'FAIL')))
done
echo "tests: PASS $pass, FAIL $fail"
node tools/check-pages.cjs "$N" 2>&1 | tail -8

echo "### bytes"
python tools/check-bytes.py "essentials/$D"
echo "### git"
git status --short
