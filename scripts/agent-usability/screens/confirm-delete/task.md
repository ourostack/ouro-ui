# Delete a cookbook

Let cooks delete a cookbook from their cookbooks page. Deleting is permanent, so it needs a confirmation step that is hard to get through by accident, and the server can refuse, which the person needs to see.

## What to build

- A page titled "Cookbooks" that lists the cookbooks from `listCookbooks()` in `src/api/cookbooks.ts`.
- Delete with `deleteCookbook(id)`. It answers `{ ok: true }` or `{ ok: false, error }`.

## Acceptance

1. Each cookbook shows its name, its recipe count ("12 recipes") and a button labelled "Delete <cookbook name>".
2. That button opens a confirmation dialog titled "Delete <cookbook name>?". It says that the recipes stay in the library, and offers "Cancel" and "Delete cookbook", with the delete action styled as destructive.
3. Focus starts on Cancel, so a stray Enter doesn't delete anything. Cancel and Escape close it without deleting, and focus goes back to the button that opened it.
4. "Delete cookbook" calls `deleteCookbook(id)` once. While the request runs, the button shows that it is working and can't be pressed again. When it succeeds, the dialog closes, the cookbook leaves the list, and "<cookbook name> deleted" is announced to screen readers.
5. When the server refuses, its message shows inside the dialog, the dialog stays open, and the cookbook stays in the list.
6. The page and the dialog read well at 390px and 1280px wide and look right in light and dark mode.
