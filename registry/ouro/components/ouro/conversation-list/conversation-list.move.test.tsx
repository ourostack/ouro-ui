import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ConversationList, type ConversationListItem, type ConversationListSection } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const mounted: Element[] = [];

async function render(node: ReactNode, pane = "width: 360px") {
  const host = document.createElement("div");
  host.style.cssText = pane;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
});

const items: ConversationListItem[] = [
  { id: "notes", title: "Notes to self", preview: "List.", time: "Wed" },
  { id: "pin", title: "Ana Lind", preview: "Notes.", time: "Tue", section: "pinned" },
  { id: "fav", title: "Trail crew", preview: "Gate at eight.", time: "9:41", section: "favorites" },
  { id: "review", title: "Design review", name: "Design review, weekly", preview: "Mockups.", time: "Mon", section: "favorites" },
  { id: "club", title: "Garden club", preview: "Seed swap.", time: "Mon", section: "projects" },
  { id: "work", title: "Standup", preview: "Notes.", time: "Mon", section: "recent" },
];
const sections: ConversationListSection[] = [
  { id: "pinned", title: "Pinned" },
  { id: "favorites", title: "Favorites", acceptsItems: true },
  { id: "projects", title: "Projects", acceptsItems: true },
  { id: "archive", title: "Archive", acceptsItems: true },
  { id: "recent", title: "Recent" },
];

const row = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="row"]')].find((button) => button.querySelector("[data-ouro-conversation-title]")!.textContent!.startsWith(title))!;
const header = (host: HTMLElement, title: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="section"]')].find((button) => button.textContent === title)!;
const lit = (host: HTMLElement) => [...host.querySelectorAll('[data-ouro-part="section"][data-drop="into"]')].map((el) => el.textContent);
const litRows = (host: HTMLElement) => [...host.querySelectorAll('[data-ouro-part="row"][data-drop="into"]')].map((el) => el.querySelector("[data-ouro-conversation-title]")!.textContent);
const lifted = (host: HTMLElement) => [...host.querySelectorAll("[data-dragging]")].map((el) => el.querySelector("[data-ouro-conversation-title]")?.textContent);
const said = () => document.querySelector("[data-ouro-announcer]")?.textContent ?? "";
const middle = (element: Element) => {
  const box = element.getBoundingClientRect();
  return [box.x + box.width / 3, box.y + box.height / 2] as const;
};

async function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  await act(async () => {
    const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons, clientX: x, clientY: y, ...init }));
  });
}

/** Presses `from` and moves it, in steps, to `y` (the middle of `to` when it is an element), then releases there. */
async function dragTo(from: Element, to: Element | number, { release = true, pointerType = "mouse", drift = 0 } = {}) {
  const [x, y] = middle(from);
  const endY = typeof to === "number" ? to : middle(to)[1];
  await pointer(from, "pointerdown", x, y, { pointerType });
  for (let step = 1; step <= 6; step++) await pointer(window, "pointermove", x + drift, y + ((endY - y) * step) / 6, { pointerType });
  if (release) await pointer(window, "pointerup", x + drift, endY, { pointerType });
}

/** Dispatches a key on the element, and whether the list took it from the page (default prevented) and kept it from the page above. */
async function key(target: Element, init: KeyboardEventInit) {
  let heard = false;
  const listen = () => (heard = true);
  document.addEventListener("keydown", listen);
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => void target.dispatchEvent(event));
  document.removeEventListener("keydown", listen);
  return { prevented: event.defaultPrevented, heard };
}

const list = (extra: Partial<Parameters<typeof ConversationList>[0]> = {}) => <ConversationList label="Chats" items={items} sections={sections} onSelect={() => {}} {...extra} />;

