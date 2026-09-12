// 같은 와이파이 안에서 방을 열고 붙는 일만 한다.
//
// 서버가 없다. **방을 만든 사람의 맥이 곧 서버다** — Bonjour 로 방 코드를 광고하고,
// 코드를 친 사람이 그 맥에 TCP 로 직접 붙는다. 호스팅도 계정도 인터넷도 필요 없다.
//
// 이 파일은 게임을 하나도 모른다. 줄바꿈으로 끊은 JSON 문자열을 나르고, 누가 들어오고
// 나갔는지 알려 줄 뿐이다. 규칙은 전부 웹 쪽에 있다 — 그래야 나중에 이 파일만 갈아 끼워
// 중계 서버 방식으로 바꿀 수 있다.

import Foundation
import Network

let netServiceType = "_ddong._tcp"
/// 주고받는 꾸러미의 모양 번호. **꾸러미에 칸을 더하거나 뜻을 바꾸면 반드시 올린다.**
/// 이게 없으면 몇 명만 업데이트한 사무실에서 구·신 버전이 아무 말 없이 붙어 조용히 어긋난다.
let netProtocol = 7
/// 고정 포트. Bonjour 가 막힌 망에서 `코드@192.168.0.7` 로 직접 붙을 수 있어야 해서 고정한다.
let netDefaultPort: UInt16 = 51301

/// 헷갈리는 글자는 뺀다 — I·l·1, O·0 을 부르다 잘못 듣는 일이 없어야 한다.
private let codeLetters = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")
private let codeDigits = Array("23456789")

/// 영문 대문자와 숫자를 **반드시 섞어서** 네 자리. 전부 숫자거나 전부 글자면 다시 뽑는다.
func makeRoomCode() -> String {
    var chars: [Character] = [codeLetters.randomElement()!, codeDigits.randomElement()!]
    for _ in 0..<2 {
        chars.append(Bool.random() ? codeLetters.randomElement()! : codeDigits.randomElement()!)
    }
    return String(chars.shuffled())
}

/// 같은 랜에서 쓰는 내 IPv4. 방 정보에 실어 보내려고 쓴다.
///
/// Bonjour 가 알려 주는 이름(`...local.`)이 **IPv6 링크로컬로만 풀리는 맥이 많다.**
/// 사내 AP 가 단말 간 IPv6 를 막거나 불안정하면 붙었다가 바로 끊긴다 —
/// 그래서 이름에 기대지 않고 숫자 주소를 직접 알려 준다.
func localIPv4() -> String? {
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

/// TCP 설정 한 벌. **IPv4 로 못 박는다** — 링크로컬 IPv6 로 붙으면 망에 따라 조용히 끊긴다.
/// 살아 있는지도 자주 확인해서, 죽은 줄을 붙잡고 있지 않게 한다.
private func lanParameters() -> NWParameters {
    let tcp = NWProtocolTCP.Options()
    tcp.noDelay = true            // 60Hz 짜리 작은 꾸러미다. 모아 보내면 그게 곧 렉이다.
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 2
    tcp.keepaliveInterval = 2
    tcp.keepaliveCount = 3
    tcp.connectionTimeout = 5
    let params = NWParameters(tls: nil, tcp: tcp)
    if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
        ip.version = .v4
    }
    return params
}

/// 방 이름을 풀어 **IPv4 주소를 꺼내 준다.**
///
/// NWBrowser 가 주는 이름표(TXT)는 같은 맥 안에서 찾을 때처럼 비어 오는 경우가 있고,
/// 이름(`...local.`)을 그대로 쓰면 맥에 따라 IPv6 링크로컬로만 풀린다. 그 길은 사내 AP 에서
/// 붙었다가 끊기는 원인이다. 그래서 예전 API 로 한 번 더 풀어 **숫자 IPv4 를 직접 집는다.**
final class Resolver: NSObject, NetServiceDelegate {
    private let service: NetService
    private var done: (([NWEndpoint]) -> Void)?

    init(room: String) {
        service = NetService(domain: "local.", type: netServiceType + ".", name: room)
        super.init()
        service.delegate = self
    }

