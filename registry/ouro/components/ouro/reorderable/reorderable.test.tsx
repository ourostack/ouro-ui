import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Reorderable, type ReorderableProps } from "@/registry/ouro/components/ouro/reorderable/reorderable";
import { dropIndex, edgeSpeed, EDGE, MAX_SPEED, moveItem, scrollParent } from "@/registry/ouro/components/ouro/reorderable/reorderable-styles";
import { rubberband } from "@/registry/ouro/lib/ouro/spring";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames, type HeldFrames } from "@/registry/ouro/lib/ouro/testing/frames";

// Touch drags are in reorderable.touch.test.tsx. Here the keyboard runs in Chromium and
// WebKit, pointer events are dispatched so both run the drag paths, and a real mouse
// drag runs in Chromium.

const chromiumOnly = it.skipIf(server.browser !== "chromium");

let root: Root | undefined;
let host: HTMLElement;
const nodes: Element[] = [];

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error");
});
/** Animation frames, when a test holds them still to look at a spring mid-flight. */
let frames: HeldFrames | undefined;
const freeze = () => (frames ??= holdFrames());
afterEach(async () => {
  frames?.release();
  frames = undefined;
  await commands.pointerPress({ action: "up" });
  await act(async () => root?.unmount());
  root = undefined;
  for (const node of nodes.splice(0)) node.remove();
  scrollTo(0, 0);
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

async function render(node: ReactNode) {
  if (!root) {
    host = document.createElement("div");
    host.style.width = "360px";
    document.body.append(host);
    nodes.push(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(node));
  return host.querySelector<HTMLElement>("[data-ouro-reorderable-list]")!;
}

const names = ["Sear", "Soften", "Deglaze", "Braise"];
const steps = (list = names) => list.map((name) => ({ id: name.toLowerCase(), label: name, content: <div style={{ height: 48 }}>{name}</div> }));

function list(props: Partial<ReorderableProps> = {}) {
  return <Reorderable label="Steps" items={steps()} {...props} />;
}

const rows = (element: HTMLElement) => [...element.children] as HTMLElement[];
const order = (element: HTMLElement) => rows(element).map((row) => row.querySelector("[data-ouro-reorderable-content]")!.textContent);
const handle = (name: string) => page.getByRole("button", { name: `Reorder ${name}`, exact: true }).element() as HTMLButtonElement;
const said = () => document.querySelector("[data-ouro-announcer]")?.textContent ?? "";

/** Focuses a handle the way the keyboard does. */
async function focus(name: string) {
  await act(async () => handle(name).focus());
}

async function press(keys: string) {
  await userEvent.keyboard(keys);
  await act(async () => {});
}

function middle(element: Element): [number, number] {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

/** The time the next dispatched event carries, in ms. */
let clock = 1000;
/** Lets `ms` pass before the next event: 16 is a pointer still moving, 300 one that has rested. */
const wait = (ms: number) => {
  clock += ms;
};

/** Dispatches one pointer event, as the primary mouse button unless `init` says otherwise, and flushes React. */
async function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  let event!: PointerEvent;
  await act(async () => {
    event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: y, ...init });
    Object.defineProperty(event, "timeStamp", { value: clock });
    target.dispatchEvent(event);
  });
  return event;
}

/** Presses a handle and moves the pointer `dy` px in four steps 16ms apart, then lets it rest, still down. */
async function dragBy(name: string, dy: number) {
  const [x, y] = middle(handle(name));
  wait(1000);
  await pointer(handle(name), "pointerdown", x, y);
  for (let step = 1; step <= 4; step++) {
    wait(16);
    await pointer(window, "pointermove", x, y + (dy * step) / 4);
  }
  wait(300);
  return [x, y + dy] as const;
}

/** How far a row is from its place, in px, to a hundredth. */
const shifted = (row: HTMLElement) => Math.round(Number.parseFloat(/translateY\((.+)px\)/.exec(row.style.transform)?.[1] ?? "0") * 100) / 100;
/** Brings every spring to rest: steps the frames a test holds and gives them back, or waits for real ones. */
const rest = async (element: HTMLElement) => {
  if (!frames) return expect.poll(() => element.hasAttribute("data-ouro-settling")).toBe(false);
  frames.until(() => !element.hasAttribute("data-ouro-settling"));
  frames.release();
  frames = undefined;
};

describe("Reorderable", () => {
  it("renders a named list of rows, each with a handle that says how to use it", async () => {
    const element = await render(list());
    expect(element.tagName).toBe("OL");
    expect(page.getByRole("list", { name: "Steps" }).element()).toBe(element);
    expect(page.getByRole("listitem").elements().length).toBe(4);
    expect(order(element)).toEqual(names);
    const grip = handle("Soften");
    expect(grip.getAttribute("aria-pressed")).toBe("false");
    expect(grip.getAttribute("type")).toBe("button");
    const described = document.getElementById(grip.getAttribute("aria-describedby")!)!;
    expect(described.textContent).toBe("Press Space to pick up. Use the arrow keys to move, Space to drop, and Escape to cancel.");
    expect(described.hidden).toBe(true);
    await expect.element(page.getByRole("button", { name: "Reorder Soften" })).toHaveAccessibleDescription(described.textContent!);
    expect(element.closest('[data-ouro="reorderable"]')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("shows a row's label when it has no content", async () => {
    const element = await render(<Reorderable label="Tags" items={[{ id: "a", label: "Vegetarian" }, { id: "b", label: "Quick" }]} />);
    expect(order(element)).toEqual(["Vegetarian", "Quick"]);
  });

  describe("from the keyboard", () => {
    it("picks a row up with Space, moves it with the arrows, drops it with Space, and announces each step with its position", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      await focus("Sear");
      await press(" ");
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("true");
      expect(rows(element)[0]!.hasAttribute("data-grabbed")).toBe(true);
      await expect.poll(said).toBe("Sear picked up. Position 1 of 4.");

      // A move from the keyboard does not animate: every row is in its place at once.
      const still = () => {
        expect(element.hasAttribute("data-ouro-settling")).toBe(false);
        for (const row of rows(element)) {
          expect(row.style.transform).toBe("");
          expect(row.getAnimations().length).toBe(0);
        }
      };
      await press("{ArrowDown}");
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      still();
      // Focus stays on the handle although its row moved in the page.
      expect(document.activeElement).toBe(handle("Sear"));
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("true");
      await expect.poll(said).toBe("Sear moved. Position 2 of 4.");

      await press("{ArrowDown}");
      await expect.poll(said).toBe("Sear moved. Position 3 of 4.");
      await press("{ArrowUp}");
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(document.activeElement).toBe(handle("Sear"));
      await expect.poll(said).toBe("Sear moved. Position 2 of 4.");
      expect(onReorder).not.toHaveBeenCalled();

      await press(" ");
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("false");
      expect(rows(element)[1]!.hasAttribute("data-grabbed")).toBe(false);
      await expect.poll(said).toBe("Sear dropped. Position 2 of 4.");
      still();
      expect(onReorder.mock.calls).toEqual([[["soften", "sear", "deglaze", "braise"], { id: "sear", from: 0, to: 1 }]]);
      expect(document.activeElement).toBe(handle("Sear"));
      // Dropped, the arrows are the page's again.
      await press("{ArrowDown}");
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
    });

    it("says the position again at either end instead of moving", async () => {
      const element = await render(list());
      await focus("Sear");
      await press("{Enter}");
      await expect.poll(said).toBe("Sear picked up. Position 1 of 4.");
      await press("{ArrowUp}");
      await expect.poll(said).toBe("Sear moved. Position 1 of 4.");
      expect(order(element)).toEqual(names);
      await press("{ArrowDown}{ArrowDown}{ArrowDown}");
      await expect.poll(said).toBe("Sear moved. Position 4 of 4.");
      await press("{ArrowDown}");
      expect(order(element)).toEqual(["Soften", "Deglaze", "Braise", "Sear"]);
      expect(document.activeElement).toBe(handle("Sear"));
    });

    it("puts the row back on Escape, announces it and reports nothing", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const escapes: boolean[] = [];
      const listener = (event: KeyboardEvent) => {
        if (event.key === "Escape") escapes.push(event.defaultPrevented);
      };
      document.addEventListener("keydown", listener);
      await focus("Braise");
      await press(" ");
      await press("{ArrowUp}{ArrowUp}");
      expect(order(element)).toEqual(["Sear", "Braise", "Soften", "Deglaze"]);
      await press("{Escape}");
      expect(order(element)).toEqual(names);
      expect(handle("Braise").getAttribute("aria-pressed")).toBe("false");
      expect(document.activeElement).toBe(handle("Braise"));
      await expect.poll(said).toBe("Braise put back. Position 4 of 4.");
      expect(onReorder).not.toHaveBeenCalled();
      // That Escape stopped at the list. With nothing picked up, Escape is the page's.
      expect(escapes).toEqual([]);
      await press("{Escape}");
      document.removeEventListener("keydown", listener);
      expect(escapes).toEqual([false]);
    });

    it("drops a row in place without reporting when it did not move", async () => {
      const onReorder = vi.fn();
      await render(list({ onReorder }));
      await focus("Soften");
      await press(" ");
      await press("{ArrowDown}{ArrowUp}");
      await press(" ");
      await expect.poll(said).toBe("Soften dropped. Position 2 of 4.");
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("drops the row where it is when focus moves away", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      await focus("Sear");
      await press(" ");
      await press("{ArrowDown}");
      await press("{Tab}");
      expect(document.activeElement).not.toBe(handle("Sear"));
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("false");
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(onReorder.mock.calls).toEqual([[["soften", "sear", "deglaze", "braise"], { id: "sear", from: 0, to: 1 }]]);
      await expect.poll(said).toBe("Sear dropped. Position 2 of 4.");
      // A handle that holds nothing ignores losing focus.
      await focus("Braise");
      await press("{Tab}");
      expect(onReorder).toHaveBeenCalledTimes(1);
    });

    it("leaves the arrow keys alone until a row is picked up", async () => {
      const element = await render(list());
      await focus("Soften");
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
      await act(async () => {
        handle("Soften").dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(order(element)).toEqual(names);
      await press(" ");
      const held = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
      const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
      await act(async () => {
        handle("Soften").dispatchEvent(other);
        handle("Soften").dispatchEvent(held);
      });
      expect(other.defaultPrevented).toBe(false);
      expect(held.defaultPrevented).toBe(true);
      expect(order(element)).toEqual(["Sear", "Deglaze", "Soften", "Braise"]);
    });

    it("keeps the new order on its own, and follows items when they arrive in another order", async () => {
      const element = await render(list());
      await focus("Sear");
      await press(" ");
      await press("{ArrowDown}");
      await press(" ");
      // The app did not change `items`: the list still shows what the user did.
      await render(list({ className: "mt-2" }));
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      await render(<Reorderable label="Steps" items={steps(["Braise", "Sear", "Soften"])} />);
      expect(order(element)).toEqual(["Braise", "Sear", "Soften"]);
    });

    it("lets go of a picked-up row when the app replaces the rows", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      await focus("Sear");
      await press(" ");
      await press("{ArrowDown}");
      await render(<Reorderable label="Steps" items={steps(["Braise", "Sear"])} onReorder={onReorder} />);
      expect(order(element)).toEqual(["Braise", "Sear"]);
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("false");
      await press("{ArrowUp}");
      expect(order(element)).toEqual(["Braise", "Sear"]);
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("speaks and names with the labels the app passes", async () => {
      await render(
        list({
          handleLabel: "Déplacer {label}",
          instructionsLabel: "Espace pour saisir.",
          pickedUpLabel: "{label} saisi, {n} sur {total}",
          movedLabel: "{label} déplacé, {n} sur {total}",
          droppedLabel: "{label} déposé, {n} sur {total}",
          canceledLabel: "{label} remis, {n} sur {total}",
        }),
      );
      const grip = page.getByRole("button", { name: "Déplacer Sear" });
      await expect.element(grip).toHaveAccessibleDescription("Espace pour saisir.");
      await act(async () => (grip.element() as HTMLElement).focus());
      await press(" ");
      await expect.poll(said).toBe("Sear saisi, 1 sur 4");
      await press("{ArrowDown}");
      await expect.poll(said).toBe("Sear déplacé, 2 sur 4");
      await press("{Escape}");
      await expect.poll(said).toBe("Sear remis, 1 sur 4");
      await press(" ");
      await press(" ");
      await expect.poll(said).toBe("Sear déposé, 1 sur 4");
    });
  });

  describe("with a pointer", () => {
    it("moves the row with the pointer, makes room in the rows it passes, and reports the drop once", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const [first, second, third] = rows(element) as [HTMLElement, HTMLElement, HTMLElement];
      const height = first.getBoundingClientRect().height;
      const down = await pointer(handle("Sear"), "pointerdown", ...middle(handle("Sear")));
      // The press selects no text and starts no native drag.
      expect(down.defaultPrevented).toBe(true);
      const [x, y] = middle(handle("Sear"));
      await pointer(window, "pointermove", x, y + 2);
      expect(element.hasAttribute("data-dragging")).toBe(false);
      const far = Math.round(height * 2.2);
      const near = Math.round(height * 1.1);
      await pointer(window, "pointermove", x, y + far);
      expect(element.hasAttribute("data-dragging")).toBe(true);
      expect(first.hasAttribute("data-dragging")).toBe(true);
      expect(first.style.transform).toBe(`translateY(${far}px)`);
      expect(second.style.transform).toBe(`translateY(${-height}px)`);
      expect(third.style.transform).toBe(`translateY(${-height}px)`);
      expect(getComputedStyle(first).zIndex).toBe("10");
      // Back up past the third row: only the second still makes room.
      await pointer(window, "pointermove", x, y + near);
      expect(second.style.transform).toBe(`translateY(${-height}px)`);
      expect(third.style.transform).toBe("");
      expect(onReorder).not.toHaveBeenCalled();
      wait(300);
      freeze();
      await pointer(window, "pointerup", x, y + near);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(onReorder.mock.calls).toEqual([[["soften", "sear", "deglaze", "braise"], { id: "sear", from: 0, to: 1 }]]);
      expect(element.hasAttribute("data-dragging")).toBe(false);
      // The dropped row is in its new place in the list, and starts where it was on screen:
      // it was 1.1 rows down from the first place, so it is 0.1 of a row below the second.
      expect(shifted(first)).toBe(near - height);
      expect(first.getAttribute("data-ouro-settling")).toBe("dropped");
      expect(getComputedStyle(first).zIndex).toBe("10");
      await rest(element);
      for (const row of rows(element)) {
        expect(row.style.transform).toBe("");
        expect(row.hasAttribute("data-ouro-settling")).toBe(false);
      }
      await expect.poll(said).toBe("Sear dropped. Position 2 of 4.");
    });

    it("moves a row up, shifting the rows above it down, and resists past either end of the list", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const all = rows(element);
      const height = all[0]!.getBoundingClientRect().height;
      const up = Math.round(height * 2.2);
      const [x, y] = await dragBy("Braise", -up);
      expect(all[3]!.style.transform).toBe(`translateY(${-up}px)`);
      expect(all[1]!.style.transform).toBe(`translateY(${height}px)`);
      expect(all[2]!.style.transform).toBe(`translateY(${height}px)`);
      expect(all[0]!.style.transform).toBe("");
      // Far above the list the row resists past the first place, and far below past the last:
      // it gives a part of the distance, never all of it and never none.
      const span = element.getBoundingClientRect().height;
      await pointer(window, "pointermove", x, y - 2000);
      expect(shifted(all[3]!)).toBeCloseTo(-height * 3 + rubberband(-(up + 2000 - height * 3), span), 1);
      expect(shifted(all[3]!)).toBeLessThan(-height * 3);
      expect(shifted(all[3]!)).toBeGreaterThan(-height * 3 - span);
      await pointer(window, "pointermove", x, y + 4000);
      expect(shifted(all[3]!)).toBeCloseTo(rubberband(4000 - up, span), 1);
      expect(shifted(all[3]!)).toBeGreaterThan(0);
      await pointer(window, "pointermove", x, y - 2000);
      wait(300);
      await pointer(window, "pointerup", x, y - 2000);
      expect(order(element)).toEqual(["Braise", "Sear", "Soften", "Deglaze"]);
      expect(onReorder.mock.calls).toEqual([[["braise", "sear", "soften", "deglaze"], { id: "braise", from: 3, to: 0 }]]);
    });

    it("reports nothing for a press that does not move, or a drag dropped where it began", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const [x, y] = middle(handle("Soften"));
      await pointer(handle("Soften"), "pointerdown", x, y);
      await pointer(window, "pointerup", x, y);
      // The pointer's click is not the keyboard's: nothing is picked up.
      await act(async () => {
        handle("Soften").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      });
      expect(handle("Soften").getAttribute("aria-pressed")).toBe("false");
      const before = said();
      await dragBy("Soften", 10);
      await pointer(window, "pointerup", x, y + 10);
      expect(order(element)).toEqual(names);
      expect(onReorder).not.toHaveBeenCalled();
      await expect.poll(said).toBe("Soften dropped. Position 2 of 4.");
      expect(before).not.toBe("Soften dropped. Position 2 of 4.");
    });

    it("puts the row back when the browser cancels the drag or the user presses Escape", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const [x, y] = await dragBy("Sear", 120);
      freeze();
      await pointer(window, "pointercancel", x, y);
      expect(order(element)).toEqual(names);
      expect(element.hasAttribute("data-dragging")).toBe(false);
      // It springs back from where it was let go.
      expect(shifted(rows(element)[0]!)).toBe(120);
      await rest(element);
      for (const row of rows(element)) expect(row.style.transform).toBe("");
      await expect.poll(said).toBe("Sear put back. Position 1 of 4.");

      await dragBy("Deglaze", -120);
      const seen: boolean[] = [];
      const listener = (event: KeyboardEvent) => seen.push(event.defaultPrevented);
      document.addEventListener("keydown", listener);
      await press("a");
      expect(element.hasAttribute("data-dragging")).toBe(true);
      await press("{Escape}");
      document.removeEventListener("keydown", listener);
      // The Escape that cancelled the drag stopped there.
      expect(seen).toEqual([false]);
      expect(order(element)).toEqual(names);
      expect(element.hasAttribute("data-dragging")).toBe(false);
      await expect.poll(said).toBe("Deglaze put back. Position 3 of 4.");
      // The drag is over: the pointer, still down, moves nothing, and its release does nothing more.
      await pointer(window, "pointermove", 0, 0);
      expect(element.hasAttribute("data-dragging")).toBe(false);
      await rest(element);
      for (const row of rows(element)) expect(row.style.transform).toBe("");
      await pointer(window, "pointerup", 0, 0);
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("ignores Escape before the press has become a drag", async () => {
      const element = await render(list());
      const [x, y] = middle(handle("Sear"));
      await pointer(handle("Sear"), "pointerdown", x, y);
      await press("{Escape}");
      await pointer(window, "pointermove", x, y + 80);
      expect(element.hasAttribute("data-dragging")).toBe(true);
      await pointer(window, "pointerup", x, y + 80);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
    });

    it("drags with one pointer and its primary button only", async () => {
      const element = await render(list());
      const [x, y] = middle(handle("Sear"));
      const right = await pointer(handle("Sear"), "pointerdown", x, y, { button: 2 });
      expect(right.defaultPrevented).toBe(false);
      await pointer(handle("Sear"), "pointerdown", x, y, { isPrimary: false, pointerId: 5 });
      await pointer(window, "pointermove", x, y + 100, { pointerId: 5 });
      expect(element.hasAttribute("data-dragging")).toBe(false);

      await pointer(handle("Sear"), "pointerdown", x, y);
      // A press on another handle mid-drag starts nothing, and other pointers do not steer or end it.
      await pointer(handle("Braise"), "pointerdown", ...middle(handle("Braise")), { pointerId: 2, isPrimary: false });
      await pointer(window, "pointermove", x, y + 300, { pointerId: 2 });
      expect(element.hasAttribute("data-dragging")).toBe(false);
      await pointer(window, "pointermove", x, y + 80);
      await pointer(window, "pointerup", x, y + 80, { pointerId: 2 });
      await pointer(window, "pointercancel", x, y + 80, { pointerId: 2 });
      expect(element.hasAttribute("data-dragging")).toBe(true);
      await pointer(window, "pointerup", x, y + 80);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
    });

    it("drops a row the keyboard holds before a pointer starts a drag", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      await focus("Sear");
      await press(" ");
      await press("{ArrowDown}");
      await dragBy("Braise", -200);
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("false");
      expect(onReorder.mock.calls).toEqual([[["soften", "sear", "deglaze", "braise"], { id: "sear", from: 0, to: 1 }]]);
      // While a pointer drags, the keyboard picks nothing up.
      await act(async () => handle("Soften").click());
      expect(handle("Soften").getAttribute("aria-pressed")).toBe("false");
      await pointer(window, "pointerup", 0, 0);
      expect(order(element)).toEqual(["Braise", "Soften", "Sear", "Deglaze"]);
      expect(onReorder).toHaveBeenCalledTimes(2);
    });

    it("reports nothing when the app replaces the rows under a drag", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const [x, y] = await dragBy("Sear", 120);
      await render(<Reorderable label="Steps" items={steps(["Braise", "Sear"])} onReorder={onReorder} />);
      await pointer(window, "pointerup", x, y);
      expect(order(element)).toEqual(["Braise", "Sear"]);
      expect(onReorder).not.toHaveBeenCalled();
      expect(element.hasAttribute("data-dragging")).toBe(false);
      for (const row of rows(element)) expect(row.style.transform).toBe("");
    });

    it("drops a flicked row the way it was moving, half a row short of the next place", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const height = rows(element)[0]!.getBoundingClientRect().height;
      const [x, y] = middle(handle("Sear"));
      // 0.6 of a row down: with a rested pointer that is not far enough to pass the second row.
      const [, restedY] = await dragBy("Sear", height * 0.6);
      await pointer(window, "pointerup", x, restedY);
      expect(order(element)).toEqual(names);
      await rest(element);
      // The same distance with the pointer still moving down when it lifts.
      wait(1000);
      await pointer(handle("Sear"), "pointerdown", x, y);
      for (let step = 1; step <= 4; step++) {
        wait(16);
        await pointer(window, "pointermove", x, y + (height * 0.6 * step) / 4);
      }
      wait(16);
      await pointer(window, "pointerup", x, y + height * 0.6);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(onReorder.mock.calls).toEqual([[["soften", "sear", "deglaze", "braise"], { id: "sear", from: 0, to: 1 }]]);
      await rest(element);

      // A flick back toward where it began does not take a place the row had only just reached.
      const [x2, y2] = middle(handle("Deglaze"));
      wait(1000);
      await pointer(handle("Deglaze"), "pointerdown", x2, y2);
      for (let step = 1; step <= 4; step++) {
        wait(16);
        await pointer(window, "pointermove", x2, y2 + (height * 1.3 * step) / 4);
      }
      for (let step = 1; step <= 8; step++) {
        wait(16);
        await pointer(window, "pointermove", x2, y2 + height * (1.3 - 0.04 * step));
      }
      wait(16);
      await pointer(window, "pointerup", x2, y2 + height * 0.98);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(onReorder).toHaveBeenCalledTimes(1);
    });

    it("springs a dropped row into its place with the speed it was let go at, and the rows it passed with none", async () => {
      const element = await render(list());
      const height = rows(element)[0]!.getBoundingClientRect().height;
      const [x, y] = middle(handle("Sear"));
      const dragged = rows(element)[0]!;
      wait(1000);
      await pointer(handle("Sear"), "pointerdown", x, y);
      for (let step = 1; step <= 6; step++) {
        wait(16);
        await pointer(window, "pointermove", x, y + (height * 1.8 * step) / 6);
      }
      wait(16);
      freeze();
      await pointer(window, "pointerup", x, y + height * 1.8);
      // Dropped in the third place, 0.2 of a row short of it, still moving down fast.
      expect(order(element)).toEqual(["Soften", "Deglaze", "Sear", "Braise"]);
      const passed = rows(element)[1]!;
      // Where each is at every 16ms frame until all are at rest.
      const seen = [shifted(dragged)];
      const others = [shifted(passed)];
      while (element.hasAttribute("data-ouro-settling")) {
        frames!.step(16);
        seen.push(shifted(dragged));
        others.push(shifted(passed));
      }
      await rest(element);
      expect(seen[0]).toBeCloseTo(-height * 0.2, 1);
      // Its speed carried it past its place before it came back: the flick's little bounce.
      expect(Math.max(...seen)).toBeGreaterThan(0.5);
      expect(seen.at(-1)).toBe(0);
      // A row it passed starts where it stood, a row lower, and closes in without passing its place.
      expect(others[0]).toBe(height);
      expect(Math.min(...others)).toBe(0);
      for (let index = 1; index < others.length; index++) expect(others[index]!).toBeLessThanOrEqual(others[index - 1]!);
      expect(dragged.style.transform).toBe("");
      // No CSS transition moves any row once the drag is over.
      for (const row of rows(element)) expect(getComputedStyle(row).transitionDuration).toBe("0s");
    });

    it("can be picked up again while it springs into place, and carries on from where it was caught", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const height = rows(element)[0]!.getBoundingClientRect().height;
      const dragged = rows(element)[0]!;
      const [x, y] = await dragBy("Sear", height * 1.6);
      freeze();
      await pointer(window, "pointerup", x, y);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(element.hasAttribute("data-ouro-settling")).toBe(true);
      frames!.until(() => shifted(dragged) < height * 0.6 - 1);
      expect(shifted(dragged)).toBeGreaterThan(0);
      // A press on its handle mid-settle does not stop it; once the press is a drag, the row is caught where it is.
      const [hx, hy] = middle(handle("Sear"));
      wait(1000);
      await pointer(handle("Sear"), "pointerdown", hx, hy);
      expect(dragged.getAttribute("data-ouro-settling")).toBe("dropped");
      wait(16);
      await pointer(window, "pointermove", hx, hy + 12);
      expect(dragged.hasAttribute("data-ouro-settling")).toBe(false);
      expect(element.hasAttribute("data-ouro-settling")).toBe(false);
      const caught = Math.round((shifted(dragged) - 12) * 100) / 100;
      expect(caught).toBeGreaterThanOrEqual(0);
      expect(caught).toBeLessThan(height * 0.6);
      // No frame moves it now.
      frames!.step(32);
      expect(shifted(dragged)).toBe(Math.round((caught + 12) * 100) / 100);
      // The drag goes on from there, 1:1 with the pointer.
      wait(16);
      await pointer(window, "pointermove", hx, hy + 20);
      expect(shifted(dragged)).toBeCloseTo(caught + 20, 1);
      wait(300);
      await pointer(window, "pointerup", hx, hy + 20);
      await rest(element);
      expect(order(element)).toEqual(["Soften", "Sear", "Deglaze", "Braise"]);
      expect(dragged.style.transform).toBe("");

      // A press and release without a drag leaves a settling row on its way.
      const [x2, y2] = await dragBy("Sear", height * 0.8);
      freeze();
      await pointer(window, "pointerup", x2, y2);
      frames!.step(16);
      expect(element.hasAttribute("data-ouro-settling")).toBe(true);
      const [hx2, hy2] = middle(handle("Sear"));
      wait(1000);
      await pointer(handle("Sear"), "pointerdown", hx2, hy2);
      await pointer(window, "pointerup", hx2, hy2);
      expect(dragged.getAttribute("data-ouro-settling")).toBe("dropped");
      await rest(element);
      expect(dragged.style.transform).toBe("");
      expect(onReorder).toHaveBeenCalledTimes(1);
    });

    it("lets another row be dragged while the last one settles, measuring places from where rows rest", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const height = rows(element)[0]!.getBoundingClientRect().height;
      const [x, y] = await dragBy("Sear", height * 1.6);
      freeze();
      await pointer(window, "pointerup", x, y);
      frames!.step(16);
      frames!.step(16);
      expect(element.hasAttribute("data-ouro-settling")).toBe(true);
      // Sear is still on its way to the second place when Braise is dragged up past it.
      const top = element.getBoundingClientRect().top;
      const [bx, by] = middle(handle("Braise"));
      wait(1000);
      await pointer(handle("Braise"), "pointerdown", bx, by);
      for (let step = 1; step <= 4; step++) {
        wait(16);
        await pointer(window, "pointermove", bx, by - (height * 2.2 * step) / 4);
      }
      // The drag took the rows over: none is settling, and the passed rows make room.
      expect(element.hasAttribute("data-ouro-settling")).toBe(false);
      expect(shifted(rows(element)[1]!)).toBe(height);
      expect(shifted(rows(element)[2]!)).toBe(height);
      wait(300);
      await pointer(window, "pointerup", bx, by - height * 2.2);
      expect(order(element)).toEqual(["Soften", "Braise", "Sear", "Deglaze"]);
      await rest(element);
      // Soften was caught mid-spring when the drag began and slid home with the rows making room, a CSS transition: wait for it too.
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
      expect(rows(element).map((row) => Math.round(row.getBoundingClientRect().top - top))).toEqual([0, 1, 2, 3].map((index) => Math.round(index * height)));
    });

    it("captures the pointer once the press has become a drag, not before", async () => {
      await render(list());
      const capture = vi.spyOn(handle("Sear"), "setPointerCapture");
      const [x, y] = middle(handle("Sear"));
      await pointer(handle("Sear"), "pointerdown", x, y);
      await pointer(window, "pointermove", x, y + 9);
      expect(capture).not.toHaveBeenCalled();
      await pointer(window, "pointermove", x, y + 12);
      expect(capture.mock.calls).toEqual([[1]]);
      await pointer(window, "pointermove", x, y + 30);
      expect(capture).toHaveBeenCalledTimes(1);
      await pointer(window, "pointerup", x, y + 30);
    });

    it("holds a lone row in place", async () => {
      const onReorder = vi.fn();
      const element = await render(<Reorderable label="Steps" items={steps(["Sear"])} onReorder={onReorder} />);
      const [x, y] = await dragBy("Sear", 200);
      expect(element.hasAttribute("data-dragging")).toBe(true);
      // With nowhere to go it gives a little under the pointer, and springs back.
      const height = rows(element)[0]!.getBoundingClientRect().height;
      expect(shifted(rows(element)[0]!)).toBeCloseTo(rubberband(200, height), 1);
      await pointer(window, "pointerup", x, y);
      await rest(element);
      expect(rows(element)[0]!.style.transform).toBe("");
      expect(onReorder).not.toHaveBeenCalled();
      await expect.poll(said).toBe("Sear dropped. Position 1 of 1.");
    });

    it("stops listening when it unmounts mid-drag", async () => {
      await render(list());
      const removed = vi.spyOn(window, "removeEventListener");
      const cancelled = vi.spyOn(window, "cancelAnimationFrame");
      const [x, y] = await dragBy("Sear", 60);
      await act(async () => root!.unmount());
      root = undefined;
      expect(removed.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]));
      expect(cancelled).toHaveBeenCalled();
      await pointer(window, "pointermove", x, y + 40);
      await pointer(window, "pointerup", x, y + 40);
    });

    it("scrolls a list that scrolls in place while the pointer is held near its bottom edge, then near its top", async () => {
      const many = Array.from({ length: 12 }, (_, index) => `Step ${index + 1}`);
      const onReorder = vi.fn();
      const element = await render(<Reorderable label="Steps" items={steps(many)} onReorder={onReorder} className="h-60 overflow-auto" />);
      const scroller = element.parentElement!;
      expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
      const box = scroller.getBoundingClientRect();
      const [x, y] = middle(handle("Step 1"));
      await pointer(handle("Step 1"), "pointerdown", x, y);
      await pointer(window, "pointermove", x, y + 40);
      // In the middle of the list nothing scrolls.
      await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(scroller.scrollTop).toBe(0);
      await pointer(window, "pointermove", x, box.bottom - 6);
      await expect.poll(() => scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight);
      // The row came along: it is still under the pointer, at the end of the list.
      const dragged = rows(element)[0]!.getBoundingClientRect();
      expect(dragged.bottom).toBeGreaterThan(box.bottom - 60);
      expect(dragged.top).toBeLessThan(box.bottom);
      await pointer(window, "pointermove", x, box.top + 6);
      await expect.poll(() => scroller.scrollTop).toBe(0);
      await pointer(window, "pointermove", x, box.bottom - 6);
      await expect.poll(() => scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight);
      await pointer(window, "pointerup", x, box.bottom - 6);
      expect(onReorder.mock.calls).toEqual([[[...many.slice(1), "Step 1"].map((name) => name.toLowerCase()), { id: "step 1", from: 0, to: 11 }]]);
      // Dropped, the list stops scrolling.
      const rest = scroller.scrollTop;
      await act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(scroller.scrollTop).toBe(rest);
    });

    chromiumOnly("reorders with a real mouse drag on the handle", async () => {
      const onReorder = vi.fn();
      const element = await render(list({ onReorder }));
      const [x, y] = middle(handle("Sear"));
      const [, target] = middle(rows(element)[2]!);
      await commands.drag({ from: [x, y], to: [x + 10, target + 8], steps: 8, durationMs: 160 });
      await expect.poll(() => onReorder.mock.calls.length).toBe(1);
      expect(order(element)).toEqual(["Soften", "Deglaze", "Sear", "Braise"]);
      expect(onReorder).toHaveBeenCalledWith(["soften", "deglaze", "sear", "braise"], { id: "sear", from: 0, to: 2 });
      // The mouse's click at the end picks nothing up.
      expect(handle("Sear").getAttribute("aria-pressed")).toBe("false");
    });

    chromiumOnly("scrolls the page while a real mouse holds a row near the bottom of the window", async () => {
      const many = Array.from({ length: 30 }, (_, index) => `Step ${index + 1}`);
      const element = await render(<Reorderable label="Steps" items={steps(many)} />);
      expect(document.documentElement.scrollHeight).toBeGreaterThan(innerHeight);
      const [x, y] = middle(handle("Step 1"));
      await commands.drag({ from: [x, y], to: [x, innerHeight - 8], steps: 6, durationMs: 120, hold: true });
      await expect.poll(() => scrollY).toBeGreaterThan(200);
      expect(element.hasAttribute("data-dragging")).toBe(true);
      await commands.pointerPress({ action: "up" });
      await expect.poll(() => element.hasAttribute("data-dragging")).toBe(false);
      expect(order(element).indexOf("Step 1")).toBeGreaterThan(8);
    });
  });

  it("has helpers that place, move and scroll", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    // A row passes another when its center reaches the other's, from either side.
    expect(dropIndex([10, 30, 50], 0, 29)).toBe(0);
    expect(dropIndex([10, 30, 50], 0, 30)).toBe(1);
    expect(dropIndex([10, 30, 50], 0, 50)).toBe(2);
    expect(dropIndex([10, 30, 50], 2, 31)).toBe(2);
    expect(dropIndex([10, 30, 50], 2, 30)).toBe(1);
    expect(dropIndex([10, 30, 50], 2, 5)).toBe(0);
    expect(dropIndex([10, 30, 50], 1, 30)).toBe(1);
    // Nothing in the middle, full speed at an edge and past it, and upward near the top.
    expect(edgeSpeed(300, 0, 600)).toBe(0);
    expect(edgeSpeed(600, 0, 600)).toBe(MAX_SPEED);
    expect(edgeSpeed(700, 0, 600)).toBe(MAX_SPEED);
    expect(edgeSpeed(0, 0, 600)).toBe(-MAX_SPEED);
    expect(edgeSpeed(600 - EDGE / 2, 0, 600)).toBe(MAX_SPEED / 2);
    // An element that is not in the page scrolls with the page.
    expect(scrollParent(document.createElement("div"))).toBe(document.documentElement);
    const fixed = document.createElement("div");
    fixed.style.cssText = "height:40px;overflow:scroll";
    const inner = document.createElement("div");
    fixed.append(inner);
    document.body.append(fixed);
    nodes.push(fixed);
    // A scroller with nothing to scroll is passed over.
    expect(scrollParent(inner)).toBe(document.documentElement);
    inner.style.height = "400px";
    expect(scrollParent(inner)).toBe(fixed);
  });

  it.each([
    ["no label", { label: "" }, "label is required; it names the list for screen readers", '<Reorderable label="Steps">'],
    [
      "two rows with one id",
      { items: [{ id: "a", label: "One" }, { id: "a", label: "Two" }] },
      "two rows have the same id, so only the first shows",
      'give each row its own id: items={[{ id: "1", label: "…" }, { id: "2", label: "…" }]}',
    ],
    ["a row with no label", { items: [{ id: "a", label: "" }] }, "a row has no label; it names the row's handle", '{ id: "1", label: "Sear the ribs" }'],
    ["values", { values: [] }, "values is not a prop", 'items={[{ id: "1", label: "Sear the ribs", content: <Item title="Sear the ribs" /> }]}'],
    ["children", { children: "x" }, "children is not a prop; rows are data", 'items={[{ id: "1", label: "Sear the ribs", content: <Item title="Sear the ribs" /> }]}'],
    [
      "renderItem",
      { renderItem: () => null },
      "renderItem is not a prop; each row's content is in its item",
      'items={[{ id: "1", label: "Sear the ribs", content: <Item title="Sear the ribs" /> }]}',
    ],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "onReorder={(ids) => save(ids)}"],
    ["onDragEnd", { onDragEnd: () => {} }, "onDragEnd is not a prop", "onReorder={(ids) => save(ids)}"],
    ["axis", { axis: "y" }, "axis is not a prop; Reorderable is a vertical list", '<Reorderable label="Steps" items={…}>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    await render(list(extra as unknown as Partial<ReorderableProps>));
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Reorderable: ${problem}. Fix: ${fix}.`);
  });

  it("shows only the first of two rows with one id", async () => {
    const element = await render(<Reorderable label="Tags" items={[{ id: "a", label: "One" }, { id: "a", label: "Two" }, { id: "b", label: "Three" }]} />);
    expect(order(element)).toEqual(["One", "Three"]);
  });

  it("takes layout classes and warns about appearance classes", async () => {
    const element = await render(list({ className: "mt-2" }));
    expect(element.parentElement!.classList.contains("mt-2")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    root = undefined;
    await render(list({ className: "bg-red-500" }));
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Reorderable: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; style the content you give each row.',
    );
  });

  it("renders to a string as a named list with labelled handles, without warnings", () => {
    const html = renderToString(list());
    expect(html).toContain('data-ouro="reorderable"');
    expect(html).toMatch(/<ol[^>]* role="list"[^>]* aria-label="Steps"/);
    expect(html).toContain('aria-label="Reorder Sear"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Press Space to pick up.");
    expect(warn).not.toHaveBeenCalled();
  });
});
