# Ouro HX & AX for Apple

The same colours, motion and manners as this site, in Swift, for iPhone, iPad and Mac, plus the bits that make an app a pleasant host when Siri comes knocking. It lives in [ourostack/ouro-ui-apple](https://github.com/ourostack/ouro-ui-apple).

## What ships today

Release [v0.3.4](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4) meets core v0.3.0: its tokens are core's, byte for byte, and its CI checks the hashes in `core-provenance.json`.[^core] Add it with Swift Package Manager:

```swift
.package(url: "https://github.com/ourostack/ouro-ui-apple.git", from: "0.3.4")
```

It needs iOS 18 or macOS 15, and Swift 6.1.[^floor] In the box:[^products]

- `OuroHX`, for your app: buttons, empty states, banners, sheets and toasts; `.ouroTheme(.pearl)`, colours and radii in the environment, contrast-aware colours, core's spring and curves (polite under Reduce Motion), one named table of haptics, and fold posture for foldable screens.
- `OuroHXTesting`, for your tests: snapshots in light, dark and increased contrast, `ouroAccessibilityAudit`, and a hinge you can fold from a UI test.
- `OuroAX`, for your app: outcomes and problems shaped field for field like web's `ax-outcome` and `ax-problem`, shared exit codes, and entity queries with fuzzy matching.
- `OuroAXTesting`, for your tests: Siri evaluation wordings and pass rates, and the App Intents X-ray's checks.
- `ouro-ax-xray`, for you and CI: X-rays a built app's App Intents against Ouro AX for Apple's claims.
- `OuroReins`, for your app's UI-free core and its agents: every screen as state and actions, driven headless or over a debug-only socket.
- `ouro-ax-skills` and `OuroAXSkillsLintPlugin`: a linter for an app's `Skills.skillsbundle`, from the command line or at build time, with errors pinned to the line.
- `ouro-devicehub`, for a Mac CI job: presses the buttons in Xcode's Device Hub, so a test can fold the simulator.

```swift
import OuroHX

ContentView().ouroTheme(.pearl)
```

## What is coming

Apple opened Siri AI to developers as a preview in the 27.3 betas, and customers get it later.[^siri] On Apple, Siri is the agent and App Intents are the door, so this is where Ouro AX for Apple grows up:

- Tool intents. `OuroAXToolIntent` is written and waiting: it compiles only with the Xcode 27.3 SDK, so apps built with Xcode 27.2 build exactly as they do today.[^fenced]
- App skills. The skills linter ships now, so an app's skills arrive at Siri tidy.[^products]
- SiriEvaluations. Scenario sets built from `OuroAXTesting`'s wordings, with a pass rate for each set of wordings.[^evals]
- The App Intents X-ray. `ouro-ax-xray`, shipping now, checks an app's intents, entities, onscreen annotations and app skills against core's claims for Apple, and says which lane proved each one: the bundle's metadata, AppIntentsTesting, the linter, SiriEvaluations, or a person holding a device.[^xray]

These switch on when you build with the Siri AI SDK. Until then they are written and fenced, and compile to nothing; CI compiles them once its image has Xcode 27.3.[^fenced]

## Read more

- [The README](https://github.com/ourostack/ouro-ui-apple#readme), with an example screen and the theme gallery.
- [Ouro AX for Apple's standard](https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md), in core.
- [The Platforms page](README.md) and its version table.

[^core]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4; https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/.github/workflows/ci.yml#L53-L70 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/.github/workflows/ci.yml#L53-L70)
[^floor]: https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/Package.swift#L1-L9 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/Package.swift#L1-L9)
[^products]: https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#whats-in-the-box; https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/Package.swift#L18-L35 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#whats-in-the-box) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/Package.swift#L18-L35)
[^siri]: https://developer.apple.com/news/?id=gdk2umrf; https://developer.apple.com/documentation/appintents/siri-ai-developer-preview verify:urlOk(https://developer.apple.com/news/?id=gdk2umrf) verify:urlOk(https://developer.apple.com/documentation/appintents/siri-ai-developer-preview)
[^fenced]: https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#siri-ai verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#siri-ai)
[^xray]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md#how-each-claim-is-checked; https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#x-ray-your-apps-app-intents verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md#how-each-claim-is-checked) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#x-ray-your-apps-app-intents)
[^evals]: https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#whats-in-the-box verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/README.md#whats-in-the-box)
