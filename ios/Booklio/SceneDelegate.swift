import React
import UIKit

/**
 * The window lives here, not in AppDelegate: apps built with the iOS 27 SDK
 * must use the UIScene life cycle or UIKit refuses to launch them.
 *
 * AppDelegate still builds the React Native factory once; this scene only
 * hosts it in its window. URLs and universal links now arrive at the scene,
 * so they are handed back to AppDelegate's existing handlers, which keep
 * routing them to Expo's subscribers (Google Sign-In, files opened in
 * Bookliz) and to RCTLinkingManager exactly as before.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    if let existing = appDelegate.window {
      // Debug: AppDelegate already started React Native in this window for
      // expo-dev-launcher; it only needs a scene to be shown in.
      existing.windowScene = windowScene
      existing.makeKeyAndVisible()
      self.window = existing
    } else {
      let window = UIWindow(windowScene: windowScene)
      self.window = window
      // Libraries still look the window up through the app delegate.
      appDelegate.window = window
      factory.startReactNative(
        withModuleName: "main",
        in: window,
        launchOptions: Self.launchOptions(base: appDelegate.launchOptions, connection: connectionOptions))
    }

    // A cold start from a link or a shared file: the app delegate's open-URL
    // path is what Expo modules listen on, so give it the same chance it had
    // before scenes.
    if let context = connectionOptions.urlContexts.first {
      Self.forward(context)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      Self.forward(context)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    let app = UIApplication.shared
    _ = app.delegate?.application?(app, continue: userActivity, restorationHandler: { _ in })
  }

  private static func forward(_ context: UIOpenURLContext) {
    let app = UIApplication.shared
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let source = context.options.sourceApplication { options[.sourceApplication] = source }
    if let annotation = context.options.annotation { options[.annotation] = annotation }
    options[.openInPlace] = context.options.openInPlace
    _ = app.delegate?.application?(app, open: context.url, options: options)
  }

  /// RN reads the initial URL (Linking.getInitialURL) from launch options;
  /// with scenes it comes in the connection options instead.
  private static func launchOptions(
    base: [UIApplication.LaunchOptionsKey: Any]?,
    connection: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any] {
    var options = base ?? [:]
    if let url = connection.urlContexts.first?.url {
      options[.url] = url
    }
    if let activity = connection.userActivities.first {
      options[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    return options
  }
}
