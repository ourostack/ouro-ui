# Ouro HX & AX for Android

Ouro's look and manners in Jetpack Compose, for Android apps, plus the agent door Android gives apps: AppFunctions. It lives in [ourostack/ouro-ui-android](https://github.com/ourostack/ouro-ui-android).

Nobody here owns an Android phone or tablet. The kit is checked on emulators in GitHub's CI, not on a real device, so if you have one and want to help, you're very welcome.[^devices]

## What ships today

Release [v0.12.1](https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.1) meets core v1.8.0: its tokens, component specs and action generator are core's, byte for byte, and its CI checks the hashes in `core-provenance.json`.[^core]

The kit has twenty-six of core's components as composables, where web has every component in the catalog ([the parity matrix](parity.md) counts them): `OuroButton`, `OuroBadge`, `OuroCard`, `OuroItem`, `OuroCheckbox`, `OuroSwitch`, `OuroSelect`, `OuroField`, `OuroTextField`, `OuroSeparator`, `OuroDescriptionList`, `OuroTabs`, `OuroTabBar`, `OuroSidebar`, `OuroItemGroup`, `OuroSwipeActions`, `OuroReorderable`, `OuroConversationList`, `OuroTable`, `OuroMessage`, `OuroReactionBar`, `OuroMessageList`, `OuroComposer`, `OuroDialog`, `OuroSheet` and `OuroConfirmDialog`, inside `OuroTheme`, which carries core's six themes in light and dark, increased contrast and reduced motion.[^readme]

`OuroComposedSurface` draws Ouro's [composed tree](../guides/composed-ui.md), the card an agent composes, from an MCP tool result's `structuredContent.ouro` (`OuroComposed.read`). Fields write the data model, a consequential button asks the person first, and a person-only one hands them to the app. To change a card it already shows, the agent sends only what changed, an update in `structuredContent.ouro.update`, and `OuroComposedState` applies it, keeping what the person entered except where the agent set the value. It reads A2UI messages too, with `card.receiveA2UI(messages)`, since v0.4.0: send either.[^readme]

`ouro-actions` is the runtime the actions run on, so a person's press and an agent's AppFunction call take one path. In the sample, place order is person-only: it has a person door and a typed refusal for agents, in place of an AppFunction. From v0.5.0 on, a consequential action an agent calls asks the person with a built-in confirmation: it opens at once when the app is on screen, and through a notification when the app is in the background.[^confirm] When nothing can ask, or the person never answers, the call is refused, and an app can replace the confirmation with its own `confirm`.[^confirm]

Declare actions once in TypeScript with core's `defineAction`, then run core's `ouro-actions-android.mts` to write `OuroActions.kt` (one AppFunction per action an agent may call) and `doors.json` (which door carries each action, and why not). The sample, Ouro Shop, does exactly that.[^readme]

The Maven files are attached to the release and served from GitHub Pages, which needs no sign-in:[^readme]

```kotlin
repositories { maven { url = uri("https://ourostack.github.io/ouro-ui-android/maven") } }
dependencies { implementation("bot.ouro.ui:ouro-hx:0.3.0") }
```

AppFunctions need compileSdk 37 and AGP 9.1 or later, and Google still calls them an experimental preview.[^appfunctions]

## What is still missing

