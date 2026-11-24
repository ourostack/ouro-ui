# Changes in this release

- Fixed: an Ouro Current update for an app that installs a component brings the `squircleCorners()` PostCSS plugin and adds it to the app's `vite.config` or `astro.config`, so Safari keeps squircle corners; an app whose PostCSS plugins sit in a `postcss.config` file stays on its release until its build names the plugin, and the run says what to add.
