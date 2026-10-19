/**
 * Every element a person can focus or operate: native controls, links, editable regions, anything
 * in the tab order, and the ARIA widget roles. `collectControls` finds them. An app's census of
 * controls copies this string and `censusExclusions` together, so change them only with the copies.
 */
export const interactiveSelector =
  'a[href], button, input:not([type="hidden"]), select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="treeitem"]';

/**
 * The `interactiveSelector` matches that are no control: Base UI's focus guards, which hand focus
 * back into a modal and that no prop reaches. Everything else an Ouro component renders, Base UI's
 * own elements included, carries a control marker. An app's census copies this list with
 * `interactiveSelector`.
 */
export const censusExclusions: readonly string[] = ["[data-base-ui-focus-guard]"];

/**
 * The controls under `root` (the whole page by default, portals included), in document order:
 * every `interactiveSelector` match except the controls a story renders itself
 * (`[data-test-harness]` and everything in it) and `censusExclusions`.
 */
export function collectControls(root: ParentNode = document.body): Element[] {
  return [...root.querySelectorAll(interactiveSelector)].filter(
    (element) => !element.closest("[data-test-harness]") && !censusExclusions.some((selector) => element.matches(selector)),
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
