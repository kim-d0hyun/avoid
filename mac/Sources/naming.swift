// 머리 위에 뜰 이름 짓기.
//
// 맥 계정 이름에서 뽑아 보는 **첫 추측일 뿐이다.** 회사 이름으로 맥을 세팅해 두는 사람이
// 흔해서, 이 값이 사람 이름이라는 보장이 없다 — 그래서 처음 같이 하기를 누를 때
// 한 번 물어보고(confirmName), 그 뒤로는 정한 이름을 쓴다.

import Foundation

/// 이름표는 사람 머리 위에 뜬다. 길면 옆 사람 이름표와 겹쳐서 아무도 못 알아보므로
/// 어디선가는 끊어야 한다. 여덟 자면 「전자결재 담당자」가 띄어쓰기까지 그대로 들어간다.
///
/// **치는 자리에서 막는다.** 다 치고 나서 말없이 잘리면 사람은 자기가 뭘 잘못했는지 모른다.
let nameMax = 8

/// 한글 세 자·네 자 이름이면 성을 뗀다. 사무실에서 서로 부르는 이름이 그쪽이다.
/// (김범창 → 범창) 그 밖에는 앞 다섯 자만 — 길면 옆 사람 이름표와 겹친다.
func guessName(_ fullName: String) -> String {
    let first = fullName.split(separator: " ").first.map(String.init) ?? ""
    guard !first.isEmpty else { return "익명" }
    let hangul = first.unicodeScalars.allSatisfy { (0xAC00...0xD7A3).contains($0.value) }
    if hangul, (3...4).contains(first.count) { return String(first.dropFirst()) }
    return String(first.prefix(nameMax))
}

/// 글자 수를 넘기면 **키가 안 먹게** 하는 검사기.
///
/// 다 치고 나서 조용히 잘라 버리면, 사람은 「전자결재 담당자」를 쳤는데 화면에는
/// 「전자결재 담」이 떠 있는 이유를 알 수가 없다. 넘치는 글자는 애초에 안 들어가야 한다.
/// 한글은 조합 중인 글자도 한 자로 세므로 조합 도중에 막히지 않는다.
final class LengthLimit: Formatter {
    private let max: Int
    init(_ max: Int) { self.max = max; super.init() }
    required init?(coder: NSCoder) { nil }

    override func string(for value: Any?) -> String? { value as? String }

    override func getObjectValue(_ object: AutoreleasingUnsafeMutablePointer<AnyObject?>?,
                                 for string: String,
                                 errorDescription: AutoreleasingUnsafeMutablePointer<NSString?>?) -> Bool {
        object?.pointee = string as AnyObject
        return true
    }

    override func isPartialStringValid(_ partial: String,
                                       newEditingString: AutoreleasingUnsafeMutablePointer<NSString?>?,
                                       errorDescription: AutoreleasingUnsafeMutablePointer<NSString?>?) -> Bool {
        partial.count <= max
    }
}
