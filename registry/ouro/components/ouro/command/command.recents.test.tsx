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
    expect(highlighted()).toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(chips()[0]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(chips()[2]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(chips()[1]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(input());
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(document.activeElement).toBe(input());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
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
});
