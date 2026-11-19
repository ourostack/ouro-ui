# What the native kits cost to keep in step

A shared core feeds the web, Apple, Windows and Android kits. This page measures what following the core costs them, from their git history, with the method written down so anyone can rerun it.

## The measurement

Core cut 39 releases between 3 and 19 November 2026; a release changed a median of 18.5 files and 286 lines.[^core] A kit records the core release it follows in a pin file, and its upkeep is the work it does to move that pin.

```text
kit      pins  median lag  longest lag  median files  median lines  median commits between
web      9     0.1 d       0.4 d        17            432           42
apple    9     0 d         0.4 d        7             134           9.5
windows  8     0 d         0.4 d        13.5          182           3
android  8     0 d         0.4 d        16.5          194.5         2
```

What the table says:

- A kit that follows a release does it within hours, and the kit's own release follows within half a day.[^release]
- A pin is a modest change, a few hundred lines at the median.[^web]
- The kits skip releases: they took a handful of pins from the releases core made, so the upkeep of the kits is a handful of pins apiece.[^skip]

## What this does not show

- It counts the pin commit's own diff. Work a kit does between pins to use what a release brought is counted only as commits between pins, not as lines.
- A pin commit can carry other changes, so lines per pin are an upper bound.
- The kits are young and was built beside the core, so the lags are short because one lane did the pinning. A kit run by a separate team would lag more; that is not measured here.
- It is one maintained project, not a controlled comparison with a single shared implementation. The finding asks for that comparison; this page publishes the cost side of it.

## Rerun it

Clone core and the kits, then run this from the web checkout:

```sh
node scripts/upkeep/measure.mjs --core=../core --web=. --apple=../apple \
  --windows=../windows --android=../android --out=results.json
```

The script reads the history of a kit's pin file, takes the first commit that names a core tag, and measures the lag from the core tag's date, the files and lines that commit touched, and the commits since the previous pin. `scripts/upkeep/results.json` holds the run these numbers come from.

[^core]: scripts/upkeep/results.json verify:count(scripts/upkeep/results.json#releases)=39
[^web]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.0.medianBumpLines)=432
[^apple]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.1.medianBumpLines)=134
[^windows]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.2.medianBumpLines)=182
[^android]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.3.medianBumpLines)=194.5
[^skip]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.0.pins)=9
[^release]: scripts/upkeep/results.json verify:equals(scripts/upkeep/results.json#summary.1.maxReleaseLagDays)=0.5
