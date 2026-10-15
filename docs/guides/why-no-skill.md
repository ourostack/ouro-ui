# Why Ouro HX needs no skill

Ouro HX puts component guidance in the source an agent already reads: required props, compiler hints and development messages. No Ouro-specific skill is required; that is a design choice, not a promise that every agent will build every screen correctly.

## Guidance at the point of use

| What an agent needs to learn | Where Ouro HX puts it |
| --- | --- |
| A field needs an accessible name; a dialog needs a title. | Required `label`, `legend` and `title` props make omission a type error. Visual hiding keeps the accessible name. |
| Which prop expresses a state. | Hint types name the supported prop when an agent guesses another: `loading`, not `isLoading`; `error`, not `errorMessage`. |
| How to compose and use the component. | Exported types carry JSDoc, examples and guidance about alternatives. Higher-level patterns such as `ConfirmDialog` and `EditSheet` own the interaction. |
| What went wrong at runtime. | Development messages identify the component, explain the misuse and show a concrete fix. Production builds strip those messages. |
| How to style without breaking the shared design. | Named `tone`, `variant` and `size` options use theme tokens; appearance-class warnings distinguish styling from layout. |

These contracts do not replace application logic. For example, repeated server errors still need the actual accepted answer through `formErrors`; the library does not infer request ownership from a submit counter or a rebuilt error object. See [Forms](forms.md).

## Skills solve a broader problem

