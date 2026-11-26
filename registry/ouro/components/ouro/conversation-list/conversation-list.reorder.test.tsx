import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ConversationList, type ConversationListItem, type ConversationListSection } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
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
  { id: "pin", title: "Ana Lind", preview: "Notes.", time: "Tue", section: "pinned" },
  { id: "fav", title: "Trail crew", preview: "Gate at eight.", time: "9:41", section: "favorites" },
  { id: "club", title: "Garden club", preview: "Seed swap.", time: "Mon", section: "club" },
  { id: "work", title: "Standup", preview: "Notes.", time: "Mon", section: "work" },
];
const sections: ConversationListSection[] = [
  { id: "pinned", title: "Pinned" },
  { id: "favorites", title: "Favorites", reorderable: true },
  { id: "club", title: "Clubs", reorderable: true },
  { id: "work", title: "Work", reorderable: true },
];

const headers = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="section"]')];
const order = (host: HTMLElement) => headers(host).map((header) => header.textContent);
const handle = (host: HTMLElement, title: string) => host.querySelector<HTMLButtonElement>(`[data-ouro-part="section-handle"][data-ouro-reorder="${title}"]`)!;
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

/** Presses `from` and moves it onto `to`'s position, in steps, then releases. */
async function dragOnto(from: Element, to: Element, { release = true, below = false, pointerType = "mouse", drift = 0 } = {}) {
  const [x, y] = middle(from);
  const target = to.getBoundingClientRect();
  const endY = target.y + target.height * (below ? 0.9 : 0.1);
  await pointer(from, "pointerdown", x, y, { pointerType });
  for (let step = 1; step <= 6; step++) await pointer(window, "pointermove", x + drift, y + ((endY - y) * step) / 6, { pointerType });
  if (release) await pointer(window, "pointerup", x, endY, { pointerType });
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

describe("ConversationList section reorder", () => {
  it("drags a reorderable header to a new place among the reorderable sections and reports the ids and the move once", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    const [pinned, favorites, , work] = headers(host);
    await dragOnto(favorites!, work!, { below: true });
    expect(order(host)).toEqual(["Pinned", "Clubs", "Work", "Favorites"]);
    expect(onSectionsReorder).toHaveBeenCalledTimes(1);
    expect(onSectionsReorder).toHaveBeenCalledWith(["club", "work", "favorites"], { id: "favorites", from: 0, to: 2 });
    expect(pinned!.textContent).toBe("Pinned");
  });

  it("shows the dragged section lifted with a drop line while the pointer is down, and clears both after the drop", async () => {
    const { host } = await render(list({ onSectionsReorder: () => {} }));
    const [, favorites, clubs] = headers(host);
    await dragOnto(favorites!, clubs!, { release: false, below: true });
    const wrapper = favorites!.closest<HTMLElement>('[data-slot="conversation-list-section-header"]')!;
    expect(wrapper.getAttribute("data-dragging")).toBe("");
    expect(wrapper.style.transform).toMatch(/translateY/);
    expect(clubs!.closest("[data-drop]")?.getAttribute("data-drop")).toBe("after");
    await pointer(window, "pointerup", 0, 0);
    expect(host.querySelector("[data-dragging]")).toBeNull();
    expect(host.querySelector("[data-drop]")).toBeNull();
  });

  it("leaves a section with no reorder flag where it is: it has no handle and a drag on its header does nothing", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    const [pinned, favorites] = headers(host);
    expect(pinned!.closest("li")!.querySelector('[data-ouro-part="section-handle"]')).toBeNull();
    await dragOnto(pinned!, favorites!, { below: true });
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    expect(onSectionsReorder).not.toHaveBeenCalled();
  });

  it("changes nothing for a drag dropped where it began, and a plain click still opens and closes the section", async () => {
    const onSectionsReorder = vi.fn();
    const onSectionOpenChange = vi.fn();
    const { host } = await render(list({ onSectionsReorder, onSectionOpenChange }));
    const favorites = headers(host)[1]!;
    await dragOnto(favorites, favorites);
    expect(onSectionsReorder).not.toHaveBeenCalled();
    await userEvent.click(favorites);
    expect(onSectionOpenChange).toHaveBeenLastCalledWith("favorites", false);
    expect(favorites.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(favorites);
    expect(favorites.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not toggle the section for the click that ends a drag", async () => {
    const { host } = await render(list({ onSectionsReorder: () => {} }));
    const [, favorites, , work] = headers(host);
    await dragOnto(favorites!, work!, { below: true });
    await act(async () => {
      favorites!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(favorites!.getAttribute("aria-expanded")).toBe("true");
  });

  it("picks a section up with Space on its handle, moves it with the arrows, drops it with Space, and announces each step", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    const grip = handle(host, "club");
    await act(async () => grip.focus());
    await userEvent.keyboard(" ");
    expect(grip.hasAttribute("data-grabbed")).toBe(true);
    await expect.poll(said).toBe("Clubs picked up. Position 2 of 3.");
    await userEvent.keyboard("{ArrowDown}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Work", "Clubs"]);
    await expect.poll(said).toBe("Clubs moved. Position 3 of 3.");
    expect(onSectionsReorder).not.toHaveBeenCalled();
    await userEvent.keyboard(" ");
    await expect.poll(said).toBe("Clubs dropped. Position 3 of 3.");
    expect(onSectionsReorder).toHaveBeenCalledTimes(1);
    expect(onSectionsReorder).toHaveBeenCalledWith(["favorites", "work", "club"], { id: "club", from: 1, to: 2 });
    expect(document.activeElement).toBe(handle(host, "club"));
  });

  it("puts a picked-up section back on Escape and reports nothing", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    await act(async () => handle(host, "club").focus());
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    expect(order(host)).toEqual(["Pinned", "Clubs", "Favorites", "Work"]);
    await userEvent.keyboard("{Escape}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    await expect.poll(said).toBe("Clubs put back. Position 2 of 3.");
    expect(onSectionsReorder).not.toHaveBeenCalled();
    // Put back to the order the person had given before, not the app's.
    await act(async () => headers(host)[3]!.focus());
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await act(async () => handle(host, "work").focus());
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{Escape}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Work", "Clubs"]);
  });

  it("says the app's own words for each step", async () => {
    const reorderMessages = { pickedUp: "up {label} {n}/{total}", moved: "moved {label} {n}/{total}", dropped: "down {label} {n}/{total}", putBack: "back {label} {n}/{total}", instructions: "Space, arrows, Escape." };
    const { host } = await render(list({ onSectionsReorder: () => {}, reorderMessages }));
    expect(document.getElementById(handle(host, "club").getAttribute("aria-describedby")!)!.textContent).toBe("Space, arrows, Escape.");
    await act(async () => handle(host, "club").focus());
    await userEvent.keyboard(" ");
    await expect.poll(said).toBe("up Clubs 2/3");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(said).toBe("moved Clubs 3/3");
    await userEvent.keyboard("{Escape}");
    await expect.poll(said).toBe("back Clubs 2/3");
    await userEvent.keyboard(" ");
    await userEvent.keyboard(" ");
    await expect.poll(said).toBe("down Clubs 2/3");
  });

  it("moves no section for Alt and an arrow on a header that does not move, and leaves Right on a row with no menu to the page", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    await key(headers(host)[0]!, { key: "ArrowDown", altKey: true });
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    expect(onSectionsReorder).not.toHaveBeenCalled();
    const row = host.querySelector<HTMLButtonElement>('li[data-ouro-conversation-section="work"] [data-ouro-part="row"]')!;
    await act(async () => row.focus());
    expect((await key(row, { key: "ArrowRight" })).prevented).toBe(false);
    expect(document.activeElement).toBe(row);
  });

  it("moves a section with Alt and the arrow keys on its header, at once, and keeps focus on the header", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    await act(async () => headers(host)[1]!.focus());
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order(host)).toEqual(["Pinned", "Clubs", "Favorites", "Work"]);
    expect(onSectionsReorder).toHaveBeenCalledWith(["club", "favorites", "work"], { id: "favorites", from: 0, to: 1 });
    expect(document.activeElement).toBe(headers(host)[2]);
  });

  it("names each handle and describes how to use it", async () => {
    const { host } = await render(list({ onSectionsReorder: () => {}, reorderLabel: "Reorder" }));
    const grip = handle(host, "club");
    expect(grip.textContent).toBe("Reorder Clubs");
    expect(document.getElementById(grip.getAttribute("aria-describedby")!)!.textContent).toContain("Press Space to pick up");
  });

  it("shows the app's order at once and follows a different order the app passes later", async () => {
    const { host, rerender } = await render(list({ onSectionsReorder: () => {} }));
    await dragOnto(headers(host)[1]!, headers(host)[3]!, { below: true });
    expect(order(host)).toEqual(["Pinned", "Clubs", "Work", "Favorites"]);
    await rerender(list({ onSectionsReorder: () => {}, sections: [sections[0]!, sections[3]!, sections[1]!, sections[2]!] }));
    expect(order(host)).toEqual(["Pinned", "Work", "Favorites", "Clubs"]);
  });

  it("forgets the person's order once the app passes another, so the app's earlier order is not mistaken for it", async () => {
    const { host, rerender } = await render(list({ onSectionsReorder: () => {} }));
    await dragOnto(headers(host)[1]!, headers(host)[3]!, { below: true });
    const moved = [sections[0]!, sections[2]!, sections[3]!, sections[1]!];
    await rerender(list({ onSectionsReorder: () => {}, sections: moved }));
    await rerender(list({ onSectionsReorder: () => {} }));
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
  });

  it("counts an empty reorderable section among the ids, in its place", async () => {
    const onSectionsReorder = vi.fn();
    const withEmpty = [...sections.slice(0, 2), { id: "empty", title: "Archive", reorderable: true }, ...sections.slice(2)];
    const { host } = await render(list({ sections: withEmpty, onSectionsReorder }));
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    await dragOnto(headers(host)[1]!, headers(host)[3]!, { below: true });
    expect(onSectionsReorder).toHaveBeenCalledWith(["empty", "club", "work", "favorites"], { id: "favorites", from: 0, to: 3 });
  });

  it("keeps a reorderable header's menu: the … button opens it and a drag does not", async () => {
    const onRename = vi.fn();
    const menu = [{ label: "Rename", onClick: onRename }];
    const { host } = await render(list({ onSectionsReorder: () => {}, sections: sections.map((s) => (s.reorderable ? { ...s, menu } : s)) }));
    const more = host.querySelector<HTMLButtonElement>('li[data-ouro-conversation-section="favorites"] [data-ouro-part="more"]')!;
    expect(more).not.toBeNull();
    await userEvent.click(more);
    await userEvent.click(page.getByRole("menuitem", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledTimes(1);
  });
  it("does not open a section's menu for a finger held still on its grip once it has dragged, and makes its header the tab stop when focused", async () => {
    const menu = [{ label: "Rename" }];
    const { host } = await render(list({ onSectionsReorder: () => {}, sections: sections.map((s) => (s.id === "work" ? { ...s, menu } : s)) }));
    await dragOnto(handle(host, "work"), headers(host)[1]!, { release: false, pointerType: "touch" });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await pointer(window, "pointerup", ...middle(headers(host)[1]!), { pointerType: "touch" });
    await act(async () => handle(host, "club").focus());
    expect(headers(host).filter((header) => header.tabIndex === 0).map((header) => header.textContent)).toEqual(["Clubs"]);
  });

  it("names the grip Move section by default, keeps it out of the tab order, and marks only the section picked up", async () => {
    const { host } = await render(list({ onSectionsReorder: () => {} }));
    expect(handle(host, "club").textContent).toBe("Move section Clubs");
    expect(handle(host, "club").tabIndex).toBe(-1);
    await act(async () => handle(host, "club").focus());
    await userEvent.keyboard(" ");
    expect(host.querySelectorAll("[data-grabbed]")).toHaveLength(1);
    expect(handle(host, "club").hasAttribute("data-grabbed")).toBe(true);
    await userEvent.keyboard(" ");
    expect(host.querySelector("[data-grabbed]")).toBeNull();
  });

  it("goes between a header, its grip and its … button with Left, Right and Escape, and Right from a header reaches the grip", async () => {
    const menu = [{ label: "Rename" }];
    const { host } = await render(list({ onSectionsReorder: () => {}, sections: sections.map((s) => (s.id === "work" ? { ...s, menu } : s)) }));
    const [, , clubs, work] = headers(host);
    await act(async () => clubs!.focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(handle(host, "club"));
    // The last control in its header: Right stays.
    expect(await key(handle(host, "club"), { key: "ArrowRight" })).toEqual({ prevented: true, heard: true });
    expect(document.activeElement).toBe(handle(host, "club"));
    expect(await key(handle(host, "club"), { key: "ArrowLeft" })).toEqual({ prevented: true, heard: true });
    expect(document.activeElement).toBe(clubs);
    await act(async () => handle(host, "work").focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(host.querySelector('li[data-ouro-conversation-section="work"] [data-ouro-part="more"]'));
    await act(async () => handle(host, "work").focus());
    expect(await key(handle(host, "work"), { key: "Escape" })).toEqual({ prevented: true, heard: true });
    expect(document.activeElement).toBe(work);
    // Other keys are the page's.
    expect(await key(handle(host, "work"), { key: "a" })).toEqual({ prevented: false, heard: true });
  });

  it("keeps Space and the arrows from scrolling the page while a section is picked up, and Escape from closing what holds the list", async () => {
    const { host } = await render(list({ onSectionsReorder: () => {} }));
    const grip = handle(host, "club");
    await act(async () => grip.focus());
    expect((await key(grip, { key: " " })).prevented).toBe(true);
    expect(await key(grip, { key: " ", repeat: true })).toEqual({ prevented: true, heard: true });
    expect(grip.hasAttribute("data-grabbed")).toBe(true);
    expect((await key(grip, { key: "ArrowDown" })).prevented).toBe(true);
    expect(await key(grip, { key: "a" })).toEqual({ prevented: false, heard: true });
    expect(grip.hasAttribute("data-grabbed")).toBe(true);
    expect(await key(grip, { key: "Escape" })).toEqual({ prevented: true, heard: false });
    expect(grip.hasAttribute("data-grabbed")).toBe(false);
  });

  it("drops a picked-up section where it is when focus leaves it, and reports nothing for one dropped where it began", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    await act(async () => handle(host, "club").focus());
    await userEvent.keyboard(" ");
    await userEvent.keyboard(" ");
    await expect.poll(said).toBe("Clubs dropped. Position 2 of 3.");
    expect(onSectionsReorder).not.toHaveBeenCalled();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(handle(host, "club"));
    expect(handle(host, "club").hasAttribute("data-grabbed")).toBe(true);
    await act(async () => headers(host)[0]!.focus());
    expect(host.querySelector("[data-grabbed]")).toBeNull();
    await expect.poll(said).toBe("Clubs dropped. Position 1 of 3.");
    expect(onSectionsReorder).toHaveBeenCalledWith(["club", "favorites", "work"], { id: "club", from: 1, to: 0 });
  });

  it("stays put at either end, and counts only the reorderable sections that show", async () => {
    const onSectionsReorder = vi.fn();
    const withEmpty = [...sections, { id: "empty", title: "Archive", reorderable: true }];
    const { host } = await render(list({ sections: withEmpty, onSectionsReorder }));
    await act(async () => headers(host)[1]!.focus());
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    await expect.poll(said).toBe("Favorites moved. Position 1 of 3.");
    await act(async () => headers(host)[3]!.focus());
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
    await expect.poll(said).toBe("Work moved. Position 3 of 3.");
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(order(host)).toEqual(["Pinned", "Favorites", "Work", "Clubs"]);
    await expect.poll(said).toBe("Work moved. Position 2 of 3.");
    expect(onSectionsReorder).toHaveBeenCalledTimes(1);
    expect(onSectionsReorder).toHaveBeenCalledWith(["favorites", "work", "club", "empty"], { id: "work", from: 2, to: 1 });
    // A row under a moved header still reaches it with the arrow keys.
    await act(async () => host.querySelector<HTMLButtonElement>('li[data-ouro-conversation-section="work"] [data-ouro-part="row"]')!.focus());
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(headers(host)[2]);
  });

  it("drags by the grip with a finger, but scrolls instead from a header, and keeps the drag through a sideways drift", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    await dragOnto(headers(host)[1]!, headers(host)[3]!, { below: true, pointerType: "touch" });
    expect(onSectionsReorder).not.toHaveBeenCalled();
    await dragOnto(handle(host, "favorites"), headers(host)[2]!, { below: true, pointerType: "touch" });
    expect(onSectionsReorder).toHaveBeenLastCalledWith(["club", "favorites", "work"], { id: "favorites", from: 0, to: 1 });
    await dragOnto(headers(host)[3]!, headers(host)[1]!, { drift: 60 });
    expect(order(host)).toEqual(["Pinned", "Work", "Clubs", "Favorites"]);
  });

  it("moves the drop line with the pointer, shows none back where the drag began, and cancels on Escape or a cancelled pointer", async () => {
    const onSectionsReorder = vi.fn();
    const { host } = await render(list({ onSectionsReorder }));
    const [, favorites, clubs, work] = headers(host);
    const line = () => [...host.querySelectorAll("[data-drop]")].map((el) => `${el.getAttribute("data-ouro-section-header")}:${el.getAttribute("data-drop")}`);
    // Where the pointer is, by the headers' places before the drag moves the one dragged.
    const [atFavorites, atClubs, atWork] = [favorites!, clubs!, work!].map(middle);
    await dragOnto(work!, clubs!, { release: false });
    expect(line()).toEqual(["club:before"]);
    await pointer(window, "pointermove", ...atFavorites!);
    expect(line()).toEqual(["favorites:before"]);
    await pointer(window, "pointermove", ...atWork!);
    expect(line()).toEqual([]);
    await pointer(window, "pointermove", ...atFavorites!);
    // Another key leaves the drag; Escape ends it, and the pointer moving on draws nothing.
    expect(await key(document.body, { key: "a" })).toEqual({ prevented: false, heard: true });
    expect(line()).toEqual(["favorites:before"]);
    expect(await key(document.body, { key: "Escape" })).toEqual({ prevented: true, heard: false });
    expect(line()).toEqual([]);
    expect(host.querySelector("[data-dragging]")).toBeNull();
    await pointer(window, "pointermove", ...atClubs!);
    expect(line()).toEqual([]);
    expect(work!.closest<HTMLElement>("[data-ouro-section-header]")!.style.transform).toBe("");
    await pointer(window, "pointerup", ...atClubs!);
    expect(onSectionsReorder).not.toHaveBeenCalled();
    // The Escape listener goes with the drag.
    expect(await key(document.body, { key: "Escape" })).toEqual({ prevented: false, heard: true });
    await dragOnto(work!, favorites!, { release: false });
    await pointer(window, "pointercancel", ...atFavorites!);
    expect(onSectionsReorder).not.toHaveBeenCalled();
    expect(order(host)).toEqual(["Pinned", "Favorites", "Clubs", "Work"]);
  });

  it("pads a header for the controls on its end: none, the grip or the … button, or both", async () => {
    const menu = [{ label: "Rename" }];
    const { host } = await render(
      list({ onSectionsReorder: () => {}, sections: [sections[0]!, { ...sections[1]!, menu }, sections[2]!, { ...sections[3]!, reorderable: false, menu }] }),
    );
    const [plain, both, grip, more] = headers(host).map((header) => Number.parseFloat(getComputedStyle(header).paddingInlineEnd));
    expect(plain).toBeLessThan(grip!);
    expect(grip).toBe(more);
    expect(both).toBeGreaterThan(grip!);
    expect(headers(host)[0]!.closest('[data-slot="conversation-list-section-header"]')).toBeNull();
  });
});
