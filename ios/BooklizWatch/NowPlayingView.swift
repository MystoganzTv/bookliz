import SwiftUI
import WatchKit

/// Now playing. No toolbar on purpose: watchOS draws toolbar buttons over this
/// non-scrolling layout (the title ended up under them) and tints them into
/// blank discs. Everything sits in our own rows instead: title, progress,
/// transport, then chapters · sleep · speed · bookmark. The audiobook list is
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
      VStack(spacing: 4) {
        VStack(spacing: 0) {
          Text(now.chapterTitle(index))
            .font(.system(.headline, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
          Text(index == nil ? now.author : now.title)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity)

        ProgressView(value: fraction(position - range.start, of: range.end - range.start))
          .tint(Color.bookliz)
        HStack {
          Text(clock(position - range.start))
          Spacer()
          if link.unreachableNotice {
            Image(systemName: "iphone.slash").foregroundStyle(.orange)
          } else if let sleep = now.sleep {
            Label(sleepText(sleep, at: context.date), systemImage: "moon.zzz.fill")
              .labelStyle(.titleAndIcon)
          }
          Spacer()
          Text("-" + clock(range.end - position))
        }
        .font(.system(size: 12).monospacedDigit())
        .foregroundStyle(.secondary)

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

        HStack(spacing: 6) {
          NavigationLink {
            ChaptersView(now: now, current: now.chapterIndex(at: now.position(at: Date(), sentAt: state.sentAt)))
          } label: {
            smallIcon("list.bullet")
          }
          .buttonStyle(.plain)
          .disabled(now.chapters.isEmpty)
          .opacity(now.chapters.isEmpty ? 0.35 : 1)
          .accessibilityLabel(tr("Chapters", "Capítulos"))

          NavigationLink {
            SleepView(state: state, now: now)
          } label: {
            smallIcon(now.sleep == nil ? "moon.zzz" : "moon.zzz.fill", active: now.sleep != nil)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(tr("Sleep timer", "Temporizador"))

          NavigationLink {
            SpeedView(state: state, now: now)
          } label: {
            Text(speedLabel(now.speed))
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .frame(maxWidth: .infinity, minHeight: 32)
              .background(Circle().fill(Color.white.opacity(0.16)).frame(width: 34, height: 34))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(tr("Speed", "Velocidad"))

          Button {
            WKInterfaceDevice.current().play(.success)
            link.send("bookmark")
          } label: {
            smallIcon("bookmark")
          }
          .buttonStyle(.plain)
          .accessibilityLabel(tr("Add bookmark", "Añadir marcador"))
        }
      }
      .padding(.horizontal, 2)
    }
    .containerBackground(for: .tabView) {
      CoverBackground(url: now.coverUrl)
    }
  }

  private func smallIcon(_ name: String, active: Bool = false) -> some View {
    Image(systemName: name)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(active ? Color.bookliz : Color.white)
      .frame(maxWidth: .infinity, minHeight: 32)
      .background(Circle().fill(Color.white.opacity(0.16)).frame(width: 34, height: 34))
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
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(.black)
        }
      }
      .frame(width: 48, height: 48)
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
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private func fraction(_ part: Double, of whole: Double) -> Double {
    guard whole > 0 else { return 0 }
    return min(1, max(0, part / whole))
  }

  private func sleepText(_ sleep: Sleep, at date: Date) -> String {
    if sleep.kind == "minutes", let endsAt = sleep.endsAt {
      let left = max(0, endsAt / 1000 - date.timeIntervalSince1970)
      return clock(left)
    }
    return tr("Chapter", "Capítulo")
  }
}
