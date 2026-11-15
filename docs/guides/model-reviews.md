# Which toolkit models choose

Ouro UI is not yet the models' choice: 1 of 8 models chose it; 7 chose A2UI.

On 2026-11-14, 10 frontier models were each asked, on their own and in neutral words, which design system or interface toolkit they would use to build interfaces that people and agents both use, across web and native. Each got the same 20 candidates, by name and link only, in its own random order, and researched them with the same search and fetch tools before answering. 8 models gave a verdict; Gemini 4 Carbon, MiniMax M3 gave none.

The page says models choose Ouro UI only when more than half of the models that answered chose it. Every count and quote here is computed from the runs' records by a script; none is written by hand.

Against the 2026-11-13 run, counting only the 7 models that answered both times: 2 chose Ouro UI then and 1 now. Changed: Gemini 4 Hydrogen (Ouro UI to A2UI).

## Every model's pick

| Model | Pick | Ouro UI's place in its list | Rounds | Transcript |
| --- | --- | --- | --- | --- |
| Claude Opus 5 | A2UI | 11 of 20 | 21 | [claude-opus-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/claude-opus-5.json) |
| Claude Sonnet 5.5 | A2UI | 7 of 20 | 7 | [claude-sonnet-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/claude-sonnet-5-5.json) |
| GPT-6.1 Sol | A2UI | 16 of 20 | 10 | [gpt-6-1-sol](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/gpt-6-1-sol.json) |
| GPT-6 Astra | A2UI | 8 of 20 | 23 | [gpt-6-astra](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/gpt-6-astra.json) |
| GPT-6.1 Terra | A2UI | 18 of 20 | 6 | [gpt-6-1-terra](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/gpt-6-1-terra.json) |
| Gemini 4 Hydrogen | A2UI | 5 of 20 | 6 | [gemini-4-hydrogen](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/gemini-4-hydrogen.json) |
| Grok 4.7 | A2UI | 17 of 20 | 11 | [grok-4-7](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/grok-4-7.json) |
| Claude Opus 5.5 | Ouro UI (attempt 2) | 18 of 20 | 15 | [claude-opus-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-2-no-verdict-retry/transcripts/claude-opus-5-5.json); attempt 1, no verdict: [2026-11-14-rerun--run-1](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/transcripts/claude-opus-5-5.json) |
| Gemini 4 Carbon | no verdict (Session compacted; refusing to keep a transcript with hidden replacement context; 2 attempts) | n/a | n/a | [gemini-4-carbon](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-2-no-verdict-retry/transcripts/gemini-4-carbon.json) |
| MiniMax M3 | no verdict (Session compacted; refusing to keep a transcript with hidden replacement context; 2 attempts) | n/a | n/a | [minimax-m3](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-2-no-verdict-retry/transcripts/minimax-m3.json) |

## What each model said about Ouro UI

Each model's evaluation of Ouro UI, verbatim from its verdict, with line breaks joined. A model's reasons are its own and may be wrong about a fact; its transcript shows what it read.

### Claude Opus 5, who chose A2UI

