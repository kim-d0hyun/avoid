// 같은 와이파이에서 **몰겜을 켜 둔 사람들**을 서로 안다. 그리고 한 사람이 「모두 부르기」를 누르면
// 나머지 맥에 알림이 뜬다.
//
// 방(net.swift)과는 따로 간다. 방은 연 사람만 광고하지만, 이건 **켜 둔 사람 모두**가 광고한다 —
// 방에 없는 사람도 목록에 떠야 부를 수 있다. 서버도 새 연결도 없다: 각자 Bonjour 이름표(TXT)에
// 「누구 · 어느 방 · 무슨 게임」을 적어 두고, 서로 그걸 듣기만 한다.
//
// **부르기도 이름표로 한다.** 부르는 사람이 제 이름표에 `c=방코드:시각` 을 적으면, 듣고 있던
// 맥들이 새 부름을 보고 알림을 띄운다. 따로 말을 보낼 줄이 없어도 되고, 켜 둔 사람 모두에게
// 한꺼번에 간다. 부름은 CALL_LIFE 뒤 지운다 — 늦게 켠 사람이 옛 부름에 불려 가지 않게.

import Foundation
import Network

let presenceServiceType = "_ddong-here._tcp"
/// 부름이 이름표에 남아 있는 시간. 이 안에 켠 사람도 알림을 받는다.
let callLife: TimeInterval = 90
/// 너무 자주 못 부른다. 한 번 부르면 **그 사람은** 이만큼 다시 못 부른다 — 사람마다 따로 센다
/// (보람을 불렀다고 도현까지 못 부르면 안 된다). 「모두 부르기」는 모두 부르기끼리 센다.
let callCooldown: TimeInterval = 10
/// 이름표에 한꺼번에 싣는 부름 수. 값 하나가 255바이트까지라 넉넉히 줄여 둔다.
private let callsMax = 6
typealias Call = (room: String, at: Int, to: String?)

/// 목록에 뜨는 한 사람. 이름표에 적힌 것만 안다.
struct OnlinePerson {
    /// Bonjour 이름. 앱마다 한 번 뽑아 두고 계속 쓴다 — 이름을 바꿔도 같은 사람이다.
    let id: String
    let name: String
    let version: String
    /// 들어가 있는 방 코드. 방에 없으면 빈 문자열.
    let room: String
    let game: String
    /// 그 방을 연 사람인가.
    let host: Bool
    /// 지금 내고 있는 부름들 — 방 · 부른 시각(초) · 한 사람만 부르면 그 사람.
    let calls: [Call]
    var mine = false
    var old: Bool { !version.isEmpty && version != appVersion }
}

protocol PresenceDelegate: AnyObject {
    /// 켜 둔 사람 목록이 바뀌었다.
    func presenceChanged()
    /// 누가 나를 불렀다 (한 부름에 한 번만 온다).
    func presenceCalled(by person: OnlinePerson, room: String)
}

final class Presence {
    weak var delegate: PresenceDelegate?

    /// 이 앱의 Bonjour 이름. 한 번 뽑아 두고 계속 쓴다.
    let id: String
    private(set) var people: [OnlinePerson] = []

    private var name: String
    private var room = ""
    private var game = ""
    private var host = false
    /// 내고 있는 부름들. **여럿을 같이 싣는다** — 한 칸에 하나만 두면, 보람을 부르고 곧바로 도현을
    /// 부를 때 보람이 아직 못 본 부름이 덮여 사라진다.
    private var calls: [Call] = []
    private var callTimer: Timer?
    /// 마지막으로 부른 때 — 사람마다 (모두 부르기는 "" 칸).
    private var lastCall: [String: Date] = [:]

    private var listener: NWListener?
    private var browser: NWBrowser?
    /// 이미 알린 부름. 「누가 · 어느 방 · 언제」가 같으면 두 번 안 띄운다.
    private var heard: Set<String> = []
    private var started = false

    init(id: String, name: String) {
        self.id = id
        self.name = name
    }

    func start() {
        guard !started else { return }
        started = true
        advertise()
        watch()
    }

    /// 내 이름표를 새로 적는다. 방에 들어가고 나갈 때 · 이름을 바꿀 때 · 게임을 바꿀 때 부른다.
    func update(name: String, room: String?, game: String, host: Bool) {
        let room = room ?? ""
        let changed = name != self.name || room != self.room || game != self.game || host != self.host
        self.name = name
        self.room = room
        self.game = game
        self.host = host
        // 방을 떠났으면 그 방으로 부르던 것도 거둔다.
        calls.removeAll { $0.room != room }
        guard changed else { return }
        republish()
        rebuild()
    }

