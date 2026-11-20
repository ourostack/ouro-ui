# Changes in this release

- TimeGrid: a hovered event that is not busy fills with --ouro-time-grid-hover, falling back to the accent colour.
- MessageList: a hovered Jump to latest pill fills with --ouro-jump-hover, falling back to the accent colour.
- Changed: Button, Toggle, Badge, Menu items and NavigationRail read the hover and pressed tokens (`--ouro-state-*`, `--ouro-row-*`), so an app retunes them in one place and hover stays distinct from selected The rail also takes `--ouro-rail-hover` and `--ouro-rail-hover-foreground`. ([test](test/state-hovers.test.tsx "verify:testExists(test/state-hovers.test.tsx::Button's hover overlay > follows --ouro-state-hover, so one token retunes every button)")).
