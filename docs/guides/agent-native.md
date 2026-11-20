# Ouro UI and Agent-Native, side by side

[Agent-Native](https://github.com/BuilderIO/agent-native) and Ouro UI both start from one declaration of what an app can do, and both let an agent reach it without driving the screen. They are built for different jobs. This page says what they do, where they are stronger, and how to choose. Read Agent-Native's own documentation for its current state: this page cites it as of the commit linked below.

## What they do

**Agent-Native** is an open-source TypeScript framework for building agents that pair autonomous work with a purpose-built UI.[^an-readme] You define a capability once as an action, with a schema and a `run` function. The agent calls it as a tool and the UI calls it from code, through the same validation, permissions and implementation, and the framework also exposes it over HTTP, MCP, A2A and a CLI.[^an-action] The framework brings the rest of an agent product with it: agent chat, authentication and permissions, skills and memory, automations, agent teams and a PostgreSQL backend.[^an-included]

**Ouro UI** is a design system for an app that has people and agents as users. You declare an action once with `defineAction`, with a consent class of read, write, consequential or person-only, and a generator writes the CLI command, the MCP and WebMCP tools, the web control's props, an App Intent, a SwiftUI `Button(intent:)` and a Reins action, into files you commit. A check fails CI when a generated file drifts from its declaration.[^ouro-actions] Around that declaration sit [Ouro HX](../../README.md), the components people use, in native kits for web, Apple, Windows and Android; [Ouro AX](ax.md), a standard for the interfaces agents use and an [X-ray](ax-conformance.md) that checks any CLI, HTTP API or MCP server against it; and [composed UI](composed-ui.md), where an agent describes a card as validated data that the app draws with its own components.[^ouro-ax]

## Where they are stronger

| | Agent-Native | Ouro UI |
| --- | --- | --- |
| Building an agent product from the start | Ships the chat, the permissions, the memory, the automations and the database an agent app needs.[^an-included] | Does not: it is the layer under your screens and your agent's doors, and brings your own backend and agent. |
| One implementation behind the UI and the agent | The action's `run` function is the implementation, called by both paths. | The declaration generates the doors; the implementation stays yours, in whatever the app already uses. |
| Native apps | Its README shows TypeScript actions called from React.[^an-action] | Native kits for Apple, Windows and Android beside web, each drawing the same declared actions.[^ouro-actions] |
| What a person sees before an action runs | Approvals for sensitive results are handled in the framework.[^an-private] | A consent class on each action, drawn the same way on every kit, and a person-only class no agent door offers.[^ouro-actions] |
| Checking an interface from outside | Its README describes building and running an agent, and does not describe an outside check of an interface.[^an-readme] | The X-ray checks an existing CLI, HTTP API or MCP server against a published standard, whether Ouro built it or not.[^ouro-ax] |
| Existing apps | Its README does not say how it fits into an existing app.[^an-readme] | Copy-in source that sits beside the components and agent surfaces you already have ([beside your design system](beside-an-incumbent.md), [adopting the X-ray on an existing app](ax-adopt.md)). |

## When to pick which

- **Starting an agent product, mostly on the web, without a backend or chat yet:** Agent-Native gives you the whole stack, and its shared actions give you the one-implementation property directly.
- **You already have an app, a backend and often a native client, and want agents to reach it safely:** Ouro UI adds the declaration, the consent class and the checks without asking you to move your stack.
- **You mainly need to know whether an agent-facing interface is any good:** run the Ouro AX X-ray on it, whichever framework built it.
- **You want agents to compose parts of the screen itself:** that is Ouro's [composed UI](composed-ui.md); Agent-Native's README describes agent chat and shared actions, and does not describe a composed-card format.[^an-readme]

They can also fit together. An app built on Agent-Native exposes its actions over MCP and HTTP,[^an-action] and those are the interfaces the Ouro AX X-ray checks, so a team can use Agent-Native to build and Ouro's checks to verify what it exposes. We have not tried that pairing end to end, and this page does not claim it works unchanged.

## Prior art

Agent-Native also ships a one-declaration action model, as a full framework. Ouro's action model is a separate design with a different scope, and a team that wants the agent product Agent-Native describes should look there first. Models that reviewed both made this comparison in the interviews behind [#2298](https://github.com/ourostack/ouro-ui/issues/2298); this page answers it from Agent-Native's own README.

[^an-readme]: https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md verify:urlOk(https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md)
[^an-action]: https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md verify:urlOk(https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md)
[^an-included]: https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md verify:urlOk(https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md)
[^an-private]: https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md verify:urlOk(https://github.com/BuilderIO/agent-native/blob/99491ba2c96f39df5ad36cc7ebbd53b7dabf5064/README.md)
[^ouro-actions]: https://github.com/ourostack/ouro-ui-core/blob/d25221aa63f007763857fc76727a09e6fa35827b/docs/guides/actions.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/d25221aa63f007763857fc76727a09e6fa35827b/docs/guides/actions.md)
[^ouro-ax]: https://github.com/ourostack/ouro-ui/blob/main/docs/guides/ax.md verify:fileLine(docs/guides/ax.md, /checks any interface against the claims from outside/)
