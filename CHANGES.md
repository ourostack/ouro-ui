# Changes in this release

- MessageList's phone test waits for its current fonts before checking bottom-position stability; its strict scrolling assertions and runtime behavior are unchanged.
- Popover's installed placement tests own an integral-height surface, keeping exact edge assertions meaningful across consumer themes without changing runtime positioning, animation or pixel tolerances.
- Toaster accepts a layout-only className on its portaled viewport, so apps can set bottom clearance and width at every breakpoint without changing toast appearance, announcements or gestures.
