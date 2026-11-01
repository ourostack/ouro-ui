import { useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import {
  EmojiPicker,
  type EmojiPickerCategory,
  type EmojiPickerEmoji,
  type EmojiPickerProps,
  type EmojiPickerSelection,
  type EmojiSkinTone,
} from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

// Runs in Chromium and WebKit.

const roots: Root[] = [];
let mounted: Element[] = [];

const e = (emoji: string, name: string, keywords?: string[], skinTones?: EmojiPickerEmoji["skinTones"]): EmojiPickerEmoji => ({ emoji, name, keywords, skinTones });

const smileys = [
  e("😀", "grinning face", ["smile", "happy"]),
  e("😄", "grinning face with smiling eyes", ["laugh"]),
  e("😂", "face with tears of joy", ["laugh", "lol"]),
  e("🙂", "slightly smiling face"),
  e("😉", "winking face"),
  e("😍", "smiling face with heart-eyes", ["love"]),
  e("🤔", "thinking face", ["hmm"]),
  e("😮", "face with open mouth", ["wow"]),
  e("😎", "smiling face with sunglasses", ["cool"]),
  e("🥳", "partying face", ["party"]),
];
const people = [
  e("👍", "thumbs up", ["like", "yes"], true),
  e("👋", "waving hand", ["hello"], true),
  e("✌️", "victory hand", ["peace"], true),
  e("🧑‍💻", "technologist", ["coder"], true),
  e("🧑‍🤝‍🧑", "people holding hands", ["couple"], ["🧑🏻‍🤝‍🧑🏻", "🧑🏼‍🤝‍🧑🏼", "🧑🏽‍🤝‍🧑🏽", "🧑🏾‍🤝‍🧑🏾", "🧑🏿‍🤝‍🧑🏿"]),
  e("👀", "eyes"),
];
const food = [e("☕", "hot beverage", ["coffee"]), e("🥐", "croissant", ["café"]), e("🍕", "pizza", [":slice_of_cheese:"])];
const categories: EmojiPickerCategory[] = [
  { label: "Smileys", emoji: smileys },
  { label: "People", emoji: people },
  { label: "Food", emoji: food, icon: <svg data-testid="food-icon" /> },
];
const frequent = [food[0]!, people[0]!, smileys[2]!];
/** Four categories of 24, enough to scroll. */
const many: EmojiPickerCategory[] = [
  ["Animals", 0x1f400],
  ["Food", 0x1f345],
  ["Things", 0x1f380],
  ["Sports", 0x1f3c0],
].map(([label, first]) => ({
  label: label as string,
  emoji: Array.from({ length: 24 }, (_, index) => e(String.fromCodePoint((first as number) + index), `${label as string} ${index + 1}`, ["sample"])),
}));
const quick = [people[0]!, smileys[2]!, smileys[7]!];

async function render(node: ReactNode, paddingTop = 0) {
  const host = document.createElement("div");
  host.style.paddingTop = `${paddingTop}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const picker = (props: Partial<EmojiPickerProps> = {}) => (
  <EmojiPicker
    label="Add a reaction"
    categories={categories}
    trigger={<Button aria-label="React">+</Button>}
    onSelect={() => {}}
    {...(props as object)}
  />
);

const panel = () => document.querySelector<HTMLElement>('[data-ouro="emoji-picker"]');
const popup = () => document.querySelector<HTMLElement>('[data-ouro="popover"], [data-ouro="sheet"]');
const search = () => panel()!.querySelector<HTMLInputElement>('input[type="search"]')!;
const cells = () => [...panel()!.querySelectorAll<HTMLButtonElement>('[data-ouro-part="emoji"]')];
const quickCells = () => [...panel()!.querySelectorAll<HTMLButtonElement>('[data-ouro-part="quick"]')];
const categoryButtons = () => [...panel()!.querySelectorAll<HTMLButtonElement>('[data-ouro-part="category"]')];
const toneButton = () => panel()!.querySelector<HTMLButtonElement>('[data-ouro-part="skin-tone"]');
const toneOptions = () => [...panel()!.querySelectorAll<HTMLButtonElement>('[data-ouro-part="tone"]')];
const cell = (name: string) => cells().find((element) => element.getAttribute("aria-label") === name)!;
const names = (list: HTMLElement[]) => list.map((element) => element.getAttribute("aria-label"));
const glyphs = (list: HTMLElement[]) => list.map((element) => element.textContent);
const headings = () => [...panel()!.querySelectorAll('[role="grid"]')].map((grid) => document.getElementById(grid.getAttribute("aria-labelledby")!)!.textContent);
const preview = () => panel()!.lastElementChild!.textContent;
const trigger = (host: Element) => host.querySelector<HTMLButtonElement>("button")!;
const focused = () => document.activeElement as HTMLElement;

/** Waits until the open popover has started its entrance, then ends the fade at once. */
async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      if (!element || element.hasAttribute("data-starting-style")) return false;
      for (const animation of element.getAnimations()) animation.finish();
      return true;
    }, { interval: 5 })
    .toBe(true);
}

/** Waits until the popover has gone, ending its exit fade at once. */
async function closed() {
  await expect
    .poll(() => {
      for (const animation of popup()?.getAnimations() ?? []) animation.finish();
      return panel();
    }, { interval: 5 })
    .toBeNull();
}

async function open(props: Partial<EmojiPickerProps> = {}, paddingTop = 0) {
  const rendered = await render(picker(props), paddingTop);
  await userEvent.click(trigger(rendered.host));
  await settled();
  return rendered;
}

async function type(text: string) {
  await userEvent.type(search(), text);
}

/** Narrows the page to a phone's width until the test ends. */
let narrowed = false;
async function phone() {
  narrowed = true;
  await page.viewport(390, 800);
}

let warn: ReturnType<typeof vi.spyOn>;
// The page's size and motion are set once for the file, each a round trip to the browser.
beforeAll(async () => {
  await page.viewport(1280, 800);
  await commands.emulateMedia({ reducedMotion: "reduce" });
});
afterAll(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  document.documentElement.removeAttribute("dir");
  if (narrowed) await page.viewport(1280, 800);
  narrowed = false;
});

describe("EmojiPicker content", () => {
  it("draws each emoji with renderEmoji in the skin tone in use, keeping its name for screen readers", async () => {
    const renderEmoji = (item: EmojiPickerEmoji, skinTone: EmojiSkinTone) => <img alt="" data-art={`${item.name}/${skinTone}`} />;
    await open({ renderEmoji, quick, frequent, skinTone: "medium" });
    const art = (element: Element) => element.querySelector("img")?.dataset.art;
    expect(art(cell("croissant"))).toBe("croissant/medium");
    expect(cell("croissant").textContent).toBe("");
    expect(art(quickCells()[0]!)).toBe("thumbs up/medium");
    expect(art(panel()!.lastElementChild!)).toBe("hot beverage/medium");
  });

  it("shows the name of the emoji in focus, or under the mouse, large beside its glyph", async () => {
    await open();
    expect(preview()).toBe("😀grinning face");
    // React draws the preview after the pointer and focus events, so each read waits for the exact text.
    await userEvent.hover(cell("pizza"));
    await expect.poll(preview).toBe("🍕pizza");
    await userEvent.hover(search());
    await expect.poll(preview).toBe("😀grinning face");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(preview).toBe("😄grinning face with smiling eyes");
  });

  it("shows the quick row, the frequently used emoji and every category, each emoji named for screen readers", async () => {
    await open({ quick, frequent });
    expect(page.getByRole("toolbar", { name: "Quick reactions" }).element()).toBeTruthy();
    expect(names(quickCells())).toEqual(["thumbs up", "face with tears of joy", "face with open mouth"]);
    expect(glyphs(quickCells())).toEqual(["👍", "😂", "😮"]);
    expect(headings()).toEqual(["Frequently used", "Smileys", "People", "Food"]);
    expect(cells()).toHaveLength(frequent.length + smileys.length + people.length + food.length);
    expect(names(cells()).slice(0, 3)).toEqual(["hot beverage", "thumbs up", "face with tears of joy"]);
    for (const element of cells()) expect(element.textContent).not.toBe("");
    const smileysGrid = page.getByRole("grid", { name: "Smileys" }).element();
    expect(smileysGrid.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(smileysGrid.querySelector('[role="row"]')!.querySelectorAll('[role="gridcell"] button')).toHaveLength(8);
  });

  it("shows no category bar for a single category, and no quick row or tone choice without them", async () => {
    await open({ categories: [{ label: "Smileys", emoji: smileys }] });
    expect(categoryButtons()).toEqual([]);
    expect(quickCells()).toEqual([]);
    expect(toneButton()).toBeNull();
    expect(panel()!.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("names each category's button, shows its icon or else its first emoji, and leaves out empty categories", async () => {
    await open({ frequent, categories: [...categories, { label: "Nothing", emoji: [] }] });
    expect(page.getByRole("toolbar", { name: "Categories" }).element()).toBeTruthy();
    expect(names(categoryButtons())).toEqual(["Frequently used", "Smileys", "People", "Food"]);
    expect(categoryButtons()[0]!.querySelector("svg")).not.toBeNull();
    expect(categoryButtons()[1]!.textContent).toBe("😀");
    expect(categoryButtons()[3]!.querySelector('[data-testid="food-icon"]')).not.toBeNull();
    expect(headings()).not.toContain("Nothing");
  });

  it("chooses a quick reaction with a press", async () => {
    const onSelect = vi.fn();
    await open({ quick, onSelect });
    await userEvent.click(quickCells()[2]!);
    expect(onSelect).toHaveBeenCalledWith({ emoji: "😮", name: "face with open mouth", skinTone: "default", item: smileys[7] }, expect.anything());
    await closed();
  });

  it("shows an empty grid with no emoji at all", async () => {
    await open({ categories: [] });
    expect(cells()).toEqual([]);
    expect(panel()!.querySelector("p")!.textContent).toBe("");
    expect(preview()).toBe("");
  });

  it("chooses an emoji with a press: onSelect gets it, its name, its tone and the event, and the picker closes", async () => {
    const onSelect = vi.fn<(selection: EmojiPickerSelection, event: unknown) => void>();
    const { host } = await open({ onSelect });
    await userEvent.click(cell("pizza"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selection, event] = onSelect.mock.calls[0]!;
    expect(selection).toEqual({ emoji: "🍕", name: "pizza", skinTone: "default", item: food[2] });
    expect((event as MouseEvent).type).toBe("click");
    expect((event as { isTrusted: boolean }).isTrusted).toBe(true);
    await closed();
    await expect.poll(focused).toBe(trigger(host));
  });

  it("shows a search field named Search emoji, with a magnifier, and a Close button for screen readers", async () => {
    await open();
    expect(page.getByRole("searchbox", { name: "Search emoji" }).element()).toBe(search());
    expect(search().placeholder).toBe("Search emoji");
    expect([...popup()!.querySelectorAll("button")].some((button) => button.textContent === "Close")).toBe(true);
    expect(search().closest("[data-ouro-input-group]")!.querySelector("svg")).not.toBeNull();
  });

  it("shows no frequently used section or quick row when the app has none yet", async () => {
    await open({ frequent: [], quick: [] });
    expect(headings()).toEqual(["Smileys", "People", "Food"]);
    expect(panel()!.querySelector('[role="toolbar"][aria-label="Quick reactions"]')).toBeNull();
  });

  it("ignores a press between the emoji", async () => {
    const onSelect = vi.fn();
    await open({ quick, onSelect });
    await act(async () => panel()!.querySelector<HTMLElement>('[role="toolbar"]')!.click());
    await act(async () => panel()!.querySelector<HTMLElement>('[role="grid"]')!.previousElementSibling!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).not.toHaveBeenCalled();
    expect(panel()).not.toBeNull();
  });
});

describe("EmojiPicker categories", () => {
  it("scrolls the search results without marking a category", async () => {
    await open({ categories: many });
    await type("sample");
    const scroller = panel()!.querySelector<HTMLElement>('[role="grid"]')!.parentElement!.parentElement!;
    scroller.scrollTop = 200;
    await expect.poll(() => scroller.scrollTop).toBe(200);
    await userEvent.clear(search());
    await expect.poll(() => categoryButtons()[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("jumps to a category from its button: scrolls it to the top, marks it current and focuses its first emoji", async () => {
    await open({ categories: many, frequent });
    const scroller = panel()!.querySelector<HTMLElement>('[role="grid"]')!.parentElement!.parentElement!;
    expect(categoryButtons().map((button) => button.getAttribute("aria-current"))).toEqual(["true", null, null, null, null]);
    await userEvent.click(categoryButtons()[2]!);
    expect(focused()).toBe(cells()[27]);
    const grids = [...panel()!.querySelectorAll<HTMLElement>('[role="grid"]')];
    expect(scroller.scrollTop).toBe(grids[2]!.parentElement!.offsetTop);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(categoryButtons()[2]!.getAttribute("aria-current")).toBe("true");
    expect(categoryButtons().filter((button) => button.hasAttribute("aria-current"))).toHaveLength(1);
    expect(categoryButtons()[2]!.tabIndex).toBe(0);
    // The last category cannot scroll to the top, but its button still shows it as the one chosen.
    await userEvent.click(categoryButtons()[4]!);
    expect(focused()).toBe(cells()[75]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(categoryButtons()[4]!.getAttribute("aria-current")).toBe("true");
    const bottom = scroller.scrollTop;
    scroller.scrollTop = 0;
    await expect.poll(() => categoryButtons()[0]!.getAttribute("aria-current")).toBe("true");
    scroller.scrollTop = bottom;
    await expect.poll(() => categoryButtons()[3]!.getAttribute("aria-current")).toBe("true");
    expect(categoryButtons().filter((button) => button.tabIndex !== 0).every((button) => button.tabIndex === -1)).toBe(true);
  });

  it("starts the search from the top of the grid", async () => {
    await open({ categories: many });
    const scroller = panel()!.querySelector<HTMLElement>('[role="grid"]')!.parentElement!.parentElement!;
    await userEvent.click(categoryButtons()[2]!);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    await type("sample");
    expect(scroller.scrollTop).toBe(0);
  });

  it("moves along the category bar with the arrow keys, as one Tab stop", async () => {
    await open({ frequent });
    categoryButtons()[0]!.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(focused()).toBe(categoryButtons()[2]);
    expect(categoryButtons().filter((button) => button.tabIndex === 0)).toEqual([categoryButtons()[2]]);
    await userEvent.keyboard("{End}");
    expect(focused()).toBe(categoryButtons()[3]);
  });

  it("marks the category in view as the grid scrolls", async () => {
    await open({ categories: many });
    const scroller = panel()!.querySelector<HTMLElement>('[role="grid"]')!.parentElement!.parentElement!;
    const grids = [...panel()!.querySelectorAll<HTMLElement>('[role="grid"]')];
    // A category a pixel short of the top, as rounding can leave it, counts as in view.
    scroller.scrollTop = grids[1]!.parentElement!.offsetTop - 1;
    await expect.poll(() => categoryButtons()[1]!.getAttribute("aria-current")).toBe("true");
    scroller.scrollTop = 0;
    await expect.poll(() => categoryButtons()[0]!.getAttribute("aria-current")).toBe("true");
  });
});

describe("EmojiPicker development messages", () => {
  it("names a missing label, no categories and an unknown skin tone, each with the fix", async () => {
    const props = { label: "", categories: [], skinTone: "tan" } as unknown as EmojiPickerProps;
    await render(picker(props));
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toEqual([
      '[ouro-ui] EmojiPicker: label is required; it names the picker for screen readers. Fix: <EmojiPicker label="Add a reaction">.',
      '[ouro-ui] EmojiPicker: categories is empty; pass the emoji to offer. Fix: <EmojiPicker label="Add a reaction" categories={[{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face" }] }]} onSelect={react}>.',
      '[ouro-ui] EmojiPicker: skinTone="tan" is not a skin tone; use "default", "light", "medium-light", "medium", "medium-dark", "dark". Fix: <EmojiPicker skinTone="medium">.',
    ]);
  });

  it("names an appearance class with the fix", async () => {
    await render(picker({ className: "bg-red-500" }));
    expect(warn).toHaveBeenCalledWith('[ouro-ui] EmojiPicker: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; EmojiPicker takes its colors from the theme.');
  });

  it("throws, with the fix, without a trigger or open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const props = { label: "Add a reaction", categories, onSelect: () => {} } as unknown as EmojiPickerProps;
    expect(() => renderToString(<EmojiPicker {...props} />)).toThrow(
      "[ouro-ui] EmojiPicker: needs trigger or open with onOpenChange. Fix: Pass trigger={<Button>…</Button>} for an uncontrolled emoji picker, or open and onOpenChange to control it.",
    );
  });

  it("names other libraries' props with the fix, and keeps them off the page", async () => {
    const props = { onEmojiSelect: () => {}, onEmojiClick: () => {}, data: {}, isOpen: true, onClose: () => {} } as unknown as EmojiPickerProps;
    const { host } = await render(picker(props));
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      "[ouro-ui] EmojiPicker: onEmojiSelect is not a prop. Fix: <EmojiPicker onSelect={(selection) => insert(selection.emoji)}>.",
      "[ouro-ui] EmojiPicker: onEmojiClick is not a prop. Fix: <EmojiPicker onSelect={(selection) => insert(selection.emoji)}>.",
      '[ouro-ui] EmojiPicker: data is not a prop; the emoji come by category in categories. Fix: <EmojiPicker label="Add a reaction" categories={[{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face" }] }]} onSelect={react}>.',
      "[ouro-ui] EmojiPicker: isOpen is not a prop. Fix: <EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>.",
      "[ouro-ui] EmojiPicker: onClose is not a prop. Fix: <EmojiPicker open={open} onOpenChange={setOpen} anchor={buttonRef}>.",
    ]);
    expect(trigger(host).hasAttribute("data")).toBe(false);
  });

  it("names missing categories the same way as empty ones, and opens empty", async () => {
    await open({ categories: undefined } as unknown as EmojiPickerProps);
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([expect.stringContaining("EmojiPicker: categories is empty")]);
    expect(cells()).toEqual([]);
  });
});

describe("EmojiPicker keyboard", () => {
  it("moves from the search into the grid with Down, and back up from the first row with Up", async () => {
    await open();
    search().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cells()[0]);
    await userEvent.keyboard("{ArrowUp}");
    expect(focused()).toBe(search());
  });

  it("keeps the column with Up and Down, across categories and shorter rows, and stops at the last row", async () => {
    await open();
    // Smileys: 8 then 2 (from 8). People: 6 (from 10). Food: 3 (from 16).
    cells()[6]!.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cells()[9]);
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cells()[15]);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(focused()).toBe(cells()[6]);
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}{ArrowDown}");
    expect(focused()).toBe(cells()[10]);
    cells()[4]!.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(focused()).toBe(cells()[14]);
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cells()[18]);
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    focused().dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(focused()).toBe(cells()[18]);
  });

  it("goes to the next and previous category with Page Down and Page Up, keeping the column", async () => {
    await open({ frequent });
    // Frequently used: 3. Smileys: 8 then 2 (from 3). People: 6 (from 13). Food: 3 (from 19).
    cells()[2]!.focus();
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[5]);
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[15]);
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[21]);
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[21]);
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[15]);
    cells()[12]!.focus();
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[4]);
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[1]);
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[1]);
  });

  it("goes to the ends of a row with Home and End, and of the grid with Ctrl", async () => {
    await open();
    cells()[3]!.focus();
    await userEvent.keyboard("{End}");
    expect(focused()).toBe(cells()[7]);
    await userEvent.keyboard("{Home}");
    expect(focused()).toBe(cells()[0]);
    cells()[9]!.focus();
    await userEvent.keyboard("{End}");
    expect(focused()).toBe(cells()[9]);
    await userEvent.keyboard("{Control>}{End}{/Control}");
    expect(focused()).toBe(cells().at(-1));
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    expect(focused()).toBe(cells()[0]);
    cells()[9]!.focus();
    await userEvent.keyboard("{Meta>}{Home}{/Meta}");
    expect(focused()).toBe(cells()[0]);
  });

  it("claims the keys it handles, so the page does not scroll as well", async () => {
    await open({ quick });
    const press = (element: Element, key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    let claimed = false;
    await act(async () => void (claimed = press(cells()[0]!, "ArrowUp")));
    expect(claimed).toBe(true);
    await act(async () => void (claimed = press(search(), "ArrowDown")));
    expect(claimed).toBe(true);
    await act(async () => void (claimed = press(quickCells()[0]!, "ArrowRight")));
    expect(claimed).toBe(true);
  });

  it("moves along the quick row with the arrow keys, Home and End, as one Tab stop", async () => {
    await open({ quick });
    const tabbable = () => quickCells().filter((element) => element.tabIndex === 0);
    expect(tabbable()).toEqual([quickCells()[0]]);
    quickCells()[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe(quickCells()[1]);
    expect(tabbable()).toEqual([quickCells()[1]]);
    await userEvent.keyboard("{End}");
    expect(focused()).toBe(quickCells()[2]);
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe(quickCells()[2]);
    await userEvent.keyboard("{Home}");
    expect(focused()).toBe(quickCells()[0]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe(quickCells()[0]);
    const other = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    focused().dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    document.documentElement.setAttribute("dir", "rtl");
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe(quickCells()[1]);
  });

  it("is one Tab stop that follows focus", async () => {
    await open();
    const tabbable = () => cells().filter((element) => element.tabIndex === 0);
    expect(tabbable()).toEqual([cells()[0]]);
    search().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}");
    expect(tabbable()).toEqual([cells()[2]]);
    expect(cells().filter((element) => element.tabIndex !== 0).every((element) => element.tabIndex === -1)).toBe(true);
    await act(async () => cells()[5]!.focus());
    expect(tabbable()).toEqual([cells()[5]]);
  });

  it("shows no preview for a touch or a pen resting on an emoji", async () => {
    await open();
    await act(async () => cell("pizza").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" })));
    await act(async () => cell("pizza").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "pen" })));
    expect(preview()).toBe("😀grinning face");
    await act(async () => cell("pizza").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
    expect(preview()).toBe("🍕pizza");
  });

  it("keeps its Tab stop on the last emoji when the app takes emoji away while it is open", async () => {
    const { rerender } = await open();
    await act(async () => cells()[15]!.focus());
    await rerender(picker({ categories: [{ label: "Smileys", emoji: smileys }] }));
    expect(cells().filter((element) => element.tabIndex === 0)).toEqual([cells()[9]]);
    await userEvent.click(search());
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cells()[9]);
  });

  it("chooses the emoji in focus with Enter, and leaves other keys alone", async () => {
    const onSelect = vi.fn();
    await open({ onSelect });
    cells()[1]!.focus();
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    focused().dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ emoji: "😄" }), expect.anything());
  });

  it("keeps the column through Page Up and Page Down, and goes to the last row with Page Down in the last category", async () => {
    await open({ frequent });
    cells()[9]!.focus();
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[2]);
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[9]);
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[18]);
    await userEvent.keyboard("{PageUp}");
    expect(focused()).toBe(cells()[9]);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await open({ categories: many });
    // Sports, the last category, has three rows: 72 to 79, 80 to 87 and 88 to 95.
    cells()[74]!.focus();
    await userEvent.keyboard("{PageDown}");
    expect(focused()).toBe(cells()[90]);
  });

  it("leaves keys, focus and pointers alone that do not come from an emoji", async () => {
    await open();
    const grid = panel()!.querySelector<HTMLElement>('[role="grid"]')!;
    const heading = grid.previousElementSibling as HTMLElement;
    const key = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    await act(async () => heading.dispatchEvent(key));
    expect(key.defaultPrevented).toBe(false);
    await act(async () => heading.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    await act(async () => heading.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
    expect(cells().filter((element) => element.tabIndex === 0)).toEqual([cells()[0]]);
    expect(preview()).toBe("😀grinning face");
  });

  it("swaps Left and Right in a right-to-left page", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    await open();
    cells()[1]!.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe(cells()[2]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(focused()).toBe(cells()[0]);
  });

  it("scrolls the emoji it moves to into view", async () => {
    await open({ categories: many });
    const scroller = panel()!.querySelector<HTMLElement>('[role="grid"]')!.parentElement!.parentElement!;
    cells()[0]!.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    expect(focused()).toBe(cells().at(-1));
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
  });

  it("steps with Left and Right across rows and stops at the ends", async () => {
    await open();
    cells()[0]!.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe(cells()[0]);
    for (let step = 0; step < 8; step += 1) await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe(cells()[8]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe(cells()[7]);
    cells().at(-1)!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe(cells().at(-1));
  });
});

describe("EmojiPicker skin tones", () => {
  it("opens the tones as a radio group on the checked tone, and changes the tone live with the arrow keys", async () => {
    const changes: EmojiSkinTone[] = [];
    await open({ onSkinToneChange: (tone) => changes.push(tone), quick });
    await userEvent.click(toneButton()!);
    const group = page.getByRole("radiogroup", { name: "Skin tone" }).element();
    expect(names(toneOptions())).toEqual(["Default", "Light", "Medium-light", "Medium", "Medium-dark", "Dark"]);
    expect(glyphs(toneOptions())).toEqual(["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"]);
    expect(focused()).toBe(toneOptions()[0]);
    expect(panel()!.querySelector('input[type="search"]')).toBeNull();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(changes).toEqual(["light", "medium-light"]);
    expect(focused()).toBe(toneOptions()[2]);
    expect(toneOptions().map((option) => option.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false", "false", "false"]);
    expect(toneOptions().map((option) => option.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
    expect(cell("thumbs up").textContent).toBe("👍🏼");
    expect(quickCells()[0]!.textContent).toBe("👍🏼");
    await userEvent.keyboard("{ArrowUp}{ArrowLeft}{ArrowLeft}");
    expect(changes.at(-1)).toBe("default");
    await userEvent.keyboard("{End}");
    expect(changes.at(-1)).toBe("dark");
    expect(group.isConnected).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(toneOptions()).toEqual([]);
    expect(focused()).toBe(toneButton());
    expect(toneButton()!.getAttribute("aria-label")).toBe("Skin tone: Dark");
  });

  it("offers a skin tone choice when some emoji have tones, named by the tone in use", async () => {
    await open();
    expect(toneButton()!.getAttribute("aria-label")).toBe("Skin tone: Default");
    expect(toneButton()!.getAttribute("aria-expanded")).toBe("false");
    expect(toneButton()!.textContent).toBe("✋");
  });

  it("puts the tone into what it chooses, by Unicode's modifier or the toned forms the app listed", async () => {
    const onSelect = vi.fn();
    await open({ skinTone: "medium-dark", onSelect });
    expect(cell("victory hand").textContent).toBe("✌🏾");
    expect(cell("technologist").textContent).toBe("🧑🏾‍💻");
    expect(cell("people holding hands").textContent).toBe("🧑🏾‍🤝‍🧑🏾");
    expect(cell("eyes").textContent).toBe("👀");
    await userEvent.click(cell("victory hand"));
    expect(onSelect).toHaveBeenLastCalledWith({ emoji: "✌🏾", name: "victory hand", skinTone: "medium-dark", item: people[2] }, expect.anything());
  });

  it("swaps Left and Right among the tones in a right-to-left page, but not Up and Down", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    const changes: EmojiSkinTone[] = [];
    await open({ onSkinToneChange: (tone) => changes.push(tone) });
    await userEvent.click(toneButton()!);
    await userEvent.keyboard("{ArrowLeft}{ArrowDown}{ArrowRight}{ArrowUp}");
    expect(changes).toEqual(["light", "medium-light", "light", "default"]);
  });

  it("keeps a toned form the app left out as the emoji itself", async () => {
    await open({ skinTone: "dark", categories: [{ label: "People", emoji: [e("🫶", "heart hands", [], ["🫶🏻"])] }] });
    expect(cell("heart hands").textContent).toBe("🫶");
  });

  it("closes the tones, not the picker or anything around it, with Escape, and leaves other keys alone", async () => {
    const around = vi.fn();
    const { host } = await render(<div onKeyDown={(event) => around(event.key)}>{picker()}</div>);
    await userEvent.click(trigger(host));
    await settled();
    await userEvent.click(toneButton()!);
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    focused().dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(around).toHaveBeenCalledWith("a");
    expect(around).not.toHaveBeenCalledWith("Escape");
    expect(toneOptions()).toEqual([]);
    expect(panel()).not.toBeNull();
    expect(focused()).toBe(toneButton());
  });

  it("claims the keys and presses it handles among the tones", async () => {
    await open();
    await userEvent.click(toneButton()!);
    const send = (event: Event) => {
      focused().dispatchEvent(event);
      return event.defaultPrevented;
    };
    let claimed: boolean[] = [];
    await act(async () => {
      claimed = [
        send(new MouseEvent("mousedown", { bubbles: true, cancelable: true })),
        send(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })),
      ];
    });
    expect(claimed).toEqual([true, true]);
    let escape = false;
    await act(async () => void (escape = send(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))));
    expect(escape).toBe(true);
  });

  it("closes the tones without taking focus when focus leaves them", async () => {
    await open({ quick });
    await userEvent.click(toneButton()!);
    await userEvent.keyboard("{Enter}");
    await userEvent.click(toneButton()!);
    quickCells()[0]!.focus();
    await expect.poll(toneOptions).toEqual([]);
    expect(focused()).toBe(quickCells()[0]);
  });

  it("offers it for tones in the frequent or quick emoji alone", async () => {
    await open({ categories: [{ label: "Smileys", emoji: smileys }], quick: [people[0]!] });
    expect(toneButton()).not.toBeNull();
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await open({ categories: [{ label: "Smileys", emoji: smileys }], frequent: [people[1]!] });
    expect(toneButton()).not.toBeNull();
  });

  it("follows a controlled skinTone, and falls back to the default for one that is not a tone", async () => {
    const { rerender } = await open({ skinTone: "light" });
    expect(cell("thumbs up").textContent).toBe("👍🏻");
    await rerender(picker({ skinTone: "tan" } as unknown as EmojiPickerProps));
    expect(cell("thumbs up").textContent).toBe("👍");
    expect(toneButton()!.getAttribute("aria-label")).toBe("Skin tone: Default");
  });

  it("chooses a tone with a press, which puts the search back", async () => {
    await open();
    await userEvent.click(toneButton()!);
    await userEvent.click(toneOptions()[3]!);
    expect(toneOptions()).toEqual([]);
    expect(search()).toBeTruthy();
    expect(toneButton()!.textContent).toBe("✋🏽");
    expect(focused()).toBe(toneButton());
  });

  it("chooses an emoji without tones in the default tone, whatever the tone in use", async () => {
    const onSelect = vi.fn();
    await open({ skinTone: "dark", onSelect });
    await userEvent.click(cell("eyes"));
    expect(onSelect).toHaveBeenLastCalledWith({ emoji: "👀", name: "eyes", skinTone: "default", item: people[5] }, expect.anything());
  });

  it("remembers the tone it was given across openings when the app does not keep it", async () => {
    const { host } = await open();
    await userEvent.click(toneButton()!);
    await userEvent.click(toneOptions()[1]!);
    await userEvent.click(trigger(host));
    await closed();
    await userEvent.click(trigger(host));
    await settled();
    expect(cell("thumbs up").textContent).toBe("👍🏻");
  });
});

describe("EmojiPicker search", () => {
  it("matches the start of any word in the name or keywords, ignoring case and accents, and hides the categories", async () => {
    await open({ frequent });
    await type("LAU");
    expect(names(cells())).toEqual(["face with tears of joy", "grinning face with smiling eyes"]);
    expect(categoryButtons()).toEqual([]);
    expect(headings()).toEqual(["2 emoji"]);
    await userEvent.clear(search());
    await type("cafe");
    expect(names(cells())).toEqual(["croissant"]);
    await userEvent.clear(search());
    await type("smiling fa");
    expect(names(cells())).toEqual(["grinning face with smiling eyes", "slightly smiling face", "smiling face with heart-eyes", "smiling face with sunglasses"]);
    await userEvent.clear(search());
    await type("ace");
    expect(cells()).toEqual([]);
    await userEvent.clear(search());
    await type("heart");
    expect(names(cells())).toEqual(["smiling face with heart-eyes"]);
  });

  it("chooses the first result with Enter, and does nothing on Enter or Down with no results", async () => {
    const onSelect = vi.fn();
    await open({ onSelect });
    await type("zzz");
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(search());
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.clear(search());
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(panel()).not.toBeNull();
    await type("pizz");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => void search().dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith({ emoji: "🍕", name: "pizza", skinTone: "default", item: food[2] }, expect.objectContaining({ key: "Enter" }));
    await closed();
  });

  it("splits names and keywords at hyphens, underscores and colons, and treats spaces alone as no search", async () => {
    await open();
    await type("slice");
    expect(names(cells())).toEqual(["pizza"]);
    await userEvent.clear(search());
    await type("chee");
    expect(names(cells())).toEqual(["pizza"]);
    await userEvent.clear(search());
    await type("   ");
    expect(headings()).toEqual(["Smileys", "People", "Food"]);
    await type("pizzá");
    expect(names(cells())).toEqual(["pizza"]);
    await userEvent.fill(search(), " ☕ ");
    expect(names(cells())).toEqual(["hot beverage"]);
  });

  it("announces how many it found as the count changes, once each, and when nothing matches", async () => {
    await open();
    const announcements = watchAnnouncements();
    await type("f");
    await expect.poll(() => announcements.count("10 emoji")).toBe(1);
    await type("ace");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(announcements.count("10 emoji")).toBe(1);
    await type(" w");
    await expect.poll(() => announcements.count("6 emoji")).toBe(1);
    await type("zz");
    await expect.poll(() => announcements.count("No emoji found")).toBe(1);
    expect(panel()!.querySelector("p")!.textContent).toBe("No emoji found");
    await userEvent.clear(search());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.querySelector("[data-ouro-announcer]")!.textContent).toBe("No emoji found");
    await type("f");
    await expect.poll(() => announcements.count("10 emoji")).toBe(2);
    announcements.stop();
  });

  it("shows the first result's name, not the emoji the mouse was on, once the search changes", async () => {
    await open();
    await userEvent.hover(cell("pizza"));
    expect(preview()).toBe("🍕pizza");
    await act(async () => {
      search().focus();
    });
    await userEvent.keyboard("thumb");
    expect(preview()).toBe("👍thumbs up");
  });

  it("puts back the categories, from the top, when the search is cleared", async () => {
    await open({ frequent });
    await type("face");
    cells()[3]!.focus();
    await userEvent.click(search());
    await userEvent.clear(search());
    expect(categoryButtons()).toHaveLength(4);
    expect(cells().filter((element) => element.tabIndex === 0)).toEqual([cells()[0]]);
    expect(categoryButtons()[0]!.getAttribute("aria-current")).toBe("true");
  });

  it("finds an emoji pasted into the search, and lists one found twice only once", async () => {
    await open({ frequent });
    await userEvent.fill(search(), "☕");
    expect(names(cells())).toEqual(["hot beverage"]);
    await userEvent.fill(search(), "coffee");
    expect(names(cells())).toEqual(["hot beverage"]);
  });

  it("moves from the search to the first result with Down", async () => {
    await open();
    await type("thumb");
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cell("thumbs up"));
  });
});

describe("EmojiPicker opening and closing", () => {
  it("renders only its trigger on the server, marked as opening a dialog", () => {
    const html = renderToString(picker());
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-ouro="emoji-picker"');
  });

  it("is controlled by open, onOpenChange and anchor, and asks to close on a choice and on Escape", async () => {
    const changes: boolean[] = [];
    const chosen: string[] = [];
    function Host() {
      const [isOpen, setOpen] = useState(false);
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={anchor} onClick={() => setOpen((value) => !value)}>
            Insert emoji
          </button>
          <EmojiPicker
            label="Insert emoji"
            categories={categories}
            open={isOpen}
            onOpenChange={(next) => {
              changes.push(next);
              setOpen(next);
            }}
            anchor={anchor}
            onSelect={(selection) => chosen.push(selection.emoji)}
          />
        </>
      );
    }
    const { host } = await render(<Host />);
    await userEvent.click(host.querySelector("button")!);
    await settled();
    await userEvent.click(cell("pizza"));
    expect(chosen).toEqual(["🍕"]);
    expect(changes).toEqual([false]);
    await closed();
    await userEvent.click(host.querySelector("button")!);
    await settled();
    await userEvent.keyboard("{Escape}");
    expect(changes).toEqual([false, false]);
    await closed();
    // A press on the anchor is the app's own toggle, not an outside press.
    await userEvent.click(host.querySelector("button")!);
    await settled();
    await userEvent.click(host.querySelector("button")!);
    await closed();
    expect(changes).toEqual([false, false]);
  });

  it("keeps the trigger's own ref and onClick, and stays shut when that onClick prevents the default", async () => {
    const seen: string[] = [];
    function Host() {
      const ref = useRef<HTMLButtonElement>(null);
      const [block, setBlock] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setBlock(true)}>
            Block
          </button>
          {picker({
            trigger: (
              <Button
                ref={ref}
                aria-label="React"
                onClick={(event) => {
                  seen.push(ref.current?.getAttribute("aria-label") ?? "none");
                  if (block) event.preventDefault();
                }}
              >
                +
              </Button>
            ),
          })}
        </>
      );
    }
    const { host } = await render(<Host />);
    const button = host.querySelector<HTMLButtonElement>('[aria-label="React"]')!;
    await userEvent.click(host.querySelector("button")!);
    await userEvent.click(button);
    expect(seen).toEqual(["React"]);
    expect(panel()).toBeNull();
  });

  it("opens from its trigger as a dialog named by its label, and the trigger toggles it", async () => {
    const { host } = await open();
    expect(trigger(host).getAttribute("aria-expanded")).toBe("true");
    expect(page.getByRole("dialog", { name: "Add a reaction" }).element()).toBe(popup());
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("popover");
    await userEvent.click(trigger(host));
    await closed();
    expect(trigger(host).getAttribute("aria-expanded")).toBe("false");
  });

  it("passes side, align, presentation and closeLabel to its popover", async () => {
    await open({ side: "top", align: "start", closeLabel: "Done" }, 600);
    expect(document.querySelector('[data-ouro="popover"]')!.getAttribute("data-side")).toBe("top");
    expect(document.querySelector('[data-ouro="popover"]')!.getAttribute("data-align")).toBe("start");
    expect([...popup()!.querySelectorAll("button")].some((button) => button.textContent === "Done")).toBe(true);
  });

  it("lets app layout classes win on the panel", async () => {
    await open({ className: "w-96" });
    expect(panel()!.className).toContain("w-96");
    expect(panel()!.className).not.toContain("w-[21rem]");
  });

  it("puts focus in the search after a keyboard open, and back on the trigger after Escape", async () => {
    const { host } = await render(picker());
    trigger(host).focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    await expect.poll(focused).toBe(search());
    await userEvent.keyboard("{Escape}");
    await closed();
    await expect.poll(focused).toBe(trigger(host));
  });

  it("is a sheet at every width with presentation sheet", async () => {
    await open({ presentation: "sheet" });
    expect(popup()!.getAttribute("data-ouro")).toBe("sheet");
    expect(panel()!.className).toContain("w-full");
  });

  it("is a bottom sheet below 640px, filling its width, and a popover from 640px up", async () => {
    await phone();
    await open();
    expect(popup()!.getAttribute("data-ouro")).toBe("sheet");
    expect(panel()!.className).toContain("w-full");
    expect(panel()!.className).not.toContain("w-[21rem]");
  });

  it("stays a popover on a phone with presentation popover, and falls back to it for an unknown presentation", async () => {
    await phone();
    await open({ presentation: "popover" });
    expect(popup()!.getAttribute("data-ouro")).toBe("popover");
    expect(panel()!.className).toContain("w-[21rem]");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await open({ presentation: "drawer" } as unknown as EmojiPickerProps);
    expect(popup()!.getAttribute("data-ouro")).toBe("popover");
  });
});

describe("EmojiPicker labels", () => {
  it("takes every word it shows or speaks from its props, for other languages", async () => {
    await open({
      quick,
      frequent,
      searchLabel: "Buscar emoji",
      frequentLabel: "Usados a menudo",
      quickLabel: "Reacciones rápidas",
      categoriesLabel: "Categorías",
      skinToneLabel: "Tono de piel",
      skinToneNames: { default: "Predeterminado", light: "Claro", "medium-light": "Medio claro", medium: "Medio", "medium-dark": "Medio oscuro", dark: "Oscuro" },
      resultsLabel: "{count} encontrados",
      noResultsLabel: "Sin resultados",
    });
    expect(page.getByRole("searchbox", { name: "Buscar emoji" }).element()).toBe(search());
    expect(search().placeholder).toBe("Buscar emoji");
    expect(page.getByRole("toolbar", { name: "Reacciones rápidas" }).element()).toBeTruthy();
    expect(page.getByRole("toolbar", { name: "Categorías" }).element()).toBeTruthy();
    expect(headings()[0]).toBe("Usados a menudo");
    expect(toneButton()!.getAttribute("aria-label")).toBe("Tono de piel: Predeterminado");
    await type("pizza");
    expect(headings()).toEqual(["1 encontrados"]);
    await type("x");
    expect(panel()!.querySelector("p")!.textContent).toBe("Sin resultados");
    await userEvent.clear(search());
    await userEvent.click(toneButton()!);
    expect(page.getByRole("radiogroup", { name: "Tono de piel" }).element()).toBeTruthy();
    expect(names(toneOptions())).toEqual(["Predeterminado", "Claro", "Medio claro", "Medio", "Medio oscuro", "Oscuro"]);
  });
});

describe("EmojiPicker on the page", () => {
  it("marks its panel and every control with its item name", async () => {
    await open({ quick, frequent });
    expect(panel()).not.toBeNull();
    for (const element of [...cells(), ...quickCells(), ...categoryButtons(), toneButton()!]) {
      expect(element.getAttribute("data-ouro-control")).toBe("emoji-picker");
    }
  });

  it("lines its eight columns up across the panel's width", async () => {
    await open();
    const first = cells()[0]!.getBoundingClientRect();
    const eighth = cells()[7]!.getBoundingClientRect();
    const grid = panel()!.querySelector('[role="row"]')!.getBoundingClientRect();
    expect(first.width).toBe(40);
    expect(grid.right - eighth.right).toBeLessThan(6);
    expect(cells()[8]!.getBoundingClientRect().top).toBeGreaterThan(first.top);
  });

  it("stays put while a search narrows the grid, at the same height", async () => {
    await open();
    const before = panel()!.getBoundingClientRect().height;
    await type("pizza");
    expect(Math.abs(panel()!.getBoundingClientRect().height - before)).toBeLessThan(60);
  });
});
