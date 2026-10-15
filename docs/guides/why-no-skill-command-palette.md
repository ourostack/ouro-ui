# Comparison results: command-palette

[Comparison overview, scores, protocol and limits](why-no-skill.md)

All nine command-palette builds from the 2026-10-15 cohort follow unchanged: three arms, three runs each. These checks grade the resulting apps, not operational safety, complete accessibility or physical-device VoiceOver behavior. Read the overview's protocol notes and limits before comparing scores.

## Every run and check

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
