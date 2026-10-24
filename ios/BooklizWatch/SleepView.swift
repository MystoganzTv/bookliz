import SwiftUI

struct SleepView: View {
  @EnvironmentObject private var link: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let state: WatchState
  let now: NowPlaying

  var body: some View {
    List {
      if now.sleep != nil {
        Button(role: .destructive) {
          link.send("sleep", ["kind": "off"])
          dismiss()
        } label: {
          Text(tr("Turn off", "Desactivar"))
        }
      }
      ForEach(state.sleepMinutes, id: \.self) { minutes in
        Button {
          link.send("sleep", ["kind": "minutes", "minutes": minutes])
          dismiss()
        } label: {
          Text(tr("\(minutes) minutes", "\(minutes) minutos"))
        }
      }
      if !now.chapters.isEmpty {
        Button {
          link.send("sleep", ["kind": "chapter"])
          dismiss()
        } label: {
          HStack {
            Text(tr("End of chapter", "Fin del capítulo"))
            Spacer()
            if now.sleep?.kind == "chapter" {
              Image(systemName: "checkmark").foregroundStyle(Color.bookliz)
            }
          }
        }
      }
    }
    .navigationTitle(tr("Sleep timer", "Temporizador"))
  }
}
