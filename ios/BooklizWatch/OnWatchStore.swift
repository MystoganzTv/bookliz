import Foundation
import WatchConnectivity

/// An audiobook stored ON the watch (Bookliz Pro): sent from the iPhone with
/// WCSession.transferFile, one file per track, and played without the phone.
struct LocalBook: Codable, Identifiable, Equatable {
  struct Track: Codable, Equatable {
    let file: String
    let title: String
    let durationSec: Double
  }

  struct Chapter: Codable, Equatable {
    let title: String
    let startSec: Double
  }

  let bookId: String
  let title: String
  let author: String
  let totalSec: Double
  let tracks: [Track]
  let chapters: [Chapter]
  var positionSec: Double
  /// Seconds of the whole book before the first track here (the phone had
  /// deleted listened tracks). Added back when reporting to the phone.
  var offsetSec: Double
  var speed: Double
  /// Milliseconds since 1970 of the last position change on the watch.
  var updatedAt: Double

  var id: String { bookId }

  /// Seconds into the book where each track begins.
  var trackStarts: [Double] {
    var starts: [Double] = []
    var sum = 0.0
    for track in tracks {
      starts.append(sum)
      sum += track.durationSec
    }
    return starts
  }

  /// (track index, seconds into that track) for a position in the whole book.
  func locate(_ sec: Double) -> (index: Int, offset: Double) {
    let starts = trackStarts
    guard !tracks.isEmpty else { return (0, 0) }
    var index = 0
    for (i, start) in starts.enumerated() where start <= sec { index = i }
    let offset = max(0, min(sec - starts[index], tracks[index].durationSec))
    return (index, offset)
  }

  func chapterTitle(at sec: Double) -> String? {
    var current: Chapter?
    for chapter in chapters where chapter.startSec <= sec + 0.25 { current = chapter }
    guard let current, !current.title.isEmpty else { return nil }
    return current.title
  }
}

