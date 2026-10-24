import SwiftUI

struct RootView: View {
  @EnvironmentObject private var link: PhoneLink

  var body: some View {
    NavigationStack {
      if let state = link.state {
        if let now = state.now {
          NowPlayingView(state: state, now: now)
        } else {
          LibraryView(state: state, isRoot: true)
        }
      } else {
        WaitingView(reachable: link.reachable)
      }
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
