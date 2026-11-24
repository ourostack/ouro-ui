import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
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

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]')!;
const edges = () => [...listbox().querySelectorAll<HTMLElement>("[data-ouro-command-value],[data-ouro-command-group-label]")];

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
});

describe("Command rows", () => {
  const show = (count: number, grouped: boolean) => {
    const rows = Array.from({ length: count }, (_, index) => ({ label: `Place ${index}`, onSelect: () => {} }));
    const items = grouped ? Array.from({ length: count / 4 }, (_, index) => ({ label: `Group ${index}`, items: rows.slice(index * 4, index * 4 + 4) })) : rows;
    return render(<Command title="Go to" open onOpenChange={() => {}} items={items} />);
  };

  it("lets the list grow back to its content when the window gets taller", async () => {
    await page.viewport(1280, 520);
    await show(12, false);
    const box = listbox();
    await expect.poll(() => box.style.maxHeight).not.toBe("");
    const short = parseFloat(box.style.maxHeight);
    await page.viewport(1280, 1600);
    await expect.poll(() => parseFloat(box.style.maxHeight)).toBeGreaterThan(short);
  });

  it("leaves the list to overflow, uncut, when the window is too short for even one whole row", async () => {
    await page.viewport(1280, 50);
    await show(12, false);
    const box = listbox();
    await expect.poll(() => box.scrollHeight > box.clientHeight).toBe(true);
    await expect.poll(() => edges().some((edge) => edge.getBoundingClientRect().height > box.clientHeight)).toBe(true);
    expect(box.style.maxHeight).toBe("");
  });

  it("ends the list on a whole row or heading at rest, never through one, at any height and with or without groups", async () => {
    for (const height of [520, 600, 700, 800]) {
      for (const grouped of [false, true]) {
        await page.viewport(1280, height);
        await show(40, grouped);
        await expect.poll(() => edges().length).toBeGreaterThan(0);
        const box = listbox();
        await expect.poll(() => box.scrollHeight > box.clientHeight).toBe(true);
        const bottom = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom);
        const cut = edges().filter((edge) => {
          const rect = edge.getBoundingClientRect();
          return rect.top < bottom - 0.5 && rect.bottom > bottom + 0.5;
        });
        expect(cut, `${height}px, grouped ${grouped}`).toEqual([]);
        expect(box.style.maxHeight, `${height}px, grouped ${grouped}`).not.toBe("");
        // The cut is flush with the last whole edge that fits: the next one would not have fitted.
        const top = box.getBoundingClientRect().top - box.scrollTop;
        const end = parseFloat(getComputedStyle(box).paddingBottom);
        const bottoms = edges().map((edge) => edge.getBoundingClientRect().bottom - top + end);
        expect(Math.max(...bottoms.filter((value) => value <= box.clientHeight + 0.5))).toBeCloseTo(box.clientHeight, 0);
        expect(Math.min(...bottoms.filter((value) => value > box.clientHeight + 0.5))).toBeGreaterThan(box.clientHeight);
        await act(async () => roots.splice(0).forEach((root) => root.unmount()));
        for (const node of mounted.splice(0)) node.remove();
      }
    }
  });
});
