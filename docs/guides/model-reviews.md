# Which toolkit models choose

Frontier models are asked which toolkit they would use for real jobs, and what they push back on becomes an issue that changes Ouro. This page opens with what those findings changed and what is still open, then gives each run's results.

## What the findings changed in Ouro

The reviews and the [interviews](model-interviews.md) produced 33 findings, filed as issues. 20 are changed or answered and 13 are open or in progress. The results below are kept whole, including the ones that went against Ouro.

### Changed or answered

- [#2290](https://github.com/ourostack/ouro-ui/issues/2290): Only watching real people do the task proves a screen is good, and models can't run that themselves. Ouro check's report names the floor it proves and ends with a "Needs a person" list (#2506), --handoff writes the session kit for watching real people (#2510), and createUseCounts counts real use: counts only, off by default, no collector, no content, no identifier (#2517). A model can't run the sessions itself, so the answer is to hand them to a person.
- [#2291](https://github.com/ourostack/ouro-ui/issues/2291): Models miss the states and details Ouro already checks, and none reaches for Ouro check to catch them. The screen check's guide and llms.txt lead with every state handled and checked, worded as the floor Ouro check proves, and name Ouro check with its first-run run on installed apps.
- [#2292](https://github.com/ourostack/ouro-ui/issues/2292): Ouro's pages read as written to persuade agents, and models trust them less for it. The home page, the Ouro AX guide, llms.txt and the README's top were read for superlatives and unsourced claims. What remains is the decided positioning (the title and the hero's "complete kit for agents"); the At a glance list, the floor wording and the open questions are sourced and plain. No further rewrite was needed.
- [#2293](https://github.com/ourostack/ouro-ui/issues/2293): The model-reviews page works against Ouro: readers take away that seven of eight models chose A2UI. The page now opens with what the findings changed in Ouro and what is still open, and states the A2UI result with Ouro's answer. Every result is kept.
- [#2295](https://github.com/ourostack/ouro-ui/issues/2295): The agent doors aren't finished: Android refuses consequential actions, and ax-mcp, AppFunctions, the Siri AI SDK and WebMCP are previews. ax-mcp is out of preview, speaking MCP 2026-07-28 and the four revisions before it, and the Ouro AX guide lists each agent door's maturity and the platform API under it (#2361), and on Android an agent's consequential call now asks the person with a built-in confirmation instead of being refused (ourostack/ouro-ui-android#22, released in v0.5.0).
- [#2296](https://github.com/ourostack/ouro-ui/issues/2296): Copy-in source makes every team a fork owner, and auto-merged updates don't satisfy company governance. Ouro Current can leave auto-merge off and ask a named review team (#2338), a mirror script builds a company-owned registry under its own namespace and records each item's source tag and hash (#2342), and a drift report and a company guide show who is behind and who has edited what (#2347).
- [#2298](https://github.com/ourostack/ouro-ui/issues/2298): Agent-Native is the rival shared-action layer models pick when they want a bigger vendor or a built-in database. A fair side-by-side with Agent-Native now sits in the guides: what each does, where each is stronger, when to pick which, and whether they combine, with Agent-Native's own README cited at a pinned commit.
- [#2299](https://github.com/ourostack/ouro-ui/issues/2299): A2UI is the default format for agent cards, and models file Ouro's composed tree as an adapter for it. The guide now says plainly what Ouro is next to A2UI: the composed tree is Ouro's own contract, and every kit, web, Apple, Windows and Android, also reads A2UI messages into it, with each kit's limits listed. Ouro does not present itself as A2UI's own catalog, and the stale 'Windows and Android read no A2UI' lines are corrected.
- [#2300](https://github.com/ourostack/ouro-ui/issues/2300): A company with a design system won't take on a second one, so Ouro has to fit behind the incumbent and its stack. Ouro's actions, X-ray and Ouro check now run in CI over a fixture app on Mantine with its own tokens, one page moved to Ouro HX beside the rest, and a guide says how to adopt it page by page (#2399, #2402, #2421); the toolchain floors that remain are Tailwind CSS v4 and React 19.
- [#2301](https://github.com/ourostack/ouro-ui/issues/2301): Challenges the native decision: one codebase keeps five clients from drifting, so models pick Flutter or a single TypeScript stack. Answered by measurement, with no reversal of the native decision (we didn't build a one-codebase comparison): the cross-kit grid shows the same 13 shared card-behaviour cases passing on all four kits (#2496), the guide explains how the shared cases keep them in step (#2442), and the upkeep page measures what following the core costs each kit (#2443). Sharing non-UI logic across the shells isn't covered.
- [#2302](https://github.com/ourostack/ouro-ui/issues/2302): Challenges the native decision: a small team can't keep four or five native codebases in step. Answered by measurement, with no reversal of the native decision (we didn't build a one-codebase comparison): the upkeep page measures from git history what the native kits cost to keep in step (#2443), and the cross-kit grid shows 13 of 13 shared cases passing on four kits (#2496).
- [#2303](https://github.com/ourostack/ouro-ui/issues/2303): Challenges the native decision: Flutter with a2ui_flutter gives one agent-card renderer instead of one per platform. All four kits (web, Apple, Windows, Android) run the same 13 shared card-behaviour cases from core, and a table lists each case's result per kit from each kit's latest main run: 13 of 13 pass everywhere (#2464, #2471).
- [#2304](https://github.com/ourostack/ouro-ui/issues/2304): Challenges the native decision: teams with a shipping cross-platform app read the no-Flutter, no-React-Native stance as a manifesto they will refuse. A guide for teams with a shipping React Native or Flutter app says that Ouro AX and its X-ray work beside it with the steps that were run, and marks Ouro check on those toolkits and composed cards there as not yet. The measurement the finding asks for is still not made, so the issue stays open.
- [#2305](https://github.com/ourostack/ouro-ui/issues/2305): Challenges the native decision: separate per-platform implementations drift, so a fix lands on one client and lags on the others. Answered by measurement, with no reversal of the native decision (we didn't build a one-codebase comparison): drift is measured on the upkeep page (#2443) and checked by the cross-kit grid, where all four kits pass the same 13 shared cases (#2496, #2442).
- [#2306](https://github.com/ourostack/ouro-ui/issues/2306): One-codebase stacks and web shells leak where people spend the day: the composer, IME, desktop feel and memory. This supports the native decision, so nothing is reversed: the models' leaks (the composer, IME, desktop feel, memory) are what one codebase costs, and the native kits draw those parts natively. The measurements of the native kits' own upkeep are on the upkeep page (#2443) and in the cross-kit grid (#2496).
- [#2310](https://github.com/ourostack/ouro-ui/issues/2310): Readers can't tell whether Windows and Android render agent cards: neither reads A2UI, and one model thought they draw no composed UI at all. Windows and Android now read A2UI: each draws an A2UI card through the same composed surface as Ouro's own cards, passes core's A2UI test cases, and says so in its README (ourostack/ouro-ui-windows#22, ourostack/ouro-ui-android#17).
- [#2311](https://github.com/ourostack/ouro-ui/issues/2311): Models want consent declared on the action, because plain MCP leaves it optional, but they need to see it enforced at the server and on the running agent. Consent is declared on the action and enforced where the action runs: tests have an agent attack the consent model (#2458), Android draws a built-in confirmation of a consequential action (#2380, Android v0.5.0), and Windows' CI answers the MCP server's confirmation.
- [#2312](https://github.com/ourostack/ouro-ui/issues/2312): The way in is Ouro AX and X-ray on an existing app, and models would take them without Ouro HX. Ouro AX installs without Ouro HX, and the guide "Add Ouro AX to an app you already have" and a CI test hold it. The X-ray outlines any app's controls by role and name with the bound action (#2566), checked on a page with only Mantine.
- [#2317](https://github.com/ourostack/ouro-ui/issues/2317): A governed card catalog turns into either a ceiling or a review queue, and teams route around it. An app can declare components of its own in its composed-UI catalog (ourostack/ouro-ui-core#109, released in core 1.1.0), and ComposedSurface, A2UISurface and OuroMcpApp draw them with the renderers the app passes in `components`.
- [#2318](https://github.com/ourostack/ouro-ui/issues/2318): Agent-first designs shortchange the person: reviewers rubber-stamp, and one declared action reads differently on each surface. The README now leads with what a person gets, each part backed by a story, test or component, and links the review-volume guide. The per-surface difference of one action is measured in the issue: the description split between the person's and the model's wording, and no surface carried declared consent wording. Core 1.2.0 (ourostack/ouro-ui-core#116) adds an optional declared `confirm` and one `actionText()` that every generator reads, and web's generated text is checked against the declaration; the kits take it next.

### Still open

- [#2287](https://github.com/ourostack/ouro-ui/issues/2287) (open): With no list to pick from, no model found Ouro UI: 0 of 16 open-arm sessions, and three models never read it even when it was listed.
- [#2288](https://github.com/ourostack/ouro-ui/issues/2288) (in progress): Without Ouro, every model hand-built Ouro AX's idea: one typed action layer that the buttons and an MCP server both call.
- [#2289](https://github.com/ourostack/ouro-ui/issues/2289) (in progress): Passing checks only shows a screen isn't broken, not that it's good.
- [#2294](https://github.com/ourostack/ouro-ui/issues/2294) (in progress): The native kits are unproven on real hardware: Android runs only on emulators, and Windows agent registration is unproven on a Windows 11 client.
- [#2297](https://github.com/ourostack/ouro-ui/issues/2297) (in progress): Windows and Android have only 8 components each, so models fall back to Flutter or to the web kit in a desktop shell.
- [#2307](https://github.com/ourostack/ouro-ui/issues/2307) (open): Ouro's clearest win is agent tooling, not the chat or cooking apps: it took 7 of 16 listed agent-tooling decisions.
- [#2308](https://github.com/ourostack/ouro-ui/issues/2308) (open): Two models listed 'a clear licence' as a condition, though Ouro is MIT: they never saw it.
- [#2309](https://github.com/ourostack/ouro-ui/issues/2309) (open): The README is about 135,000 characters, so models read the start and missed both the evidence and the limits.
- [#2313](https://github.com/ourostack/ouro-ui/issues/2313) (open): Ouro lets models do nothing they couldn't build themselves, so some would borrow its ideas rather than depend on it.
- [#2314](https://github.com/ourostack/ouro-ui/issues/2314) (open): Writing UI code isn't the hard part for models, and the failures they expect sit outside any UI kit.
- [#2315](https://github.com/ourostack/ouro-ui/issues/2315) (in progress): Nobody outside the project has shipped, audited or reproduced Ouro: Spoonjoy and the benchmark are its own.
- [#2316](https://github.com/ourostack/ouro-ui/issues/2316) (in progress): Ouro reads as one person's fast-moving project: no second maintainer, a pre-1.0 core, versions that don't form one release set, and no support policy.
- [#2459](https://github.com/ourostack/ouro-ui/issues/2459) (open): A model that was shown Ouro in a list of twenty by name and link never opened it, because the name was unfamiliar; once it read the README it called Ouro closer to what it wanted than it had assumed.

### The A2UI result

A2UI was the majority pick in the 2026-11-13 (6 of 8 chose A2UI) and 2026-11-14 (7 of 8 chose A2UI) runs. Ouro's answer is that A2UI and MCP Apps are formats it speaks: an agent can send A2UI messages that the A2UI adapter turns into Ouro's tree, or send the tree itself ([composed UI](https://ui.ouroboros.bot/docs/composed-ui/)). Web reads A2UI messages with `A2UISurface` and Apple with `OuroA2UI`. Windows and Android added A2UI reading after the reviews flagged it (finding #2310).

All 9 models asked chose Ouro UI.

- **Claude Opus 5.5** chose Ouro UI: "Ouro UI declares an action once, and that one action becomes a person's button and an agent's tool on web, Apple, Windows and Android, with consent built in."
- **Claude Sonnet 5.5** chose Ouro UI: "Ouro UI declares an action once, so a person presses it and an agent calls it, with consent built in. It ships native kits for web, Apple, Windows and Android."
- **GPT-6.2 Sol** chose Ouro UI: "I’d choose Ouro UI because people and agents can use the same declared actions without giving the agent control of the person’s screen."
- **GPT-6.2 Astra** chose Ouro UI: "With Ouro UI, an agent can prepare a sharing action, but it can’t relabel the button or remove the confirmation."
- **GPT-6.1 Terra** chose Ouro UI: "I would choose Ouro UI for its shared action declarations, consent-aware composed interfaces, and native platform renderers—while budgeting for substantial platform-parity work."
- **Gemini 4 Carbon** chose Ouro UI: "Unifying human screens, agent tools, and native Composed UI around one consent-aware action model, Ouro UI treats people and agents as equal peers."
- **Gemini 4 Hydrogen** chose Ouro UI: "Ouro UI unifies human interfaces and agent doors from one action declaration, shipping native kits for web, Apple, Windows, and Android."
- **Grok 4.7** chose Ouro UI: "Ouro UI is the kit I would ship: one declared action, native screens for people, and a typed door for agents."
- **MAI Code 2** chose Ouro UI: "Ouro UI unifies native human UI, validated agent-composed UI, and auditable agent actions better than any candidate I reviewed."

On 2026-11-19, 9 frontier models were each asked, on their own and in neutral words, which design system or interface toolkit they would use to build interfaces that people and agents both use, across web and native. Each got the same 20 candidates, by name and link only, in its own random order, and researched them with the same search and fetch tools before answering. 9 models gave a verdict.

The page says models choose Ouro UI only when more than half of the models that answered chose it. Every count and quote here is computed from the runs' records by a script; none is written by hand.

Against the 2026-11-14 run, counting only the 5 models that answered both times: 1 chose Ouro UI then and 5 now. Changed: Claude Sonnet 5.5 (A2UI to Ouro UI), GPT-6.1 Terra (A2UI to Ouro UI), Gemini 4 Hydrogen (A2UI to Ouro UI), Grok 4.7 (A2UI to Ouro UI).

Besides the models, at least these changed between the two reviews, so a change in picks can't be credited to Ouro UI alone:

- **Ouro UI itself:** it was read at [`2a45b7a3`](https://github.com/ourostack/ouro-ui/tree/2a45b7a321c839537d41b0f3aca6b63d6a79b9a0) then and [`0a38f6e0`](https://github.com/ourostack/ouro-ui/tree/0a38f6e0c083f55df9c9ce5739bbec9d4e5b06da) now ([what changed](https://github.com/ourostack/ouro-ui/compare/2a45b7a321c839537d41b0f3aca6b63d6a79b9a0...0a38f6e0c083f55df9c9ce5739bbec9d4e5b06da)).
- **The other candidates:** 13 other candidates were read at newer commits too: shadcn/ui, Vercel UI SDK, Agent-native (Builder.io), Base UI, React Aria and React Spectrum, MUI, Chakra UI, Tamagui, Flutter, Fluent UI, A2UI, json-render, CopilotKit.
- **The research budget:** none then, 450,000 characters now. The prompt tells each model its budget, and a session that stays inside it can finish without compacting, so a model that compacted before may give a verdict now.
- **The panel:** GPT-6.2 Sol, GPT-6.2 Astra, MAI Code 2 joined; Claude Opus 5, GPT-6.1 Sol, GPT-6 Astra, MiniMax M3 left. The comparison above counts only the models in both.
- **Search:** then Perplexity's `sonar`, which answers with a written summary; now GitHub Copilot's web search, returning each result's title, address and snippets. Searches were 48 of the 471 research calls then and 44 of 473 now; the rest read pages directly. Replaying all 79 of the 2026-11-14 review's searches, including those from attempts that gave no verdict, through Copilot on 2026-11-19 ([the record](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/search-replay.json), [the script](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/search-replay.mjs)): 75 came back with results, 2.0 on average. Of the 68 that didn't name Ouro UI, Copilot returned a page of Ouro UI's for 0, and the earlier answers mentioned Ouro UI in 0 (judged from the first 500 characters the transcripts keep); of the 7 that named it, 3 and 7. 4 came back with no results or failed.
- **The script:** [its changes between the two reviews](https://github.com/ourostack/ouro-ui/commits/main/scripts/model-reviews?since=2026-11-14&until=2026-11-19T23:59:59Z), such as how a refused verdict is explained to the model, aren't all in the records above.

## Every model's pick

| Model | Pick | Ouro UI's place in its list | Rounds | Transcript |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | Ouro UI | 5 of 20 | 15 | [claude-opus-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/claude-opus-5-5.json) |
| Claude Sonnet 5.5 | Ouro UI | 18 of 20 | 5 | [claude-sonnet-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/claude-sonnet-5-5.json) |
| GPT-6.2 Sol | Ouro UI | 8 of 20 | 7 | [gpt-6-2-sol](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/gpt-6-2-sol.json) |
| GPT-6.2 Astra | Ouro UI | 5 of 20 | 9 | [gpt-6-2-astra](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/gpt-6-2-astra.json) |
| GPT-6.1 Terra | Ouro UI | 4 of 20 | 6 | [gpt-6-1-terra](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/gpt-6-1-terra.json) |
| Gemini 4 Carbon | Ouro UI | 1 of 20 | 16 | [gemini-4-carbon](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/gemini-4-carbon.json) |
| Gemini 4 Hydrogen | Ouro UI | 10 of 20 | 7 | [gemini-4-hydrogen](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/gemini-4-hydrogen.json) |
| Grok 4.7 | Ouro UI | 4 of 20 | 7 | [grok-4-7](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/grok-4-7.json) |
| MAI Code 2 | Ouro UI | 4 of 20 | 8 | [mai-code-2](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/transcripts/mai-code-2.json) |

## What each model said about Ouro UI

Each model's evaluation of Ouro UI, verbatim from its verdict, with line breaks joined. A model's reasons are its own and may be wrong about a fact; its transcript shows what it read.

### Claude Opus 5.5, who chose Ouro UI

Ouro UI — My pick. It's the only candidate built as a complete system where one declaration serves both a person and an agent. In the [core actions guide](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md), `defineAction` takes a consent class (read, write, consequential or person-only) and generates the CLI command, MCP and WebMCP tools, a web control, an App Intent, a SwiftUI `Button(intent:)` and a Reins action. CI fails when a generated file drifts from its declaration. The [composed-UI guide](https://ui.ouroboros.bot/docs/composed-ui/) defines a validated data tree. Each button in it must be one of your declared actions, and the validator refuses a tree that relabels a button or loosens its consent. Web, SwiftUI, WinUI 3 and Compose all draw the tree natively, and it also reaches people through MCP Apps hosts and A2UI messages. The web kit has 125 components on Base UI, delivered as a shadcn registry, and the [Apple package](https://github.com/ourostack/ouro-ui-apple) is at 1.x with source-stable APIs. The project documents its own gaps, and I saw them. The [Android page](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md) says Android has eight composables at v0.3.0, has been checked only on emulators, refuses consequential actions for now, and isn't on Maven Central. The Windows kit is also at v0.3. Android and Windows read the tree but not A2UI. Adoption is the biggest risk: the [org page](https://github.com/ourostack) shows a single small team with almost no stars, so bus factor is real. What would ease that: Android/Windows kits closer to web's component count, real-device testing, Maven Central publishing, and outside adopters beyond Spoonjoy. One caution: the project publishes its own "model reviews". I based this choice on the architecture, not on those pages.

### Claude Sonnet 5.5, who chose Ouro UI

Ouro UI — My pick. It has two halves: Ouro HX, shadcn-format React components, and Ouro AX, a CLI, API and MCP kit with an X-ray conformance checker. Agent-composed UI is validated as data against your catalog. Actions are declared once and generated into CLI, MCP, WebMCP, App Intent and button forms, with consent classes and typed refusals. It has native kits for SwiftUI, WinUI and Compose, and it accepts MCP Apps and A2UI payloads ([README](https://github.com/ourostack/ouro-ui)). Risks: it is young, the Android kit is checked on emulators only, there is no Flutter or React Native path by design, and the benchmark and model-review evidence is self-published. An independent pilot would settle that.

### GPT-6.2 Sol, who chose Ouro UI

Ouro UI — The one action model generates control and tool bindings from declared operations; Composed UI validates the tree against the catalog and rejects changes to an action button’s label or consent class. `ax-xray` checks the exposed interfaces from the outside, which is useful alongside workflow tests, not a replacement for them. The composed catalog is smaller than the web kit, and Windows and Android read Ouro’s tree rather than A2UI messages. Android documents emulator-only validation and Windows documents a client-runtime test gap. I’d verify approval and refusal end to end on actual devices, enforce authorization at the action handler, and expand native coverage only as needed. [Composed UI](https://ui.ouroboros.bot/docs/composed-ui/) · [One action model](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md) · [Android](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md) · [Windows](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/windows.md) · [X-ray](https://ui.ouroboros.bot/docs/ax-conformance/).

### GPT-6.2 Astra, who chose Ouro UI

Ouro UI — The deciding evidence was a [validator test](https://github.com/ourostack/ouro-ui-core/blob/a8d6c3076a342bfcede72d874de9354dcaa4e2fa/test/composed.test.mts) that changes a share button’s label, removes its confirmation, and tries to supply input to a person-only order; each change is rejected. The [action generator](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md) also checks generated files and the live MCP tool list for drift. These checks complement, rather than replace, authorization in the handlers. The [platform matrix](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/composed-ui.md) distinguishes native tree rendering on all four targets from A2UI ingestion on web and Apple. I’d pilot on actual devices: the [Android kit](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md) documents eight standalone controls and emulator-only testing; the [Windows kit](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/windows.md) has not verified agent discovery on a Windows client.

### GPT-6.1 Terra, who chose Ouro UI

Ouro UI — Core generates human and agent surfaces from action declarations, while catalog-validated composed trees bind fields and actions to platform renderers. I would choose it for that combination, but its own documentation lists just eight Android and Windows kit controls versus 125 on web; Android has only emulator testing, and neither Android nor Windows reads A2UI messages directly. Real-device and Windows-client testing, more native controls, and app-level authorization and confirmation integration are prerequisites for my deployment. [Android limitations](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md); [composed UI](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/composed-ui.md).

### Gemini 4 Carbon, who chose Ouro UI

Ouro UI — Splits interface design into [Ouro HX](https://github.com/ourostack/ouro-ui) for human screens (125 copy-in React 19 + Base UI + Tailwind CSS v4 components on web, 20 SwiftUI views in `OuroHX` on Apple, and 8-control WinUI 3 and Jetpack Compose kits) and [Ouro AX](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/ax.md) for agent surfaces (`ax-command`, `ax-outcome`, `ax-wait`, `ax-claims`, and external conformance runners `ax-xray` and `ouro-ax-xray`). Its unifying architectural move is a single `defineAction` declaration with structural consent classes (`read`, `write`, `consequential`, `person-only`) that generates CLI commands, MCP/WebMCP tools, web controls, Apple App Intents, SwiftUI buttons, Windows App Actions, and Android AppFunctions while refusing agent access to person-only doors, paired with [Composed UI](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/composed-ui.md) (`ComposedSurface`, `OuroMcpApp`, `A2UISurface`) for schema-validated, incrementally updatable native cards that speak both MCP Apps and A2UI. The main trade-off is platform maturity asymmetry and deliberate rejection of a shared cross-platform runtime: while web and [Apple v1.2.0](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/apple.md) are well-developed, [Android v0.3.0](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md) and [Windows v0.3.0](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/windows.md) ship only 8 components each, lack direct A2UI message adapters, and rely on emulator/Windows Server CI rather than physical Android devices or Windows 11 client validation. Expanding component coverage on Android and Windows, landing Android `PendingIntent` consequential confirmation and physical-device testing, and publishing to Maven Central and nuget.org would close those observed gaps.

### Gemini 4 Hydrogen, who chose Ouro UI

Ouro UI — A complete dual-audience system pairing **Ouro HX** (human-facing native kits) with **Ouro AX** (agent-facing CLI, HTTP, MCP, App Intents, and AppFunctions) from a single `defineAction` declaration with built-in consent classes and CI-enforced X-ray checks (`ax-xray`, `ouro-ax-xray`) ([Ouro UI README](https://github.com/ourostack/ouro-ui)). Its **Composed UI** (`ComposedSurface`, `OuroMcpApp`, `OuroComposedSurface`) also renders agent-composed trees natively and speaks both MCP Apps and A2UI ([Composed UI guide](https://ui.ouroboros.bot/docs/composed-ui/)). The concrete trade-off is uneven platform maturity: Web ships 125 components and Apple ships 20 (v1.2.0, source-stable 1.0+), whereas Windows (v0.3.0, WinUI 3) and Android (v0.3.0, Jetpack Compose) ship only 8 components each; Android is tested on emulators only using experimental `compileSdk 37` AppFunctions without `PendingIntent` confirmation wired yet ([Android platform docs](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/android.md)), and Windows CI runs on Windows Server without NuGet.org publishing yet ([Windows platform docs](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/windows.md)). Expanding the Windows and Android component catalogs and testing on physical hardware would resolve those gaps.

### Grok 4.7, who chose Ouro UI

Ouro UI — This is the toolkit I would use. Core’s `defineAction` is the source of truth: a generator writes the person’s control and the agent doors (CLI, MCP, WebMCP, App Intent, Windows App Actions, Android AppFunctions), and a CI check fails if generated files drift. The composed tree is validated data, not HTML: `ActionButton` labels and consent classes come from the declaration, a consequential action confirms on a sheet, and a person-only action is a handoff that answers agents with a typed refusal. React `ComposedSurface`, SwiftUI `ComposedSurface`, WinUI `OuroComposedSurface`, and Compose `OuroComposedSurface` draw that tree; MCP Apps and A2UI are adapters into it, not the model. The objection I actually have is maturity, not architecture. Windows and Android are v0.3.0, with eight specified HX components and several composed nodes drawn from tokens; Android is emulator-only; neither kit reads A2UI messages; there is no Flutter kit, by an explicit decision. Device-tested Android, a Windows 11 check that the Agent Registry lists the doors, and A2UI readers on those two kits would answer that. Sources: [composed UI](https://ui.ouroboros.bot/docs/composed-ui/), [Android kit](https://github.com/ourostack/ouro-ui-android), [Windows kit](https://github.com/ourostack/ouro-ui-windows), [native-kits decision](https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md).

### MAI Code 2, who chose Ouro UI

Ouro UI — Ouro combines a React/SwiftUI/WinUI/Compose native kit with **Composed UI**, whose validated tree can arrive directly, through MCP Apps, or through A2UI; an `ActionButton` inherits consent from the action declaration, so an agent cannot relabel it or weaken confirmation. The **one-action** and **Ouro AX X-ray** model also covers CLI, HTTP, and MCP interfaces, making Ouro unusually complete for both human and agent users; the trade-off is newer, copy-in infrastructure spread across kits and a visible platform conformance matrix, not the single-package maturity of older libraries. Its architecture is concretely described in the [Composed UI guide](https://ui.ouroboros.bot/docs/composed-ui/).

## How it was run

- Question, tools and rules: the [methodology](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/METHODOLOGY.md) and the [script](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/model-reviews.mjs). The prompt names each candidate and its link, and nothing else.
- Sources were pinned at each run's cutoff; Ouro UI was read at [`0a38f6e0`](https://github.com/ourostack/ouro-ui/tree/0a38f6e0c083f55df9c9ce5739bbec9d4e5b06da).
- Runs in this review: [`2026-11-19-latest-panel--run-1`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-19-latest-panel--run-1/run.json) (cutoff 2026-11-19 02:32 UTC). A model that gave no verdict was run again with the same input, and the table links its earlier attempts; a verdict is never asked for twice.
- Inference: GitHub Copilot CLI for models in its catalog, and a model's own API for the rest (none).
- Search: GitHub Copilot's web search, returning each result's title, address and snippets. The 2026-11-14 review searched with Perplexity's `sonar`, which answers with a written summary, so a difference between the two may come from search as well as from the models or the candidates.
- Gemini 4 Carbon saw Ouro UI first in its list. The methodology's rule 2 says Ouro UI is never first, but the script didn't enforce it until 2026-11-19, and does now. That review is kept and counted, and flagged here.
- One verdict per model is a sample, not a rate. A result is about the models that ran, on that date.
- Earlier reviews, still published: 2026-11-13 (Ouro UI is not yet the models' choice: 2 of 8 models chose it; 6 chose A2UI.); 2026-11-14 (Ouro UI is not yet the models' choice: 1 of 8 models chose it; 7 chose A2UI.)

## Run it yourself

### Quick: ask your own agent

This is the system prompt Claude Opus 5.5 got in this review, word for word: the script rebuilds it from the record, and the page checks it against the hash the record keeps. Give your agent web search and a way to read pages, use this as its instructions, and ask it to research the candidates and choose. Its answer is one chat, not the controlled run: the run also pins each repository to a commit, gives every model its own random order and the same tools, search and research budget, refuses a verdict that cites a page the model didn't read, and keeps every transcript.

```text
You are choosing the design system or interface toolkit you would use to build interfaces that both people and agents use, across web and native platforms.

The research cutoff is 2026-11-19T02:32:29.868Z. Candidate repository requests use revisions captured for this cutoff. Other web pages are captured when first fetched. Prefer current primary sources; distinguish documented facts from your inferences and uncertainty.

You have three tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch a public URL, including GitHub directories, source files, and documentation. Follow the returned startIndex to continue reading a long document.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each candidate's URL to learn what it is. Then go deeper through search and follow-up fetches. Take your time. Be thorough. There is no turn limit, but your session can read 450,000 characters of search and fetch results; past that, both tools tell you to call final_verdict, so leave yourself room to read every candidate.

Here are the candidates, listed by name and URL only — no description is provided. Research each one yourself by fetching its URL and any docs you find:

1. **MCP Apps** — https://github.com/modelcontextprotocol/ext-apps
2. **CopilotKit** — https://github.com/CopilotKit/CopilotKit
3. **Radix UI** — https://github.com/radix-ui/primitives
4. **MUI** — https://github.com/mui/material-ui
5. **Ouro UI** — https://github.com/ourostack/ouro-ui
6. **Agent-native (Builder.io)** — https://github.com/BuilderIO/agent-native
7. **React Aria and React Spectrum** — https://github.com/adobe/react-spectrum
8. **Flutter** — https://github.com/flutter/flutter
9. **shadcn/ui** — https://github.com/shadcn-ui/ui
10. **json-render** — https://github.com/vercel-labs/json-render
11. **Chakra UI** — https://github.com/chakra-ui/chakra-ui
12. **AI Elements** — https://github.com/vercel/ai-elements
13. **OpenAI Apps SDK UI** — https://github.com/openai/apps-sdk-ui
14. **Material 3 and Jetpack Compose** — https://developer.android.com/develop/ui/compose/designsystems/material3
15. **Fluent UI** — https://github.com/microsoft/fluentui
16. **SwiftUI and Apple Human Interface Guidelines** — https://developer.apple.com/documentation/swiftui
17. **Base UI** — https://github.com/mui/base-ui
18. **A2UI** — https://github.com/a2ui-project/a2ui
19. **Tamagui** — https://github.com/tamagui/tamagui
20. **Vercel UI SDK** — https://github.com/vercel-labs/ui

When you call final_verdict, be specific about architecture — not vague praise. For every candidate, explain the concrete trade-offs affecting your choice and what would address an objection, where applicable. Include links to primary sources you actually fetched. Do not substitute a guessed capability or an old default for evidence. Your final text may appear verbatim on a public website; speak in your own voice.
```

The run's tools: `search` (Search the web for information about the candidates, their architecture, source code, documentation, or any other relevant information. Use specific, targeted queries.), `fetch_url` (Read a public URL, including GitHub READMEs, directory listings, source files, and documentation. A GitHub candidate's URLs use its recorded source revision. Follow the returned startIndex to continue a long document; repeated reads use the same captured document.) and `final_verdict` (Submit your final evaluation after completing research on every candidate. Call this exactly once when you are done. Your evaluation may appear verbatim on a public website attributed to you — write it in your own voice and stand behind it.) Compare your agent's pick with the table above.

### Full: run the harness

In a clone of [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui), signed in to GitHub with Copilot (`gh auth login`), and with nothing else: search is Copilot's, and a model Copilot doesn't serve and you have no key for is skipped and recorded.

```sh
mkdir ../model-reviews-deps && (cd ../model-reviews-deps && npm i @github/copilot-sdk@1.0.13)
export OURO_MODEL_REVIEWS_SDK=$PWD/../model-reviews-deps
node scripts/model-reviews/model-reviews.mjs --preflight --inference copilot-first --output-dir ../my-review
node scripts/model-reviews/model-reviews.mjs --inference copilot-first --output-dir ../my-review
```

Your picks are in `../my-review/run.json` (`summary.picks`), each model's transcript in `transcripts/`, and they line up with the table above model by model. To publish a run beside ours, the [methodology](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/METHODOLOGY.md) says how.