/// Files on disk: Documents/OnWatch/<bookId>/book.json + the tracks.
/// Called from WCSession's delegate queue as well as the main actor, so it
/// only touches the file system (FileManager is thread-safe).
enum OnWatchStore {
  static var root: URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let url = documents.appendingPathComponent("OnWatch", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  static func folder(_ bookId: String) -> URL {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let safe = String(bookId.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
    return root.appendingPathComponent(safe.isEmpty ? "book" : safe, isDirectory: true)
  }

  static func fileURL(_ book: LocalBook, track: Int) -> URL {
    folder(book.bookId).appendingPathComponent(book.tracks[track].file)
  }

  /// A track arrived. MUST run inside didReceive(file:) — WatchConnectivity
  /// deletes the incoming file as soon as that call returns.
  static func accept(_ incoming: URL, metadata: [String: Any]) {
    guard let bookId = metadata["bookId"] as? String,
          let fileName = metadata["file"] as? String,
          let bookJson = metadata["book"] as? String,
          let data = bookJson.data(using: .utf8) else { return }
    let fm = FileManager.default
    let dir = folder(bookId)
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let destination = dir.appendingPathComponent((fileName as NSString).lastPathComponent)
    try? fm.removeItem(at: destination)
    do {
      try fm.moveItem(at: incoming, to: destination)
    } catch {
      try? fm.copyItem(at: incoming, to: destination)
    }
    guard var incoming = decodeIncoming(data) else { return }
    incoming.updatedAt = 0
    if let stored = load(bookId) {
      // Same tracks: keep book.json — the watch may already have moved the position.
      if stored.tracks.map(\.file) == incoming.tracks.map(\.file), stored.offsetSec == incoming.offsetSec { return }
      // Re-sent with different tracks: the new list wins; a position listened
      // on the watch since (updatedAt > 0) survives when it still fits.
      if stored.updatedAt > 0 {
        incoming.positionSec = max(0, min(stored.positionSec + stored.offsetSec - incoming.offsetSec, incoming.totalSec))
        incoming.updatedAt = stored.updatedAt
      }
      let keep = Set(incoming.tracks.map(\.file) + ["book.json"])
      for item in (try? fm.contentsOfDirectory(atPath: dir.path)) ?? [] where !keep.contains(item) {
        try? fm.removeItem(at: dir.appendingPathComponent(item))
      }
    }
    save(incoming)
  }

  private struct Incoming: Decodable {
    struct Track: Decodable { let file: String; let title: String?; let durationSec: Double }
    struct Chapter: Decodable { let title: String?; let startSec: Double }
    let bookId: String
    let title: String?
    let author: String?
    let totalSec: Double?
    let positionSec: Double?
    let offsetSec: Double?
    let speed: Double?
    let tracks: [Track]
    let chapters: [Chapter]?
  }

  static func decodeIncoming(_ data: Data) -> LocalBook? {
    guard let incoming = try? JSONDecoder().decode(Incoming.self, from: data) else { return nil }
    let tracks = incoming.tracks.map { LocalBook.Track(file: $0.file, title: $0.title ?? "", durationSec: $0.durationSec) }
    return LocalBook(
      bookId: incoming.bookId,
      title: incoming.title ?? "",
      author: incoming.author ?? "",
      totalSec: incoming.totalSec ?? tracks.reduce(0) { $0 + $1.durationSec },
      tracks: tracks,
      chapters: (incoming.chapters ?? []).map { LocalBook.Chapter(title: $0.title ?? "", startSec: $0.startSec) },
      positionSec: incoming.positionSec ?? 0,
      offsetSec: incoming.offsetSec ?? 0,
      speed: incoming.speed ?? 1,
      updatedAt: 0
    )
  }

  static func load(_ bookId: String) -> LocalBook? {
    let url = folder(bookId).appendingPathComponent("book.json")
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(LocalBook.self, from: data)
  }

  static func save(_ book: LocalBook) {
    let url = folder(book.bookId).appendingPathComponent("book.json")
    if let data = try? JSONEncoder().encode(book) { try? data.write(to: url, options: .atomic) }
  }

  static func all() -> [LocalBook] {
    let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    return dirs.compactMap { dir -> LocalBook? in
      let url = dir.appendingPathComponent("book.json")
      guard let data = try? Data(contentsOf: url) else { return nil }
      return try? JSONDecoder().decode(LocalBook.self, from: data)
    }
    .sorted { $0.updatedAt == $1.updatedAt ? $0.title < $1.title : $0.updatedAt > $1.updatedAt }
  }

  /// How many of the book's tracks are on the watch.
  static func received(_ book: LocalBook) -> Int {
    book.tracks.indices.filter { FileManager.default.fileExists(atPath: fileURL(book, track: $0).path) }.count
  }

  static func delete(_ bookId: String) {
    try? FileManager.default.removeItem(at: folder(bookId))
  }
}

/// What the watch holds, for the views.
@MainActor
final class LocalLibrary: ObservableObject {
  static let shared = LocalLibrary()

  struct Row: Identifiable, Equatable {
    let book: LocalBook
    let received: Int
    var id: String { book.bookId }
    var complete: Bool { received >= book.tracks.count && !book.tracks.isEmpty }
  }

  @Published private(set) var rows: [Row] = []

  func reload() {
    rows = OnWatchStore.all().map { Row(book: $0, received: OnWatchStore.received($0)) }
  }

  func delete(_ bookId: String) {
    if WatchPlayer.shared.book?.bookId == bookId { WatchPlayer.shared.close() }
    OnWatchStore.delete(bookId)
    reload()
    report()
  }

  /// Tell the iPhone what is here (it shows "On your watch" per book).
  func report() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    let books = rows.map { row -> [String: Any] in
      ["bookId": row.book.bookId, "complete": row.complete, "received": row.received, "total": row.book.tracks.count,
       "positionSec": row.book.positionSec + row.book.offsetSec, "updatedAt": row.book.updatedAt]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: books), let json = String(data: data, encoding: .utf8) else { return }
    WCSession.default.transferUserInfo(["kind": "watchLibrary", "books": json])
  }
}
