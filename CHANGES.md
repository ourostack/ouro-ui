# Changes in this release

- New: [`scripts/mirror/mirror.mjs` mirrors Ouro HX's registry at a release tag into a company's own shadcn namespace](scripts/mirror/mirror.test.mjs "verify:testExists(scripts/mirror/mirror.test.mjs::a mirror points every dependency on an item of this repository at the company's namespace, and keeps any other)"), recording each item's source tag and hash, so one reviewed pull request on the mirror moves every team.
