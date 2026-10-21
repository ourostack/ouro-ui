import { censusExclusions, interactiveSelector } from "@/registry/ouro/census/census-collect.mjs";

/**
 * Every element a person can focus or operate (`interactiveSelector`), and the matches that are no
 * control (`censusExclusions`: Base UI's focus guards, which hand focus back into a modal and that
 * no prop reaches). Both come from the census kit (ouro-census), so an app's census counts exactly
 * the controls these tests hold to their markers. Everything else an Ouro component renders, Base
 * UI's own elements included, carries a control marker.
 */
export { censusExclusions, interactiveSelector };

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