describe("ConversationList row move", () => {
  it("lifts a row dragged with a mouse, lights the section under the pointer, its header and its rows, and reports the row and the section once on release", async () => {
    const onItemMove = vi.fn();
    const { host } = await render(list({ onItemMove }));
    const standup = row(host, "Standup");
    const slot = standup.closest("li")!;
    const resting = getComputedStyle(header(host, "Projects")).backgroundColor;
    await dragTo(standup, header(host, "Projects"), { release: false });
    expect(lifted(host)).toEqual(["Standup"]);
    expect(slot.style.transform).toMatch(/^translateY\(-\d/);
    expect(getComputedStyle(slot).zIndex).toBe("10");
    expect(getComputedStyle(slot).boxShadow).not.toBe("none");
    expect(lit(host)).toEqual(["Projects"]);
    expect(litRows(host)).toEqual(["Garden club"]);
    expect(getComputedStyle(header(host, "Projects")).outlineStyle).toBe("solid");
    expect(getComputedStyle(header(host, "Projects")).backgroundColor).not.toBe(resting);
    expect(getComputedStyle(row(host, "Garden club")).backgroundColor).toBe(getComputedStyle(header(host, "Projects")).backgroundColor);
    await pointer(window, "pointermove", ...middle(row(host, "Trail crew")));
    expect(lit(host)).toEqual(["Favorites"]);
    expect(litRows(host)).toEqual(["Trail crew", "Design reviewDesign review, weekly"]);
    expect(onItemMove).not.toHaveBeenCalled();
    await pointer(window, "pointerup", ...middle(row(host, "Trail crew")));
    expect(onItemMove).toHaveBeenCalledTimes(1);
    expect(onItemMove).toHaveBeenCalledWith("work", "favorites");
    expect(lifted(host)).toEqual([]);
    expect(lit(host)).toEqual([]);
    expect(litRows(host)).toEqual([]);
    expect(slot.style.transform).toBe("");
    // The app moves the row; the list draws it where the items say.
    expect(standup.closest("[data-ouro-conversation-section]")!.getAttribute("data-ouro-conversation-section")).toBe("recent");
  });

  it("takes a drop on any row of a section, and none over the row's own section, a section that takes no rows or the gap between sections", async () => {
    const onItemMove = vi.fn();
    const { host } = await render(list({ onItemMove }));
    await dragTo(row(host, "Trail crew"), row(host, "Design review"), { release: false });
    expect(lit(host)).toEqual([]);
    await pointer(window, "pointermove", ...middle(header(host, "Pinned")));
    expect(lit(host)).toEqual([]);
    await pointer(window, "pointermove", ...middle(row(host, "Garden club")));
    expect(lit(host)).toEqual(["Projects"]);
    const gap = (row(host, "Garden club").getBoundingClientRect().bottom + header(host, "Recent").getBoundingClientRect().top) / 2;
    await pointer(window, "pointermove", 0, gap);
    expect(lit(host)).toEqual([]);
    await pointer(window, "pointerup", 0, gap);
    expect(onItemMove).not.toHaveBeenCalled();
    // A row in no section can go to any section that takes rows, and keeps its drag through a sideways drift.
    await dragTo(row(host, "Notes to self"), header(host, "Favorites"), { drift: 60 });
    expect(onItemMove).toHaveBeenCalledWith("notes", "favorites");
  });

  it("puts the row back and reports nothing on Escape or a cancelled pointer", async () => {
    const onItemMove = vi.fn();
    const { host } = await render(list({ onItemMove }));
    const standup = row(host, "Standup");
    await dragTo(standup, header(host, "Projects"), { release: false });
    // Another key leaves the drag; Escape ends it, and the pointer moving on lights nothing.
    expect(await key(document.body, { key: "a" })).toEqual({ prevented: false, heard: true });
    expect(lit(host)).toEqual(["Projects"]);
    expect(await key(document.body, { key: "Escape" })).toEqual({ prevented: true, heard: false });
    expect(lifted(host)).toEqual([]);
    expect(lit(host)).toEqual([]);
    expect(litRows(host)).toEqual([]);
    expect(standup.closest("li")!.style.transform).toBe("");
    await pointer(window, "pointermove", ...middle(header(host, "Favorites")));
    expect(lit(host)).toEqual([]);
    expect(standup.closest("li")!.style.transform).toBe("");
    await pointer(window, "pointerup", ...middle(header(host, "Favorites")));
    expect(onItemMove).not.toHaveBeenCalled();
    // The Escape listener goes with the drag.
    expect(await key(document.body, { key: "Escape" })).toEqual({ prevented: false, heard: true });
    await dragTo(standup, header(host, "Favorites"), { release: false });
    await pointer(window, "pointercancel", ...middle(header(host, "Favorites")));
    expect(onItemMove).not.toHaveBeenCalled();
    expect(lifted(host)).toEqual([]);
    expect(lit(host)).toEqual([]);
  });

  it("selects a row on a click and not on the click that ends a drag, and drags no row with a finger or pen", async () => {
    const onItemMove = vi.fn();
    const onSelect = vi.fn();
    const { host } = await render(list({ onItemMove, onSelect }));
    await userEvent.click(row(host, "Standup"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("work");
    await dragTo(row(host, "Standup"), header(host, "Projects"));
    await act(async () => void row(host, "Standup").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onItemMove).toHaveBeenCalledTimes(1);
    for (const pointerType of ["touch", "pen"]) {
      await dragTo(row(host, "Garden club"), header(host, "Favorites"), { release: false, pointerType });
      expect(lifted(host)).toEqual([]);
      expect(lit(host)).toEqual([]);
      await pointer(window, "pointerup", ...middle(header(host, "Favorites")), { pointerType });
    }
    expect(onItemMove).toHaveBeenCalledTimes(1);
  });

  it("drags no row without onItemMove, or with nowhere to take it, and a click after such a press still selects", async () => {
    const onSelect = vi.fn();
    const { host, rerender } = await render(list({ onSelect }));
    await dragTo(row(host, "Standup"), header(host, "Projects"), { release: false });
    expect(lifted(host)).toEqual([]);
    expect(lit(host)).toEqual([]);
    await pointer(window, "pointerup", ...middle(header(host, "Projects")));
    const onItemMove = vi.fn();
    await rerender(list({ onSelect, onItemMove, sections: sections.map((section) => ({ ...section, acceptsItems: section.id === "recent" })) }));
    await dragTo(row(host, "Standup"), header(host, "Projects"), { release: false });
    expect(lifted(host)).toEqual([]);
    await pointer(window, "pointerup", ...middle(header(host, "Projects")));
    await act(async () => void row(host, "Standup").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(onSelect).toHaveBeenCalledWith("work");
    expect(onItemMove).not.toHaveBeenCalled();
  });

  it("reports nothing for a drag the app stops taking moves during", async () => {
    const onItemMove = vi.fn();
    const { host, rerender } = await render(list({ onItemMove }));
    await dragTo(row(host, "Standup"), header(host, "Projects"), { release: false });
    await rerender(list());
    await pointer(window, "pointerup", ...middle(header(host, "Projects")));
    expect(onItemMove).not.toHaveBeenCalled();
    expect(lifted(host)).toEqual([]);
    expect(lit(host)).toEqual([]);
  });

  it("says where the row landed, in the app's words when it gives them", async () => {
    const { host, rerender } = await render(list({ onItemMove: () => {} }));
    await dragTo(row(host, "Design review"), header(host, "Projects"));
    await expect.poll(said).toBe("Design review, weekly moved to Projects.");
    await rerender(list({ onItemMove: () => {}, itemMovedMessage: "{section} ← {label}" }));
    await dragTo(row(host, "Standup"), row(host, "Trail crew"));
    await expect.poll(said).toBe("Favorites ← Standup");
  });

  it("measures the sections drawn when the drag starts in a long list, and takes no drop for a section not drawn", async () => {
    const onItemMove = vi.fn();
    const rows: ConversationListItem[] = [
      { id: "fav", title: "Trail crew", section: "favorites" },
      ...Array.from({ length: 30 }, (_, index) => ({ id: `r${index}`, title: `Chat ${index}`, preview: "The latest message.", section: "recent" })),
      { id: "far", title: "Garden club", section: "projects" },
    ];
    const longSections = [sections[1]!, sections[4]!, sections[2]!];
    const { host } = await render(<ConversationList label="Chats" items={rows} sections={longSections} onSelect={() => {}} onItemMove={onItemMove} />, "width: 360px; height: 400px; overflow-y: auto");
    await act(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    expect(header(host, "Projects")).toBeUndefined();
    await dragTo(row(host, "Chat 2"), host.getBoundingClientRect().bottom - 2, { release: false });
    expect(lit(host)).toEqual([]);
    await pointer(window, "pointermove", ...middle(header(host, "Favorites")));
    expect(lit(host)).toEqual(["Favorites"]);
    await pointer(window, "pointerup", ...middle(header(host, "Favorites")));
    expect(onItemMove).toHaveBeenCalledWith("r2", "favorites");
  });
});
