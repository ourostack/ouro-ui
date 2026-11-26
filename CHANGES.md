# Changes in this release

- Fixed: the squircle corner-shape CSS no longer repeats its `--sq-clip` shape and rule set once per source file bundled into the same output chunk; a build-time Vite plugin merges same-named `@layer squircle-corners` content once per chunk, with the same selectors and visuals.
