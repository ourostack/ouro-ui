import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { isTransparent } from "@/registry/ouro/lib/ouro/testing/color";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.documentElement.removeAttribute("dir");
  await commands.emulateMedia({ forcedColors: "none" });
  await page.viewport(414, 896);
});

/**
 * Moves the real mouse off the test's page, so nothing a test mounts starts out under it. The
 * mouse stays where the last test pressed (a phone drawer's Menu button), and WebKit sends a mouse
 * move to whatever mounts under it: a current link hovered that way paints its hover background.
 */
async function parkPointer() {
  await userEvent.hover(document.documentElement, { position: { x: -8, y: -8 }, force: true });
}

async function render(node: ReactNode, direction: "ltr" | "rtl", width = 1024) {
  await parkPointer();
  await page.viewport(width, 768);
  document.documentElement.dir = direction;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
}

function expectCurrentMark(current: Element, other: Element, direction: "ltr" | "rtl") {
  expect(current.getAttribute("aria-current")).toBe("page");
  const marker = getComputedStyle(current, "::before");
  expect(marker.content).toBe('""');
  expect(parseFloat(marker.width)).toBe(2);
  expect(marker.position).toBe("absolute");
  expect(marker.visibility).toBe("visible");
  expect(marker.opacity).toBe("1");
  expect(parseFloat(marker.height)).toBeGreaterThan(0);
  expect(parseFloat(marker.height)).toBeLessThan(current.getBoundingClientRect().height);
  expect(marker[direction === "rtl" ? "right" : "left"]).toBe("0px");
  expect(getComputedStyle(other, "::before").content).toBe("none");
  expect(isTransparent(getComputedStyle(current).backgroundColor)).toBe(true);
}

/**
 * Navbar's and NavigationMenu's mark, FamilyBar's too: the current page underlined in the primary colour, 2px, on
 * `mark` (the link, or a panel link's label), and no underline on `other`.
 */
function expectUnderline(current: Element, other: Element, mark: Element = current) {
  expect(current.getAttribute("aria-current")).toBe("page");
  const style = getComputedStyle(mark);
  expect(style.textDecorationLine).toBe("underline");
  expect(style.textDecorationThickness).toBe("2px");
  expect(style.textDecorationStyle).toBe("solid");
  expect(getComputedStyle(other).textDecorationLine).toBe("none");
  expect(getComputedStyle(current, "::before").content).toBe("none");
  expect(isTransparent(getComputedStyle(current).backgroundColor)).toBe(true);
}

test("current-page transparency accepts computed zero alpha but rejects a faint painted tint", () => {
  const element = document.createElement("div");
  document.body.append(element);
  try {
    element.style.backgroundColor = "oklab(0 0 0 / 0)";
    expect(element.style.backgroundColor).not.toBe("");
    expect(isTransparent(getComputedStyle(element).backgroundColor)).toBe(true);
    element.style.backgroundColor = "oklab(0 0 0 / 0.000001)";
    expect(isTransparent(getComputedStyle(element).backgroundColor)).toBe(false);
  } finally {
    element.remove();
  }
});

