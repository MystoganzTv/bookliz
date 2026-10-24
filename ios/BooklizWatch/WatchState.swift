import Foundation

/// What the iPhone sends — mirrors src/watch/watchState.ts. Bump `supportedVersion`
/// together with WATCH_STATE_VERSION there.
struct WatchState: Decodable, Equatable {
  static let supportedVersion = 1

  let v: Int
  let locale: String
  /// Milliseconds since 1970 when `now.positionSec` was true.
  let sentAt: Double
  let skipBack: Int
  let skipForward: Int
  let speeds: [Double]
  let sleepMinutes: [Int]
  let now: NowPlaying?
  let library: [LibraryItem]
  /// Absent from phones older than the reading page.
  let reading: Reading?
}

/// Books on paper / e-reader: today, the reading timer, what is being read.
struct Reading: Decodable, Equatable {
  struct Today: Decodable, Equatable {
    let minutes: Int
    let streak: Int
    let booksThisYear: Int
    let yearlyGoal: Int
  }

  struct RunningTimer: Decodable, Equatable {
    let bookId: String
    let title: String
    /// Milliseconds since 1970.
    let startedAt: Double
  }

  struct ReadingBook: Decodable, Equatable, Identifiable {
    let bookId: String
    let title: String
    let author: String
    let coverUrl: String?
    var id: String { bookId }
  }

  let today: Today
  let timer: RunningTimer?
  let books: [ReadingBook]
}

struct NowPlaying: Decodable, Equatable {
  let bookId: String
  let title: String
  let author: String
  let coverUrl: String?
  let isPlaying: Bool
  let isLoading: Bool
  let positionSec: Double
  let totalSec: Double
  let speed: Double
  let chapters: [Chapter]
  let sleep: Sleep?
  let bookmarkCount: Int
}

struct Chapter: Decodable, Equatable {
  /// Title; empty when the file has none ("Chapter N" is drawn instead).
  let t: String
  /// Start, in seconds into the whole book.
  let s: Double
}

struct Sleep: Decodable, Equatable {
  /// "minutes" or "chapter".
  let kind: String
  /// For "minutes": milliseconds since 1970 when it pauses.
  let endsAt: Double?
}

struct LibraryItem: Decodable, Equatable, Identifiable {
  let bookId: String
  let title: String
  let author: String
  let coverUrl: String?
  let progress: Double
  let totalSec: Double
  var id: String { bookId }
}

struct ChapterBounds {
  let start: Double
  let end: Double
}

extension NowPlaying {
  /// The watch runs its own clock between updates: position when sent, plus
  /// the time since, at the playing speed.
  func position(at date: Date, sentAt: Double) -> Double {
    guard isPlaying, !isLoading else { return positionSec }
    let elapsed = max(0, date.timeIntervalSince1970 * 1000 - sentAt) / 1000
    return min(totalSec, positionSec + elapsed * speed)
  }

  /// Same rule as the phone's chapterIndexAt (a quarter-second of slack).
  func chapterIndex(at position: Double) -> Int? {
    guard !chapters.isEmpty else { return nil }
    var index = 0
    for (i, chapter) in chapters.enumerated() where chapter.s <= position + 0.25 {
      index = i
    }
    return index
  }

  func bounds(of index: Int?) -> ChapterBounds {
    guard let index, chapters.indices.contains(index) else { return ChapterBounds(start: 0, end: totalSec) }
    let end = index + 1 < chapters.count ? chapters[index + 1].s : totalSec
    return ChapterBounds(start: chapters[index].s, end: max(end, chapters[index].s))
  }

  func chapterTitle(_ index: Int?) -> String {
    guard let index, chapters.indices.contains(index) else { return title }
    let t = chapters[index].t
    return t.isEmpty ? tr("Chapter \(index + 1)", "Capítulo \(index + 1)") : t
  }
}

/// "1:02:03" / "4:05".
func clock(_ seconds: Double) -> String {
  let s = max(0, Int(seconds.rounded(.down)))
  let h = s / 3600
  let m = (s % 3600) / 60
  let r = s % 60
  return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
}

/// "1.25×"
func speedLabel(_ speed: Double) -> String {
  String(format: "%g×", speed)
}
