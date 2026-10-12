import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout, type StackedLayoutProps } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
      return host.querySelector<HTMLElement>('[data-ouro="stacked-layout"]')!;
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
  await page.viewport(1280, 768);
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

const navbar = <Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />;
const tall = <div style={{ height: 2000 }}>Page content</div>;

describe("StackedLayout", () => {
  it("puts the navbar above the page's main landmark, at least as tall as the screen", async () => {
    const { root, main } = await render(<StackedLayout navbar={navbar}>Page content</StackedLayout>);
    expect(root.getBoundingClientRect().height).toBeGreaterThanOrEqual(innerHeight);
    expect(main.textContent).toBe("Page content");
    const bar = root.querySelector('[data-ouro="navbar"]')!.getBoundingClientRect();
    expect(bar.top).toBe(0);
    expect(Math.round(bar.width)).toBe(innerWidth);
    expect(main.getBoundingClientRect().top).toBeGreaterThanOrEqual(bar.bottom);
  });

  it("centers the page in a column of readable width, and runs edge to edge with bleed", async () => {
    const column = await render(<StackedLayout navbar={navbar}>Page content</StackedLayout>);
    const box = column.main.getBoundingClientRect();
    expect(box.width).toBe(1152);
    expect(Math.abs(box.left + box.width / 2 - innerWidth / 2)).toBeLessThanOrEqual(1);
    expect(getComputedStyle(column.main).paddingLeft).toBe("24px");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    mounted.splice(0).forEach((node) => node.remove());
    const bleed = await render(
      <StackedLayout navbar={navbar} bleed>
        Page content
      </StackedLayout>,
    );
    expect(Math.round(bleed.main.getBoundingClientRect().width)).toBe(innerWidth);
    expect(getComputedStyle(bleed.main).paddingLeft).toBe("0px");
  });

  it("keeps the navbar in view while the page scrolls", async () => {
    const { root } = await render(<StackedLayout navbar={navbar}>{tall}</StackedLayout>);
    scrollTo(0, 800);
    await expect.poll(() => scrollY).toBe(800);
    expect(root.querySelector('[data-ouro="navbar"]')!.getBoundingClientRect().top).toBe(0);
  });

  it("puts the footer at the bottom of a short page", async () => {
    const { root } = await render(
      <StackedLayout navbar={navbar} footer={<span data-testid="foot">Made with Ouro</span>}>
        Page content
      </StackedLayout>,
    );
    const footer = root.querySelector("footer")!;
    expect(footer.contains(page.getByTestId("foot").element())).toBe(true);
    expect(Math.round(footer.getBoundingClientRect().bottom)).toBe(innerHeight);
  });

  it("starts with a skip link that moves focus to the main landmark", async () => {
    const { main } = await render(
      <StackedLayout navbar={navbar} skipLabel="Skip to recipes">
        Page content
      </StackedLayout>,
    );
    await userEvent.keyboard("{Tab}");
    const skip = page.getByRole("link", { name: "Skip to recipes" });
    await expect.element(skip).toHaveFocus();
    expect(skip.element().getBoundingClientRect().width).toBeGreaterThan(44);
    expect(skip.element().getAttribute("href")).toBe(`#${main.id}`);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement).toBe(main);
    history.replaceState(null, "", location.pathname + location.search);
  });

  it("fits a phone without scrolling sideways", async () => {
    await page.viewport(390, 844);
    const { main } = await render(<StackedLayout navbar={navbar}>Page content</StackedLayout>);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    expect(main.getBoundingClientRect().width).toBe(390);
    expect(getComputedStyle(main).paddingLeft).toBe("16px");
    await expect.element(page.getByRole("button", { name: "Menu" })).toBeVisible();
  });

  it("renders the navbar and the page in the server HTML", () => {
    const html = renderToString(<StackedLayout navbar={navbar}>Page content</StackedLayout>);
    expect(html).toContain('data-ouro="navbar"');
    expect(html).toMatch(/<main[^>]*>Page content<\/main>/);
    const id = /<main[^>]*id="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`href="#${id}"`);
  });

  it("passes className and ref to the root", async () => {
    let node: HTMLElement | null = null;
    const { root } = await render(
      <StackedLayout
        navbar={navbar}
        className="min-h-96"
        ref={(element) => {
          node = element;
        }}
      >
        Page content
      </StackedLayout>,
    );
    expect(root.classList.contains("min-h-96")).toBe(true);
    expect(node).toBe(root);
  });

  it("warns about appearance classes and the props agents guess", async () => {
    const guessed = { navbar, children: "x", className: "bg-zinc-100", sidebar: "x", header: "x" } as unknown as StackedLayoutProps;
    await render(<StackedLayout {...guessed} />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toContain('[ouro-ui] StackedLayout: "bg-zinc-100" sets appearance, and className is for layout only. Fix: remove "bg-zinc-100"; StackedLayout sets its own look.');
    expect(messages).toContain(
      "[ouro-ui] StackedLayout: sidebar is not a prop; Navbar opens its own drawer on a phone. Fix: <StackedLayout navbar={<Navbar … />}>, or <SidebarLayout sidebar={<Sidebar … />}> for a sidebar.",
    );
    expect(messages).toContain("[ouro-ui] StackedLayout: header is not a prop. Fix: <StackedLayout navbar={<Navbar … />}>.");
  });

  it("warns when there is no navbar", async () => {
    const bare = { children: "x" } as unknown as StackedLayoutProps;
    await render(<StackedLayout {...bare} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] StackedLayout: navbar is required. Fix: <StackedLayout navbar={<Navbar label="Main" items={[…]} />}>.');
  });
});
