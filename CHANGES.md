# Changes in this release

- Fixed: [a Switch with a hidden label drops the gap it kept for the label](registry/ouro/components/ouro/switch/switch.test.tsx "verify:testExists(registry/ouro/components/ouro/switch/switch.test.tsx::Switch in a row > with a hidden label is as wide as its track, so it lines up with the end of a row)"), so it lines up with the end of a row.
- Fixed: [Switch takes `aria-describedby` and merges it with its own description](registry/ouro/components/ouro/switch/switch.test.tsx "verify:testExists(registry/ouro/components/ouro/switch/switch.test.tsx::Switch in a row > merges a given aria-describedby with its own description, each id once, and passes an accessibility audit)"), each id once, where there was no such prop.
