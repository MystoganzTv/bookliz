import SwiftUI

struct ChaptersView: View {
  @EnvironmentObject private var link: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let now: NowPlaying
  let current: Int?

  var body: some View {
    ScrollViewReader { proxy in
      List {
        ForEach(Array(now.chapters.enumerated()), id: \.offset) { index, chapter in
          Button {
            link.send("chapter", ["index": index])
            dismiss()
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(chapter.t.isEmpty ? tr("Chapter \(index + 1)", "Capítulo \(index + 1)") : chapter.t)
                  .lineLimit(2)
                Text(clock(chapter.s))
                  .font(.caption2.monospacedDigit())
                  .foregroundStyle(.secondary)
              }
              Spacer(minLength: 4)
              if index == current {
                Image(systemName: "speaker.wave.2.fill")
                  .foregroundStyle(Color.bookliz)
              }
            }
          }
          .id(index)
        }
      }
      .onAppear {
        if let current { proxy.scrollTo(current, anchor: .center) }
      }
    }
    .navigationTitle(tr("Chapters", "Capítulos"))
  }
}
