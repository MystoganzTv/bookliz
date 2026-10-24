import Foundation

/// The watch speaks the language chosen in Bookliz on the iPhone (sent with
/// every state), falling back to the watch's own language before the first one.
enum Lang {
  nonisolated(unsafe) static var isSpanish: Bool = Locale.preferredLanguages.first?.hasPrefix("es") ?? false
}

/// Inline two-language string. The watch app has a few dozen strings; this keeps
/// them next to the views and follows the phone's language, which a
/// Localizable.strings file (device language) would not.
func tr(_ en: String, _ es: String) -> String {
  Lang.isSpanish ? es : en
}
