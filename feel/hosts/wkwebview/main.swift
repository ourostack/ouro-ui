// Ouro Feel's WKWebView host: a window with the system's WKWebView in it, and nothing of Ouro Feel's
// but a picture on request, so it stands where an app's own shipped web view stands. The page gets
// the probe from the server that serves it (feel/service.mts), as an app's probe service would give it.
//
//   ouro-feel-wkwebview --url <page> --info <file.json> [--width 1280] [--height 800]
//
// It writes the engine's version and the OS to --info once its window is up. When the page sets its
// title to "ouro-feel:shot:<path>", it pictures the web view into <path> as PNG.
import AppKit
import WebKit

func argument(_ name: String, _ fallback: String? = nil) -> String {
  let args = CommandLine.arguments
  if let index = args.firstIndex(of: "--\(name)"), index + 1 < args.count { return args[index + 1] }
  if let fallback { return fallback }
  FileHandle.standardError.write("ouro-feel-wkwebview: --\(name) is required.\n".data(using: .utf8)!)
  exit(2)
}

final class Host: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let url = URL(string: argument("url"))!
  let info = argument("info")
  let size = NSSize(width: Double(argument("width", "1280"))!, height: Double(argument("height", "800"))!)
  var window: NSWindow!
  var webView: WKWebView!
  var titleWatch: NSKeyValueObservation?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    webView = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
    webView.navigationDelegate = self
    if #available(macOS 13.3, *) { webView.isInspectable = true }
    window = NSWindow(contentRect: NSRect(origin: NSPoint(x: 40, y: 40), size: size), styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "Ouro Feel"
    window.contentView = webView
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    titleWatch = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
      guard let title = view.title, title.hasPrefix("ouro-feel:shot:") else { return }
      self?.shoot(to: String(title.dropFirst("ouro-feel:shot:".count)))
    }
    let webKit = Bundle(for: WKWebView.self).infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
    let os = ProcessInfo.processInfo.operatingSystemVersionString
    let record = ["engineVersion": webKit, "os": "macOS \(os)"]
    let data = try! JSONSerialization.data(withJSONObject: record)
    FileManager.default.createFile(atPath: info, contents: data)
    webView.load(URLRequest(url: url))
  }

  func shoot(to path: String) {
    webView.takeSnapshot(with: nil) { image, error in
      guard let image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else {
        FileHandle.standardError.write("ouro-feel-wkwebview: no picture: \(String(describing: error))\n".data(using: .utf8)!)
        return
      }
      // Written beside its path and moved into place, so a reader never sees half a file.
      let partial = path + ".partial"
      FileManager.default.createFile(atPath: partial, contents: png)
      try? FileManager.default.removeItem(atPath: path)
      try? FileManager.default.moveItem(atPath: partial, toPath: path)
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    FileHandle.standardError.write("ouro-feel-wkwebview: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    FileHandle.standardError.write("ouro-feel-wkwebview: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    FileHandle.standardError.write("ouro-feel-wkwebview: the web content process ended.\n".data(using: .utf8)!)
    exit(1)
  }
}

let app = NSApplication.shared
let host = Host()
app.delegate = host
app.setActivationPolicy(.regular)
app.run()