    /// 지금 있는 방으로 모두를 부른다. 방에 없거나 방금 불렀으면 false.
    @discardableResult
    func callEveryone() -> Bool { callOut(to: nil) }

    /// 한 사람만 부른다 (접속 중 목록에서 골랐을 때). 쿨다운은 그 사람 몫만 센다.
    @discardableResult
    func invite(_ person: String) -> Bool {
        guard person != id, seen.contains(where: { $0.id == person }) else { return false }
        return callOut(to: person)
    }

    private func callOut(to target: String?) -> Bool {
        guard !room.isEmpty, wait(for: target) == 0 else { return false }
        lastCall[target ?? ""] = Date()
        let now = Int(Date().timeIntervalSince1970)
        // 같은 사람(또는 모두)에게 내던 옛 부름은 새것으로 바꾸고, 식은 것은 걷는다.
        calls.removeAll { $0.to == target || now - $0.at >= Int(callLife) }
        calls.append((room, now, target))
        if calls.count > callsMax { calls.removeFirst(calls.count - callsMax) }
        republish()
        rebuild()
        scheduleExpiry()
        debugLog("\(target == nil ? "모두 부르기" : "한 사람 부르기(\(target!))") → 방 \(room)")
        return true
    }

    /// 제일 먼저 식는 부름이 식을 때 걷는다.
    private func scheduleExpiry() {
        callTimer?.invalidate()
        guard let first = calls.map({ $0.at }).min() else { return }
        let left = max(0.5, Double(first) + callLife - Date().timeIntervalSince1970)
        callTimer = Timer.scheduledTimer(withTimeInterval: left, repeats: false) { [weak self] _ in
            guard let self else { return }
            let now = Int(Date().timeIntervalSince1970)
            self.calls.removeAll { now - $0.at >= Int(callLife) - 1 }
            self.republish()
            self.rebuild()
            self.scheduleExpiry()
        }
    }

    /// 그 사람(nil 이면 모두 부르기)을 다시 부를 수 있기까지 남은 초. 0 이면 지금 된다.
    func wait(for target: String?) -> Int {
        guard let last = lastCall[target ?? ""] else { return 0 }
        return max(0, Int(ceil(callCooldown - Date().timeIntervalSince(last))))
    }

    /// 「모두 부르기」를 다시 할 수 있기까지 남은 초.
    var callWait: Int { wait(for: nil) }

    // MARK: 광고

    private func fields() -> [String: String] {
        var fields = ["v": appVersion, "n": name]
        if !room.isEmpty { fields["r"] = room }
        if !game.isEmpty { fields["g"] = game }
        if host { fields["h"] = "1" }
        // 부름들 — `방:시각[:받는사람]` 을 ; 로 잇는다. 한 사람만 부를 때는 그 사람의 Bonjour 이름을
        // 붙인다 — 나머지는 이걸 보고 지나간다.
        if !calls.isEmpty {
            fields["c"] = calls.map { "\($0.room):\($0.at)" + ($0.to.map { ":\($0)" } ?? "") }.joined(separator: ";")
        }
        return fields
    }

    private func service() -> NWListener.Service {
        NWListener.Service(name: id, type: presenceServiceType, domain: nil,
                           txtRecord: NWTXTRecord(fields()).data)
    }