The [official shadcn/ui skill](https://ui.shadcn.com/docs/skills.md) supplies project context, CLI guidance, composition patterns, theming, registry authoring and MCP discovery. Those are useful capabilities, not redundant work. HX's narrower choice is to keep component-specific contracts beside the installed component, so an agent can encounter them without loading a separate HX skill. Agents may still need project instructions, documentation and tools.

## The comparison

This is the 2026-10-15 cohort: five screens, three arms and three fresh agent processes per arm and screen, for 45 builds. The arms are shadcn/ui, shadcn/ui with its official skill, and Ouro HX without a skill. The recorded model, effort, tool versions, installed sources and baseline findings follow the scores.

The same frozen checks judge every arm: types, lint, WCAG A/AA scans and behavior. The arm's original configuration is restored before scoring; existing baseline findings cost nothing. A screen that does nothing, does not build or changes the backend stand-in scores zero. Screenshots are evidence, not points. The per-run results below include every behavior and accessibility check, not just the totals.

The protocol notes are part of the result. The formula grades the resulting apps, not operational safety or adherence to workspace instructions. Shared-host interference, additional tool-reported model usage and tool-version gaps disclosed in those notes limit how these numbers can be interpreted.

The [committed cohort source and per-run evidence](https://github.com/ourostack/ouro-ui/tree/main/scripts/agent-usability/runs/2026-10-15) accompany the [runbook](https://github.com/ourostack/ouro-ui/blob/main/scripts/agent-usability/README.md).

- Model: `claude-opus-5-5`, verified as the primary model in initialization and assistant messages for all 45 processes.
- Effort: `high` for every process.
- Agent: Claude Code `2.1.299`, started with the frozen runbook command, safe mode, bypass permissions, no session persistence and streaming JSON. The first `opus` request resolved to the same exact model; the other 44 requested its exact identifier.
- Web access: yes, for every arm.
- Skill read by every skill-arm agent: yes, 15/15, verified from successful tool results containing the original skill material, including Bash reads and read continuations, not prompt-string matches.
- shadcn CLI the skill-arm agents ran: `npx shadcn@latest`. Exact resolved versions were not retained per invocation. The pinned baseline installation versions are recorded separately in each arm manifest; this gap limits reproducibility.
- Anything that went wrong: this is an exploratory shared-host cohort, not a fully isolated causal ranking. All 45 agents issued outside-workspace scratch-write commands despite the workspace-only instruction. Five runs reported port conflicts, and 46 pairs of overlapping runs referenced a shared scratch path or fixed port. Forty-two runs issued name-based process-cleanup commands. These instruction and isolation problems are disclosed rather than repaired, excluded or converted into new scoring rules.
- Additional reported model usage: the CLI reported `claude-haiku-5-5` usage in ten runs, nine Ouro HX runs and one skill-arm run. All exposed primary assistant messages remained Opus 5.5; no exposed Task or Agent delegation calls were observed. The role of the additional reported usage is unverified.
- Concurrency: at most six fresh processes in total, with a measured peak of six. Every app started from its arm's one original baseline, outside Git, without inherited project instructions, hooks, plugins or MCP context.
- Retries and assistance: no process was replaced or retried, and no agent received controller corrections or extra library guidance. Agent-generated source was collected unchanged. All 45 CLI processes exited zero; that is not a passing UI score.
- Scoring: every resulting app is judged by the same frozen formula and checks in isolated Linux CI. Agent configuration changes are restored from the original arm record, and changed backend stand-ins receive the existing zero-score treatment. No local agent self-check is used as an official score. The formula does not grade operational safety or workspace-instruction adherence.
- Baseline qualification: all three known-good preflights scored 100 before generation. Stock and skill arms used [run 38692141733](https://github.com/ourostack/ouro-ui/actions/runs/38692141733); Ouro HX used [run 38698901537](https://github.com/ourostack/ouro-ui/actions/runs/38698901537).
- Ouro HX input: the actual published `v0.8.0` tag, commit `7a293a703427a7f7c4a9d946d14ad911a9d63faa`. Public docs, README and all 205 live namespace items were qualified before the first process. No public release input changed during generation.
- Evidence: [protocol metadata and frozen source hashes](https://github.com/ourostack/ouro-ui/blob/main/scripts/agent-usability/runs/2026-10-15/protocol.json) accompany the committed app sources and per-run CI evidence. Raw transcripts remain private because they include host paths and tool output.

Each cell lists the score of each of the 3 runs, out of 100, and their median.

| Screen | shadcn/ui | shadcn/ui with its skill | Ouro HX |
| --- | --- | --- | --- |
| settings-form | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| recipe-list | 100, 85.71, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| command-palette | 90, 90, 90 (median 90) | 90, 100, 100 (median 100) | 100, 90, 100 (median 100) |
| confirm-delete | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| app-shell | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) | 100, 100, 100 (median 100) |
| Mean of the five medians | 98 | 100 | 100 |

Mean points per part over all 15 runs of an arm:

| Arm | typecheck (of 20) | lint (of 10) | axe (of 20) | behavior (of 50) |
| --- | ---: | ---: | ---: | ---: |
| shadcn/ui | 20 | 10 | 18 | 49.05 |
| shadcn/ui with its skill | 20 | 10 | 19.33 | 50 |
| Ouro HX | 20 | 10 | 19.33 | 50 |

| Pinned | shadcn/ui | shadcn/ui with its skill | Ouro HX |
| --- | --- | --- | --- |
| Arm made | 2026-10-15 | 2026-10-15 | 2026-10-15 |
| shadcn CLI | 4.21.1 | 4.21.1 | 4.21.1 |
| Ouro HX release | none | none | v0.8.0 |
| Skill | none | shadcn-ui/ui@993eb2c31519, content da388f632cd8 | none |
| llms.txt (sha256) | 7abce6a2d2d3 | 7abce6a2d2d3 | 7ac2df10726d |
| Installed files (count) | 81 | 82 | 160 |
| react | 19.3.0 | 19.3.0 | 19.3.0 |
| @base-ui/react | 1.8.0 | 1.8.0 | 1.8.0 |
| tailwindcss | 4.3.3 | 4.3.3 | 4.3.3 |
| typescript | 6.0.3 | 6.0.3 | 6.0.3 |
| vite | 8.3.3 | 8.3.3 | 8.3.3 |
| oxlint | 1.86.0 | 1.86.0 | 1.86.0 |
| Type errors before the agent ran | 1 | 1 | 0 |
| Lint errors before the agent ran | 0 | 0 | 0 |

Scored by harness commit 4bedf56c3fcf, axe-core 4.13.0, Chromium 153.0.8010.12, formula 4 (scripts/agent-usability/formula.mts).


## Limits of this comparison

The five screens come from Ouro HX's own catalog plan, not an independently sampled benchmark. shadcn/ui ships no swipe row, which matters for the recipe-list task. Three runs per cell and one primary model/effort setting are a small sample, not a claim about every agent or application. Read the individual failures, protocol notes and baseline counts before comparing medians.

Automated checks cover the named states at phone and desktop sizes, in light and dark themes. They do not establish visual preference, complete accessibility or physical-device VoiceOver behavior. Nothing in these results defines or evaluates Ouro AX, whose product scope remains undecided.

## Every run and check

### settings-form, shadcn/ui, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/settings-form/1/score/screenshots.

### settings-form, shadcn/ui, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/settings-form/2/score/screenshots.

### settings-form, shadcn/ui, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/settings-form/3/score/screenshots.

### recipe-list, shadcn/ui, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/recipe-list/1/score/screenshots.

### recipe-list, shadcn/ui, run 2: 85.71/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn | 85.71 | 20/20 | 10/10 | 20/20 | 35.71/50 |

- behavior swipe-reveals-actions: swiping left reveals Delete (-7.14)
- behavior swipe-delete: swiping left reveals Delete (-7.14)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | **fail** |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | **fail** |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/recipe-list/2/score/screenshots.

### recipe-list, shadcn/ui, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/recipe-list/3/score/screenshots.

### command-palette, shadcn/ui, run 1: 90/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn | 90 | 20/20 | 10/10 | 10/20 | 50/50 |

- axe 390px light: color-contrast in initial (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)
- axe 1280px light: color-contrast in initial (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | **fail** |
| 390px dark | pass |
| 1280px light | **fail** |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/command-palette/1/score/screenshots.

### command-palette, shadcn/ui, run 2: 90/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn | 90 | 20/20 | 10/10 | 10/20 | 50/50 |

- axe 390px light: color-contrast in initial (.ml-1 > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (.ml-1 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)
- axe 1280px light: color-contrast in initial (.ml-1 > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (.ml-1 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | **fail** |
| 390px dark | pass |
| 1280px light | **fail** |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/command-palette/2/score/screenshots.

### command-palette, shadcn/ui, run 3: 90/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn | 90 | 20/20 | 10/10 | 10/20 | 50/50 |

- axe 390px light: color-contrast in initial (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), p > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)
- axe 1280px light: color-contrast in initial (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), p > .pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (kbd[data-slot="kbd-group"] > .pointer-events-none.h-5.w-fit:nth-child(1), .mt-2 > .pointer-events-none.h-5.w-fit:nth-child(1)) (-5)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | **fail** |
| 390px dark | pass |
| 1280px light | **fail** |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/command-palette/3/score/screenshots.

### confirm-delete, shadcn/ui, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/confirm-delete/1/score/screenshots.

### confirm-delete, shadcn/ui, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/confirm-delete/2/score/screenshots.

### confirm-delete, shadcn/ui, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn/confirm-delete/3/score/screenshots.

### app-shell, shadcn/ui, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn/app-shell/1/score/screenshots.

### app-shell, shadcn/ui, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn/app-shell/2/score/screenshots.

### app-shell, shadcn/ui, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn/app-shell/3/score/screenshots.

### settings-form, shadcn/ui with its skill, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/settings-form/1/score/screenshots.

### settings-form, shadcn/ui with its skill, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/settings-form/2/score/screenshots.

### settings-form, shadcn/ui with its skill, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/settings-form/3/score/screenshots.

### recipe-list, shadcn/ui with its skill, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/recipe-list/1/score/screenshots.

### recipe-list, shadcn/ui with its skill, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/recipe-list/2/score/screenshots.

### recipe-list, shadcn/ui with its skill, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/recipe-list/3/score/screenshots.

### command-palette, shadcn/ui with its skill, run 1: 90/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn-skill | 90 | 20/20 | 10/10 | 10/20 | 50/50 |

- axe 390px light: color-contrast in initial (.pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (.pointer-events-none.h-5.w-fit:nth-child(1)) (-5)
- axe 1280px light: color-contrast in initial (.pointer-events-none.h-5.w-fit:nth-child(1)); color-contrast in palette-open (.pointer-events-none.h-5.w-fit:nth-child(1)) (-5)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | **fail** |
| 390px dark | pass |
| 1280px light | **fail** |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/command-palette/1/score/screenshots.

### command-palette, shadcn/ui with its skill, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/command-palette/2/score/screenshots.

### command-palette, shadcn/ui with its skill, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/command-palette/3/score/screenshots.

### confirm-delete, shadcn/ui with its skill, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/confirm-delete/1/score/screenshots.

### confirm-delete, shadcn/ui with its skill, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/confirm-delete/2/score/screenshots.

### confirm-delete, shadcn/ui with its skill, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/confirm-delete/3/score/screenshots.

### app-shell, shadcn/ui with its skill, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/app-shell/1/score/screenshots.

### app-shell, shadcn/ui with its skill, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/app-shell/2/score/screenshots.

### app-shell, shadcn/ui with its skill, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | shadcn-skill | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in initial.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/shadcn-skill/app-shell/3/score/screenshots.

### settings-form, Ouro HX, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/settings-form/1/score/screenshots.

### settings-form, Ouro HX, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/settings-form/2/score/screenshots.

### settings-form, Ouro HX, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| settings-form | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The six fields have visible labels, come in order, show the loaded settings, and Bio has its hint | 1 | desktop | pass |
| While saving, the button is disabled or marked busy and the form can't be sent again by click or Enter | 2 | desktop | pass |
| A server error shows under its field, marks it invalid, is read with it, and focus moves there | 3 | desktop | pass |
| With two errors, each shows on its field and focus moves to the first | 3 | desktop | pass |
| Correcting the field and saving again clears its error | 4 | desktop | pass |
| "Settings saved" appears in a live region after a successful save | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/settings-form/3/score/screenshots.

### recipe-list, Ouro HX, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/recipe-list/1/score/screenshots.

### recipe-list, Ouro HX, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/recipe-list/2/score/screenshots.

### recipe-list, Ouro HX, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| recipe-list | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.
axe-core's best-practice findings, which cost nothing: region in actions-menu-open.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| The first page shows the first 10 recipes with their time and servings | 1 | desktop | pass |
| Pagination marks the current page, moves between pages, and disables Previous and Next at the ends | 2 | desktop | pass |
| Swiping a row left reveals Archive and Delete, and swiping back hides them | 3 | phone | pass |
| Tapping the revealed Delete deletes the recipe, removes the row and announces it | 3, 5 | phone | pass |
| "Actions for <title>" opens a menu by keyboard whose Archive archives the recipe and announces it | 4, 5 | desktop | pass |
| The actions menu works with the keyboard alone: arrow to Delete, press Enter | 4, 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/recipe-list/3/score/screenshots.

### command-palette, Ouro HX, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/command-palette/1/score/screenshots.

### command-palette, Ouro HX, run 2: 90/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | ouro | 90 | 20/20 | 10/10 | 10/20 | 50/50 |

- axe 1280px light: scrollable-region-focusable in palette-open (.h-\[min\(22rem\,60dvh\)\]) (-5)
- axe 1280px dark: scrollable-region-focusable in palette-open (.h-\[min\(22rem\,60dvh\)\]) (-5)

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | **fail** |
| 1280px dark | **fail** |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/command-palette/2/score/screenshots.

### command-palette, Ouro HX, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| command-palette | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| "Search commands" opens a modal dialog titled "Command palette" with the search field focused | 1, 2 | desktop | pass |
| Ctrl+K and ⌘K open the palette | 1 | desktop | pass |
| Typing filters by label ignoring case, hides empty groups, and says when nothing matches | 3 | desktop | pass |
| The first match is highlighted; Down then Enter runs the second, closes the palette and shows it | 4, 5 | desktop | pass |
| Clicking a command runs it | 4, 5 | desktop | pass |
| Escape closes the palette without running anything and focus returns to the button | 6 | desktop | pass |
| At 390px wide the page does not scroll sideways | 7 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/command-palette/3/score/screenshots.

### confirm-delete, Ouro HX, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/confirm-delete/1/score/screenshots.

### confirm-delete, Ouro HX, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/confirm-delete/2/score/screenshots.

### confirm-delete, Ouro HX, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| confirm-delete | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| Each cookbook shows its recipe count, and "Delete <name>" opens a dialog titled "Delete <name>?" with Cancel and Delete cookbook | 1, 2 | desktop | pass |
| Focus starts on Cancel | 3 | desktop | pass |
| Escape and Cancel close the dialog without deleting, and focus returns to the button that opened it | 3 | desktop | pass |
| Delete cookbook deletes once, is disabled or marked busy meanwhile, closes, removes the cookbook and announces it | 4 | desktop | pass |
| When the server refuses, its message shows in the dialog, which stays open, and the cookbook stays | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 8 in scripts/agent-usability/runs/2026-10-15/ouro/confirm-delete/3/score/screenshots.

### app-shell, Ouro HX, run 1: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/ouro/app-shell/1/score/screenshots.

### app-shell, Ouro HX, run 2: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/ouro/app-shell/2/score/screenshots.

### app-shell, Ouro HX, run 3: 100/100

| Screen | Arm | Score | Typecheck | Lint | Axe | Behavior |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| app-shell | ouro | 100 | 20/20 | 10/10 | 20/20 | 50/50 |

Every check passed.

Problems the app had before the agent ran, which cost nothing: 0 type errors, 0 lint errors.

| Behavior check | Acceptance items | Viewport | Result |
| --- | --- | --- | --- |
| At 1280px a navigation landmark labelled "Main" lists the five pages, and the one main landmark has the page as its level 1 heading | 1 | desktop | pass |
| Following a link shows its page, marks the link current, and survives a reload | 2 | desktop | pass |
| At 390px the column is folded behind Open navigation, and choosing a page closes it | 3 | phone | pass |
| Escape closes the navigation on a phone and focus returns to Open navigation | 3 | phone | pass |
| The column shows the user's name and email, and Sign out calls signOut() | 4 | desktop | pass |
| "Skip to content" is the first Tab stop and moves focus to the main area | 5 | desktop | pass |
| At 390px wide the page does not scroll sideways | 6 | phone | pass |

| Axe | Result |
| --- | --- |
| 390px light | pass |
| 390px dark | pass |
| 1280px light | pass |
| 1280px dark | pass |

Screenshots, as evidence only: 6 in scripts/agent-usability/runs/2026-10-15/ouro/app-shell/3/score/screenshots.
