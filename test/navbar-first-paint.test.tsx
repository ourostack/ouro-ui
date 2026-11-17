import type { ComponentProps, ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Navbar, type NavbarProps } from "@/registry/ouro/components/ouro/navbar/navbar";
import { findLoadingIssues, listenForMeasures, type Measures } from "@/registry/ouro/check/measure";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { audit, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";

// Navbar's first paint: the links and the menu button are both in the server HTML, and CSS at the collapse breakpoint shows
// one of them, so the bar a phone or a desktop draws first is the bar it keeps once the page hydrates. Repository-only: the
// ouro-check measure reads the page the way ouro-check does. Runs in Chromium and WebKit.

const StayLink: OuroLinkComponent = ({ onClick, ...props }: ComponentProps<OuroLinkComponent>) => (
  <a
    data-router=""
    {...props}
    onClick={(event) => {
      event.preventDefault();
      onClick?.(event);
    }}
  />
);

const items = [
  { label: "Recipes", href: "/recipes" },
  { label: "Cookbooks", href: "/cookbooks" },
  { label: "Shopping list", href: "/shopping-list" },
];

/** A link set about as wide as a consuming site's: too wide for a tablet's bar, and it fits a desktop's. */
const wideItems = ["Kitchen and pantry", "My saved recipes", "Shared cookbooks", "Weekly shopping list", "Spoons and forks"].map((label) => ({
  label,
  href: `/${label.toLowerCase().replaceAll(" ", "-")}`,
}));

const barWith = (props: Partial<NavbarProps> = {}) => (
  <OuroProvider linkComponent={StayLink}>
    <Navbar
      label="Main"
      items={items}
      currentPath="/recipes"
      brand={<strong>Spoonjoy</strong>}
      actions={<button type="button">Account</button>}
      {...props}
    />
  </OuroProvider>
);
const bar = barWith();

const nodes: Element[] = [];
const roots: Root[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
  delete (window as unknown as { __ouroCheckMeasures?: Measures }).__ouroCheckMeasures;
  delete (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef;
});

const frames = (count = 2) =>
  new Promise<void>((done) => {
    const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

/** The page as the server sends it: the bar drawn, then hydrated a few frames later. */
async function serve(width: number, node: ReactNode = bar) {
  await page.viewport(width, 844);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  host.innerHTML = renderToString(node);
  await frames();
  return host;
}

async function hydrate(host: HTMLElement, node: ReactNode = bar) {
  const recoverable = vi.fn();
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(host, node, { onRecoverableError: recoverable });
  });
  roots.push(root);
  return recoverable;
}

const headerOf = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-ouro="navbar"]')!;

async function sameBar(width: number, node: ReactNode = bar) {
  const host = await serve(width, node);
  const served = headerOf(host).outerHTML;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const recoverable = await hydrate(host, node);
  // The phone menu's sheet is built while the page is idle; it is outside the bar, and the bar must not move for it.
  await new Promise((resolve) => setTimeout(resolve, 600));
  await frames(4);
  expect(recoverable).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(headerOf(host).outerHTML).toBe(served);
}

async function noSwap(width: number, node: ReactNode = bar) {
  listenForMeasures();
  const host = await serve(width, node);
  await hydrate(host, node);
  await frames(12);
  // The rule saw the bar: its first frames drew the phone's menu button or the desktop's links.
  const drawn = (window as unknown as { __ouroCheckMeasures: Measures }).__ouroCheckMeasures.painted;
  expect([...drawn.keys()].some((element) => element.matches("[data-ouro-navbar-menu], [data-ouro-navbar-links] a"))).toBe(true);
  const issues = await findLoadingIssues({ "layout-shift": 0.1, "first-content": 2500 });
  expect(issues.filter((issue) => issue.rule === "first-paint-swap")).toEqual([]);
}

describe("Navbar's first paint", () => {
  it("is the same bar on a phone, server HTML and hydrated, with nothing swapped", () => sameBar(390));
  it("is the same bar on a desktop, server HTML and hydrated, with nothing swapped", () => sameBar(1440));
  it("draws no control on a phone that a later frame swaps for another, by ouro-check's first-paint-swap rule", () => noSwap(390));
  it("draws no control on a desktop that a later frame swaps for another, by ouro-check's first-paint-swap rule", () => noSwap(1440));
});

