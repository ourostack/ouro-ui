import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { findDesignIssues } from "@/registry/ouro/check/design-check";

const roots: Root[] = [];
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const items: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", preview: "Meet at the gate.", time: "9:41", menu: [{ label: "Pin", onClick: () => {} }] },
  { id: "ana", title: "Ana Lind", preview: "Notes attached.", time: "Tue", menu: [{ label: "Pin", onClick: () => {} }] },
  { id: "plain", title: "No menu here", preview: "Nothing to do.", time: "Mon" },
];

const list = (selectedId?: string) => <ConversationList label="Conversations" items={items} selectedId={selectedId} onSelect={() => {}} />;
const rowOf = (host: Element, title: string) => [...host.querySelectorAll<HTMLElement>('[data-ouro-part="row"]')].find((row) => row.textContent!.includes(title))!;
const moreOf = (row: Element) => row.parentElement!.querySelector<HTMLElement>('[data-ouro-part="more"]');
const style = (element: Element) => getComputedStyle(element);
const box = (element: Element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return [x, y, width, height].map(Math.round);
};
const color = (value: string) => {
  const probe = document.createElement("i");
  probe.style.background = value;
  document.body.append(probe);
  const resolved = style(probe).backgroundColor;
  probe.remove();
  return resolved;
};