    func resolve(timeout: TimeInterval, _ done: @escaping ([NWEndpoint]) -> Void) {
        self.done = done
        service.resolve(withTimeout: timeout)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let port = NWEndpoint.Port(rawValue: UInt16(sender.port)) else { finish([]); return }
        // 상대 맥에 주소가 여럿일 수 있다 (와이파이·이더넷·VPN). **전부 모아** 두고
        // 차례로 해 본다 — 첫 번째가 닿지 않는 길인 경우가 실제로 있다.
        var found: [NWEndpoint] = []
        for data in sender.addresses ?? [] {
            let text: String? = data.withUnsafeBytes { raw in
                guard let base = raw.baseAddress?.assumingMemoryBound(to: sockaddr.self),
                      base.pointee.sa_family == UInt8(AF_INET) else { return nil }
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                guard getnameinfo(base, socklen_t(base.pointee.sa_len), &host, socklen_t(host.count),
                                  nil, 0, NI_NUMERICHOST) == 0 else { return nil }
                return String(cString: host)
            }
            guard let text, !found.contains(where: { "\($0)" == "\(text):\(port.rawValue)" }) else { continue }
            found.append(.hostPort(host: NWEndpoint.Host(text), port: port))
        }
        finish(found)
    }

    func netService(_ sender: NetService, didNotResolve error: [String: NSNumber]) {
        finish([])
    }

    private func finish(_ endpoints: [NWEndpoint]) {
        service.stop()
        let callback = done
        done = nil
        callback?(endpoints)
    }
}

protocol NetDelegate: AnyObject {
    /// 역할이 바뀌었다. role 은 off / host / guest.
    func netRoleChanged(role: String, code: String?, myId: Int, note: String?)
    func netPeerChanged(id: Int, name: String, joined: Bool)
    func netReceived(from: Int, json: String)
}

private final class Peer {
    let id: Int
    let connection: NWConnection
    var name = ""
    var buffer = Data()
    var ready = false
    init(id: Int, connection: NWConnection) {
        self.id = id
        self.connection = connection
    }
}

final class Net {
    weak var delegate: NetDelegate?

    private(set) var role = "off"
    private(set) var code: String?
    private(set) var myId = 0
    var myName: String

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var resolver: Resolver?
    private var peers: [Int: Peer] = [:]
    private var nextId = 1
    /// 손님일 때 호스트로 가는 줄. 손님에게 peers 는 이것 하나뿐이다.
    private var uplink: Peer?
    /// 붙어 볼 주소들. 앞에서부터 하나씩, 안 되면 다음 것으로 넘어간다.
    private var candidates: [NWEndpoint] = []
    private var attempt = 0
    private var joinedAt: Date?

    init(name: String) {
        myName = name
    }

    // MARK: 방 열기

