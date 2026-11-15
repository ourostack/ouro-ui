# Changes in this release

- Fix: Toolbar [mounts without laying the page out](test/mount-reads.test.tsx "verify:testExists(test/mount-reads.test.tsx::mounting a docs demo > reads no layout: %s)"): its roving focus is its own rather than Base UI's composite, which read each item's style as it registered, and it measures its row in the resize observer's first report, before the first paint, rather than in the commit.
- Fix: Toolbar's arrow keys [follow the text in a right-to-left page](registry/ouro/components/ouro/toolbar/toolbar.test.tsx "verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar > brings Tab back to the control focus was last in, and moves the way the text runs in a right-to-left page)"): ArrowLeft moves to the next control there.
