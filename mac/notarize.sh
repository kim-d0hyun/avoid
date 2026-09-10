#!/bin/bash
# 공증(notarize). 이걸 거쳐야 남의 맥에서 경고 없이 열린다.
#
# 애플 개발자 프로그램(연 $99)이 있어야 한다. 임시 서명으로는 안 된다 —
# macOS 15 부터는 우클릭 → 열기 우회도 없어져서, 받은 사람이 시스템 설정까지 들어가야 한다.
#
#   DDONG_SIGN_IDENTITY="Developer ID Application: 회사이름 (TEAMID)" \
#   APPLE_ID=you@company.com APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=TEAMID \
#   ./mac/notarize.sh
#
# 통과하면 티켓을 **dmg 에 박아 둔다**(staple). 그러면 받는 사람이 오프라인이어도 바로 열린다.
set -euo pipefail

cd "$(dirname "$0")/.."
name="똥피하기"
app="dist/mac/$name.app"
dmg="dist/$name.dmg"

: "${DDONG_SIGN_IDENTITY:?Developer ID 서명 이름이 필요하다}"
: "${APPLE_ID:?애플 계정이 필요하다}"
: "${APPLE_APP_PASSWORD:?앱 암호가 필요하다 (appleid.apple.com 에서 만든다)}"
: "${APPLE_TEAM_ID:?팀 ID 가 필요하다}"

[ -d "$app" ] || DDONG_SIGN_IDENTITY="$DDONG_SIGN_IDENTITY" ./mac/build.sh
[ -f "$dmg" ] || ./mac/dmg.sh

echo "› 공증 올리는 중 (몇 분 걸린다)"
xcrun notarytool submit "$dmg" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "› 티켓 박기"
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"

echo "› 확인"
spctl -a -t open --context context:primary-signature -vv "$dmg" || true
echo "› 끝. 이제 받는 사람 화면에 경고가 안 뜬다."
