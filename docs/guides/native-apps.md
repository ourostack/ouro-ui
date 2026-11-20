# Ouro AX beside a React Native or Flutter app

A team with a shipping React Native or Flutter app does not have to rewrite it to use Ouro. Ouro AX checks the interface an agent uses, a CLI, an HTTP API or an MCP server, and that interface is the same whatever toolkit draws the screens.[^surfaces] This page says which parts of Ouro work beside such an app today, with a path, and which parts do not yet.

Ouro's native kits are optional for this. Ouro does not ship a React Native or Flutter kit, on purpose ([why](../platforms/README.md)); that choice is about what Ouro builds, and it does not ask your app to move.

## What works today

| Part | Works beside your app | What it needs |
| --- | --- | --- |
| Ouro AX and its X-ray | Yes | An interface an agent can call: a CLI, an HTTP API or an MCP server. Node runs the X-ray; the app's own toolkit is not involved.[^surfaces] |
| Ouro check | Not yet | It opens built web pages in a browser. A React Native or Flutter app's native screens are not web pages.[^check-web] |
| X-ray on screens (the outlines of Ouro components) | Not applicable | It outlines Ouro HX components, and a React Native or Flutter screen has none.[^outlines] |
| Composed cards | Not yet | The kits that draw them are web, SwiftUI, WinUI 3 and Compose.[^kits] |

## A path for the agent interface

Your app already has a backend, and an agent that uses your product will call it from outside, as a CLI, an HTTP API or an MCP server. That is where Ouro AX applies, and the steps below are the ones this page checked.

1. **Get the X-ray's files into a folder of your repository.** The X-ray is plain TypeScript that Node runs as it is, and the shared kit files it reads are named once in `package.json`, as `imports.#ouro-ax/*`.[^node] [Ouro AX](ax.md) shows the shadcn command that copies them, and where its files land; the command needs a `components.json`, which a Flutter repository does not have, so for this page the files from both of those folders were copied by hand into one folder of a bare Node project, with `"imports": { "#ouro-ax/*": "./ax/*" }` in its `package.json`. That layout is not the one the command writes.
2. **Run it on your interface, as it is.** For a CLI: `node ax/xray.ts --cli "node tool.mjs" --home .xray-home`. For an MCP server: `--mcp "node server.mjs"`. For an HTTP API: `--http <url> --routes routes.json`.[^kinds] The report lists the claims, what the calls returned and the fix.
3. **Fix the first `must`, and run it again,** then gate CI on `--conformance`, which needs an `--inventory` generated from your command table ([make your CLI conformant](ax-adopt.md#4-generate-the-inventory-and-ask-for-conformance) has the full command).

The copy and run steps were run for this page in that bare folder, without React, Tailwind or shadcn, against a plain Node CLI and a plain MCP server: the X-ray ran, printed its report and named the fix for the failing claims. It ran on Node 22.23.4. The HTTP path and a Flutter-repository layout were not run for this page.

The X-ray makes no call that other people would see until a guard proves the target is a mock, so point it at made-up data ([the X-ray](ax-conformance.md)).[^safety]

## What is not yet there

- **Ouro check on a React Native or Flutter app.** React Native for Web and Flutter's web build produce pages a browser can open, and Ouro check opens built pages.[^check-web] Neither was tried, and a Flutter web build that draws to a canvas gives the check little to measure. Treat both as not yet verified.
- **Screens drawn by Ouro on those toolkits.** Composed cards need a kit that draws them, and Ouro ships a kit for neither React Native nor Flutter. The composed tree is Ouro's own contract ([composed UI](composed-ui.md)), and a team that wants cards on a native screen today uses a native kit for that screen.
- **Measured cost of keeping native codebases.** Ouro's position is that agents make a native app per platform cheap to maintain, and that is a bet, not a measurement ([the decision](https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md)).[^native] Nothing on this page asks your team to take it on.

[^surfaces]: docs/guides/ax.md verify:fileLine(docs/guides/ax.md, /Ouro AX is for the interfaces agents use: a CLI, an HTTP API or an MCP server/)
[^check-web]: docs/guides/guardrails.md verify:fileLine(docs/guides/guardrails.md, /opens the built app's pages at screen sizes from a phone to a wide desktop/)
[^outlines]: test/incumbent-fixture/xray.check.mjs verify:fileLine(test/incumbent-fixture/xray.check.mjs, /X-ray outlined something on the page of the incumbent's components/)
[^kits]: docs/platforms/README.md verify:fileLine(docs/platforms/README.md, /there is no Flutter, React Native or other cross-platform kit/)
[^native]: https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md)
[^node]: docs/guides/ax.md verify:fileLine(docs/guides/ax.md, /Node strips the types/)
[^kinds]: docs/guides/ax-conformance.md verify:testExists(registry/ouro/ax/xray.test.mts::an MCP server: listed tools, annotations, a bad call refused naming the argument, an unknown tool, its inventory) verify:testExists(registry/ouro/ax/xray.test.mts::an HTTP API: JSON, one error shape, an index, errors that teach, refusals that change nothing, its inventory) verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
[^safety]: docs/guides/ax-conformance.md verify:fileLine(docs/guides/ax-conformance.md, /every address it can see/)
