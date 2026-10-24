import Foundation
import WatchConnectivity

/// The watch end of the link to Bookliz on the iPhone.
@MainActor
final class PhoneLink: NSObject, ObservableObject {
  static let shared = PhoneLink()

  @Published private(set) var state: WatchState?
  @Published private(set) var reachable = false
  /// The last command could not reach the phone.
  @Published var unreachableNotice = false
  /// Play/pause shown at once on tap, until the phone confirms.
  @Published var optimisticPlaying: Bool?

  private let decoder = JSONDecoder()

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func send(_ command: String, _ args: [String: Any] = [:]) {
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else {
      unreachableNotice = true
      optimisticPlaying = nil
      return
    }
    var message = args
    message["command"] = command
    session.sendMessage(
      message,
      replyHandler: { [weak self] reply in
        let json = reply["state"] as? String
        Task { @MainActor in
          self?.unreachableNotice = false
          self?.apply(json, isReply: true)
        }
      },
      errorHandler: { [weak self] _ in
        Task { @MainActor in
          self?.unreachableNotice = true
          self?.optimisticPlaying = nil
        }
      }
    )
  }

  func togglePlay(currentlyPlaying: Bool) {
    optimisticPlaying = !currentlyPlaying
    send("toggle")
  }

  /// `isReply`: the phone answers a command with the state from BEFORE it ran,
  /// so a reply never clears the optimistic play/pause — the push after it does.
  fileprivate func apply(_ json: String?, isReply: Bool = false) {
    guard let json,
          let data = json.data(using: .utf8),
          let decoded = try? decoder.decode(WatchState.self, from: data),
          decoded.v == WatchState.supportedVersion else { return }
    // Messages can arrive out of order: keep the newest.
    if let current = state, current.sentAt > decoded.sentAt { return }
    Lang.isSpanish = decoded.locale == "es"
    state = decoded
    if !isReply { optimisticPlaying = nil }
  }
}

extension PhoneLink: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    let context = session.receivedApplicationContext["state"] as? String
    let reachable = session.isReachable
    Task { @MainActor in
      self.apply(context)
      self.reachable = reachable
      if reachable { self.send("sync") }
    }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    Task { @MainActor in
      self.reachable = reachable
      if reachable {
        self.unreachableNotice = false
        self.send("sync")
      }
    }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    let json = applicationContext["state"] as? String
    Task { @MainActor in self.apply(json) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    let json = message["state"] as? String
    Task { @MainActor in self.apply(json) }
  }
}
