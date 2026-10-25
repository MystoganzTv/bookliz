import AVKit
import ExpoModulesCore

/// Apple's own AirPlay button. Tapping it opens the system route picker
/// (speakers, AirPods, Apple TV…); the icon turns `activeTintColor` while
/// audio is going somewhere other than the phone.
public class AirPlayButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AirPlayButton")

    View(AirPlayButtonView.self) {
      Prop("tintColor") { (view: AirPlayButtonView, color: UIColor?) in
        view.picker.tintColor = color ?? .white
      }
      Prop("activeTintColor") { (view: AirPlayButtonView, color: UIColor?) in
        view.picker.activeTintColor = color ?? .systemBlue
      }
    }
  }
}

final class AirPlayButtonView: ExpoView {
  let picker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    backgroundColor = .clear
    picker.backgroundColor = .clear
    // An audiobook app: list audio routes first, not TVs for video.
    picker.prioritizesVideoDevices = false
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
