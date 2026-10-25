import ExpoModulesCore
import Foundation

/// Audiobooks in the app's own iCloud Drive container
/// (iCloud.com.mystodev.booklio › Documents/Audiobooks/<id>/).
///
/// The space is the reader's iCloud storage, not ours; iOS uploads and
/// downloads in the background. Files are COPIED both ways — the copy on this
/// device and the copy in iCloud are independent, so deleting one never
/// deletes the other. Each folder carries a manifest.json (written by JS) that
/// says which book it belongs to and in which order the files play.
public class ICloudAudioModule: Module {
  static let containerId = "iCloud.com.mystodev.booklio"
  /// Concurrent: a long download (it waits on iCloud) must not hold up a listing.
  private let queue = DispatchQueue(label: "bookliz.icloud-audio", qos: .utility, attributes: .concurrent)

  public func definition() -> ModuleDefinition {
    Name("ICloudAudio")

    Events("onTransferProgress")

    /// signedIn: an iCloud account is on the device. available: our container resolves.
    AsyncFunction("status") { (promise: Promise) in
      self.queue.async {
        let signedIn = FileManager.default.ubiquityIdentityToken != nil
        let available = signedIn && ICloudAudioModule.root() != nil
        promise.resolve(["signedIn": signedIn, "available": available])
      }
    }

    /// Copy every file of a local folder (plus the manifest) up to iCloud.
    AsyncFunction("upload") { (localFolder: String, remoteId: String, manifestJson: String, promise: Promise) in
      self.queue.async {
        do {
          guard let root = ICloudAudioModule.root() else { throw ICloudError.unavailable }
          guard let source = ICloudAudioModule.fileURL(localFolder) else { throw ICloudError.badPath(localFolder) }
          let target = root.appendingPathComponent(ICloudAudioModule.safe(remoteId), isDirectory: true)
          let fm = FileManager.default
          try fm.createDirectory(at: target, withIntermediateDirectories: true)
          let files = try fm.contentsOfDirectory(at: source, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])
            .filter { !$0.hasDirectoryPath }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
          var bytes: Int64 = 0
          for (index, file) in files.enumerated() {
            let destination = target.appendingPathComponent(file.lastPathComponent)
            let size = Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
            let existing = Int64((try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1)
            if existing != size {
              try ICloudAudioModule.coordinatedCopy(from: file, to: destination)
            }
            bytes += size
            self.sendEvent("onTransferProgress", ["remoteId": remoteId, "direction": "upload", "done": index + 1, "total": files.count])
          }
          try ICloudAudioModule.coordinatedWrite(Data(manifestJson.utf8), to: target.appendingPathComponent("manifest.json"))
          promise.resolve(["files": files.count, "bytes": bytes])
        } catch {
          promise.reject("ERR_ICLOUD_UPLOAD", error.localizedDescription)
        }
      }
    }

    /// Every audiobook folder in iCloud: its manifest (null while the
    /// manifest itself is still downloading) and whether its files are
    /// already on this device and done uploading.
    AsyncFunction("list") { (promise: Promise) in
      self.queue.async {
        guard let root = ICloudAudioModule.root() else {
          promise.resolve([])
          return
        }
        let fm = FileManager.default
        let folders = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil, options: [])) ?? []
        var out: [[String: Any]] = []
        for folder in folders where folder.hasDirectoryPath {
          let entries = ICloudAudioModule.entries(in: folder)
          let manifestURL = folder.appendingPathComponent("manifest.json")
          var row: [String: Any] = ["remoteId": folder.lastPathComponent]
          if let data = try? Data(contentsOf: manifestURL), let text = String(data: data, encoding: .utf8) {
            row["manifest"] = text
          } else {
            try? fm.startDownloadingUbiquitousItem(at: manifestURL)
            row["manifest"] = NSNull()
          }
          let audio = entries.filter { $0.name != "manifest.json" }
          row["files"] = audio.count
          row["bytes"] = audio.reduce(Int64(0)) { $0 + $1.size }
          row["downloaded"] = audio.allSatisfy { $0.downloaded }
          row["uploaded"] = audio.allSatisfy { $0.uploaded }
          out.append(row)
        }
        promise.resolve(out)
      }
    }

    /// Bring a folder's files down (if needed) and copy them to a temporary
    /// folder the app owns; resolves with those file:// URIs. The iCloud copy
    /// stays where it is.
    AsyncFunction("download") { (remoteId: String, timeoutSec: Double, promise: Promise) in
      self.queue.async {
        do {
          guard let root = ICloudAudioModule.root() else { throw ICloudError.unavailable }
          let folder = root.appendingPathComponent(ICloudAudioModule.safe(remoteId), isDirectory: true)
          let fm = FileManager.default
          var names = ICloudAudioModule.entries(in: folder).map { $0.name }.filter { $0 != "manifest.json" }.sorted()
          if names.isEmpty { throw ICloudError.empty(remoteId) }
          for name in names {
            try? fm.startDownloadingUbiquitousItem(at: folder.appendingPathComponent(name))
          }
          let deadline = Date().addingTimeInterval(timeoutSec > 0 ? timeoutSec : 1800)
          while true {
            let entries = ICloudAudioModule.entries(in: folder).filter { $0.name != "manifest.json" }
            let done = entries.filter { $0.downloaded }.count
            self.sendEvent("onTransferProgress", ["remoteId": remoteId, "direction": "download", "done": done, "total": entries.count])
            if done == entries.count {
              names = entries.map { $0.name }.sorted()
              break
            }
            if Date() > deadline { throw ICloudError.timeout }
            Thread.sleep(forTimeInterval: 1)
          }
          let caches = try fm.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
          let staging = caches.appendingPathComponent("icloud-import", isDirectory: true)
            .appendingPathComponent("\(ICloudAudioModule.safe(remoteId))-\(Int(Date().timeIntervalSince1970))", isDirectory: true)
          try fm.createDirectory(at: staging, withIntermediateDirectories: true)
          var uris: [String] = []
          for name in names {
            let destination = staging.appendingPathComponent(name)
            try ICloudAudioModule.coordinatedCopy(from: folder.appendingPathComponent(name), to: destination)
            uris.append(destination.absoluteString)
          }
          promise.resolve(uris)
        } catch {
          promise.reject("ERR_ICLOUD_DOWNLOAD", error.localizedDescription)
        }
      }
    }

    /// Delete a folder from iCloud (every device loses the cloud copy; local copies stay).
    AsyncFunction("remove") { (remoteId: String, promise: Promise) in
      self.queue.async {
        do {
          guard let root = ICloudAudioModule.root() else { throw ICloudError.unavailable }
          let folder = root.appendingPathComponent(ICloudAudioModule.safe(remoteId), isDirectory: true)
          var coordinationError: NSError?
          var removeError: Error?
          NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: folder, options: .forDeleting, error: &coordinationError) { url in
            do { try FileManager.default.removeItem(at: url) } catch { removeError = error }
          }
          if let error = coordinationError ?? removeError { throw error }
          promise.resolve(true)
        } catch {
          promise.reject("ERR_ICLOUD_REMOVE", error.localizedDescription)
        }
      }
    }
  }

  // MARK: - Helpers

  enum ICloudError: LocalizedError {
    case unavailable, timeout, badPath(String), empty(String)
    var errorDescription: String? {
      switch self {
      case .unavailable: return "iCloud Drive is not available (signed out, or iCloud Drive is off for Bookliz)."
      case .timeout: return "iCloud took too long to download the files. Try again on Wi-Fi."
      case .badPath(let path): return "Not a local folder: \(path)"
      case .empty(let id): return "Nothing in iCloud for \(id)."
      }
    }
  }

  struct Entry {
    let name: String
    let size: Int64
    let downloaded: Bool
    let uploaded: Bool
  }

  /// Must not run on the main thread (Apple: it can block while the container is set up).
  static func root() -> URL? {
    guard let container = FileManager.default.url(forUbiquityContainerIdentifier: containerId) else { return nil }
    let root = container.appendingPathComponent("Documents", isDirectory: true).appendingPathComponent("Audiobooks", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  /// Files in a folder, real or still-in-the-cloud placeholders (".name.icloud").
  static func entries(in folder: URL) -> [Entry] {
    let keys: [URLResourceKey] = [
      .fileSizeKey, .ubiquitousItemDownloadingStatusKey, .ubiquitousItemIsUploadedKey, .totalFileSizeKey,
    ]
    let items = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys, options: [])) ?? []
    var byName: [String: Entry] = [:]
    for item in items where !item.hasDirectoryPath {
      var name = item.lastPathComponent
      let isPlaceholder = name.hasPrefix(".") && name.hasSuffix(".icloud")
      if isPlaceholder {
        name = String(name.dropFirst().dropLast(".icloud".count))
      } else if name.hasPrefix(".") {
        continue
      }
      let real = folder.appendingPathComponent(name)
      let values = try? real.resourceValues(forKeys: Set(keys))
      let status = values?.ubiquitousItemDownloadingStatus
      let downloaded = !isPlaceholder && (status == nil || status == .current || status == .downloaded)
      let size = Int64(values?.fileSize ?? values?.totalFileSize ?? 0)
      let uploaded = values?.ubiquitousItemIsUploaded ?? false
      let entry = Entry(name: name, size: size, downloaded: downloaded, uploaded: uploaded)
      if let existing = byName[name], existing.downloaded { continue }
      byName[name] = entry
    }
    return Array(byName.values)
  }

  static func coordinatedCopy(from source: URL, to destination: URL) throws {
    var coordinationError: NSError?
    var copyError: Error?
    NSFileCoordinator(filePresenter: nil).coordinate(
      readingItemAt: source, options: [], writingItemAt: destination, options: .forReplacing, error: &coordinationError
    ) { readURL, writeURL in
      do {
        let fm = FileManager.default
        if fm.fileExists(atPath: writeURL.path) { try fm.removeItem(at: writeURL) }
        try fm.copyItem(at: readURL, to: writeURL)
      } catch {
        copyError = error
      }
    }
    if let error = coordinationError ?? copyError { throw error }
  }

  static func coordinatedWrite(_ data: Data, to destination: URL) throws {
    var coordinationError: NSError?
    var writeError: Error?
    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: destination, options: .forReplacing, error: &coordinationError) { url in
      do { try data.write(to: url, options: .atomic) } catch { writeError = error }
    }
    if let error = coordinationError ?? writeError { throw error }
  }

  static func fileURL(_ uri: String) -> URL? {
    if uri.hasPrefix("file://") { return URL(string: uri) }
    return uri.hasPrefix("/") ? URL(fileURLWithPath: uri) : nil
  }

  /// Folder names come from book ids; keep them to a safe character set.
  static func safe(_ id: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let cleaned = String(id.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
    return cleaned.isEmpty ? "untitled" : cleaned
  }
}
