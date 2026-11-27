import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives each ConversationList row and section header a target at least 44px tall to a finger, even when compact", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConversationList
        label="Conversations"
        density="compact"
        items={[
          { id: "trail", title: "Trail crew", avatar: false },
          { id: "ana", title: "Ana Lind", section: "pinned" },
        ]}
        sections={[{ id: "pinned", title: "Pinned" }]}
        onSelect={() => {}}
      />,
    ),
  );
  const rows = [...host.querySelectorAll<HTMLElement>('[data-ouro-control="conversation-list"]')];
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
});

it("opens a row's menu on a long press, where the finger rests, and the press selects nothing; a tap still selects", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const selected: string[] = [];
  await act(async () =>
    root!.render(
      <ConversationList
        label="Conversations"
        items={[
          { id: "ana", title: "Ana Lind", menu: [{ label: "Pin", onClick: () => {} }] },
          { id: "trail", title: "Trail crew" },
        ]}
        onSelect={(id) => selected.push(id)}
      />,
    ),
  );
  const box = host.querySelector('[data-ouro-part="row"]')!.getBoundingClientRect();
  const at = { x: Math.round(box.left + 40), y: Math.round(box.top + box.height / 2) };
  await commands.touchStep({ type: "touchStart", ...at });
  try {
    await expect.element(page.getByRole("menu", { name: "Ana Lind" })).toBeVisible();
  } finally {
    await commands.touchStep({ type: "touchEnd" });
  }
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!.getBoundingClientRect();
  // At the finger: the menu's corner is where it rests.
  expect(Math.abs(menu.left - at.x)).toBeLessThanOrEqual(8);
  expect(selected).toEqual([]);
  // A tap, once the menu is gone, selects as before.
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await expect.poll(() => page.getByRole("menu").query()).toBeNull();
  await commands.tap('[data-ouro-part="row"][tabindex="0"]');
  await expect.poll(() => selected).toEqual(["ana"]);
}, 30_000);

it("shows the more button on every row with a menu, a 44px target beside the time, and leaves the row's box as it was", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const items = [
    { id: "trail", title: "Trail crew", time: "9:41", menu: [{ label: "Pin", onClick: () => {} }] },
    { id: "plain", title: "No menu", time: "Mon" },
  ];
  await act(async () => root!.render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />));
  const row = host.querySelector<HTMLElement>('[data-ouro-part="row"]')!;
  const more = host.querySelector<HTMLElement>('[data-ouro-part="more"]')!;
  expect(host.querySelectorAll('[data-ouro-part="more"]')).toHaveLength(1);
  expect(getComputedStyle(more).opacity).toBe("1");
  const target = more.querySelector<HTMLElement>("[data-ouro-touch-target]")!.getBoundingClientRect();
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!.getBoundingClientRect();
  const slot = more.getBoundingClientRect();
  expect(slot.left).toBeGreaterThanOrEqual(time.right - 1);
  expect(slot.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
});

it("keeps a row's time and title clear of its more button to a finger, at a compact density", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const items = [{ id: "trail", title: "Trail crew and the engine notes group", time: "9:41", menu: [{ label: "Pin", onClick: () => {} }] }];
  await act(async () => root!.render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />));
  const row = host.querySelector<HTMLElement>('[data-ouro-part="row"]')!;
  const more = host.querySelector<HTMLElement>('[data-ouro-part="more"]')!;
  // The more button's reservation is a fixed size, so a smaller --spacing does not let the time run under it.
  const runsUnder = () => {
    const left = Math.round(more.getBoundingClientRect().left);
    return [row.querySelector("[data-ouro-conversation-title]")!, row.querySelector("[data-ouro-conversation-time]")!].some(
      (text) => Math.round(text.getBoundingClientRect().right) > left,
    );
  };
  expect(runsUnder()).toBe(false);
  for (const spacing of ["0.2rem", "0.1rem"]) {
    host.style.setProperty("--spacing", spacing);
    expect(runsUnder(), spacing).toBe(false);
  }
});

it("opens a section header's menu as a sheet from its more button, a 44px target shown without hover, and leaves the section open", async () => {
  await page.viewport(390, 844);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConversationList
        label="Conversations"
        items={[{ id: "ana", title: "Ana Lind", section: "team" }]}
        sections={[{ id: "team", title: "My team", menu: [{ label: "Rename", onClick: () => {} }] }]}
        onSelect={() => {}}
      />,
    ),
  );
  const header = host.querySelector<HTMLElement>('[data-ouro-part="section"]')!;
  const more = host.querySelector<HTMLElement>('[data-ouro-part="more"]')!;
  expect(getComputedStyle(more).opacity).toBe("1");
  const target = more.querySelector<HTMLElement>("[data-ouro-touch-target]")!.getBoundingClientRect();
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await commands.tap('[data-ouro-part="more"]');
  await expect.poll(() => document.querySelector("[data-ouro-presentation]")?.getAttribute("data-ouro-presentation")).toBe("sheet");
  expect(header.getAttribute("aria-expanded")).toBe("true");
});

it("reorders a section by a finger dragging its handle, shows the handle with no hover, and reports the move", async () => {
  const onSectionsReorder = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConversationList
        label="Conversations"
        items={[
          { id: "a", title: "Trail crew", section: "one" },
          { id: "b", title: "Ana Lind", section: "two" },
        ]}
        sections={[
          { id: "one", title: "First", reorderable: true },
          { id: "two", title: "Second", reorderable: true },
        ]}
        onSectionsReorder={onSectionsReorder}
        onSelect={() => {}}
      />,
    ),
  );
  const grip = host.querySelector<HTMLElement>('[data-ouro-part="section-handle"][data-ouro-reorder="one"]')!;
  expect(getComputedStyle(grip).opacity).toBe("1");
  const box = grip.getBoundingClientRect();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const second = host.querySelector<HTMLElement>('[data-ouro-part="section"][data-ouro-reorder="two"]')!.getBoundingClientRect();
  const end = second.y + second.height * 0.9;
  await commands.touchStep({ type: "touchStart", x, y });
  try {
    for (let step = 1; step <= 8; step++) await commands.touchStep({ type: "touchMove", x, y: y + ((end - y) * step) / 8 });
  } finally {
    await commands.touchStep({ type: "touchEnd" });
  }
  await expect.poll(() => onSectionsReorder.mock.calls.length).toBe(1);
  expect(onSectionsReorder).toHaveBeenCalledWith(["two", "one"], { id: "one", from: 0, to: 1 });
  expect([...host.querySelectorAll('[data-ouro-part="section"]')].map((header) => header.textContent)).toEqual(["Second", "First"]);
});