for (const direction of ["ltr", "rtl"] as const) {
  for (const kind of ["Sidebar", "Navbar", "NavigationMenu"] as const) {
    test(`${kind} keeps its ${direction} current-page mark visible with forced colors`, async () => {
      const links = [{ label: "Recipes", href: "/recipes" }];
      await render(kind === "Sidebar" ? <Sidebar label="Main" sections={[{ items: links }]} currentPath="/recipes" /> : kind === "Navbar" ? <Navbar label="Main" items={links} currentPath="/recipes" /> : <NavigationMenu label="Main" items={links} currentPath="/recipes" />, direction);
      await commands.emulateMedia({ forcedColors: "active" });
      expect(matchMedia("(forced-colors: active)").matches).toBe(true);
      const current = page.getByRole("link", { name: "Recipes" }).element();
      if (kind !== "Sidebar") {
        // An underline, which forced colours keep in the text's own colour.
        expect(getComputedStyle(current).textDecorationLine).toBe("underline");
        expect(getComputedStyle(current).textDecorationThickness).toBe("2px");
        return;
      }
      const marker = getComputedStyle(current, "::before");
      const paint = parseFloat(marker.borderInlineStartWidth) > 0 ? marker.borderInlineStartColor : marker.backgroundColor;
      expect(paint).toBe(getComputedStyle(current).color);
      expect(paint).not.toBe(getComputedStyle(current).backgroundColor);
    });
  }
  for (const collapsed of [false, true]) {
    test(`Sidebar marks the current page at the ${direction} start edge on its ${collapsed ? "rail" : "column"}`, async () => {
      await render(
        <Sidebar label="Main" defaultCollapsed={collapsed} sections={[{ items: [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }] }]} currentPath="/recipes" />,
        direction,
      );
      expectCurrentMark(page.getByRole("link", { name: "Recipes" }).element(), page.getByRole("link", { name: "Cookbooks" }).element(), direction);
    });
  }

  test(`Navbar underlines the current page in its ${direction} bar`, async () => {
    await render(<Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }]} currentPath="/recipes" />, direction);
    expectUnderline(page.getByRole("link", { name: "Recipes" }).element(), page.getByRole("link", { name: "Cookbooks" }).element());
  });

  for (const kind of ["Sidebar", "Navbar"] as const) {
    test(`${kind} keeps its current-page mark in its ${direction} phone drawer`, async () => {
      const links = [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }];
      await render(kind === "Sidebar" ? <Sidebar label="Main" sections={[{ items: links }]} currentPath="/recipes" /> : <Navbar label="Main" items={links} currentPath="/recipes" />, direction, 390);
      await userEvent.click(page.getByRole("button", { name: "Menu", exact: true }));
      const drawer = page.getByRole("dialog");
      await expect.element(drawer).toBeVisible();
      const marks = [drawer.getByRole("link", { name: "Recipes" }).element(), drawer.getByRole("link", { name: "Cookbooks" }).element()] as const;
      if (kind === "Sidebar") expectCurrentMark(...marks, direction);
      else expectUnderline(...marks);
    });
  }

  test(`NavigationMenu keeps the ${direction} current-page mark distinct from its open panel`, async () => {
    await render(<NavigationMenu label="Main" items={[{ label: "Pricing", href: "/pricing" }, { label: "Recipes", links: [{ label: "Browse", href: "/recipes" }, { label: "Drafts", href: "/recipes/drafts" }] }]} currentPath="/pricing" />, direction);
    expectUnderline(page.getByRole("link", { name: "Pricing" }).element(), page.getByRole("button", { name: "Recipes" }).element());
  });

  test(`NavigationMenu keeps the ${direction} current-page mark when the pointer rested where the current link mounts`, async () => {
    const menu = <NavigationMenu label="Main" items={[{ label: "Pricing", href: "/pricing" }, { label: "Recipes", href: "/recipes" }]} currentPath="/pricing" />;
    await render(menu, direction);
    const spot = page.getByRole("link", { name: "Pricing" }).element().getBoundingClientRect();
    await act(async () => root!.unmount());
    host!.remove();
    // The pointer rests on the spot, as a press in the test before leaves it, and the menu mounts under it.
    await userEvent.hover(document.documentElement, { position: { x: spot.left + spot.width / 2, y: spot.top + spot.height / 2 }, force: true });
    await render(menu, direction);
    // WebKit hovers what mounts under a resting pointer from a timer of its own (up to 250ms), which
    // nothing in the page can wait on; past it, a pointer left there would have hovered the link.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expectUnderline(page.getByRole("link", { name: "Pricing" }).element(), page.getByRole("link", { name: "Recipes" }).element());
  });

  test(`NavigationMenu marks the current link inside its ${direction} panel`, async () => {
    await render(<NavigationMenu label="Main" items={[{ label: "Recipes", links: [{ label: "Browse", href: "/recipes" }, { label: "Drafts", href: "/recipes/drafts", description: "Unfinished recipes" }] }]} currentPath="/recipes/drafts" />, direction);
    await userEvent.click(page.getByRole("button", { name: "Recipes" }));
    const current = page.getByRole("link", { name: /^Drafts/ });
    await expect.element(current).toBeVisible();
    const [label, description] = current.element().querySelectorAll("span");
    expectUnderline(current.element(), page.getByRole("link", { name: "Browse" }).element(), label);
    expect(getComputedStyle(description!).textDecorationLine).toBe("none");
    expect(getComputedStyle(label!).fontWeight).toBe("600");
    expect(getComputedStyle(description!).fontWeight).toBe("400");
  });
}
