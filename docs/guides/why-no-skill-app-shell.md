# Comparison results: app-shell

[Comparison overview, scores, protocol and limits](why-no-skill.md)

All nine app-shell builds from the 2026-10-15 cohort follow unchanged: three arms, three runs each. These checks grade the resulting apps, not operational safety, complete accessibility or physical-device VoiceOver behavior. Read the overview's protocol notes and limits before comparing scores.

## Every run and check

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
