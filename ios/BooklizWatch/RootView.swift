import SwiftUI

struct RootView: View {
  @EnvironmentObject private var link: PhoneLink
  @State private var page = 0

  var body: some View {
    NavigationStack {
      // Two pages, turned with the Digital Crown: listening, then reading.
      // Pages, turned with the Digital Crown: now playing, the audiobooks, reading.
      TabView(selection: $page) {
        audioPage
          .tag(0)
        if let state = link.state, state.now != nil {
          // Picking a book here starts it on the phone; come back up to see it play.
          LibraryView(state: state, isRoot: true, onOpened: { withAnimation { page = 0 } })
            .containerBackground(Color.bookliz.opacity(0.35).gradient, for: .tabView)
            .tag(1)
        }
        ReadingView(reading: link.state?.reading)
          .containerBackground(Color.bookliz.gradient, for: .tabView)
          .tag(2)
      }
      .tabViewStyle(.verticalPage)
    }
  }

  @ViewBuilder
  private var audioPage: some View {
    if let state = link.state {
      if let now = state.now {
        NowPlayingView(state: state, now: now)
      } else {
        LibraryView(state: state, isRoot: true)
          .containerBackground(Color.bookliz.opacity(0.35).gradient, for: .tabView)
      }
    } else {
      WaitingView(reachable: link.reachable)
        .containerBackground(Color.bookliz.opacity(0.35).gradient, for: .tabView)
    }
  }
}

/// Before the phone has said anything.
struct WaitingView: View {
  let reachable: Bool

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: "iphone")
        .font(.system(size: 34))
        .foregroundStyle(Color.bookliz)
      Text(tr("Open Bookliz on your iPhone", "Abre Bookliz en tu iPhone"))
        .font(.headline)
        .multilineTextAlignment(.center)
      Text(tr("Your audiobooks play on the phone; this is the remote.",
              "Tus audiolibros suenan en el iPhone; esto es el mando."))
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      if reachable {
        ProgressView()
      }
    }
    .padding(.horizontal, 4)
  }
}

/// Book cover, blurred, behind the now-playing screen. Teal when there is no web cover.
struct CoverBackground: View {
  let url: String?

  var body: some View {
    ZStack {
      LinearGradient(colors: [Color.bookliz.opacity(0.55), .black], startPoint: .top, endPoint: .bottom)
      if let url, let parsed = URL(string: url) {
        AsyncImage(url: parsed) { image in
          image.resizable().scaledToFill().blur(radius: 14).overlay(Color.black.opacity(0.55))
        } placeholder: {
          Color.clear
        }
      }
    }
    .ignoresSafeArea()
  }
}
