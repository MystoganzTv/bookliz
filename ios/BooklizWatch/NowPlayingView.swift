import SwiftUI
import WatchKit

/// Now playing — built to be hit while walking: the chapter, a thin progress
/// line, and three big transport buttons. Chapters, sleep timer, speed and
/// bookmark live one tap away behind "…" so they can't be hit by mistake.
/// No toolbar on purpose: watchOS draws toolbar buttons over this
/// non-scrolling layout and tints them into blank discs. The audiobook list is
/// the next page of the vertical TabView (Digital Crown).
struct NowPlayingView: View {
  @EnvironmentObject private var link: PhoneLink
  let state: WatchState
  let now: NowPlaying

  private var playing: Bool { link.optimisticPlaying ?? now.isPlaying }

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let position = now.position(at: context.date, sentAt: state.sentAt)
      let index = now.chapterIndex(at: position)
      let range = now.bounds(of: index)
      VStack(spacing: 6) {
        HStack(spacing: 4) {
          if link.unreachableNotice {
            Image(systemName: "iphone.slash").foregroundStyle(.orange)
          } else if now.sleep != nil {
            Image(systemName: "moon.zzz.fill").foregroundStyle(Color.bookliz)
          }
          Text(now.chapterTitle(index))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .font(.system(.headline, design: .rounded))
        .frame(maxWidth: .infinity)

        ProgressView(value: fraction(position - range.start, of: range.end - range.start))
          .tint(Color.bookliz)
          .accessibilityValue(tr("\(clock(range.end - position)) left", "Quedan \(clock(range.end - position))"))

        Spacer(minLength: 0)

        HStack(spacing: 0) {
          transportButton(symbol: "gobackward.\(state.skipBack)",
                          label: tr("Back \(state.skipBack) seconds", "Atrás \(state.skipBack) segundos")) {
            link.send("skipBack")
          }
          playButton
          transportButton(symbol: "goforward.\(state.skipForward)",
                          label: tr("Forward \(state.skipForward) seconds", "Adelante \(state.skipForward) segundos")) {
            link.send("skipForward")
          }
        }

        Spacer(minLength: 0)

        NavigationLink {
          PlayerMoreView(state: state, now: now)
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 30)
            .background(Capsule().fill(Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tr("More options", "Más opciones"))
      }
      .padding(.horizontal, 2)
    }
    .containerBackground(for: .tabView) {
      CoverBackground(url: now.coverUrl)
    }
  }

  private var playButton: some View {
    Button {
      WKInterfaceDevice.current().play(.click)
      link.togglePlay(currentlyPlaying: playing)
    } label: {
      ZStack {
        Circle().fill(Color.bookliz)
        if now.isLoading {
          ProgressView()
        } else {
          Image(systemName: playing ? "pause.fill" : "play.fill")
            .font(.system(size: 28, weight: .bold))
            .foregroundStyle(.black)
        }
      }
      .frame(width: 64, height: 64)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(playing ? tr("Pause", "Pausa") : tr("Play", "Reproducir"))
  }

  private func transportButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
    Button {
      WKInterfaceDevice.current().play(.click)
      action()
    } label: {
      Image(systemName: symbol)
        .font(.system(size: 26, weight: .semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 64)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private func fraction(_ part: Double, of whole: Double) -> Double {
    guard whole > 0 else { return 0 }
    return min(1, max(0, part / whole))
  }
}

/// Everything that isn't transport, as a plain list: big rows, easy to hit.
struct PlayerMoreView: View {
  @EnvironmentObject private var link: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let state: WatchState
  let now: NowPlaying

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let position = now.position(at: context.date, sentAt: state.sentAt)
      let range = now.bounds(of: now.chapterIndex(at: position))
      List {
        Section {
          VStack(alignment: .leading, spacing: 1) {
            Text(now.title).font(.headline).lineLimit(2)
            if !now.author.isEmpty {
              Text(now.author).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
          HStack {
            Text(clock(position - range.start))
            Spacer()
            Text("-" + clock(range.end - position))
          }
          .font(.footnote.monospacedDigit())
          .foregroundStyle(.secondary)
        }
        .listRowBackground(Color.clear)

        if !now.chapters.isEmpty {
          NavigationLink {
            ChaptersView(now: now, current: now.chapterIndex(at: position))
          } label: {
            Label(tr("Chapters", "Capítulos"), systemImage: "list.bullet")
          }
        }
        NavigationLink {
          SleepView(state: state, now: now)
        } label: {
          HStack {
            Label(tr("Sleep timer", "Temporizador"), systemImage: now.sleep == nil ? "moon.zzz" : "moon.zzz.fill")
            Spacer()
            if let sleep = now.sleep {
              Text(sleepText(sleep, at: context.date)).font(.footnote.monospacedDigit()).foregroundStyle(Color.bookliz)
            }
          }
        }
        NavigationLink {
          SpeedView(state: state, now: now)
        } label: {
          HStack {
            Label(tr("Speed", "Velocidad"), systemImage: "speedometer")
            Spacer()
            Text(speedLabel(now.speed)).font(.footnote).foregroundStyle(.secondary)
          }
        }
        Button {
          WKInterfaceDevice.current().play(.success)
          link.send("bookmark")
          dismiss()
        } label: {
          Label(tr("Add bookmark", "Añadir marcador"), systemImage: "bookmark")
        }
      }
    }
    .navigationTitle(tr("Options", "Opciones"))
  }

  private func sleepText(_ sleep: Sleep, at date: Date) -> String {
    if sleep.kind == "minutes", let endsAt = sleep.endsAt {
      let left = max(0, endsAt / 1000 - date.timeIntervalSince1970)
      return clock(left)
    }
    return tr("Chapter", "Capítulo")
  }
}
