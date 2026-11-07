# Platforms

Ouro HX is how an app treats people, and Ouro AX is how it treats agents. Neither cares much what the app is written in, so they travel: one core of tokens and standards, and a platform kit wherever someone has packed a bag.

## Where they live

A platform gets its own repository and pins a release of [Ouro UI core](https://github.com/ourostack/ouro-ui-core), the part that holds on any platform. Today core holds Ouro HX's tokens, what Ouro HX's components promise as claims, and Ouro AX for Apple's claims; Ouro HX's design language and web's Ouro AX standard move in later.[^core-today] A platform takes core's files from a release tag, never from a branch, and its CI checks that they arrived unchanged.[^pinning]

- [Ouro HX & AX for web](https://ui.ouroboros.bot/) lives in `ourostack/ouro-ui`: the components, the AX kit for command lines, HTTP and MCP, and this site.[^web-home]
- [Ouro HX & AX for Apple](apple.md) is a Swift package for iPhone, iPad and Mac, with Siri as the agent at the door.
- [Ouro HX & AX for Android](android.md) and [for Windows](windows.md) are spare rooms with the lights on, waiting for a builder.
- [Ouro HX & AX for your platform](your-platform.md) is the door we left open for whatever comes next.

## Which core they meet

| Ouro HX & AX | Release checked | The core it meets | How we know |
| --- | --- | --- | --- |
| For web | [v1.3.3](https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3)[^web-release] | core v0.3.0, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |
| For Apple | [v0.3.4](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4)[^apple-release] | core v0.3.0[^apple-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |
| For Android | none yet | none yet | [Build it](android.md) |
| For Windows | none yet | none yet | [Build it](windows.md) |

Core's newest release, v0.3.0, has added Ouro AX for Apple's claim set and Ouro HX's component claims since v0.1.0, each as data.[^core-v0.3.0]

## Building one

Start with the [guide for platform builders](contributing.md): the contract a platform meets, and how a pull request with a link to your work becomes `ouro-ui-<platform>`.

[^pinning]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release)
[^web-core]: https://github.com/ourostack/ouro-ui-core/blob/b5e7a2798682fdaee1e083e97e1b174fddac9b49/parity.json; https://github.com/ourostack/ouro-ui-core/releases/tag/v0.3.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/b5e7a2798682fdaee1e083e97e1b174fddac9b49/parity.json) verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.3.0)
[^apple-core]: https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/.github/workflows/ci.yml#L53-L70 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/fa490ba6696ce6199c92f0979943cceb61d2e15a/.github/workflows/ci.yml#L53-L70)
[^core-v0.3.0]: https://github.com/ourostack/ouro-ui-core/releases/tag/v0.3.0; https://github.com/ourostack/ouro-ui-core/compare/v0.1.0...v0.3.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.3.0) verify:urlOk(https://github.com/ourostack/ouro-ui-core/compare/v0.1.0...v0.3.0)
[^web-release]: https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3)
[^apple-release]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.3.4)
[^core-today]: https://github.com/ourostack/ouro-ui-core/blob/b5e7a2798682fdaee1e083e97e1b174fddac9b49/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/b5e7a2798682fdaee1e083e97e1b174fddac9b49/README.md)
[^web-home]: https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md verify:urlOk(https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md)
