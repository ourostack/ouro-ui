# Ouro HX & AX for Windows

Ouro HX and Ouro AX haven't set up shop on Windows yet: WinUI for the people, App Actions and MCP for the agents, and an empty desk by a sunny window with a chair that spins. Nobody has sat in it yet. It could be you.

## What it would be

Ouro HX for Windows would be Ouro's look and manners in [WinUI](https://learn.microsoft.com/en-us/windows/apps/winui/): the themes as WinUI resources, light and dark that follow the person's setting, the spring and the calm under reduced animation, components with the same names as web's, and screens that Narrator reads well and that hold up in high contrast.

Ouro AX for Windows would meet agents at the doors Windows gives them:

- [App Actions](https://learn.microsoft.com/en-us/windows/ai/app-actions/), small units of behaviour an app registers so that Windows and other apps can offer them at the right moment.[^actions] An action declares its inputs and outputs, so Ouro AX's questions apply: is each one named and described well enough to pick, and does a failure say what to do next?
- The [On-device Agent Registry](https://learn.microsoft.com/en-us/windows/ai/mcp/overview), where an app registers an MCP server for agents on the machine to find, contained by default. Microsoft marks it as prerelease, so it may change before it ships.[^odr] Ouro AX for web already has an [X-ray for MCP servers](../guides/ax-conformance.md), so this door is half built.[^mcp]

Since these are new, an Ouro AX for Windows would start every claim it adds as `should`, as Ouro AX for Apple did.[^apple-should]

## The contract

To become Ouro HX & AX for Windows, an implementation should:

1. Take its tokens from a pinned core release. Add a WinUI output to core's generators, or generate from core's DTCG files, then record the tag and the file hashes in `core-provenance.json` and check them in CI.
2. Meet Ouro HX's bar. Test for Narrator names, keyboard focus you can see, touch targets, text scaling, reduced animation and high contrast, so a slip fails a build rather than a person. Give an agent with fresh eyes only the package, and check that it builds a correct screen that Narrator can read.
3. Pass Ouro AX's X-ray for its surfaces. Write the App Actions claims into core's standard, as core did for App Intents, and build an X-ray that checks them. Hold an app's MCP server to the MCP claims Ouro AX already has.

Read [the guide for platform builders](contributing.md) for the details.

## Propose it

1. Build it wherever you like, in your own repository.
2. Open a pull request to [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui) that adds a link to your work in this page's file, `docs/platforms/windows.md`, with a line or two on what it does so far.
3. If Ari likes it, we create `ouro-ui-windows`, import your work with its history, and make you a contributor.

[^actions]: https://learn.microsoft.com/en-us/windows/ai/app-actions/ verify:urlOk(https://learn.microsoft.com/en-us/windows/ai/app-actions/)
[^odr]: https://learn.microsoft.com/en-us/windows/ai/mcp/overview verify:urlOk(https://learn.microsoft.com/en-us/windows/ai/mcp/overview)
[^mcp]: test:registry/ouro/ax/xray.test.mts::an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory verify:testExists(registry/ouro/ax/xray.test.mts::an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory)
[^apple-should]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md)
