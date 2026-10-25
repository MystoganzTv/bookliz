import AVFoundation
import Foundation
import MediaPlayer
import WatchConnectivity

/// Plays an audiobook stored on the watch, with no iPhone around (Bookliz Pro).
///
/// watchOS only plays long-form audio through Bluetooth headphones or
/// speakers: activating the session shows the system's route picker when
/// none is connected. Position is saved to book.json every few seconds and
/// sent to the iPhone (transferUserInfo, delivered whenever they next talk)
/// on pause and close, so the phone carries on from the same spot.
@MainActor
final class WatchPlayer: ObservableObject {
  static let shared = WatchPlayer()

  @Published private(set) var book: LocalBook?
  @Published private(set) var isPlaying = false
  @Published private(set) var positionSec: Double = 0
  @Published private(set) var isActivating = false
  @Published var errorMessage: String?

  private var player: AVPlayer?
  private var trackIndex = 0
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var lastSaved = Date.distantPast
  private var commandsReady = false
  private var statusObservation: NSKeyValueObservation?
  private var interruptionObserver: NSObjectProtocol?

  static let speeds: [Double] = [0.8, 1, 1.2, 1.5, 1.75, 2]

  func open(_ next: LocalBook) {
    if book?.bookId == next.bookId {
      if !isPlaying { play() }
      return
    }
    close()
    book = next
    positionSec = min(next.positionSec, max(0, next.totalSec - 1))
    play()
  }

  func play() {
    guard book != nil else { return }
    errorMessage = nil
    isActivating = true
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio, options: [])
    } catch {
      isActivating = false
      errorMessage = error.localizedDescription
      return
    }
    session.activate(options: []) { [weak self] success, error in
      Task { @MainActor in
        guard let self else { return }
        self.isActivating = false
        if success {
          self.startPlayback()
        } else {
          self.errorMessage = error?.localizedDescription ?? tr("Connect Bluetooth headphones to listen on the watch.",
                                                              "Conecta unos auriculares Bluetooth para escuchar en el reloj.")
        }
      }
    }
  }

  func pause() {
    player?.pause()
    isPlaying = false
    persist(report: true)
    updateNowPlaying()
  }

  func toggle() {
    isPlaying ? pause() : play()
  }

  func skip(_ delta: Double) {
    seek(to: positionSec + delta)
  }

  func seek(to sec: Double) {
    guard let book else { return }
    let target = max(0, min(sec, book.totalSec - 0.5))
    let wasPlaying = isPlaying
    load(at: target)
    if wasPlaying { player?.playImmediately(atRate: Float(book.speed)) }
    positionSec = target
    persist(report: false)
    updateNowPlaying()
  }

  func cycleSpeed() {
    guard var current = book else { return }
    let index = WatchPlayer.speeds.firstIndex(where: { $0 >= current.speed - 0.01 }) ?? 0
    current.speed = WatchPlayer.speeds[(index + 1) % WatchPlayer.speeds.count]
    book = current
    if isPlaying { player?.rate = Float(current.speed) }
    OnWatchStore.save(current)
    updateNowPlaying()
  }

  private func observeInterruptions() {
    guard interruptionObserver == nil else { return }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] note in
      let began = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue
      Task { @MainActor in
        guard let self, began, self.isPlaying else { return }
        self.isPlaying = false
        self.persist(report: true)
        self.updateNowPlaying()
      }
    }
  }

  func close() {
    statusObservation = nil
    if book != nil { persist(report: true) }
    if let timeObserver { player?.removeTimeObserver(timeObserver) }
    timeObserver = nil
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    endObserver = nil
    player?.pause()
    player = nil
    isPlaying = false
    book = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  // MARK: - Playback

  private func startPlayback() {
    guard let book else { return }
    setUpRemoteCommands()
    observeInterruptions()
    // Finished: play from the start again rather than end at once.
    if positionSec >= book.totalSec - 1 {
      positionSec = 0
      load(at: 0)
    }
    if player?.currentItem == nil { load(at: positionSec) }
    player?.playImmediately(atRate: Float(book.speed))
    isPlaying = true
    updateNowPlaying()
  }

  private func load(at sec: Double) {
    guard let book, !book.tracks.isEmpty else { return }
    let (index, offset) = book.locate(sec)
    trackIndex = index
    let item = AVPlayerItem(url: OnWatchStore.fileURL(book, track: index))
    if let player {
      player.replaceCurrentItem(with: item)
    } else {
      let created = AVPlayer(playerItem: item)
      created.automaticallyWaitsToMinimizeStalling = false
      player = created
      // The system pauses on its own (headphones gone, a call): follow it.
      statusObservation = created.observe(\.timeControlStatus, options: [.new]) { [weak self] observed, _ in
        let paused = observed.timeControlStatus == .paused
        Task { @MainActor in
          // Re-read now: a track change pauses for a moment and then plays on.
          guard let self, paused, self.isPlaying, self.player?.timeControlStatus == .paused,
                let item = self.player?.currentItem, item.currentTime().seconds < item.duration.seconds - 0.5 else { return }
          self.isPlaying = false
          self.persist(report: true)
          self.updateNowPlaying()
        }
      }
      timeObserver = created.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 2), queue: .main) { [weak self] time in
        Task { @MainActor in self?.tick(time.seconds) }
      }
    }
    player?.seek(to: CMTime(seconds: offset, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      Task { @MainActor in self?.trackEnded() }
    }
  }

  private func tick(_ trackSec: Double) {
    guard let book, isPlaying, trackSec.isFinite else { return }
    let starts = book.trackStarts
    guard starts.indices.contains(trackIndex) else { return }
    positionSec = min(book.totalSec, starts[trackIndex] + trackSec)
    if Date().timeIntervalSince(lastSaved) > 10 { persist(report: false) }
  }

  private func trackEnded() {
    guard let book else { return }
    if trackIndex + 1 < book.tracks.count {
      let next = book.trackStarts[trackIndex + 1]
      load(at: next)
      player?.playImmediately(atRate: Float(book.speed))
      isPlaying = true
      positionSec = next
    } else {
      positionSec = book.totalSec
      pause()
    }
  }

  private func persist(report: Bool) {
    guard var current = book else { return }
    current.positionSec = positionSec
    current.updatedAt = Date().timeIntervalSince1970 * 1000
    book = current
    OnWatchStore.save(current)
    lastSaved = Date()
    if report, WCSession.isSupported(), WCSession.default.activationState == .activated {
      WCSession.default.transferUserInfo([
        "kind": "watchProgress",
        "bookId": current.bookId,
        "positionSec": positionSec + current.offsetSec,
        "at": current.updatedAt,
      ])
    }
  }

  // MARK: - Now Playing (crown, Control Center)

  private func setUpRemoteCommands() {
    guard !commandsReady else { return }
    commandsReady = true
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.play() }
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.pause() }
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.toggle() }
      return .success
    }
    center.skipBackwardCommand.preferredIntervals = [15]
    center.skipBackwardCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.skip(-15) }
      return .success
    }
    center.skipForwardCommand.preferredIntervals = [30]
    center.skipForwardCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.skip(30) }
      return .success
    }
  }

  private func updateNowPlaying() {
    guard let book else { return }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: book.chapterTitle(at: positionSec) ?? book.title,
      MPMediaItemPropertyArtist: book.author,
      MPMediaItemPropertyAlbumTitle: book.title,
      MPMediaItemPropertyPlaybackDuration: book.totalSec,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: positionSec,
      MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? book.speed : 0,
    ]
  }
}
