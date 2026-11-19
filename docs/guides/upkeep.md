# What the native kits cost to keep in step

A shared core feeds the web, Apple, Windows and Android kits. This page measures what following the core costs them, from their git history, with the method written down so anyone can rerun it.

## The measurement

Core cut 39 releases between 3 and 19 November 2026; a release changed a median of 18.5 files and 286 lines.[^core] A kit records the core release it follows in a pin file, and its upkeep is the work it does to move that pin. The first pin of a kit is its adoption of the pin file and is left out of the files and lines columns; the pin counts include it.

```text
kit      pins  median lag  longest lag  median files  median lines  largest pin (lines)  median commits between
web      9     0.1 d       0.4 d        15.5          363           1474                 42
apple    9     0 d         0.4 d        7             92.5          4310                 9.5
windows  8     0 d         0.4 d        13            164           7376                 3
android  8     0 d         0.4 d        16            179           5330                 2
```

[^web][^apple][^windows][^android]

What the table says:

- When a kit follows a release it does so within hours of the release (the longest lag is under half a day), and its own tagged release follows within a few days.[^release]
- A pin is a modest change, a few hundred lines at the median.[^web] The largest ones are a few thousand lines and came with a core release that changed the vendored files wholesale.[^largest]
- The kits skip releases: they took a handful of pins from the releases core made, so the upkeep of a kit is a handful of pins.[^skip]
- Every kit still follows core v0.21.0, two releases behind core's latest, which was tagged hours before this was measured.[^current]

## What this does not show

- Lag is measured only for the releases a kit chose to follow, so a short lag is nearly guaranteed. It describes how quickly a kit follows, and says nothing about which releases it skips.
- A kit's release is the first tag without a pre-release suffix that contains the pin commit, so a later release that carries the pin counts.
- A pin commit's diff is the upkeep this counts. Work a kit does between pins to use what a release brought shows only as commits between pins, not as lines, and a pin commit can carry other changes, so its lines are an upper bound.
- The kits are young and were built beside the core, so the lags are short partly because one lane did the pinning. A kit run by a separate team would lag more; that is not measured here.
- It is one project, not a controlled comparison with a single shared implementation. The finding asks for that comparison; this page publishes the cost side of it.

## Rerun it

Clone core and the kits next to the web checkout, then run this from it:

```sh
node scripts/upkeep/measure.mjs --core=../core --web=. --apple=../apple \
  --windows=../windows --android=../android --out=scripts/upkeep/results.json
```

The script reads the history of a kit's pin file, takes the first commit that names a core tag, and measures the lag from the core tag's date, the files and lines that commit touched, and the commits since the previous pin. `scripts/upkeep/results.json` holds the run these numbers come from; a later run has more tags and different numbers.

[^core]: scripts/upkeep/results.json verify:count(scripts/upkeep/results.json#releases)=39
[^web]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.0.medianBumpLines)=363
[^apple]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.1.medianBumpLines)=92.5
[^windows]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.2.medianBumpLines)=164
[^android]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.3.medianBumpLines)=179
[^release]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.1.maxReleaseLagDays)=2.5
[^largest]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.2.maxBumpLines)=7376
[^skip]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.2.pins)=8
[^current]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#latestCoreTag)=v1.1.0
