## recipe-list, shadcn/ui: 85.71/100

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

Screenshots, as evidence only: 8 in score/screenshots.
