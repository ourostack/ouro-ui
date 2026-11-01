import { flushSync } from "react-dom";
import { type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { NavigationRail, type NavigationRailEntry, type NavigationRailProps } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { isTransparent } from "@/registry/ouro/lib/ouro/testing/color";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
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

/** Renders `node` in a host `height` px tall, as an app's full-height row would hold the rail. */
async function render(node: ReactNode, height = 600) {
  const host = document.createElement("div");
  host.style.height = `${height}px`;
  host.style.display = "flex";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  const wrap = (next: ReactNode) => <OuroProvider linkComponent={StayLink}>{next}</OuroProvider>;
  await act(async () => root.render(wrap(node)));
  return {
    host,
    root,
    rerender: (next: ReactNode) => act(async () => root.render(wrap(next))),
    get nav() {
      return host.querySelector<HTMLElement>('[data-ouro="navigation-rail"]')!;
    },
    /** Every item on the rail, shown or moved under More. */
    get items() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro-part="link"], [data-ouro-part="button"]')];
    },
    get shown() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro-part="link"], [data-ouro-part="button"], [data-ouro-part="more"]')].filter((item) => item.getClientRects().length > 0);
    },
    get more() {
      return host.querySelector<HTMLElement>('[data-ouro-part="more"]');
    },
    get separators() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro-navigation-rail-entry="separator"]')];
    },
  };
}

const icon = (path: string) => (
  <svg data-icon={path} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16v16H4z" />
  </svg>
);

const items: NavigationRailEntry[] = [
  { label: "Activity", href: "/activity", icon: icon("activity"), count: 5 },
  { label: "Chat", href: "/chat", icon: icon("chat"), currentIcon: icon("chat-filled"), paths: ["/people"] },
  { label: "Calendar", href: "/calendar", icon: icon("calendar") },
  { type: "separator" },
  { label: "Files", href: "/files", icon: icon("files") },
  { label: "Notes", href: "/notes", icon: icon("notes") },
];

const labelOf = (item: HTMLElement) => (item.dataset.ouroPart === "more" ? "More" : item.querySelector("[data-ouro-navigation-rail-label]")!.firstChild!.textContent);
const currentLabels = (list: HTMLElement[]) => list.filter((item) => item.getAttribute("aria-current") === "page").map(labelOf);
const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await page.viewport(1024, 768);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  document.documentElement.removeAttribute("dir");
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
});