describe("ConversationList hover", () => {
  it("draws a hovered row as a raised card with 6px corners, and a hovered selected row in the selected tokens", async () => {
    const host = await render(list("ana"));
    const plain = rowOf(host, "Trail crew");
    const selected = rowOf(host, "Ana Lind");
    expect(style(plain).boxShadow).toBe("none");
    expect(style(selected).boxShadow).toBe("none");
    await userEvent.hover(plain);
    await expect.poll(() => style(plain).backgroundColor).toBe(color("var(--ouro-row-hover)"));
    expect(style(plain).borderTopLeftRadius).toBe("6px");
    expect(style(plain).boxShadow).not.toBe("none");
    await userEvent.hover(selected);
    await expect.poll(() => style(selected).backgroundColor).toBe(color("var(--ouro-row-selected-hover)"));
    expect(style(selected).backgroundColor).not.toBe(color("var(--ouro-row-hover)"));
    // The open row is marked by its selected fill alone: the plain rows' hover ring would make it
    // look like a plain row raised off the list, as if it were not the open one (#3477).
    expect(style(selected).boxShadow).toBe("none");
  });

  it("reads the app's own row tokens", async () => {
    const host = await render(list());
    host.style.setProperty("--ouro-row-hover", "rgb(1, 2, 3)");
    host.style.setProperty("--ouro-row-radius", "10px");
    const row = rowOf(host, "Trail crew");
    await userEvent.hover(row);
    await expect.poll(() => style(row).backgroundColor).toBe("rgb(1, 2, 3)");
    expect(style(row).borderTopLeftRadius).toBe("10px");
  });

  it("swaps the time for a more button on hover and on focus, only for a row with a menu", async () => {
    const host = await render(list());
    const row = rowOf(host, "Trail crew");
    const more = moreOf(row)!;
    const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
    expect(moreOf(rowOf(host, "No menu here"))).toBeNull();
    expect(more.textContent).toContain("More options for Trail crew");
    expect(style(more).opacity).toBe("0");
    expect(style(time).opacity).toBe("1");
    await userEvent.hover(row);
    await expect.poll(() => style(more).opacity).toBe("1");
    await expect.poll(() => style(time).opacity).toBe("0");
    await userEvent.unhover(row);
    await expect.poll(() => style(more).opacity).toBe("0");
    row.focus();
    await expect.poll(() => style(more).opacity).toBe("1");
    await expect.poll(() => style(time).opacity).toBe("0");
  });

  it("draws its more button's dots in the button's middle, not on a text baseline", async () => {
    const host = await render(list());
    const row = rowOf(host, "Trail crew");
    await userEvent.hover(row);
    await expect.poll(() => style(moreOf(row)!).opacity).toBe("1");
    expect(findDesignIssues().filter((issue) => issue.rule === "off-centre-ink")).toEqual([]);
  });

  it("holds the row and the time's slot steady through hover and focus", async () => {
    const host = await render(list());
    const row = rowOf(host, "Trail crew");
    const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
    const before = [box(row), box(time), box(rowOf(host, "Ana Lind"))];
    await userEvent.hover(row);
    await expect.poll(() => style(moreOf(row)!).opacity).toBe("1");
    expect([box(row), box(time), box(rowOf(host, "Ana Lind"))]).toEqual(before);
    row.focus();
    expect([box(row), box(time), box(rowOf(host, "Ana Lind"))]).toEqual(before);
    const slot = box(moreOf(row)!);
    expect(slot[0]! + slot[2]!).toBeLessThanOrEqual(before[0]![0]! + before[0]![2]!);
    // The button sits over the time's slot: its end edge is the time's, whatever the font makes of the time's width.
    expect(Math.abs(slot[0]! + slot[2]! - (before[1]![0]! + before[1]![2]!))).toBeLessThanOrEqual(2);
  });

  it("opens the row's menu from the more button, by keyboard too", async () => {
    const host = await render(list());
    const row = rowOf(host, "Ana Lind");
    row.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(moreOf(row));
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menu", { name: "Ana Lind" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(row);
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
    expect(document.activeElement).toBe(row);
  });

  it("keeps the more button out of the tab order and lets Left and Escape hand focus back to the row", async () => {
    const host = await render(list());
    const row = rowOf(host, "Ana Lind");
    const more = moreOf(row)!;
    expect(more.tabIndex).toBe(-1);
    row.focus();
    const right = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await act(async () => {
      row.dispatchEvent(right);
    });
    expect(right.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(more);
    for (const key of ["ArrowLeft", "Escape"]) {
      more.focus();
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(async () => {
        more.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(row);
    }
    more.focus();
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    more.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it("reserves the end slot only for what fills it: a time, a menu, or a mark or unread dot on the title line", async () => {
    const slots = async (item: ConversationListItem) => {
      const host = await render(<ConversationList label="Conversations" items={[item]} onSelect={() => {}} />);
      return [...host.querySelectorAll('[data-ouro-part="row"] .shrink-0.flex.items-center.gap-2')];
    };
    expect(await slots({ id: "a", title: "A" })).toHaveLength(0);
    expect(await slots({ id: "b", title: "B", mark: "★" })).toHaveLength(1);
    expect(await slots({ id: "c", title: "C", unread: true })).toHaveLength(1);
    expect(await slots({ id: "d", title: "D", preview: "p", mark: "★", unread: true })).toHaveLength(0);
    expect(await slots({ id: "e", title: "E", time: "9:41" })).toHaveLength(1);
    expect(await slots({ id: "f", title: "F", menu: [{ label: "Pin", onClick: () => {} }] })).toHaveLength(1);
  });

  it("gives the slot the more button's width only when the row has a menu", async () => {
    const host = await render(list());
    const slotOf = (title: string) => rowOf(host, title).querySelector<HTMLElement>("[data-ouro-conversation-time]")!.parentElement!;
    expect(style(slotOf("Ana Lind")).minWidth).toBe("28px");
    expect(style(slotOf("No menu here")).minWidth).not.toBe("28px");
  });

  it("draws an edge on a shown more button in forced colours, where its hover background is gone (#2489)", async () => {
    const host = await render(list());
    const row = rowOf(host, "Trail crew");
    const more = moreOf(row)!;
    expect(style(more).borderTopWidth).toBe("0px");
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      await userEvent.hover(row);
      await expect.poll(() => style(more).opacity).toBe("1");
      expect(style(more).borderTopStyle).toBe("solid");
      expect(style(more).borderTopWidth).not.toBe("0px");
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("rules a row under forced colours, leaving the list unboxed, and shows the open row in the highlight colours (#3098)", async () => {
    const host = await render(list("ana"));
    const plain = rowOf(host, "Trail crew");
    const selected = rowOf(host, "Ana Lind");
    expect(style(plain).borderTopWidth).toBe("0px");
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      await expect.poll(() => parseFloat(style(plain).borderBottomWidth)).toBeGreaterThan(0);
      expect(style(host.querySelector('[data-ouro="conversation-list"]')!).borderTopWidth).toBe("0px");
      expect(style(plain).borderTopWidth).toBe("0px");
      expect(style(selected).backgroundColor).toBe(color("Highlight"));
      expect(style(selected).color).toBe(color("HighlightText"));
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("gives the more button and the section grip a hit area of at least 24px to a mouse, the size they draw unchanged", async () => {
    const host = await render(
      <ConversationList
        label="Conversations"
        items={[{ ...items[0]!, section: "team" }]}
        sections={[{ id: "team", title: "My team", reorderable: true, menu: [{ label: "Rename" }] }]}
        onSectionsReorder={() => {}}
        onSelect={() => {}}
      />,
    );
    const header = host.querySelector<HTMLElement>('[data-ouro-part="section"]')!;
    const controls = [moreOf(rowOf(host, "Trail crew"))!, header.parentElement!.querySelector<HTMLElement>('[data-ouro-part="more"]')!, host.querySelector<HTMLElement>('[data-ouro-part="section-handle"]')!];
    for (const control of controls) {
      const drawn = control.getBoundingClientRect();
      expect([Math.round(drawn.width), Math.round(drawn.height)]).toEqual([28, 20]);
      // A 24px square centred on it: every point the browser hit-tests there lands on the control.
      const [cx, cy] = [drawn.x + drawn.width / 2, drawn.y + drawn.height / 2];
      for (const dx of [-11.5, 0, 11.5]) for (const dy of [-11.5, 0, 11.5]) expect(document.elementFromPoint(cx + dx, cy + dy)?.closest("[data-ouro-part]")).toBe(control);
    }
  });
});
