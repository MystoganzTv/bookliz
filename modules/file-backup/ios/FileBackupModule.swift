import ExpoModulesCore

/// In or out of the device backup (iCloud Backup / Finder).
///
/// Set on a DIRECTORY, the flag covers everything inside it, including files
/// added later — so it is applied once to Documents/audiobooks rather than to
/// each imported file. Apple notes some file operations can reset the flag on
/// a file; a directory keeps it, and the app re-applies it on every launch anyway.
public class FileBackupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FileBackup")

    Function("setExcludedFromBackup") { (uri: String, excluded: Bool) -> Bool in
      guard var url = FileBackupModule.fileURL(uri) else { return false }
      var values = URLResourceValues()
      values.isExcludedFromBackup = excluded
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }

    Function("isExcludedFromBackup") { (uri: String) -> Bool? in
      guard let url = FileBackupModule.fileURL(uri) else { return nil }
      return (try? url.resourceValues(forKeys: [.isExcludedFromBackupKey]))?.isExcludedFromBackup
    }
  }

  /// Accepts a `file://` URI (what expo-file-system hands out) or a bare path.
  static func fileURL(_ uri: String) -> URL? {
    if uri.hasPrefix("file://") {
      guard let url = URL(string: uri) else { return nil }
      return url
    }
    return uri.hasPrefix("/") ? URL(fileURLWithPath: uri) : nil
  }
}
