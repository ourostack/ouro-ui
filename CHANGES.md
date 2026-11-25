# Changes in this release

- Fixed: Card's risen title and description opt out of Ouro check's `overlap` rule, which could fire on Linux font metrics on their own glass band over the media (#3575).
- Fixed: ListDetailPage's Back button renders its label as a single text node, so NVDA no longer drops the space in "Back to <title>".
- Fixed: Toolbar's overflow menu no longer closes itself when a loading font (or any other benign re-measure) revalidates widths while the menu is open; it only closes or changes items when the available row width truly no longer fits them.
