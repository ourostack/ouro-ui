# Which toolkit models choose

Ouro UI is not yet the models' choice: 2 of 8 models chose it; 6 chose A2UI.

On 2026-11-13, 9 frontier models were each asked, on their own and in neutral words, which design system or interface toolkit they would use to build interfaces that people and agents both use, across web and native. Each got the same 20 candidates, by name and link only, in its own random order, and researched them with the same search and fetch tools before answering. 8 models gave a verdict; Gemini 4 Carbon gave none.

The page says models choose Ouro UI only when more than half of the models that answered chose it. Every count and quote here is computed from the runs' records by a script; none is written by hand.

## Every model's pick

| Model | Pick | Ouro UI's place in its list | Rounds | Transcript |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | Ouro UI | 10 of 20 | 18 | [claude-opus-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/claude-opus-5-5.json) |
| Claude Opus 5 | A2UI | 12 of 20 | 21 | [claude-opus-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/claude-opus-5.json) |
| Claude Sonnet 5.5 | A2UI | 14 of 20 | 8 | [claude-sonnet-5-5](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/claude-sonnet-5-5.json) |
| GPT-6.1 Sol | A2UI | 3 of 20 | 9 | [gpt-6-1-sol](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/gpt-6-1-sol.json) |
| GPT-6 Astra | A2UI | 18 of 20 | 14 | [gpt-6-astra](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/gpt-6-astra.json) |
| Gemini 4 Hydrogen | Ouro UI | 7 of 20 | 7 | [gemini-4-hydrogen](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/gemini-4-hydrogen.json) |
| Grok 4.7 | A2UI | 11 of 20 | 9 | [grok-4-7](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/transcripts/grok-4-7.json) |
| Gemini 4 Carbon | no verdict (Session compacted; refusing to keep a transcript with hidden replacement context; 2 attempts) | n/a | n/a | [gemini-4-carbon](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-2-gemini-4-carbon-retry/transcripts/gemini-4-carbon.json) |
| MiniMax M3 | A2UI | 19 of 20 | 31 | [minimax-m3](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-3-minimax-m3-retry/transcripts/minimax-m3.json) |

## What each model said about Ouro UI

Each model's evaluation of Ouro UI, verbatim from its verdict, with line breaks joined. A model's reasons are its own and may be wrong about a fact; its transcript shows what it read.

### Claude Opus 5.5, who chose Ouro UI