describe("Navbar's collapse breakpoint", () => {
  const lg = barWith({ collapseBelow: "lg", items: wideItems });

  it("with collapseBelow lg, the menu shows below lg and the links from lg up", async () => {
    const host = await serve(768, lg);
    await hydrate(host, lg);
    const menu = host.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!;
    const links = host.querySelector<HTMLElement>("[data-ouro-navbar-links]")!;
    expect(getComputedStyle(menu).display).not.toBe("none");
    expect(getComputedStyle(links).display).toBe("none");
    await page.viewport(1024, 844);
    await expect.poll(() => getComputedStyle(menu).display).toBe("none");
    expect(getComputedStyle(links).display).not.toBe("none");
  });

  it("with collapseBelow md, the menu shows below md and the links from md up", async () => {
    const md = barWith({ collapseBelow: "md", items: wideItems });
    const host = await serve(700, md);
    await hydrate(host, md);
    const menu = host.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!;
    expect(getComputedStyle(menu).display).not.toBe("none");
    await page.viewport(800, 844);
    await expect.poll(() => getComputedStyle(menu).display).toBe("none");
  });

  it("with collapseBelow lg, is the same bar at 390, 768, 1024 and 1440, server HTML and hydrated, with nothing swapped", async () => {
    for (const width of [390, 768, 1024, 1440]) await sameBar(width, lg);
  });
  it("with collapseBelow lg, draws no control on a phone that a later frame swaps for another", () => noSwap(390, lg));
  it("with collapseBelow lg, draws no control on a tablet that a later frame swaps for another", () => noSwap(768, lg));
  it("with collapseBelow lg, draws no control on a small desktop that a later frame swaps for another", () => noSwap(1024, lg));
  it("with collapseBelow lg, draws no control on a desktop that a later frame swaps for another", () => noSwap(1440, lg));

  it("with collapseBelow lg, has one navigation landmark and passes axe at 768 and 1024", async () => {
    for (const width of [768, 1024]) {
      const host = await serve(width, lg);
      await hydrate(host, lg);
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(page.getByRole("navigation").elements().length).toBe(width >= 1024 ? 1 : 0);
      expect(describeFindings(await audit({ include: [host] }))).toBe("");
      host.remove();
    }
  });
});

describe("Navbar's landmarks and names", () => {
  it("has one navigation landmark on a desktop, each link named once, and passes axe", async () => {
    const host = await serve(1440);
    await hydrate(host);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(page.getByRole("navigation").elements().length).toBe(1);
    for (const name of ["Recipes", "Cookbooks", "Shopping list"]) expect(page.getByRole("link", { name }).elements().length).toBe(1);
    expect(page.getByRole("button", { name: "Menu" }).elements().length).toBe(0);
    expect(describeFindings(await audit({ include: [host] }))).toBe("");
  });

  it("has no navigation landmark on a phone until the menu opens it, with each link named once, and passes axe", async () => {
    const host = await serve(390);
    await hydrate(host);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(page.getByRole("navigation").elements().length).toBe(0);
    expect(page.getByRole("button", { name: "Menu" }).elements().length).toBe(1);
    expect(describeFindings(await audit({ include: [host] }))).toBe("");
    await userEvent.click(page.getByRole("button", { name: "Menu" }));
    await expect.element(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    expect(page.getByRole("navigation").elements().length).toBe(1);
    expect(page.getByRole("link", { name: "Cookbooks" }).elements().length).toBe(1);
  });
});

describe("Navbar's breakpoint, in CSS", () => {
  it("shows only the menu button on a phone, and only the links from 640px up", async () => {
    const host = await serve(390);
    await hydrate(host);
    const menu = host.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!;
    const links = host.querySelector<HTMLElement>("[data-ouro-navbar-links]")!;
    expect(getComputedStyle(menu).display).not.toBe("none");
    expect(getComputedStyle(links).display).toBe("none");
    // Hidden links take no focus: a focus call on one leaves focus where it was.
    host.querySelector<HTMLElement>("a[href='/recipes']")!.focus();
    expect(document.activeElement).not.toBe(host.querySelector("a[href='/recipes']"));
    menu.focus();
    expect(document.activeElement).toBe(menu);
  });

  it("shows only the links at 1440, and the menu button is out of the tab order", async () => {
    const host = await serve(1440);
    await hydrate(host);
    const menu = host.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!;
    expect(getComputedStyle(menu).display).toBe("none");
    expect(getComputedStyle(host.querySelector<HTMLElement>("[data-ouro-navbar-links]")!).display).not.toBe("none");
    menu.focus();
    expect(document.activeElement).not.toBe(menu);
  });
});

describe("Navbar's default collapse breakpoint", () => {
  it("keeps the links at 768 by default, where they fit the bar, and shows the menu only below sm", async () => {
    const host = await serve(768);
    await hydrate(host);
    expect(getComputedStyle(host.querySelector<HTMLElement>("[data-ouro-navbar-menu]")!).display).toBe("none");
    expect(getComputedStyle(host.querySelector<HTMLElement>("[data-ouro-navbar-links]")!).display).not.toBe("none");
  });
});
