# Delete a cookbook

Let cooks delete a cookbook from their cookbooks page. Deleting is permanent, so it needs a confirmation step that is hard to get through by accident, and the server can refuse, which the person needs to see.

## What to build

- A page titled "Cookbooks" that lists the cookbooks from `listCookbooks()` in `src/api/cookbooks.ts`.
- Style the delete action in the confirmation as destructive.
- Delete with `deleteCookbook(id)`. It answers `{ ok: true }` or `{ ok: false, error }`.

## Acceptance

1. Each cookbook shows its name, its recipe count ("12 recipes") and a button labelled "Delete <cookbook name>".
2. That button opens a confirmation dialog whose title, and accessible name, is "Delete <cookbook name>?". It says that the recipes stay in the library, and offers two buttons, "Cancel" and "Delete cookbook".
3. Focus starts on Cancel, so a stray Enter doesn't delete anything. Cancel and Escape close it without deleting, and focus goes back to the button that opened it.
4. "Delete cookbook" calls `deleteCookbook(id)` once. While the request runs, the button is disabled or marked busy (`aria-busy="true"`), and pressing it again does nothing. When it succeeds, the dialog closes, the cookbook leaves the list, and the text "<cookbook name> deleted" appears inside a live region (a status or alert role, an `output` element, or `aria-live`), so screen readers announce it.
5. When the server refuses, its message shows inside the dialog, the dialog stays open, and the cookbook stays in the list.
6. At 390px wide the page does not scroll sideways.
7. An automated accessibility scan (axe-core's WCAG 2 A and AA rules) finds no violation at 390px and 1280px wide, in light and dark mode, on the page and with the dialog open.