Ouro UI — The closest thing here to an answer to the literal brief, and my runner-up. It splits explicitly into Ouro HX (React components installed via the shadcn CLI, built on Base UI, reading shadcn theme variables) and Ouro AX (a conformance standard plus an "X-ray" that calls a CLI/HTTP/MCP surface from outside and checks it against claims like "ambiguous verbs don't act" and "commands other people see refuse to run without `--why`"), with a one-action model that generates CLI, MCP, WebMCP, web control, App Intent, SwiftUI button and Reins surfaces from a single declaration ([parity table](https://ui.ouroboros.bot/apple/)). It also ships `A2UISurface` and `OuroMcpApp` components, so it composes with rather than competes against the protocols. The objections are concrete and published by the project itself: the Apple half is 0.5.0 pre-1.0 with five SwiftUI components, Android and Windows are "open for a builder," and the parity table's own cells read "Not yet" for `text.reflows` on web. Adoption also appears nascent — the showcases are the author's own apps (Spoonjoy, Ouro MD). A 1.0 Apple package with component parity, and two or three third-party adopters, would move this to first place for me.

Why it chose A2UI: "A2UI treats UI as validated data, not code — and ships first-party renderers for React, Flutter, SwiftUI and Jetpack Compose from one catalog."

### Claude Sonnet 5.5, who chose A2UI

Ouro UI — It splits into HX for people and AX for agents. It has shadcn-registry React components built on Base UI, and a screen check covering accessibility and layout. Declared actions generate a CLI, MCP and WebMCP tools, plus Apple App Intents. The Apple half has not reached a stable version, Android and Windows are open for a builder, and the project is young. It is the closest philosophical match and my strong second choice. [README](https://github.com/ourostack/ouro-ui)

Why it chose A2UI: "A2UI sends agents' interfaces as schema-validated data, never code, and renders them with native components across web and mobile."

### GPT-6.1 Sol, who chose A2UI

Ouro UI — This is unusually close to a complete human-and-agent design system: Base UI-backed copy-in web controls, a SwiftUI companion, typed outcomes, and an external AX X-ray. Its one action model generates CLI, MCP, WebMCP, web controls, App Intents, SwiftUI buttons, and Reins declarations, with consent classes and CI drift checking; that is more explicit action-surface engineering than I get from A2UI alone. I did not choose it because Android and Windows kits are explicitly unimplemented and the Apple companion remains pre-1.0, not because it lacks an agent architecture. Stable native coverage beyond Apple and independently exercised end-to-end flows would address my objection; its own X-ray documentation correctly distinguishes conformance from successful task flows. [Action generation and consent](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md), [platform gaps](https://github.com/ourostack/ouro-ui/blob/main/docs/platforms/README.md), [external testing and limits](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/ax-conformance.md), [Apple status](https://github.com/ourostack/ouro-ui-apple).

Why it chose A2UI: "I’d choose A2UI for its catalog-constrained agent interface and native renderers, keeping platform conventions without handing agents arbitrary executable UI."

### GPT-6 Astra, who chose A2UI

Ouro UI — This is unusually serious about distinguishing interfaces people use from interfaces agents use. The [one action model](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md) generates CLI, MCP, WebMCP, web-control, App Intent, and SwiftUI surfaces, with consent classes and CI drift checks; [Ouro AX](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/ax.md) adds typed outcomes, receipts, postconditions, and external conformance checks. The Base UI-backed web components also have a documented [screen-reader test lane](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/screen-reader-lane.md), including candid known findings. I did not choose it because the [Apple package](https://github.com/ourostack/ouro-ui-apple) remains pre-1.0 with a narrower component set, while Android and Windows remain open platform work in the main README. Stable native parity and independent adoption evidence would substantially strengthen its case.

Why it chose A2UI: "I would choose A2UI: a catalog-constrained interface contract that gives agents structured state and operations while people use native-framework controls."

### GPT-6.1 Terra, who chose A2UI

Ouro UI — Ouro combines copy-in Base UI-based web components with an Apple SwiftUI package, and its one-action generator produces web controls, MCP tools, App Intents, and other surfaces with drift checks. That is unusually well aligned with both people and agents, but the Apple package is pre-1.0, its component set is limited, and the project identifies Android as open for a builder; broader platform coverage and parity would strengthen its case. [Ouro UI](https://github.com/ourostack/ouro-ui).

Why it chose A2UI: "I would choose A2UI for its portable, catalog-constrained approach to interfaces that agents compose and people use."

### Gemini 4 Hydrogen, who chose A2UI

Ouro UI — Ouro UI pairs human-facing copy-in components (`Ouro HX`, built on Base UI and Tailwind v4 on web, and `OuroHX` in SwiftUI on Apple) with agent-facing interfaces (`Ouro AX`) and a single TypeScript declaration model (`ouro-ui-core`) that generates CLI commands, MCP/WebMCP tools, web controls, Apple App Intents, and `OuroReins` screen-driving actions ([ourostack/ouro-ui](https://github.com/ourostack/ouro-ui), [ourostack/ouro-ui-apple](https://github.com/ourostack/ouro-ui-apple)). It also ships `OuroA2UI` to render A2UI surfaces in SwiftUI with consent-checked actions. However, its Apple package is pre-1.0 (`v0.4.x`), Android and Windows remain unbuilt ("open for a builder"), and its web layer is tied to React 19, Base UI, and Tailwind CSS v4; shipping Android/Compose and cross-framework web support would make it a universal contender.

Why it chose A2UI: "A2UI lets agents stream schema-validated, interactive interfaces that render directly as native SwiftUI, Jetpack Compose, Flutter, and web components—no WebViews required."

### Grok 4.7, who chose A2UI

Ouro UI — The strongest design-system reading of the brief, and the one I would steal policy from. People get copy-in React on Base UI; agents get `defineCommand` surfaces (CLI, `--json`, MCP, typed outcomes) checked from outside by `ax-xray`. One action declaration is meant to generate the web control, MCP and WebMCP tools, a SwiftUI `Button(intent:)`, and Reins nodes, with CI failing on drift. Apple already has `OuroHX`, `OuroAX`, `OuroReins`, and `OuroA2UI`. I did not pick it because Android and Windows are documented as unbuilt, and the platforms table shows web meeting core v0.5.0 while Apple v0.5.0 still meets core v0.4.0. An Android kit projecting that same declaration onto AppFunctions and Compose, pinned to the same core, would answer that. [Decision record](https://github.com/ourostack/ouro-ui-core/blob/main/docs/decisions/2026-11-13-agents-use-agent-interfaces.md)

Why it chose A2UI: "A2UI is the interface contract I would ship: one catalog, native widgets on web, SwiftUI, Flutter, and Compose, and no executable UI from the agent."

### Claude Opus 5.5, who chose Ouro UI

Ouro UI — My pick, and the closest fit to the brief. It's built as a 2×2 grid. Ouro HX covers people: about 100 copy-in React components on Base UI, delivered through the shadcn registry, with typed props written for agents to guess correctly, dev messages that give the exact fix, and an `ouro-check` that renders every page from 320 to 3840 px wide, in light and dark, and runs axe. Ouro AX covers agents: `ax-command` and typed outcomes for CLIs, HTTP APIs and MCP servers, plus an X-ray that calls those interfaces the way an agent would. Each half has a web and an Apple version, and both read the same tokens from ouro-ui-core. The [one action model guide](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md) generates every surface from one declaration and fails CI on drift. It also bridges to A2UI and MCP Apps (OuroMcpApp, A2UISurface). The gaps I observed: [the Apple package](https://github.com/ourostack/ouro-ui-apple) is pre-1.0 with five components, and its own parity table marks web gaps as "Not yet." Android and Windows are listed as "open for a builder." It looks like a small, single-steward project. Rendering A2UI on Android, or a 1.0 Apple release with broader component parity, would address those concerns. Main source: [README](https://github.com/ourostack/ouro-ui).

## How it was run

- Question, tools and rules: the [methodology](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/METHODOLOGY.md) and the [script](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/model-reviews.mjs). The prompt names each candidate and its link, and nothing else.
- Sources were pinned at each run's cutoff; Ouro UI was read at [`2a45b7a3`](https://github.com/ourostack/ouro-ui/tree/2a45b7a321c839537d41b0f3aca6b63d6a79b9a0).
- Runs in this review: [`2026-11-14-rerun--run-1`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-1/run.json) (cutoff 2026-11-14 11:04 UTC), [`2026-11-14-rerun--run-2-no-verdict-retry`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-14-rerun--run-2-no-verdict-retry/run.json) (cutoff 2026-11-14 11:31 UTC). A model that gave no verdict was run again with the same input, and the table links its earlier attempts; a verdict is never asked for twice.
- Inference: GitHub Copilot CLI for models in its catalog, and a model's own API for the rest (none).
- One verdict per model is a sample, not a rate. A result is about the models that ran, on that date.
- Earlier reviews, still published: 2026-11-13 (Ouro UI is not yet the models' choice: 2 of 8 models chose it; 6 chose A2UI.)
