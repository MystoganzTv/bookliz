import SwiftUI
import WatchKit

/// The second page: reading on paper or an e-reader. Today at a glance, and a
/// timer that runs on the iPhone — stopping it opens the session form there,
/// where the pages get filled in.
struct ReadingView: View {
  @EnvironmentObject private var link: PhoneLink
  let reading: Reading?
  @State private var justStopped = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let reading {
          today(reading.today)
          if let timer = reading.timer {
            running(timer)
          } else {
            if justStopped {
              Label(tr("Add the pages on your iPhone", "Apunta las páginas en el iPhone"), systemImage: "iphone")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            start(reading.books)
          }
        } else {
          Text(tr("Open Bookliz on your iPhone", "Abre Bookliz en tu iPhone"))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
    .navigationTitle(tr("Reading", "Lectura"))
  }

  private func today(_ today: Reading.Today) -> some View {
    HStack(alignment: .top, spacing: 6) {
      stat(value: "\(today.minutes)", label: tr("min today", "min hoy"))
      stat(value: "\(today.streak)", label: today.streak == 1 ? tr("day streak", "día seguido") : tr("days streak", "días seguidos"))
      if today.yearlyGoal > 0 {
        stat(value: "\(today.booksThisYear)/\(today.yearlyGoal)", label: tr("this year", "este año"))
      } else {
        stat(value: "\(today.booksThisYear)", label: tr("this year", "este año"))
      }
    }
  }

  private func stat(value: String, label: String) -> some View {
    VStack(spacing: 1) {
      Text(value)
        .font(.system(.title3, design: .rounded).weight(.bold))
        .minimumScaleFactor(0.6)
        .lineLimit(1)
      Text(label)
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
        .lineLimit(2)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }

  private func running(_ timer: Reading.RunningTimer) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(timer.title)
        .font(.headline)
        .lineLimit(2)
      Text(Date(timeIntervalSince1970: timer.startedAt / 1000), style: .timer)
        .font(.system(size: 34, weight: .semibold, design: .rounded).monospacedDigit())
        .foregroundStyle(Color.bookliz)
      Button {
        WKInterfaceDevice.current().play(.stop)
        justStopped = true
        link.send("readingStop")
      } label: {
        Label(tr("Stop", "Parar"), systemImage: "stop.fill")
          .frame(maxWidth: .infinity)
      }
      .tint(Color.bookliz)
      .buttonStyle(.borderedProminent)
      Button(role: .destructive) {
        link.send("readingDiscard")
      } label: {
        Text(tr("Discard", "Descartar"))
          .frame(maxWidth: .infinity)
      }
    }
  }

  @ViewBuilder
  private func start(_ books: [Reading.ReadingBook]) -> some View {
    Text(tr("Start reading", "Empezar a leer"))
      .font(.headline)
    if books.isEmpty {
      Text(tr("No book marked as reading right now.", "Ahora no tienes ningún libro marcado como leyendo."))
        .font(.footnote)
        .foregroundStyle(.secondary)
    } else {
      ForEach(books) { book in
        Button {
          WKInterfaceDevice.current().play(.start)
          justStopped = false
          link.send("readingStart", ["bookId": book.bookId])
        } label: {
          VStack(alignment: .leading, spacing: 1) {
            Text(book.title).font(.footnote.weight(.semibold)).lineLimit(2)
            if !book.author.isEmpty {
              Text(book.author).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }
}
