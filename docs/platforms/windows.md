# Ouro HX & AX for Windows

Ouro's look and manners in WinUI, for Windows apps, plus the agent doors Windows gives apps: App Actions, and an MCP server for the On-device Agent Registry. It lives in [ourostack/ouro-ui-windows](https://github.com/ourostack/ouro-ui-windows).

## What ships today

Release [v0.3.0](https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0) meets core v0.19.0: its tokens and component specs are core's, byte for byte, and its CI checks the hashes in `core-provenance.json`.[^core]

The kit has eight of core's components as WinUI 3 controls, where web has [every component in the parity matrix](docs/platforms/parity.md "verify:fileLine(docs/platforms/parity.md, /^Components: Web has (\d+) of \1,/)"): `OuroButton`, `OuroBadge`, `OuroCard`, `OuroItem`, `OuroCheckbox`, `OuroTextField`, `OuroSeparator` and `OuroDescriptionList`.[^readme] The controls follow light and dark mode, a Windows contrast theme, the text size and the animation setting, and draw from core's tokens through one colour path. An `OuroButton` with an `Action` runs it through `Ouro.Actions`.[^readme]

`OuroComposedSurface` draws Ouro's [composed tree](../guides/composed-ui.md), the card an agent composes, from an MCP tool result's `structuredContent.ouro` (`OuroComposedResult.From`). Fields write the data model, a consequential button asks the person first, and a person-only one hands them to the app. To change a card it already shows, the agent sends only what changed, an update in `structuredContent.ouro.update`, and the surface applies it, keeping what the person entered except where the agent set the value. It reads no A2UI messages: send the tree.[^readme]

`Ouro.Actions` is the runtime the agent doors share. It checks input against the action's schema, keeps idempotency keys, audits calls, asks the person before a consequential action an agent prepared (the default is to refuse), and answers core's typed refusal for a person-only action, naming the action the way a person knows it.[^release] It also reads App Action URIs and serves MCP.[^readme]

Ouro Shop is a sample MSIX whose buttons people press and agents call. It registers its App Actions and an MCP server for the On-device Agent Registry, and has a gallery of every tone and variant.[^readme]

Declare actions once in TypeScript with core's `defineAction`, then run `node vendor/core/ouro-actions-windows.mts generate my.actions.mts Generated` to write the catalog, the App Actions file, the MCP bundle manifest and the list of which door carries each action.[^readme]

The packages are published to GitHub Packages, ourostack's NuGet feed, which needs a token with `read:packages`. The `.nupkg` files are also attached to the release, for a local feed with no sign-in. nuget.org publishing is pending.[^release] With the attached files:

```sh
dotnet nuget add source ./packages --name ouro
dotnet add package Ouro.UI.Windows --version 0.3.0 --source ouro
```

An unpackaged app also needs `<EnableMsixTooling>true</EnableMsixTooling>` in its project, or its controls draw nothing.[^readme]

## What is still missing

- **Components.** Web has [every component in the parity matrix](docs/platforms/parity.md "verify:fileLine(docs/platforms/parity.md, /^Components: Web has (\d+) of \1,/)"), and this kit has eight. Core's decision record plans v0.1.0 as the components Apple shipped first, and the rest have no Windows version yet.[^decision]
- **A client machine.** The free runner is Windows Server, and it lacks an App Actions runtime, an On-device Agent Registry and Mica. CI proves the package registers both agent doors and that they behave, but not that Windows lists them to agents.[^release]
- **The person check.** Requiring Windows Hello before a person-only action is built and off by default. Whether to turn it on is Ari's decision, and [the person-check note](https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/docs/person-check.md) sets out the question.[^person]
- **Contrast themes.** Under a contrast theme the controls draw the person's system colours, so status tones look alike, and their meaning must also be in words.[^readme]

## How it is checked

CI runs on GitHub's free `windows-latest` runners, and in its `actions` job on Ubuntu.[^readme] That job runs the runtime's tests and checks that every tone and variant reads at 4.5:1 or better in core's six themes, light and dark.[^readme] The `windows` job builds, packages and installs the MSIX. It then reads the window through UI Automation in light, dark, a contrast theme, with animations off and with text at a larger size. It checks each component against core's claims, samples the pixels of each Button's and Badge's middle row against the fill and label it reports, runs the X-ray and answers the MCP server's confirmation.[^ci][^release]

## Contribute next

- To add a component, follow the kit's [working notes](https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/AGENTS.md): vendor its spec from core, add the control with an automation peer, add it to Ouro Shop's gallery, and add its claims to `tools/claims.mts`. CI fails until every claim the spec names passes.[^agents]
- Send changes to [ourostack/ouro-ui-windows](https://github.com/ourostack/ouro-ui-windows) as small pull requests, with auto-merge on.[^agents]
- Core's decision record lists what is left of Windows v0.1.0 beyond the four components: the App Actions catalog and the Agent Registry on a Windows 11 client, Feel's frame pacing and Mica, and publishing to nuget.org.[^decision]

A new platform starts from [the guide for platform builders](contributing.md) instead.

[^core]: https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0; https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/core-provenance.json; https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml#L37-L48 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/core-provenance.json) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml#L37-L48) verify:equals(scripts/parity-data/versions.json#windows.coreTag)=v0.19.0
[^readme]: https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/README.md verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/README.md)
[^release]: https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0 verify:urlOk(https://github.com/ourostack/ouro-ui-windows/releases/tag/v0.3.0)
[^ci]: https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/.github/workflows/ci.yml)
[^agents]: https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/AGENTS.md verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/AGENTS.md)
[^person]: https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/docs/person-check.md verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/2138b3d29b89e335857da610ae05eab99511faa1/docs/person-check.md)
[^decision]: https://github.com/ourostack/ouro-ui-core/blob/e2ab6ea4072dff1674cecf1b1df70933e4c0f0f9/docs/decisions/2026-11-14-native-kits.md#windows-v010 verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/e2ab6ea4072dff1674cecf1b1df70933e4c0f0f9/docs/decisions/2026-11-14-native-kits.md#windows-v010)

