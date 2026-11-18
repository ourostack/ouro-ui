// One line under a component's live demo, for the components whose best trick a visitor wouldn't find alone: what to
// do with the demo to see it. Keyed by registry item name; a component without one shows no line.

/** What to try with each live demo whose best trick is hidden. */
export const tries: Readonly<Record<string, string>> = {
  button: "Press Save recipe. It shows a spinner and keeps its size, so nothing next to it jumps.",
  sheet: "Open it, then drag it down to close it. Pull it up instead and feel it stretch.",
  dialog: "Make the window narrow and open it again. On a phone it comes up as a sheet you can drag away.",
  "confirm-dialog": "Open it and press Enter. Cancel has focus first, so nothing gets deleted by mistake.",
  "edit-sheet": "Change the name, then press Cancel. It asks before it throws your edit away.",
  "otp-field": "Copy a six-digit code, then paste it into the first box. It fills the rest in one go.",
  reorderable: "Drag a step by its handle. The other steps move out of the way.",
  "swipe-actions": "On a phone, swipe a row to the left to delete it, then press Undo.",
  "segmented-control": "Press Grid, or use the arrow keys, and watch the thumb slide over.",
  lightbox: "Open a photo, then step through them with the arrow keys or a swipe.",
  kbd: "On a Mac this reads ⌘K. On Windows or Linux it reads Ctrl+K.",
};
