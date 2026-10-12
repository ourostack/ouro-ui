# My recipes

Build the "My recipes" list. Most people open it on a phone to tidy up: they swipe a row to archive or delete it, the way they would in their mail app. On a laptop, and for anyone who can't swipe, the same actions need to be one click or one keypress away. Cooks have up to a few hundred recipes, so the list is paged.

## What to build

- A page titled "My recipes" that shows one page of recipes at a time from `listRecipes(page)` in `src/api/recipes.ts`. The page number is 1-based, and the answer includes `pageCount`.
- Archive with `archiveRecipe(id)` and delete with `deleteRecipe(id)`. Neither needs a confirmation; deleted recipes can be restored by support.

## Acceptance

1. The list shows 10 recipes per page. Each row shows the recipe's title, its total time ("35 min") and how many it serves ("Serves 4").
2. Under the list, page navigation labelled "Pagination" has Previous and Next controls and a control for each page number. The current page is marked as current for assistive technology (`aria-current="page"`). Previous is disabled on the first page, and Next on the last.
3. On a touch screen, swiping a row to the left reveals two actions for that row, "Archive" and "Delete". Swiping it back to the right hides them again.
4. The same actions work without swiping: each row has a button labelled "Actions for <recipe title>" that opens a menu with "Archive" and "Delete". It works with a keyboard and a mouse.
5. Archive and Delete call `archiveRecipe` or `deleteRecipe`, remove the row from the list straight away, and announce "<recipe title> archived" or "<recipe title> deleted" to screen readers.
6. The page shows that it is loading while a page of recipes loads, reads well at 390px and 1280px wide, and looks right in light and dark mode.
