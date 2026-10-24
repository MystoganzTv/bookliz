import SwiftUI

/// Bookliz on Apple Watch — a remote for the audiobook player on the iPhone.
/// The phone does the playing; the watch shows where you are and sends taps.
@main
struct BooklizWatchApp: App {
  @StateObject private var link = PhoneLink.shared

  init() {
    PhoneLink.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(link)
        .tint(.bookliz)
    }
  }
}

extension Color {
  /// Bookliz teal (#14B8A6), same as the phone.
  static let bookliz = Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255)
}
