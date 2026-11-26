# Changes in this release

- Reverted: MessageList no longer releases the space above the first message at once when a wheel rests at `scrollTop === 0`; it reverts to releasing only once the reader has scrolled past it (#3738 reverted; reopens #3733).
- Menu: its popup keeps an edge under forced colours, where its shadow and ring vanish.
- Reverted: the calendar polish from #3743 (toolbar heights, the TimeGrid forced-colours cue and corner, the toast action touch target, the calendar demo and docs-shell layout at large text) is taken back to bring docs CSS under its ceiling; it returns within that budget. Menu keeps its forced-colours edge.
- Reverted: Composer's expand/collapse paint under a backdrop-filter (#3489) is taken back; its painted-frame e2e check kept dropping main's merge queue on a race the fix didn't hold against, and will relaunch with a reliable failing-first reproduction.
