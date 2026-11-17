# Changes in this release

- Fixed: the test kit's `measureTextContrast` no longer passes text below the fold that a page held still cannot scroll onto the screen, as a popup's scroll lock can hold it: it fails as off the screen, rather than reading the pixels beside the text ([test](registry/ouro/lib/ouro/testing/axe.test.ts "verify:testExists(registry/ouro/lib/ouro/testing/axe.test.ts::audit > fails text below the fold that a page held still cannot scroll onto the screen, rather than passing it against the pixels there)")).
- Fix: Empty with variant="plain" and align="start" lines its text up with the text around it, as its docs say, rather than indenting it.
