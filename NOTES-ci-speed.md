# Browser/e2e flake probe (browser-flakes worktree) — untracked, never commit

Recreated 22:15 PDT 31 Oct: the worktree was removed between sessions and the untracked notes went with it. The original flake table (369 runs from 28 Oct 12:00Z) is in the session files: flakes/failures.json, failed-jobs.json.

## Owned elsewhere (don't touch)
- announce.test.ts: polish media lane (#305). inspector-toaster: #285. voyage.test.tsx axe presets: #298.
- voyage.spec reflow 320 / `html[data-site-ready]` never set: island loader lane (#306).
- chapter-three.spec click timeouts: #302 / #307. catalog.spec JS ceiling: bundle budget.

## Root causes and PRs
- SwipeActions touch: event-loop stalls > long-press delay. #309 (merged).
- Command touch closing: read after keyboard returned. #310.
- TimeGrid/Day contrast: resting real mouse + WebKit synthetic mousemove. #323 (merged, parkPointer).
- Chapter III menu keys: activeElement read before the menu moved focus. #325.
- Lightbox double-tap: needs single-command double tap (polish session). Inspector "leaves every line", Gallery Sheet: heavy, not races. Latency p95: runner noise (#298).
- Chapter I sign (WebKit): field message removed between pointerdown and pointerup, Sign moves 28 px, click lands on div.grid. Traced on main in probe 41255376671 (main 2/480 incl. 1 traced miss; #331 spec 0/480); 41257007477 main 1/720 (site-ready family). Fix: #331 (other checkout).
- Dive "ends early on a click" (site Chromium): `userEvent.click(element)` -> selector from text `Splash!0 fathoms`, gauge changes after 600 ms. Fix #338; probe 41259845164 before 5/5 fail, after 5/5 + 5/5. Other mode (41212521537, toast over second "Ready to dive?") open.
- Calendar range preview (WebKit, line 382; rehearsal 41270773113 job 124742913188, also 41146955937, 41078784098): read right after userEvent.hover; React renders pointerenter updates (continuous priority) in a later task. Probe 41274524053 (750 hovers, burners + crowd): commit never in the enter task (0/750), enter->render up to 84 ms, render->read margin min 0 ms, 0 misses. Not a resting mouse (mouse is on the 14th from the click), not ordering. Fix #355: poll the preview in both range hover tests.

## Branches
- Probe branches deleted: probe/sign, probe/sign-main, probe/dive-click, probe/calendar-range.
- fix/chapter-one-sign-settle (predecessor, no PR) superseded by #331; still on the remote.
