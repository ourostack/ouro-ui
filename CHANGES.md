# Changes in this release

- Fixed: Inspector (X-ray) rounds a component's box to the whole pixel grid before drawing its outline, so a crisp frame edge lands on a pixel's centre in a consistent way instead of drifting with the layout's own subpixel position and reading differently across rendering engines.
- Fix: MessageList keeps the "Jump to latest" pill clear of a message arriving while the reader is scrolled up
