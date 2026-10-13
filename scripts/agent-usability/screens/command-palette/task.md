# Command palette

Add a command palette to the kitchen dashboard, so power users can jump anywhere or start an action without leaving the keyboard. For this task the dashboard itself can be a simple placeholder; the palette is the work.

## What to build

- A page titled "Kitchen" with a header that holds a "Search commands" button showing the keyboard shortcut, and a short placeholder for the dashboard below it.
- The palette lists `commands` from `src/api/commands.ts` and runs one with `runCommand(id)`.
- Under the page heading, a line reads "Last command: <label>" once a command has run.

## Acceptance

1. The "Search commands" button opens the palette, and so do Ctrl+K and ⌘K from anywhere on the page.
2. The palette is a modal dialog whose accessible name is "Command palette" (the title may be visually hidden), with a search field that has focus as soon as it opens.
3. Commands are listed under their group headings: Navigation, Recipes and Account. Typing filters them by label, ignoring case; the matches keep their order, and a group with no matches disappears. When nothing matches, the palette says "No commands found."
4. The first match is highlighted as you type. Up and Down move the highlight, and Enter runs the highlighted command. Clicking a command runs it too.
5. Running a command calls `runCommand(id)`, closes the palette and shows "Last command: <label>" on the page.
6. Escape closes the palette without running anything, and focus goes back to where it was before the palette opened.
7. At 390px wide the page does not scroll sideways.
8. An automated accessibility scan (axe-core's WCAG 2 A and AA rules) finds no violation at 390px and 1280px wide, in light and dark mode, on the page and with the palette open.
