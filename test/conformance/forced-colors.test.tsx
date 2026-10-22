import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { collectControls, controlRole } from "../controls.ts";
import { cleanupStories, closeOverlay, isVisible, openOverlay, openPopup, overlayOpeners, renderStory, settle, type StoryEntry } from "../stories.tsx";
import { brokenFor, conformanceStories, describeElement, layOut } from "./harness.ts";

// Forced colours (Windows contrast themes; `forced-colors: active`). The browser replaces every
// colour with a few system colours and drops backgrounds and box shadows, so a control whose
// edge, state or focus ring is drawn with a background colour or a shadow vanishes. Under
// forced colours, every story, closed and with each overlay open, must keep for each control:
// - an edge: a border or outline on the control, on something inside it, or on its component's
//   frame around it (for a box a person presses, types into, drags or scrolls: buttons, fields,
//   checkboxes, switches, sliders, scrollable regions; links, buttons drawn as underlined links,
//   the rows of a list and the cells of a grid are text);
// - its state: a checked, selected, pressed or current control looks different from one of the
//   same part that is not (a segment, a tab, a toggle, the current page);
// - its focus: focusing it from the keyboard changes what its component shows.

/** Roles a person sees as a box to press, type into or drag, so they need an edge of their own or their frame's. */
const boxed = new Set(["button", "checkbox", "switch", "radio", "slider", "textbox", "searchbox", "combobox", "spinbutton", "generic"]);

/** The states a control can be in that forced colours must keep apart from the off state. */
const onState = '[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [aria-current]:not([aria-current="false"]), [data-checked], [data-selected], [data-pressed]';

/** What takes keyboard focus: a native control or link, or anything with a `tabindex`. */
const tabStop = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

/** An item of a list or menu, whose highlight stands for focus (`data-highlighted`, set by the keyboard and the pointer alike). */
const virtualItem = ':is([role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"], [role="gridcell"]):not(button)';

/** A state between on and off (an indeterminate checkbox), compared with neither. */
const mixedState = '[aria-checked="mixed"], [aria-pressed="mixed"], [data-indeterminate]';

const transparent = (color: string) => color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

/** The colour behind an element: the nearest background around it that is not transparent, or the canvas. */
function behind(element: Element): string {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (!transparent(color)) return color;
  }
  return "rgb(255, 255, 255)";
}

/** An element's own box and its generated `::before` and `::after` boxes, as computed styles. */
function boxes(element: Element): CSSStyleDeclaration[] {
  const generated = (["::before", "::after"] as const).map((pseudo) => getComputedStyle(element, pseudo)).filter((style) => style.content !== "none" && style.display !== "none");
  return [getComputedStyle(element), ...generated];
}

/** Whether one box draws an edge: see `edged`. */
function boxEdged(style: CSSStyleDeclaration, back: string): boolean {
  const sides = ["top", "right", "bottom", "left"] as const;
  const border = sides.some(
    (side) =>
      parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      !["none", "hidden"].includes(style.getPropertyValue(`border-${side}-style`)) &&
      !transparent(style.getPropertyValue(`border-${side}-color`)),
  );
  const outline = parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none" && !transparent(style.outlineColor);
  const fill = !transparent(style.backgroundColor) && style.backgroundColor !== back;
  return border || outline || fill;
}

/**
 * Whether an element draws its own edge, with its box or a generated `::before` or `::after`: a
 * border or an outline wider than zero in a colour that shows, or a fill that differs from what is
 * behind it (forced colours paint most fills in the canvas colour; a system colour such as
 * Highlight stays).
 */
function edged(element: Element): boolean {
  const back = behind(element);
  return boxes(element).some((style) => boxEdged(style, back));
}

/** Whether an element is shown: rendered, and not clipped to a pixel for screen readers only (a 1px rule, such as a resize handle, is shown). */
function shown(element: Element): boolean {
  if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
  const box = element.getBoundingClientRect();
  return box.width * box.height > 4;
}

