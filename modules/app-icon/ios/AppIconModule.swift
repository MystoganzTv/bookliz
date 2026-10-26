import ExpoModulesCore
import UIKit

/// Home-screen icon switching. The alternates are app-icon sets in
/// Images.xcassets, listed in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES;
/// `nil` goes back to the primary icon. iOS shows its own "You have changed
/// the icon" alert — that is the system's, not ours.
public class AppIconModule: Module {
  private func bundledIcons() -> [String] {
    let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any]
    let alternates = icons?["CFBundleAlternateIcons"] as? [String: Any] ?? [:]
    return alternates.keys.sorted()
  }

  public func definition() -> ModuleDefinition {
    Name("AppIcon")

    AsyncFunction("supportsAlternateIcons") { () -> Bool in
      UIApplication.shared.supportsAlternateIcons
    }
    .runOnQueue(.main)

    AsyncFunction("currentIcon") { () -> String? in
      UIApplication.shared.alternateIconName
    }
    .runOnQueue(.main)

    AsyncFunction("availableIcons") { () -> [String] in
      self.bundledIcons()
    }

    AsyncFunction("setIcon") { (name: String?, promise: Promise) in
      guard UIApplication.shared.supportsAlternateIcons else {
        promise.reject("ERR_UNSUPPORTED", "Alternate icons are not supported here")
        return
      }
      // iOS may accept an unregistered name without replacing the visible icon.
      // Check the installed binary before treating an unchanged name as success.
      if let name = name, !self.bundledIcons().contains(name) {
        promise.reject("ERR_ICON_NOT_BUNDLED", "This icon is not included in this build. Install an updated build of Bookliz.")
        return
      }
      if UIApplication.shared.alternateIconName == name {
        promise.resolve(name)
        return
      }
      UIApplication.shared.setAlternateIconName(name) { error in
        if let error = error {
          promise.reject("ERR_SET_ICON", error.localizedDescription)
        } else {
          promise.resolve(name)
        }
      }
    }
    .runOnQueue(.main)
  }
}
