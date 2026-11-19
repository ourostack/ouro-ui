# Ouro HX & AX for Android

Ouro's look and manners in Jetpack Compose, for Android apps, plus the agent door Android gives apps: AppFunctions. It lives in [ourostack/ouro-ui-android](https://github.com/ourostack/ouro-ui-android).

Nobody here owns an Android phone or tablet. The kit is checked on emulators in GitHub's CI, not on a real device, so if you have one and want to help, you're very welcome.[^devices]

## What ships today

Release [v0.3.0](https://github.com/ourostack/ouro-ui-android/releases/tag/v0.3.0) meets core v0.19.0: its tokens, component specs and action generator are core's, byte for byte, and its CI checks the hashes in `core-provenance.json`.[^core]

The kit has eight of core's components as composables, where web has [127 components](registry.json "verify:count(registry:ui)=127"): `OuroButton`, `OuroBadge`, `OuroCard`, `OuroItem`, `OuroCheckbox`, `OuroTextField`, `OuroSeparator` and `OuroDescriptionList`, inside `OuroTheme`, which carries core's six themes in light and dark, increased contrast and reduced motion.[^readme]

`OuroComposedSurface` draws Ouro's [composed tree](../guides/composed-ui.md), the card an agent composes, from an MCP tool result's `structuredContent.ouro` (`OuroComposed.read`). Fields write the data model, a consequential button asks the person first, and a person-only one hands them to the app. To change a card it already shows, the agent sends only what changed, an update in `structuredContent.ouro.update`, and `OuroComposedState` applies it, keeping what the person entered except where the agent set the value. It reads no A2UI messages: send the tree.[^readme]

`ouro-actions` is the runtime the actions run on, so a person's press and an agent's AppFunction call take one path. In the sample, place order is person-only: it has a person door and a typed refusal for agents, in place of an AppFunction. A consequential action is refused until the app's `confirm` asks the person, because Android has no system prompt for it.[^decision]

Declare actions once in TypeScript with core's `defineAction`, then run core's `ouro-actions-android.mts` to write `OuroActions.kt` (one AppFunction per action an agent may call) and `doors.json` (which door carries each action, and why not). The sample, Ouro Shop, does exactly that.[^readme]

The Maven files are attached to the release and served from GitHub Pages, which needs no sign-in:[^readme]

```kotlin
repositories { maven { url = uri("https://ourostack.github.io/ouro-ui-android/maven") } }
dependencies { implementation("bot.ouro.ui:ouro-hx:0.3.0") }
```

AppFunctions need compileSdk 37 and AGP 9.1 or later, and Google still calls them an experimental preview.[^appfunctions]

## What is still missing

- **A real device.** Only emulators so far, and the X-ray runs on Google's API 37 test image, because the full Google APIs image crashes its compositor under software rendering.[^ci]
- **Components.** Web has [127 components](registry.json "verify:count(registry:ui)=127"), and this kit has eight.[^decision]
- **Asking the person.** A consequential action is refused for now; a PendingIntent confirmation, as Google's sample agent expects, is next.[^decision]
- **Maven Central.** It needs a Sonatype account, so the kit uses GitHub Pages for now.[^releasing]

## How it is checked

The `build` job runs core's component claims in Robolectric, reading the semantics tree and sampling pixels, and checks the snapshots. The `emulator` job runs the sample's X-ray on an Android emulator: the AppFunctions Android indexed against the declarations, the buttons on screen, an agent's add through the handler a person presses, and the refusals. The `generated` job checks the vendored core files' hashes and that the sample's generated Kotlin matches its declarations.[^ci]

## Contribute next

- Send changes to [ourostack/ouro-ui-android](https://github.com/ourostack/ouro-ui-android) as small pull requests, from a fork if you like. Collaborators join as outside collaborators.[^devices]
- To add a component, vendor its spec from core, write the composable, add it to the sample's gallery and to `ClaimsTest`. CI fails until every claim its spec names passes.[^readme]

A new platform starts from [the guide for platform builders](contributing.md) instead.

[^core]: https://github.com/ourostack/ouro-ui-android/releases/tag/v0.3.0; https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/core-provenance.json; https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml#L37-L48 verify:urlOk(https://github.com/ourostack/ouro-ui-android/releases/tag/v0.3.0) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml#L37-L48) verify:equals(scripts/parity-data/versions.json#android.coreTag)=v0.19.0
[^devices]: https://github.com/ourostack/ouro-ui-android/issues/3 verify:urlOk(https://github.com/ourostack/ouro-ui-android/issues/3)
[^readme]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/README.md)
[^ci]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml)
[^releasing]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/RELEASING.md verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/RELEASING.md)
[^decision]: https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md)
[^appfunctions]: https://developer.android.com/ai/appfunctions verify:urlOk(https://developer.android.com/ai/appfunctions)
