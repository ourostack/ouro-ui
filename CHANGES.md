# Changes in this release

- Menus leave focus with another control when an action has moved it there, including a confirmation dialog, instead of moving it back to the menu trigger when the menu finishes closing. Ordinary menu dismissal still restores focus to its trigger.
- NumberField steppers keep their distinct pressed background while the pointer hovers over them; hover no longer overrides the held-press color.
- Release qualification now checks unpinned GitHub installation on dispatched main CI as well as main pushes, including the CI run after preparing main for a release.
- `ouroTestProjects({ page })` now sizes every Playwright host, including touch, so Vitest 4 landscape frames receive native input without CSS scaling. The touch frame stays logically 390x844 by default; an enlarged host intentionally changes outer-window/screen metrics, not component runtime behavior.
