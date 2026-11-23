# Changes in this release

- Changed: a left or right Sheet, docked to the window's full height, has square corners where it meets the window's top and bottom ([test](registry/ouro/components/ouro/sheet/sheet.test.tsx "verify:testExists(registry/ouro/components/ouro/sheet/sheet.test.tsx::opening and closing > squares the corners of a side sheet docked full height, and keeps a bottom sheet's rounded top corners)")); a bottom or top Sheet keeps its rounded inner corners.
- Fix: X-ray's `cli.optional-args` rule reads a `<...>` alternative in a bracketed `|` choice, such as `[<version> | latest | <dmg or zip>]`, as the one optional word it is, instead of falsely flagging a later alternative as a separate required word that comes after the first.
