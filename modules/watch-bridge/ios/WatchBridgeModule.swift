import ExpoModulesCore
import WatchConnectivity

/// The iPhone end of the Apple Watch link.
///
/// JS pushes the whole player state as one JSON string (`updateState`); the
/// watch gets it as a message when it is reachable and always as the
/// application context, so a watch app opened later starts from the latest
/// state without asking. Commands from the watch arrive as messages and are
/// forwarded to JS as `onCommand` events; each is answered at once with the
/// last known state so the watch never waits on JavaScript.
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onCommand", "onWatchStatus")

    OnCreate {
      WatchRelay.shared.module = self
      WatchRelay.shared.activate()
    }

    OnStartObserving {
      WatchRelay.shared.setObserving(true)
    }

    OnStopObserving {
      WatchRelay.shared.setObserving(false)
    }

    Function("isSupported") { () -> Bool in
      WCSession.isSupported()
    }

    Function("status") { () -> [String: Any] in
      WatchRelay.shared.status()
    }

    Function("updateState") { (json: String) in
      WatchRelay.shared.push(json)
    }
  }

  fileprivate func emit(_ name: String, _ body: [String: Any]) {
    sendEvent(name, body.mapValues { Optional($0) })
  }
}

final class WatchRelay: NSObject, WCSessionDelegate {
  static let shared = WatchRelay()

  weak var module: WatchBridgeModule?
  private var observing = false
  /// Commands that arrived before JS was listening (app woken in the background).
  private var queued: [[String: Any]] = []
  private var lastState: String?
  private let lock = NSLock()

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil { session.delegate = self }
    if session.activationState != .activated { session.activate() }
  }

  func setObserving(_ value: Bool) {
    lock.lock()
    observing = value
    let pending = value ? queued : []
    if value { queued.removeAll() }
    lock.unlock()
    pending.forEach { module?.emit("onCommand", $0) }
  }

  func status() -> [String: Any] {
    guard WCSession.isSupported() else {
      return ["supported": false, "paired": false, "installed": false, "reachable": false]
    }
    let session = WCSession.default
    let active = session.activationState == .activated
    return [
      "supported": true,
      "paired": active && session.isPaired,
      "installed": active && session.isWatchAppInstalled,
      "reachable": active && session.isReachable,
    ]
  }

  func push(_ json: String) {
    lock.lock()
    lastState = json
    lock.unlock()
    send(json)
  }

  private func send(_ json: String) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
    let payload: [String: Any] = ["state": json]
    // Latest-wins and survives the watch app being closed.
    try? session.updateApplicationContext(payload)
    // Immediate while the watch app is on screen.
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    }
  }

  private func receive(_ message: [String: Any]) {
    guard message["command"] is String else { return }
    lock.lock()
    let deliver = observing && module != nil
    if !deliver { queued.append(message) }
    lock.unlock()
    if deliver { module?.emit("onCommand", message) }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    module?.emit("onWatchStatus", status())
    lock.lock()
    let state = lastState
    lock.unlock()
    if let state { send(state) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    // The user switched to another watch: start talking to the new one.
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    module?.emit("onWatchStatus", status())
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    module?.emit("onWatchStatus", status())
    lock.lock()
    let state = lastState
    lock.unlock()
    if session.isReachable, let state { send(state) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    receive(message)
    lock.lock()
    let state = lastState
    lock.unlock()
    replyHandler(state.map { ["state": $0] } ?? [:])
  }
}
