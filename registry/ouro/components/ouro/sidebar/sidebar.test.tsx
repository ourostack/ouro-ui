import { useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Sidebar, type SidebarProps } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

/** A router link that never leaves the test page. */
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

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.height = "600px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<OuroProvider linkComponent={StayLink}>{node}</OuroProvider>));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(<OuroProvider linkComponent={StayLink}>{next}</OuroProvider>)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="sidebar"]')!;
    },
    get nav() {
      return host.querySelector<HTMLElement>("nav");
    },
    get menuButton() {
      return host.querySelector<HTMLElement>("[data-ouro-sidebar-menu]")!;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await page.viewport(1024, 768);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await page.viewport(414, 896);
});

const Icon = () => (
  <svg data-testid="icon" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="6" />
  </svg>
);

const sections = [
  {
    items: [
      { label: "Home", href: "/", icon: <Icon /> },
      { label: "Recipes", href: "/recipes", icon: <Icon /> },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Cookbooks", href: "/cookbooks", icon: <Icon /> },
      { label: "Shopping list", href: "/shopping-list" },
    ],
  },
];

/** Waits until transitions (the sheet, the width) have finished. */
async function settled() {
  await expect.poll(() => document.getAnimations().length).toBe(0);
}

describe("Sidebar", () => {
  it("renders a named nav with its sections as lists of links", async () => {
    const { root, nav } = await render(<Sidebar label="Main" sections={sections} />);
    expect(root.getAttribute("data-ouro")).toBe("sidebar");
    expect(nav!.getAttribute("aria-label")).toBe("Main");
    expect(page.getByRole("link").elements().map((link) => link.textContent)).toEqual(["Home", "Recipes", "Cookbooks", "Shopping list"]);
    await expect.element(page.getByRole("link", { name: "Cookbooks" })).toHaveAttribute("href", "/cookbooks");
    await expect.element(page.getByRole("link", { name: "Cookbooks" })).toHaveAttribute("data-router");
    const library = page.getByRole("list", { name: "Library" });
    expect(library.getByRole("link").elements().length).toBe(2);
    expect(page.getByRole("list").elements().length).toBe(2);
  });

  it("hides the icons from screen readers", async () => {
    await render(<Sidebar label="Main" sections={sections} />);
    const icon = page.getByTestId("icon").first().element();
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("marks the current page from currentPath, and an item's own current wins", async () => {
    const { rerender } = await render(<Sidebar label="Main" sections={sections} currentPath="/cookbooks/7" />);
    await expect.element(page.getByRole("link", { name: "Cookbooks" })).toHaveAttribute("aria-current", "page");
    await expect.element(page.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    await rerender(<Sidebar label="Main" sections={[{ items: [sections[0]!.items[0]!, { label: "Recipes", href: "/recipes", current: true }] }]} currentPath="/" />);
    await expect.element(page.getByRole("link", { name: "Recipes" })).toHaveAttribute("aria-current", "page");
    await expect.element(page.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows the header above the links and the footer below them", async () => {
    await render(<Sidebar label="Main" sections={sections} header={<span data-testid="head">Spoonjoy</span>} footer={<span data-testid="foot">Ari</span>} />);
    const head = page.getByTestId("head").element().getBoundingClientRect();
    const foot = page.getByTestId("foot").element().getBoundingClientRect();
    const first = page.getByRole("link", { name: "Home" }).element().getBoundingClientRect();
    const last = page.getByRole("link", { name: "Shopping list" }).element().getBoundingClientRect();
    expect(head.bottom).toBeLessThanOrEqual(first.top);
    expect(foot.top).toBeGreaterThanOrEqual(last.bottom);
  });

  it("fills the height it is given and scrolls its links when they do not fit", async () => {
    const many = [{ items: Array.from({ length: 40 }, (_, index) => ({ label: `Recipe ${index + 1}`, href: `/recipes/${index + 1}` })) }];
    const { nav } = await render(<Sidebar label="Main" sections={many} footer={<span data-testid="foot">Ari</span>} />);
    expect(Math.round(nav!.getBoundingClientRect().height)).toBe(600);
    expect(page.getByTestId("foot").element().getBoundingClientRect().bottom).toBeLessThanOrEqual(600);
    const scroller = nav!.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  });

  it("collapses to a rail of icons with the toggle, keeping each link's name", async () => {
    const onCollapsedChange = vi.fn();
    const { root, nav } = await render(<Sidebar label="Main" sections={sections} onCollapsedChange={onCollapsedChange} />);
    const toggle = page.getByRole("button", { name: "Collapse sidebar" });
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
    const full = nav!.getBoundingClientRect().width;
    expect(full).toBe(256);
    await userEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    expect(root.hasAttribute("data-collapsed")).toBe(true);
    await expect.poll(() => nav!.getBoundingClientRect().width).toBe(61);
    // The labels are still each link's name, and the section's name, for a screen reader.
    await expect.element(page.getByRole("link", { name: "Recipes" })).toBeVisible();
    await expect.element(page.getByRole("list", { name: "Library" })).toBeInTheDocument();
    const link = page.getByRole("link", { name: "Recipes" }).element();
    expect(link.getAttribute("title")).toBe("Recipes");
    expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth);
    // A link without an icon shows its first letter.
    expect(page.getByRole("link", { name: "Shopping list" }).element().querySelector('[aria-hidden="true"]')!.textContent).toBe("S");
    await userEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    await expect.poll(() => nav!.getBoundingClientRect().width).toBe(full);
    expect(page.getByRole("link", { name: "Recipes" }).element().hasAttribute("title")).toBe(false);
  });

  it("starts collapsed with defaultCollapsed", async () => {
    const { root } = await render(<Sidebar label="Main" sections={sections} defaultCollapsed />);
    expect(root.hasAttribute("data-collapsed")).toBe(true);
    await expect.element(page.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows collapsed when it is controlled", async () => {
    function Controlled() {
      const [collapsed, setCollapsed] = useState(true);
      return (
        <>
          <Sidebar label="Main" sections={sections} collapsed={collapsed} onCollapsedChange={() => {}} />
          <button type="button" onClick={() => setCollapsed(false)}>
            Expand from outside
          </button>
        </>
      );
    }
    const { root } = await render(<Controlled />);
    await userEvent.click(page.getByRole("button", { name: "Collapse sidebar" }));
    expect(root.hasAttribute("data-collapsed")).toBe(true);
    await userEvent.click(page.getByRole("button", { name: "Expand from outside" }));
    expect(root.hasAttribute("data-collapsed")).toBe(false);
  });

  it("has no toggle with collapsible={false}", async () => {
    await render(<Sidebar label="Main" sections={sections} collapsible={false} />);
    expect(page.getByRole("button", { name: "Collapse sidebar" }).query()).toBeNull();
  });

  it("changes width without a transition under reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const { nav } = await render(<Sidebar label="Main" sections={sections} />);
    await userEvent.click(page.getByRole("button", { name: "Collapse sidebar" }));
    expect(nav!.getAnimations().filter((animation) => (animation as CSSTransition).transitionProperty === "width").length).toBe(0);
    expect(nav!.getBoundingClientRect().width).toBeLessThanOrEqual(64);
  });

  it("puts the nav and its links in the server HTML", () => {
    const html = renderToString(<Sidebar label="Main" sections={sections} currentPath="/recipes" />);
    expect(html).toContain('<nav aria-label="Main"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/recipes"|<a[^>]*href="\/recipes"[^>]*aria-current="page"/);
    expect(html).toContain("data-ouro-sidebar-menu");
  });

  it("hides the menu button from 640px up", async () => {
    const { menuButton } = await render(<Sidebar label="Main" sections={sections} />);
    expect(getComputedStyle(menuButton).display).toBe("none");
    expect(menuButton.hasAttribute("aria-haspopup")).toBe(false);
  });

  it("becomes a menu button that opens a drawer below 640px", async () => {
    await page.viewport(390, 844);
    const { menuButton, nav } = await render(
      <Sidebar
        label="Main"
        sections={sections}
        currentPath="/recipes"
        defaultCollapsed
        header={<span data-testid="head">Spoonjoy</span>}
        footer={<span data-testid="foot">Ari</span>}
      />,
    );
    expect(nav).toBeNull();
    expect(page.getByTestId("head").query()).toBeNull();
    expect(getComputedStyle(menuButton).display).not.toBe("none");
    expect(menuButton.getAttribute("aria-label")).toBe("Menu");
    expect(menuButton.getAttribute("aria-haspopup")).toBe("dialog");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(menuButton);
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect.element(sheet).toBeVisible();
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    await expect.poll(() => Math.round(sheet.element().getBoundingClientRect().left)).toBe(0);
    await expect.element(sheet.getByTestId("head")).toBeVisible();
    await expect.element(sheet.getByTestId("foot")).toBeVisible();
    const drawerNav = sheet.getByRole("navigation", { name: "Main" });
    await expect.element(drawerNav.getByRole("link", { name: "Recipes" })).toHaveAttribute("aria-current", "page");
    // The drawer is never the icon rail, and has no collapse toggle.
    await expect.element(drawerNav.getByText("Recipes")).toBeVisible();
    await expect.element(drawerNav.getByText("Library")).toBeVisible();
    expect(sheet.getByRole("button", { name: "Collapse sidebar" }).query()).toBeNull();
    await userEvent.click(drawerNav.getByRole("link", { name: "Cookbooks" }));
    await expect.poll(() => page.getByRole("dialog").elements().length).toBe(0);
  });

  it("shows the drawer's title when there is no header, and takes its strings as props", async () => {
    await page.viewport(390, 844);
    const { menuButton } = await render(<Sidebar label="Main" sections={sections} menuLabel="Menü" closeLabel="Schließen" />);
    await userEvent.click(menuButton);
    await expect.element(page.getByRole("heading", { name: "Menü" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Schließen" })).toBeInTheDocument();
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("dialog").elements().length).toBe(0);
    await expect.poll(() => document.activeElement).toBe(menuButton);
  });

  it("closes the drawer when the screen grows past 640px", async () => {
    await page.viewport(390, 844);
    const { menuButton } = await render(<Sidebar label="Main" sections={sections} />);
    await userEvent.click(menuButton);
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await page.viewport(1024, 768);
    await expect.poll(() => page.getByRole("dialog").elements().length).toBe(0);
    await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  it("names the collapse toggle from collapseLabel", async () => {
    await render(<Sidebar label="Main" sections={sections} collapseLabel="Seitenleiste einklappen" />);
    await expect.element(page.getByRole("button", { name: "Seitenleiste einklappen" })).toBeVisible();
  });

  it("passes className and ref to the root", async () => {
    let node: HTMLElement | null = null;
    const { root } = await render(
      <Sidebar
        label="Main"
        sections={sections}
        className="row-span-2"
        ref={(element) => {
          node = element;
        }}
      />,
    );
    expect(root.classList.contains("row-span-2")).toBe(true);
    expect(node).toBe(root);
  });

  it("warns about appearance classes and the props agents guess", async () => {
    const guessed = {
      label: "Main",
      sections,
      className: "bg-zinc-900",
      items: [],
      isCollapsed: true,
      pathname: "/",
      children: "x",
    } as unknown as SidebarProps;
    await render(<Sidebar {...guessed} />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toContain('[ouro-ui] Sidebar: "bg-zinc-900" sets appearance, and className is for layout only. Fix: remove "bg-zinc-900"; Sidebar sets its own look.');
    expect(messages).toContain('[ouro-ui] Sidebar: items is not a prop; links go in sections. Fix: <Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]} />.');
    expect(messages).toContain("[ouro-ui] Sidebar: isCollapsed is not a prop. Fix: <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}>.");
    expect(messages).toContain("[ouro-ui] Sidebar: pathname is not a prop. Fix: <Sidebar currentPath={pathname}>.");
    expect(messages).toContain('[ouro-ui] Sidebar: children are not rendered. Fix: <Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]} header={…} footer={…} />.');
  });

  it("warns when the label is missing, and when collapsed has no onCollapsedChange", async () => {
    const unnamed = { sections, collapsed: true } as unknown as SidebarProps;
    await render(<Sidebar {...unnamed} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Sidebar: label is required; it names the navigation for screen readers. Fix: <Sidebar label="Main">.');
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] Sidebar: collapsed without onCollapsedChange cannot be toggled. Fix: <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}> or defaultCollapsed.",
    );
  });
});