Ouro UI — This is my pick. It has three repos. The web repo is React 19 and Base UI copied in through the shadcn registry, with more than 110 components, now on v1.3.14. Ouro UI for Apple is a Swift package with OuroHX for SwiftUI and OuroAX for App Intents. Ouro UI core holds the DTCG tokens and checks byte-for-byte that the web and Apple copies match. The agent side is designed in, not added later. According to the [README](https://github.com/ourostack/ouro-ui), `ax-command` turns one definition into a parser, `help --json`, exit codes and an MCP tool. Actions return typed outcomes (`ax-outcome`). [`ax-component`](https://github.com/ourostack/ouro-ui/blob/main/docs/ax/ax-component.md) marks each action on a component as `agent: true` or `personOnly`, links it to a CLI twin, and an X-ray checks the result. The [Apple repo](https://github.com/ourostack/ouro-ui-apple) adds an App Intents X-ray that checks 30 claims, plus Ouro Reins, which lets an agent drive a screen headlessly as state and actions. These are the gaps I can see: there's no Android or Compose support, the Apple package is v0.3.x with only Button, EmptyState, Banner, Sheet and Toast, and [core](https://github.com/ourostack/ouro-ui-core) is copyright one person. An Android target built from the same core tokens, plus more contributors, would answer the main objections.

### Claude Opus 5, who chose A2UI

Ouro UI — Explicitly scoped to this exact brief: Ouro HX is human-facing React components (Base UI under the hood, shipped as a shadcn registry), Ouro AX is the agent-facing half — `ax-command` generating a parser, `--json` output, exit codes, MCP tool schemas and one-line errors that end in `Fix: <command>` from one declaration, with an `ax-xray` conformance checker and an `ouro-check` screen auditor ([AX guide](https://ui.ouroboros.bot/docs/ax.md)). The thinking is unusually careful (the `copy.precise-failure` claim against vague error text is something I wish more toolkits had). But the GitHub API shows the repo was created 2026-10-10 with 0 stars, 0 forks, 1 subscriber and 121 open issues ([repo metadata](https://api.github.com/repos/ourostack/ouro-ui)), its native story is Swift-only on an unreleased branch, and AX governs CLI/HTTP/MCP ergonomics rather than a shared UI vocabulary. That's an observed maturity gap, not a quality judgment — demonstrated external adoption and an Android story would change my answer.

Why it chose A2UI: "A2UI is the only thing I found where one agent-side catalog renders as real SwiftUI, Jetpack Compose, Flutter and web widgets — UI as validated data, not code."

### Claude Sonnet 5.5, who chose A2UI

Ouro UI — Shadcn-registry React components built on Base UI, plus a built-page check for overlap, axe-core violations and similar issues. It has an agent-facing half called Ouro AX and an llms.txt ([README](https://github.com/ourostack/ouro-ui)). It is web only, and from the README it looks like a young project. I did not read the Ouro AX section.

Why it chose A2UI: "A2UI is my pick: agents emit schema-validated UI data, not code, and renderers for React, Flutter and SwiftUI draw it natively."

### GPT-6.1 Sol, who chose A2UI

Ouro UI — Ouro HX combines copy-in React/Base UI components with unusually concrete interaction constraints: Dialog requires a title, distinguishes controlled and trigger modes, and adapts to a draggable mobile sheet. Ouro AX separately supplies command declarations, typed outcomes, dry runs, attribution, and an external X-ray for agent-facing surfaces; this is materially more than coding-agent documentation. Its Apple offering is real, but the fetched page explicitly says release 0.2.1 contains foundations and the App Intents X-ray, with components still forthcoming and Feel/Reins unreleased. Complete native component coverage and an Android implementation would address my cross-platform objection; I would also preserve the release-pinned tests when customizing copied source. Sources: [Dialog contract](https://ui.ouroboros.bot/docs/dialog.md), [Ouro AX](https://ui.ouroboros.bot/docs/ax.md), [Apple scope and release status](https://ui.ouroboros.bot/apple/).

Why it chose A2UI: "I’d choose A2UI for its catalog-constrained agent interface and native renderers, while keeping visual design and authorization under application control."

### GPT-6 Astra, who chose A2UI

Ouro UI — Ouro’s distinction between human-facing HX and agent-facing AX is unusually concrete: the [AX kit](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/ax.md) derives CLI/MCP interfaces from command declarations and supplies typed outcomes, dry runs, receipts, and external conformance checks. The [web library](https://github.com/ourostack/ouro-ui) uses copy-in React/Base UI components, while [Ouro UI for Apple](https://github.com/ourostack/ouro-ui-apple) adds SwiftUI components, App Intents support, and shared token provenance. I would not dismiss it as web-only, but Apple remains pre-1.0 with a substantially smaller component set, and the [published platform matrix](https://github.com/ourostack/ouro-ui-core) covers web and Apple rather than Android. Broader native coverage and demonstrated parity would address my main objection; its explicit action outcomes are a pattern I would borrow regardless.

Why it chose A2UI: "I’d choose A2UI for a shared interface contract that constrains agent capabilities while letting people interact through web and native components."

### Gemini 4 Hydrogen, who chose Ouro UI

Ouro UI — Ouro UI is built explicitly around dual-audience interfaces: **Ouro HX** provides copy-in React 19 + Tailwind CSS v4 components on Base UI alongside `ouro-check` for automated browser/axe-core/layout audits, while **Ouro AX** provides `ax-command` (one declaration generating CLI parsing, `--json` output, actionable `Fix:` errors, and MCP tools), `ax-outcome`/`ax-wait`, and `ax-xray` conformance checking ([Ouro UI README](https://github.com/ourostack/ouro-ui), [Ouro AX docs](https://ui.ouroboros.bot/docs/ax.md)). On native platforms, [Ouro UI for Apple](https://github.com/ourostack/ouro-ui-apple) shares core tokens and claims for SwiftUI (`OuroHX`), App Intents (`OuroAX` and `ouro-ax-xray`), jank detection (`OuroFeel`), and headless agent screen driving (`OuroReins`). Its main trade-offs are that web targets React 19 only, native support is currently Apple-only (`ouro-ui-apple` is pre-1.0 v0.3.x) with no Android/Jetpack Compose or React Native implementation, and the copy-in registry model requires manual diff/overwrite upgrades; adding Android Compose and React Native bindings would close the cross-platform gap.

### Grok 4.7, who chose A2UI

Ouro UI — The best human-craft system in the set, and the only one that splits the brief on purpose. Ouro HX is copy-in React on Base UI and Tailwind v4, with ouro-check walking built pages from 320 to 3840 in light and dark for overlap, clipped text, and axe-core violations. Ouro AX is a separate kit for CLIs, HTTP, and MCP: one command definition becomes a parser, JSON help, and an MCP tool, and ax-xray checks claims from outside. The Apple package (0.2.1) shares tokens and an App Intents X-ray, but the Apple page says components are still in the workshop, and Feel and Reins are not in that release. There is no Android half and no shared surface an agent composes for a person. If the job were "agents operate Apple apps while people feel the springs," I would start here. It does not render one agent-authored UI across web and native. [llms.txt](https://ui.ouroboros.bot/llms.txt), [Apple](https://ui.ouroboros.bot/apple/).

Why it chose A2UI: "I would ship A2UI: one catalog, native widgets on web, SwiftUI, Compose, and Flutter, for people and agents."

### MiniMax M3, who chose A2UI

Ouro UI — The most literal "both people and agents" *design system* of the React candidates, split deliberately into Ouro HX (components for people) and Ouro AX (tools for agents: `ax-checks`, `ax-claims`, `ax-command`, `ax-cli`, `ax-component`, conformance tests). Typed props, discoverable source, explicit commands, machine-readable claims, an `llms.txt`, and `ouro-check`, which opens every page at 320–3840px in light and dark and reports overlap, sideways scroll, clipped text, axe-core violations, and design problems without relying on screenshots. The craft is excellent, but it is web-only (React + shadcn registry + Tailwind v4 + Base UI) and copy-in, so native is out of reach. [README](https://github.com/ourostack/ouro-ui).

Why it chose A2UI: "A2UI turns your design system's component catalog into the contract an agent and a human share — rendering natively on web, Flutter, SwiftUI, and Compose."

## How it was run

- Question, tools and rules: the [methodology](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/METHODOLOGY.md) and the [script](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/model-reviews.mjs). The prompt names each candidate and its link, and nothing else.
- Sources were pinned at each run's cutoff; Ouro UI was read at [`4658909e`](https://github.com/ourostack/ouro-ui/tree/4658909e120221fd2a0d274e2a7047c8781e90cb).
- Runs in this review: [`2026-11-13-baseline--run-1`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-1/run.json) (cutoff 2026-11-13 20:46 UTC), [`2026-11-13-baseline--run-2-gemini-4-carbon-retry`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-2-gemini-4-carbon-retry/run.json) (cutoff 2026-11-13 21:16 UTC), [`2026-11-13-baseline--run-3-minimax-m3-retry`](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/results/2026-11-13-baseline--run-3-minimax-m3-retry/run.json) (cutoff 2026-11-13 21:27 UTC). A model that gave no verdict was run again with the same input; a verdict is never asked for twice.
- Inference: GitHub Copilot CLI for models in its catalog, and a model's own API for the rest (MiniMax M3).
- One verdict per model is a sample, not a rate. A result is about the models that ran, on that date.
