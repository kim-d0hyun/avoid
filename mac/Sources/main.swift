// 몰겜 — macOS 셸.
//
// 게임은 전부 web/ 안의 Canvas·JS다. 이 파일이 하는 일은 그걸 얹을 자리를 만드는 것뿐이다:
// 바탕화면을 덮는 투명·클릭 통과 오버레이, 전역 핫키, 메뉴바 아이콘, 기록 저장.
// Electron 을 쓰지 않는 이유는 하나다 — 몰래 하는 게임이 크로미움을 끼고 다니면 안 된다.

import AppKit
import Carbon.HIToolbox
import WebKit

// MARK: - 상수

private let webScheme = "ddong"
/// 두 번째로 실행된 쪽이 이미 떠 있는 쪽에 보내는 신호. 「네가 나와라」는 뜻이다.
private let showNotification = Notification.Name("dev.turban.ddong-dodge.show")
private let bestMsKey = "bestMs"
private let bestDodgedKey = "bestDodged"
private let screenKey = "screenNumber"
private let fadeKey = "windowFade"
private let sizeKey = "windowSize"
private let spotKey = "windowSpot"
private let optionHideKey = "hideOnOption"
private let nameKey = "playerName"

/// 고를 수 있는 창 크기. 화면에서 차지하는 비율이다.
///
/// 전체 화면이 부담스럽다는 사람이 있다. 남의 자리에서 보이는 게 싫기도 하고, 화면 전체에
/// 똥이 쏟아지면 일하던 창을 못 읽기도 한다. 판은 그대로 돌고 **창만 작아진다** —
/// 안에서 보는 그림은 같고 크기만 준다.
let windowSizes: [(scale: Double, name: String)] = [
    (1, "화면 전체"), (0.75, "3/4"), (0.55, "절반"), (0.4, "작게"), (0.28, "아주 작게"),
]

/// 작게 띄운 창을 화면 어디에 둘지.
let windowSpots: [(id: String, name: String)] = [
    ("c", "정중앙"), ("tl", "왼쪽 위"), ("tr", "오른쪽 위"), ("bl", "왼쪽 아래"), ("br", "오른쪽 아래"),
]

/// 키를 아직 잡고 있는지 확인하는 주기. 상태를 물어보기만 하므로 손쉬운 사용 권한이 필요 없다.
private let pollInterval: TimeInterval = 1.0 / 60.0

/// 조작키. 사용자가 요청한 ⌥ 고정이다.
private enum HK {
    static let toggle: UInt32 = 1   // ⌥H  — 언제나 걸려 있다
    static let left: UInt32 = 2     // ⌥←
    static let right: UInt32 = 3    // ⌥→
    static let jump: UInt32 = 4     // ⌥↑
    static let duck: UInt32 = 5     // ⌥↓
    static let restart: UInt32 = 6  // ⌥R
    static let menu: UInt32 = 7     // ⌥M — 게임 안 메뉴
    static let grab: UInt32 = 8     // ⌥Space — 붙잡기
    static let grabAlt: UInt32 = 9  // ⌥Z — ⌥Space 를 입력기가 먹는 자리가 있어 뒷길을 둔다

    /// 게임 중에만 거는 것들. 숨기면 반드시 푼다 — ⌥←/⌥→ 는 맥에서 「단어 단위 이동」이라
    /// 계속 잡고 있으면 남의 글쓰기를 망친다. 창이 안 보이면 그 키는 원래 주인에게 돌려준다.
    static let play: [(id: UInt32, code: Int, action: String)] = [
        (left, kVK_LeftArrow, "left"),
        (right, kVK_RightArrow, "right"),
        (jump, kVK_UpArrow, "jump"),
        (duck, kVK_DownArrow, "duck"),
        (restart, kVK_ANSI_R, "restart"),
        (menu, kVK_ANSI_M, "menu"),
        (grab, kVK_Space, "grab"),
        (grabAlt, kVK_ANSI_Z, "grab"),
    ]

    static func action(_ id: UInt32) -> String? { play.first { $0.id == id }?.action }
    /// 한 동작에 키가 둘일 수 있다(붙잡기). 놓았는지 볼 때는 **전부** 떼어져야 놓은 것이다.
    static func codes(_ action: String) -> [CGKeyCode] {
        play.filter { $0.action == action }.map { CGKeyCode($0.code) }
    }
}

func debugLog(_ text: String) {
    guard ProcessInfo.processInfo.environment["DDONG_DEBUG"] != nil else { return }
    FileHandle.standardError.write("[ddong] \(text)\n".data(using: .utf8)!)
}

// MARK: - 번들 안의 웹 파일을 넘겨주는 핸들러

