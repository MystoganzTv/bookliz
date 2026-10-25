import SwiftUI
import WatchKit

/// Audiobooks stored on this watch (Bookliz Pro), playable without the iPhone.
struct OnWatchLibraryView: View {
  @ObservedObject private var library = LocalLibrary.shared
  @ObservedObject private var player = WatchPlayer.shared
  var onOpened: () -> Void = {}

  var body: some View {
    Group {
      if library.rows.isEmpty {
        ScrollView {
          VStack(spacing: 8) {
            Image(systemName: "applewatch")
              .font(.system(size: 30))
              .foregroundStyle(Color.bookliz)
            Text(tr("Nothing on this watch yet", "Aún no hay nada en el reloj"))
              .font(.headline)
              .multilineTextAlignment(.center)
            Text(tr("On your iPhone: Settings › Audio files › Send to Apple Watch (Bookliz Pro).",
                    "En el iPhone: Ajustes › Archivos de audio › Enviar al Apple Watch (Bookliz Pro)."))
              .font(.footnote)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
          }
          .padding(.horizontal, 4)
        }
      } else {
        List(library.rows) { row in
          Button {
            guard row.complete else { return }
            WKInterfaceDevice.current().play(.start)
            player.open(row.book)
            onOpened()
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(row.book.title).font(.footnote.weight(.semibold)).lineLimit(2)
              if row.complete {
                ProgressView(value: row.book.totalSec > 0 ? min(1, row.book.positionSec / row.book.totalSec) : 0)
                  .tint(Color.bookliz)
              } else {
                Label(tr("Receiving \(row.received) of \(row.book.tracks.count)", "Recibiendo \(row.received) de \(row.book.tracks.count)"),
                      systemImage: "arrow.down.circle")
                  .font(.caption2)
                  .foregroundStyle(.secondary)
              }
            }
          }
          .swipeActions {
            Button(role: .destructive) {
              library.delete(row.book.bookId)
            } label: {
              Label(tr("Delete", "Borrar"), systemImage: "trash")
            }
          }
        }
      }
    }
    .navigationTitle(tr("On this watch", "En el reloj"))
    .onAppear { library.reload() }
  }
}

/// The player for a book stored on the watch.
struct OnWatchPlayerView: View {
  @ObservedObject private var player = WatchPlayer.shared

  var body: some View {
    if let book = player.book {
      VStack(spacing: 4) {
        VStack(spacing: 0) {
          Text(book.chapterTitle(at: player.positionSec) ?? book.title)
            .font(.system(.headline, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
          Label(tr("On this watch", "En el reloj"), systemImage: "applewatch")
            .labelStyle(.titleAndIcon)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity)

        ProgressView(value: book.totalSec > 0 ? min(1, player.positionSec / book.totalSec) : 0)
          .tint(Color.bookliz)
        HStack {
          Text(clock(player.positionSec))
          Spacer()
          Text("-" + clock(max(0, book.totalSec - player.positionSec)))
        }
        .font(.system(size: 12).monospacedDigit())
        .foregroundStyle(.secondary)

        HStack(spacing: 0) {
          transport("gobackward.15", tr("Back 15 seconds", "Atrás 15 segundos")) { player.skip(-15) }
          Button {
            WKInterfaceDevice.current().play(.click)
            player.toggle()
          } label: {
            ZStack {
              Circle().fill(Color.bookliz)
              if player.isActivating {
                ProgressView()
              } else {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                  .font(.system(size: 22, weight: .bold))
                  .foregroundStyle(.black)
              }
            }
            .frame(width: 48, height: 48)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(player.isPlaying ? tr("Pause", "Pausa") : tr("Play", "Reproducir"))
          transport("goforward.30", tr("Forward 30 seconds", "Adelante 30 segundos")) { player.skip(30) }
        }

        HStack(spacing: 6) {
          Button {
            player.cycleSpeed()
          } label: {
            Text(speedLabel(book.speed))
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .frame(maxWidth: .infinity, minHeight: 32)
              .background(Circle().fill(Color.white.opacity(0.16)).frame(width: 34, height: 34))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(tr("Speed", "Velocidad"))

          Button {
            player.close()
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 14, weight: .semibold))
              .frame(maxWidth: .infinity, minHeight: 32)
              .background(Circle().fill(Color.white.opacity(0.16)).frame(width: 34, height: 34))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(tr("Stop listening on the watch", "Dejar de escuchar en el reloj"))
        }
      }
      .padding(.horizontal, 2)
      .alert(
        tr("Can't play", "No se puede reproducir"),
        isPresented: Binding(get: { player.errorMessage != nil }, set: { if !$0 { player.errorMessage = nil } })
      ) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(player.errorMessage ?? "")
      }
    }
  }

  private func transport(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
    Button {
      WKInterfaceDevice.current().play(.click)
      action()
    } label: {
      Image(systemName: symbol)
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
