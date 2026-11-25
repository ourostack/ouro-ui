# Changes in this release

- NavigationMenu and Navbar: moving from one panel to another keeps one popup that resizes to the new panel while the content slides in from the side you moved towards (only fades with reduced motion); a panel item takes `fit` to be as wide as its content and `current` to mark its button, and a Navbar group takes `content` like NavigationMenu's.
- Fixed: the shared browser test setup resets the real viewport, not just media emulation, between test files, so a file that resizes the page or leaves media emulated (color scheme, reduced motion, forced colours, reduced transparency, contrast) no longer leaks that into whichever file a shard happens to run after it.
