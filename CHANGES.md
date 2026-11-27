# Changes in this release

- Fixed: the Toaster is clamped to the window width, so at doubled text on a window just over the phone breakpoint it no longer hangs off the screen edge.
- Fixed: a toast's Undo is reachable by Tab from a modal Popover even when the app and the popup share one container, and a modal Popover marks itself with `data-ouro-modal`.
- Fixed: a toast on screen when a modal Popover or Sheet opens is no longer hidden from a screen reader, so its action button can still be reached.
- Fixed: with a modal dialog open, Tab past the dialog's last control now goes to the toasts' buttons (Undo included), and Tab past the last toast button returns to the dialog; Shift+Tab goes the other way.
- Fixed: Undo is reachable by Tab from a modal popover; the hand-over loads at the page's first focus change, outside its first load.
