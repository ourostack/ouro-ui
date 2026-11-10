// Ouro Feel's window probe: an app's real Mac window pictured and measured from inside the app, for Ouro check's window
// rules (registry/ouro/check/window-check.ts). One file with no dependencies beyond AppKit and WebKit, so an app copies it
// as it is and turns it on only in a test copy; nothing in it runs unless the app calls it.
//
//   park(window)       Moves the window where no display is, at full opacity, never key, out of the Window menu and window
//                      cycling. The window server still composites it, so its picture is the real one (title bar, glass,
//                      toolbar, web content), and nobody sees it. A window at alpha 0 pictures blank, so parking is the way
//                      to hide one. The app's NSWindow subclass returns the frame unchanged from constrainFrameRect while
//                      isParked(window), or AppKit pulls it back onto a screen.
//   picture(window)    The window as composited, as PNG at backing scale. An app may always picture its own windows, so
//                      no Screen Recording permission is asked.
//   measure(window, content:)  The window's size, scale and appearance, the band its title bar and toolbar take
//                      (contentLayoutRect), the content view's frame, and every native chrome element from the window's
//                      own accessibility tree (traffic lights, toolbar items, the toolbar): role, label and frame in window
//                      points from the top left. The content view's subtree (the app's own page) is left out.
//   Loop(url:window:web:).start()  A debug-only command loop for a harness: GET <url>/next answers one command (204: none
//                      yet), and POST <url>/done takes its result. Commands are JSON {id, op, ...}:
//                        measure                       measure(window, content: web)
//                        picture                       {png: base64}
//                        size {width, height}          the window's frame size, in points; answers measure
//                        appearance {name}             "light", "dark" or "system"; answers measure
//                        fullScreen {on}               only when the app allowed it (allowFullScreen): full screen takes a
//                                                      display and a Space, so it is for a runner, never a person's Mac
//                        hit {points: [[x, y]]}        for each point, in window points from the top left, whether a
//                                                      click there reaches the content view (AppKit's own hitTest on the
//                                                      window's frame view) or the title bar takes it: {content, view}
//                        drag {points: [[x, y]]}       for each point, whether a press there moves the window: the
//                                                      app's own answer (dragAt), for a title bar the page draws
//                        js {src}                      src as an async function body in the page, through WebKit, which a
//                                                      page's Content Security Policy doesn't block; answers its return
//                                                      value as JSON
//                        quit                          ends the loop
import AppKit
import WebKit

enum OuroWindowProbe {
  static let parkedOrigin = NSPoint(x: -30000, y: -30000)
  fileprivate static var parked = Set<ObjectIdentifier>()

  static func isParked(_ window: NSWindow) -> Bool { parked.contains(ObjectIdentifier(window)) }

  static func park(_ window: NSWindow) {
    parked.insert(ObjectIdentifier(window))
    window.isExcludedFromWindowsMenu = true
    window.collectionBehavior = [.transient, .ignoresCycle, .fullScreenAuxiliary]
    window.ignoresMouseEvents = true
    window.setFrameOrigin(parkedOrigin)
    window.alphaValue = 1
    window.orderFrontRegardless()
  }

