import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout, type StackedLayoutProps } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, expectNoMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
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
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get bars() {
      return host.querySelector<HTMLElement>('[data-ouro-part="bars"]')!;
    },
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
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

const navbar = <Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />;
const tall = <div style={{ height: 2000 }}>Page content</div>;
const toolbar = <Toolbar label="Week" items={[{ label: "Previous week" }, { label: "Next week" }]} />;

/** Scrolls the page and handles the scroll event now, so a state change lands before the next line. */
function scrollNow(y: number) {
  scrollTo(0, y);
  expect(scrollY).toBe(y);
  flushSync(() => dispatchEvent(new Event("scroll")));
}

const closed = (bars: HTMLElement) => bars.hasAttribute("data-closed");

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
    await pressTab();
    const skip = page.getByRole("link", { name: "Skip to recipes" });
    await expect.element(skip).toHaveFocus();
    expect(skip.element().getBoundingClientRect().width).toBeGreaterThan(44);
    expect(skip.element().getAttribute("href")).toBe(`#${main.id}`);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement).toBe(main);
    history.replaceState(null, "", location.pathname + location.search);
  });

  it("renders the page in a div with as, inside a page that has its own main landmark", async () => {
    await render(
      <StackedLayout as="div" navbar={navbar}>
        Page content
      </StackedLayout>,
    );
    expect(document.querySelector("main")).toBeNull();
    const target = document.getElementById(page.getByRole("link", { name: "Skip to content" }).element().getAttribute("href")!.slice(1))!;
    expect(target.tagName).toBe("DIV");
    expect(target.textContent).toBe("Page content");
    expect(target.tabIndex).toBe(-1);
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

  it("keeps the toolbar right under the navbar, full width with the navbar's padding, and in view with it", async () => {
    const { root, bars, main } = await render(
      <StackedLayout navbar={navbar} toolbar={toolbar}>
        {tall}
      </StackedLayout>,
    );
    expect(warn).not.toHaveBeenCalled();
    expect(bars.getAttribute("data-ouro-stacked-layout-navbar")).toBe("");
    expect(bars.getAttribute("data-behavior")).toBe("sticky");
    expect(bars.hasAttribute("data-open")).toBe(false);
    const bar = root.querySelector<HTMLElement>('[data-ouro="navbar"]')!;
    const tools = bars.querySelector<HTMLElement>("[data-ouro-stacked-layout-toolbar]")!;
    expect(bars.contains(bar)).toBe(true);
    expect(tools.previousElementSibling).toBe(bar);
    expect(tools.contains(page.getByRole("toolbar", { name: "Week" }).element())).toBe(true);
    expect(page.getByRole("region", { name: "Page tools" }).element()).toBe(tools);
    expect(tools.getAttribute("data-ouro-stacked-layout-toolbar")).toBe("");
    const style = getComputedStyle(tools);
    expect(style.paddingInlineStart).toBe(getComputedStyle(bar).paddingInlineStart);
    expect(style.paddingInlineEnd).toBe(getComputedStyle(bar).paddingInlineEnd);
    expect(style.borderBottomWidth).toBe("1px");
    expect(style.backgroundColor).toBe(getComputedStyle(bar).backgroundColor);
    expect(Math.round(tools.getBoundingClientRect().width)).toBe(innerWidth);
    expect(tools.getBoundingClientRect().top).toBe(bar.getBoundingClientRect().bottom);
    expect(main.getBoundingClientRect().top).toBeGreaterThanOrEqual(tools.getBoundingClientRect().bottom);
    scrollTo(0, 800);
    await expect.poll(() => scrollY).toBe(800);
    expect(bar.getBoundingClientRect().top).toBe(0);
    expect(tools.getBoundingClientRect().top).toBe(bar.getBoundingClientRect().bottom);
  });

  it("lets the navbar and toolbar scroll away with the page with navbarBehavior static", async () => {
    const { root, bars } = await render(
      <StackedLayout navbar={navbar} toolbar={toolbar} navbarBehavior="static">
        {tall}
      </StackedLayout>,
    );
    expect(bars.getAttribute("data-behavior")).toBe("static");
    expect(getComputedStyle(bars).position).toBe("static");
    scrollTo(0, 800);
    await expect.poll(() => scrollY).toBe(800);
    expect(root.querySelector('[data-ouro="navbar"]')!.getBoundingClientRect().top).toBe(-800);
    expect(bars.getBoundingClientRect().bottom).toBeLessThan(0);
    expect(bars.hasAttribute("data-open")).toBe(false);
    expect(closed(bars)).toBe(false);
  });

  it("names the toolbar's landmark with toolbarLabel", async () => {
    await render(
      <StackedLayout navbar={navbar} toolbar={toolbar} toolbarLabel="Week tools">
        Page content
      </StackedLayout>,
    );
    await expect.element(page.getByRole("region", { name: "Week tools" })).toBeVisible();
  });

  it("renders the toolbar in the server HTML, after the navbar", () => {
    const html = renderToString(
      <StackedLayout navbar={navbar} toolbar={toolbar}>
        Page content
      </StackedLayout>,
    );
    expect(html.indexOf("data-ouro-stacked-layout-toolbar")).toBeGreaterThan(html.indexOf('data-ouro="navbar"'));
    expect(html).toContain('role="toolbar"');
  });

  it("warns about a navbarBehavior it does not know, and the props agents guess for it", async () => {
    const guessed = { navbar, children: tall, navbarBehavior: "fixed", hideOnScroll: true, sticky: false } as unknown as StackedLayoutProps;
    const { bars } = await render(<StackedLayout {...guessed} />);
    expect(bars.getAttribute("data-behavior")).toBe("sticky");
    expect(getComputedStyle(bars).position).toBe("sticky");
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toContain('[ouro-ui] StackedLayout: navbarBehavior="fixed" is not a behavior. Fix: <StackedLayout navbarBehavior="sticky">.');
    expect(messages).toContain('[ouro-ui] StackedLayout: hideOnScroll is not a prop. Fix: <StackedLayout navbarBehavior="auto-hide">.');
    expect(messages).toContain('[ouro-ui] StackedLayout: sticky is not a prop; the navbar sticks by default. Fix: <StackedLayout navbarBehavior="static"> to let it scroll away.');
  });
});

