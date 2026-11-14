# Platforms

Ouro HX is how an app treats people, and Ouro AX is how it treats agents. Neither cares much what the app is written in, so they travel: one core of tokens and standards, and a platform kit wherever someone has packed a bag.

## Where they live

A platform gets its own repository and pins a release of [Ouro UI core](https://github.com/ourostack/ouro-ui-core), the part that holds on any platform. Today core holds Ouro HX's tokens, what Ouro HX's components promise as claims, Ouro AX for Apple's claims, and the one action model and its claims; Ouro HX's design language and web's Ouro AX standard move in later.[^core-today] A platform takes core's files from a release tag, never from a branch, and its CI checks that they arrived unchanged.[^pinning]

- [Ouro HX & AX for web](https://ui.ouroboros.bot/) lives in `ourostack/ouro-ui`: the components, the AX kit for command lines, HTTP and MCP, and this site.[^web-home]
- [Ouro HX & AX for Apple](apple.md) is a Swift package for iPhone, iPad and Mac, with Siri as the agent at the door.
- [Ouro HX & AX for Android](android.md) and [for Windows](windows.md) are spare rooms with the lights on, waiting for a builder.
- [Ouro HX & AX for your platform](your-platform.md) is the door we left open for whatever comes next.

## Which core they meet

| Ouro HX & AX | Release checked | The core it meets | How we know |
| --- | --- | --- | --- |
| For web | [v1.3.7](https://github.com/ourostack/ouro-ui/releases/tag/v1.3.7)[^web-release] | core v0.5.0, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |
| For Apple | [v0.4.1](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.4.1)[^apple-release] | core v0.4.0[^apple-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |
| For Android | none yet | none yet | [Build it](android.md) |
| For Windows | none yet | none yet | [Build it](windows.md) |

Core's newest release, v0.5.0, adds the one action model and Ouro AX's action claims to the tokens and the two claim sets (Ouro AX for Apple's and Ouro HX's component claims) that v0.3.0 had, each as data.[^core-v0.5.0] Web's row names the web release that core's parity check compares against, which can be older than web's [latest release](https://github.com/ourostack/ouro-ui/releases/latest).

## Parity between web and Apple

The [Apple section of the site](https://ui.ouroboros.bot/apple/#parity) has the parity tables. They come from core's component claims, which name the web test and the Apple test behind a promise, and from core's action claims. Where web or Apple lacks a test, the table says so.

## Building one

Start with the [guide for platform builders](contributing.md): the contract a platform meets, and how a pull request with a link to your work becomes `ouro-ui-<platform>`.

[^pinning]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release)
[^web-core]: https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/parity.json; https://github.com/ourostack/ouro-ui-core/releases/tag/v0.5.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/parity.json) verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.5.0)
[^apple-core]: https://github.com/ourostack/ouro-ui-apple/blob/b5ea94d96a429754743888b8ea162d4f1e1a9d65/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/b5ea94d96a429754743888b8ea162d4f1e1a9d65/.github/workflows/ci.yml#L74-L96 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/b5ea94d96a429754743888b8ea162d4f1e1a9d65/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/b5ea94d96a429754743888b8ea162d4f1e1a9d65/.github/workflows/ci.yml#L74-L96)
[^core-v0.5.0]: https://github.com/ourostack/ouro-ui-core/releases/tag/v0.5.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.5.0)
[^web-release]: https://github.com/ourostack/ouro-ui/releases/tag/v1.3.7 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.3.7)
[^apple-release]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.4.1 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.4.1)
[^core-today]: https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/3ff42918ed91d5b99930d31a04b751b5c9e8551d/README.md)
[^web-home]: https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md verify:urlOk(https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md)