  // CGWindowListCreateImage pictures a window as the window server composites it, without Screen Recording permission
  // for an app's own windows. The SDK marks it obsolete for new code, so it is looked up by name.
  private typealias CreateImage = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
  private static let createImage: CreateImage? = {
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return nil }
    return unsafeBitCast(symbol, to: CreateImage.self)
  }()

  static func picture(_ window: NSWindow) -> Data? {
    // kCGWindowListOptionIncludingWindow; kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution.
    guard let createImage, let image = createImage(.null, 8, UInt32(window.windowNumber), 1 | 8)?.takeRetainedValue() else { return nil }
    return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
  }

  static func measure(_ window: NSWindow, content: NSView?) -> [String: Any] {
    let frame = window.frame
    let toWindow = { (r: NSRect) -> [String: Double] in
      ["x": Double(r.minX - frame.minX), "y": Double(frame.maxY - r.maxY), "width": Double(r.width), "height": Double(r.height)]
    }
    var chrome: [[String: Any]] = []
    let skip = content ?? window.contentView
    func walk(_ element: Any, _ parent: String, _ depth: Int) {
      guard depth < 12, let object = element as? NSObject else { return }
      if let view = element as? NSView {
        if let skip, view === skip || view.isDescendant(of: skip) { return }
        if let root = window.contentView, view === root { return }
      }
      let a = object as? NSAccessibilityProtocol
      let role = a?.accessibilityRole()?.rawValue ?? ""
      if role == "AXWebArea" { return }
      let children = a?.accessibilityChildren() ?? []
      if let a, object !== window {
        let r = a.accessibilityFrame()
        let label = a.accessibilityLabel() ?? a.accessibilityTitle() ?? a.accessibilityIdentifier() ?? ""
        if r.width > 0, r.height > 0 {
          chrome.append(["role": role, "subrole": a.accessibilitySubrole()?.rawValue ?? "", "label": label, "parent": parent,
                         "control": children.isEmpty || role == "AXButton", "frame": toWindow(r)])
        }
      }
      for child in children { walk(child, role, depth + 1) }
    }
    walk(window, "", 0)
    let layout = window.contentLayoutRect
    let dark = window.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    var out: [String: Any] = [
      "window": ["width": Double(frame.width), "height": Double(frame.height)],
      "scale": Double(window.backingScaleFactor),
      "appearance": dark ? "dark" : "light",
      "fullScreen": window.styleMask.contains(.fullScreen),
      "titleBand": ["x": 0.0, "y": 0.0, "width": Double(frame.width), "height": Double(frame.height - layout.maxY)],
      "chrome": chrome,
      "macOS": ProcessInfo.processInfo.operatingSystemVersionString,
    ]
    if let content, content.window === window {
      let r = content.convert(content.bounds, to: nil)
      out["content"] = ["x": Double(r.minX), "y": Double(frame.height - r.maxY), "width": Double(r.width), "height": Double(r.height)]
    }
    return out
  }

  /// The app's answer to whether a press at a point (window points from the top left) moves the window, where the page
  /// draws its own title bar and the app moves the window from its empty parts; nil where the app has no such bar.
  static var dragAt: ((NSWindow, CGPoint) -> Bool)?

  /// Whether fullScreen may run: full screen takes a display and a Space of its own, so only a runner turns it on.
  static var allowFullScreen = false

  struct Refused: Error, CustomStringConvertible { let description: String }

  final class Loop {
    let url: URL
    weak var window: NSWindow?
    weak var web: WKWebView?
    private var stopped = false
    private let session = URLSession(configuration: .ephemeral)

    init(url: URL, window: NSWindow, web: WKWebView?) {
      self.url = url
      self.window = window
      self.web = web
    }

    func start() { next() }

    private func next() {
      guard !stopped else { return }
      var request = URLRequest(url: url.appendingPathComponent("next"))
      request.timeoutInterval = 90
      session.dataTask(with: request) { [weak self] data, response, _ in
        DispatchQueue.main.async {
          guard let self else { return }
          guard let data, (response as? HTTPURLResponse)?.statusCode == 200,
                let command = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.next() }
            return
          }
          self.run(command) { result in
            self.done(command["id"], result)
            self.next()
          }
        }
      }.resume()
    }

    private func done(_ id: Any?, _ result: Result<Any, Error>) {
      var body: [String: Any] = ["id": id ?? NSNull()]
      switch result {
      case .success(let value): body["ok"] = true; body["value"] = value
      case .failure(let error): body["ok"] = false; body["why"] = String(describing: error)
      }
      var request = URLRequest(url: url.appendingPathComponent("done"))
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = (try? JSONSerialization.data(withJSONObject: body)) ?? Data("{}".utf8)
      session.dataTask(with: request).resume()
    }

    private func settle(_ seconds: Double, _ answer: @escaping (Result<Any, Error>) -> Void) {
      DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
        guard let self, let window = self.window else { return answer(.failure(Refused(description: "the window is gone"))) }
        answer(.success(OuroWindowProbe.measure(window, content: self.web)))
      }
    }

    private func run(_ command: [String: Any], _ answer: @escaping (Result<Any, Error>) -> Void) {
      guard let window else { return answer(.failure(Refused(description: "the window is gone"))) }
      switch command["op"] as? String {
      case "measure":
        answer(.success(OuroWindowProbe.measure(window, content: web)))
      case "picture":
        guard let png = OuroWindowProbe.picture(window) else {
          return answer(.failure(Refused(description: "the window server gave no picture of window \(window.windowNumber)")))
        }
        answer(.success(["png": png.base64EncodedString()]))
      case "size":
        var frame = window.frame
        let width = CGFloat(command["width"] as? Double ?? Double(frame.width)), height = CGFloat(command["height"] as? Double ?? Double(frame.height))
        frame.origin.y += frame.height - height
        frame.size = NSSize(width: width, height: height)
        window.setFrame(frame, display: true)
        settle(0.3, answer)
      case "appearance":
        switch command["name"] as? String {
        case "dark": window.appearance = NSAppearance(named: .darkAqua)
        case "light": window.appearance = NSAppearance(named: .aqua)
        default: window.appearance = nil
        }
        settle(0.3, answer)
      case "fullScreen":
        let on = command["on"] as? Bool ?? true
        guard OuroWindowProbe.allowFullScreen else {
          return answer(.failure(Refused(description: "full screen takes a display and a Space, so this copy doesn't allow it (allowFullScreen is off)")))
        }
        if window.styleMask.contains(.fullScreen) != on {
          if on {
            OuroWindowProbe.parked.remove(ObjectIdentifier(window))
            window.collectionBehavior = [.fullScreenPrimary]
          }
          window.toggleFullScreen(nil)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
          if !on { OuroWindowProbe.park(window) }
          self.settle(0.2, answer)
        }
      case "hit":
        guard let frameView = window.contentView?.superview else { return answer(.failure(Refused(description: "the window has no frame view"))) }
        let content = web ?? window.contentView
        let points = (command["points"] as? [[Double]]) ?? []
        answer(.success(points.map { p -> [String: Any] in
          let hit = p.count == 2 ? frameView.hitTest(NSPoint(x: p[0], y: Double(window.frame.height) - p[1])) : nil
          let inside = hit.flatMap { h in content.map { h === $0 || h.isDescendant(of: $0) } } ?? false
          return ["content": inside, "view": hit.map { String(describing: type(of: $0)) } ?? ""]
        }))
      case "drag":
        guard let dragAt = OuroWindowProbe.dragAt else { return answer(.failure(Refused(description: "this app draws no title bar of its own (dragAt is unset)"))) }
        let points = (command["points"] as? [[Double]]) ?? []
        answer(.success(points.map { p -> Bool in p.count == 2 && dragAt(window, CGPoint(x: p[0], y: p[1])) }))
      case "js":
        guard let web, let src = command["src"] as? String else { return answer(.failure(Refused(description: "no web view, or no src"))) }
        let body = "return JSON.stringify(await (async () => {\n\(src)\n})() ?? null);"
        web.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { result in
          switch result {
          case .success(let value):
            let text = value as? String ?? "null"
            answer(.success((try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])) ?? NSNull()))
          case .failure(let error): answer(.failure(error))
          }
        }
      case "quit":
        stopped = true
        answer(.success(true))
      default:
        answer(.failure(Refused(description: "no op \(command["op"] ?? "")")))
      }
    }
  }
}