/**
 * What forced colours leave of a subtree: each shown element's size, place, lines, fill (where it
 * differs from what is behind it), text colour and SVG paint, and those of its generated
 * `::before` and `::after`, in order. `masked`, a part of it, is left out with all it holds but
 * `kept` and the parts around `kept`.
 */
function look(root: Element, masked?: Element | null, kept?: Element): string {
  const origin = root.getBoundingClientRect();
  // The masked part's own box always; what it holds unless that is `kept` or holds it (a scroll
  // region's focus ring is left out, the link inside it is not).
  const hidden = (element: Element) =>
    masked != null && masked !== root && (element === masked || (masked.contains(element) && !(kept && (kept.contains(element) || element.contains(kept)))));
  return [root, ...root.querySelectorAll("*")]
    .filter((element) => shown(element) && !hidden(element))
    .flatMap((element) => {
      const box = element.getBoundingClientRect();
      const back = behind(element);
      return boxes(element).map((style, index) => [
        `${element.localName}${index === 0 ? "" : `:${index}`}`,
        Math.round(box.width),
        Math.round(box.height),
        // Where it sits in the subtree: a switch's thumb is on or off by its side alone.
        `@${Math.round(box.left - origin.left)},${Math.round(box.top - origin.top)}`,
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
        style.borderTopStyle,
        style.borderTopColor,
        style.outlineStyle === "none" ? "" : `${style.outlineWidth} ${style.outlineColor}`,
        // A fill the colour of what is behind it (forced colours paint most fills in the canvas colour) shows nothing.
        transparent(style.backgroundColor) || style.backgroundColor === back ? "" : style.backgroundColor,
        style.color,
        style.textDecorationLine,
        // An icon's paint and its shape (a check and a dash differ by their path alone), and how much
        // of its stroke is drawn (a checkbox's tick is there, undrawn, while it is off).
        element instanceof SVGElement ? `${style.fill} ${style.stroke} ${style.strokeDasharray} ${style.strokeDashoffset} ${style.opacity} ${element.getAttribute("d") ?? element.getAttribute("points") ?? ""}` : "",
      ].join(" "));
    })
    .join("\n");
}

/**
 * The frame a control's focus is read in: the root of the component that marks it (a card's root
 * for its link), or the nearest component root.
 */
const frame = (control: Element) => control.closest(`[data-ouro="${control.getAttribute("data-ouro-control")}"]`) ?? control.closest("[data-ouro]") ?? control;

/**
 * The part a person sees for a control: itself, or for a native input drawn by the box that holds
 * it (a slider's range input, clipped inside its thumb), that box. A button shown only to the
 * keyboard (clipped until it has focus, as a sheet's close button is) has none at rest: the focus
 * check covers it.
 */
function visual(control: Element): Element | null {
  if (shown(control)) return control;
  const holder = control.parentElement;
  return control.localName === "input" && holder && shown(holder) ? holder : null;
}

/**
 * Whether the control, something inside it or its frame up to its component root has an edge (or,
 * for a plain field, the app's frame just around it). A scrollable region's edge is its own or its
 * frame's: what scrolls inside it does not show where it ends.
 */
function hasEdge(control: Element): boolean {
  const seen = visual(control);
  if (!seen) return true;
  // A button drawn as a link (underlined text, as a status line's Retry is) reads as one: its underline is its edge.
  if (getComputedStyle(seen).textDecorationLine.includes("underline")) return true;
  const inside = controlRole(control) === "generic" ? [seen] : [seen, ...seen.querySelectorAll("*")];
  if (inside.some((element) => shown(element) && edged(element))) return true;
  // Up to the root of the item that marks the control (a resizable group for its panels), or the nearest component root.
  const root = frame(control);
  for (let node = seen.parentElement; node && seen !== root; node = node.parentElement) {
    if (shown(node) && edged(node)) return true;
    if (node === root) break;
  }
  // A field with `variant="plain"` sits in a frame the app draws around it (a composer's box, a
  // search bar's rules), which forced colours keep: the root's parent or grandparent.
  if (control.closest('[data-variant="plain"]')) {
    const parent = root.parentElement;
    return [parent, parent?.parentElement].some((node) => node && shown(node) && edged(node));
  }
  return false;
}