    /// 광고만 하는 귀. 붙어 오는 사람은 없다 — 오면 바로 끊는다 (이름표를 걸어 둘 자리가 필요할 뿐이다).
    private func advertise() {
        let params = NWParameters.tcp
        params.includePeerToPeer = false
        guard let listener = try? NWListener(using: params) else {
            debugLog("접속 알림 광고를 못 열었다 — 5초 뒤 다시")
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.advertise() }
            return
        }
        listener.service = service()
        listener.newConnectionHandler = { connection in connection.cancel() }
        listener.stateUpdateHandler = { [weak self] state in
            guard let self, self.listener === listener else { return }
            switch state {
            case .failed(let error):
                debugLog("접속 알림 광고가 멈췄다(\(error)) — 5초 뒤 다시")
                listener.cancel()
                self.listener = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.advertise() }
            default: break
            }
        }
        listener.start(queue: .main)
        self.listener = listener
    }

    private func republish() {
        listener?.service = service()
    }

    // MARK: 듣기

    /// 방 목록과 같은 처방이다 — **이름표까지 달라고 해야 오고**(`.bonjourWithTXTRecord`),
    /// `.waiting` 에 갇히면 결과도 실패도 안 주니 3초 뒤 다시 건다.
    private func watch() {
        guard browser == nil else { return }
        let params = NWParameters()
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: presenceServiceType, domain: nil), using: params)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self else { return }
            var found: [OnlinePerson] = []
            for result in results {
                guard case .service(let name, _, _, _) = result.endpoint, name != self.id else { continue }
                var txt: [String: String] = [:]
                if case .bonjour(let record) = result.metadata {
                    for key in ["n", "v", "r", "g", "h", "c"] { if let value = record[key] { txt[key] = value } }
                }
                // **이름표가 바뀌는 순간 빈 이름표가 한 번 온다** — 그대로 쓰면 목록에 이름 없는 사람이
                // 「쉬는 중」으로 끼었다가 돌아온다. 이름표에는 늘 버전(v)이 있으니, 없으면 알던 대로 둔다.
                if txt["v"] == nil, let known = self.seen.first(where: { $0.id == name }) {
                    found.append(known)
                    continue
                }
                found.append(Presence.person(id: name, txt))
            }
            DispatchQueue.main.async {
                self.seen = found
                self.rebuild()
                self.listen(found)
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            guard let self, self.browser === browser else { return }
            switch state {
            case .failed, .cancelled, .waiting:
                debugLog("접속 목록 브라우저가 멈췄다(\(state)) — 3초 뒤 다시")
                browser.cancel()
                self.browser = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.watch() }
            default: break
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    /// 메뉴를 열 때처럼 사람이 **보려고** 하는 순간 다시 건다 (방 목록과 같다).
    func refresh() {
        browser?.cancel()
        browser = nil
        watch()
    }

    /// 이름표 한 장을 사람 하나로. **남이 적은 글자라 모양을 안 믿는다.**
    static func person(id: String, _ txt: [String: String]) -> OnlinePerson {
        var calls: [Call] = []
        for raw in (txt["c"] ?? "").split(separator: ";").prefix(callsMax) {
            let bits = raw.split(separator: ":", maxSplits: 2).map(String.init)
            if bits.count >= 2, bits[0].count == 4, let at = Int(bits[1]) {
                calls.append((bits[0].uppercased(), at, bits.count == 3 ? bits[2] : nil))
            }
        }
        let room = (txt["r"] ?? "").uppercased()
        return OnlinePerson(id: id, name: String((txt["n"] ?? "").prefix(24)), version: txt["v"] ?? "",
                            room: room.count == 4 ? room : "", game: txt["g"] ?? "",
                            host: txt["h"] == "1", calls: calls)
    }

    /// 브라우저가 알려 준 것만 따로 (나를 얹기 전의 날것).
    private var seen: [OnlinePerson] = []

    /// **나는 브라우저가 안 알려 준다** (같은 프로세스 광고). 목록 맨 위에 내가 아는 값으로 얹는다.
    private func rebuild() {
        let me = OnlinePerson(id: id, name: name, version: appVersion, room: room, game: game,
                              host: host, calls: calls, mine: true)
        let rows = [me] + seen.sorted {
            // 방에 있는 사람이 먼저, 그다음 이름 순.
            if $0.room.isEmpty != $1.room.isEmpty { return !$0.room.isEmpty }
            return $0.name < $1.name
        }
        let same = rows.count == people.count && zip(rows, people).allSatisfy {
            $0.id == $1.id && $0.name == $1.name && $0.room == $1.room && $0.game == $1.game
                && $0.host == $1.host && $0.version == $1.version
        }
        people = rows
        if !same { delegate?.presenceChanged() }
    }

    /// 새 부름이 있나 본다.
    private func listen(_ found: [OnlinePerson]) {
        let now = Int(Date().timeIntervalSince1970)
        for person in found {
          for call in person.calls {
            let key = "\(person.id)|\(call.room)|\(call.at)|\(call.to ?? "")"
            guard !heard.contains(key) else { continue }
            heard.insert(key)
            // 딴 사람을 부른 것이다.
            if let to = call.to, to != id { continue }
            // 오래된 부름은 안 띄운다 — 두 맥의 시계가 조금 달라도 넉넉하게 본다.
            guard abs(now - call.at) <= Int(callLife) + 30 else { continue }
            // 이미 그 방에 있으면 「모두 부르기」는 지나간다. **나만 콕 집어 불렀으면** 같은 방이어도 띄운다 —
            // 방에 들어와 놓고 딴 데 가 있는 사람을 판으로 불러오는 것이다.
            guard call.room != room || call.to == id else { continue }
            debugLog("\(person.name) 이(가) 방 \(call.room) 으로 부른다")
            delegate?.presenceCalled(by: person, room: call.room)
          }
        }
        if heard.count > 256 { heard = Set(heard.suffix(128)) }
    }
}
