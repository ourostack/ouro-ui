import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { PresetPicker, type PresetPickerItem, type PresetPickerProps } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 560) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get picker() {
      return host.querySelector<HTMLElement>('[data-ouro="preset-picker"]')!;
    },
    get cards() {
      return [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="item"]')];
    },
  };
}

const items: PresetPickerItem[] = [
  { value: "chats", label: "Chats first", description: "Conversations wide, the calendar narrow.", tag: "Saved" },
  { value: "calendar", label: "Calendar first", description: "Today's agenda beside the conversation." },
  { value: "focus", label: "Focus", description: "One conversation, nothing else." },
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("PresetPicker", () => {
  it("is a named list of buttons, one card per preset, in order", async () => {
    const { cards } = await render(<PresetPicker label="Start from a layout" items={items} onValueChange={() => {}} />);
    await expect.element(page.getByRole("list", { name: "Start from a layout" })).toBeVisible();
    expect(cards.map((card) => card.textContent)).toEqual([
      "Chats firstSavedConversations wide, the calendar narrow.",
      "Calendar firstToday's agenda beside the conversation.",
      "FocusOne conversation, nothing else.",
    ]);
    expect(cards.every((card) => card.type === "button")).toBe(true);
  });

  it("marks the preset in use In use and current", async () => {
    const { cards, rerender } = await render(<PresetPicker label="Layouts" items={items} value="calendar" onValueChange={() => {}} />);
    expect(cards.map((card) => card.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(cards[1]!.querySelector("[data-ouro-preset-current]")!.textContent).toBe("In use");
    expect(getComputedStyle(cards[1]!).borderColor).not.toBe(getComputedStyle(cards[0]!).borderColor);
    expect(getComputedStyle(cards[1]!).backgroundColor).not.toBe(getComputedStyle(cards[0]!).backgroundColor);
    await rerender(<PresetPicker label="Layouts" items={items} value={null} currentLabel="Actif" onValueChange={() => {}} />);
    expect(cards.some((card) => card.hasAttribute("aria-current"))).toBe(false);
    await rerender(<PresetPicker label="Layouts" items={items} value="focus" currentLabel="Actif" onValueChange={() => {}} />);
    expect(cards[2]!.querySelector("[data-ouro-preset-current]")!.textContent).toBe("Actif");
  });

  it("chooses a preset on a click, Enter or Space, and not the one in use", async () => {
    const onValueChange = vi.fn();
    const { cards } = await render(<PresetPicker label="Layouts" items={items} value="chats" onValueChange={onValueChange} />);
    await userEvent.click(page.getByRole("button", { name: /^Calendar first/ }));
    expect(onValueChange).toHaveBeenLastCalledWith("calendar");
    await act(async () => cards[2]!.focus());
    await userEvent.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith("focus");
    await act(async () => cards[1]!.focus());
    await userEvent.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledTimes(3);
    await userEvent.click(page.getByRole("button", { name: /^Chats first/ }));
    expect(onValueChange).toHaveBeenCalledTimes(3);
  });

  it("moves to the next card with the left arrow, right to left", async () => {
    const { cards } = await render(
      <div dir="rtl">
        <PresetPicker label="Layouts" items={items} onValueChange={() => {}} />
      </div>,
    );
    await act(async () => cards[0]!.focus());
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cards[1]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cards[2]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cards[1]);
    // The vertical arrows keep their order.
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cards[2]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(cards[0]);
  });

  it("moves focus with the arrow keys, Home and End, without choosing", async () => {
    const onValueChange = vi.fn();
    const { cards } = await render(<PresetPicker label="Layouts" items={items} onValueChange={onValueChange} />);
    await act(async () => cards[0]!.focus());
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cards[0]);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cards[1]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cards[2]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cards[2]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(cards[1]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(cards[0]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(cards[2]);
    // Other keys keep their meaning.
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    await userEvent.keyboard("{PageDown}");
    document.removeEventListener("keydown", seen);
    expect(seen.mock.calls[0]![0].defaultPrevented).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("puts the cards in two columns from the sm width, and one on a phone", async () => {
    // The breakpoint follows the viewport, not the host.
    await page.viewport(1280, 800);
    try {
      const wide = await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} />, 560);
      expect(wide.cards[1]!.getBoundingClientRect().top).toBe(wide.cards[0]!.getBoundingClientRect().top);
      await page.viewport(390, 844);
      const narrow = await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} />, 360);
      expect(narrow.cards[1]!.getBoundingClientRect().top).toBeGreaterThan(narrow.cards[0]!.getBoundingClientRect().bottom);
    } finally {
      // The size the browser test projects start each test at.
      await page.viewport(414, 896);
    }
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <PresetPicker label="Layouts" items={items} value="chats" onValueChange={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('aria-current="true"');
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { picker } = await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(picker);
    expect(getComputedStyle(picker).marginTop).toBe("16px");
  });
});

describe("PresetPicker, part by part", () => {
  it("keeps the page from scrolling on the keys that move focus, and only on those", async () => {
    const { cards } = await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} />);
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      cards[0]!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press("ArrowDown")).toBe(true);
    expect(press("a")).toBe(false);
  });

  it("shows a tag and a description only when given, quieter than the name", async () => {
    const { cards } = await render(
      <PresetPicker label="Layouts" items={[{ value: "a", label: "Plain", tag: "Saved", description: "A line about it." }, { value: "b", label: "Bare", description: null }, { value: "c", label: "Bare too" }]} onValueChange={() => {}} />,
    );
    const nameLine = (card: HTMLElement) => card.firstElementChild!;
    const [name, tag] = [...nameLine(cards[0]!).children] as HTMLElement[];
    expect(tag!.textContent).toBe("Saved");
    expect(getComputedStyle(tag!).color).not.toBe(getComputedStyle(name!).color);
    expect(cards[0]!.children).toHaveLength(2);
    for (const card of cards.slice(1)) {
      expect(nameLine(card).children).toHaveLength(1);
      expect(card.children).toHaveLength(1);
    }
  });
});

describe("PresetPicker development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} />);
    await render(<PresetPicker label="Layouts" items={items} value="chats" onValueChange={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing label", { label: undefined }, "label is missing, so screen readers cannot name the presets", '<PresetPicker label="Start from a layout" items={presets} onValueChange={use}>'],
    ["current", { current: "chats" }, "current is not a prop", "<PresetPicker value={current}>"],
    ["onSelect", { onSelect: () => {} }, "onSelect is not a prop", "<PresetPicker onValueChange={(value) => use(value)}>"],
    ["options", { options: [] }, "options is not a prop", "<PresetPicker items={presets}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { label: "Layouts", items, onValueChange: () => {}, ...extra } as unknown as PresetPickerProps;
    const { picker } = await render(<PresetPicker {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] PresetPicker: ${problem}. Fix: ${fix}.`);
    expect(picker.hasAttribute("current")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<PresetPicker label="Layouts" items={items} onValueChange={() => {}} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] PresetPicker: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; PresetPicker takes its colors from the theme.',
    );
  });
});