- **A real device.** Only emulators so far, and the X-ray runs on Google's API 37 test image, because the full Google APIs image crashes its compositor under software rendering.[^ci]
- **Components.** Web has every component in the catalog, which [the parity matrix](parity.md) counts, and this kit has twenty-six.[^decision] On a Sheet whose body scrolls, a drag inside the body scrolls instead of dismissing; the handle and the padding still dismiss.
- **Table's linked rows.** A linked row is one button instead of a link. CI proves what TalkBack itself speaks for a column header, the sorted column and a row, once focus is on each node, on an emulator with TalkBack built from source.[^talkback-proof] A press on the row staying one press is read from the agent tree, not from speech, and TalkBack's own swipe navigation is unproven: injected touches and swipes did not move its focus there. Tracked in [ourostack/ouro-ui-android#90](https://github.com/ourostack/ouro-ui-android/issues/90).
- **Maven Central.** It needs a Sonatype account, so the kit uses GitHub Pages for now.[^releasing]

## What to use meanwhile

Until the kit has the screens you need, pick one of these, and say which in your plan:

- **Ouro HX on web, in a WebView.** The web kit has the whole catalog: navigation, sheets, dialogs, lists, forms and a composer. The same React app runs on the web and in the shell, with the web kit's own checks. The cost is that it is a web app in a shell, not Jetpack Compose controls. Ouro does not document a shell yet, so you own that wrapper.
- **The native kit plus plain Jetpack Compose.** Use the kit's components where it has them, and draw the rest in Jetpack Compose from core's tokens, which the kit vendors. The kit's checks cover only its own components, so check the rest by hand and keep what you add small.

Don't mix the two in one screen.

## How it is checked

The `build` job runs core's component claims in Robolectric, reading the semantics tree and sampling pixels, and checks the snapshots. The `emulator` job runs the sample's X-ray on an Android emulator: the AppFunctions Android indexed against the declarations, the buttons on screen, an agent's add through the handler a person presses, an agent's share asking the person (Allow, Don't, Back and the notification), and the person-only refusal. The `generated` job checks the vendored core files' hashes and that the sample's generated Kotlin matches its declarations.[^ci]

## Contribute next

- Send changes to [ourostack/ouro-ui-android](https://github.com/ourostack/ouro-ui-android) as small pull requests, from a fork if you like. Collaborators join as outside collaborators.[^devices]
- To add a component, vendor its spec from core, write the composable, add it to the sample's gallery and to `ClaimsTest`. CI fails until every claim its spec names passes.[^readme]

A new platform starts from [the guide for platform builders](contributing.md) instead.

[^core]: https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.1; https://github.com/ourostack/ouro-ui-android/blob/284491d755f35bd1b07643df619b86fffd341094/core-provenance.json; https://github.com/ourostack/ouro-ui-android/blob/284491d755f35bd1b07643df619b86fffd341094/.github/workflows/ci.yml#L37-L48 verify:urlOk(https://github.com/ourostack/ouro-ui-android/releases/tag/v0.12.1) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/284491d755f35bd1b07643df619b86fffd341094/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/284491d755f35bd1b07643df619b86fffd341094/.github/workflows/ci.yml#L37-L48) verify:equals(scripts/parity-data/versions.json#android.coreTag)=v1.8.0
[^devices]: https://github.com/ourostack/ouro-ui-android/issues/3 verify:urlOk(https://github.com/ourostack/ouro-ui-android/issues/3)
[^readme]: https://github.com/ourostack/ouro-ui-android/blob/ed5ad0f74837fea89d87502e9a2ffc4e7bd17033/README.md; https://github.com/ourostack/ouro-ui-android/blob/ed5ad0f74837fea89d87502e9a2ffc4e7bd17033/ouro-hx/src/test/kotlin/bot/ouro/ui/hx/ClaimsTest.kt verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/ed5ad0f74837fea89d87502e9a2ffc4e7bd17033/README.md) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/ed5ad0f74837fea89d87502e9a2ffc4e7bd17033/ouro-hx/src/test/kotlin/bot/ouro/ui/hx/ClaimsTest.kt)
[^ci]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/samples/shop/src/androidTest/kotlin/bot/ouro/shop/ConfirmTest.kt verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/samples/shop/src/androidTest/kotlin/bot/ouro/shop/ConfirmTest.kt)
[^releasing]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/RELEASING.md verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/RELEASING.md)
[^decision]: https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/e90f749fdb14e738aad01141d18c03f6cc18d99c/docs/decisions/2026-11-14-android-kit.md)
[^confirm]: https://github.com/ourostack/ouro-ui-android/releases/tag/v0.5.0; https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L85-L104 verify:urlOk(https://github.com/ourostack/ouro-ui-android/releases/tag/v0.5.0) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/e38acea984aa202707f6a0c8ea9c6fd889aabf1f/README.md#L85-L104)
[^appfunctions]: https://developer.android.com/ai/appfunctions verify:urlOk(https://developer.android.com/ai/appfunctions)

[^talkback-proof]: https://github.com/ourostack/ouro-ui-android/pull/94 verify:urlOk(https://github.com/ourostack/ouro-ui-android/pull/94)
