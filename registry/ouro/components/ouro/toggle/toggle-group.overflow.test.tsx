import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ToggleGroup, type ToggleGroupItem } from "@/registry/ouro/components/ouro/toggle/toggle-group";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "8px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get row() {
      return host.querySelector<HTMLElement>('[role="group"]')!;
    },
    get toggles() {
      return [...host.querySelectorAll<HTMLButtonElement>("button")];
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await page.viewport(1024, 768);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1024, 768);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const filters: ToggleGroupItem[] = [
  { value: "all", label: "All conversations" },
  { value: "unread", label: "Unread messages" },
  { value: "flagged", label: "Flagged for follow-up" },
  { value: "archived", label: "Archived threads" },
  { value: "drafts", label: "Saved drafts" },
];

describe("ToggleGroup overflow scroll", () => {
  it("stays one line tall, narrower than the toggles, instead of wrapping", async () => {
    await page.viewport(320, 400);
    const { row, toggles } = await render(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters} value="all" onValueChange={() => {}} />,
    );
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    const rowHeight = row.getBoundingClientRect().height;
    const toggleHeight = toggles[0]!.getBoundingClientRect().height;
    expect(rowHeight).toBeLessThanOrEqual(toggleHeight + 2);
  });

  it("fades no side once every toggle fits, and the side that hides one once it doesn't", async () => {
    await page.viewport(1024, 768);
    const fits = await render(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters.slice(0, 2)} value="all" onValueChange={() => {}} />,
    );
    await expect.poll(() => fits.row.hasAttribute("data-ouro-scroll-fade")).toBe(false);

    await page.viewport(320, 400);
    const cut = await render(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters} value="all" onValueChange={() => {}} />,
    );
    await expect.poll(() => cut.row.hasAttribute("data-ouro-scroll-fade")).toBe(true);
    await expect.poll(() => getComputedStyle(cut.row).maskImage).toContain("gradient");
  });

  it("brings the last toggle fully into view when End moves focus to it", async () => {
    await page.viewport(320, 400);
    const { row, toggles } = await render(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters} value="all" onValueChange={() => {}} />,
    );
    await pressTab();
    expect(document.activeElement).toBe(toggles[0]);
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    await expect.poll(() => document.activeElement).toBe(toggles.at(-1));
    const box = row.getBoundingClientRect();
    const at = toggles.at(-1)!.getBoundingClientRect();
    await expect.poll(() => at.left >= box.left - 1 && at.right <= box.right + 1).toBe(true);
  });

  it("scrolls the pressed toggle into view when the value changes", async () => {
    await page.viewport(320, 400);
    const { row, rerender, toggles } = await render(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters} value="all" onValueChange={() => {}} />,
    );
    expect(row.scrollLeft).toBe(0);
    await rerender(
      <ToggleGroup label="Show" hideLabel overflow="scroll" items={filters} value="drafts" onValueChange={() => {}} />,
    );
    const box = row.getBoundingClientRect();
    const at = toggles.at(-1)!.getBoundingClientRect();
    await expect.poll(() => at.left >= box.left - 1 && at.right <= box.right + 1).toBe(true);
  });
});
