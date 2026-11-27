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

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]')!;
const edges = () => [...listbox().querySelectorAll<HTMLElement>("[data-ouro-command-value],[data-ouro-command-group-label]")];

/**
 * Counts the layout reads Ouro's own code makes for a key, from its keydown to the end of its input event, by when React
 * has committed what it typed: each read of a box, size or scroll position, which lays the page out to answer when a
 * change waits to be laid out. Base UI's own reads (its input's keydown, its check of whether the list scrolls) are its
 * own. Returns what was read, each with where, and a function that puts the page's own getters back.
 */
function countKeyLayoutReads(): { reads: string[]; restore: () => void } {
  const reads: string[] = [];
  let counting = false;
  const restores: (() => void)[] = [];
  const read = (name: string) => {
    const ours = (new Error().stack ?? "").split("\n").find((line) => line.includes("/registry/ouro/") && !line.includes(".test."));
    if (ours) reads.push(`${name} at ${ours.trim()}`);
  };
  const watch = (proto: object, name: string) => {
    const own = Object.getOwnPropertyDescriptor(proto, name)!;
    if (own.get) Object.defineProperty(proto, name, { ...own, get(this: Element) { if (counting) read(name); return own.get!.call(this); } });
    else Object.defineProperty(proto, name, { ...own, value(this: Element, ...args: unknown[]) { if (counting) read(name); return (own.value as (...a: unknown[]) => unknown).apply(this, args); } });
    restores.push(() => Object.defineProperty(proto, name, own));
  };
  for (const name of ["scrollHeight", "scrollWidth", "scrollTop", "clientHeight", "clientWidth", "getBoundingClientRect", "getClientRects"]) watch(Element.prototype, name);
  for (const name of ["offsetHeight", "offsetWidth", "offsetTop", "offsetLeft"]) watch(HTMLElement.prototype, name);
  const start = () => (counting = true);
  const stop = () => (counting = false);
  window.addEventListener("keydown", start, { capture: true });
  window.addEventListener("input", stop);
  restores.push(() => {
    window.removeEventListener("keydown", start, { capture: true });
    window.removeEventListener("input", stop);
  });
  return { reads, restore: () => restores.splice(0).forEach((undo) => undo()) };
}

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

  it("reads no layout while a typed key commits, and fits the list once the browser has laid it out", async () => {
    await page.viewport(1280, 700);
    await show(40, true);
    const box = listbox();
    await expect.poll(() => box.style.maxHeight).not.toBe("");
    const keys = countKeyLayoutReads();
    try {
      await userEvent.type(page.getByRole("combobox"), "Place 39");
    } finally {
      keys.restore();
    }
    expect(keys.reads, "what Ouro's code read for the keys").toEqual([]);
    // One row matches, so the list is no longer cut: fitted after the browser laid out what the last key drew.
    await expect.poll(() => edges().length).toBe(2);
    await expect.poll(() => box.style.maxHeight).toBe("");
  });

  it("ends the list on a whole row or heading at rest, never through one, at any height and with or without groups", async () => {
    for (const height of [520, 600, 700, 800]) {
      for (const grouped of [false, true]) {
        await page.viewport(1280, height);
        await show(40, grouped);
        await expect.poll(() => edges().length).toBeGreaterThan(0);
        const box = listbox();
        await expect.poll(() => box.scrollHeight > box.clientHeight).toBe(true);
        // At rest: cut once the browser has laid the rows out.
        await expect.poll(() => box.style.maxHeight).not.toBe("");
        const bottom = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom);
        const cut = edges().filter((edge) => {
          const rect = edge.getBoundingClientRect();
          return rect.top < bottom - 0.5 && rect.bottom > bottom + 0.5;
        });
        expect(cut, `${height}px, grouped ${grouped}`).toEqual([]);
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

  it("ends the list on a whole row in layout terms when an ancestor is scaled, as under a dialog's entrance", async () => {
    await page.viewport(1280, 800);
    document.body.style.transform = "scale(0.96)";
    document.body.style.transformOrigin = "0 0";
    try {
      await show(40, false);
      const box = listbox();
      await expect.poll(() => box.style.maxHeight).not.toBe("");
      const scale = box.getBoundingClientRect().height / box.offsetHeight;
      expect(scale).toBeLessThan(0.99);
      const end = parseFloat(getComputedStyle(box).paddingBottom);
      const bottoms = edges().map((edge) => (edge.getBoundingClientRect().bottom - box.getBoundingClientRect().top) / scale + box.scrollTop + end);
      expect(Math.max(...bottoms.filter((value) => value <= box.clientHeight + 0.5))).toBeCloseTo(box.clientHeight, 0);
    } finally {
      document.body.style.transform = "";
      document.body.style.transformOrigin = "";
    }
  });
});
