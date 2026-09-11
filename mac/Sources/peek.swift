import Foundation

/// ⌥ 를 떼면 숨는 규칙. 창도 키보드도 모르는 순수한 판단이라 여기 따로 둔다.
///
/// 이 게임은 ⌥ 를 잡고 한다. 그러니 **⌥ 를 놓는 순간이 곧 「그만한다」**다 — 사람이 오면
/// ⌥H 를 찾아 누르는 것보다 잡고 있던 손을 펴는 게 빠르다.
///
/// 유예가 필요하다. ⌥H 로 켜는 순간에도 손은 ⌥ 에서 곧 떨어지는데, 그 0.5초에 바로 숨으면
/// 켤 수가 없다. 보이기 시작하고 `grace` 가 지나야 규칙이 걸린다.
///
/// - Parameters:
///   - visible: 지금 보이고 있나. 숨어 있으면 볼 것도 없다
///   - armed: 이 기능이 켜져 있나 (메뉴에서 끌 수 있다)
///   - shownFor: 보이기 시작한 지 얼마나 됐나
///   - optionDown: 지금 ⌥ 가 눌려 있나
func shouldHideOnOption(visible: Bool, armed: Bool, shownFor: TimeInterval,
                        optionDown: Bool, grace: TimeInterval) -> Bool {
    guard visible, armed, !optionDown else { return false }
    return shownFor > grace
}
