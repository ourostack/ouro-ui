# Ouro Feel

Ouro Feel measures how an Ouro app feels in real use: whether the reader's message stays put when older history loads, whether a frame goes blank, and how much layout work a frame does. It runs in the engines apps ship in, with made-up data from a seed.[^seed] The design is core's decision record, [Ouro Feel](https://github.com/ourostack/ouro-ui-core/blob/main/docs/decisions/2026-11-04-ouro-feel.md).

## How it works

- **The probe** ([`probe/probe.ts`](probe/probe.ts)) is one plain script that goes first in the page, before the page's own scripts. It counts and measures, and adds `window.ouroFeel`.
- **The probe service** ([`service.mts`](service.mts)) serves the page with the probe first in its `<head>`, and drives the page over HTTP long-poll.[^service] So the runner needs nothing from whatever opened the page: a browser it launched, the bare WKWebView host, or an app's own shipped web view.
- **The WKWebView host** ([`hosts/wkwebview/main.swift`](hosts/wkwebview/main.swift)) is a window with the system's WKWebView in it. It opens a URL and pictures the page when the page asks. It knows nothing else about Ouro Feel, so it stands where an app's web view stands.
- **The cases** ([`cases.ts`](cases.ts), run by the page in [`fixture/cases/`](fixture/cases/)) set a scene, act, wait until nothing in the page changes for a while, and report.
- **The runner** ([`run.mts`](run.mts)) builds the probe and the page, opens the page in an engine, runs the cases, and judges the measures against the cases' limits.

## The measures

A count or a distance fails when any one run is over its limit. A time, whose name ends in `Ms`, is judged on the median of the runs, and the report shows their spread.[^judge]

| Measure | What it counts |
| --- | --- |
| `jumps` | Frames where the reader's row moved 100 px or more, net of the input's own movement.[^jumps] |
| `shifts` | The same, 8 px or more.[^shifts] |
| `anchorShiftPx` | The jumps added up. |
| `anchorMovePx` | How far the reader's row got from where it started, net of the input, at its farthest. |
| `jumpsStrict` | Moves of over 2 px with no input in the last 300 ms, against the wheel, or beyond the wheel's movement.[^strict] |
| `blankFrames` | Frames where none of 5 points down the list lands in a row's box, read from the rows' boxes, so a list that turns off pointer events while it scrolls still shows its rows.[^blank][^blank-boxes] |
| `blankFramesInset` | Frames with no row inside the list's view inset 40 px, or a loading placeholder in view.[^inset] |
| `deadInput` | Wheel events that moved nothing for 100 ms, away from the list's ends.[^dead] |
| `forcedLayouts` | Layout reads, such as `offsetHeight` or `getBoundingClientRect()`, made while a change to the page was still waiting to be laid out. |
| `layoutReads` | Layout reads in the case; `layoutReadsPerFrame` is the count in its busiest frame. |
| `rowsMounted` | Rows added to the page. |
| `longestFrameMs` | The longest gap between frames. |

The reader's row is the one in the middle of the list's view, followed from frame to frame. `jumps`, `shifts` and `blankFrames` follow the first app gate's definitions, under its names, so its gate reads the same numbers; `jumpsStrict` and `blankFramesInset` are its stricter options.

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

An app keeps its own cases and limits. Its probe service puts `ouro-feel-probe.js` first in the page's `<head>`, with `data-ouro-feel-bridge` naming where the page polls for commands. Its own driver sends real input from outside the page, and calls `window.ouroFeel` from its own cases. An entry in `feel-report.json` carries the value of a measure in each run, so the app can take its own medians and bands.[^runs]

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
