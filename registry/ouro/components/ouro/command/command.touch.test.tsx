import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTint } from "@/registry/ouro/lib/ouro/testing/press";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command, type CommandEntry } from "@/registry/ouro/components/ouro/command/command";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(() => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
});

const popup = () => document.querySelector<HTMLElement>("[data-ouro-presentation]");
const input = () => page.getByRole("combobox", { name: "Search commands" }).element() as HTMLInputElement;

async function openFromTap() {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const run = () => {};
  const items = Array.from({ length: 30 }, (_, index) => ({ label: `Recipe ${index + 1}`, onSelect: run }));
  await act(() => root!.render(<Command title="Command palette" trigger={<Button>Search</Button>} items={[{ label: "Recipes", items }]} />));
  await commands.tap('[data-ouro="button"]');
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  return popup()!;
}

describe("Command on a phone", () => {
  it("opens from a tap as a full-height sheet focused on itself, with 44px commands and a 16px search input", async () => {
    const element = await openFromTap();
    expect(element.getAttribute("data-ouro-presentation")).toBe("sheet");
    await expect.poll(() => document.activeElement).toBe(element);
    expect(getComputedStyle(input()).fontSize).toBe("16px");
    for (const option of document.querySelectorAll<HTMLElement>('[role="option"]')) {
      expect(option.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps the search input where it was while results filter down to none", async () => {
    await openFromTap();
    const top = input().getBoundingClientRect().top;
    await userEvent.click(input());
    await userEvent.type(input(), "Recipe 30");
    await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(1);
    expect(input().getBoundingClientRect().top).toBe(top);
    await userEvent.type(input(), "zz");
    await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(0);
    expect(input().getBoundingClientRect().top).toBe(top);
  });

  it("scrolls the list with the search input pinned at the top", async () => {
    const element = await openFromTap();
    const top = input().getBoundingClientRect().top;
    const content = element.querySelector<HTMLElement>("[data-ouro-sheet-content]")!;
    content.scrollTop = 600;
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(content.scrollTop).toBeGreaterThan(0);
    expect(input().getBoundingClientRect().top).toBe(top);
    expect(popup()).toBe(element);
  });
});

describe("Command pressed and closing on a phone", () => {
  const run = () => {};
  const entries: CommandEntry[] = [
    { label: "New recipe", onSelect: run },
    { label: "Import from a link", onSelect: run },
    { label: "Switch theme", onSelect: run },
  ];

  async function openEntries(items: CommandEntry[] = entries) {
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    root = createRoot(host);
    await act(() => root!.render(<Command title="Command palette" trigger={<Button>Search</Button>} items={items} />));
    await commands.tap('[data-ouro="button"]');
    await expect
      .poll(() => {
        const element = popup();
        return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
      })
      .toBe(true);
    return popup()!;
  }

  it("tints a command on pointer-down, from the press alone", async () => {
    const sheet = await openEntries();
    const item = [...sheet.querySelectorAll<HTMLElement>('[role="option"]')][2]!;
    const { rest, pressed, active } = await pressTint(item);
    expect(active).toBe(true);
    expect(pressed).not.toBe(rest);
  });

  it("keeps showing what it showed while the sheet slides out after a command runs", async () => {
    const onSelect = vi.fn();
    await openEntries([{ label: "Switch theme", onSelect }, { label: "Sign out", onSelect: run }]);
    await userEvent.type(input(), "swi");
    await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(1);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    const seen = new Set<number>();
    while (popup()) {
      seen.add(document.querySelectorAll('[role="option"]').length);
      expect(input().value).toBe("swi");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    expect([...seen]).toEqual([1]);
  });
});