    func host() -> String? {
        leave()
        let room = makeRoomCode()
        let params = lanParameters()

        // 포트가 이미 쓰이고 있으면 아무 포트나 잡는다.
        let listener: NWListener
        var known: UInt16? = netDefaultPort
        do {
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: netDefaultPort)!)
        } catch {
            guard let fallback = try? NWListener(using: params) else {
                delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: "방을 열지 못했다")
                return nil
            }
            listener = fallback
            known = nil // 뜬 뒤에야 알 수 있다
        }

        // 이름표는 **시작 전에** 박는다. 뜬 뒤에 바꾸면 이미 방을 본 손님은 옛 이름표를 들고 있어
        // 주소를 못 읽고 이름으로 붙으려 한다 — 그 길이 바로 IPv6 링크로컬로 새는 길이다.
        listener.service = Net.service(room: room, port: known)
        listener.newConnectionHandler = { [weak self] connection in
            DispatchQueue.main.async { self?.accept(connection) }
        }
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                let port = listener.port?.rawValue ?? netDefaultPort
                // 기본 포트를 못 잡아 다른 포트로 떴을 때만 이름표를 고친다.
                if known != port { listener.service = Net.service(room: room, port: port) }
                debugLog("방 열림 \(localIPv4() ?? "?"):\(port)")
            case .failed(let error):
                DispatchQueue.main.async {
                    self?.leave()
                    self?.delegate?.netRoleChanged(role: "off", code: nil, myId: 0,
                                                   note: Net.why(error))
                }
            default:
                break
            }
        }
        listener.start(queue: .main)

        self.listener = listener
        role = "host"
        code = room
        myId = 0
        delegate?.netRoleChanged(role: role, code: room, myId: 0, note: nil)
        return room
    }

    /// 방 이름표. **내 숫자 주소를 적어 둔다** — 손님이 이름을 풀지 않고 여기로 바로 오게.
    private static func service(room: String, port: UInt16?) -> NWListener.Service {
        var fields = ["v": appVersion]
        if let ip = localIPv4() { fields["ip"] = ip }
        if let port { fields["port"] = String(port) }
        return NWListener.Service(name: room, type: netServiceType, domain: nil,
                                  txtRecord: NWTXTRecord(fields).data)
    }

    // MARK: 방 찾아 들어가기

    /// `K3P9` 면 Bonjour 로 찾고, `K3P9@192.168.0.7` 이면 그 주소로 바로 붙는다.
    /// 뒤쪽 길을 남겨 두는 이유는 회사 와이파이가 단말끼리의 통신을 막는 일이 흔해서다.
    func join(_ input: String) {
        leave()
        let parts = input.uppercased().split(separator: "@", maxSplits: 1)
        let room = String(parts[0]).trimmingCharacters(in: .whitespaces)
        guard room.count == 4 else {
            delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: "코드는 네 자리다")
            return
        }
        code = room
        role = "guest"

        if parts.count == 2 {
            let hostPart = String(parts[1]).lowercased()
            let bits = hostPart.split(separator: ":", maxSplits: 1)
            let port = bits.count == 2 ? (UInt16(bits[1]) ?? netDefaultPort) : netDefaultPort
            start(candidates: [.hostPort(host: NWEndpoint.Host(String(bits[0])),
                                          port: NWEndpoint.Port(rawValue: port)!)])
            return
        }
        findOnLAN(room)
    }

    private func findOnLAN(_ room: String) {
        // 피어투피어(AWDL)는 끄고 진짜 와이파이·이더넷만 쓴다. 켜 두면 같은 망에 있는데도
        // 닿지 않는 주소를 물어 와, 붙자마자 끊기는 일이 생긴다.
        let params = NWParameters()
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjour(type: netServiceType, domain: nil), using: params)

        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.uplink == nil else { return }
            for result in results {
                guard case .service(let name, _, _, _) = result.endpoint, name == room else { continue }
                self.browser?.cancel()
                self.browser = nil

                // 이름표에 숫자 주소가 적혀 있으면 바로 쓴다. 없으면 직접 풀어서 IPv4 를 집는다.
                if case .bonjour(let txt) = result.metadata,
                   let ip = txt["ip"], !ip.isEmpty,
                   let port = NWEndpoint.Port(txt["port"] ?? String(netDefaultPort)) {
                    debugLog("방 찾음 → 이름표에 적힌 \(ip):\(port.rawValue)")
                    self.start(candidates: [.hostPort(host: NWEndpoint.Host(ip), port: port),
                                            result.endpoint])
                    return
                }

                let fallback = result.endpoint
                let resolver = Resolver(room: room)
                self.resolver = resolver
                resolver.resolve(timeout: 5) { [weak self] found in
                    guard let self, self.uplink == nil, self.role == "guest" else { return }
                    self.resolver = nil
                    debugLog("방 찾음 → 후보 \(found.map { "\($0)" }.joined(separator: ", "))"
                           + (found.isEmpty ? "IPv4 없음, 이름으로" : ""))
                    self.start(candidates: found.isEmpty ? [fallback] : found + [fallback])
                }
                return
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            guard case .failed = state else { return }
            DispatchQueue.main.async {
                self?.leave()
                self?.delegate?.netRoleChanged(role: "off", code: nil, myId: 0,
                                               note: "같은 와이파이에서 방을 찾지 못했다")
            }
        }
        browser.start(queue: .main)
        self.browser = browser

        // 못 찾으면 계속 기다리게 두지 않는다. 8초면 같은 망에 있는 방은 이미 보였다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self, self.role == "guest", self.uplink == nil else { return }
            self.leave()
            self.delegate?.netRoleChanged(
                role: "off", code: nil, myId: 0,
                note: "\(room) 방을 못 찾았다. 같은 와이파이인지 보고, 그래도 안 되면 코드@호스트IP 로 붙어라")
        }
    }

    /// **내 주소와 같은 대역을 먼저** 시도한다.
    ///
    /// 맥에는 가상머신·VPN 이 만든 인터페이스가 흔히 붙어 있어서, 이름을 풀면 실제 와이파이
    /// 주소 말고 `192.168.139.x` 같은 것들이 같이 나온다. 그걸 먼저 잡으면 닿지 않는 주소로
    /// 몇 초씩 기다리다 사람이 「안 되네」 하고 포기한다. 같은 랜에 있으면 앞 세 마디가 같다.
    private func ordered(_ list: [NWEndpoint]) -> [NWEndpoint] {
        let myPrefix = localIPv4().map { $0.split(separator: ".").dropLast().joined(separator: ".") }
        func rank(_ endpoint: NWEndpoint) -> Int {
            guard case .hostPort(let host, _) = endpoint else { return 3 } // 이름은 맨 뒤
            let text = "\(host)".split(separator: "%").first.map(String.init) ?? "\(host)"
            if let myPrefix, text.hasPrefix(myPrefix + ".") { return 0 }   // 같은 대역
            if text.hasPrefix("127.") { return 1 }                          // 같은 맥
            return 2
        }
        return list.enumerated()
            .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
            .map(\.element)
    }

    /// 후보를 앞에서부터 한 바퀴 돌고, 다 안 되면 한 바퀴 더 돈다 —
    /// 망이 잠깐 흔들린 것뿐일 수도 있어서 한 번 실패로 포기하지 않는다.
    private func start(candidates list: [NWEndpoint]) {
        candidates = ordered(list)
        attempt = 0
        debugLog("붙어 볼 순서: \(candidates.map { "\($0)" }.joined(separator: " → "))")
        guard let first = candidates.first else {
            delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: "붙을 주소를 못 찾았다")
            return
        }
        connect(to: first)
    }

    private func connect(to endpoint: NWEndpoint) {
        let connection = NWConnection(to: endpoint, using: lanParameters())
        let peer = Peer(id: 0, connection: connection) // 호스트는 언제나 0번
        uplink = peer

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.joinedAt = Date()
                debugLog("붙음 → \(connection.currentPath?.remoteEndpoint.map { "\($0)" } ?? "?")")
                let hello = #"{"t":"__join","name":"\#(Net.escape(self.myName))","#
                    + #""p":\#(netProtocol),"v":"\#(Net.escape(appVersion))"}"#
                self.line(peer, hello)
            case .failed(let error):
                debugLog("붙기 실패: \(error)")
                self.giveUpOrRetry(reason: "붙지 못했다 (\(error.localizedDescription))")
            case .cancelled:
                break
            default:
                break
            }
        }
        connection.start(queue: .main)
        receive(peer)
    }

    /// 붙는 데 실패했을 때. 후보를 두 번씩, 목록 끝까지 해 보고 그래도 안 되면 알린다.
    private func giveUpOrRetry(reason: String) {
        attempt += 1
        // 한 바퀴 돌고 한 바퀴 더. 나쁜 주소에 오래 매달리지 않으면서 흔들림에는 버틴다.
        let index = candidates.isEmpty ? 0 : attempt % candidates.count
        guard role == "guest", attempt < candidates.count * 2 else {
            leave()
            delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: reason)
            return
        }
        let next = candidates[index]
        debugLog("다시 붙어 본다 (\(attempt)번째, \(next))")
        uplink?.connection.cancel()
        uplink = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self, self.role == "guest", self.uplink == nil else { return }
            self.connect(to: next)
        }
    }

    // MARK: 손님 받기 (호스트)

    private func accept(_ connection: NWConnection) {
        let peer = Peer(id: nextId, connection: connection)
        nextId += 1
        peers[peer.id] = peer
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled:
                DispatchQueue.main.async { self?.drop(peer.id) }
            default:
                break
            }
        }
        connection.start(queue: .main)
        receive(peer)
    }

    private func drop(_ id: Int) {
        guard let peer = peers.removeValue(forKey: id) else { return }
        peer.connection.cancel()
        if peer.ready { delegate?.netPeerChanged(id: id, name: peer.name, joined: false) }
    }

    // MARK: 주고받기

    /// TCP 는 바이트 흐름이라 꾸러미 경계가 없다. 줄바꿈으로 끊는다.
    private func receive(_ peer: Peer) {
        peer.connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                peer.buffer.append(data)
                while let cut = peer.buffer.firstIndex(of: 0x0a) {
                    let line = peer.buffer[peer.buffer.startIndex..<cut]
                    peer.buffer.removeSubrange(peer.buffer.startIndex...cut)
                    if let text = String(data: line, encoding: .utf8), !text.isEmpty {
                        self.handle(peer, text)
                    }
                }
                // 줄바꿈 없이 계속 밀어 넣는 상대는 끊는다. 메모리를 먹게 두지 않는다.
                if peer.buffer.count > 1 << 20 { peer.buffer.removeAll() }
            }
            if isComplete || error != nil {
                if self.role == "guest" {
                    let joined = peer.ready
                    let lived = self.joinedAt.map { Date().timeIntervalSince($0) } ?? 0
                    debugLog("끊김 (handshake=\(joined ? "완료" : "미완료"), \(String(format: "%.1f", lived))초 뒤) "
                           + "\(error?.localizedDescription ?? "정상 종료")")
                    // 오래 놀다 끊긴 게 아니라면 망이 흔들린 것일 수 있다. 몇 번 더 해 본다.
                    let note = joined
                        ? "방과 끊겼다. 방장이 앱을 껐거나 와이파이가 끊겼을 수 있다."
                        : "방장에게 닿았는데 붙지 못했다. 두 맥 모두 확인해 보라 —\n"
                            + "① 시스템 설정 → 개인정보 보호 및 보안 → 로컬 네트워크 에서 「몰겜」 켜기\n"
                            + "② 메뉴 막대 💩 에서 두 사람 버전이 같은지 (다르면 업데이트 확인)"
                    if lived < 20 {
                        self.giveUpOrRetry(reason: note)
                    } else {
                        self.leave()
                        self.delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: note)
                    }
                } else {
                    self.drop(peer.id)
                }
                return
            }
            self.receive(peer)
        }
    }

    private func handle(_ peer: Peer, _ text: String) {
        // 이 층이 아는 말은 둘뿐이다. 나머지는 열어 보지 않고 위로 올린다.
        if text.hasPrefix(#"{"t":"__join""#) {
            // 꾸러미 모양이 다르면 들이지 않는다. 붙여 놓고 이상하게 노는 것보다 낫다.
            let theirs = Int(Net.field(text, "p") ?? "") ?? 0
            debugLog("들어오려 함: \(Net.field(text, "name") ?? "?") 규약=\(theirs) 버전=\(Net.field(text, "v") ?? "?")")
            guard theirs == netProtocol else {
                debugLog("규약 불일치로 거절 (내 규약 \(netProtocol))")
                line(peer, #"{"t":"__deny","v":"\#(Net.escape(appVersion))"}"#)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.drop(peer.id)
                }
                return
            }
            // 남이 보낸 이름이다. 여기서도 끊는다 — 남의 화면 이름표는 남이 정한다.
            peer.name = String((Net.field(text, "name") ?? "누군가").prefix(nameMax))
            peer.ready = true
            line(peer, #"{"t":"__id","id":\#(peer.id),"code":"\#(code ?? "")"}"#)
            delegate?.netPeerChanged(id: peer.id, name: peer.name, joined: true)
            return
        }
        if text.hasPrefix(#"{"t":"__deny""#) {
            let hostVersion = Net.field(text, "v") ?? "?"
            leave()
            // 규약 번호만 다르고 버전 문자열이 같을 수도 있다(직접 빌드한 것 등).
            // 그때 「v1.2.0 과 v1.2.0 이 다르다」고 하면 사람이 어리둥절해진다.
            let note = hostVersion == appVersion
                ? "방장과 이 앱의 내부 규약이 달라 같이 못 한다. 둘 다 최신으로 맞춰야 한다 "
                    + "(메뉴 막대 💩 → 업데이트 확인)."
                : "버전이 달라 같이 못 한다. 방장 v\(hostVersion) · 이 앱 v\(appVersion). "
                    + "메뉴 막대 💩 → 업데이트 확인 으로 새 버전을 받아라."
            delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: note)
            return
        }
        if text.hasPrefix(#"{"t":"__id""#) {
            myId = Int(Net.field(text, "id") ?? "") ?? 0
            peer.ready = true
            delegate?.netRoleChanged(role: "guest", code: code, myId: myId, note: nil)
            return
        }
        recvLines += 1
        delegate?.netReceived(from: peer.id, json: text)
    }

    private func line(_ peer: Peer, _ json: String) {
        guard let data = (json + "\n").data(using: .utf8) else { return }
        sentLines += 1
        peer.connection.send(content: data, completion: .idempotent)
    }

    /// to 가 nil 이면 모두에게. 손님이 부르면 어차피 호스트 하나뿐이다.
    func send(_ json: String, to: Int? = nil) {
        if let uplink {
            line(uplink, json)
            return
        }
        if let to {
            if let peer = peers[to], peer.ready { line(peer, json) }
            return
        }
        for peer in peers.values where peer.ready { line(peer, json) }
    }

    /// 방장이 한 사람만 내보낸다.
    ///
    /// **왜 끊겼는지 알려 주고 나서 끊는다.** 말없이 끊으면 그쪽은 4초 뒤에 「조용해졌다」로
    /// 알아채고, 그때까지 허공에 대고 자리를 보낸다. 마지막 줄이 나갈 틈을 조금 주고 끊는다.
    func kick(_ id: Int) {
        guard uplink == nil, let peer = peers[id] else { return }
        line(peer, "{\"t\":\"kick\"}")
        peers.removeValue(forKey: id)
        let connection = peer.connection
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { connection.cancel() }
        delegate?.netPeerChanged(id: id, name: peer.name, joined: false)
    }

    /// 지금 방에 있는 사람들. 메뉴에 이름을 세울 때 쓴다.
    var roster: [(id: Int, name: String)] {
        peers.values.filter(\.ready).map { (id: $0.id, name: $0.name) }.sorted { $0.id < $1.id }
    }

    // MARK: 나가기

    /// 방을 나간다. 방장이면 방이 깨진다.
    ///
    /// **말없이 끊지 않는다.** 그냥 끊으면 손님들은 4초 뒤에야 「조용해졌다」로 알아채고,
    /// 그동안 판 한가운데에 멈춰 있다. 「깨졌다」를 한 줄 보내고 그 줄이 나갈 틈을 조금 주고 끊는다.
    func leave() {
        listener?.cancel()
        listener = nil
        browser?.cancel()
        browser = nil
        resolver = nil
        uplink?.connection.cancel()
        uplink = nil
        let gone = Array(peers.values)
        for peer in gone where peer.ready { line(peer, "{\"t\":\"bye\"}") }
        peers.removeAll()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            for peer in gone {
                // 다음 방의 같은 번호를 잘못 떨어뜨리지 않게, 끊김 알림은 떼고 끊는다.
                peer.connection.stateUpdateHandler = nil
                peer.connection.cancel()
            }
        }
        nextId = 1
        candidates = []
        attempt = 0
        role = "off"
        code = nil
        myId = 0
    }

    var peerCount: Int { uplink != nil ? 1 : peers.values.filter(\.ready).count }

    /// 오간 줄 수. DDONG_DEBUG 로 띄웠을 때 1초에 한 번 찍는다 — 붙었는지, 흐르는지 본다.
    private(set) var sentLines = 0
    private(set) var recvLines = 0
    func drainCounters() -> (sent: Int, received: Int) {
        defer { sentLines = 0; recvLines = 0 }
        return (sentLines, recvLines)
    }

    // MARK: 문자열 잡일

    /// 손으로 만드는 JSON 은 여기 둘뿐이라 이스케이프도 손으로 한다.
    /// 방이 안 열린 까닭을 사람 말로 옮긴다.
    ///
    /// 원문은 「The operation couldn't be completed. (Network.NWError error 48 ...)」 같은
    /// 것이라, 그대로 띄우면 받은 사람은 뭘 해야 할지 모른다. 흔한 것 몇 가지만 골라 준다.
    static func why(_ error: NWError) -> String {
        if case let .posix(code) = error {
            switch code {
            case .EADDRINUSE:
                return "이 맥에서 이미 방을 열어 두었다. 먼저 그 방을 닫아야 새로 연다 "
                     + "(메뉴 막대 💩 → 방 닫기). 몰겜이 두 벌 떠 있는 것은 아닌지도 본다."
            case .EACCES, .EPERM:
                return "망을 쓸 권한이 없다. 시스템 설정 → 개인정보 보호 및 보안 → "
                     + "로컬 네트워크 에서 「몰겜」을 켜야 한다."
            case .ENETDOWN, .ENETUNREACH:
                return "와이파이가 끊겨 있다. 붙고 나서 다시 열어라."
            default: break
            }
        }
        return "방이 닫혔다 (\(error.localizedDescription))"
    }

    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: " ")
    }

    /// `"key":"값"` 에서 값만 꺼낸다. 이 층이 읽는 두 개 필드에만 쓴다.
    static func field(_ text: String, _ key: String) -> String? {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        if let value = object[key] as? String { return value }
        if let value = object[key] as? Int { return String(value) }
        return nil
    }
}