describe("NavigationRail", () => {
  it("is a labelled navigation with a list of links, each named by its label, with the icons hidden", async () => {
    const { nav, items: links } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    expect(nav.tagName).toBe("NAV");
    await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    for (const name of ["Chat", "Calendar", "Files", "Notes"]) await expect.element(page.getByRole("link", { name, exact: true })).toBeVisible();
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/activity", "/chat", "/calendar", "/files", "/notes"]);
    for (const link of links) expect(link.querySelector("svg")!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(nav.querySelectorAll("ul > li")).toHaveLength(6);
  });

  it("puts the header above the items and the footer below them, at the foot of the height it fills", async () => {
    const { nav, items: links } = await render(
      <NavigationRail
        label="Main"
        items={items}
        header={<span data-test-harness="">Mark</span>}
        footer={
          <button type="button" data-test-harness="">
            Settings
          </button>
        }
      />,
    );
    const header = page.getByText("Mark").element().getBoundingClientRect();
    const footer = page.getByRole("button", { name: "Settings" }).element().getBoundingClientRect();
    expect(header.bottom).toBeLessThanOrEqual(links[0]!.getBoundingClientRect().top);
    expect(footer.top).toBeGreaterThanOrEqual(links.at(-1)!.getBoundingClientRect().bottom);
    expect(nav.getBoundingClientRect().height).toBe(600);
    expect(Math.round(nav.getBoundingClientRect().bottom - footer.bottom)).toBe(8);
  });

  it("fills its container's height and draws no surface of its own", async () => {
    const { nav } = await render(<NavigationRail label="Main" items={items} />, 480);
    expect(nav.getBoundingClientRect().height).toBe(480);
    expect(isTransparent(getComputedStyle(nav).backgroundColor)).toBe(true);
    expect(parseFloat(getComputedStyle(nav).borderInlineEndWidth)).toBe(0);
  });

  it.each([
    ["/activity", "Activity"],
    ["/chat/12", "Chat"],
    ["/people", "Chat"],
    ["/files/a/b", "Files"],
    ["/elsewhere", null],
    [undefined, null],
  ])("marks the item that owns %s", async (path, expected) => {
    const { items: links } = await render(<NavigationRail label="Main" items={items} currentPath={path} />);
    expect(currentLabels(links)).toEqual(expected ? [expected] : []);
    // shadcn/tailwind.css, which shadcn init imports, redefines data-selected: as [data-selected="true"].
    for (const link of links) expect(link.getAttribute("data-selected")).toBe(labelOf(link) === expected ? "true" : null);
  });

  it("lets an item's current flag win over the path", async () => {
    const flagged = items.map((entry) => (entry.type !== "separator" && entry.label === "Notes" ? { ...entry, current: true } : entry));
    const { items: links } = await render(<NavigationRail label="Main" items={flagged} currentPath="/chat" />);
    expect(currentLabels(links)).toEqual(["Notes"]);
  });

  it("draws the current item's currentIcon, and its icon when it has none", async () => {
    const { items: links, rerender } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    expect(links.map((link) => link.querySelector("svg")!.dataset.icon)).toEqual(["activity", "chat-filled", "calendar", "files", "notes"]);
    await rerender(<NavigationRail label="Main" items={items} currentPath="/calendar" />);
    expect(links.map((link) => link.querySelector("svg")!.dataset.icon)).toEqual(["activity", "chat", "calendar", "files", "notes"]);
  });

  it("shows the current item's bar on the rail's start edge, its label in the foreground colour and its icon in the primary colour", async () => {
    const probe = document.createElement("span");
    probe.style.color = "var(--foreground)";
    probe.style.backgroundColor = "var(--primary)";
    document.body.append(probe);
    mounted.push(probe);
    for (const dir of ["ltr", "rtl"] as const) {
      document.documentElement.dir = dir;
      const { nav, items: links } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
      const bar = links[1]!.querySelector<HTMLElement>('[data-ouro-part="indicator"]')!;
      await expect.poll(() => getComputedStyle(bar).opacity).toBe("1");
      const edge = nav.getBoundingClientRect();
      const box = bar.getBoundingClientRect();
      if (dir === "ltr") expect(box.left).toBe(edge.left);
      else expect(box.right).toBe(edge.right);
      expect(box.width).toBe(3);
      expect(getComputedStyle(bar).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
      expect(getComputedStyle(links[1]!).color).toBe(getComputedStyle(probe).color);
      expect(getComputedStyle(links[1]!.querySelector("[aria-hidden] > svg")!.parentElement!).color).toBe(getComputedStyle(probe).backgroundColor);
      // The other items' bars are hidden.
      expect(getComputedStyle(links[0]!.querySelector('[data-ouro-part="indicator"]')!).opacity).toBe("0");
      await act(async () => roots.pop()!.unmount());
    }
  });

  it("renders an item with onClick and no href as a button, current by its flag, and calls onClick", async () => {
    const onClick = vi.fn();
    const views: NavigationRailEntry[] = [
      { label: "Chat", icon: icon("chat"), onClick, current: true },
      { label: "Calendar", icon: icon("calendar"), onClick },
    ];
    const { items: buttons } = await render(<NavigationRail label="Main" items={views} currentPath="/calendar" />);
    expect(buttons.map((button) => button.tagName)).toEqual(["BUTTON", "BUTTON"]);
    expect(buttons.map((button) => button.getAttribute("type"))).toEqual(["button", "button"]);
    expect(currentLabels(buttons)).toEqual(["Chat"]);
    await userEvent.click(page.getByRole("button", { name: "Calendar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls a link's onClick when it is followed, and goes through the provider's link component", async () => {
    const onClick = vi.fn();
    const { items: links } = await render(<NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: icon("chat"), onClick }]} />);
    expect(links[0]!.hasAttribute("data-router")).toBe(true);
    await userEvent.click(page.getByRole("link", { name: "Chat" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards a ref to the nav and takes layout classes", async () => {
    let element: HTMLElement | null = null;
    const { nav } = await render(<NavigationRail label="Main" items={items} className="w-20" ref={(node) => void (element = node)} />);
    expect(element).toBe(nav);
    expect(nav.getBoundingClientRect().width).toBe(80);
  });

  it("is 68px wide with labels and 56px with hideLabels, with items at least 44px tall", async () => {
    const rail = await render(<NavigationRail label="Main" items={items} />);
    expect(rail.nav.getBoundingClientRect().width).toBe(68);
    for (const link of rail.items) expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    await rail.rerender(<NavigationRail label="Main" items={items} hideLabels />);
    expect(rail.nav.getBoundingClientRect().width).toBe(56);
    for (const link of rail.items) expect(link.getBoundingClientRect().height).toBe(44);
  });

  it("keeps each item's edge under forced colours, and the current item's bar in the highlight colour", async () => {
    const { items: links } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    expect(parseFloat(getComputedStyle(links[0]!).borderTopWidth)).toBe(0);
    await commands.emulateMedia({ forcedColors: "active" });
    await expect.poll(() => parseFloat(getComputedStyle(links[0]!).borderTopWidth)).toBeGreaterThan(0);
    expect(getComputedStyle(links[0]!).borderTopStyle).toBe("solid");
    const bar = links[1]!.querySelector<HTMLElement>('[data-ouro-part="indicator"]')!;
    const highlight = document.createElement("span");
    highlight.style.backgroundColor = "Highlight";
    document.body.append(highlight);
    mounted.push(highlight);
    expect(getComputedStyle(bar).backgroundColor).toBe(getComputedStyle(highlight).backgroundColor);
    expect(getComputedStyle(bar).opacity).toBe("1");
  });
});

describe("NavigationRail separators", () => {
  it("draws a rule between groups that screen readers skip", async () => {
    const { separators, items: links } = await render(<NavigationRail label="Main" items={items} />);
    expect(separators).toHaveLength(1);
    expect(separators[0]!.getAttribute("aria-hidden")).toBe("true");
    const rule = separators[0]!.getBoundingClientRect();
    expect(rule.top).toBeGreaterThanOrEqual(links[2]!.getBoundingClientRect().bottom);
    expect(rule.bottom).toBeLessThanOrEqual(links[3]!.getBoundingClientRect().top);
    expect(separators[0]!.firstElementChild!.getBoundingClientRect().height).toBe(1);
  });

  it("hides a separator with no item before it or after it, and all but the first of a run", async () => {
    const entries: NavigationRailEntry[] = [
      { type: "separator" },
      { label: "Chat", href: "/chat", icon: icon("chat") },
      { type: "separator" },
      { type: "separator" },
      { label: "Files", href: "/files", icon: icon("files") },
      { type: "separator" },
    ];
    const { separators, items: links } = await render(<NavigationRail label="Main" items={entries} />);
    expect(separators.map((separator) => separator.getClientRects().length > 0)).toEqual([false, true, false, false]);
    // With no current item, the tab stop is the first item, not the separator before it.
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1]);
  });
});

describe("NavigationRail counts", () => {
  it("shows a count on the icon, capped at 99+, and speaks the whole number after the label", async () => {
    const counted: NavigationRailEntry[] = [
      { label: "Activity", href: "/activity", icon: icon("activity"), count: 5 },
      { label: "Chat", href: "/chat", icon: icon("chat"), count: 128 },
      { label: "Calendar", href: "/calendar", icon: icon("calendar"), count: 0 },
      { label: "Files", href: "/files", icon: icon("files"), count: 2.5 },
      { label: "Notes", href: "/notes", icon: icon("notes"), count: -3 },
      { label: "Tasks", href: "/tasks", icon: icon("tasks"), count: 99 },
    ];
    const { items: links } = await render(<NavigationRail label="Main" items={counted} />);
    expect(links.map((link) => link.querySelector("[data-ouro-navigation-rail-count]")?.textContent ?? null)).toEqual(["5", "99+", null, "2", null, "99"]);
    await expect.element(page.getByRole("link", { name: "Activity, 5 new" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Chat, 128 new" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
    const badge = links[0]!.querySelector<HTMLElement>("[data-ouro-navigation-rail-count]")!;
    expect(badge.closest('[aria-hidden="true"]')).not.toBeNull();
    // On the icon's top end corner.
    const glyph = links[0]!.querySelector("svg")!.getBoundingClientRect();
    expect(badge.getBoundingClientRect().left).toBeGreaterThan(glyph.left + glyph.width / 2);
    expect(badge.getBoundingClientRect().top).toBeLessThan(glyph.top);
  });

  it("names an item with a count by its words, the label first and the count after, so the name starts with what it shows", async () => {
    for (const hideLabels of [false, true]) {
      const { items: links, more } = await render(<NavigationRail label="Main" items={many} hideLabels={hideLabels} />, 16 + 4 * 56 + 3 * 4);
      // No aria-label to differ from the words it shows: the label, then the spoken count, are its content.
      expect([...links, more!].filter((item) => item.hasAttribute("aria-label"))).toEqual([]);
      await expect.element(page.getByRole("link", { name: "Activity, 3 new", exact: true })).toBeInTheDocument();
      await expect.element(page.getByRole("link", { name: "Chat", exact: true })).toBeInTheDocument();
      await expect.element(page.getByRole("button", { name: "More, 5 new", exact: true })).toBeInTheDocument();
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    }
  });

  it("speaks the count with countLabel", async () => {
    await render(<NavigationRail label="Main" items={items} countLabel="{count} unread" />);
    await expect.element(page.getByRole("link", { name: "Activity, 5 unread" })).toBeVisible();
  });
});

describe("NavigationRail keyboard", () => {
  it("is one tab stop, on the current item, and Up, Down, Home and End move along it, wrapping", async () => {
    const { host } = await render(
      <>
        <button type="button" data-test-harness="">
          Before
        </button>
        <NavigationRail label="Main" items={items} currentPath="/calendar" />
        <button type="button" data-test-harness="">
          After
        </button>
      </>,
    );
    const at = () => (document.activeElement as HTMLElement).querySelector("[data-ouro-navigation-rail-label]")?.firstChild!.textContent ?? document.activeElement!.textContent;
    host.querySelector<HTMLButtonElement>("button")!.focus();
    await pressTab();
    expect(at()).toBe("Calendar");
    // The arrows move focus, and the page does not scroll with them.
    const arrow = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    expect(at()).toBe("Chat");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    expect(at()).toBe("Files");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(at()).toBe("Chat");
    await userEvent.keyboard("{End}");
    expect(at()).toBe("Notes");
    await userEvent.keyboard("{ArrowDown}");
    expect(at()).toBe("Activity");
    await userEvent.keyboard("{ArrowUp}");
    expect(at()).toBe("Notes");
    await userEvent.keyboard("{Home}");
    expect(at()).toBe("Activity");
    await pressTab();
    expect(document.activeElement!.textContent).toBe("After");
    // Back in, the stop is the item focused last.
    await pressTab({ shift: true });
    expect(at()).toBe("Activity");
    expect(host.querySelectorAll('[data-ouro-navigation-rail-stop][tabindex="0"]')).toHaveLength(1);
  });

  it("puts the tab stop on the first item when none is current", async () => {
    const { items: links } = await render(<NavigationRail label="Main" items={items} />);
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("moves the tab stop to the current item when the item focused last goes", async () => {
    const { items: links, rerender } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    links[4]!.focus();
    await rerender(<NavigationRail label="Main" items={items.slice(0, 5)} currentPath="/chat" />);
    expect(links.slice(0, 4).map((link) => link.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)("leaves the arrows to the page with %s held", async (modifier) => {
    const { items: links } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    links[1]!.focus();
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true, [modifier]: true });
    links[1]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(links[1]);
  });

  it("leaves other keys, and keys from outside its items, alone", async () => {
    const { items: links, nav } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    links[1]!.focus();
    const letter = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    links[1]!.dispatchEvent(letter);
    expect(letter.defaultPrevented).toBe(false);
    const stray = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    nav.querySelector("li")!.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(links[1]);
  });
});

/** Seven one-line items, 56px each with 4px between them. */
const many: NavigationRailEntry[] = [
  { label: "Activity", href: "/activity", icon: icon("activity"), count: 3 },
  { label: "Chat", href: "/chat", icon: icon("chat") },
  { label: "Calendar", href: "/calendar", icon: icon("calendar") },
  { type: "separator" },
  { label: "Files", href: "/files", icon: icon("files"), count: 4 },
  { label: "Notes", href: "/notes", icon: icon("notes") },
  { type: "separator" },
  { label: "Tasks", onClick: () => {}, icon: icon("tasks"), count: 1 },
  { type: "separator" },
  { label: "Help", href: "/help", icon: icon("help") },
];

describe("NavigationRail overflow", () => {
  it("moves the items that do not fit into More, from the last, and lists them in its menu with their counts", async () => {
    const onClick = vi.fn();
    const entries = many.map((entry) => (entry.type !== "separator" && entry.label === "Tasks" ? { ...entry, onClick } : entry));
    // 16px of padding, then room for four 56px rows and three 4px gaps.
    const { shown, more } = await render(<NavigationRail label="Main" items={entries} />, 16 + 4 * 56 + 3 * 4);
    expect(shown.map(labelOf)).toEqual(["Activity", "Chat", "Calendar", "More"]);
    // One tab stop, on the first item while none is current.
    expect(shown.map((item) => item.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(more!.getBoundingClientRect().bottom).toBeLessThanOrEqual(more!.closest("ul")!.getBoundingClientRect().bottom);
    // The menu's count is the sum of the moved items'.
    expect(more!.querySelector("[data-ouro-navigation-rail-count]")!.textContent).toBe("5");
    await userEvent.click(page.getByRole("button", { name: "More, 5 new" }));
    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();
    const entriesShown = [...menu.element().querySelectorAll('[role="menuitem"], [role="separator"]')].map((node) => (node.getAttribute("role") === "separator" ? "—" : node.textContent));
    expect(entriesShown).toEqual(["Files4, 4 new", "Notes", "—", "Tasks1, 1 new", "—", "Help"]);
    await expect.element(menu.getByRole("menuitem", { name: /^Files\b.*4 new$/ })).toHaveAttribute("href", "/files");
    await userEvent.click(menu.getByRole("menuitem", { name: /^Tasks\b/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the current item on the rail when it would move", async () => {
    // Room for three rows, the separator before Help, More and the gaps between them.
    const { shown, separators } = await render(<NavigationRail label="Main" items={many} currentPath="/help" />, 16 + 4 * 56 + 9 + 4 * 4);
    expect(shown.map(labelOf)).toEqual(["Activity", "Chat", "Help", "More"]);
    expect(currentLabels(shown)).toEqual(["Help"]);
    expect(separators.map((separator) => separator.getClientRects().length > 0)).toEqual([true, false, false]);
  });

  it("keeps only the current item and More when nothing else fits", async () => {
    const { shown, separators } = await render(<NavigationRail label="Main" items={many} currentPath="/notes" />, 16 + 2 * 56 + 4);
    expect(shown.map(labelOf)).toEqual(["Notes", "More"]);
    expect(separators.every((separator) => separator.getClientRects().length === 0)).toBe(true);
  });

  it("brings items back from More as the rail grows, and moves them again as it shrinks", async () => {
    const { host, nav } = await render(<NavigationRail label="Main" items={many} />, 200);
    const labels = () => [...nav.querySelectorAll<HTMLElement>("[data-ouro-navigation-rail-stop]")].filter((item) => item.getClientRects().length > 0).map(labelOf);
    expect(labels()).toEqual(["Activity", "Chat", "More"]);
    host.style.height = "1000px";
    await expect.poll(labels).toEqual(["Activity", "Chat", "Calendar", "Files", "Notes", "Tasks", "Help"]);
    expect(nav.querySelector('[data-ouro-part="more"]')).toBeNull();
    host.style.height = "260px";
    await expect.poll(labels).toEqual(["Activity", "Chat", "Calendar", "More"]);
  });

  it("moves along the rail with the arrows from More, and opens its menu with Enter", async () => {
    const { more, items: links } = await render(<NavigationRail label="Main" items={many} currentPath="/chat" />, 16 + 4 * 56 + 3 * 4);
    links[1]!.focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(more);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[0]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(more);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(links[2]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(more!.tabIndex).toBe(0);
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(more);
  });

  it("measures nothing while the app hides it, and fits its items once shown", async () => {
    const { host, nav } = await render(<NavigationRail label="Main" items={many} />, 200);
    const more = nav.querySelector('[data-ouro-part="more"]');
    const moved = () => [...nav.querySelectorAll("li.hidden")].map((entry) => entry.getAttribute("data-ouro-navigation-rail-entry"));
    const before = moved();
    nav.style.display = "none";
    host.style.height = "1000px";
    // The resize observer reports the hidden list a frame later; nothing moves while it is hidden.
    await act(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect(nav.querySelector('[data-ouro-part="more"]')).toBe(more);
    expect(moved()).toEqual(before);
    nav.style.display = "";
    await expect.poll(() => nav.querySelector('[data-ouro-part="more"]')).toBeNull();
  });

  it("fits items that fill the rail exactly, and moves the last one with More when a pixel is missing", async () => {
    const entries: NavigationRailEntry[] = [
      { label: "Activity", href: "/activity", icon: icon("activity") },
      { label: "Chat", href: "/chat", icon: icon("chat") },
      { type: "separator" },
      { label: "Files", href: "/files", icon: icon("files") },
    ];
    // Three 56px rows, the 9px separator and three 4px gaps, under 16px of padding.
    const exact = await render(<NavigationRail label="Main" items={entries} />, 16 + 3 * 56 + 9 + 3 * 4);
    expect(exact.shown.map(labelOf)).toEqual(["Activity", "Chat", "Files"]);
    expect(exact.separators[0]!.getClientRects().length).toBe(1);
    const short = await render(<NavigationRail label="Main" items={entries} />, 16 + 3 * 56 + 9 + 3 * 4 - 1);
    expect(short.shown.map(labelOf)).toEqual(["Activity", "Chat", "More"]);
    expect(short.separators[0]!.getClientRects().length).toBe(0);
  });

  it("counts More's own height in what fits", async () => {
    const four = ["Activity", "Chat", "Calendar", "Files"].map((label) => ({ label, href: `/${label.toLowerCase()}`, icon: icon(label) }));
    // Two rows and More, with 4px to spare: a third row needs 60px.
    const { shown } = await render(<NavigationRail label="Main" items={four} />, 16 + 3 * 56 + 3 * 4);
    expect(shown.map(labelOf)).toEqual(["Activity", "Chat", "More"]);
  });

  it("keeps the current item on the rail when even it does not fit", async () => {
    const four = ["Activity", "Chat", "Calendar"].map((label) => ({ label, href: `/${label.toLowerCase()}`, icon: icon(label) }));
    const { shown } = await render(<NavigationRail label="Main" items={four} currentPath="/activity" />, 16 + 30);
    expect(shown.map(labelOf)).toEqual(["Activity", "More"]);
  });

  it("puts the tab stop back on the current item when the item focused last moves under More, and on More while it is there", async () => {
    const { host, nav, items: links } = await render(<NavigationRail label="Main" items={many} currentPath="/chat" />, 1000);
    await act(async () => links[4]!.focus());
    expect(links[4]!.tabIndex).toBe(0);
    host.style.height = "260px";
    await expect.poll(() => links[4]!.getClientRects().length).toBe(0);
    expect(links[1]!.tabIndex).toBe(0);
    const more = nav.querySelector<HTMLElement>('[data-ouro-part="more"]')!;
    await act(async () => more.focus());
    expect(more.tabIndex).toBe(0);
    expect(links[1]!.tabIndex).toBe(-1);
    host.style.height = "1000px";
    await expect.poll(() => nav.querySelector('[data-ouro-part="more"]')).toBeNull();
    expect(links[1]!.tabIndex).toBe(0);
  });

  it("renders nothing to fit with no items", async () => {
    const { nav } = await render(<NavigationRail label="Main" items={[]} />);
    expect(nav.querySelectorAll("li")).toHaveLength(0);
  });
});

describe("NavigationRail labels", () => {
  it("wraps a long label to two lines between words, and gives a label that still does not fit an ellipsis and a tooltip", async () => {
    const long: NavigationRailEntry[] = [
      { label: "Bots and workflows", href: "/bots", icon: icon("bots") },
      { label: "Customer support escalations", href: "/support", icon: icon("support") },
      { label: "Chat", href: "/chat", icon: icon("chat") },
      { label: "Notes for the team and you", href: "/notes", icon: icon("notes") },
    ];
    const { items: links } = await render(<NavigationRail label="Main" items={long} />);
    const lines = (link: HTMLElement) => Math.round(link.querySelector<HTMLElement>("[data-ouro-navigation-rail-label]")!.getBoundingClientRect().height / 14);
    expect(links.map(lines)).toEqual([2, 2, 1, 2]);
    const text = links[0]!.querySelector<HTMLElement>("[data-ouro-navigation-rail-label]")!;
    expect(text.scrollHeight).toBeLessThanOrEqual(text.clientHeight);
    await userEvent.hover(page.getByRole("link", { name: "Customer support escalations" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Customer support escalations");
    // Short words, three lines' worth.
    await userEvent.hover(page.getByRole("link", { name: "Notes for the team and you" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Notes for the team and you");
    await userEvent.hover(page.getByRole("link", { name: "Bots and workflows" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')).toBeNull();
  });

  it("gives a label cut by its height alone a tooltip, with every line as narrow as the rail", async () => {
    // Fonts differ in whether line-clamp's ellipsis overflows the width too, so the width reads as fitting here.
    const width = vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return this.clientWidth;
    });
    await render(<NavigationRail label="Main" items={[{ label: "Notes for the team and you", href: "/notes", icon: icon("notes") }]} />);
    await userEvent.hover(page.getByRole("link", { name: "Notes for the team and you" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Notes for the team and you");
    width.mockRestore();
  });

  it("gives a word too wide for the rail a tooltip", async () => {
    await render(
      <div lang="zxx" style={{ display: "flex" }}>
        <NavigationRail label="Main" items={[{ label: "Supercalifragilistic", href: "/word", icon: icon("word") }]} />
      </div>,
    );
    await userEvent.hover(page.getByRole("link", { name: "Supercalifragilistic" }));
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Supercalifragilistic");
  });

  it("with hideLabels, keeps each label as the item's name and shows it in a tooltip toward the page", async () => {
    for (const dir of ["ltr", "rtl"] as const) {
      document.documentElement.dir = dir;
      const { items: links } = await render(<NavigationRail label="Main" items={many} hideLabels />, 16 + 3 * 44 + 2 * 4);
      expect(links[0]!.querySelector<HTMLElement>("[data-ouro-navigation-rail-label]")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
      await userEvent.hover(page.getByRole("link", { name: "Chat" }));
      await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Chat");
      expect(document.querySelector('[data-ouro="tooltip"]')!.getAttribute("data-side")).toBe(dir === "ltr" ? "right" : "left");
      await userEvent.hover(page.getByRole("button", { name: "More, 5 new" }));
      await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("More");
      await userEvent.unhover(page.getByRole("button", { name: "More, 5 new" }));
      await act(async () => roots.pop()!.unmount());
    }
  });
});

describe("NavigationRail motion", () => {
  it("grows the new current link's bar and eases its colour, and with reduced motion only fades and eases", async () => {
    const { root, items: links } = await render(<NavigationRail label="Main" items={items} currentPath="/chat" />);
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const next = reduced ? "/files" : "/calendar";
      const link = links[reduced ? 3 : 2]!;
      const bar = link.querySelector<HTMLElement>('[data-ouro-part="indicator"]')!;
      // The browser starts a transition only from a style it has already computed.
      void getComputedStyle(link).color;
      void getComputedStyle(bar).scale;
      flushSync(() =>
        root.render(
          <OuroProvider linkComponent={StayLink}>
            <NavigationRail label="Main" items={items} currentPath={next} />
          </OuroProvider>,
        ),
      );
      await Promise.all([
        expectMotion(link, { stem: "navigation-rail", state: "data-selected", properties: { color: token("--ouro-duration-fast") }, reduced }),
        expectMotion(bar, {
          stem: "navigation-rail",
          state: "data-selected",
          properties: reduced ? { opacity: token("--ouro-duration-fast") } : { opacity: token("--ouro-duration-base"), scale: token("--ouro-duration-base") },
          reduced,
        }),
      ]);
    }
  });

  it("eases a button item's colour and grows its bar when it becomes current, and with reduced motion only fades and eases", async () => {
    const views = (current: string): NavigationRailEntry[] => ["Chat", "Calendar", "Files"].map((label) => ({ label, icon: icon(label), onClick: () => {}, current: label === current }));
    const { root, items: buttons } = await render(<NavigationRail label="Main" items={views("Chat")} />);
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const button = buttons[reduced ? 2 : 1]!;
      const bar = button.querySelector<HTMLElement>('[data-ouro-part="indicator"]')!;
      void getComputedStyle(button).color;
      void getComputedStyle(bar).scale;
      flushSync(() =>
        root.render(
          <OuroProvider linkComponent={StayLink}>
            <NavigationRail label="Main" items={views(reduced ? "Files" : "Calendar")} />
          </OuroProvider>,
        ),
      );
      await Promise.all([
        expectMotion(button, { stem: "navigation-rail", state: "data-selected", properties: { color: token("--ouro-duration-fast") }, reduced }),
        expectMotion(bar, {
          stem: "navigation-rail",
          state: "data-selected",
          properties: reduced ? { opacity: token("--ouro-duration-fast") } : { opacity: token("--ouro-duration-base"), scale: token("--ouro-duration-base") },
          reduced,
        }),
      ]);
    }
  });
});

describe("NavigationRail development messages", () => {
  const example = '<NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <ChatIcon /> }]} />';
  const chat = { label: "Chat", href: "/chat", icon: icon("chat") };
  it.each([
    ["label", { label: "" }, "label is required; it names the navigation for screen readers", '<NavigationRail label="Main">'],
    ["links", { links: items }, "links is not a prop", example],
    ["pathname", { pathname: "/" }, "pathname is not a prop", "<NavigationRail currentPath={pathname}>"],
    ["value", { value: "chat" }, "value is not a prop; the current item follows the page's path", "<NavigationRail currentPath={pathname}>, or current: true on the item"],
    ["selectedId", { selectedId: "chat" }, "selectedId is not a prop", '{ label: "Chat", onClick: () => setView("chat"), current: view === "chat" }'],
    ["onSelect", { onSelect: () => {} }, "onSelect is not a prop; each item has its own onClick", '{ label: "Chat", onClick: () => setView("chat") }'],
    ["collapsed", { collapsed: true }, "collapsed is not a prop", "<NavigationRail hideLabels>"],
    ["children", { children: "Chat" }, "children are not rendered", example],
    ["countLabel", { countLabel: "new" }, 'countLabel "new" has no {count}, so screen readers never hear the number', 'countLabel="{count} new"'],
    ["badge", { items: [{ ...chat, badge: 3 }] }, 'badge is not an item prop ("Chat")', '{ label: "Chat", count: 3 }'],
    ["activeIcon", { items: [{ ...chat, activeIcon: icon("x") }] }, 'activeIcon and selectedIcon are not item props ("Chat")', '{ label: "Chat", icon: <ChatIcon />, currentIcon: <ChatFilledIcon /> }'],
    ["selectedIcon", { items: [{ type: "separator" }, { ...chat, selectedIcon: icon("x") }] }, 'activeIcon and selectedIcon are not item props ("Chat")', '{ label: "Chat", icon: <ChatIcon />, currentIcon: <ChatFilledIcon /> }'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { label: "Main", items, ...extra } as unknown as NavigationRailProps;
    const { nav } = await render(<NavigationRail {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] NavigationRail: ${problem}. Fix: ${fix}.`);
    expect(warn).toHaveBeenCalledTimes(1);
    for (const attribute of ["links", "pathname", "value", "selectedid", "collapsed", "badge"]) expect(nav.querySelector(`[${attribute}]`) ?? (nav.hasAttribute(attribute) ? nav : null)).toBeNull();
    expect(nav.textContent).not.toContain("ChatChat");
  });

  it.each([
    ["bg-red-500", 'remove "bg-red-500"; NavigationRail sets its own look from the theme'],
    ["max-sm:hidden", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<NavigationRail label="Main" items={items} className={className} />);
    if (fix) {
      expect(warn).toHaveBeenCalledWith(`[ouro-ui] NavigationRail: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("renders every item and the current one to a string without messages", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<NavigationRail label="Main" items={many} currentPath="/chat/12" className="bg-red-500" />);
    expect(html).toContain('data-ouro="navigation-rail"');
    expect(html).toMatch(/aria-current="page"[^>]*>.*Chat/);
    for (const label of ["Activity", "Help", "Tasks"]) expect(html).toContain(`>${label}<`);
    expect(html).not.toContain('data-ouro-part="more"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
