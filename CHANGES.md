# Changes in this release

- Fixed: `squircleCorners()` no longer emits a duplicate `@supports` fallback sibling rule per matching selector; rules in the same context with identical computed radii now share one combined-selector fallback, cutting duplicated CSS.
- New: TimeGrid's drag preview names its range, such as "10:00 AM – 12:30 PM", while a slot is dragged.
- Fixed: TimeGrid's keyboard slot cursor stays on its slot when focus leaves the grid and returns, as after a dialog closes, instead of starting over at the current time.
