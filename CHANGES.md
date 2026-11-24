# Changes in this release

- New: [`titleSize="inherit"` on Card](registry/ouro/components/ouro/card/card.test.tsx "verify:testExists(registry/ouro/components/ouro/card/card.test.tsx::Card > sizes the title from the surrounding text with titleSize=\"inherit\", staying semibold)") sizes the title from the surrounding text instead of its own type-scale step, staying semibold, for a link preview drawn as a card inside a chat bubble; `Heading` takes the same `size="inherit"` directly.
- Changed: MediaTile's Pin toggle is named for the person ("Pin Mara Lind"), and on a touch screen it rests quieter, reaching full strength while focus is in the tile or it is pinned.
