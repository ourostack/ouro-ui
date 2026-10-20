import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { collectControls, controlRole } from "../controls.ts";
import { cleanupStories, closeOverlay, isVisible, openOverlay, openPopup, overlayOpeners, renderStory, settle } from "../stories.tsx";
import { conformanceStories, describeElement, layOut } from "./harness.ts";

// Forced colours (Windows contrast themes; `forced-colors: active`). The browser replaces every
// colour with a few system colours and drops backgrounds and box shadows, so a control whose
// edge, state or focus ring is drawn with a background colour or a shadow vanishes. Under
// forced colours, every story, closed and with each overlay open, must keep for each control:
// - an edge: a border or outline on the control, on something inside it, or on its component's
//   frame around it (for a box a person presses, types into, drags or scrolls: buttons, fields,
//   checkboxes, switches, sliders, scrollable regions; links, the rows of a list and the cells
//   of a grid are text);
// - its state: a checked, selected or pressed control looks different from an unchecked one of
//   the same part (a segment, a tab, a toggle);
// - its focus: focusing it from the keyboard changes what its component shows.

/** Roles a person sees as a box to press, type into or drag, so they need an edge of their own or their frame's. */
const boxed = new Set(["button", "checkbox", "switch", "radio", "slider", "textbox", "searchbox", "combobox", "spinbutton", "generic"]);

/** The states a control can be in that forced colours must keep apart from the off state. */
const onState = '[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [data-checked], [data-selected], [data-pressed]';

/** The page's canvas colour under forced colours: a background in it shows nothing. */
const canvas = () => getComputedStyle(document.documentElement).backgroundColor;

const transparent = (color: string) => color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

/** Whether an element draws a line around itself: a border or an outline wider than zero, in a colour that shows. */
function edged(element: Element): boolean {
  const style = getComputedStyle(element);
  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  const border = sides.some(
    (side) =>
      parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
      !["none", "hidden"].includes(style.getPropertyValue(`border-${side.toLowerCase()}-style`)) &&
      !transparent(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
  );
  const outline = parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none" && !transparent(style.outlineColor);
  const fill = !transparent(style.backgroundColor) && style.backgroundColor !== canvas();
  return border || outline || fill;
}

/** Whether an element is shown: rendered, not clipped to a pixel for screen readers only. */
function shown(element: Element): boolean {
  if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
  const box = element.getBoundingClientRect();
  return box.width > 2 && box.height > 2;
}

/** What forced colours leave of a subtree: each shown element's lines, fill, text colour and SVG paint, in order. */
function look(root: Element): string {
  return [root, ...root.querySelectorAll("*")]
    .filter(shown)
    .map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return [
        element.localName,
        Math.round(box.width),
        Math.round(box.height),
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
        style.borderTopStyle,
        style.borderTopColor,
        style.outlineStyle === "none" ? "" : `${style.outlineWidth} ${style.outlineColor}`,
        transparent(style.backgroundColor) ? "" : style.backgroundColor,
        style.color,
        style.textDecorationLine,
        element instanceof SVGElement ? `${style.fill} ${style.stroke}` : "",
      ].join(" ");
    })
    .join("\n");
}

/** The control's component root, the frame its look is read in. */
const frame = (control: Element) => control.closest("[data-ouro]") ?? control;

/** The part a person sees for a control: itself, or for a control drawn by something around it (a slider's range input, clipped inside its thumb), that. */
function visual(control: Element): Element | null {
  for (let node: Element | null = control; node; node = node.parentElement) {
    if (shown(node)) return node;
    if (node.hasAttribute("data-ouro")) break;
  }
  return null;
}

/**
 * Whether the control, something inside it or its frame up to its component root has an edge. A
 * scrollable region's edge is its own or its frame's: what scrolls inside it does not show where
 * it ends.
 */
function hasEdge(control: Element): boolean {
  const seen = visual(control);
  if (!seen) return true;
  const inside = controlRole(control) === "generic" ? [seen] : [seen, ...seen.querySelectorAll("*")];
  if (inside.some((element) => shown(element) && edged(element))) return true;
  for (let node = seen.parentElement; node; node = node.parentElement) {
    if (shown(node) && edged(node)) return true;
    if (node.hasAttribute("data-ouro")) break;
  }
  return false;
}

/** The controls a person can see and reach under `root`, or in the open popup. */
function seenControls(root: ParentNode): Element[] {
  return collectControls(root).filter((control) => control.getAttribute("aria-hidden") !== "true" && visual(control) !== null && isVisible(control));
}

/** The identity two controls share when they are the same part in different states. */
const partOf = (control: Element) => `${control.getAttribute("data-ouro-control")}/${control.getAttribute("data-ouro-part")}/${controlRole(control)}`;

/** The gaps under `root`, each described with the state it was found in. */
async function gaps(root: ParentNode, state: string): Promise<string[]> {
  const found: string[] = [];
  const controls = seenControls(root);
  for (const control of controls) {
    // A grid's cells (a calendar's days) are text in a table, like a list's rows.
    if (control.closest('[role="grid"], [role="gridcell"]')) continue;
    if (boxed.has(controlRole(control)) && !hasEdge(control)) found.push(`${state}: no edge: ${describeElement(control)}`);
  }
  // State: an on control against an off one of the same part.
  for (const control of controls.filter((element) => element.matches(onState))) {
    const peer = controls.find((other) => other !== control && partOf(other) === partOf(control) && !other.matches(onState));
    if (peer && look(visual(control)!).replace(/^\S+ \d+ \d+ /gm, "") === look(visual(peer)!).replace(/^\S+ \d+ \d+ /gm, "")) {
      found.push(`${state}: on looks like off: ${describeElement(control)}`);
    }
  }
  // Focus: a keyboard focus must change what the control's component shows. Focus moves from
  // control to control and never leaves for the page, so an open popup stays open; the control
  // that already has focus goes last, once focus has moved away from it.
  await userEvent.keyboard("{Shift}");
  const focusable = controls.filter((control) => control instanceof HTMLElement && !control.matches(":disabled, [aria-disabled='true']")) as HTMLElement[];
  focusable.sort((a, b) => Number(a === document.activeElement) - Number(b === document.activeElement));
  for (const control of focusable) {
    if (document.activeElement === control) continue;
    const around = frame(control);
    const before = look(around);
    control.focus();
    if (document.activeElement !== control) continue;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (control.matches(":focus-visible") && look(around) === before) found.push(`${state}: focus shows nothing: ${describeElement(control)}`);
  }
  return found;
}

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
});
afterEach(async () => {
  await commands.emulateMedia({ forcedColors: "none" });
  await cleanupStories();
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("forced colours at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  it.each(conformanceStories)("$id keeps every control's edge, state and focus, closed and with each overlay open", async ({ id, Story, parameters }) => {
    const host = await renderStory(Story);
    layOut(host, parameters);
    await settle();
    const found = await gaps(document.body, "closed");
    for (const opener of overlayOpeners(id, host)) {
      const popup = await openOverlay(opener);
      found.push(...(await gaps(popup, `with "${opener.name}" open`)));
      if (openPopup()) await closeOverlay();
    }
    expect([...new Set(found)].join("\n")).toBe("");
  });
});
