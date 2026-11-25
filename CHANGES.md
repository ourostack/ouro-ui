# Changes in this release

- [Fix: Ouro check's near-miss rule no longer flags a floating element (fixed, sticky or absolutely positioned) paired with content scrolling under it, since that gap is wherever the scroll lands, not a design gap](test/check-layout-in-page.test.ts "verify:testExists(test/check-layout-in-page.test.ts::findLayoutIssues: near-miss > passes a floating button paired with content that scrolls under it, where the gap is wherever the scroll lands, but still finds the same two elements as static siblings apart)")
