Diagnostic-only probe for ourostack/ouro-ui#3361: temporarily extends `shoot()`'s failure
message in `registry/ouro/lib/ouro/testing/axe.ts` with the failing pixel's screen
coordinates, its RGB, and the DOM stack `document.elementFromPoint` finds there, so a real
`install (shadcn, nova, 6/6)` webkit run shows what paints over the "Vegetarian" label. Not
for merge: the diagnostic lines are reverted before any real fix lands.
