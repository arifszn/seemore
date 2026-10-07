// Makes seemore the default app for Markdown on macOS (DESKTOP-SPEC §13). Electron has no
// API for file-type defaults, so the app runs this, bundled in Resources and ad-hoc signed
// with the app. macOS asks the user to confirm each change.
//
// Usage: default-handler <path to seemore.app>
// Exit 0: seemore is the default for every type. 1: the user kept the other app. 2: error,
// on stderr.
import AppKit
import UniformTypeIdentifiers

// The types the app's Info.plist claims (electron-builder.yml, mac.extendInfo).
let typeIdentifiers = ["net.daringfireball.markdown", "dev.seemore.mdx"]

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write("usage: default-handler <app bundle>\n".data(using: .utf8)!)
  exit(2)
}
let app = URL(fileURLWithPath: CommandLine.arguments[1])
guard let bundleId = Bundle(url: app)?.bundleIdentifier else {
  FileHandle.standardError.write("not an app bundle: \(app.path)\n".data(using: .utf8)!)
  exit(2)
}

/// One change, waited for on the main run loop: the completion handler runs on the main queue.
func setDefault(_ type: UTType) -> Error? {
  var result: Error??
  NSWorkspace.shared.setDefaultApplication(at: app, toOpen: type) { result = .some($0) }
  while result == nil { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
  return result!
}

for identifier in typeIdentifiers {
  guard let type = UTType(identifier) else { continue }
  // By bundle id, not path: another copy of seemore as the default is already seemore. A
  // type that's already ours asks nothing.
  if let current = NSWorkspace.shared.urlForApplication(toOpen: type),
    Bundle(url: current)?.bundleIdentifier == bundleId
  {
    continue
  }
  if let error = setDefault(type) {
    let underlying = (error as NSError).userInfo[NSUnderlyingErrorKey] as? NSError
    if underlying?.domain == NSOSStatusErrorDomain && underlying?.code == userCanceledErr { exit(1) }
    FileHandle.standardError.write("\(error.localizedDescription)\n".data(using: .utf8)!)
    exit(2)
  }
}
exit(0)
