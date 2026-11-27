# Changes in this release

- New: Ouro check writes `scanned` in `report.json`: the pages, sizes and themes swept, the visits made, how many reached first content, and the elements and rule checks read.
- Fixed: [a rich Composer reads its words and caret once for each editor state and page selection, however often an app asks between keys](registry/ouro/components/ouro/composer/composer.rich-tokens.test.tsx "verify:testExists(registry/ouro/components/ouro/composer/composer.rich-tokens.test.tsx::Composer rich element reads > reads its words and caret once for each state, however often an app asks between keys)"), so an app that reads value, selectionStart and selectionEnd on each key pays for one read, not three (found by a consuming app whose reply box reads all three on each key).
