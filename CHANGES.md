# Changes in this release

- Fixed: Avatar's outer box, which paints the square tile's peeking edge and the circle's ring, drew plain round corners around a squircle in engines that draw corner-shape; it now takes the surface's own squircle radius there.
- Fixed: [Command's recents chips share the row fairly](registry/ouro/components/ouro/command/command.recents.test.tsx "verify:testExists(registry/ouro/components/ouro/command/command.recents.test.tsx::Command recents > shares the row fairly: a chip is as wide as its name up to an equal share of what the shorter ones leave, and only the longest names are cut)"), each as wide as its name up to an equal share of what the shorter ones leave, so only the longest names are cut instead of every chip being squeezed or the row scrolling.
