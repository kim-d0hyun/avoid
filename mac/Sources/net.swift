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
    private var peers: [Int: Peer] = [:]
    private var nextId = 1
    /// 손님일 때 호스트로 가는 줄. 손님에게 peers 는 이것 하나뿐이다.
    private var uplink: Peer?

    init(name: String) {
        myName = name
    }

    // MARK: 방 열기

    func host() -> String? {
        leave()
        let room = makeRoomCode()
        let options = NWProtocolTCP.Options()
        options.noDelay = true // 20Hz 짜리 작은 꾸러미다. 모아 보내면 그게 곧 렉이다.
        let params = NWParameters(tls: nil, tcp: options)
        params.includePeerToPeer = true

        // 포트가 이미 쓰이고 있으면 아무 포트나 잡는다. 그때는 Bonjour 로만 붙을 수 있다.
        let listener: NWListener
        do {
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: netDefaultPort)!)
        } catch {
            guard let fallback = try? NWListener(using: params) else {
                delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: "방을 열지 못했다")
                return nil
            }
            listener = fallback
        }
        listener.service = NWListener.Service(name: room, type: netServiceType)
        listener.newConnectionHandler = { [weak self] connection in
            DispatchQueue.main.async { self?.accept(connection) }
        }
        listener.stateUpdateHandler = { [weak self] state in
            guard case .failed(let error) = state else { return }
            DispatchQueue.main.async {
                self?.leave()
                self?.delegate?.netRoleChanged(role: "off", code: nil, myId: 0,
                                               note: "방이 닫혔다 (\(error.localizedDescription))")
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
            connect(to: .hostPort(host: NWEndpoint.Host(String(bits[0])),
                                  port: NWEndpoint.Port(rawValue: port)!))
            return
        }
        findOnLAN(room)
    }

    private func findOnLAN(_ room: String) {
        let params = NWParameters()
        params.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: netServiceType, domain: nil), using: params)

        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.uplink == nil else { return }
            for result in results {
                guard case .service(let name, _, _, _) = result.endpoint, name == room else { continue }
                self.browser?.cancel()
                self.browser = nil
                self.connect(to: result.endpoint)
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

    private func connect(to endpoint: NWEndpoint) {
        let options = NWProtocolTCP.Options()
        options.noDelay = true
        let params = NWParameters(tls: nil, tcp: options)
        params.includePeerToPeer = true

        let connection = NWConnection(to: endpoint, using: params)
        let peer = Peer(id: 0, connection: connection) // 호스트는 언제나 0번
        uplink = peer

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.line(peer, #"{"t":"__join","name":"\#(Net.escape(self.myName))"}"#)
            case .failed(let error):
                self.leave()
                self.delegate?.netRoleChanged(role: "off", code: nil, myId: 0,
                                              note: "붙지 못했다 (\(error.localizedDescription))")
            case .cancelled:
                break
            default:
                break
            }
        }
        connection.start(queue: .main)
        receive(peer)
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
                    self.leave()
                    self.delegate?.netRoleChanged(role: "off", code: nil, myId: 0, note: "방과 끊겼다")
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
            peer.name = Net.field(text, "name") ?? "누군가"
            peer.ready = true
            line(peer, #"{"t":"__id","id":\#(peer.id),"code":"\#(code ?? "")"}"#)
            delegate?.netPeerChanged(id: peer.id, name: peer.name, joined: true)
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

    // MARK: 나가기

    func leave() {
        listener?.cancel()
        listener = nil
        browser?.cancel()
        browser = nil
        uplink?.connection.cancel()
        uplink = nil
        for peer in peers.values { peer.connection.cancel() }
        peers.removeAll()
        nextId = 1
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
