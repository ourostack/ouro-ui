# My recipes

Build the "My recipes" list. Most people open it on a phone to tidy up: they swipe a row to archive or delete it, the way they would in their mail app. On a laptop, and for anyone who can't swipe, the same actions need to be one click or one keypress away. Cooks have up to a few hundred recipes, so the list is paged.

## What to build

- A page titled "My recipes" that shows one page of recipes at a time from `listRecipes(page)` in `src/api/recipes.ts`. The page number is 1-based, and the answer includes `pageCount`.
- While a page of recipes loads, the page shows that it is loading.
- Archive with `archiveRecipe(id)` and delete with `deleteRecipe(id)`. Neither needs a confirmation; deleted recipes can be restored by support.

## Acceptance

1. The list shows 10 recipes per page. Each row shows the recipe's title, its total time ("35 min") and how many it serves ("Serves 4").
2. Under the list is a navigation landmark labelled "Pagination". It has "Previous" and "Next" controls and, for each page, a button or link named by its number ("3", "Page 3" or "Go to page 3"). The current page's control is marked `aria-current="page"`. Previous is disabled on the first page, and Next on the last.
3. On a touch screen, dragging a row to the left by about half its width reveals two buttons in that row, "Archive" and "Delete". The drag only reveals them: it does not archive or delete by itself. Dragging the row back to the right hides them again. This has to work with a real finger, so the browser must not take the sideways drag for scrolling.
4. The same actions work without swiping: each row has a button labelled "Actions for <recipe title>" that opens a menu of the two actions, "Archive" and "Delete". Assistive technology sees it as a menu (the `menu` role, with `menuitem` items). It works with a mouse and with a keyboard alone: Enter on the button opens the menu and moves focus into it, the arrow keys move between the actions, and Enter runs the current one.
5. Archive and Delete call `archiveRecipe` or `deleteRecipe` and remove the row from the list straight away. The text "<recipe title> archived" or "<recipe title> deleted" then appears inside a live region (a status or alert role, an `output` element, or `aria-live`), so screen readers announce it.
6. At 390px wide the page does not scroll sideways.
7. An automated accessibility scan (axe-core's WCAG 2 A and AA rules) finds no violation at 390px and 1280px wide, in light and dark mode, on the list and with a row's actions menu open.
