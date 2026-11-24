Some true-negative tests used the shared poll default to prove something does not happen, which took a while. One now passes a short bound for that one call site with a comment explaining why, so it proves the same thing quickly; the other does the same for its own call site.

Drops the matching stale entries from `.github/headroom.json` (tracked by #3032): in `press.touch.test.ts` and in `test/control-suite.test.tsx`.

Verified locally: the touched test files pass, `tsc --noEmit` is clean, and `eslint` is clean on the touched files.

Relates to #3032.
