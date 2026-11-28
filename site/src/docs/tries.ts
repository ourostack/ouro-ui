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
  "segmented-control": "Press Grid and watch the thumb slide over. With the arrow keys, or with reduced motion on, it moves at once.",
  lightbox: "Open a photo, then step through them with the arrow keys or a swipe.",
  kbd: "On a Mac, iPhone or iPad this reads ⌘K. Elsewhere it reads Ctrl+K.",
  toaster: "Send a few toasts, then press F6 to reach them. Swipe one up at the top, or turn off Hang from the top and swipe down.",
  "thread-rail": "Write a reply, then press Escape in the reply box. Move to Close thread and press Escape to return to the conversation.",
  resizable: "Drag the line between Ingredients and Method. Or tab to it and use the arrow keys.",
  "number-field": "With a mouse, drag the Servings label sideways. The number follows your hand.",
  command: "Open it and type dark mode. It finds Switch theme by its keywords.",
  calendar: "Pick two days for a trip. Page Down jumps to the next month.",
  "image-cropper": "Open it, press Plus to zoom in, then drag the photo to frame it.",
  "color-scheme-toggle": "Pick Dark. The whole page goes dark, not just the demo.",
  timer: "Start Focus, then reload the page. It keeps counting from where it was.",
  celebrate: "Press Finish the task. Confetti bursts from the badge. With reduced motion on, the badge just fades in.",
  combobox: "Type Rowan and press Enter straight away. Then press Enter again to start your message. On a phone, tap To to search in a sheet.",
  carousel: "Swipe it, scroll it sideways on a trackpad, or tab to it and press the arrow keys. It stops on a slide.",
};
