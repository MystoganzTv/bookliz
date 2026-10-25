import SwiftUI

/// The audiobooks on the phone, most recently played first. Tapping one starts it on the iPhone.
struct LibraryView: View {
  @EnvironmentObject private var link: PhoneLink
  @Environment(\.dismiss) private var dismiss
  let state: WatchState
  /// Shown as a page (nothing playing, or the page after now playing) rather than pushed.
  let isRoot: Bool
  /// Called after a book is sent to the phone — the root uses it to flip back to now playing.
  var onOpened: (() -> Void)? = nil

  var body: some View {
    Group {
      if state.library.isEmpty {
        VStack(spacing: 8) {
          Image(systemName: "headphones")
            .font(.system(size: 30))
            .foregroundStyle(Color.bookliz)
          Text(tr("No audiobooks yet", "Aún no hay audiolibros"))
            .font(.headline)
          Text(tr("Add one to a book in Bookliz on your iPhone.",
                  "Añade uno a un libro en Bookliz en tu iPhone."))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
      } else {
        List(state.library) { item in
          Button {
            link.send("open", ["bookId": item.bookId])
            if isRoot { onOpened?() } else { dismiss() }
          } label: {
            HStack(spacing: 8) {
              cover(item.coverUrl)
              VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.footnote.weight(.semibold)).lineLimit(2)
                Text(item.author).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                ProgressView(value: item.progress).tint(Color.bookliz)
              }
            }
          }
        }
      }
    }
    .navigationTitle(tr("Audiobooks", "Audiolibros"))
  }

  @ViewBuilder
  private func cover(_ url: String?) -> some View {
    let shape = RoundedRectangle(cornerRadius: 4)
    if let url, let parsed = URL(string: url) {
      AsyncImage(url: parsed) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        Color.bookliz.opacity(0.3)
      }
      .frame(width: 30, height: 44)
      .clipShape(shape)
    } else {
      shape
        .fill(Color.bookliz.opacity(0.3))
        .frame(width: 30, height: 44)
        .overlay(Image(systemName: "headphones").font(.caption2))
    }
  }
}
