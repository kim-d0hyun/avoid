// 머리 위에 뜰 이름 짓기.
//
// 맥 계정 이름에서 뽑아 보는 **첫 추측일 뿐이다.** 회사 이름으로 맥을 세팅해 두는 사람이
// 흔해서, 이 값이 사람 이름이라는 보장이 없다 — 그래서 처음 같이 하기를 누를 때
// 한 번 물어보고(confirmName), 그 뒤로는 정한 이름을 쓴다.

import Foundation

/// 한글 세 자·네 자 이름이면 성을 뗀다. 사무실에서 서로 부르는 이름이 그쪽이다.
/// (김범창 → 범창) 그 밖에는 앞 다섯 자만 — 길면 옆 사람 이름표와 겹친다.
func guessName(_ fullName: String) -> String {
    let first = fullName.split(separator: " ").first.map(String.init) ?? ""
    guard !first.isEmpty else { return "익명" }
    let hangul = first.unicodeScalars.allSatisfy { (0xAC00...0xD7A3).contains($0.value) }
    if hangul, (3...4).contains(first.count) { return String(first.dropFirst()) }
    return String(first.prefix(5))
}
