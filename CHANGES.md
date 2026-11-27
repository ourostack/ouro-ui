# Changes in this release

- Fixed: Ouro check's `first-paint-swap` no longer reports [a control still shown when the first input came](test/check-measure.test.ts "verify:testExists(test/check-measure.test.ts::findLoadingIssues: first-paint-swap > passes a control still shown at the first input, which left after it, and reports one gone before it)"), which left after that input, so a state reached by a press that changes the page passes.
