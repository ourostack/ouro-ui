import { useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Sidebar, type SidebarProps } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { isTransparent } from "@/registry/ouro/lib/ouro/testing/color";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

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

describe("Sidebar current-page marks", () => {
  afterEach(() => document.documentElement.removeAttribute("dir"));

  function assertMark(direction: "ltr" | "rtl", scope: Pick<typeof page, "getByRole"> = page) {
    const current = scope.getByRole("link", { name: "Recipes", exact: true }).element();
    const other = scope.getByRole("link", { name: "Cookbooks", exact: true }).element();
    const marker = getComputedStyle(current, "::before");
    expect(marker.content).toBe('""');
    expect(parseFloat(marker.width)).toBe(2);
    expect(parseFloat(marker.height)).toBeGreaterThan(0);
    expect(marker.opacity).toBe("1");
    expect(marker.visibility).toBe("visible");
    expect(marker[direction === "rtl" ? "right" : "left"]).toBe("0px");
    expect(getComputedStyle(other, "::before").content).toBe("none");
    expect(isTransparent(getComputedStyle(current).backgroundColor)).toBe(true);
  }

  for (const direction of ["ltr", "rtl"] as const) {
    for (const collapsed of [false, true]) {
      it(`shows the ${direction} start-edge mark on its ${collapsed ? "rail" : "column"}`, async () => {
        document.documentElement.dir = direction;
        await render(<Sidebar label="Main" defaultCollapsed={collapsed} sections={[{ items: [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }] }]} currentPath="/recipes" />);
        assertMark(direction);
      });
    }
    it(`keeps the ${direction} mark in its phone drawer`, async () => {
      document.documentElement.dir = direction;
      await page.viewport(390, 844);
      await render(<Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }, { label: "Cookbooks", href: "/cookbooks" }] }]} currentPath="/recipes" />);
      await userEvent.click(page.getByRole("button", { name: "Menu", exact: true }));
      await expect.element(page.getByRole("dialog")).toBeVisible();
      assertMark(direction, page.getByRole("dialog"));
    });
  }
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
    expect(link.hasAttribute("title")).toBe(false);
    expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth);
    // A link without an icon shows its first letter.
    expect(page.getByRole("link", { name: "Shopping list" }).element().querySelector('[aria-hidden="true"]')!.textContent).toBe("S");
    await userEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    await expect.poll(() => nav!.getBoundingClientRect().width).toBe(full);
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

  it("changes width at once: layout does not animate", async () => {
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

describe("Sidebar items", () => {
  it("names each rail link with a tooltip on hover and keyboard focus", async () => {
    await render(<Sidebar label="Main" sections={sections} defaultCollapsed />);
    await userEvent.hover(page.getByRole("link", { name: "Cookbooks" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Cookbooks");
    await userEvent.unhover(page.getByRole("link", { name: "Cookbooks" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')).toBeNull();
    page.getByRole("link", { name: "Shopping list" }).element().focus();
    await pressTab({ shift: true });
    await pressTab();
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Shopping list");
  });

  it("shows a badge after the label, read as part of the link's name, and keeps it in the name on the rail", async () => {
    const { rerender } = await render(<Sidebar label="Main" sections={[{ items: [{ label: "Inbox", href: "/inbox", badge: 12 }] }]} />);
    const link = page.getByRole("link", { name: "Inbox 12" });
    await expect.element(link).toBeVisible();
    const badge = link.element().querySelector<HTMLElement>("[data-ouro-sidebar-badge]")!;
    expect(badge.textContent).toBe("12");
    expect(badge.getBoundingClientRect().left).toBeGreaterThan(link.element().querySelector("span:not([data-ouro-sidebar-badge])")!.getBoundingClientRect().left);
    await rerender(<Sidebar label="Main" sections={[{ items: [{ label: "Inbox", href: "/inbox", badge: 12 }] }]} collapsed onCollapsedChange={() => {}} />);
    await expect.element(page.getByRole("link", { name: "Inbox 12" })).toBeInTheDocument();
    expect(page.getByRole("link").element().querySelector<HTMLElement>("[data-ouro-sidebar-badge]")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("renders an item with onClick and no href as a button, in the column and in the drawer", async () => {
    const onClick = vi.fn();
    const withButton = [{ items: [{ label: "New chat", icon: <Icon />, onClick }, ...sections[0]!.items] }];
    await render(<Sidebar label="Main" sections={withButton} />);
    const button = page.getByRole("button", { name: "New chat" });
    expect(button.element().tagName).toBe("BUTTON");
    expect(button.element().getAttribute("type")).toBe("button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await page.viewport(390, 844);
    await expect.poll(() => getComputedStyle(document.querySelector("[data-ouro-sidebar-menu]")!).display).not.toBe("none");
    await userEvent.click(page.getByRole("button", { name: "Menu" }));
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect.element(sheet).toBeVisible();
    await userEvent.click(sheet.getByRole("button", { name: "New chat" }));
    expect(onClick).toHaveBeenCalledTimes(2);
    await expect.poll(() => page.getByRole("dialog").elements().length).toBe(0);
  });

  const nested = [
    {
      items: [
        { label: "Home", href: "/", icon: <Icon /> },
        {
          label: "Settings",
          icon: <Icon />,
          items: [
            { label: "Profile", href: "/settings/profile" },
            { label: "Billing", href: "/settings/billing", badge: "New" },
          ],
        },
      ],
    },
  ];

  it("nests one level of items under a disclosure button", async () => {
    await render(<Sidebar label="Main" sections={nested} />);
    const toggle = page.getByRole("button", { name: "Settings" });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    expect(page.getByRole("link", { name: "Profile" }).query()).toBeNull();
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
    const group = document.getElementById(toggle.element().getAttribute("aria-controls")!)!;
    expect(group.tagName).toBe("UL");
    await expect.element(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Billing New" })).toBeVisible();
    // The children sit indented under their parent.
    expect(page.getByRole("link", { name: "Profile" }).element().getBoundingClientRect().left).toBeGreaterThan(toggle.element().getBoundingClientRect().left);
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the group that holds the current page, and marks it", async () => {
    await render(<Sidebar label="Main" sections={nested} currentPath="/settings/billing" />);
    await expect.element(page.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
    await expect.element(page.getByRole("link", { name: "Billing New" })).toHaveAttribute("aria-current", "page");
    expect(renderToString(<Sidebar label="Main" sections={nested} currentPath="/settings/billing" />)).toMatch(/aria-current="page"[^>]*>/);
  });

  it("marks a closed group that holds the current page", async () => {
    await render(<Sidebar label="Main" sections={nested} currentPath="/settings/profile" />);
    const toggle = page.getByRole("button", { name: "Settings" });
    expect(toggle.element().hasAttribute("data-current")).toBe(false);
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.element().hasAttribute("data-current")).toBe(true);
  });

  it("keeps a button item on the rail, named by its tooltip", async () => {
    const onClick = vi.fn();
    await render(<Sidebar label="Main" sections={[{ items: [{ label: "New chat", icon: <Icon />, onClick }] }]} defaultCollapsed />);
    const button = page.getByRole("button", { name: "New chat" });
    await userEvent.hover(button);
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("New chat");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a group's links in a menu from a rail that cannot expand, and keeps focus with the group's button", async () => {
    const onCollapsedChange = vi.fn();
    const onClick = vi.fn();
    const withButton = [
      {
        items: [
          {
            label: "Settings",
            icon: <Icon />,
            items: [
              { label: "Profile", href: "/settings/profile" },
              { label: "Billing", href: "/settings/billing", badge: "New" },
              { label: "Sign out", onClick },
            ],
          },
        ],
      },
    ];
    await render(<Sidebar label="Main" sections={withButton} collapsed onCollapsedChange={onCollapsedChange} currentPath="/settings/billing" />);
    const toggle = page.getByRole("button", { name: "Settings" }).element() as HTMLElement;
    // It holds the current page, which shows on the button.
    expect(toggle.hasAttribute("data-current")).toBe(true);
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");
    expect(toggle.hasAttribute("aria-controls")).toBe(false);
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();
    await expect.element(menu.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/settings/profile");
    // The current page is marked in the menu, as it is in the expanded sidebar.
    await expect.element(menu.getByRole("menuitem", { name: "Billing New" })).toHaveAttribute("aria-current", "page");
    expect(menu.getByRole("menuitem", { name: "Profile" }).element().hasAttribute("aria-current")).toBe(false);
    expect(menu.getByRole("menuitem", { name: "Sign out" }).element().hasAttribute("aria-current")).toBe(false);
    // The sidebar did not expand, and the same button is still there, now open.
    expect(onCollapsedChange).not.toHaveBeenCalled();
    expect(toggle.isConnected).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The menu sits beside the group's button.
    await expect.poll(() => document.getAnimations().length).toBe(0);
    const box = menu.element().getBoundingClientRect();
    const anchor = toggle.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(anchor.right - 1);
    expect(Math.abs(box.top - anchor.top)).toBeLessThan(24);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").elements().length).toBe(0);
    await expect.poll(() => document.activeElement).toBe(toggle);
    // A button in the group runs from the menu.
    await userEvent.keyboard("{Enter}");
    await userEvent.click(page.getByRole("menu").getByRole("menuitem", { name: "Sign out" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expect.poll(() => page.getByRole("menu").elements().length).toBe(0);
    await expect.poll(() => document.activeElement).toBe(toggle);
  });

  it("leaves expanding to the collapse control: a group chosen on the rail opens its menu and the rail stays", async () => {
    const onCollapsedChange = vi.fn();
    const { root } = await render(<Sidebar label="Main" sections={nested} defaultCollapsed onCollapsedChange={onCollapsedChange} />);
    await userEvent.click(page.getByRole("button", { name: "Settings" }));
    await expect.element(page.getByRole("menu").getByRole("menuitem", { name: "Profile" })).toBeVisible();
    expect(onCollapsedChange).not.toHaveBeenCalled();
    expect(root.hasAttribute("data-collapsed")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").elements().length).toBe(0);
    await userEvent.click(page.getByRole("button", { name: "Collapse sidebar" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    const toggle = page.getByRole("button", { name: "Settings" });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.element().hasAttribute("aria-haspopup")).toBe(false);
    await userEvent.click(toggle);
    await expect.element(page.getByRole("link", { name: "Profile" })).toBeVisible();
  });

  it("says when a group sits in a rail that cannot expand", async () => {
    await render(<Sidebar label="Main" sections={nested} collapsed collapsible={false} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Sidebar: collapsed without onCollapsedChange cannot expand, so "Settings" shows its links only in a menu. Fix: <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}> or defaultCollapsed.',
    );
  });

  it("opens the rail's tooltip toward the page in a right-to-left layout", async () => {
    document.documentElement.dir = "rtl";
    try {
      const { nav } = await render(<Sidebar label="Main" sections={sections} defaultCollapsed />);
      // The rail stands at the right edge, so there is no room on its right.
      expect(nav!.getBoundingClientRect().right).toBeGreaterThan(document.documentElement.clientWidth - 16);
      await userEvent.hover(page.getByRole("link", { name: "Cookbooks" }));
      await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.getAttribute("data-side")).toBe("left");
      await expect.poll(() => document.getAnimations().length).toBe(0);
      const tip = document.querySelector('[data-ouro="tooltip"]')!.getBoundingClientRect();
      expect(tip.right).toBeLessThanOrEqual(page.getByRole("link", { name: "Cookbooks" }).element().getBoundingClientRect().left);
    } finally {
      document.documentElement.removeAttribute("dir");
    }
  });

  it("shows the nested items in the drawer", async () => {
    await page.viewport(390, 844);
    await render(<Sidebar label="Main" sections={nested} currentPath="/settings/profile" />);
    await userEvent.click(page.getByRole("button", { name: "Menu" }));
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect.element(sheet.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
    await expect.element(sheet.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });
});
