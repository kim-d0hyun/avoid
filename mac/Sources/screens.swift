// 어느 모니터에 띄울지 고르게 해 주는 목록 만들기.
//
// AppKit 없이 시험할 수 있도록 **순수 함수로** 떼어 두었다. 여기서 정하는 것은 딱 하나다:
// 사람이 화면 두세 대를 놓고 「이거」를 짚을 수 있게 이름을 붙이는 일.
//
// 「1번 화면 · 2번 화면」은 이름이 아니다 — 어느 쪽이 1번인지 사람은 모른다.
// 그래서 시스템이 아는 이름(Built-in Retina Display, DELL U2723QE)을 그대로 쓰고,
// 같은 모델을 둘 물려 이름까지 겹칠 때만 놓인 자리를 덧붙인다.

import Foundation

/// 게임 안 메뉴와 메뉴 막대가 같은 목록을 본다. 한쪽에서 옮기면 다른 쪽 표시도 따라간다.
struct ScreenChoice {
    let number: Int
    let name: String
    let width: Int
    let height: Int
    let current: Bool
}

/// NSScreen 에서 뽑아 온 날것. 시험에서는 손으로 만들어 넣는다.
struct ScreenInfo {
    let number: Int
    let rawName: String
    let minX: CGFloat
    let width: Int
    let height: Int
}

func makeScreenChoices(_ screens: [ScreenInfo], current: Int) -> [ScreenChoice] {
    var names: [Int: String] = [:]
    for (index, screen) in screens.enumerated() {
        let name = screen.rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        names[screen.number] = name.isEmpty ? "\(index + 1)번 화면" : name
    }
    // 이름이 겹치는 것들끼리만 자리를 붙인다. 늘 붙이면 한 대짜리에도 「(왼쪽)」이 달린다.
    for (_, twins) in Dictionary(grouping: screens, by: { names[$0.number] ?? "" }) where twins.count > 1 {
        let ordered = twins.sorted { $0.minX < $1.minX }
        for (index, screen) in ordered.enumerated() {
            names[screen.number] = "\(names[screen.number] ?? "") \(place(index, of: ordered.count))"
        }
    }
    return screens.map {
        ScreenChoice(number: $0.number, name: names[$0.number] ?? "화면",
                     width: $0.width, height: $0.height, current: $0.number == current)
    }
}

private func place(_ index: Int, of count: Int) -> String {
    if count == 2 { return index == 0 ? "(왼쪽)" : "(오른쪽)" }
    if index == 0 { return "(맨 왼쪽)" }
    if index == count - 1 { return "(맨 오른쪽)" }
    return "(왼쪽에서 \(index + 1)번째)"
}

/// 게임 쪽으로 넘길 꾸러미. 이름에 따옴표가 들어 있어도 깨지지 않게 JSON 으로 싼다.
func screenListJSON(_ choices: [ScreenChoice]) -> String {
    let rows = choices.map {
        ["number": $0.number, "name": $0.name, "w": $0.width, "h": $0.height,
         "current": $0.current] as [String: Any]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: rows),
          let text = String(data: data, encoding: .utf8) else { return "[]" }
    return text
}
