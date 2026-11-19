import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
    await userEvent.hover(plain);
    await expect.poll(() => style(plain).backgroundColor).toBe(color("var(--ouro-row-hover)"));
    expect(style(plain).borderTopLeftRadius).toBe("6px");
    expect(style(plain).boxShadow).not.toBe("none");
    await userEvent.hover(selected);
    await expect.poll(() => style(selected).backgroundColor).toBe(color("var(--ouro-row-selected-hover)"));
    expect(style(selected).backgroundColor).not.toBe(color("var(--ouro-row-hover)"));
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
    const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!.parentElement!;
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
    expect(slot[0]!).toBeGreaterThanOrEqual(before[1]![0]! - 2);
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
});