describe("StackedLayout with navbarBehavior auto-hide", () => {
  const duration = () => parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-base"));
  const layout = (behavior: StackedLayoutProps["navbarBehavior"] = "auto-hide", tools: ReactNode = toolbar) => (
    <StackedLayout navbar={navbar} toolbar={tools} navbarBehavior={behavior} bleed>
      {tall}
    </StackedLayout>
  );

  it("slides the navbar and toolbar up out of view on a scroll down, and back on a scroll up", async () => {
    const { bars } = await render(layout());
    expect(warn).not.toHaveBeenCalled();
    expect(bars.getAttribute("data-behavior")).toBe("auto-hide");
    expect(bars.hasAttribute("data-open")).toBe(true);
    scrollNow(800);
    await expectMotion(bars, { stem: "stacked-layout", state: "data-closed", properties: { translate: duration() }, reduced: false });
    expect(bars.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
    expect(bars.hasAttribute("data-open")).toBe(false);
    scrollNow(700);
    await expectMotion(bars, { stem: "stacked-layout", state: "data-open", properties: { translate: duration() }, reduced: false });
    expect(bars.getBoundingClientRect().top).toBe(0);
    expect(closed(bars)).toBe(false);
  });

  it("shows and hides at once with reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const { bars } = await render(layout());
    scrollNow(800);
    await expectNoMotion(bars, { stem: "stacked-layout", state: "data-closed", reduced: true });
    expect(bars.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
    scrollNow(700);
    await expectNoMotion(bars, { stem: "stacked-layout", state: "data-open", reduced: true });
    expect(bars.getBoundingClientRect().top).toBe(0);
  });

  it("stays in view until the page has scrolled past it, and through a scroll event that moved nothing", async () => {
    const { bars } = await render(layout());
    scrollNow(bars.offsetHeight);
    expect(closed(bars)).toBe(false);
    scrollNow(bars.offsetHeight + 1);
    expect(closed(bars)).toBe(true);
    scrollNow(800);
    flushSync(() => dispatchEvent(new Event("scroll")));
    expect(closed(bars)).toBe(true);
    scrollNow(400);
    expect(closed(bars)).toBe(false);
    flushSync(() => dispatchEvent(new Event("scroll")));
    expect(closed(bars)).toBe(false);
  });

  it("comes back at the top of the page", async () => {
    const { bars } = await render(layout());
    scrollNow(800);
    expect(closed(bars)).toBe(true);
    scrollNow(0);
    expect(closed(bars)).toBe(false);
  });

  it("stays in view while keyboard focus is in it, and comes back when focus moves into it", async () => {
    const { bars } = await render(layout());
    await pressTab();
    await pressTab();
    await expect.element(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Recipes" })).toHaveFocus();
    scrollNow(800);
    expect(closed(bars)).toBe(false);
    await act(async () => (document.activeElement as HTMLElement).blur());
    scrollNow(900);
    expect(closed(bars)).toBe(true);
    await act(async () => bars.querySelector("a")!.focus());
    expect(closed(bars)).toBe(false);
  });

  it("stays in view while a menu opened from it is open", async () => {
    const { bars } = await render(
      layout(
        "auto-hide",
        <button type="button" aria-expanded="true" aria-haspopup="menu">
          View
        </button>,
      ),
    );
    scrollNow(800);
    expect(closed(bars)).toBe(false);
  });

  it("hides after a click in it, which leaves no keyboard focus", async () => {
    const { bars } = await render(layout());
    await userEvent.click(page.getByRole("button", { name: "Next week" }));
    scrollNow(800);
    expect(closed(bars)).toBe(true);
  });

  it("is translucent over the page, with the page blurred behind it", async () => {
    const { root, bars } = await render(layout());
    expect(getComputedStyle(bars).backdropFilter).toContain("blur(");
    const alpha = (color: string) => Number(/\/\s*([\d.]+)\)$|,\s*([\d.]+)\)$/.exec(color)?.slice(1).find(Boolean) ?? 1);
    expect(alpha(getComputedStyle(bars).backgroundColor)).toBeLessThan(1);
    expect(getComputedStyle(root.querySelector('[data-ouro="navbar"]')!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(bars.querySelector("[data-ouro-stacked-layout-toolbar]")!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("starts in view again after navbarBehavior leaves auto-hide and comes back", async () => {
    const view = await render(layout());
    scrollNow(800);
    expect(closed(view.bars)).toBe(true);
    await view.rerender(layout("sticky"));
    expect(closed(view.bars)).toBe(false);
    expect(view.bars.getBoundingClientRect().top).toBe(0);
    scrollNow(1000);
    await view.rerender(layout());
    expect(closed(view.bars)).toBe(false);
    expect(view.bars.hasAttribute("data-open")).toBe(true);
  });
});
