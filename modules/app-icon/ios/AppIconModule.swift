import ExpoModulesCore
import UIKit

/// Home-screen icon switching. The alternates are app-icon sets in
/// Images.xcassets, listed in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES;
/// `nil` goes back to the primary icon. iOS shows its own "You have changed
/// the icon" alert — that is the system's, not ours.
public class AppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppIcon")

    Function("supportsAlternateIcons") { () -> Bool in
      UIApplication.shared.supportsAlternateIcons
    }
    .runOnQueue(.main)

    Function("currentIcon") { () -> String? in
      UIApplication.shared.alternateIconName
    }
    .runOnQueue(.main)

    AsyncFunction("setIcon") { (name: String?, promise: Promise) in
      guard UIApplication.shared.supportsAlternateIcons else {
        promise.reject("ERR_UNSUPPORTED", "Alternate icons are not supported here")
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
