# Ouro Feel

Ouro Feel measures how an Ouro app feels in real use: whether the reader's message stays put when older history loads, whether a frame goes blank, and how much layout work a frame does. It runs in the engines apps ship in, with made-up data from a seed.[^seed] The design is core's decision record, [Ouro Feel](https://github.com/ourostack/ouro-ui-core/blob/main/docs/decisions/2026-11-04-ouro-feel.md).

## How it works

- **The probe** ([`probe/probe.ts`](probe/probe.ts)) is one plain script that goes first in the page, before the page's own scripts. It counts and measures, and adds `window.ouroFeel`. It asks for frames only while a case watches or waits on a paint, so a page with it loaded and nothing watched idles as it would without it,[^idle] and watching a scroll adds no layout a frame and under half a millisecond of script.[^cost] Each frame it reads the boxes of only the rows in view, not every row the list holds.[^rows-in-view]
- **The probe service** ([`service.mts`](service.mts)) serves the page with the probe first in its `<head>`, and drives the page over HTTP long-poll.[^service] A service of an app's own that answers a poll at once when it has no command gets the next poll a second later, not straight away.[^poll] So the runner needs nothing from whatever opened the page: a browser it launched, the bare WKWebView host, or an app's own shipped web view.
- **The WKWebView host** ([`hosts/wkwebview/main.swift`](hosts/wkwebview/main.swift)) is a window with the system's WKWebView in it. It opens a URL and pictures the page when the page asks. It knows nothing else about Ouro Feel, so it stands where an app's web view stands.
- **The cases** ([`cases.ts`](cases.ts), run by the page in [`fixture/cases/`](fixture/cases/)) set a scene, act, wait until nothing in the page changes for a while, and report.
- **The runner** ([`run.mts`](run.mts)) builds the probe and the page, opens the page in an engine, runs the cases, and judges the measures against the cases' limits.

## The measures

A count or a distance fails when any one run is over its limit. A time, whose name ends in `Ms`, is judged on the median of the runs, and the report shows their spread.[^judge] A measure the probe reports only when a run gives it something to measure (late frames need 30 frames, input to motion a wheel event that moved the list) is judged on the runs that reported it, and has no verdict when none did.[^occasional]

| Measure | What it counts |
| --- | --- |
| `jumps` | Frames where the reader's row moved 100 px or more, net of the input's own movement.[^jumps] |
| `shifts` | The same, 8 px or more.[^shifts] |
| `anchorShiftPx` | The jumps added up. |
| `anchorMovePx` | How far the reader's row got from where it started, net of the input, at its farthest. |
| `jumpsStrict` | Moves of over 2 px with no input in the last 300 ms, against the wheel, or beyond the wheel's movement.[^strict] |
| `blankFrames` | Frames where none of 5 points down the list lands in a row's box, read from the rows' boxes, so a list that turns off pointer events while it scrolls still shows its rows.[^blank][^blank-boxes] |
| `blankFramesInset` | Frames with no row of any height in the list's view less 40 px at its top and bottom, or a loading placeholder anywhere in view, whether the list holds rows or not, and frames with no list.[^inset][^meter-blank] |
| `deadInput` | Wheel events, away from the end of the list they turned toward, that it took 100 ms or more to move for, or never moved for.[^dead][^motion] |
| `forcedLayouts` | Layout reads, such as `offsetHeight` or `getBoundingClientRect()`, made while a change to the page was still waiting to be laid out. |
| `layoutReads` | Layout reads in the case; `layoutReadsPerFrame` is the count in its busiest frame. |
| `rowsMounted` | Rows added to the page. |
| `longestFrameMs` | The longest gap between frames. |
| `refreshMs`, `lateFrames` | The display's refresh, the median gap between frames, and the gaps of 1.5 refreshes or more.[^late] Both need at least 30 gaps, else neither is reported.[^late] |
| `longFrames`, `over16Share` | Gaps over 50 ms, and the share of gaps over 16.7 ms.[^late] |
| `inputToMotionP95Ms`, `inputToMotionMaxMs` | From a wheel event's own time to the start of the first frame whose scroll moved its way, at the 95th percentile and at most, a wheel the list never moved for counting until the last frame; `inputToMotionP95Frames` and `inputToMotionMaxFrames` count the frames, from the first after the event, and are left out once a wheel that never moved reaches them.[^motion] |
| `inputNeverMoved`, `inputAtEdge` | Wheel events the list never moved for, and those at the end of the list they turned toward, which count as neither.[^motion] |

A wheel event's movement, for `deadInput` and the input-to-motion measures, is measured from where the list was in the last frame the probe sampled, as an engine that scrolls off the main thread may have moved it before it dispatches the event.[^motion] `lateFrames`, `longFrames`, `over16Share` and the input-to-motion measures follow a chat app's frame meter's definitions, under its names.

The reader's row is the one in the middle of the list's view, followed from frame to frame by element, or by its `id` (or the attribute `watch` names in `rowId`, such as `data-message-id`) where the page draws it again as a new element.[^anchor-id] `jumps`, `shifts` and `blankFrames` follow the first app gate's definitions, under its names, so its gate reads the same numbers; `jumpsStrict` and `blankFramesInset` are its stricter options.

## The cases

| Case | Component | What happens |
| --- | --- | --- |
| `history-prepend` | MessageList | A page of 200 older messages arrives above a reader who is up in a 200-message conversation.[^prepend] |

## Running it

The runner builds what it needs, opens the page, and writes `feel-report.json`, `feel-report.md`, `feel-report.html` and a picture of the page at the end of a run to `.tmp/feel/report/`.

```sh
node feel/run.mts --engine wkwebview --runs 3   # the real engine, on a Mac
node feel/run.mts --engine webkit               # Playwright's WebKit: a quick first look
node feel/run.mts --engine chromium --case history-prepend
```

The WKWebView leg runs nightly and by hand in [the Feel workflow](../.github/workflows/feel.yml), on GitHub's standard macOS runner. Playwright's engines are a quick first look only: the real engine decides.

## Adding Ouro Feel to an app

An app keeps its own cases and limits. It takes the probe as one plain script from the registry, at a release tag:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-feel-probe#<tag>
```

That writes `scripts/ouro/feel/ouro-feel-probe.js`, the probe built from [`probe/probe.ts`](probe/probe.ts), which `pnpm registry --check` keeps the same; it runs as it is in a page, and keeps its own names out of the page's.[^built] The app puts it first in the page's `<head>`, or injects it into its web view before the page's own scripts. Served with `data-ouro-feel-bridge` on its script tag, it also polls that address for commands. `watch` takes the list as an element, or as a selector that the probe looks up again each frame, so an app that puts a new list in the old one's place (another conversation opened) is measured in the new list.[^watch-selector] Its own driver sends real input from outside the page, and calls `window.ouroFeel` from its own cases. An entry in `feel-report.json` carries the value of a measure in each run that reported it, so the app can take its own medians and bands.[^runs]

[^built]: test:scripts/registry.test.mjs::ouro-feel-probe ships the probe built as one plain script, kept the same as feel/probe/probe.ts, that a page runs as it is verify:testExists(scripts/registry.test.mjs::ouro-feel-probe ships the probe built as one plain script, kept the same as feel/probe/probe.ts, that a page runs as it is)
[^seed]: test:scripts/feel.test.mjs::Ouro Feel's data is the same for the same seed, and made up verify:testExists(scripts/feel.test.mjs::Ouro Feel's data is the same for the same seed, and made up)
[^service]: test:scripts/feel.test.mjs::Ouro Feel's probe service puts the probe first in the page's head and drives the page by long-poll, page after page verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe service puts the probe first in the page's head and drives the page by long-poll, page after page)
[^judge]: test:scripts/feel.test.mjs::Ouro Feel judges a count or distance on every run, and a time on the median of its runs verify:testExists(scripts/feel.test.mjs::Ouro Feel judges a count or distance on every run, and a time on the median of its runs)
[^jumps]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const JUMP_PX = 100;$/)
[^shifts]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const SHIFT_PX = 8;$/)
[^strict]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const STRICT_JUMP_PX = 2;$/) verify:fileLine(feel/probe/probe.ts, /^const INPUT_WINDOW_MS = 300;$/)
[^blank-boxes]: test:scripts/feel.test.mjs::Ouro Feel's probe counts a blank frame by the rows' boxes, so a list that turns off pointer events while it scrolls is not blank, and a gap is verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe counts a blank frame by the rows' boxes, so a list that turns off pointer events while it scrolls is not blank, and a gap is)
[^blank]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const BLANK_PROBES = 5;$/)
[^inset]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const BLANK_INSET_PX = 40;$/)
[^dead]: feel/probe/probe.ts verify:fileLine(feel/probe/probe.ts, /^const DEAD_INPUT_MS = 100;$/)
[^prepend]: feel/fixture/cases/history-prepend.tsx verify:fileLine(feel/fixture/cases/history-prepend.tsx, /^const LOADED = 200;$/) verify:fileLine(feel/fixture/cases/history-prepend.tsx, /^const PAGE = 200;$/)
[^runs]: test:scripts/feel.test.mjs::Ouro Feel judges a count or distance on every run, and a time on the median of its runs verify:testExists(scripts/feel.test.mjs::Ouro Feel judges a count or distance on every run, and a time on the median of its runs)
[^watch-selector]: test:scripts/feel.test.mjs::Ouro Feel's probe takes the list as a selector and finds it again each frame, so a list put in another's place is measured verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe takes the list as a selector and finds it again each frame, so a list put in another's place is measured)
[^idle]: test:scripts/feel.test.mjs::Ouro Feel's probe asks for no frames while it watches nothing and nothing waits on a paint, so a page with it loaded idles as without it verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe asks for no frames while it watches nothing and nothing waits on a paint, so a page with it loaded idles as without it)
[^rows-in-view]: scripts/feel.test.mjs; feel/probe/probe.ts verify:fileLine(scripts/feel.test.mjs, /reads only the rows in view each frame, and still follows the reader's row/) verify:fileLine(feel/probe/probe.ts, /function rowBoxes\(list: Element, rows: string, box: DOMRect\)/)
[^cost]: test:scripts/feel.test.mjs::Ouro Feel's probe, watching a scroll, adds no layout a frame and under half a millisecond of script verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe, watching a scroll, adds no layout a frame and under half a millisecond of script)
[^poll]: test:scripts/feel.test.mjs::Ouro Feel's probe waits before polling again when its bridge answers at once with no command verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe waits before polling again when its bridge answers at once with no command)
[^late]: test:scripts/feel.test.mjs::Ouro Feel's probe counts late frames against the refresh it measures, as a chat app's frame meter does, and long ones over 50 ms verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe counts late frames against the refresh it measures, as a chat app's frame meter does, and long ones over 50 ms) verify:fileLine(feel/probe/probe.ts, /^const LATE_REFRESHES = 1\.5;$/) verify:fileLine(feel/probe/probe.ts, /^const REFRESH_GAPS = 30;$/) verify:fileLine(feel/probe/probe.ts, /^const LONG_FRAME_MS = 50;$/) verify:fileLine(feel/probe/probe.ts, /^const FRAME_60HZ_MS = 16\.7;$/)
[^motion]: test:scripts/feel.test.mjs::Ouro Feel's probe times each wheel event to the first frame that moved the list its way, and counts those it never moved verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe times each wheel event to the first frame that moved the list its way, and counts those it never moved)
[^occasional]: test:scripts/feel.test.mjs::Ouro Feel judges a measure the probe reports only sometimes on the runs that reported it, and gives no verdict when none did verify:testExists(scripts/feel.test.mjs::Ouro Feel judges a measure the probe reports only sometimes on the runs that reported it, and gives no verdict when none did)
[^anchor-id]: test:scripts/feel.test.mjs::Ouro Feel's probe follows the reader's row by its id, or the attribute watch names, so a row drawn again as a new element that moved is still a jump verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe follows the reader's row by its id, or the attribute watch names, so a row drawn again as a new element that moved is still a jump)
[^meter-blank]: test:scripts/feel.test.mjs::Ouro Feel's probe counts a blank frame as a chat app's frame meter does: no row with height in the view less 40 px at its top and bottom, or a placeholder anywhere in view, rows or none verify:testExists(scripts/feel.test.mjs::Ouro Feel's probe counts a blank frame as a chat app's frame meter does: no row with height in the view less 40 px at its top and bottom, or a placeholder anywhere in view, rows or none)
