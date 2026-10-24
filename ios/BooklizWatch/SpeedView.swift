import SwiftUI

struct SpeedView: View {
  @EnvironmentObject private var link: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let state: WatchState
  let now: NowPlaying

  var body: some View {
    List {
      ForEach(state.speeds, id: \.self) { speed in
        Button {
          link.send("speed", ["speed": speed])
          dismiss()
        } label: {
          HStack {
            Text(speedLabel(speed))
            Spacer()
            if abs(speed - now.speed) < 0.01 {
              Image(systemName: "checkmark").foregroundStyle(Color.bookliz)
            }
          }
        }
      }
    }
    .navigationTitle(tr("Speed", "Velocidad"))
  }
}
