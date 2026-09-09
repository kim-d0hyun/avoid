#!/bin/bash
# .app 을 만든다. Xcode 프로젝트 없이 swiftc 로 바로 컴파일하고 번들을 손으로 조립한다.
#
#   ./mac/build.sh          → dist/mac/똥피하기.app
#
# 게임 코드(src/)는 그대로 Resources/web 에 들어간다. 빌드 단계에서 변형하지 않는다.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
name="똥피하기"
exe="DdongDodge"
out="$root/dist/mac"
app="$out/$name.app"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/web"

# 쓸 수 있는 툴체인을 고른다. 커맨드라인 도구만 깔린 맥 중 일부는
# /Library/Developer/CommandLineTools/usr/include/swift 에 옛 module.modulemap 이 남아
# redefinition of module 'SwiftBridging' 으로 AppKit 자체가 안 열린다. 남의 시스템 파일을
# 지우는 대신, Xcode 가 있으면 그쪽 툴체인으로 넘어간다.
# 소스는 한 모듈로 통째로 넘긴다. 파일이 늘어나도 여기는 안 고친다.
sources=("$root"/mac/Sources/*.swift)

swift_build() { swiftc "$@"; }
if ! swiftc -target arm64-apple-macos13 -typecheck "${sources[@]}" >/dev/null 2>&1; then
  if [ -x /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc ]; then
    echo "› 커맨드라인 도구 툴체인이 깨져 있어 Xcode 쪽을 쓴다"
    swift_build() { DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc "$@"; }
  else
    echo "✗ swiftc 로 AppKit 을 못 연다. Xcode 를 깔거나 커맨드라인 도구를 다시 설치해야 한다:" >&2
    echo "  sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install" >&2
    exit 1
  fi
fi

echo "› 컴파일"
swift_build -O -whole-module-optimization \
  -target arm64-apple-macos13 \
  -o "$app/Contents/MacOS/$exe" \
  "${sources[@]}"

# 인텔 맥에서도 돌도록 x86_64 로 한 번 더 만들어 합친다. 크로스 SDK 가 없으면 조용히 건너뛴다.
if swift_build -O -whole-module-optimization -target x86_64-apple-macos13 \
     -o "$out/.intel" "${sources[@]}" 2>/dev/null; then
  lipo -create "$app/Contents/MacOS/$exe" "$out/.intel" -output "$out/.universal"
  mv "$out/.universal" "$app/Contents/MacOS/$exe"
  rm -f "$out/.intel"
  echo "› 유니버설 (arm64 + x86_64)"
fi

echo "› 리소스"
cp "$root/mac/Info.plist" "$app/Contents/Info.plist"
cp -R "$root/src/." "$app/Contents/Resources/web/"

if [ -f "$root/build/icon.png" ]; then
  iconset="$out/icon.iconset"   # iconutil 은 .iconset 로 끝나는 이름만 받는다
  rm -rf "$iconset" && mkdir -p "$iconset"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$root/build/icon.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
    sips -z $((size * 2)) $((size * 2)) "$root/build/icon.png" \
      --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$iconset" -o "$app/Contents/Resources/icon.icns"
  rm -rf "$iconset"
fi

# 서명이 없으면 macOS 가 「손상된 앱」으로 보기도 한다. 임시(ad-hoc) 서명이라도 붙여 둔다.
codesign --force --deep --sign - "$app" 2>/dev/null && echo "› 임시 서명" || echo "› 서명 건너뜀"

du -sh "$app" | awk '{print "› 앱 크기 " $1}'
echo "› $app"
