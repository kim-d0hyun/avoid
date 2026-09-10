#!/bin/bash
# 같이 하기가 안 될 때 어디서 막히는지 본다. 두 맥에서 각각 돌리고 결과를 비교하면 된다.
#
#   curl -fsSL https://raw.githubusercontent.com/kim-d0hyun/avoid/main/doctor.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/kim-d0hyun/avoid/main/doctor.sh | bash -s K3P9
#
# 뒤에 방 코드를 주면 그 방까지 실제로 두드려 본다.

room="${1:-}"
app="/Applications/똥피하기.app"
ok() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
no() { printf "  \033[31m✗\033[0m %s\n" "$1"; }
hm() { printf "  \033[33m•\033[0m %s\n" "$1"; }

echo "── 똥피하기 연결 진단 ──"
echo

echo "1. 앱"
if [ -d "$app" ]; then
  v=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist" 2>/dev/null)
  ok "설치됨 v$v"
  latest=$(curl -fsSL --max-time 6 https://api.github.com/repos/kim-d0hyun/avoid/releases/latest \
           | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
  if [ -n "$latest" ] && [ "$latest" != "$v" ]; then
    no "최신은 v$latest — 두 사람 버전이 다르면 방에 못 들어간다"
    hm "고치기: curl -fsSL https://raw.githubusercontent.com/kim-d0hyun/avoid/main/install.sh | bash"
  else
    ok "최신이다"
  fi
  pgrep -f 'MacOS/DdongDodge' >/dev/null && ok "실행 중" || hm "아직 안 켰다"
else
  no "$app 이 없다"
fi

echo
echo "2. 네트워크"
ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
[ -n "$ip" ] && ok "내 주소 $ip" || no "와이파이 주소가 없다"
ssid=$(ipconfig getsummary en0 2>/dev/null | awk -F' SSID : ' '/ SSID/ {print $2; exit}')
[ -n "$ssid" ] && ok "와이파이 $ssid  ← 상대와 같아야 한다" || hm "SSID 를 못 읽었다 (유선일 수 있다)"
state=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)
case "$state" in *disabled*) ok "방화벽 꺼짐";; *) hm "방화벽 켜짐 — 「들어오는 연결 차단」이면 방을 못 연다";; esac

echo
echo "3. 같은 와이파이에 열린 방"
found=$(timeout 4 dns-sd -B _ddong._tcp 2>/dev/null \
        | awk '$1 ~ /:/ && $3 == "Add" {print $NF}' | sort -u)
if [ -n "$found" ]; then
  ok "보이는 방: $(echo "$found" | grep -v _ddong | tr "\n" " ")"
else
  no "방이 하나도 안 보인다"
  hm "상대가 방을 열었는지, 로컬 네트워크 권한이 켜져 있는지 본다"
  hm "시스템 설정 → 개인정보 보호 및 보안 → 로컬 네트워크 → 똥피하기"
fi

if [ -n "$room" ]; then
  echo
  echo "4. $room 방에 실제로 두드려 보기"
  addrs=$(timeout 6 dns-sd -L "$room" _ddong._tcp local 2>/dev/null | awk '/can be reached/ {print $6}' | head -1)
  txt=$(timeout 6 dns-sd -L "$room" _ddong._tcp local 2>/dev/null | awk '/ip=/ {print; exit}')
  [ -n "$txt" ] && ok "방이 알려 준 주소:$txt" || hm "방 이름표를 못 읽었다"
  host_ip=$(echo "$txt" | sed -n 's/.*ip=\([0-9.]*\).*/\1/p')
  port=$(echo "$txt" | sed -n 's/.*port=\([0-9]*\).*/\1/p'); port="${port:-51301}"
  if [ -n "$host_ip" ]; then
    if nc -z -G 3 "$host_ip" "$port" 2>/dev/null; then
      ok "$host_ip:$port 로 TCP 연결됨 — 길은 뚫려 있다"
    else
      no "$host_ip:$port 에 못 닿는다"
      hm "회사 와이파이가 단말끼리 통신을 막는 것일 수 있다 (AP 격리)"
      hm "그 경우 코드 대신  $room@$host_ip  로 쳐도 안 된다. 관리자에게 문의하거나 핫스팟으로."
    fi
  fi
fi

echo
echo "── 끝. 이 화면을 그대로 복사해서 보내면 된다 ──"
