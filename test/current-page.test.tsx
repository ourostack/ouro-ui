import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.documentElement.removeAttribute("dir");
  await page.viewport(414, 896);
});

async function render(node: ReactNode, direction: "ltr" | "rtl", width = 1024) {
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
  expect(marker[direction === "rtl" ? "right" : "left"]).toBe("0px");
  expect(getComputedStyle(other, "::before").content).toBe("none");
  expect(getComputedStyle(current).backgroundColor).toBe("rgba(0, 0, 0, 0)");
}

for (const direction of ["ltr", "rtl"] as const) {
  for (const collapsed of [false, true]) {
    test(`Sidebar marks the current page at the ${direction} start edge on its ${collapsed ? "rail" : "column"}`, async () => {
      await render(
        <Sidebar label="Main" defaultCollapsed={collapsed} sections={[{ items: [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }] }]} currentPath="/recipes" />,
        direction,
      );
      expectCurrentMark(page.getByRole("link", { name: "Recipes" }).element(), page.getByRole("link", { name: "Cookbooks" }).element(), direction);
    });
  }

  test(`Navbar marks the current page at the ${direction} start edge in its bar`, async () => {
    await render(<Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }]} currentPath="/recipes" />, direction);
    expectCurrentMark(page.getByRole("link", { name: "Recipes" }).element(), page.getByRole("link", { name: "Cookbooks" }).element(), direction);
  });

  for (const kind of ["Sidebar", "Navbar"] as const) {
    test(`${kind} keeps the current-page bar in its ${direction} phone drawer`, async () => {
      const links = [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }];
      await render(kind === "Sidebar" ? <Sidebar label="Main" sections={[{ items: links }]} currentPath="/recipes" /> : <Navbar label="Main" items={links} currentPath="/recipes" />, direction, 390);
      await userEvent.click(page.getByRole("button", { name: "Menu", exact: true }));
      const drawer = page.getByRole("dialog");
      await expect.element(drawer).toBeVisible();
      expectCurrentMark(drawer.getByRole("link", { name: "Recipes" }).element(), drawer.getByRole("link", { name: "Cookbooks" }).element(), direction);
    });
  }

  test(`NavigationMenu keeps the ${direction} current-page bar distinct from its open panel`, async () => {
    await render(<NavigationMenu label="Main" items={[{ label: "Pricing", href: "/pricing" }, { label: "Recipes", links: [{ label: "Browse", href: "/recipes" }, { label: "Drafts", href: "/recipes/drafts" }] }]} currentPath="/pricing" />, direction);
    expectCurrentMark(page.getByRole("link", { name: "Pricing" }).element(), page.getByRole("button", { name: "Recipes" }).element(), direction);
  });

  test(`NavigationMenu marks the current link inside its ${direction} panel`, async () => {
    await render(<NavigationMenu label="Main" items={[{ label: "Recipes", links: [{ label: "Browse", href: "/recipes" }, { label: "Drafts", href: "/recipes/drafts" }] }]} currentPath="/recipes/drafts" />, direction);
    await userEvent.click(page.getByRole("button", { name: "Recipes" }));
    const current = page.getByRole("link", { name: "Drafts" });
    await expect.element(current).toBeVisible();
    expectCurrentMark(current.element(), page.getByRole("link", { name: "Browse" }).element(), direction);
  });
}
