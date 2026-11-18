# Changes in this release

- Fixed: Ouro check's off-scale suggestion for a negative margin keeps its sign (`margin: -24px` now suggests `calc(var(--spacing) * -6) (-m-6)`, not `(m-6)`, which pushes the other way) ([test](test/check-token-in-page.test.ts "verify:fileLine(test/check-token-in-page.test.ts, /use calc\(var\(--spacing\) \* -6\) \(-m-6\)/)")).
