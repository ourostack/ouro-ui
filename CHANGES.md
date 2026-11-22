# Changes in this release

- Fixed: Ouro check's cramped-heading no longer counts what a closed details hides as a box above a heading.
- Fixed: [Sheet's Parts story puts its title in a header row inset as `Sheet`'s is](registry/ouro/components/ouro/sheet/sheet.stories.tsx "verify:fileLine(registry/ouro/components/ouro/sheet/sheet.stories.tsx, /className=\"px-5 pt-3 pb-2\"/)"), clear of the popup's rounded corner, where the line on a bottom sheet's open edge sat inside the title's line box and failed a pixel contrast check.
