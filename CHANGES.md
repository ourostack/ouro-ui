# Changes in this release

- Changed: the Apple pages and the Platforms pages [name Apple's 1.9.0](site/src/apple/kit.json "verify:equals(site/src/apple/kit.json#release)=1.9.0"), and the parity table lists [each view a Swift file declares](scripts/parity-matrix.test.mjs "verify:fileLine(scripts/parity-matrix.test.mjs, /counts each, and not its support types/)"), so `OuroSkeleton`, `OuroSpinner` and `OuroProgress` all show.
- Fixed: Avatar tiles are lighter on a dark page, so they stand off the background.
- Fixed: the coverage merge now fails loudly, naming the shard and file, when a shard's own coverage-final.json instruments a file more than once (the same source location under different keys), instead of silently merging it into a misleading short percentage.
