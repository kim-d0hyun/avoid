#!/bin/bash
# .app → dmg. 받는 사람이 마운트해서 Applications 로 끌어 넣는, 그 흔한 창을 만든다.
#
#   ./mac/dmg.sh   → dist/똥피하기.dmg
#
# 임시 서명이라 다른 맥에서는 처음 열 때 한 번 우클릭 → 열기 가 필요하다. README 참고.
set -euo pipefail

cd "$(dirname "$0")/.."
name="몰겜"
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

# 안 열릴 때 볼 것을 **막히는 그 자리에** 둔다. 릴리스 노트로 되돌아가게 하면 아무도 안 본다.
cat > "$stage/안 열리면 여기.txt" <<'HELP'
「Apple이 악성 코드가 없음을 확인할 수 없습니다」 가 뜬다면

아직 애플 공증(notarize)을 받지 않은 앱이라서 그렇다. 나쁜 게 들어서가 아니다.
macOS 15(Sequoia)부터는 예전처럼 우클릭 → 열기 로 지나갈 수 없다.

셋 중 아무거나 하나만 하면 된다.


── 방법 1. 터미널 한 줄  ← 제일 쉽다. 경로를 몰라도 된다

  curl -fsSL https://raw.githubusercontent.com/kim-d0hyun/avoid/main/install.sh | bash

  받아서 Applications 에 넣고 바로 띄우는 것까지 한다.
  이 길로 받으면 경고 자체가 안 뜬다 — 이 dmg 는 안 써도 된다.


── 방법 2. 시스템 설정에서  ← 터미널이 싫으면

  1. 그 창에서  완료  를 누른다.   ⚠️ 휴지통으로 이동 을 누르면 앱이 지워진다
  2. 시스템 설정 → 개인정보 보호 및 보안 을 열고 아래로 내린다
  3. 「'몰겜'이(가) 차단되었습니다」 옆의  그래도 열기  → 암호 입력


── 방법 3. 이미 깐 앱을 손으로 풀기

  앱을 어디에 뒀느냐에 따라 경로가 달라서, 직접 치지 말고 끌어다 놓는 게 확실하다.

  1. 터미널을 열고 다음을 친다 (맨 뒤 빈칸까지, 엔터는 아직)

       xattr -dr com.apple.quarantine 

  2. 몰겜 앱 아이콘을 터미널 창 안으로 끌어다 놓는다 → 경로가 저절로 채워진다
  3. 엔터

  Applications 에 넣었다면 이걸 그대로 붙여 넣어도 된다:

       xattr -dr com.apple.quarantine /Applications/몰겜.app


처음 한 번뿐이다. 이후 자동 업데이트는 다시 묻지 않는다.

── 애초에 안 뜨게 하려면

  이 경고는 파일에 박힌 게 아니라 「인터넷에서 받았다」는 표시 때문에 생긴다.
  USB 나 사내 공유 폴더로 .app 을 복사해 주면 아무 경고도 안 뜬다.
  브라우저·에어드롭·메신저로 받을 때만 붙는다.

https://github.com/kim-d0hyun/avoid
HELP

hdiutil create -volname "$name" -srcfolder "$stage" -ov -format UDZO -quiet "$dmg"
rm -rf "$stage"

du -h "$dmg" | awk '{print "› " $1 "  " $2}'
