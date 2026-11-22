# Changes in this release

- Fixed: [a corner-shape element whose corners are all flat skips the engine's forced-layout read](registry/ouro/lib/ouro/squircle/render.test.ts "verify:testExists(registry/ouro/lib/ouro/squircle/render.test.ts::readSource > skips a corner-shape element whose corners are all flat — a flat squircle is a plain rectangle)"), so a broad `corner-shape` selector that reaches past genuinely rounded elements costs press latency only on the ones it actually draws.
