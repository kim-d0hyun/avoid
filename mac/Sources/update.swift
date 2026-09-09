// 새 버전 받아 오기.
//
// 서버를 두지 않는다. GitHub 릴리스를 그냥 읽는다 — 공개 리포라 토큰도 필요 없다.
// 흐름은 이렇다: 태그를 밀면 CI 가 빌드해서 zip 을 릴리스에 붙이고, 앱은 그걸 보고
// 받아서 자기를 갈아 끼운 뒤 다시 뜬다.
//
// **dmg 가 아니라 zip 을 받는다.** dmg 를 마운트해서 자기를 갈아 끼우려면 실패할 자리가
// 너무 많다. zip 은 풀어서 폴더 하나 바꿔치기하면 끝난다.

import AppKit

private let releaseAPI = "https://api.github.com/repos/kim-d0hyun/avoid/releases/latest"
let releasePage = "https://github.com/kim-d0hyun/avoid/releases/latest"
/// CI 가 붙이는 자산 이름의 끝. 이걸로 dmg 와 가른다.
private let assetSuffix = "-mac.zip"
private let checkInterval: TimeInterval = 24 * 60 * 60
private let firstCheckDelay: TimeInterval = 20

var appVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
}

/// "v1.10.0" 이 "1.9.0" 보다 크다. 문자열로 비교하면 1.10 이 1.9 보다 작다고 나온다.
func isNewer(_ candidate: String, than current: String) -> Bool {
    func parts(_ text: String) -> [Int] {
        text.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
            .split(separator: ".").map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }
    let a = parts(candidate), b = parts(current)
    for i in 0..<max(a.count, b.count) {
        let x = i < a.count ? a[i] : 0
        let y = i < b.count ? b[i] : 0
        if x != y { return x > y }
    }
    return false
}

struct Release {
    let version: String
    let zip: URL
}

final class Updater {
    /// 새 버전이 있을 때만 채워진다.
    private(set) var pending: Release?
    /// 받는 중인가. 메뉴를 두 번 누르는 걸 막고 진행 상태를 글씨로 보여 준다.
    private(set) var busy = false
    private(set) var note: String?

    var onChange: (() -> Void)?

    func start() {
        DispatchQueue.main.asyncAfter(deadline: .now() + firstCheckDelay) { [weak self] in
            self?.check(quiet: true)
        }
        Timer.scheduledTimer(withTimeInterval: checkInterval, repeats: true) { [weak self] _ in
            self?.check(quiet: true)
        }
    }

    /// quiet 이면 없을 때 아무 말도 안 한다. 사람이 직접 누른 확인은 결과를 알려 준다.
    func check(quiet: Bool) {
        var request = URLRequest(url: URL(string: releaseAPI)!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 12

        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            guard let self else { return }
            DispatchQueue.main.async {
                guard let data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let tag = json["tag_name"] as? String
                else {
                    if !quiet { self.say("새 버전을 확인하지 못했다 (\(error?.localizedDescription ?? "응답 없음"))") }
                    return
                }
                guard isNewer(tag, than: appVersion) else {
                    self.pending = nil
                    if !quiet { self.say("지금이 최신이다 (v\(appVersion))") }
                    self.onChange?()
                    return
                }
                let assets = json["assets"] as? [[String: Any]] ?? []
                guard let asset = assets.first(where: { ($0["name"] as? String)?.hasSuffix(assetSuffix) == true }),
                      let link = asset["browser_download_url"] as? String, let zip = URL(string: link)
                else {
                    if !quiet { self.say("새 버전 \(tag) 이 있는데 받을 파일이 안 붙어 있다") }
                    return
                }
                self.pending = Release(version: tag, zip: zip)
                self.onChange?()
                if !quiet { self.say("새 버전 \(tag) 이 있다. 메뉴 막대에서 받으면 된다") }
            }
        }.resume()
    }

    /// 받아서 자기를 갈아 끼우고 다시 뜬다.
    func install() {
        guard let pending, !busy else { return }
        busy = true
        note = "받는 중…"
        onChange?()

        URLSession.shared.downloadTask(with: pending.zip) { [weak self] file, _, error in
            guard let self else { return }
            guard let file else {
                DispatchQueue.main.async { self.fail("받지 못했다 (\(error?.localizedDescription ?? "?"))") }
                return
            }
            // 다운로드 임시 파일은 이 블록을 벗어나면 사라진다. 옆에 옮겨 두고 작업한다.
            let work = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("ddong-update-\(UUID().uuidString)")
            let zip = work.appendingPathComponent("app.zip")
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: file, to: zip)
            } catch {
                DispatchQueue.main.async { self.fail("임시 폴더를 못 만들었다") }
                return
            }
            DispatchQueue.main.async { self.swapIn(zip: zip, work: work) }
        }.resume()
    }

    private func swapIn(zip: URL, work: URL) {
        note = "바꿔 끼우는 중…"
        onChange?()

        let unpacked = work.appendingPathComponent("new")
        guard run("/usr/bin/ditto", ["-x", "-k", zip.path, unpacked.path]) else {
            fail("압축을 못 풀었다")
            return
        }
        guard let found = (try? FileManager.default.contentsOfDirectory(at: unpacked,
                                                                       includingPropertiesForKeys: nil))?
            .first(where: { $0.pathExtension == "app" })
        else {
            fail("받은 파일 안에 앱이 없다")
            return
        }
        // 우리가 직접 받은 것이라 대개 안 붙지만, 붙어 있으면 갈아 끼운 뒤 안 열린다.
        _ = run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", found.path])

        let here = Bundle.main.bundleURL
        do {
            _ = try FileManager.default.replaceItemAt(here, withItemAt: found)
        } catch {
            // /Applications 에 쓸 권한이 없는 경우가 대부분이다. 받는 곳을 열어 준다.
            fail("갈아 끼우지 못했다. 직접 받아서 덮어써야 한다")
            NSWorkspace.shared.open(URL(string: releasePage)!)
            return
        }
        try? FileManager.default.removeItem(at: work)

        // 새것을 띄우고 나는 빠진다. -n 으로 같은 앱을 새로 띄운다.
        let launch = Process()
        launch.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        launch.arguments = ["-n", here.path]
        try? launch.run()
        NSApp.terminate(nil)
    }

    private func run(_ tool: String, _ arguments: [String]) -> Bool {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: tool)
        task.arguments = arguments
        do { try task.run() } catch { return false }
        task.waitUntilExit()
        return task.terminationStatus == 0
    }

    private func fail(_ text: String) {
        busy = false
        note = nil
        onChange?()
        say(text)
    }

    private func say(_ text: String) {
        let panel = NSAlert()
        panel.messageText = "업데이트"
        panel.informativeText = text
        panel.addButton(withTitle: "확인")
        NSApp.activate(ignoringOtherApps: true)
        panel.runModal()
    }
}
