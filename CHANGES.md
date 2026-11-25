# Changes in this release

- Changed: FamilyBar's end-fade reads a shared `ouro-fade-end`/`ouro-fade-start` utility in `ouro-base.css` instead of repeating its `mask-image` text as arbitrary-value classes, so the row fades the same but a page that links it ships less CSS.
- MessageList's action bar now fades in when it first shows and fades out when the pointer leaves, over `--ouro-duration-fast` (opacity only, so reduced motion keeps it); it stays mounted through the exit, marked `data-ending-style`, and a pointer that returns mid-exit keeps it, so an app can drop its own `@starting-style`.
- Changed: `OuroProvider` loads the squircle capsule watcher in a chunk of its own, and only where the engine lacks `corner-shape`, so an app's first load is smaller.
