import Foundation

/// ⌥ 를 떼면 숨는 규칙. 창도 키보드도 모르는 순수한 판단이라 여기 따로 둔다.
///
/// 이 게임은 ⌥ 를 잡고 한다. 그러니 **⌥ 를 놓는 순간이 곧 「그만한다」**다 — 사람이 오면
/// ⌥H 를 찾아 누르는 것보다 잡고 있던 손을 펴는 게 빠르다.
///
/// 걸쇠가 둘이다.
///
/// **하나 — 한 번은 ⌥ 를 잡아야 한다.** 켜자마자 규칙을 걸면 앱을 처음 깔고 실행한 사람
/// 화면에서 게임이 1.6초 만에 사라진다. 아직 키보드에 손도 안 올렸는데 「설치가 안 됐나」가
/// 된다. **잡았다 놓는 것**이 그만둔다는 뜻이지, 한 번도 안 잡은 건 아직 시작도 안 한 것이다.
///
/// **둘 — 켜고 나서 잠깐은 봐준다.** ⌥H 로 켜는 순간에도 손은 ⌥ 에서 곧 떨어지는데,
/// 그 0.5초에 바로 숨으면 「켰는데 아무 일도 안 일어난다」가 된다. 그 사이에 ⌥ 를 다시
/// 잡으면 계속 보이고, 안 잡으면 유예가 끝나는 대로 숨는다.
///
/// - Parameters:
///   - visible: 지금 보이고 있나. 숨어 있으면 볼 것도 없다
///   - armed: 이 기능이 켜져 있나 (메뉴에서 끌 수 있다)
///   - sawOption: 보이기 시작한 뒤로 ⌥ 를 한 번이라도 잡은 적이 있나
///   - shownFor: 보이기 시작한 지 얼마나 됐나
///   - optionDown: 지금 ⌥ 가 눌려 있나
func shouldHideOnOption(visible: Bool, armed: Bool, sawOption: Bool, shownFor: TimeInterval,
                        optionDown: Bool, grace: TimeInterval) -> Bool {
    guard visible, armed, sawOption, !optionDown else { return false }
    return shownFor > grace
}
