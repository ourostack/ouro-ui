# App shell

Build the shell the rest of the app will live in: a navigation column on the left and the current page beside it. On a phone the column folds away behind a menu button. The pages themselves are placeholders for now: each shows its name as its heading and the text "Nothing here yet."

## What to build

- Five pages: Home (`#/`), Recipes (`#/recipes`), Cookbooks (`#/cookbooks`), Shopping list (`#/shopping-list`) and Settings (`#/settings`). Use the URL hash for the current page; no router library is needed.
- The signed-in user is `currentUser` in `src/api/session.ts`; sign out with `signOut()`.

## Acceptance

1. On a wide screen (1280px), the navigation column is always visible. It is a navigation landmark labelled "Main", and it lists the five pages as links to their hashes. The page has exactly one main landmark, and it shows the current page's name as a level 1 heading.
2. Following a link shows that page and marks its link as the current page (`aria-current="page"`). Reloading keeps the page.
3. On a phone (390px wide) the column is hidden, and a button labelled "Open navigation" at the top of the page opens it over the content. Choosing a page closes it. Escape also closes it, and focus goes back to the button.
4. At the bottom of the column, the user's name and email are shown with a "Sign out" button that calls `signOut()`.
5. A "Skip to content" link is the first thing Tab reaches, and it moves focus to the main area.
6. At 390px wide the page does not scroll sideways.
7. An automated accessibility scan (axe-core's WCAG 2 A and AA rules) finds no violation at 390px and 1280px wide, in light and dark mode, on the shell and, on a phone, with the navigation open.
