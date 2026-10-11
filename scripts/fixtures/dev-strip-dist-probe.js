// Bundled by scripts/dev-strip.test.mjs to prove the built package's dev messages
// are stripped from a consumer's production build. Imports dist, as an app would.
import { createElement } from "react";
import { Button, ConfirmDialog, Dialog, Heading, Sheet, Text } from "../../dist/index.js";
import { DialogPopup, SheetPopup } from "../../dist/parts.js";

export const elements = [
  createElement(Button, { className: "bg-red-500", isLoading: true }, "Go"),
  createElement(Button, { href: "/x", type: "submit" }, "Link"),
  createElement(Text, { className: "text-center" }, "Body"),
  createElement(Heading, { level: 2, className: "text-4xl" }, "Title"),
  createElement(Sheet, { title: "Sheet", className: "bg-red-500", isOpen: true, trigger: createElement(Button, null, "Open") }, "Body"),
  createElement(SheetPopup),
  createElement(Dialog, { title: "Dialog", className: "bg-red-500", side: "left", trigger: createElement(Button, null, "Open") }, "Body"),
  createElement(ConfirmDialog, { title: "Delete?", confirmLabel: "Delete", onConfirm: () => Promise.reject(new Error("x")), destructive: true, trigger: createElement(Button, null, "Delete") }),
  createElement(DialogPopup),
];
