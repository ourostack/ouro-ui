# Changes in this release

- [Fix: Ouro check's near-miss rule no longer flags a surface against a scrolling ancestor's outer edge on an axis where scroll position alone produces the gap](test/check-layout-in-page.test.ts "verify:testExists(test/check-layout-in-page.test.ts::findLayoutIssues: near-miss > skips the container gap on an axis a nearer scrolling ancestor overflows, since where it lands is the scroll position's, not the design's, but still finds one in a container that does not scroll)")
