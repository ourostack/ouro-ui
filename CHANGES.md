# Changes in this release

- New: `useFoldPosture` reads `window.visualViewport.segments`, where the Viewport Segments API reports a fold, ahead of a native host's report over the `FOLD_INPUT_EVENT` bridge.
- Fix: a whole-file quarantine entry's test file now runs only in one non-blocking job while the entry is live, so a hang in it no longer fails the blocking shards.
