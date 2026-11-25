# Changes in this release

- Changed: [Ouro check's `off-centre-text` rule tightens `fieldSlackPx` from 2.5px to 1.5px](registry/ouro/check/design-check.ts "verify:fileLine(registry/ouro/check/design-check.ts, /textSlackPx = 2.1, fieldSlackPx = 1\.5/) verify:testExists(test/field-cap-height.test.tsx::cap height: TextField, NumberField, TextArea and Composer)"): TextField, NumberField, TextArea at one row and Composer already centre their value and placeholder on their cap height within 1.5px, in Chromium and WebKit, at 100% and 200% text, with no padding change (#3529).
- Fixed: Popover no longer takes focus back when a dialog or sheet opened from inside it.
- New: `ThreadSummary` takes `alwaysShown`, which keeps its quiet unanswered Reply visible in a post instead of showing it only on hover or focus.
- Fixed: TimeGrid keeps its hour labels, now-line time and the times inside events in reading order in a right-to-left page.
