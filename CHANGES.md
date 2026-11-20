# Changes in this release

- Fixed: Card's backdrop styles itself inline, so an app whose cards have no backdrop compiles none of its CSS, and a linked card with a backdrop still tints on hover and press ([test](registry/ouro/components/ouro/card/card.test.tsx "verify:testExists(registry/ouro/components/ouro/card/card.test.tsx::Card > deepens a linked backdrop card's tint while its link is pressed, never for a touch, and clears it when the pointer leaves)")).
