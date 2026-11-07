# Platforms

Ouro HX is how an app treats people, and Ouro AX is how it treats agents. Neither cares much what the app is written in, so they travel: one core of tokens and standards, and a platform kit wherever someone has packed a bag.

## Where they live

A platform gets its own repository and pins a release of [Ouro UI core](https://github.com/ourostack/ouro-ui-core), the part that holds on any platform. Today core holds Ouro HX's tokens and Ouro AX for Apple's claims; Ouro HX's design language and web's Ouro AX standard move in later.[^core-today] A platform takes core's files from a release tag, never from a branch, and its CI checks that they arrived unchanged.[^pinning]

- [Ouro HX & AX for web](https://ui.ouroboros.bot/) lives in `ourostack/ouro-ui`: the components, the AX kit for command lines, HTTP and MCP, and this site.[^web-home]
- [Ouro HX & AX for Apple](apple.md) is a Swift package for iPhone, iPad and Mac, with Siri as the agent at the door.
- [Ouro HX & AX for Android](android.md) and [for Windows](windows.md) are spare rooms with the lights on, waiting for a builder.
- [Ouro HX & AX for your platform](your-platform.md) is the door we left open for whatever comes next.

## Which core they meet

| Ouro HX & AX | Release checked | The core it meets | How we know |
| --- | --- | --- | --- |
| For web | [v1.3.3](https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3)[^web-release] | core v0.1.0, for its tokens[^web-core] | Core's parity check compares its web stylesheets with web's, byte for byte.[^web-core] |
| For Apple | [v0.1.0](https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0)[^apple-release] | core v0.1.0[^apple-core] | The release's `core-provenance.json` names the tag and each file's SHA-256, and CI checks the hashes.[^apple-core] |
| For Android | none yet | none yet | [Build it](android.md) |
| For Windows | none yet | none yet | [Build it](windows.md) |

Core's newest release, v0.2.0, adds Ouro AX for Apple's claim set as data and leaves the tokens as they were, so a platform on v0.1.0 looks exactly as one on v0.2.0 would.[^core-v0.2.0] Apple's main branch already meets core v0.2.0, ready for its next release.[^apple-main]

## Building one

Start with the [guide for platform builders](contributing.md): the contract a platform meets, and how a pull request with a link to your work becomes `ouro-ui-<platform>`.

[^pinning]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release)
[^web-core]: https://github.com/ourostack/ouro-ui-core/blob/818bc86e3891bd2b6dab090a5336c58c2489c094/parity.json; https://github.com/ourostack/ouro-ui-core/releases/tag/v0.1.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/818bc86e3891bd2b6dab090a5336c58c2489c094/parity.json) verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.1.0)
[^apple-core]: https://github.com/ourostack/ouro-ui-apple/blob/b4096300e75dd2fd511d0ef323f9ad4837711321/core-provenance.json; https://github.com/ourostack/ouro-ui-apple/blob/b4096300e75dd2fd511d0ef323f9ad4837711321/.github/workflows/ci.yml#L18-L30 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/b4096300e75dd2fd511d0ef323f9ad4837711321/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/b4096300e75dd2fd511d0ef323f9ad4837711321/.github/workflows/ci.yml#L18-L30)
[^core-v0.2.0]: https://github.com/ourostack/ouro-ui-core/releases/tag/v0.2.0; https://github.com/ourostack/ouro-ui-core/compare/v0.1.0...v0.2.0 verify:urlOk(https://github.com/ourostack/ouro-ui-core/releases/tag/v0.2.0) verify:urlOk(https://github.com/ourostack/ouro-ui-core/compare/v0.1.0...v0.2.0)
[^web-release]: https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3 verify:urlOk(https://github.com/ourostack/ouro-ui/releases/tag/v1.3.3)
[^apple-release]: https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0 verify:urlOk(https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.1.0)
[^core-today]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md)
[^apple-main]: https://github.com/ourostack/ouro-ui-apple/blob/22f5706d6d7e74d30a2c07450602be0b3e8622a2/core-provenance.json verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/22f5706d6d7e74d30a2c07450602be0b3e8622a2/core-provenance.json)
[^web-home]: https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md verify:urlOk(https://github.com/ourostack/ouro-ui/blob/d20002696a60ce07f234d12b542cbd457b84e4b0/docs/guides/ax-conformance.md)
