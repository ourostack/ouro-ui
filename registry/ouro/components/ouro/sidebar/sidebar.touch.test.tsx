import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
});

const StayLink: OuroLinkComponent = ({ onClick, ...props }: ComponentProps<OuroLinkComponent>) => (
  <a
    {...props}
    onClick={(event) => {
      event.preventDefault();
      onClick?.(event);
    }}
  />
);

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.height = "100dvh";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<OuroProvider linkComponent={StayLink}>{node}</OuroProvider>));
  return host;
}

/** Every target is at least 44px in both directions, with 16px text. */
function expectTouchSize(targets: Element[], count: number) {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(targets.length).toBe(count);
  for (const target of targets) {
    const box = target.getBoundingClientRect();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(parseFloat(getComputedStyle(target).fontSize)).toBeGreaterThanOrEqual(16);
  }
}

const sections = [
  { items: [{ label: "Recipes", href: "/recipes" }] },
  { label: "Library", items: [{ label: "Cookbooks", href: "/cookbooks" }] },
];

describe("Sidebar on a phone", () => {
  it("keeps the menu button, its icon and each row 44px to a finger at a compact --spacing", async () => {
    const host = await render(<Sidebar label="Main" sections={sections} currentPath="/recipes" />);
    const menu = host.querySelector<HTMLElement>("[data-ouro-sidebar-menu]")!;
    menu.click();
    await expect.poll(() => document.querySelector('[role="dialog"] a[href="/recipes"]')).not.toBeNull();
    const row = () => [...document.querySelectorAll<HTMLElement>('a[href="/recipes"]')].find((link) => link.getBoundingClientRect().height > 0)!;
    const measure = () => [menu.getBoundingClientRect().width, menu.querySelector("svg")!.getBoundingClientRect().width, row().getBoundingClientRect().height];
    expect(measure()).toEqual([44, 20, 44]);
    document.body.style.setProperty("--spacing", "0.2rem");
    try {
      expect(measure()).toEqual([44, 20, 44]);
    } finally {
      document.body.style.removeProperty("--spacing");
    }
  });

  it("opens the drawer on tap, with 44px rows in 16px text, and closes on a link", async () => {
    const host = await render(<Sidebar label="Main" sections={sections} currentPath="/recipes" />);
    const target = host.querySelector<HTMLElement>("[data-ouro-sidebar-menu] [data-ouro-touch-target]")!;
    expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(target.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await commands.tap("[data-ouro-sidebar-menu]");
    await expect.element(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await expect.poll(() => document.getAnimations().length).toBe(0);
    expectTouchSize(page.getByRole("dialog").getByRole("link").elements(), 2);
    await commands.tap('[role="dialog"] a[href="/cookbooks"]');
    await expect.poll(() => page.getByRole("dialog").elements().length).toBe(0);
  });

  it("keeps 44px rows in 16px text in the column in landscape, also collapsed", async () => {
    const host = await render(<Sidebar label="Main" sections={sections} />);
    await rotate(844, 390);
    await expect.poll(() => innerWidth).toBe(844);
    await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    expectTouchSize([...host.querySelectorAll("nav a, nav button")], 3);
    await commands.tap("nav button");
    await expect.element(page.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => host.querySelector("nav")!.getBoundingClientRect().width).toBe(61);
    expectTouchSize([...host.querySelectorAll("nav a, nav button")], 3);
  });
});
