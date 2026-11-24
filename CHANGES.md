# Changes in this release

- New: `<Badge count>` draws a toolbar count, a small round pill in the theme's `--ouro-count` red with white tabular figures centred on their cap height, and `overlay` places it at the corner of an icon button by `--ouro-count-x` and `--ouro-count-y`.
- Fixed: [TimeGrid's all-day row keeps its last event at least the minimum gap below the sticky day header](registry/ouro/components/ouro/time-grid/time-grid.tsx "verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /lanes \* 1\.5 \+ 1\.25/)"), so the German, Japanese and Arabic locale stories no longer trip Ouro check's `near-miss` rule there.
- Fixed: TimeGrid keeps its day-long events a step in from the header and column edges.
- Fixed: TimeGrid stacks a day's number over its weekday name in a narrower column, so a week header no longer cuts a weekday name short.
