# Changes in this release

- New: [`<Combobox multiple allowCustomValue>`](registry/ouro/components/ouro/combobox/combobox.test.tsx "verify:testExists(registry/ouro/components/ouro/combobox/combobox.test.tsx::Combobox multiple allowCustomValue > makes typed text a chip on Enter when no suggestion is highlighted, and submits one entry per chip)") is a token input, for tags: typed text becomes a chip on Enter or at a comma, text that matches an item ignoring case picks that item, and on a phone the sheet's `customValueLabel` row adds it. Before, the pair was a type error and warned.
- Fixed: SnapPiP stays open when a person opens it over a keep-out and the first size reports arrive afterwards.
- Fixed: SnapPiP hides itself, when the app lets it, once a keep-out comes to cover its corner and the corner has nowhere clear.
