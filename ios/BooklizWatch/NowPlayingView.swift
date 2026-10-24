import SwiftUI
import WatchKit

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
        VStack(spacing: 1) {
          Text(now.chapterTitle(index))
            .font(.headline)
            .lineLimit(2)
            .multilineTextAlignment(.center)
          Text(index == nil ? now.author : now.title)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        ProgressView(value: fraction(position - range.start, of: range.end - range.start))
          .tint(Color.bookliz)
        HStack {
          Text(clock(position - range.start))
          Spacer()
          Text("-" + clock(range.end - position))
        }
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.secondary)

        HStack(spacing: 4) {
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

        if link.unreachableNotice {
          Text(tr("iPhone not reachable", "iPhone no disponible"))
            .font(.caption2)
            .foregroundStyle(.orange)
        } else if let sleep = now.sleep {
          Label(sleepText(sleep, at: context.date), systemImage: "moon.zzz.fill")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
    }
    .containerBackground(for: .navigation) {
      CoverBackground(url: now.coverUrl)
    }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        NavigationLink {
          LibraryView(state: state, isRoot: false)
        } label: {
          Image(systemName: "books.vertical")
        }
        .accessibilityLabel(tr("Audiobooks", "Audiolibros"))
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          WKInterfaceDevice.current().play(.success)
          link.send("bookmark")
        } label: {
          Image(systemName: "bookmark")
        }
        .accessibilityLabel(tr("Add bookmark", "Añadir marcador"))
      }
      ToolbarItem(placement: .bottomBar) {
        NavigationLink {
          ChaptersView(now: now, current: now.chapterIndex(at: now.position(at: Date(), sentAt: state.sentAt)))
        } label: {
          Image(systemName: "list.bullet")
        }
        .disabled(now.chapters.isEmpty)
        .accessibilityLabel(tr("Chapters", "Capítulos"))
      }
      ToolbarItem(placement: .bottomBar) {
        NavigationLink {
          SleepView(state: state, now: now)
        } label: {
          Image(systemName: now.sleep == nil ? "moon.zzz" : "moon.zzz.fill")
        }
        .accessibilityLabel(tr("Sleep timer", "Temporizador"))
      }
      ToolbarItem(placement: .bottomBar) {
        NavigationLink {
          SpeedView(state: state, now: now)
        } label: {
          Text(speedLabel(now.speed))
            .font(.footnote.weight(.semibold))
        }
        .accessibilityLabel(tr("Speed", "Velocidad"))
      }
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
            .font(.system(size: 26, weight: .bold))
            .foregroundStyle(.black)
        }
      }
      .frame(width: 58, height: 58)
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
        .font(.system(size: 24, weight: .semibold))
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
    return tr("End of chapter", "Fin del capítulo")
  }
}
