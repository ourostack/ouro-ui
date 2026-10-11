// Bundled by scripts/dev-strip.test.mjs to prove the components' dev messages are
// stripped from an app's production build. Imports the registry source, as an app
// that installed the components would.
import { createElement } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { DialogPopup } from "@/registry/ouro/components/ouro/dialog/dialog-parts";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { SheetPopup } from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const Untyped = <P,>(component: P) => component as unknown as (props: Record<string, unknown>) => null;

export const elements = [
  createElement(Untyped(Button), { className: "bg-red-500", isLoading: true }, "Go"),
  createElement(Untyped(Button), { href: "/x", type: "submit" }, "Link"),
  createElement(Text, { className: "text-center" }, "Body"),
  createElement(Heading, { level: 2, className: "text-4xl" }, "Title"),
  createElement(Untyped(Sheet), { title: "Sheet", className: "bg-red-500", isOpen: true, trigger: createElement(Button, null, "Open") }, "Body"),
  createElement(SheetPopup),
  createElement(Untyped(Dialog), { title: "Dialog", className: "bg-red-500", side: "left", trigger: createElement(Button, null, "Open") }, "Body"),
  createElement(Untyped(ConfirmDialog), { title: "Delete?", confirmLabel: "Delete", onConfirm: () => Promise.reject(new Error("x")), destructive: true, trigger: createElement(Button, null, "Delete") }),
  createElement(DialogPopup),
];
