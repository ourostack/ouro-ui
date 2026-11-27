# Changes in this release

- Ouro check: the near-miss rule skips an element that floats because an ancestor below the shared container is fixed, sticky or absolute (a title pill in a fixed header over a scroller), as it already skips one that floats by its own position.
- Fixed: [The squircle capsule watcher reads stylesheets only when one is added or loads, and looks only at added nodes](registry/ouro/lib/ouro/squircle-capsules.test.ts "verify:testExists(registry/ouro/lib/ouro/squircle-capsules.test.ts::capsule measure > cost > rescans no stylesheet and no document across a burst of text edits)"), so typing in WebKit no longer rescans every rule and the whole document on each key.
