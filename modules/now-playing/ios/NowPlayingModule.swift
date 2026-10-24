import ExpoModulesCore
import MediaPlayer

/// expo-audio hard-codes the lock-screen skip buttons to 10 s
/// (MediaController.swift: `preferredIntervals = [10.0]`). Its handlers seek by
/// `event.interval`, which iOS fills from `preferredIntervals` — so setting the
/// interval here is enough for the lock screen, Control Center, CarPlay and the
/// Apple Watch "Now Playing" app to skip by the reader's choice.
///
/// Must run AFTER expo-audio enables the remote commands, which it does each
/// time a player becomes active for the lock screen; JS re-applies after that.
public class NowPlayingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NowPlaying")

    Function("setSkipIntervals") { (backward: Double, forward: Double) in
      DispatchQueue.main.async {
        let center = MPRemoteCommandCenter.shared()
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: backward)]
        center.skipForwardCommand.preferredIntervals = [NSNumber(value: forward)]
      }
    }
  }
}
