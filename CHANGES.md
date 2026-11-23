# Changes in this release

- New: [a fixed `--ouro-ease-bounce` easing curve and `--ouro-duration-bounce` (650ms)](registry/ouro/theme/ouro-base.css "verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-duration-bounce: 650ms/)"), for one thing that should feel bouncy, under the `--ouro-` prefix, not a revival of the retiring `--ouro-ease-spring`/`--ouro-spring-duration`.
- Fix: ConversationList's bordered-container stories drop their own edge under forced colours, so the list's own frame no longer doubles.
- Fixed: [TimeGrid no longer fades its sticky day header when scrolled; only the bottom edge fades](registry/ouro/components/ouro/time-grid/time-grid.test.tsx "verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > never fades its day header: scrolled down, only the bottom edge fades)").
