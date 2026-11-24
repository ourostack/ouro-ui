import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit.

const roots: Root[] = [];
const mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

const chips = () => [...document.querySelectorAll<HTMLButtonElement>('[data-ouro-part="recent"]')];
const input = () => document.querySelector<HTMLInputElement>('[data-ouro-part="input"]')!;
const highlighted = () => document.querySelector("[data-highlighted]");

beforeEach(async () => {
  await page.viewport(1280, 800);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
});

describe("Command recents", () => {
  const open = (onSelect = () => {}) =>
    render(
      <Command
        title="Go to"
        open
        onOpenChange={() => {}}
        recents={[{ label: "Pie", onSelect }, { label: "Soup", onSelect }, { label: "Stew", onSelect }]}
        items={[{ label: "Bread", onSelect: () => {} }]}
      />,
    );

  it("is entered with Down, walked with Left and Right, and left with Up or Escape, which does not close the palette", async () => {
    await open();
    await expect.poll(() => document.activeElement === input()).toBe(true);
    expect(chips().map((chip) => chip.textContent)).toEqual(["Pie", "Soup", "Stew"]);
    await expect.poll(highlighted).toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(chips()[0]);
    expect(chips().map((chip) => chip.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(chips()[2]);
    expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, -1, 0]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(chips()[1]);
    expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, 0, -1]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(input());
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(document.activeElement).toBe(input());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("moves the roving tabIndex when a chip is focused directly, not only when the keyboard walks to it", async () => {
    await open();
    await userEvent.keyboard("{ArrowDown}");
    expect(chips().map((chip) => chip.tabIndex)).toEqual([0, -1, -1]);
    await act(async () => void chips()[2]!.focus());
    expect(document.activeElement).toBe(chips()[2]);
    expect(chips().map((chip) => chip.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("prevents the browser default on every chip key, and only Up or Escape gives focus back to the search", async () => {
    await open();
    await userEvent.keyboard("{ArrowDown}");
    const chip = chips()[0]!;
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    await act(async () => void chip.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chip);
    const right = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await act(async () => void chip.dispatchEvent(right));
    expect(right.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chips()[1]);
  });

  it("prevents the browser default when Down enters the chips from the search", async () => {
    await open();
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    await act(async () => void input().dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chips()[0]);
  });

  it("shows no recents row when recents is empty", async () => {
    await render(
      <Command title="Go to" open onOpenChange={() => {}} recents={[]} items={[{ label: "Bread", onSelect: () => {} }]} />,
    );
    expect(document.querySelector("[data-ouro-command-recents]")).toBeNull();
  });

  it("names the recents row for screen readers, defaulting to Recent", async () => {
    await open();
    expect(document.querySelector("[data-ouro-command-recents]")!.getAttribute("aria-label")).toBe("Recent");
  });

  it("takes a recentsLabel to replace the default name", async () => {
    await render(
      <Command
        title="Go to"
        open
        onOpenChange={() => {}}
        recentsLabel="Jump back in"
        recents={[{ label: "Pie", onSelect: () => {} }]}
        items={[{ label: "Bread", onSelect: () => {} }]}
      />,
    );
    expect(document.querySelector("[data-ouro-command-recents]")!.getAttribute("aria-label")).toBe("Jump back in");
  });

  it("shows an icon before a chip's label when one is given, and omits it when it is not", async () => {
    await render(
      <Command
        title="Go to"
        open
        onOpenChange={() => {}}
        recents={[
          { label: "Pie", icon: <svg data-testid="pie-icon" />, onSelect: () => {} },
          { label: "Soup", onSelect: () => {} },
        ]}
        items={[{ label: "Bread", onSelect: () => {} }]}
      />,
    );
    expect(chips()[0]!.querySelector('[data-testid="pie-icon"]')).not.toBeNull();
    expect(chips()[1]!.querySelector('[data-testid="pie-icon"]')).toBeNull();
  });

  it("runs a chip when it is pressed, and gives way to the search once something is typed", async () => {
    const onSelect = vi.fn();
    await open(onSelect);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    await userEvent.type(input(), "b");
    expect(chips()).toHaveLength(0);
    await expect.poll(highlighted).not.toBeNull();
  });

  it("says nothing of an empty list while the recents show with nothing typed, and says it once something typed matches nothing", async () => {
    await render(
      <Command title="Go to" open onOpenChange={() => {}} recents={[{ label: "Pie", onSelect: () => {} }]} items={[]} />,
    );
    expect(chips()).toHaveLength(1);
    expect(document.querySelector("[data-ouro-command-empty]")).toBeNull();
    await userEvent.type(input(), "zz");
    await expect.poll(() => document.querySelector("[data-ouro-command-empty]")).not.toBeNull();
  });

  it("keeps one highlight that the pointer moves between a row and a chip, and an arrow key walks on from it", async () => {
    await render(
      <Command
        title="Go to"
        open
        onOpenChange={() => {}}
        recents={[{ label: "Pie", onSelect: () => {} }, { label: "Soup", onSelect: () => {} }]}
        items={[{ label: "Bread", onSelect: () => {} }, { label: "Cake", onSelect: () => {} }]}
      />,
    );
    const rows = () => [...document.querySelectorAll<HTMLElement>("[data-ouro-command-value]")];
    const marked = () => [...document.querySelectorAll("[data-highlighted]")];
    await userEvent.hover(rows()[0]!);
    await expect.poll(marked).toEqual([rows()[0]]);
    await userEvent.hover(chips()[0]!);
    await expect.poll(marked).toEqual([chips()[0]]);
    expect(getComputedStyle(rows()[0]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(chips()[1]);
    await expect.poll(() => chips().map((chip) => chip.hasAttribute("data-highlighted"))).toEqual([false, true]);
    await userEvent.hover(rows()[1]!);
    await expect.poll(() => document.activeElement === input()).toBe(true);
    await expect.poll(() => chips().some((chip) => chip.hasAttribute("data-highlighted"))).toBe(false);
    expect(getComputedStyle(rows()[1]!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(input());
    await expect.poll(() => marked()).toEqual([rows()[0]]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(input());
  });

  it("leaves a chip focused when a touch moves over the list, and takes the focus back for a mouse", async () => {
    await render(
      <Command
        title="Go to"
        open
        onOpenChange={() => {}}
        recents={[{ label: "Pie", onSelect: () => {} }]}
        items={[{ label: "Bread", onSelect: () => {} }]}
      />,
    );
    const list = document.querySelector<HTMLElement>("[data-ouro-command-list]")!;
    await act(() => chips()[0]!.focus());
    await act(() => list.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", bubbles: true })));
    expect(document.activeElement).toBe(chips()[0]);
    await act(() => list.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", bubbles: true })));
    expect(document.activeElement).toBe(input());
  });

  it("shares the row fairly: a chip is as wide as its name up to an equal share of what the shorter ones leave, and only the longest names are cut", async () => {
    const long = "A very long name for a place a person goes back to, long enough to need the whole row by itself";
    const labels = ["Pie", "Soup", long, `${long} again`];
    const show = (names: string[]) =>
      render(
        <Command
          title="Go to"
          open
          onOpenChange={() => {}}
          recents={names.map((label) => ({ label, onSelect: () => {} }))}
          items={[{ label: "Bread", onSelect: () => {} }]}
        />,
      );
    const labelOf = (chip: HTMLElement) => chip.querySelector<HTMLElement>("[data-slot='command-recent-label']")!;
    await show(labels);
    const row = document.querySelector<HTMLElement>("[data-ouro-command-recents]")!;
    const cut = () => chips().map((chip) => labelOf(chip).scrollWidth > labelOf(chip).clientWidth + 1);
    await expect.poll(cut).toEqual([false, false, true, true]);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    expect(Math.abs(chips()[2]!.getBoundingClientRect().width - chips()[3]!.getBoundingClientRect().width)).toBeLessThan(2);
    const style = getComputedStyle(row);
    const used = chips().reduce((sum, chip) => sum + chip.offsetWidth, 0) + parseFloat(style.columnGap) * 3 + parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
    expect(used).toBeGreaterThan(row.clientWidth - 3);

    const total = () => chips().reduce((sum, chip) => sum + chip.offsetWidth, 0);
    const wide = total();
    row.style.maxWidth = "260px";
    await expect.poll(total).toBeLessThan(wide);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    row.style.maxWidth = "";
    await expect.poll(total).toBe(wide);
  });

  it("leaves chips whose names all fit at their own width", async () => {
    await open();
    await expect.poll(() => chips().length).toBe(3);
    expect(chips().map((chip) => chip.style.maxWidth)).toEqual(["", "", ""]);
    expect(chips().every((chip) => chip.querySelector<HTMLElement>("[data-slot='command-recent-label']")!.scrollWidth <= chip.clientWidth)).toBe(true);
  });
});
