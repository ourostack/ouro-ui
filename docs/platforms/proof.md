# What is proven on a device

Where the platforms' promises have been run, and where they haven't. A promise run in CI on an emulator or a hosted runner is evidence, and this page says which kind the platforms have, so you can decide what to test on your own hardware.

| Platform | Where its checks run | Not run on a device |
| --- | --- | --- |
| Web | Real browsers in CI, and the screen readers VoiceOver on macOS and NVDA on Windows before a release.[^web] | A phone's or a tablet's own browser, and other screen readers.[^web] |
| Apple | GitHub's macOS runners, with the SwiftUI package built and tested there.[^apple] | A run on an iPhone, an iPad or a Mac that someone owns is not recorded here. |
| Windows | GitHub's `windows-latest` runner, which is Windows Server.[^windows] | A Windows client machine: the runner lacks the App Actions runtime and the On-device Agent Registry, so CI shows the package registers its doors but not that Windows lists them to agents.[^windows] |
| Android | Emulators in GitHub's CI.[^android] | A real phone or tablet; a device run is still to come.[^open] |

## What this means for you

- Treat a native kit's green CI as the floor of what its components do, not as proof for your own devices. Run your app on the hardware and assistive technology your people use before you tell them it works there.
- If you have a Windows client machine or an Android device and run a kit on it, say so on the kit's issue and the result goes in the table above.[^open]

[^web]: https://github.com/ourostack/ouro-ui/blob/main/docs/guides/screen-reader-lane.md verify:fileLine(docs/guides/screen-reader-lane.md, /VoiceOver/)
[^apple]: https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/9931f6d284f44014648482bde69b114e48b7b7de/.github/workflows/ci.yml)
[^windows]: https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml; https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0)
[^android]: https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/8ba5196a9e9062e495dde8c23f136913094cbdf4/.github/workflows/ci.yml)
[^open]: https://github.com/ourostack/ouro-ui/issues/2294 verify:urlOk(https://github.com/ourostack/ouro-ui/issues/2294)