/// file:// 로 열면 ES 모듈 import 가 막힌다. 커스텀 스킴을 하나 만들어 번들
/// Resources/web 아래 파일을 그대로 내준다 — 포트를 여는 것보다 조용하다.
final class WebAssetHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    init(root: URL) { self.root = root }

    private static let mimeTypes = [
        "html": "text/html", "js": "text/javascript", "css": "text/css",
        "json": "application/json", "png": "image/png",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let relative = (url.path.isEmpty || url.path == "/") ? "/index.html" : url.path
        let file = root.appendingPathComponent(relative).standardized

        // 번들 밖으로 나가는 경로는 거절한다.
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let mime = Self.mimeTypes[file.pathExtension] ?? "application/octet-stream"
        task.didReceive(URLResponse(url: url, mimeType: mime,
                                    expectedContentLength: data.count, textEncodingName: "utf-8"))
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - 앱

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    static var shared: App?

    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!

    private var eventHandler: EventHandlerRef?
    private var toggleHotKey: EventHotKeyRef?
    private var playHotKeys: [EventHotKeyRef?] = []

    /// 아직 게임에 안 넘긴 꾸러미. 60Hz 로 한 번에 몰아서 넘긴다 —
    /// 사람이 여덟이면 초당 사백 번 자바스크립트를 부르게 되고, 그 값이 곧 렉이다.
    private var inbound: [String] = []

    /// 지금 눌려 있는 방향과 누른 시각.
    private var held: [String: TimeInterval] = [:]
    private var pollTimer: Timer?
    /// 시연 녹화용 프레임 받아 적기. DDONG_SHOTS 로 폴더를 주면 켜진다.
    private var shotDir: URL?
    private var shotIndex = 0
    private var shotBackground = "#f6f5f2"
    private var shotScale = 0.6
    private var shotTimer: Timer?

    /// 개발용 자동 입장 중인가. 그때는 알림 창 대신 stderr 로만 알린다 — 창이 뜨면 시험이 멈춘다.
    private var autoRoom = false
    private var counterTick: TimeInterval = 0

    private let updater = Updater()

    private lazy var net: Net = {
        let net = Net(name: playerName)
        net.delegate = self
        return net
    }()

    /// 다른 사람 화면에 뜰 이름. 안 정하면 맥 사용자 이름의 첫 낱말을 쓴다.
    private var playerName: String {
        get {
            let env = ProcessInfo.processInfo.environment
            if env["DDONG_DEBUG"] != nil, let forced = env["DDONG_NAME"] { return String(forced.prefix(nameMax)) }
            if let saved = UserDefaults.standard.string(forKey: nameKey), !saved.isEmpty { return saved }
            return guessName(NSFullUserName())
        }
        set {
            let trimmed = String(newValue.trimmingCharacters(in: .whitespacesAndNewlines).prefix(nameMax))
            UserDefaults.standard.set(trimmed, forKey: nameKey)
            net.myName = trimmed
            pushNetRole()
            refreshMenu()
        }
    }

    /// 이름을 손으로 정한 적이 있나.
    private var hasNamed: Bool { !(UserDefaults.standard.string(forKey: nameKey) ?? "").isEmpty }

    /// 창 투명도. 남의 작업 화면 위에 얹는 게임이라 「살짝만 보이게」 두고 싶을 때가 있다.
    ///
    /// 그림을 옅게 그리는 게 아니라 **창 자체를 흐리게** 한다. 잉크만 옅게 그리면 종이 바탕과
    /// 후광이 따로 놀아서 글씨가 뭉갠다. 창 투명도는 다 그린 결과를 통째로 옅게 하므로
    /// 낙서가 낙서인 채로 옅어진다.
    private var windowFade: Double {
        get {
            let saved = UserDefaults.standard.double(forKey: fadeKey)
            return saved <= 0 ? 1 : min(1, max(0.4, saved))
        }
        set {
            UserDefaults.standard.set(min(1, max(0.4, newValue)), forKey: fadeKey)
            applyFade()
            refreshMenu()
        }
    }

    /// 창이 화면에서 차지하는 비율. 1 이면 지금까지와 같이 화면 전체다.
    private var windowSize: Double {
        get {
            let saved = UserDefaults.standard.double(forKey: sizeKey)
            return saved <= 0 ? 1 : min(1, max(0.2, saved))
        }
        set {
            UserDefaults.standard.set(min(1, max(0.2, newValue)), forKey: sizeKey)
            moveToChosenScreen()
            pushLayout()
            refreshMenu()
        }
    }

    /// 작게 띄운 창을 화면 어느 구석에 둘지. 화면 전체면 아무 뜻이 없다.
    private var windowSpot: String {
        get { UserDefaults.standard.string(forKey: spotKey) ?? "c" }
        set {
            guard windowSpots.contains(where: { $0.id == newValue }) else { return }
            UserDefaults.standard.set(newValue, forKey: spotKey)
            moveToChosenScreen()
            pushLayout()
            refreshMenu()
        }
    }

    /// **옵션을 떼면 바로 숨는다.**
    ///
    /// 이 게임은 ⌥ 를 잡고 한다. 그러니 ⌥ 를 놓는 순간이 곧 「그만한다」다 — 사람이 오면
    /// ⌥H 를 찾아 누르는 것보다 잡고 있던 손을 펴는 게 빠르다. 다시 보려면 ⌥H.
    private var hideOnOption: Bool {
        get { UserDefaults.standard.object(forKey: optionHideKey) as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: optionHideKey)
            armAt = Date()            // 켜자마자 숨지 않게 유예를 다시 준다
            sawOption = false         // 메뉴에서 막 켠 참이라 「잡았다 놓기」를 새로 센다
            pushLayout()
            refreshMenu()
        }
    }

    /// 보이기 시작한 때. 이때부터 유예 시간이 지나야 「옵션 떼면 숨기기」가 걸린다 —
    /// ⌥H 로 켜고 손을 떼는 그 0.5초에 바로 숨어 버리면 켤 수가 없다.
    private var armAt = Date()
    /// 보이기 시작한 뒤로 ⌥ 를 한 번이라도 잡았나. **잡았다 놓아야 그만두는 것**이다 —
    /// 한 번도 안 잡았으면 아직 시작도 안 한 것이라 숨기지 않는다 (앱을 막 켠 사람).
    private var sawOption = false
    /// **시간으로 봐주지 않는다.** ⌥ 를 놓으면 놓은 것이다 — 켠 지 1초든 한 시간이든 같다.
    /// 0.25초만 두는 이유는 ⌥H 가 두 키를 같이 누르는 동작이라서다. H 를 떼고 ⌥ 를 떼는
    /// 그 몇십 밀리초를 「놓았다」로 세면 ⌥H 를 눌러도 켜지지 않은 것처럼 보인다.
    private let optionGrace: TimeInterval = 0.25

    /// 게임 안 메뉴도 지금 크기·자리를 알아야 표시를 맞춘다.
    /// 웹이 알려 준 게임 목록. 메뉴 막대에서 방을 열 때 무엇으로 열지 여기서 고른다.
    private var games: [(id: String, name: String)] = []

    private func pushLayout() {
        webView?.evaluateJavaScript(
            "window.__ddongLayout && window.__ddongLayout(\(windowSize), '\(windowSpot)', \(hideOnOption))")
    }

    private func applyFade() {
        window?.alphaValue = windowFade
        webView?.evaluateJavaScript("window.__ddongFade && window.__ddongFade(\(windowFade))")
    }

    private var bestMs: Int {
        get { UserDefaults.standard.integer(forKey: bestMsKey) }
        set { UserDefaults.standard.set(newValue, forKey: bestMsKey) }
    }
    private var bestDodged: Int {
        get { UserDefaults.standard.integer(forKey: bestDodgedKey) }
        set { UserDefaults.standard.set(newValue, forKey: bestDodgedKey) }
    }

    // MARK: 시작

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 두 벌이 동시에 뜨면 오버레이가 두 겹으로 그려지고 ⌥ 핫키를 서로 뺏는다.
        // 먼저 뜬 쪽에 「나와라」만 알리고 나는 조용히 빠진다 — 그래서 앱을 다시 실행하는 것이
        // 곧 「숨긴 게임 다시 보기」가 된다.
        if !isDebugRun, otherInstanceRunning() {
            DistributedNotificationCenter.default().postNotificationName(
                showNotification, object: nil, userInfo: nil, deliverImmediately: true)
            NSApp.terminate(nil)
            return
        }
        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(showFromOtherLaunch), name: showNotification, object: nil)

        fixOwnName()
        buildWindow()
        buildStatusItem()
        installHotKeyHandler()

        // 시험용. 한 맥에서 여럿 띄워 볼 때, 화면에 낼 하나만 빼고 숨겨 둔다.
        // 숨어 있어도 같이 하는 중이면 계속 도니까 진짜 상대 노릇을 한다.
        let env = ProcessInfo.processInfo.environment
        let headless = env["DDONG_DEBUG"] != nil && env["DDONG_HIDDEN"] != nil
        if headless {
            isHidden = true
            window.orderOut(nil)
        } else {
            registerToggleHotKey()
            registerPlayHotKeys()
        }

        pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }

        updater.onChange = { [weak self] in self?.refreshMenu() }
        // 시험용. 업데이트 길을 사람 손 없이 끝까지 밟아 본다 — 못 고치는 업데이터는
        // 없느니만 못해서, 이 길은 반드시 실제로 굴려 보고 내보낸다.
        if env["DDONG_DEBUG"] != nil, env["DDONG_UPDATE_NOW"] != nil {
            updater.onChange = { [weak self] in
                self?.refreshMenu()
                if self?.updater.pending != nil, self?.updater.busy == false {
                    self?.updater.install()
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                self?.updater.check(quiet: true)
            }
        }
        updater.start()

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.moveToChosenScreen()
            self?.pushScreens()
            self?.refreshMenu()
        }

        // 시연 녹화. 창을 화면에 내지 않고 「그 사람 화면」을 파일로 뽑는다.
        if env["DDONG_DEBUG"] != nil, let dir = env["DDONG_SHOTS"] {
            shotDir = URL(fileURLWithPath: dir, isDirectory: true)
            shotBackground = env["DDONG_SHOT_BG"] ?? "#f6f5f2"
            // 0.6 이면 파일이 가볍고 눈으로 확인하기에 충분하다. 잘라서 크게 볼 때만 올린다.
            shotScale = min(2, max(0.2, Double(env["DDONG_SHOT_SCALE"] ?? "") ?? 0.6))
            try? FileManager.default.createDirectory(at: shotDir!, withIntermediateDirectories: true)
            let fps = min(60, max(5, Double(env["DDONG_SHOT_FPS"] ?? "") ?? 20))
            shotTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / fps, repeats: true) { [weak self] _ in
                self?.grabShot()
            }
        }

        // 시험용. ⌥H 를 사람 손 없이 눌러 본다 — 숨긴 동안에도 판이 도는지 확인하려고 둔다.
        //   DDONG_HIDE_AFTER=5      → 5초 뒤 숨긴다
        //   DDONG_HIDE_AFTER=5,9    → 5초 뒤 숨기고 9초에 다시 보인다
        // 시험용. 사람 손 없이 키를 눌러 본다 — 메뉴를 타고 「게임 끝내기」까지 가는 길처럼,
        // 눈으로 보고 손으로 눌러야만 확인되던 것을 확인할 때 쓴다.
        //   DDONG_KEYS="2:menu,2.4:duck,2.8:right"   → 초:동작 을 쉼표로 잇는다
        if env["DDONG_DEBUG"] != nil, let plan = env["DDONG_KEYS"] {
            for step in plan.split(separator: ",") {
                let parts = step.split(separator: ":")
                guard parts.count == 2, let at = Double(parts[0]) else { continue }
                let action = String(parts[1])
                DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
                    guard let self else { return }
                    debugLog("키 \(action)")
                    self.send(action, true)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { self.send(action, false) }
                }
            }
        }

        if env["DDONG_DEBUG"] != nil, let plan = env["DDONG_HIDE_AFTER"] {
            let times = plan.split(separator: ",").compactMap { Double($0) }
            for (index, at) in times.enumerated() {
                DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
                    guard let self else { return }
                    self.setHidden(index % 2 == 0)
                    debugLog("⌥H 눌림 → \(self.isHidden ? "숨김" : "보임")")
                }
            }
        }

        // 개발용. DDONG_DEBUG 와 **같이** 줬을 때만 본다. 사람이 메뉴에서 고르는 것과 같은 길이다.
        //   DDONG_ROOM=host   → 방을 연다 (코드는 stderr 로)
        //   DDONG_ROOM=K3P9   → 그 방에 들어간다
        if env["DDONG_DEBUG"] != nil, let room = env["DDONG_ROOM"] {
            autoRoom = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [self] in
                if room == "host" {
                    debugLog("방 코드 \(net.host() ?? "실패")")
                } else {
                    net.join(room)
                }
                refreshMenu()
            }
        }
    }

    private var isDebugRun: Bool {
        ProcessInfo.processInfo.environment["DDONG_DEBUG"] != nil
    }

    /// 같은 앱이 이미 떠 있나. 시험할 때는 여러 벌을 띄워야 해서 DDONG_DEBUG 면 건너뛴다.
    /// 제 이름을 스스로 고친다.
    ///
    /// v1.6.3 까지는 「똥피하기.app」이었다. 그 버전의 업데이터가 새 버전을 갈아 끼우는데,
    /// 갈아 끼우는 쪽이 **옛 코드**라 이름 바꾸는 법을 모른다 — 그래서 몰겜이 「똥피하기.app」
    /// 안에 들어앉는다. 속은 새것이라 돌아가기는 하지만 Finder 에는 옛 이름이 남는다.
    ///
    /// 그래서 새 앱이 뜰 때 제 이름을 본다. 다르면 옮긴다. 돌고 있는 앱의 번들을 옮기는 건
    /// 괜찮다 — 실행 파일은 이미 메모리에 올라와 있고, 같은 파일이 자리만 바뀌는 것이다.
    /// 다시 띄우지도 않는다. 껐다 켜면 새 이름으로 뜬다.
    private func fixOwnName() {
        guard let wanted = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
        else { return }
        let here = Bundle.main.bundleURL
        guard here.lastPathComponent != "\(wanted).app" else { return }
        // 개발 중에 dist/ 에서 띄운 것까지 옮기지는 않는다. 깔린 앱만 고친다.
        let folder = here.deletingLastPathComponent()
        let installed = folder.path == "/Applications"
            || folder.path == NSHomeDirectory() + "/Applications"
        guard installed else { return }

        let target = folder.appendingPathComponent("\(wanted).app")
        guard !FileManager.default.fileExists(atPath: target.path) else { return }
        do {
            try FileManager.default.moveItem(at: here, to: target)
            debugLog("이름 옮김 \(here.lastPathComponent) → \(target.lastPathComponent)")
        } catch {
            debugLog("이름 못 옮김: \(error.localizedDescription)")
        }
    }

    /// 이미 한 벌이 떠 있나.
    ///
    /// **등록만 남은 유령을 가려내야 한다.** 앱을 켜 둔 채로 번들을 갈아 끼우면(설치
    /// 스크립트가 그렇게 한다) macOS 에 죽은 등록이 남는다. 그걸 그대로 믿으면 새로 깐
    /// 앱이 「이미 하나 떠 있네」 하며 조용히 꺼진다 — 아무 말도 없이, 영영.
    /// 그래서 번호를 받아 **정말 살아 있는지 직접 물어본다.**
    private func otherInstanceRunning() -> Bool {
        guard let id = Bundle.main.bundleIdentifier else { return false }
        let mine = ProcessInfo.processInfo.processIdentifier
        return NSRunningApplication.runningApplications(withBundleIdentifier: id).contains {
            guard $0.processIdentifier != mine, $0.processIdentifier > 0, !$0.isTerminated
            else { return false }
            // kill(pid, 0) 은 죽이지 않는다. 「이 번호 살아 있나」만 묻는 것이다.
            return kill($0.processIdentifier, 0) == 0
        }
    }

    @objc private func showFromOtherLaunch() {
        guard isHidden else { return }
        setHidden(false)
    }

    // MARK: 창

    private func buildWindow() {
        let frame = chosenFrame()

        window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true // 마우스는 전부 밑의 앱으로. 조작은 키보드뿐이다.
        window.level = .init(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isReleasedWhenClosed = false
        // 화면 공유·녹화에는 안 잡힌다. 회의 중에 화면을 띄워도 남에게는 안 보인다.
        // 개발할 때만 DDONG_CAPTURE=1 로 풀어 스크린샷을 찍는다.
        window.sharingType = ProcessInfo.processInfo.environment["DDONG_CAPTURE"] != nil ? .readOnly : .none

        let config = WKWebViewConfiguration()
        let web = Bundle.main.resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(WebAssetHandler(root: web), forURLScheme: webScheme)
        config.userContentController.add(self, name: "ddong")
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if ProcessInfo.processInfo.environment["DDONG_DEBUG"] != nil {
            config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        }

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        // 웹뷰 자체 배경을 지워야 창의 투명이 살아난다.
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.load(URLRequest(url: URL(string: "\(webScheme)://app/index.html")!))

        window.alphaValue = windowFade
        window.contentView?.addSubview(webView)
        window.orderFrontRegardless() // 포커스는 절대 가져가지 않는다
    }

    /// 게임이 기대하는 window.ddong 을 만들어 준다.
    private func bridgeScript() -> String {
        """
        window.ddong = {
          debug: \(ProcessInfo.processInfo.environment["DDONG_DEBUG"] != nil),
          bot: \(ProcessInfo.processInfo.environment["DDONG_BOT"] != nil),
          best: { ms: \(bestMs), dodged: \(bestDodged) },
          saveBest: (b) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'best', ms: b.ms, dodged: b.dodged,
          }),
          log: (text) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'log', text: String(text),
          }),
          onInput: (handler) => { window.__ddongInput = handler },
          // 게임 안 메뉴에서 고른 것. 방을 열거나 앱을 끝내는 일은 셸만 할 수 있다.
          menu: (action) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'menu', action,
          }),
          onVisible: (handler) => { window.__ddongVisible = handler },
          // 물려 있는 화면들. 뽑거나 꽂으면 셸이 onScreens 로 새 목록을 밀어 준다.
          screens: \(screensJSON()),
          onScreens: (handler) => { window.__ddongScreens = handler },
          pickScreen: (number) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'screen', number,
          }),
          fade: \(windowFade),
          setFade: (value) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'fade', value,
          }),
          // 무슨 게임들이 있나. 메뉴 막대의 「방 만들기」가 이걸로 갈린다.
          setGames: (list) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'games', list,
          }),
          // 창 크기와 자리. 화면 전체가 부담스러운 사람이 쓴다.
          size: \(windowSize),
          spot: '\(windowSpot)',
          optionHide: \(hideOnOption),
          onLayout: (handler) => { window.__ddongLayout = handler },
          setOptionHide: (on) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'optionHide', on,
          }),
          setSize: (value) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'size', value,
          }),
          setSpot: (spot) => window.webkit.messageHandlers.ddong.postMessage({
            type: 'spot', spot,
          }),
          net: {
            // 방장이 한 사람을 내보낸다. 들어와 놓고 잠수하면 판이 안 끝난다.
            kick: (id) => window.webkit.messageHandlers.ddong.postMessage({
              type: 'kick', id,
            }),
            role: 'off', code: null, id: 0, name: '\(Net.escape(playerName))', peers: [],
            // to 를 안 주면 모두에게. 손님이 부르면 어차피 받는 곳은 호스트 하나다.
            send: (message, to) => window.webkit.messageHandlers.ddong.postMessage({
              type: 'net', to: to === undefined ? -1 : to, payload: JSON.stringify(message),
            }),
            onMessage: (handler) => { window.__ddongNetMsg = handler },
            onRole: (handler) => { window.__ddongNetRole = handler },
            onPeer: (handler) => { window.__ddongNetPeer = handler },
          },
        }
        // 셸이 한 프레임치를 모아서 한 번에 넣는다. 안은 이미 풀린 객체다.
        window.__ddongNetBatch = (text) => {
          if (!window.__ddongNetMsg) return
          let rows
          try { rows = JSON.parse(text) } catch (error) { return }
          for (const row of rows) window.__ddongNetMsg(row[0], row[1])
        }
        """
    }

    /// 남이 보낸 문자열을 자바스크립트 소스에 끼워 넣어야 한다. 반드시 문자열 리터럴로
    /// 감싸서 넘긴다 — 그대로 이으면 남의 이름 한 줄로 내 앱에서 코드가 돈다.
    private func jsLiteral(_ text: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [text]),
              let wrapped = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        return String(wrapped.dropFirst().dropLast())
    }

    private func pushNetRole() {
        let code = net.code.map { "'\($0)'" } ?? "null"
        webView.evaluateJavaScript("""
        window.__ddongNetRole && window.__ddongNetRole('\(net.role)', \(code), \(net.myId), \(jsLiteral(playerName)))
        """)
    }

    private func chosenScreen() -> NSScreen {
        let saved = UserDefaults.standard.integer(forKey: screenKey)
        if saved != 0, let match = NSScreen.screens.first(where: { $0.number == saved }) { return match }
        return NSScreen.screens.first { $0.frame.origin == .zero } ?? NSScreen.screens.first ?? NSScreen.main!
    }

    /// 창이 놓일 자리. 화면 전체면 쓸 수 있는 만큼 다 쓰고, 줄였으면 고른 구석에 붙인다.
    private func chosenFrame() -> NSRect {
        let area = chosenScreen().visibleFrame   // 메뉴 막대와 Dock 자리는 비워 둔다
        let scale = windowSize
        guard scale < 0.999 else { return area }
        let w = (area.width * scale).rounded()
        let h = (area.height * scale).rounded()
        let right = area.maxX - w
        let top = area.maxY - h
        switch windowSpot {
        case "tl": return NSRect(x: area.minX, y: top, width: w, height: h)
        case "tr": return NSRect(x: right, y: top, width: w, height: h)
        case "bl": return NSRect(x: area.minX, y: area.minY, width: w, height: h)
        case "br": return NSRect(x: right, y: area.minY, width: w, height: h)
        default: return NSRect(x: (area.midX - w / 2).rounded(),
                               y: (area.midY - h / 2).rounded(), width: w, height: h)
        }
    }

    private func moveToChosenScreen() {
        let screen = chosenScreen()
        window.setFrame(chosenFrame(), display: true)
        debugLog("창 → \(screen.localizedName)(#\(screen.number)) "
               + "\(Int(window.frame.width))×\(Int(window.frame.height)) "
               + "@\(Int(window.frame.minX)),\(Int(window.frame.minY)) "
               + "투명도 \(Int(window.alphaValue * 100))%")
    }

    /// 지금 물려 있는 화면들. 이름 짓는 규칙은 screens.swift 에 있다.
    private func screenChoices() -> [ScreenChoice] {
        let rows = NSScreen.screens.map {
            ScreenInfo(number: $0.number, rawName: $0.localizedName, minX: $0.frame.minX,
                       width: Int($0.frame.width), height: Int($0.frame.height))
        }
        return makeScreenChoices(rows, current: chosenScreen().number)
    }

    private func screensJSON() -> String { screenListJSON(screenChoices()) }

    private func pushScreens() {
        guard webView != nil else { return }
        webView.evaluateJavaScript("window.__ddongScreens && window.__ddongScreens(\(screensJSON()))")
    }

    /// 게임 안 메뉴에서도, 메뉴 막대에서도 여기로 온다. 고른 화면은 다음에 켤 때도 기억한다.
    private func chooseScreen(_ number: Int) {
        guard NSScreen.screens.contains(where: { $0.number == number }) else { return }
        UserDefaults.standard.set(number, forKey: screenKey)
        moveToChosenScreen()
        pushScreens()
        refreshMenu()
    }

    // MARK: 메뉴바

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "💩"
        statusItem.button?.toolTip = "몰겜 — ⌥H 숨기기 · ⌥M 메뉴"
        refreshMenu()
    }

    private func refreshMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: isHidden ? "보이기  ⌥H" : "숨기기  ⌥H",
                     action: #selector(toggleWindow), keyEquivalent: "").target = self
        menu.addItem(.separator())

        let record = NSMenuItem(title: "최고 기록  \(formatMs(bestMs))  ·  피한 똥 \(bestDodged)개",
                                action: nil, keyEquivalent: "")
        record.isEnabled = false
        menu.addItem(record)
        menu.addItem(withTitle: "기록 지우기", action: #selector(clearRecord), keyEquivalent: "").target = self

        menu.addItem(.separator())

        // 같이 하기. 방을 연 맥이 곧 서버라 켜는 것 말고 준비할 게 없다.
        switch net.role {
        case "host":
            let title = NSMenuItem(title: "방 \(net.code ?? "")  ·  \(net.peerCount)명 접속",
                                   action: nil, keyEquivalent: "")
            title.isEnabled = false
            menu.addItem(title)
            menu.addItem(withTitle: "코드 복사", action: #selector(copyCode), keyEquivalent: "").target = self
            // 회사 와이파이가 단말끼리의 통신을 막으면 코드만으로는 못 찾는다. 그때 쓰는 주소.
            if let full = codeWithAddress() {
                menu.addItem(withTitle: "안 잡히면  \(full)  복사",
                             action: #selector(copyCodeWithAddress), keyEquivalent: "").target = self
            }
            menu.addItem(withTitle: "방 닫기", action: #selector(leaveRoom), keyEquivalent: "").target = self
        case "guest":
            let title = NSMenuItem(title: "방 \(net.code ?? "") 에 들어가 있음", action: nil, keyEquivalent: "")
            title.isEnabled = false
            menu.addItem(title)
            menu.addItem(withTitle: "나가기", action: #selector(leaveRoom), keyEquivalent: "").target = self
        default:
            // **무슨 게임으로 열지부터 고른다.** 들어온 사람이 보게 될 판이라 열기 전에 정한다.
            if games.count > 1 {
                let pick = NSMenu()
                for (index, game) in games.enumerated() {
                    let item = NSMenuItem(title: game.name, action: #selector(hostGame(_:)),
                                          keyEquivalent: "")
                    item.target = self
                    item.tag = index
                    pick.addItem(item)
                }
                let parent = NSMenuItem(title: "방 만들기", action: nil, keyEquivalent: "")
                parent.submenu = pick
                menu.addItem(parent)
            } else {
                menu.addItem(withTitle: "방 만들기", action: #selector(makeRoom), keyEquivalent: "").target = self
            }
            menu.addItem(withTitle: "코드로 입장…", action: #selector(askJoin), keyEquivalent: "").target = self
        }
        menu.addItem(withTitle: "이름 바꾸기…  (\(playerName))",
                     action: #selector(askName), keyEquivalent: "").target = self

        menu.addItem(.separator())
        let help = NSMenuItem(title: "⌥←→ 이동 · ⌥↑ 점프 · ⌥↓ 웅크리기 · ⌥R 다시 · ⌥M 메뉴",
                              action: nil, keyEquivalent: "")
        help.isEnabled = false
        menu.addItem(help)

        let fades = NSMenu()
        for step in [1.0, 0.85, 0.7, 0.55, 0.4] {
            let item = NSMenuItem(title: step == 1 ? "그대로" : "\(Int(step * 100))%",
                                  action: #selector(pickFade(_:)), keyEquivalent: "")
            item.target = self
            item.tag = Int(step * 100)
            item.state = abs(step - windowFade) < 0.02 ? .on : .off
            fades.addItem(item)
        }
        let fadeParent = NSMenuItem(title: "투명도", action: nil, keyEquivalent: "")
        fadeParent.submenu = fades
        menu.addItem(.separator())
        menu.addItem(fadeParent)

        // 창 크기. 화면 전체가 부담스러우면 줄인다.
        let sizes = NSMenu()
        for step in windowSizes {
            let item = NSMenuItem(title: step.name, action: #selector(pickSize(_:)), keyEquivalent: "")
            item.target = self
            item.tag = Int((step.scale * 100).rounded())
            item.state = abs(step.scale - windowSize) < 0.02 ? .on : .off
            sizes.addItem(item)
        }
        let sizeParent = NSMenuItem(title: "창 크기", action: nil, keyEquivalent: "")
        sizeParent.submenu = sizes
        menu.addItem(sizeParent)

        let peek = NSMenuItem(title: "옵션 떼면 숨기기", action: #selector(toggleOptionHide),
                              keyEquivalent: "")
        peek.target = self
        peek.state = hideOnOption ? .on : .off
        menu.addItem(peek)

        // 창 위치. 화면 전체일 때는 놓을 자리가 하나뿐이라 안 보여 준다.
        if windowSize < 0.999 {
            let spots = NSMenu()
            for (index, spot) in windowSpots.enumerated() {
                let item = NSMenuItem(title: spot.name, action: #selector(pickSpot(_:)), keyEquivalent: "")
                item.target = self
                item.tag = index
                item.state = spot.id == windowSpot ? .on : .off
                spots.addItem(item)
            }
            let spotParent = NSMenuItem(title: "창 위치", action: nil, keyEquivalent: "")
            spotParent.submenu = spots
            menu.addItem(spotParent)
        }

        let choices = screenChoices()
        if choices.count > 1 {
            menu.addItem(.separator())
            let screens = NSMenu()
            for choice in choices {
                let item = NSMenuItem(title: "\(choice.name)  ·  \(choice.width)×\(choice.height)",
                                      action: #selector(pickScreen(_:)), keyEquivalent: "")
                item.target = self
                item.tag = choice.number
                item.state = choice.current ? .on : .off
                screens.addItem(item)
            }
            let parent = NSMenuItem(title: "띄울 화면", action: nil, keyEquivalent: "")
            parent.submenu = screens
            menu.addItem(parent)
        }

        menu.addItem(.separator())
        if let note = updater.note {
            let item = NSMenuItem(title: note, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else if let pending = updater.pending {
            menu.addItem(withTitle: "새 버전 \(pending.version) 받기",
                         action: #selector(installUpdate), keyEquivalent: "").target = self
        } else {
            menu.addItem(withTitle: "업데이트 확인  (v\(appVersion))",
                         action: #selector(checkUpdate), keyEquivalent: "").target = self
        }

        menu.addItem(.separator())
        menu.addItem(withTitle: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
    }

    private func formatMs(_ ms: Int) -> String {
        String(format: "%02d:%02d.%02d", ms / 60000, (ms / 1000) % 60, (ms % 1000) / 10)
    }

    @objc private func clearRecord() {
        bestMs = 0
        bestDodged = 0
        webView.evaluateJavaScript("window.__ddongBest && window.__ddongBest(0, 0)")
        refreshMenu()
    }

    @objc private func pickScreen(_ sender: NSMenuItem) {
        chooseScreen(sender.tag)
    }

    @objc private func pickFade(_ sender: NSMenuItem) {
        windowFade = Double(sender.tag) / 100
    }

    @objc private func toggleOptionHide() { hideOnOption = !hideOnOption }

    @objc private func pickSize(_ sender: NSMenuItem) {
        windowSize = Double(sender.tag) / 100
    }

    @objc private func pickSpot(_ sender: NSMenuItem) {
        guard windowSpots.indices.contains(sender.tag) else { return }
        windowSpot = windowSpots[sender.tag].id
    }

    // MARK: 입력

    /// 누름과 놓음을 **둘 다** 받는다. 놓음까지 받아야 방향키를 잡고 있는 동안만 달린다 —
    /// 누름만 받으면 한 번 누를 때마다 한 걸음씩 튀는, 못 피하는 게임이 된다.
    private func installHotKeyHandler() {
        var specs = [
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased)),
        ]
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            guard let event else { return noErr }
            var hotKey = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKey)
            App.shared?.hotKey(hotKey.id, pressed: GetEventKind(event) == UInt32(kEventHotKeyPressed))
            return noErr
        }, 2, &specs, nil, &eventHandler)
    }

    private func registerToggleHotKey() {
        var ref: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x44444F47), id: HK.toggle) // 'DDOG'
        let status = RegisterEventHotKey(UInt32(kVK_ANSI_H), UInt32(optionKey), id,
                                         GetApplicationEventTarget(), 0, &ref)
        debugLog("⌥H status=\(status)")
        toggleHotKey = ref
    }

    /// 게임용 키는 창이 보일 때만 건다. 숨기는 순간 풀어 ⌥←→ 를 원래 쓰임으로 돌려준다.
    private func registerPlayHotKeys() {
        guard playHotKeys.isEmpty else { return }
        for key in HK.play {
            var ref: EventHotKeyRef?
            let id = EventHotKeyID(signature: OSType(0x44444F47), id: key.id)
            let status = RegisterEventHotKey(UInt32(key.code), UInt32(optionKey), id,
                                             GetApplicationEventTarget(), 0, &ref)
            debugLog("⌥\(key.action) status=\(status)")
            playHotKeys.append(ref)
        }
    }

    private func unregisterPlayHotKeys() {
        for ref in playHotKeys where ref != nil { UnregisterEventHotKey(ref!) }
        playHotKeys.removeAll()
        releaseAll()
    }

    fileprivate func hotKey(_ id: UInt32, pressed: Bool) {
        if id == HK.toggle {
            if pressed { toggleWindow() }
            return
        }
        guard let action = HK.action(id), !isHidden else { return }

        if pressed {
            guard held[action] == nil else { return } // 키 반복은 한 번만 센다
            held[action] = Date.timeIntervalSinceReferenceDate
            send(action, true)
        } else {
            release(action)
        }
    }

    private func send(_ action: String, _ pressed: Bool) {
        webView.evaluateJavaScript("window.__ddongInput && window.__ddongInput('\(action)', \(pressed))")
    }

    private func release(_ action: String) {
        guard held.removeValue(forKey: action) != nil else { return }
        send(action, false)
    }

    /// 손을 뗐는지 **직접 물어본다.** 핫키의 놓음 이벤트만 믿으면 안 되는 자리가 둘 있다:
    /// ⌥ 를 먼저 놓으면 그 조합은 더 이상 핫키가 아니라 방향키 놓음이 아예 안 오고,
    /// 창을 숨기며 핫키를 풀면 그 뒤의 놓음은 받을 데가 없다. 둘 다 캐릭터가 계속 달린다.
    ///
    /// CGEventSource.keyState 와 NSEvent.modifierFlags 는 상태를 묻는 것이라
    /// 손쉬운 사용 권한이 필요 없다 — 키를 가로채는 이벤트 탭과 다르다.
    private func poll() {
        // 숨어 있는 동안 게임을 굴려 주는 자리. 웹뷰의 자체 루프는 이때 거의 멈춰 있지만,
        // 네이티브에서 부르는 자바스크립트는 그대로 돈다.
        // 녹화 중이면 혼자여도 굴린다. 안 그러면 시연 녹화가 멈춘 화면만 찍는다.
        if isHidden, net.role != "off" || shotDir != nil {
            webView.evaluateJavaScript("window.__ddongTick && window.__ddongTick()")
        }
        // **옵션을 떼면 숨긴다.** 게임이 보이는 동안에만 본다.
        //
        // 상태를 물어보기만 하는 것이라 손쉬운 사용 권한이 필요 없다. 켠 직후 잠깐은
        // 안 건다 — ⌥H 를 누르고 손을 떼는 사이에 바로 숨으면 켤 수가 없다.
        let optionDown = NSEvent.modifierFlags.contains(.option)
        if !isHidden, optionDown { sawOption = true }
        if shouldHideOnOption(visible: !isHidden, armed: hideOnOption, sawOption: sawOption,
                              shownFor: Date().timeIntervalSince(armAt),
                              optionDown: optionDown, grace: optionGrace) {
            debugLog("옵션을 뗐다 → 숨김")
            setHidden(true)
        }
        flushInbound()
        if autoRoom {
            counterTick += pollInterval
            if counterTick >= 1 {
                counterTick = 0
                let counts = net.drainCounters()
                debugLog("역할=\(net.role) 코드=\(net.code ?? "-") 상대=\(net.peerCount) "
                       + "보냄=\(counts.sent)/s 받음=\(counts.received)/s")
            }
        }
        guard !isHidden, !held.isEmpty else { return }
        if !NSEvent.modifierFlags.contains(.option) {
            releaseAll()
            return
        }
        // 누른 직후 잠깐은 봐준다. keyState 가 어떤 이유로든 눌림을 못 보는 기기에서도
        // 한 번 누르면 한 걸음은 나가게 하는 하한선이다 — 최악이 「안 움직임」이 되면 안 된다.
        let now = Date.timeIntervalSinceReferenceDate
        for (action, since) in held where now - since > 0.12 && !isDown(action) {
            release(action)
        }
    }

    private func isDown(_ action: String) -> Bool {
        HK.codes(action).contains { CGEventSource.keyState(.combinedSessionState, key: $0) }
    }

    private func releaseAll() {
        for action in held.keys { send(action, false) }
        held.removeAll()
    }

    /// 지금 숨어 있나.
    private var isHidden = false

    /// 숨기기.
    ///
    /// 창을 화면에서 빼면 macOS 가 그 웹뷰의 requestAnimationFrame 을 초당 몇 번으로 죽인다.
    /// 혼자 할 때는 어차피 판이 멈추니 상관없지만 **같이 하는 중에는 그러면 안 된다** —
    /// 내 캐릭터가 남들 화면에서 굳고, 내가 방장이면 모두의 똥이 멈춘다.
    /// 창을 투명하게만 두는 것도 소용없다(투명한 창도 안 보이는 것으로 친다).
    /// 그래서 숨어 있는 동안은 **셸이 직접 60Hz 로 게임을 굴린다** — 아래 poll 을 보라.
    private func setHidden(_ hidden: Bool) {
        isHidden = hidden
        if hidden {
            window.orderOut(nil)
            unregisterPlayHotKeys()
        } else {
            moveToChosenScreen()
            window.orderFrontRegardless()
            registerPlayHotKeys()
            armAt = Date()
            sawOption = false
        }
        webView.evaluateJavaScript("window.__ddongVisible && window.__ddongVisible(\(!hidden))")
        refreshMenu()
    }

    @objc private func toggleWindow() {
        setHidden(!isHidden)
    }

    /// 웹뷰가 그린 것을 그대로 받아 파일로 떨군다. 시험 도구다.
    private func grabShot() {
        guard let shotDir else { return }
        let index = shotIndex
        shotIndex += 1
        webView.evaluateJavaScript("window.__ddongShot && window.__ddongShot('\(shotBackground)', \(shotScale), \(index))") { value, _ in
            guard let text = value as? String,
                  let comma = text.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(text[text.index(after: comma)...]))
            else { return }
            let name = String(format: "f%05d.jpg", index)
            try? data.write(to: shotDir.appendingPathComponent(name))
        }
    }

    @objc private func checkUpdate() { updater.check(quiet: false) }
    @objc private func installUpdate() { updater.install() }

    // MARK: 같이 하기

    /// 같이 하기 전에 이름을 한 번 확인받는다. 맥 계정 이름이 사람 이름이 아닌 경우가 흔해서,
    /// 안 물어보면 남들 화면에 「미니쉬테크」 같은 게 그대로 뜬다.
    /// - Returns: 계속해도 되면 true. 취소하면 false.
    private func confirmName() -> Bool {
        if hasNamed { return true }
        guard let typed = ask(title: "이 게임에서 쓸 이름",
                              body: "같이 하는 사람들 머리 위에 뜬다. \(nameMax)자까지.\n"
                                  + "맥 계정 이름을 넣어 두었으니 그게 아니면 고친다.",
                              placeholder: "이름", initial: playerName, limit: nameMax)
        else { return false }
        let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        playerName = trimmed
        return true
    }

    /// 방을 열고 **아무 창도 띄우지 않는다.**
    ///
    /// 코드를 알림창으로 알려 주던 자리다. 게임을 하려고 연 방인데 모달이 화면 한가운데
    /// 뜨면 그것부터 치워야 한다. 코드는 이미 두 군데에 있다 — 화면 오른쪽 위 종이쪽지와
    /// 메뉴 막대. 안 잡히는 와이파이용 `코드@아이피` 도 메뉴에 둔다.
    @objc private func makeRoom() {
        guard confirmName() else { return }
        guard net.host() != nil else { return }
        refreshMenu()
    }

    /// 게임을 골라 방을 연다. **웹이 그 게임으로 갈아 끼운 뒤에** 연다 —
    /// 먼저 열면 그 사이에 들어온 사람이 딴 게임 화면을 보게 된다.
    @objc private func hostGame(_ sender: NSMenuItem) {
        guard games.indices.contains(sender.tag) else { return }
        let id = games[sender.tag].id
        webView.evaluateJavaScript("window.__ddongPickGame && window.__ddongPickGame('\(id)')") {
            [weak self] _, _ in self?.makeRoom()
        }
    }

    /// 단말끼리의 통신을 막는 와이파이에서 쓰는 주소. `K3P9@192.168.0.5` 꼴.
    private func codeWithAddress() -> String? {
        guard let code = net.code, let ip = localAddress() else { return nil }
        return "\(code)@\(ip)"
    }

    @objc private func copyCodeWithAddress() {
        guard let full = codeWithAddress() else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(full, forType: .string)
    }

    @objc private func copyCode() {
        guard let code = net.code else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
    }

    @objc private func leaveRoom() {
        net.leave()
        pushNetRole()
        refreshMenu()
    }

    @objc private func askJoin() {
        guard confirmName() else { return }
        guard let typed = ask(title: "코드로 입장", body: "네 자리 코드를 친다. 방이 안 잡히면 코드@호스트IP 로.",
                              placeholder: "K3P9", initial: "")
        else { return }
        net.join(typed)
        refreshMenu()
    }

    @objc private func askName() {
        guard let typed = ask(title: "이름 바꾸기", body: "같이 하는 사람들 머리 위에 뜨는 이름이다. \(nameMax)자까지.",
                              placeholder: "이름", initial: playerName, limit: nameMax), !typed.isEmpty
        else { return }
        playerName = typed
    }

    /// 코드를 불러 줄 때 같이 알려 줄 내 주소. Bonjour 가 막힌 망에서 쓴다.
    private func localAddress() -> String? {
        var pointer: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&pointer) == 0, let first = pointer else { return nil }
        defer { freeifaddrs(pointer) }
        for item in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(item.pointee.ifa_flags)
            guard flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0,
                  item.pointee.ifa_addr?.pointee.sa_family == UInt8(AF_INET),
                  let name = item.pointee.ifa_name.map({ String(cString: $0) }),
                  name.hasPrefix("en") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(item.pointee.ifa_addr, socklen_t(item.pointee.ifa_addr.pointee.sa_len),
                           &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                return String(cString: host)
            }
        }
        return nil
    }

    // MARK: 창 띄우기

    /// 오버레이는 포커스를 안 가져가서 글자를 못 받는다. 코드를 칠 자리는 이렇게 따로 연다.
    private func ask(title: String, body: String, placeholder: String, initial: String,
                     limit: Int? = nil) -> String? {
        let panel = NSAlert()
        panel.messageText = title
        panel.informativeText = body
        panel.addButton(withTitle: "확인")
        panel.addButton(withTitle: "취소")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        field.placeholderString = placeholder
        field.stringValue = initial
        // 넘치면 아예 안 쳐진다. 잘려 나간 걸 나중에 알아채게 두지 않는다.
        if let limit { field.formatter = LengthLimit(limit) }
        panel.accessoryView = field
        NSApp.activate(ignoringOtherApps: true)
        panel.window.initialFirstResponder = field
        guard panel.runModal() == .alertFirstButtonReturn else { return nil }
        return field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func alert(title: String, body: String, copy: String? = nil) {
        let panel = NSAlert()
        panel.messageText = title
        panel.informativeText = body
        panel.addButton(withTitle: "확인")
        if copy != nil { panel.addButton(withTitle: "코드 복사") }
        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .alertSecondButtonReturn, let copy {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(copy, forType: .string)
        }
    }

    // MARK: 저장

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }

        switch type {
        case "log":
            FileHandle.standardError.write("[web] \(body["text"] as? String ?? "")\n".data(using: .utf8)!)
        case "menu":
            switch body["action"] as? String {
            case "host": makeRoom()
            case "join": askJoin()
            case "leave": leaveRoom()
            case "copy": copyCode()
            case "hide": toggleWindow()
            case "quit": NSApp.terminate(nil)
            default: break
            }
        case "screen":
            if let number = body["number"] as? Int { chooseScreen(number) }
        case "fade":
            if let value = body["value"] as? Double { windowFade = value }
        case "games":
            if let list = body["list"] as? [[String: Any]] {
                games = list.compactMap {
                    guard let id = $0["id"] as? String, let name = $0["name"] as? String
                    else { return nil }
                    return (id: id, name: name)
                }
                refreshMenu()
            }
        case "size":
            if let value = body["value"] as? Double { windowSize = value }
        case "spot":
            if let spot = body["spot"] as? String { windowSpot = spot }
        case "optionHide":
            if let on = body["on"] as? Bool { hideOnOption = on }
        case "kick":
            if let id = body["id"] as? Int {
                debugLog("내보냄 \(id)")
                net.kick(id)
                refreshMenu()
            }
        case "net":
            // 게임이 짠 꾸러미를 그대로 흘려보낸다. 셸은 안을 열어 보지 않는다.
            if let payload = body["payload"] as? String {
                let to = body["to"] as? Int ?? -1
                net.send(payload, to: to < 0 ? nil : to)
            }
        case "best":
            // 시간과 개수는 따로 갱신한다 — 오래 버틴 판과 많이 피한 판이 늘 같지는 않다.
            if let ms = body["ms"] as? Int, ms > bestMs { bestMs = ms }
            if let dodged = body["dodged"] as? Int, dodged > bestDodged { bestDodged = dodged }
            refreshMenu()
        default:
            break
        }
    }
}

// MARK: - 전송 계층에서 올라오는 것들

extension App: NetDelegate {
    /// **반드시 메인 스레드에서 한다.**
    ///
    /// 전송 계층은 자기 큐에서 돌고, 거기서 그대로 웹뷰를 건드리면 안 된다 —
    /// evaluateJavaScript 는 메인 스레드 전용이라 다른 스레드에서 부르면 **아무 말 없이
    /// 안 먹는다.** 손님 이름이 「누군가」로 남아 있던 게 이것 때문이었다.
    /// 배열(inbound)도 여기서만 만지게 해서 두 스레드가 같이 손대는 일을 없앤다.
    private func onMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread { block() } else { DispatchQueue.main.async(execute: block) }
    }

    func netRoleChanged(role: String, code: String?, myId: Int, note: String?) {
        onMain { [self] in
            pushNetRole()
            refreshMenu()
            guard let note else { return }
            debugLog("알림: \(note)")
            if !autoRoom { alert(title: "같이 하기", body: note) }
        }
    }

    func netPeerChanged(id: Int, name: String, joined: Bool) {
        onMain { [self] in
            debugLog("\(name)(\(id)) \(joined ? "들어옴" : "나감")")
            webView.evaluateJavaScript(
                "window.__ddongNetPeer && window.__ddongNetPeer(\(id), \(jsLiteral(name)), \(joined))")
            refreshMenu()
        }
    }

    /// 바로 안 넘기고 모은다. 넘기는 일은 60Hz 짜리 poll 이 한다.
    func netReceived(from: Int, json: String) {
        // 남이 보낸 글자다. **JSON 인지 여기서 확인하고** 아니면 버린다 —
        // 확인 없이 배열에 이어 붙이면 깨진 한 줄이 그 프레임 전체를 날린다.
        guard let data = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil
        else { return }
        // 배열은 메인 스레드에서만 만진다. 여기는 전송 계층의 큐라, 그대로 이어 붙이면
        // 60Hz 로 읽는 poll 과 두 스레드가 같은 배열을 동시에 손대게 된다.
        onMain { [self] in
            inbound.append("[\(from),\(json)]")
            if inbound.count > 512 { inbound.removeFirst(inbound.count - 512) }
        }
    }

    private func flushInbound() {
        guard !inbound.isEmpty else { return }
        let batch = "[" + inbound.joined(separator: ",") + "]"
        inbound.removeAll(keepingCapacity: true)
        webView.evaluateJavaScript("window.__ddongNetBatch && window.__ddongNetBatch(\(jsLiteral(batch)))")
    }
}

private extension NSScreen {
    var number: Int { (deviceDescription[.init("NSScreenNumber")] as? NSNumber)?.intValue ?? 0 }
}

// MARK: - 시작

let app = NSApplication.shared
let delegate = App()
App.shared = delegate
app.delegate = delegate
// Dock 아이콘도 메뉴 막대 메뉴도 없다. 조작 창구는 상태 아이콘뿐 (Info.plist 의 LSUIElement 와 같은 뜻).
app.setActivationPolicy(.accessory)
app.run()
