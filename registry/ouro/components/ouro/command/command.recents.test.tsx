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
});
