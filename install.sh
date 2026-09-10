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
#
# **정말 죽을 때까지 기다린다.** 돌고 있는 채로 번들을 갈아 끼우면 macOS 에 죽은 등록이
# 남고, 그러면 새로 깐 앱이 「이미 떠 있네」 하며 조용히 안 뜬다. 먼저 곱게 끝내 달라고
# 부탁하고(그래야 등록이 지워진다), 안 들으면 그때 끊는다.
osascript -e 'tell application id "dev.turban.ddong-dodge" to quit' 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pgrep -f 'MacOS/DdongDodge' >/dev/null || break
  sleep 0.3
done
pkill -f 'MacOS/DdongDodge' 2>/dev/null || true
for _ in 1 2 3 4 5 6; do
  pgrep -f 'MacOS/DdongDodge' >/dev/null || break
  sleep 0.3
done

# 어디에 넣을지 정한다.
#
# /Applications 를 못 건드리는 맥이 있다. macOS 13 부터 「앱 관리」 권한이 없는 터미널은
# 그 안의 앱을 바꾸지 못한다. 그때는 **sudo 를 시키지 않는다** — sudo 로 넣으면 앱이
# root 것이 되어 다음 업데이트가 더 꼬인다. 대신 개인 폴더에 넣는다. 둘 다 똑같이 돈다.
probe="/Applications/.$name-probe-$$"
if mkdir "$probe" 2>/dev/null && rmdir "$probe" 2>/dev/null; then
  dest="/Applications"
else
  dest="$HOME/Applications"
  mkdir -p "$dest"
  echo "› /Applications 를 못 건드려서 $dest 에 넣는다"
fi
target="$dest/$name.app"

# 남의 폴더에 있는 것은 **지우지 않는다.** 격리 표시만 털어 준다.
for folder in "$HOME/Applications" "$HOME/Downloads" "$HOME/Desktop" /Applications; do
  for old in "$folder/$name.app" "$folder/똥피하기.app"; do
    [ -d "$old" ] && [ "$old" != "$target" ] && xattr -cr "$old" 2>/dev/null || true
  done
done


# **새것이 자리에 앉기 전에는 옛것을 안 지운다.**
#
# 예전에는 지우고 나서 넣었다. 넣다가 실패하면 옛것도 새것도 없는 맥이 남는다 —
# 실제로 그랬다. 옆자리에 다 옮겨 놓고, 다 됐을 때 한 번에 바꿔치기한다.
echo "› $dest 로"

# $( ) 안은 딴 셸이라 거기서 정한 값은 밖으로 안 나온다. 자리 이름은 **밖에서** 정하고
# 함수에는 넘겨만 준다.
stage_into() {
  rm -rf "$2" 2>/dev/null || true
  ditto "$app" "$2" 2>&1
}

staged="$dest/.$name.staged.$$"
if ! err="$(stage_into "$app" "$staged")"; then
  rm -rf "$staged" 2>/dev/null || true
  # 폴더는 만들 수 있는데 앱은 못 넣는 맥이 있다 (앱 관리 권한). 개인 폴더로 물러난다.
  if [ "$dest" = "/Applications" ]; then
    dest="$HOME/Applications"; mkdir -p "$dest"; target="$dest/$name.app"
    staged="$dest/.$name.staged.$$"
    echo "› /Applications 에 못 넣어서 $dest 로 간다"
    if ! err="$(stage_into "$app" "$staged")"; then
      echo "✗ 넣지 못했다: $err" >&2
      exit 1
    fi
  else
    echo "✗ 넣지 못했다: $err" >&2
    exit 1
  fi
fi
xattr -cr "$staged" 2>/dev/null || true

# 이제 바꿔치기. 옛것은 지우기 전에 옆으로 밀어 두고, 다 되면 그때 버린다.
backup="$dest/.$name.old.$$"
[ -d "$target" ] && mv "$target" "$backup" 2>/dev/null || true
if mv "$staged" "$target" 2>/dev/null; then
  rm -rf "$backup"
else
  # 새것을 못 앉혔다. 옛것을 도로 제자리에 놓는다 — 빈손으로 두지 않는다.
  [ -d "$backup" ] && mv "$backup" "$target" 2>/dev/null || true
  rm -rf "$staged"
  echo "✗ 바꿔치기에 실패했다. 옛 버전을 그대로 두었다" >&2
  exit 1
fi

# 옛 이름으로 깔려 있던 것은 이제 지운다. 새것이 자리에 앉은 뒤라 안전하다.
[ "$dest/똥피하기.app" != "$target" ] && rm -rf "$dest/똥피하기.app" 2>/dev/null || true

version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$target/Contents/Info.plist" 2>/dev/null || echo '?')"
echo "› v$version 설치 완료"
open "$target"
echo
echo "  메뉴 막대에 💩 이 뜬다."
echo "  ⌥←→ 달리기 · ⌥↑ 점프 · ⌥↓ 웅크리기 · ⌥H 숨기기 · ⌥M 메뉴"