const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** An item's look with its highlight. */
const highlightedLook = (item: Element) => look(item);

/** An item's look with its `data-highlighted` taken off for the reading, then put back as it was. */
function unhighlightedLook(item: Element): string {
  const value = item.getAttribute("data-highlighted")!;
  item.removeAttribute("data-highlighted");
  try {
    return look(item);
  } finally {
    item.setAttribute("data-highlighted", value);
  }
}

/** The controls a person can see and reach under `root`, or in the open popup. */
function seenControls(root: ParentNode): Element[] {
  return collectControls(root).filter((control) => control.getAttribute("aria-hidden") !== "true" && isVisible(control));
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
  const drawn = controls.filter((control) => visual(control) !== null);
  for (const control of drawn.filter((element) => element.matches(onState))) {
    // Against one that is off, not mixed: an indeterminate box is neither.
    const peer = drawn.find((other) => other !== control && partOf(other) === partOf(control) && !other.matches(onState) && !other.matches(mixedState));
    // Sizes aside: a selected tab may be wider than another for its text alone.
    if (peer && look(visual(control)!).replace(/^\S+ \d+ \d+ /gm, "") === look(visual(peer)!).replace(/^\S+ \d+ \d+ /gm, "")) {
      found.push(`${state}: on looks like off: ${describeElement(control)}`);
    }
  }
  // Focus: a keyboard focus must change what the control's component shows. Focus moves from
  // control to control and never leaves for the page, so an open popup stays open; the control
  // that already has focus goes last, once focus has moved away from it. Each control's focused
  // frame is compared with the frame at rest (focus outside it), recorded the first time focus
  // enters it. A frame never at rest (a menu opened with focus on its first item) is compared
  // with the control that had focus left out, before and after, so the cue must be the control's
  // own and not the other's ring going away. A control that takes no keyboard focus here is never
  // compared, and fails.
  await userEvent.keyboard("{Shift}");
  // Inert parts (a tab's hidden panel, a row's actions until it is swiped) take no focus; a part
  // with no tab stop of its own is reached by a screen reader's cursor. The options and items of a
  // list or menu show focus by their highlight, which the keyboard and the pointer both move (from
  // the field, through `aria-activedescendant`, or onto the item), so it is the highlight they check.
  const reachable = () =>
    seenControls(root).filter((control) => control instanceof HTMLElement && !control.matches(":disabled, [aria-disabled='true']") && control.closest("[inert]") === null) as HTMLElement[];
  const focusableIn = (list: HTMLElement[]) => list.filter((control) => control.matches(tabStop) && !control.matches(virtualItem));
  // The item highlighted when the list opened goes last, once the highlight has moved off it.
  const virtual = reachable().filter((control) => control.matches(virtualItem) && !control.hasAttribute("data-disabled"));
  virtual.sort((a, b) => Number(a.hasAttribute("data-highlighted")) - Number(b.hasAttribute("data-highlighted")));
  const pending = focusableIn(reachable());
  pending.sort((a, b) => Number(a === document.activeElement) - Number(b === document.activeElement));
  const queued = new Set<Element>(pending);
  const rest = new Map<Element, string>();
  while (pending.length > 0) {
    const control = pending.shift()!;
    // Hidden by an earlier focus (a tab's panel, left for another): not shown, so not compared.
    if (!control.isConnected || !isVisible(control) || control.closest("[inert]") !== null) continue;
    const around = frame(control);
    if (document.activeElement === control) {
      // The only control left, with focus since the story or popup opened: blur it to see its frame without it.
      control.blur();
      if (document.activeElement === control) {
        found.push(`${state}: focus never compared, it cannot leave: ${describeElement(control)}`);
        continue;
      }
    }
    if (!around.contains(document.activeElement)) rest.set(around, look(around));
    const prior = document.activeElement;
    const resting = rest.get(around);
    // Never at rest: the frame with the control that has focus left out.
    const masked = resting === undefined ? prior : null;
    const before = resting ?? look(around, masked, control);
    control.focus();
    await frames();
    let now = document.activeElement;
    let from = prior;
    // Focus that stayed where it was may be a part sending it on to the control that already has
    // it (OtpField's slot to the first empty one, which has focus): from outside the frame, at
    // rest, the move shows.
    if (now === prior && prior !== control && resting !== undefined && prior instanceof HTMLElement && around.contains(prior)) {
      prior.blur();
      await frames();
      if (!around.contains(document.activeElement)) {
        from = document.activeElement;
        control.focus();
        await frames();
        now = document.activeElement;
      }
    }
    if (now !== control && now !== from && now instanceof HTMLElement && around.contains(now) && partOf(now) === partOf(control)) {
      // A part that sends focus on to another of its kind in its component (OtpField's slot to the
      // first empty one) is compared at that one's turn. Focus that never moved, or that went to
      // another kind of part, is no redirect: the control takes no focus.
      if (!queued.has(now) && now.matches(tabStop)) {
        queued.add(now);
        pending.push(now);
      }
    } else if (now !== control || !control.matches(":focus-visible")) {
      found.push(`${state}: focus never compared, it takes no keyboard focus: ${describeElement(control)}`);
    } else if (look(around, masked, control) === before) {
      found.push(`${state}: focus shows nothing: ${describeElement(control)}`);
    }
    // Focus can change what is shown (a tab that shows its panel as it takes focus): the controls
    // that appeared are compared too.
    for (const shownNow of focusableIn(reachable())) {
      if (!queued.has(shownNow)) {
        queued.add(shownNow);
        pending.push(shownNow);
      }
    }
  }
  // A list's highlighted item stands for focus: the highlight must show, moving from item to item.
  for (const control of virtual) {
    const around = frame(control);
    const before = look(around);
    // A list that loads as you search may redraw under the pointer, so point at the item until it highlights.
    for (let tries = 0; tries < 5 && !control.hasAttribute("data-highlighted"); tries += 1) {
      await userEvent.hover(control);
      await new Promise((resolve) => setTimeout(resolve, tries * 50));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    if (!control.hasAttribute("data-highlighted")) {
      found.push(`${state}: highlight never compared, the item does not highlight: ${describeElement(control)}`);
      continue;
    }
    // The only item of its list, highlighted from the start, has nothing to move from: it must look
    // different with its highlight than with the highlight taken off.
    const alone = !virtual.some((other) => other !== control && around.contains(other));
    if (alone ? highlightedLook(control) === unhighlightedLook(control) : look(around) === before) found.push(`${state}: highlight shows nothing: ${describeElement(control)}`);
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

/** What the check finds for one story: each gap, closed and with each overlay open. */
async function forcedColourProblems({ id, Story, parameters }: StoryEntry): Promise<string[]> {
  const host = await renderStory(Story);
  layOut(host, parameters);
  await settle();
  const found = await gaps(document.body, "closed");
  for (const opener of overlayOpeners(id, host, parameters)) {
    const popup = await openOverlay(opener);
    found.push(...(await gaps(popup, `with "${opener.name}" open`)));
    if (openPopup()) await closeOverlay();
  }
  return [...new Set(found)];
}

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("forced colours at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  it.each(conformanceStories)("$id keeps every control's edge, state and focus, closed and with each overlay open", async (entry) => {
    expect((await forcedColourProblems(entry)).join("\n")).toBe("");
  });
});

describe("forced colours proves it can fail", () => {
  beforeEach(async () => {
    await page.viewport(390, 844);
  });

  it.each(
    brokenFor({
      ShadowFocusRing: "focus shows nothing",
      FillOnlyEdge: "no edge",
      SiblingShadowFocus: 'focus shows nothing: unmarked <button type="button" class="broken-pair-shadow"',
      FocusRefused: "focus never compared, it takes no keyboard focus: broken-refuse/second",
      LoneFillHighlight: "highlight shows nothing",
    }),
  )("on $id", async (entry) => {
    expect((await forcedColourProblems(entry)).join("\n")).toContain(entry.expected);
  });
});
