import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Menu, MenuItem } from "@/registry/ouro/components/ouro/menu/menu";
import { NavigationRail } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { applyThemeFixture, themeFixtures } from "./theme-fixtures.ts";

// Button, Menu and the rail paint their hover from the state and row tokens, so one token retunes them, and in every
// theme the hover reads against the page and never as the row's selected fill.

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** Lightness in OKLab, 0 to 1, of a computed colour laid over `page`. */
function lightness(color: string, backdrop: string): number {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = backdrop;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const roots: Root[] = [];
const mounted: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  document.documentElement.classList.remove("dark");
});

async function mount(node: React.ReactNode, style = "") {
  const host = document.createElement("div");
  host.style.cssText = `width: 320px; background: var(--background); ${style}`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const settled = async (element: Element) => {
  await Promise.allSettled(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
};

describe("Button's hover overlay", () => {
  it("follows --ouro-state-hover, so one token retunes every button", async () => {
    const host = await mount(<Button variant="plain">Save</Button>, "--ouro-state-hover: 40%;");
    const button = host.querySelector("button")!;
    await userEvent.hover(button);
    await settled(button);
    expect(getComputedStyle(button, "::before").opacity).toBe("0.4");
  });
});

const themes: Array<[string, (() => () => void) | undefined]> = [["Ouro", undefined], ...Object.keys(themeFixtures).map((name): [string, () => () => void] => [name, () => applyThemeFixture(name)])];

describe.each(themes)("rail and menu hover under the %s theme", (_name, apply) => {
  it.each(["light", "dark"] as const)("paints a fill that reads against the page in %s", async (scheme) => {
    const remove = apply?.();
    try {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      const host = await mount(<NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <svg viewBox="0 0 8 8" /> }, { label: "Files", href: "/files", icon: <svg viewBox="0 0 8 8" /> }]} currentPath="/chat" />);
      const backdrop = getComputedStyle(host).backgroundColor;
      const other = host.querySelector<HTMLElement>('a[href="/files"]')!;
      await userEvent.hover(other);
      await settled(other);
      const hover = getComputedStyle(other).backgroundColor;
      expect(Math.abs(lightness(hover, backdrop) - lightness(backdrop, backdrop)), "rail hover against the page").toBeGreaterThanOrEqual(0.01);

      const host2 = await mount(<Menu trigger={<Button>Open</Button>}><MenuItem onClick={() => {}}>Edit</MenuItem></Menu>);
      host2.querySelector("button")!.focus();
      await userEvent.keyboard("{Enter}");
      const item = page.getByRole("menuitem", { name: "Edit", exact: true });
      await expect.element(item).toBeVisible();
      await userEvent.hover(item.element());
      await expect.element(item).toHaveAttribute("data-highlighted");
      const popup = item.element().closest<HTMLElement>('[role="menu"]')!;
      const surface = getComputedStyle(popup).backgroundColor;
      expect(Math.abs(lightness(getComputedStyle(item.element()).backgroundColor, surface) - lightness(surface, surface)), "menu hover against its popup").toBeGreaterThanOrEqual(0.01);
    } finally {
      remove?.();
    }
  });
});
