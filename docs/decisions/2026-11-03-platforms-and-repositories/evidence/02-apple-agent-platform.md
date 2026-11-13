# Apple's agent platform in the 27 releases, and prior art

Researched 2026-11-03 from primary sources where they could be found. The research ran as a read-only child agent; this is its report, lightly edited.

Apple's agent path in the 27 releases is App Intents and nothing else: entities, schemas, view annotations and Spotlight indexing, plus a test framework.
- There is no MCP for App Intents or Siri, no third-party agent API and no chatbot plug-in for Siri. (Corrected 2026-11-13: this said "no MCP", but Xcode 27's plug-ins do use MCP, [Apple Newsroom, June 2026](https://www.apple.com/newsroom/2026/06/apple-aids-app-development-with-new-intelligence-frameworks-and-advanced-tools/).)
- Apple has no schema domain for cooking.
- The books, reader and word-processor domains reach only the Shortcuts app, not Siri.

## 1. What Apple shipped (WWDC26, iOS 27 / macOS 27)

**Siri for users**
- "Siri AI" brings personal context, onscreen awareness and actions across apps. Its personal context reaches third-party apps only "when developers integrate with Spotlight" ([newsroom](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)).
- It is still labelled beta and starts in English ([iOS 27 page](https://www.apple.com/os/ios/)).
- It is not available on iOS, iPadOS or watchOS in the EU, though it is on macOS ([DMA post](https://www.apple.com/newsroom/2026/06/due-to-dma-siri-ai-delayed-in-eu-for-ios-27-and-ipados-27/)).
- Version 27.2 adds recall of past conversations, an "Excluded Apps" setting, and French, Japanese, Korean, Portuguese and Spanish ([updates page](https://support.apple.com/en-us/149076)). That page has no 27.1 section.

**App Intents.** Session 240 says "all of these APIs are available today" ([240](https://developer.apple.com/videos/play/wwdc2026/240/)).
- **Schemas** attach through `@AppIntent(schema:)`, `@AppEntity(schema:)` and `@AppEnum(schema:)` ([domains](https://developer.apple.com/tutorials/data/documentation/appintents/app-schema-domains.json)).
  - Domains Siri can use: audio, calendar, camera, clock, mail, maps, messages, notes, phone, photos, reminders, and system and in-app search.
  - Domains limited to Shortcuts: books, browser, files, journaling, presentation, reader, spreadsheet, whiteboard and word processor.
  - There is no recipe or cooking domain.
  - The build fails, with a Fix-It, if you adopt a schema but leave out a related one it needs.
- **Onscreen entities:** use `NSUserActivity` when one item is on screen, and the `.appEntityIdentifier(EntityIdentifier(...))` view annotation when several are ([240](https://developer.apple.com/videos/play/wwdc2026/240/); [iOS guide](https://developer.apple.com/wwdc26/guides/ios/)).
- **New framework features** ([345](https://developer.apple.com/videos/play/wwdc2026/345)): `ValueRepresentation`, `RelevantEntities`, `EntityCollection`, `SyncableEntity`, `@UnionValue`, native `Duration` and `PersonNameComponents` parameters, `LongRunningIntent` (runs past 30 s and shows progress as a Live Activity), `CancellableIntent` and `allowedExecutionTargets`.
- **Snippets:** `ShowsSnippetView` returns a custom SwiftUI view ([343](https://developer.apple.com/videos/play/wwdc2026/343)).
- **Visual Intelligence** is on iPad and Mac too, with `@UnionValue` results, the `.visualIntelligence.semanticContentSearch` schema, and `IntentValueQuery` with a `SemanticContentDescriptor` input ([297](https://developer.apple.com/videos/play/wwdc2026/297)).
- **Spotlight and language models:** `SpotlightSearchTool` gives a Foundation Models session search over your own Core Spotlight index ([246](https://developer.apple.com/videos/play/wwdc2026/246)).

**Foundation Models**
- A `LanguageModel` / `LanguageModelExecutor` protocol puts Apple's on-device model, Private Cloud Compute, Core AI, MLX or a cloud model behind one interface. Anthropic and Google will ship Swift packages "soon" ([339](https://developer.apple.com/videos/play/wwdc2026/339)).
- `DynamicProfile` and `Profile`, `ToolCallingMode` (`.required`) and a `Skills` type. Apple frames each profile as an agent ([242](https://developer.apple.com/videos/play/wwdc2026/242)).
- Image input, Vision tools the model can call, free Private Cloud Compute for Small Business Program apps under 2 million first-time downloads, an Evaluations framework, and an `fm` CLI with a Python SDK ([iOS guide](https://developer.apple.com/wwdc26/guides/ios/)).

**Not shipped or not announced**
- **MCP:** no Apple documentation mentions it for App Intents or Siri, and a forum thread asking has no Apple answer ([forum](https://developer.apple.com/forums/thread/809361)). Press saw groundwork in the 26.1 betas ([9to5Mac](https://9to5mac.com/2025/09/22/macos-tahoe-26-1-beta-1-mcp-integration/)). Corrected 2026-11-13: Apple's one shipped use of MCP is Xcode 27's plug-ins, for developer tools, not for apps ([Apple Newsroom, June 2026](https://www.apple.com/newsroom/2026/06/apple-aids-app-development-with-new-intelligence-frameworks-and-advanced-tools/)).
- **Third-party chatbots in Siri ("Extensions"):** reported only by Bloomberg ([MacRumors](https://www.macrumors.com/2026/06/02/ios-27-siri-features/)) and press ([Gigazine](https://gigazine.net/gsc_news/en/20260615-apple-siri-extensions/)), and not announced.
- **Access beyond App Intents:** a forum thread asking has no answer ([thread](https://developer.apple.com/forums/thread/832390)).

## 2. What an app builds to be usable by Siri and system agents

1. `AppEntity` with `EntityQuery`, plus `EntityStringQuery` for data that can't be indexed ahead of time, and a strong `DisplayRepresentation` ([240](https://developer.apple.com/videos/play/wwdc2026/240/)).
2. `IndexedEntity` and `CSSearchableIndex.indexAppEntities`, with `@Property(indexingKey:)` and `IndexedEntityQuery` for reindexing ([343](https://developer.apple.com/videos/play/wwdc2026/343)). This is the only door to personal context.
3. Schemas where a domain fits:
   - Ouro MD: `.notes`, which reaches Siri, or word processor / reader, which reach only Shortcuts.
   - Gatefold: books, which reaches only Shortcuts.
   - Spoonjoy: no domain. Its timers might map to `.clock` (inference).
4. Onscreen awareness through `NSUserActivity` and `.appEntityIdentifier`.
5. `Transferable` with `ValueRepresentation`.
6. `AppShortcutsProvider` for phrases.
7. `AppIntentsPackage` with `includedPackages`, so intents in a Swift package reach the app (iOS 17+ / macOS 14+, [doc](https://developer.apple.com/tutorials/data/documentation/appintents/appintentspackage.json)).
8. **`AppIntentsTesting`** ([295](https://developer.apple.com/videos/play/wwdc2026/295)).
   - It works by bundle ID with no app imports, through `IntentDefinitions`, `makeIntent().run()`, `spotlightQuery(_:)` and `viewAnnotations()`.
   - It does not drive Siri itself and does not test schemas.
   - Apple's recommended test order: AppIntentsTesting, then Shortcuts, then Spotlight, then Siri by hand.

## 3. Other platforms

- **Android:** AppFunctions runs on Android 16+. Google calls it "the mobile equivalent of tools within MCP" and now brands it "Android MCP". Gemini can use it only through an Early Access Program ([docs](https://developer.android.com/ai/appfunctions)). (Corrected 2026-11-13: this said "experimental"; the Jetpack library reached 1.0.0-beta01 on 2026-10-21 and 1.0.0-rc01 on 2026-11-04, [release notes](https://developer.android.com/jetpack/androidx/releases/appfunctions).)
- **Windows:** the On-device Agent Registry registers app MCP servers, which run contained (prerelease, [Learn](https://learn.microsoft.com/en-us/windows/ai/mcp/overview)). App Actions are separate ([Learn](https://learn.microsoft.com/windows/ai/app-actions)).
- On Apple, the realistic pattern is App Intents locally plus a remote MCP server, as Spoonjoy does (inference).

## 4. Prior art for "HX native"

- **Token format:** the Design Tokens Community Group format reached its first stable version, 2025.10, on 2025-10-28 ([W3C](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)).
- **Style Dictionary** supports that format from v4, but says 2025.10 "does not have full support yet" ([docs](https://styledictionary.com/info/dtcg/)).
- **GitHub Primer** builds its tokens with Style Dictionary ([repo](https://github.com/primer/primitives)). Microsoft Fluent ships `fluentui-apple` through SwiftPM ([repo](https://github.com/microsoft/fluentui-apple)).
- **Distribution:** SwiftPM is the standard channel.
- **Agent-friendly design systems:** shadcn's MCP works over any registry ([docs](https://ui.shadcn.com/docs/mcp)), and Figma MCP has Code Connect ([help](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)). No SwiftUI equivalent of a shadcn-style registry was found. Google's AppFunctions agent skill ([android/skills](https://github.com/android/skills/tree/main/device-ai/appfunctions)) is the nearest precedent for an agent kit.

## How solid this is

- **Read on primary pages:** the sessions and pages linked above.
- **Press only, unverified:** Siri "Extensions", "SiriKit deprecated" (only press says so, [TechTimes](https://www.techtimes.com/articles/318005/20260608/wwdc-2026-app-intents-replaces-sirikit-gemini-siri-migration-clock-starts.htm)), MCP groundwork in the betas, Polaris's move to web components, and the Style Dictionary Swift format names.
- **Thin:**
  - iOS 27.1's contents.
  - Interactive snippets in the 27 releases.
  - Whether `AppShortcutsProvider` changed.
  - The Airbnb and Primer iOS token pipelines.
