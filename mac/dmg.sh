#!/bin/bash
# .app → dmg. 받는 사람이 마운트해서 Applications 로 끌어 넣는, 그 흔한 창을 만든다.
#
#   ./mac/dmg.sh   → dist/똥피하기.dmg
#
# 임시 서명이라 다른 맥에서는 처음 열 때 한 번 우클릭 → 열기 가 필요하다. README 참고.
set -euo pipefail

cd "$(dirname "$0")/.."
name="똥피하기"
app="dist/mac/$name.app"
dmg="dist/$name.dmg"
stage="dist/.dmg-stage"

[ -d "$app" ] || ./mac/build.sh

echo "› dmg 만들기"
rm -rf "$stage" "$dmg"
mkdir -p "$stage"
cp -R "$app" "$stage/"
# 창 안에서 바로 끌어 넣을 수 있게 Applications 를 옆에 세워 둔다.
ln -s /Applications "$stage/Applications"

hdiutil create -volname "$name" -srcfolder "$stage" -ov -format UDZO -quiet "$dmg"
rm -rf "$stage"

du -h "$dmg" | awk '{print "› " $1 "  " $2}'
