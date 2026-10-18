import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";

/**
 * Every element a person can focus or operate: native controls, links, editable regions, anything
 * in the tab order, and the ARIA widget roles. `collectControls` finds them; the census of an app
 * copies this string, so change it only with the copies.
 */
export const interactiveSelector =
  'a[href], button, input:not([type="hidden"]), select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="treeitem"]';

/**
 * What Base UI renders inside a component that no prop or ref reaches, so it carries no control
 * marker: the focus guards that hand focus back into a modal (`axeExclude`), and the visually
 * hidden Dismiss button a combobox adds beside its input and its list for screen readers.
 */
export const baseUiInternals: readonly string[] = [...axeExclude, 'span[role="button"][aria-label="Dismiss"]'];

/**
 * The controls under `root` (the whole page by default, portals included), in document order:
 * every `interactiveSelector` match except the controls a story renders itself
 * (`[data-test-harness]` and everything in it) and `baseUiInternals`.
 */
export function collectControls(root: ParentNode = document.body): Element[] {
  return [...root.querySelectorAll(interactiveSelector)].filter(
    (element) => !element.closest("[data-test-harness]") && !baseUiInternals.some((selector) => element.matches(selector)),
  );
}

/** The role an input implies, by type, as browsers and Playwright compute it. */
const inputRoles: Record<string, string> = {
  button: "button",
  checkbox: "checkbox",
  file: "button",
  image: "button",
  number: "spinbutton",
  radio: "radio",
  range: "slider",
  reset: "button",
  submit: "button",
};

/**
 * A control's role: its first explicit `role`, or the one its element implies (`a[href]` is a
 * link, `<select>` a combobox or, with `multiple`, a listbox). An element in the tab order with
 * no role of its own, such as a scrollable region, is `generic`.
 */
export function controlRole(element: Element): string {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = element.localName;
  if (tag === "a" || tag === "area") return element.hasAttribute("href") ? "link" : "generic";
  if (tag === "button") return "button";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return (element as HTMLSelectElement).multiple || (element as HTMLSelectElement).size > 1 ? "listbox" : "combobox";
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (type === "search") return element.hasAttribute("list") ? "combobox" : "searchbox";
    if (["email", "tel", "text", "url"].includes(type) && element.hasAttribute("list")) return "combobox";
    return inputRoles[type] ?? "textbox";
  }
  if ((element as HTMLElement).isContentEditable) return "textbox";
  return "generic";
}
