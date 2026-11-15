# Platforms

Ouro HX is how an app treats people, and Ouro AX is how it treats agents. Neither cares much what the app is written in, so they travel: one core of tokens and standards, and a platform kit wherever someone has packed a bag.

## Where they live

A platform gets its own repository and pins a release of [Ouro UI core](https://github.com/ourostack/ouro-ui-core), the part that holds on any platform. Today core holds Ouro HX's tokens, what Ouro HX's components promise as claims, Ouro AX for Apple's claims, and the one action model and its claims; Ouro HX's design language and web's Ouro AX standard move in later.[^core-today] A platform takes core's files from a release tag, never from a branch, and its CI checks that they arrived unchanged.[^pinning]

- [Ouro HX & AX for web](https://ui.ouroboros.bot/) lives in `ourostack/ouro-ui`: the components, the AX kit for command lines, HTTP and MCP, and this site.[^web-home]
- [Ouro HX & AX for Apple](apple.md) is a Swift package for iPhone, iPad and Mac, with Siri as the agent at the door.
- [Ouro HX & AX for Windows](windows.md) is a WinUI kit at its latest release, v0.1.1, with App Actions and an MCP server as its agent doors.[^windows-release]
- [Ouro HX & AX for Android](android.md) is a Compose kit at its first release, v0.1.0, with AppFunctions as its agent door, checked on emulators because nobody here owns an Android device.[^android-release]
- [Ouro HX & AX for your platform](your-platform.md) is the door we left open for whatever comes next.

## Which core they meet

| Ouro HX & AX | Release checked | The core it meets | How we know |
| --- | --- | --- | --- |
| For web | [v1.3.24](https://github.com/ourostack/ouro-ui/releases/tag/v1.3.24)[^web-release] | core v0.12.1, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |
| For Apple | [v0.7.0](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.7.0)[^apple-release] | core v0.14.0, and v0.13.1 for its A2UI conformance cases[^apple-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |
| For Android | [v0.1.0](https://github.com/ourostack/ouro-ui-android/releases/tag/v0.1.0)[^android-release] | core v0.15.0[^android-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^android-core] |
| For Windows | [v0.1.1](https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.1.1)[^windows-release] | core v0.13.1[^windows-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^windows-core] |

Core's newest release is v0.12.1.[^core-latest] Web's row names the web release that core's parity check compares against, which can be older than web's [latest release](https://github.com/ourostack/ouro-ui/releases/latest).

## Parity between web and Apple

The [Apple section of the site](https://ui.ouroboros.bot/apple/#parity) has the parity tables. They come from core's component claims, which name the web test and the Apple test behind a promise, and from core's action claims. Where web or Apple lacks a test, the table says so.

The [parity matrix](parity.md) puts every component and every claim on web, Apple, Android and Windows side by side, with each gap as a cell.[^parity-matrix]

## Building one

Start with the [guide for platform builders](contributing.md): the contract a platform meets, and how a pull request with a link to your work becomes `ouro-ui-<platform>`.

[^pinning]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release)
[^core-today]: https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md)
[^web-home]: https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md verify:urlOk(https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md)
[^parity-matrix]: scripts/parity-matrix.test.mjs verify:testExists(scripts/parity-matrix.test.mjs::the parity page shows what its data renders)
[^web-release]: https://github.com/ourostack/ouro-ui/releases/tag/v1.3.24 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.3.24) verify:equals(scripts/parity-data/parity.json#webTag)=v1.3.24
[^web-core]: https://github.com/ourostack/ouro-ui-core/blob/0bdacddba45f47018639f89d9f6a67f7e6097e29/parity.json; https://github.com/ourostack/ouro-ui-core/releases/tag/v0.12.1 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/0bdacddba45f47018639f89d9f6a67f7e6097e29/parity.json) verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.12.1) verify:equals(scripts/parity-data/parity.json#webTag)=v1.3.24 verify:equals(scripts/parity-data/provenance.json#coreTag)=v0.12.1
[^apple-release]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.7.0 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.7.0) verify:equals(scripts/parity-data/versions.json#apple.tag)=v0.7.0
[^apple-core]: https://github.com/ourostack/ouro-ui-apple/blob/feee75fb9265b55e547d303f4cd5a214a6e792ea/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml#L74-L96 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/feee75fb9265b55e547d303f4cd5a214a6e792ea/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml#L74-L96) verify:equals(scripts/parity-data/versions.json#apple.coreTag)=v0.14.0
[^windows-release]: https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.1.1 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.1.1) verify:equals(scripts/parity-data/versions.json#windows.tag)=v0.1.1
[^windows-core]: https://github.com/ourostack/ouro-ui-windows/blob/55639374c1e097e649194ba2d8dbfef847f68534/core-provenance.json; https://github.com/ourostack/ouro-ui-windows/blob/55639374c1e097e649194ba2d8dbfef847f68534/.github/workflows/ci.yml#L37-L48 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/55639374c1e097e649194ba2d8dbfef847f68534/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/55639374c1e097e649194ba2d8dbfef847f68534/.github/workflows/ci.yml#L37-L48) verify:equals(scripts/parity-data/versions.json#windows.coreTag)=v0.13.1
[^android-release]: https://github.com/ourostack/ouro-ui-android/releases/tag/v0.1.0 verify:urlOk(https://github.com/ourostack/ouro-ui-android/releases/tag/v0.1.0) verify:equals(scripts/parity-data/versions.json#android.tag)=v0.1.0
[^android-core]: https://github.com/ourostack/ouro-ui-android/blob/653bd51323cda7724479f10e65ce6377be4d168a/core-provenance.json; https://github.com/ourostack/ouro-ui-android/blob/653bd51323cda7724479f10e65ce6377be4d168a/.github/workflows/ci.yml#L37-L48 verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/653bd51323cda7724479f10e65ce6377be4d168a/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/653bd51323cda7724479f10e65ce6377be4d168a/.github/workflows/ci.yml#L37-L48) verify:equals(scripts/parity-data/versions.json#android.coreTag)=v0.15.0
[^core-latest]: https://github.com/ourostack/ouro-ui-core/releases/tag/v0.12.1 verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.12.1) verify:equals(scripts/parity-data/provenance.json#coreTag)=v0.12.1
