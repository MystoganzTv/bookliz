import SwiftUI

/// Bookliz on Apple Watch — a remote for the audiobook player on the iPhone,
/// and (Bookliz Pro) a player of its own for books sent to the watch.
@main
struct BooklizWatchApp: App {
  @StateObject private var link = PhoneLink.shared

  init() {
    PhoneLink.shared.activate()
    LocalLibrary.shared.reload()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(link)
    }
  }
}

extension Color {
  /// Bookliz teal (#14B8A6), same as the phone.
  static let bookliz = Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255)
}
