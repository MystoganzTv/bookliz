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

    Events("onCommand", "onWatchStatus", "onWatchFiles")

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

    // ── Audiobooks ON the watch (Bookliz Pro: listening without the iPhone) ──

    /// Queue every track of a book for transfer. `json` carries the book
    /// (id, title, chapters, tracks with their local file:// uri). Earlier
    /// transfers of the same book are cancelled first.
    Function("sendBook") { (json: String) -> Int in
      WatchRelay.shared.sendBook(json)
    }

    Function("cancelBook") { (bookId: String) in
      WatchRelay.shared.cancelBook(bookId)
    }

    /// Pending transfers per book: [{bookId, pending, fraction}].
    Function("fileTransfers") { () -> [[String: Any]] in
      WatchRelay.shared.fileTransfers()
    }

    Function("deleteFromWatch") { (bookId: String) in
      WatchRelay.shared.deleteFromWatch(bookId)
    }

    /// The last list of books the watch reported holding (JSON), or nil.
    Function("watchLibrary") { () -> String? in
      WatchRelay.shared.lastWatchLibrary()
    }

    /// Positions the watch reported while JS was not listening; cleared on read.
    Function("drainWatchProgress") { () -> [[String: Any]] in
      WatchRelay.shared.drainProgress()
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
  private var watchLibraryJson: String?
  private var pendingProgress: [[String: Any]] = []
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

  // MARK: Audiobooks on the watch

  private var usableSession: WCSession? {
    guard WCSession.isSupported() else { return nil }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return nil }
    return session
  }

  func sendBook(_ json: String) -> Int {
    guard let session = usableSession,
          let data = json.data(using: .utf8),
          let book = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let bookId = book["bookId"] as? String,
          let tracks = book["tracks"] as? [[String: Any]] else { return 0 }
    cancelBook(bookId)
    func fileURL(_ track: [String: Any]) -> URL? {
      guard let uri = track["uri"] as? String else { return nil }
      let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
      guard let url, url.isFileURL, FileManager.default.fileExists(atPath: url.path) else { return nil }
      return url
    }
    // Every track must be on disk, or the watch would wait forever for one that never comes.
    guard !tracks.isEmpty, tracks.allSatisfy({ fileURL($0) != nil }) else { return 0 }
    // The watch gets the book without the phone's file paths.
    var shared = book
    shared["tracks"] = tracks.map { track -> [String: Any] in
      var copy = track
      if copy["file"] == nil { copy["file"] = fileURL(track)?.lastPathComponent }
      copy.removeValue(forKey: "uri")
      return copy
    }
    guard let sharedData = try? JSONSerialization.data(withJSONObject: shared),
          let sharedJson = String(data: sharedData, encoding: .utf8) else { return 0 }
    var sent = 0
    for (index, track) in tracks.enumerated() {
      guard let url = fileURL(track) else { continue }
      let metadata: [String: Any] = [
        "kind": "audio",
        "bookId": bookId,
        "file": (track["file"] as? String) ?? url.lastPathComponent,
        "index": index,
        "count": tracks.count,
        "book": sharedJson,
      ]
      _ = session.transferFile(url, metadata: metadata)
      sent += 1
    }
    return sent
  }

  func cancelBook(_ bookId: String) {
    guard WCSession.isSupported() else { return }
    for transfer in WCSession.default.outstandingFileTransfers where (transfer.file.metadata?["bookId"] as? String) == bookId {
      transfer.cancel()
    }
  }

  func fileTransfers() -> [[String: Any]] {
    guard WCSession.isSupported() else { return [] }
    var byBook: [String: (pending: Int, fraction: Double)] = [:]
    for transfer in WCSession.default.outstandingFileTransfers {
      guard let bookId = transfer.file.metadata?["bookId"] as? String else { continue }
      var row = byBook[bookId] ?? (0, 0)
      row.pending += 1
      row.fraction += transfer.progress.fractionCompleted
      byBook[bookId] = row
    }
    return byBook.map { ["bookId": $0.key, "pending": $0.value.pending, "fraction": $0.value.fraction / Double(max(1, $0.value.pending))] }
  }

  func deleteFromWatch(_ bookId: String) {
    cancelBook(bookId)
    guard let session = usableSession else { return }
    session.transferUserInfo(["kind": "deleteBook", "bookId": bookId])
  }

  func lastWatchLibrary() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return watchLibraryJson
  }

  func drainProgress() -> [[String: Any]] {
    lock.lock()
    defer { lock.unlock() }
    let out = pendingProgress
    pendingProgress.removeAll()
    return out
  }

  func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
    let metadata = fileTransfer.file.metadata ?? [:]
    var body: [String: Any] = [
      "event": "transferFinished",
      "bookId": metadata["bookId"] as? String ?? "",
      "index": metadata["index"] as? Int ?? 0,
    ]
    if let error {
      body["error"] = error.localizedDescription
    }
    module?.emit("onWatchFiles", body)
  }

  /// From the watch: what it holds, and where the listener got to on it.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    switch userInfo["kind"] as? String {
    case "watchLibrary":
      let json = userInfo["books"] as? String
      lock.lock()
      watchLibraryJson = json
      lock.unlock()
      module?.emit("onWatchFiles", ["event": "library", "books": json ?? "[]"])
    case "watchProgress":
      guard let bookId = userInfo["bookId"] as? String, let position = userInfo["positionSec"] as? Double else { return }
      let row: [String: Any] = ["bookId": bookId, "positionSec": position, "at": userInfo["at"] as? Double ?? 0]
      lock.lock()
      let deliver = observing && module != nil
      if !deliver { pendingProgress.append(row) }
      lock.unlock()
      if deliver { module?.emit("onWatchFiles", row.merging(["event": "progress"]) { $1 }) }
    default:
      break
    }
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
