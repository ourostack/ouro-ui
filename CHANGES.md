# Changes in this release

- llms.txt's Common needs links the ColorSchemeProvider and useColorScheme pages for dark mode.
- New: Navbar's `collapseBelow` prop sets the Tailwind breakpoint below which the links collapse behind the menu button: `sm` (the default, so nothing changes), `md`, `lg` or `xl`. The server HTML and the first paint use it too, so a bar whose links need more room than a tablet's no longer swaps for the Menu on hydration.
- Toaster: a stack that moved to the top for keyboard focus comes back to the bottom even when a toast was still sliding in as it moved; before, a busy page could leave it at the top for good.
- Changed: passing both trigger and open to Dialog, ConfirmDialog, Sheet, EditSheet, Popover or EmojiPicker is a type error that names the fix ("Pass trigger, or open and onOpenChange, not both"), where it read "not assignable to type 'undefined'". A wrapper that reads `open` from the whole props type (`DialogProps["open"]`) now gets that literal too: use `DialogControlledProps["open"]`, or narrow with `typeof open === "boolean"`.
