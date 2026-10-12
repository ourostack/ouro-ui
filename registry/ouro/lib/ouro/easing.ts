export { easeDrawer, easeInOut, easeOut };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement.

// The library's three easing curves, as Tailwind classes. They are literals here, in one
// place, until the theme has tokens for them (`--ouro-ease-out`, `--ouro-ease-in-out`,
// `--ouro-ease-drawer`). Class strings are whole so the app's Tailwind finds them when it
// compiles.

/** Enter and exit: a strong ease-out. */
const easeOut = "ease-[cubic-bezier(0.23,1,0.32,1)]";
/** Movement on screen. */
const easeInOut = "ease-[cubic-bezier(0.77,0,0.175,1)]";
/** Sheets and drawers. */
const easeDrawer = "ease-[cubic-bezier(0.32,0.72,0,1)]";
