# Changes in this release

- Fixed: a HoverCard's open card [takes the first Escape on its link](registry/ouro/components/ouro/hover-card/hover-card.test.tsx "verify:testExists(registry/ouro/components/ouro/hover-card/hover-card.test.tsx::HoverCard > takes the first Escape itself, so what holds the link sees only the next)") again, so a dialog or panel around the link stays open until the next Escape, as before v1.3.181.
