import AppKit
import WebKit

// The squircle cost probe's browser: a WKWebView in a window of its own, as an app embeds it. It opens the probe page
// (page.tsx) at the address given, and prints one JSON object:
//   bench: how long each frame's rendering takes while the area around 285 squircle controls repaints, with the
//          surfaces drawn (on), hidden (off) and drawn as before #1385 (ref), alternated over the rounds;
//   typing: each key's time from keydown to painted, typing into the chat's composer at 120 words a minute (fast) and
//           a key every 90 ms (slow) while a message arrives every 400 ms.
// Usage: harness <base URL> <rounds>
let base = CommandLine.arguments[1]
let rounds = Int(CommandLine.arguments[2]) ?? 10
let sentence = Array("loop back with all the feedback and see you all soon three weeks")
let keyCodes: [Character: UInt16] = ["a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46, " ": 49]

/** When each key goes, in ms from the first, as an app's typing-120wpm case sends them: the mean gap varied ±30%, and 35 ms for a repeated letter. */
func schedule(wpm: Double) -> [Double] {
  let mean = 60_000 / (wpm * 5)
  let vary = [1, 0.7, 1.3, 0.85, 1.15, 0.75, 1.25, 1.0]
  var at: [Double] = []
  var t = 0.0
  for i in sentence.indices {
    if i > 0 { t += sentence[i] == sentence[i - 1] ? 35 : mean * vary[i % vary.count] }
    at.append(t)
  }
  return at
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 1280, height: 800), styleMask: [.titled], backing: .buffered, defer: false)
window.level = .floating
let web = WKWebView(frame: window.contentView!.bounds, configuration: WKWebViewConfiguration())
web.autoresizingMask = [.width, .height]
window.contentView!.addSubview(web)
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

final class Loads: NSObject, WKNavigationDelegate {
  var done: CheckedContinuation<Void, Never>?
  func webView(_: WKWebView, didFinish _: WKNavigation!) { done?.resume(); done = nil }
}
let loads = Loads()
web.navigationDelegate = loads

@MainActor func open(_ query: String) async {
  await withCheckedContinuation { done in
    loads.done = done
    web.load(URLRequest(url: URL(string: base + "?" + query)!))
  }
  try? await Task.sleep(nanoseconds: 1_200_000_000)
}
@MainActor func run(_ script: String) async -> Any? {
  try? await web.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page)
}
@MainActor func pause(_ ms: Double) async { try? await Task.sleep(nanoseconds: UInt64(max(0, ms) * 1_000_000)) }
@MainActor func press(_ key: Character) {
  let text = String(key)
  for type in [NSEvent.EventType.keyDown, .keyUp] {
    window.sendEvent(NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, characters: text, charactersIgnoringModifiers: text, isARepeat: false, keyCode: keyCodes[key] ?? 0)!)
  }
}

// A frame's rendering: from its requestAnimationFrame callbacks to the first task after it, which runs once style,
// layout and paint are done. The bench changes the background around the controls each frame, so each frame repaints them.
let benchScript = """
const field = document.getElementById("bench"), out = [];
for (let i = 0; i < 200; i++) {
  field.style.backgroundColor = i % 2 ? "rgb(250, 250, 250)" : "rgb(251, 251, 251)";
  out.push(await new Promise((done) => requestAnimationFrame(() => { const start = performance.now(); const channel = new MessageChannel(); channel.port1.onmessage = () => done(performance.now() - start); channel.port2.postMessage(0); })));
  await new Promise((done) => setTimeout(done, 5));
}
return out.slice(10);
"""
// A key's time to paint: from its keydown, as the system stamped it, to the first task after the frame that draws it.
let arm = """
window.probeKeys = [];
document.addEventListener("keydown", (event) => { const at = event.timeStamp; requestAnimationFrame(() => { const channel = new MessageChannel(); channel.port1.onmessage = () => window.probeKeys.push(performance.now() - at); channel.port2.postMessage(0); }); }, true);
const box = document.querySelector("[data-ouro=composer] textarea");
box.focus();
window.probePush(true);
return document.activeElement === box;
"""

Task { @MainActor in
  var report: [String: Any] = [:]
  await open("bench")
  report["engine"] = await run("return { userAgent: navigator.userAgent, cornerShape: CSS.supports('corner-shape', 'squircle'), surfaces: document.querySelectorAll('[data-ouro-surface]').length }")
  var bench: [String: [Double]] = ["on": [], "off": [], "ref": []]
  var fast: [Double] = [], slow: [Double] = []
  for round in 0..<rounds {
    let modes = ["on", "off", "ref"]
    for mode in round % 2 == 0 ? modes : modes.reversed() {
      await open(mode == "on" ? "bench" : "bench&" + mode)
      bench[mode]! += (await run(benchScript) as? [Double]) ?? []
    }
    for quick in round % 2 == 0 ? [true, false] : [false, true] {
      await open("chat")
      window.makeFirstResponder(web)
      guard (await run(arm) as? Bool) == true else { print("{\"error\": \"the composer took no focus\"}"); exit(1) }
      await pause(300)
      let start = ProcessInfo.processInfo.systemUptime
      let at = quick ? schedule(wpm: 120) : sentence.indices.map { Double($0) * 90 }
      for (i, key) in sentence.enumerated() {
        await pause(at[i] - (ProcessInfo.processInfo.systemUptime - start) * 1000)
        press(key)
      }
      await pause(600)
      let keys = (await run("window.probePush(false); return window.probeKeys") as? [Double]) ?? []
      let typed = (await run("return document.querySelector('[data-ouro=composer] textarea').value") as? String) ?? ""
      guard typed == String(sentence), keys.count == sentence.count else { print("{\"error\": \"typed \(typed.count) of \(sentence.count) keys, timed \(keys.count)\"}"); exit(1) }
      if quick { fast += keys } else { slow += keys }
    }
  }
  report["bench"] = bench
  report["typing"] = ["fast": fast, "slow": slow]
  print(String(data: try! JSONSerialization.data(withJSONObject: report), encoding: .utf8)!)
  exit(0)
}
app.run()
