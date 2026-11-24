Fixes #3447.

`Combobox` with `multiple` passed `doneLabel` to both the footer "Done" button and `SheetFrame`'s `closeLabel`, so the phone sheet's close icon button and the footer confirm button got the same accessible name. A screen reader, and `getByRole("button", { name: "Done" })`, saw more than one match; an app hit a strict-mode violation from this.

Adds a dedicated `closeLabel` prop (default `"Close"`) for the sheet's own close button, mirroring `Command`'s existing pattern, so it stays distinct from `doneLabel`'s footer button. The close button keeps its icon, its touch target and its Escape/close behavior; only its accessible name changes.

- Failing-first test: `combobox.touch.test.tsx` adds a case asserting exactly one button named "Done" inside the sheet, and that the sheet's own close button has a different name.
- `docs/Combobox.md` regenerated for the new prop.
- `changes/combobox-sheet-one-done.md` added.
