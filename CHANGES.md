# Changes in this release

- Ouro check's summary ends its floor line with where to go next: the beauty gate in the new Design craft guide (https://ui.ouroboros.bot/docs/design-craft/), which a screen, mock or capture passes before a person sees it.
- Fixed: [Skeleton's shared-wave clock correction no longer revives an animation that reduced motion, or a node leaving the wave, cancelled in the gap between its `ready` settling and the correction's write](registry/ouro/components/ouro/skeleton/skeleton-styles.ts "verify:testExists(registry/ouro/components/ouro/skeleton/skeleton.test.tsx::Skeleton > does not revive an animation that went idle between its ready settling and the clock correction's write)"), which left that animation running indefinitely instead of staying cancelled.
