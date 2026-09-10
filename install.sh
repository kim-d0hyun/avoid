#!/bin/bash
# 몰겜 설치. 터미널에 이 한 줄:
#
#   curl -fsSL https://raw.githubusercontent.com/kim-d0hyun/avoid/main/install.sh | bash
#
# 브라우저로 dmg 를 받으면 macOS 가 「인터넷에서 왔다」는 표시를 붙이고, 공증을 안 한
# 앱이라 Gatekeeper 가 막는다. **curl 은 그 표시를 안 붙인다.** 그래서 이 길로 받으면
# 경고 자체가 안 뜬다 — 시스템 설정에 들어갈 일도, 따로 명령을 칠 일도 없다.
set -euo pipefail

repo="kim-d0hyun/avoid"
name="몰겜"
target="/Applications/$name.app"
zip_url="https://github.com/$repo/releases/latest/download/ddong-dodge-mac.zip"

echo "› 최신 버전 받는 중"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
curl -fsSL -o "$work/app.zip" "$zip_url"

echo "› 푸는 중"
ditto -x -k "$work/app.zip" "$work/out"
app="$(find "$work/out" -maxdepth 1 -name '*.app' -print -quit)"
[ -n "$app" ] || { echo "✗ 받은 파일 안에 앱이 없다" >&2; exit 1; }

# 이미 돌고 있으면 내려놓고 바꾼다.
pkill -f 'MacOS/DdongDodge' 2>/dev/null || true
sleep 0.5

# v1.6.3 까지는 이름이 「똥피하기」였다. 남겨 두면 Applications 에 두 개가 나란히 남아서
# 사람들이 옛것을 열고 「업데이트가 안 된다」고 한다. 옮겨 심는 김에 지운다.
rm -rf "/Applications/똥피하기.app"

# 지난번에 Applications 가 아닌 데 둔 사람도 있다. 남아 있으면 격리 표시를 털어 준다 —
# 안 그러면 옛 사본이 그대로 남아 계속 경고를 띄운다.
# 남의 폴더에 있는 것은 **지우지 않는다.** 격리 표시만 털어 준다 — 내려받아 둔 파일을
# 설치 스크립트가 말없이 지우면 안 된다.
for old in "$HOME/Applications" "$HOME/Downloads" "$HOME/Desktop"; do
  for app in "$old/$name.app" "$old/똥피하기.app"; do
    [ -d "$app" ] && xattr -cr "$app" 2>/dev/null || true
  done
done

echo "› Applications 로"
rm -rf "$target"
if ! ditto "$app" "$target" 2>/dev/null; then
  echo "✗ /Applications 에 쓸 권한이 없다. 앞에 sudo 를 붙여서 다시 해 봐라" >&2
  exit 1
fi
# curl 로 받았으면 애초에 안 붙지만, 만에 하나를 위해 털어 둔다.
xattr -cr "$target" 2>/dev/null || true

version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$target/Contents/Info.plist" 2>/dev/null || echo '?')"
echo "› v$version 설치 완료"
open "$target"
echo
echo "  메뉴 막대에 💩 이 뜬다."
echo "  ⌥←→ 달리기 · ⌥↑ 점프 · ⌥↓ 웅크리기 · ⌥H 숨기기 · ⌥M 메뉴"
