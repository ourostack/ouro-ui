# Changes in this release

Re-add your Ouro items with `--overwrite` to get these. Drop any local workaround for the first three.

- Sheets and dialogs now stack at `--ouro-layer`, a z-index of 50 by default, instead of level 0. An app element at a z-index from 1 to 49 that used to show above an open sheet or dialog now sits under it. If your app has fixed bars above z-50, raise the token in a `:root` rule of your own after the Ouro tokens; see "Theme" in the README.
- A controlled `Dialog` opened by a touch or pen tap now focuses its popup instead of its first input, so no software keyboard pops up. Keyboard opens still focus the first control.
- `ConfirmDialog`'s `finalFocus` now applies only after a confirmed action. Cancel, Escape, and a close your app makes itself after reopening the confirmation return focus to the trigger.
- Adding or re-adding a `-tests` item sets Vitest to `^5`. An app pinned to Vitest 4 can skip the `-tests` items or re-pin Vitest afterwards; see "Details" in the README.
- Each item's install message ends with its Markdown docs URL and names the Ouro UI version it installed.
