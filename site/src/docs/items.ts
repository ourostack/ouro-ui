import buttonDoc from "../../../docs/Button.md?raw";
import confirmDialogDoc from "../../../docs/ConfirmDialog.md?raw";
import dialogDoc from "../../../docs/Dialog.md?raw";
import fieldDoc from "../../../docs/Field.md?raw";
import fieldsetDoc from "../../../docs/Fieldset.md?raw";
import headingDoc from "../../../docs/Heading.md?raw";
import linkDoc from "../../../docs/Link.md?raw";
import partsDoc from "../../../docs/parts.md?raw";
import progressDoc from "../../../docs/Progress.md?raw";
import sheetDoc from "../../../docs/Sheet.md?raw";
import skeletonDoc from "../../../docs/Skeleton.md?raw";
import spinnerDoc from "../../../docs/Spinner.md?raw";
import textDoc from "../../../docs/Text.md?raw";
import textAreaDoc from "../../../docs/TextArea.md?raw";
import textFieldDoc from "../../../docs/TextField.md?raw";
import toastDoc from "../../../docs/toast.md?raw";
import toasterDoc from "../../../docs/Toaster.md?raw";

/**
 * One docs page per registry item. `name` is the registry item name, so the page lives at
 * https://ourostack.github.io/ouro-ui/docs/<name>, the URL each item's install message
 * points to. The page body is the Markdown scripts/gen-docs.mts generates from the JSDoc.
 */
export interface DocsItem {
  /** The registry item name: `npx shadcn@latest add @ouro/<name>`. */
  name: string;
  /** The component's export name. */
  title: string;
  /** Catalog group, as in the README catalog. */
  group: "Actions" | "Text" | "Forms" | "Overlays" | "Feedback" | "Display";
  /** The registry source file, from the repo root. */
  source: string;
  /** docs/<title>.md, generated. */
  markdown: string;
  /** The family in docs/parts.md whose nesting this page shows, if it has parts. */
  parts?: "Sheet" | "Dialog" | "Field";
}

export const docsItems: DocsItem[] = [
  { name: "button", title: "Button", group: "Actions", source: "registry/ouro/components/ouro/button/button.tsx", markdown: buttonDoc },
  { name: "text", title: "Text", group: "Text", source: "registry/ouro/components/ouro/text/text.tsx", markdown: textDoc },
  { name: "heading", title: "Heading", group: "Text", source: "registry/ouro/components/ouro/text/heading.tsx", markdown: headingDoc },
  { name: "link", title: "Link", group: "Text", source: "registry/ouro/components/ouro/link/link.tsx", markdown: linkDoc },
  { name: "field", title: "Field", group: "Forms", source: "registry/ouro/components/ouro/field/field.tsx", markdown: fieldDoc, parts: "Field" },
  { name: "fieldset", title: "Fieldset", group: "Forms", source: "registry/ouro/components/ouro/field/fieldset.tsx", markdown: fieldsetDoc },
  {
    name: "text-field",
    title: "TextField",
    group: "Forms",
    source: "registry/ouro/components/ouro/text-field/text-field.tsx",
    markdown: textFieldDoc,
  },
  { name: "text-area", title: "TextArea", group: "Forms", source: "registry/ouro/components/ouro/text-field/text-area.tsx", markdown: textAreaDoc },
  { name: "sheet", title: "Sheet", group: "Overlays", source: "registry/ouro/components/ouro/sheet/sheet.tsx", markdown: sheetDoc, parts: "Sheet" },
  { name: "dialog", title: "Dialog", group: "Overlays", source: "registry/ouro/components/ouro/dialog/dialog.tsx", markdown: dialogDoc, parts: "Dialog" },
  {
    name: "confirm-dialog",
    title: "ConfirmDialog",
    group: "Overlays",
    source: "registry/ouro/components/ouro/dialog/confirm-dialog.tsx",
    markdown: confirmDialogDoc,
  },
  {
    name: "toaster",
    title: "Toaster",
    group: "Feedback",
    source: "registry/ouro/components/ouro/toast/toaster.tsx",
    markdown: `${toasterDoc}\n${functionSection(toastDoc)}`,
  },
  { name: "spinner", title: "Spinner", group: "Feedback", source: "registry/ouro/components/ouro/spinner/spinner.tsx", markdown: spinnerDoc },
  { name: "progress", title: "Progress", group: "Feedback", source: "registry/ouro/components/ouro/progress/progress.tsx", markdown: progressDoc },
  { name: "skeleton", title: "Skeleton", group: "Display", source: "registry/ouro/components/ouro/skeleton/skeleton.tsx", markdown: skeletonDoc },
];

/**
 * A function's generated page (docs/toast.md) as one section of its component's page: its
 * title becomes a `##` heading with the call's parentheses, and its own sections step down
 * a level, so the Toaster page documents `toast()` too.
 */
function functionSection(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->\n*/g, "")
    .replace(/^## /gm, "### ")
    .replace(/^# (\w+)$/m, "## $1()");
}

/** The `## <family> parts` section of docs/parts.md, without its heading. */
export function partsSection(family: "Sheet" | "Dialog" | "Field"): string {
  const start = partsDoc.indexOf(`## ${family} parts\n`);
  const body = partsDoc.slice(start).split("\n").slice(1).join("\n");
  const end = body.search(/^## /m);
  return end === -1 ? body : body.slice(0, end);
}

/**
 * The registry source imports `@/registry/ouro/...`; the shadcn CLI rewrites that to the
 * app's aliases on install. The docs show the installed paths, with shadcn's default `@/`.
 */
export function installedPaths(markdown: string): string {
  return markdown.replace(/@\/registry\/ouro\//g, "@/");
}

/** The first sentence of the page's purpose paragraph, for the catalog. */
export function summary(markdown: string): string {
  const purpose = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";
  return purpose.match(/^.*?\.(?=\s|$)/)?.[0] ?? purpose;
}

export const GITHUB = "https://github.com/ourostack/ouro-ui";
