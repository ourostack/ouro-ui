# Ouro Feel

Ouro Feel measures how an Ouro app feels in real use: whether the reader's message stays put when older history loads, whether a frame goes blank, and how much layout work each frame does. It runs in the engines apps ship in, with made-up data from a seed, so every run reads the same page. The design is core's decision record, [Ouro Feel](https://github.com/ourostack/ouro-ui-core/blob/main/docs/decisions/2026-11-04-ouro-feel.md).

## How it works

- **The probe** ([`probe/probe.ts`](probe/probe.ts)) is one plain script that goes first in the page, before the page's own scripts. It counts and measures, and never reads text, so a report holds counts and timings only. It adds `window.ouroFeel`.
- **The probe service** ([`service.mts`](service.mts)) serves the page with the probe first in its `<head>`, and drives the page over HTTP long-poll. So the runner needs nothing from whatever opened the page: a browser it launched, the bare WKWebView host, or an app's own shipped web view.
- **The WKWebView host** ([`hosts/wkwebview/main.swift`](hosts/wkwebview/main.swift)) is a window with the system's WKWebView in it. It opens a URL and pictures the page when the page asks. It knows nothing else about Ouro Feel, so it stands where an app's web view stands.
- **The cases** ([`cases.ts`](cases.ts), run by the page in [`fixture/cases/`](fixture/cases/)) set a scene, act, wait until nothing changes for 30 frames, and report. Their data comes from [`data/seed.ts`](data/seed.ts).
- **The runner** ([`run.mts`](run.mts)) builds the probe and the page, opens the page in an engine, runs each case, and judges the measures against the case's limits.

## The measures

Counts and distances are judged on every run: one run over the limit fails. Times, whose names end in `Ms`, are judged on the median of the runs, and the report shows their spread.

| Measure | What it counts |
| --- | --- |
| `jumps` | Frames where the reader's row moved 100 px or more, net of the input's own movement. |
| `shifts` | The same, 8 px or more. |
| `anchorShiftPx` | The jumps added up. |
| `anchorMovePx` | The most the reader's row ever moved from where it started, net of the input. |
| `jumpsStrict` | Moves of over 2 px with no input in the last 300 ms, against the wheel, or beyond the wheel's movement. |
| `blankFrames` | Frames where none of 5 points down the list lands on a row. |
| `blankFramesInset` | Frames with no row inside the list's view inset 40 px, or a loading placeholder in view. |
| `deadInput` | Wheel events that moved nothing for 100 ms, away from the list's ends. |
| `forcedLayouts` | Layout reads, such as `offsetHeight` or `getBoundingClientRect()`, made while a change to the page was still waiting to be laid out. |
| `layoutReads` | Layout reads in all, and `layoutReadsPerFrame` the most in one frame. |
| `rowsMounted` | Rows added to the page. |
| `longestFrameMs` | The longest gap between two frames. |

The reader's row is the one in the middle of the list's view, followed from frame to frame. `jumps`, `shifts` and `blankFrames` follow the first app gate's definitions, under its names, so its gate reads the same numbers; `jumpsStrict` and `blankFramesInset` are its stricter options.

## The cases

| Case | Component | What happens |
| --- | --- | --- |
| `history-prepend` | MessageList | A page of 200 older messages arrives above a reader who is up in a 200-message conversation. |

## Running it

The runner builds what it needs, opens the page, and writes `feel-report.json`, `feel-report.md`, `feel-report.html` and a picture of each run's last frame to `.tmp/feel/report/`.

```sh
node feel/run.mts --engine wkwebview --runs 3   # the real engine, on a Mac
node feel/run.mts --engine webkit               # Playwright's WebKit: a quick first look
node feel/run.mts --engine chromium --case history-prepend
```

The WKWebView leg runs nightly and by hand in [the Feel workflow](../.github/workflows/feel.yml), on GitHub's standard macOS runner. Playwright's engines are a quick first look only: the real engine decides.

## Adding Ouro Feel to an app

An app keeps its own cases and limits. Its probe service puts `ouro-feel-probe.js` first in the page's `<head>`, with `data-ouro-feel-bridge` naming where the page polls for commands. Its own driver sends real input from outside the page, and calls `window.ouroFeel` from its own cases. Each entry in `feel-report.json` carries every run's value, so the app can take its own medians and bands.
