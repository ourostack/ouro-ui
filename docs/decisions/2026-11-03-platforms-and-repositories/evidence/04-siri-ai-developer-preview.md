# Siri AI Developer Preview (2026-11-03) and what it changes

Ari, 2026-11-03: "hot off the presses!!! HUGE for ouro ui for apple :) build forwards!" — [Apple Developer News, "Siri AI is now open to all developers"](https://developer.apple.com/news/?id=gdk2umrf).

These notes summarize Apple's DocC pages, read today; follow the links for the full text.

## What shipped

**Where it runs**
- A developer preview in the 27.3 betas of iOS, iPadOS, macOS and visionOS, on Apple Intelligence devices.
- Customers get it "in a few months". App Store submission opens in the spring.
- Testing happens on a development-signed device or with internal TestFlight testers only. External testers and App Store builds don't get it ([preview doc](https://developer.apple.com/documentation/appintents/siri-ai-developer-preview)).
- It needs no new entitlement and no separate developer program.

**Tool intents**
- `@AppIntent(.tool)` makes a custom intent a tool Siri can call, through the `ToolIntent` protocol.
- `@AppIntent(.tool, schema:)` lifts a schema that today reaches only Shortcuts (books, journal and so on) into Siri.
- Don't mark an intent that already uses a Siri schema, or one with no custom `perform()`.
- Siri tells intents apart, and fills their parameters, from the `title` and `description` on each intent and each parameter ([guide](https://developer.apple.com/documentation/appintents/bringing-custom-actions-and-content-to-siri)).
- Don't make an intent a tool when a person should start it explicitly: [ToolIntent](https://developer.apple.com/documentation/appintents/toolintent) lists "intents with side effects that a person needs to start explicitly, such as placing an order and paying for it" among poor tools. A candidate Ouro AX for Apple claim. (Added 2026-11-13.)

**Entities**
- Give every `@Property`, `@DeferredProperty` and `@ComputedProperty` a description.
- Use `IntentAuthenticationPolicy` per entity or per property for sensitive data, and `visibility: .internal` to hide a property from Siri.
- `@AppEntity(.generable)` (`GenerableEntity` + `TransientAppEntity`) lets Siri fill an entity straight from a request.
- Siri finds entities through Spotlight, or through `EnumerableEntityQuery` and `DynamicOptionsProvider`.
- The other inputs are onscreen context (the same APIs as before, now for custom entities too), intent donations as behavioural cues, and `Transferable` for passing data across apps.

**When Siri reaches the app**
- Without naming the app: while it is in the foreground, while a Live Activity runs, or in a continued Siri conversation that already mentions the app.
- In the background: when the request names the app.

**App skills** ([guide](https://developer.apple.com/documentation/appintents/orchestrating-complex-actions-with-app-skills))
- One `Skills.skillsbundle` per target, holding `Skills/<lowercase-hyphen-name>/SKILL.md` and nothing else.
- The format is a subset of the [Agent Skills](https://agentskills.io) format: only `name` and `description` in the frontmatter, and a body of at most 10,000 characters.
- Write the body to refer to tools informally ("the get weather tool"), and don't repeat what the code already says.
- Names must be unique across the app, its extensions and its frameworks; on a clash the system picks one, and which one is undefined.
- Skills are guidance, not a guaranteed order of calls.
- They are tested on a device, not in the Simulator.

**Verifying it**
- The order is: AppIntentsTesting → Xcode's **Siri Integration Advisor** → **[SiriEvaluations](https://developer.apple.com/documentation/sirievaluations)** → Shortcuts, Spotlight and Siri by hand.
- SiriEvaluations is built on the Evaluations and Swift Testing frameworks.
- A `SiriScenario` is a set of `UserTurn`s run in one Siri session.
- Each turn can expect `Calls` (the intents and parameters Siri used), `Finds` (entities), `Loads` (app skills), `OnScreen` and `SiriResponse` (text).
- Each check is deterministic. Siri varies between runs, so run a broad scenario set several times.
- `SiriService` runs the scenarios, `SiriExpectationEvaluator` grades them, and `SiriTranscript` records each run.

## What it changes for us

1. **Ouro AX can now evaluate Siri.**
   - The proposal assumed Siri could only be checked by hand. With SiriEvaluations, Siri is the agent under test: the scenario sets are AX's evaluation task sets, and pass rates over repeated runs are its metric.
   - **The SwiftMCP bridge is no longer needed for evaluation.** It stays useful as the Mac MCP door (Ouro MD) and for cross-agent comparisons, if wanted.
2. **The door gets wider.**
   - Custom intents and entities reach Siri without a schema domain, so Spoonjoy (cooking, no domain) reaches Siri for the first time.
   - Gatefold's book intents move from Shortcuts-only to Siri through `@AppIntent(.tool, schema: .books…)` (inference, to check against the books schema).
3. **New AX claims for `app-intent`, `app-entity` and `app-skill`, each checkable:**
   - Every tool intent and parameter has a title and a description.
   - Every entity property has a description.
   - Sensitive properties carry an authentication policy, and app-only properties are `internal`.
   - Entities are indexed in Spotlight or enumerable.
   - Results that leave the app are `Transferable`.
   - No `.tool` on an intent that already has a Siri schema.
   - Skill bundles are well formed: one per target, lowercase-hyphen names unique across bundles, only `SKILL.md`, frontmatter limited to name and description, a body of at most 10,000 characters, no intent type names in the body.
   - All of these start as `should`. Moving one to `must` needs a SiriEvaluations run that shows the failure, under the admission rule.
4. **An HX overlap:** card snippets (custom SwiftUI views Siri shows) are an Ouro HX for Apple surface. OuroHX components should look right inside a snippet. Corrected 2026-11-13:
   - Siri AI "might not display `IntentDialog` or `ShowsSnippetView`" when it runs an app intent ([snippets guide](https://developer.apple.com/documentation/appintents/displaying-static-and-interactive-snippets)), so OuroHX must not depend on an intent's snippet appearing in Siri AI.
   - 27.3 adds entity cards: [`CardSnippet`](https://developer.apple.com/documentation/appintents/cardsnippet) on a [`SnippetRepresentableEntity`](https://developer.apple.com/documentation/appintents/snippetrepresentableentity), both beta. The system pre-renders them and shows them when the app isn't running, so they are the Siri AI path for an app's own UI (inference).
5. **Constraints that shape the build:**
   - Build against the Xcode 27.3 beta SDK, keeping Xcode 27.2 for shipping lanes.
   - Siri runs need a 27.3 beta OS on an Apple Intelligence device. GitHub's macOS runners won't have that, so SiriEvaluations runs as a local lane on a device, like the screen-reader lane, and CI runs AppIntentsTesting plus a static check that the SiriEvaluations code compiles.
   - The preview reaches internal TestFlight testers only, so adopting apps keep their tool intents ready to ship with no change in behaviour on 27.2.
6. **Our own `why-no-skill` guide** (web: `docs/guides/why-no-skill.md`) argues against shipping a skill for coding agents. App skills are a different thing: product guidance for Siri inside an app. The W4 record must say so, so the two never contradict.

## Machine state, 2026-11-03

- This Mac: macOS 27.0 (26A428) with Xcode 27.2 (27B52).
- `AppIntentsTesting.framework` is in Xcode's developer frameworks; `SiriEvaluations` is in neither 27.2 SDK.
- A Siri run on this Mac would need macOS 27.3 beta. That means a reboot of a machine running other agents, so it is Ari's call (see the planning note).

## Labs

Apple Intelligence Group Labs run [2026-11-04, 9–10 a.m. PT](https://developer.apple.com/events/view/4C56C6YMCW/dashboard) and [2026-11-05, 6–7 p.m. PT](https://developer.apple.com/events/view/GZQ6Q48GVZ/dashboard). Only Ari can sign up, since it is his account.
