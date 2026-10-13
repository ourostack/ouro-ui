import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { SidebarLayout, type SidebarLayoutProps } from "@/registry/ouro/components/ouro/sidebar/sidebar-layout";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="sidebar-layout"]')!;
    },
    get main() {
      return host.querySelector<HTMLElement>("main")!;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
let margin = "";
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  margin = document.body.style.margin;
  document.body.style.margin = "0";
  await page.viewport(1024, 768);
});
afterEach(async () => {
  vi.restoreAllMocks();
  document.body.style.margin = margin;
  scrollTo(0, 0);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

const sidebar = <Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]} />;
const tall = <div style={{ height: 2000 }}>Page content</div>;

describe("SidebarLayout", () => {
  it("puts the sidebar beside the page's main landmark, at the full height of the screen", async () => {
    const { root, main } = await render(<SidebarLayout sidebar={sidebar}>Page content</SidebarLayout>);
    expect(root.getBoundingClientRect().height).toBeGreaterThanOrEqual(innerHeight);
    expect(main.textContent).toBe("Page content");
    const nav = page.getByRole("navigation", { name: "Main" }).element().getBoundingClientRect();
    const box = main.getBoundingClientRect();
    expect(nav.left).toBe(0);
    expect(nav.height).toBe(innerHeight);
    expect(box.left).toBeGreaterThanOrEqual(nav.right);
    expect(Math.round(box.right)).toBe(innerWidth);
  });

  it("keeps the sidebar in view while the page scrolls", async () => {
    await render(<SidebarLayout sidebar={sidebar}>{tall}</SidebarLayout>);
    scrollTo(0, 800);
    await expect.poll(() => scrollY).toBe(800);
    const nav = page.getByRole("navigation", { name: "Main" }).element().getBoundingClientRect();
    expect(nav.top).toBe(0);
    expect(nav.height).toBe(innerHeight);
  });

  it("shows the header above the page, beside the sidebar", async () => {
    const { main } = await render(
      <SidebarLayout sidebar={sidebar} header={<span data-testid="head">Search</span>}>
        Page content
      </SidebarLayout>,
    );
    const head = page.getByTestId("head").element().getBoundingClientRect();
    const nav = page.getByRole("navigation", { name: "Main" }).element().getBoundingClientRect();
    expect(head.left).toBeGreaterThanOrEqual(nav.right);
    expect(head.bottom).toBeLessThanOrEqual(main.getBoundingClientRect().top);
  });

  it("starts with a skip link that moves focus to the main landmark", async () => {
    const { main } = await render(<SidebarLayout sidebar={sidebar}>Page content</SidebarLayout>);
    await pressTab();
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect.element(skip).toHaveFocus();
    const box = skip.element().getBoundingClientRect();
    expect(box.width).toBeGreaterThan(44);
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(skip.element().getAttribute("href")).toBe(`#${main.id}`);
    expect(main.id).not.toBe("");
    expect(main.tabIndex).toBe(-1);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement).toBe(main);
    history.replaceState(null, "", location.pathname + location.search);
  });

  it("renders the page in a div with as, inside a page that has its own main landmark", async () => {
    await render(
      <SidebarLayout as="div" sidebar={sidebar}>
        Page content
      </SidebarLayout>,
    );
    expect(document.querySelector("main")).toBeNull();
    const target = document.getElementById(page.getByRole("link", { name: "Skip to content" }).element().getAttribute("href")!.slice(1))!;
    expect(target.tagName).toBe("DIV");
    expect(target.textContent).toBe("Page content");
    expect(target.tabIndex).toBe(-1);
  });

  it("takes the skip link's text as a prop", async () => {
    await render(
      <SidebarLayout sidebar={sidebar} skipLabel="Zum Inhalt">
        Page content
      </SidebarLayout>,
    );
    await expect.element(page.getByRole("link", { name: "Zum Inhalt" })).toBeInTheDocument();
  });

  it("puts the sidebar's menu button in a bar across the top of a phone, with the header beside it", async () => {
    await page.viewport(390, 844);
    const { main } = await render(
      <SidebarLayout sidebar={sidebar} header={<span data-testid="head">Search</span>}>
        {tall}
      </SidebarLayout>,
    );
    const button = page.getByRole("button", { name: "Menu" }).element().getBoundingClientRect();
    const head = page.getByTestId("head").element().getBoundingClientRect();
    const box = main.getBoundingClientRect();
    expect(button.top).toBeLessThan(56);
    expect(head.left).toBeGreaterThanOrEqual(button.right);
    expect(head.top).toBeLessThan(56);
    expect(box.left).toBe(0);
    expect(box.width).toBe(390);
    expect(box.top).toBeGreaterThanOrEqual(button.bottom);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    scrollTo(0, 600);
    await expect.poll(() => scrollY).toBe(600);
    expect(page.getByRole("button", { name: "Menu" }).element().getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  });

  it("draws the phone's top bar across the full width without a header", async () => {
    await page.viewport(390, 844);
    const { root } = await render(<SidebarLayout sidebar={sidebar}>Page content</SidebarLayout>);
    const filler = root.querySelector<HTMLElement>("[data-ouro-sidebar-layout-header]")!;
    expect(Math.round(filler.getBoundingClientRect().right)).toBe(390);
    await page.viewport(1024, 768);
    await expect.poll(() => getComputedStyle(filler).display).toBe("none");
  });

  it("pads the page by default and runs edge to edge with bleed", async () => {
    const padded = await render(<SidebarLayout sidebar={sidebar}>Page content</SidebarLayout>);
    expect(getComputedStyle(padded.main).paddingLeft).toBe("24px");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    mounted.splice(0).forEach((node) => node.remove());
    const bleed = await render(
      <SidebarLayout sidebar={sidebar} bleed>
        Page content
      </SidebarLayout>,
    );
    expect(getComputedStyle(bleed.main).paddingLeft).toBe("0px");
  });

  it("renders the sidebar and the page in the server HTML", () => {
    const html = renderToString(<SidebarLayout sidebar={sidebar}>Page content</SidebarLayout>);
    expect(html).toContain('<nav aria-label="Main"');
    expect(html).toMatch(/<main[^>]*>Page content<\/main>/);
    const id = /<main[^>]*id="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`href="#${id}"`);
  });

  it("passes className and ref to the root", async () => {
    let node: HTMLElement | null = null;
    const { root } = await render(
      <SidebarLayout
        sidebar={sidebar}
        className="min-h-96"
        ref={(element) => {
          node = element;
        }}
      >
        Page content
      </SidebarLayout>,
    );
    expect(root.classList.contains("min-h-96")).toBe(true);
    expect(node).toBe(root);
  });

  it("warns about appearance classes and the props agents guess", async () => {
    const guessed = { sidebar, children: "x", className: "bg-zinc-100", navbar: "x" } as unknown as SidebarLayoutProps;
    await render(<SidebarLayout {...guessed} />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toContain('[ouro-ui] SidebarLayout: "bg-zinc-100" sets appearance, and className is for layout only. Fix: remove "bg-zinc-100"; SidebarLayout sets its own look.');
    expect(messages).toContain("[ouro-ui] SidebarLayout: navbar is not a prop; the bar above the page is header. Fix: <SidebarLayout sidebar={<Sidebar … />} header={…}>.");
  });

  it("warns when there is no sidebar", async () => {
    const bare = { children: "x" } as unknown as SidebarLayoutProps;
    await render(<SidebarLayout {...bare} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] SidebarLayout: sidebar is required. Fix: <SidebarLayout sidebar={<Sidebar label="Main" sections={[…]} />}>; for a bar across the top use <StackedLayout navbar={…}>.',
    );
  });
});
