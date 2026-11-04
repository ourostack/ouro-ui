# Ouro HX & AX for Apple

The same colours, motion and manners as this site, in Swift, for iPhone, iPad and Mac, plus the bits that make an app a pleasant host when Siri comes knocking. It lives in [ourostack/ouro-ui-apple](https://github.com/ourostack/ouro-ui-apple).

## What ships today

Release [v0.1.0](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0) meets core v0.1.0: its tokens are core's, byte for byte, and its CI checks the hashes in `core-provenance.json`.[^core] Add it with Swift Package Manager:

```swift
.package(url: "https://github.com/ourostack/ouro-ui-apple.git", from: "0.1.0")
```

It needs iOS 18 or macOS 15, and Swift 6.[^floor] In the box:[^products]

- `OuroHX`, for your app: `.ouroTheme(.pearl)`, colours and radii in the environment, contrast-aware colours, core's spring and curves (polite under Reduce Motion), one named table of haptics, and fold posture for foldable screens.
- `OuroHXTesting`, for your tests: snapshots in light, dark and increased contrast, `ouroAccessibilityAudit`, and a hinge you can fold from a UI test.
- `OuroAX`, for your app: outcomes and problems shaped field for field like web's `ax-outcome` and `ax-problem`, shared exit codes, and entity queries with fuzzy matching.
- `OuroAXTesting`, for your tests: Siri evaluation wordings and pass rates.
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
- SiriEvaluations. Scenario sets built from `OuroAXTesting`'s wordings, run several times over, with a pass rate per scenario.[^fenced]
- The App Intents X-ray. `ouro-ax-xray`, in review now, checks an app's intents, entities, onscreen annotations and app skills against core's claims for Apple, and says which lane proved each one: the bundle's metadata, AppIntentsTesting, the linter, SiriEvaluations, or a person holding a device.[^xray]

These turn on once Siri AI ships. Until then, they are built, fenced and compile-checked.

## Read more

- [The README](https://github.com/ourostack/ouro-ui-apple#readme), with an example screen and the theme gallery.
- [Ouro AX for Apple's standard](https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md), in core.
- [The Platforms page](README.md) and its version table.

[^core]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0; https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/.github/workflows/ci.yml#L18-L30 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/.github/workflows/ci.yml#L18-L30)
[^floor]: https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/Package.swift#L9 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/Package.swift#L9)
[^products]: https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/README.md#whats-in-the-box; https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/Package.swift#L18-L26 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/README.md#whats-in-the-box) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/Package.swift#L18-L26)
[^siri]: https://developer.apple.com/news/?id=gdk2umrf; https://developer.apple.com/documentation/appintents/siri-ai-developer-preview verify:urlOk(https://developer.apple.com/news/?id=gdk2umrf) verify:urlOk(https://developer.apple.com/documentation/appintents/siri-ai-developer-preview)
[^fenced]: https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/README.md#siri-ai verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/21282fa5ffd2f45f9ea378089b20e28685978728/README.md#siri-ai)
[^xray]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md#how-each-claim-is-checked; https://github.com/ourostack/ouro-ui-apple/pull/2 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md#how-each-claim-is-checked) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/pull/2)
