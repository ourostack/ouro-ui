## command-palette, shadcn/ui: 90/100

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

Screenshots, as evidence only: 8 in score/screenshots.
