import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server } from "vitest/browser";
import { FamilyBar, type FamilyBarProps, type FamilyLink } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, dir?: "rtl") {
  const host = document.createElement("div");
  if (dir) host.dir = dir;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    root,
    get nav() {
      return host.querySelector<HTMLElement>('[data-ouro="family-bar"]')!;
    },
    get row() {
      return host.querySelector<HTMLElement>("[data-ouro-family-row]")!;
    },
    link(name: string) {
      return page.getByRole("link", { name, exact: true }).element() as HTMLAnchorElement;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await page.viewport(1024, 768);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(414, 896);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const sites: FamilyLink[] = [
  { id: "home", label: "Lantern", href: "https://example.com/" },
  { id: "docs", label: "Docs", href: "https://docs.example.com/" },
  { id: "guides", label: "Guides", href: "https://example.com/guides/" },
  { id: "blog", label: "Blog", href: "https://blog.example.com/" },
  { id: "status", label: "Status", href: "https://status.example.com/" },
  { id: "community", label: "Community", href: "https://example.com/community/" },
  { id: "source", label: "Source", href: "https://github.com/example" },
];

/** Whether the link is in the row and clear of its scroll padding, at each side that scrolls. */
function clearOfEdge(row: HTMLElement, link: HTMLElement): boolean {
  const box = row.getBoundingClientRect();
  const at = link.getBoundingClientRect();
  const end = row.scrollWidth - row.clientWidth - Math.abs(row.scrollLeft) <= 1;
  const start = Math.abs(row.scrollLeft) <= 1;
  const [left, right] = getComputedStyle(row).direction === "rtl" ? [end, start] : [start, end];
  return at.left >= box.left + (left ? 0 : 8) - 1 && at.right <= box.right - (right ? 0 : 8) + 1;
}

describe("FamilyBar", () => {
  it("renders a labelled nav of the family's links in order, small and muted, the current site marked with aria-current, semibold and in the text colour", async () => {
    const { nav, link } = await render(<FamilyBar links={sites} current="docs" />);
    expect(nav.tagName).toBe("NAV");
    expect([...nav.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual(sites.map((site) => [site.label, site.href]));
    expect([...nav.querySelectorAll("[aria-current]")]).toEqual([link("Docs")]);
    expect(link("Docs").getAttribute("aria-current")).toBe("true");
    expect(getComputedStyle(link("Guides")).fontSize).toBe("12px");
    expect(getComputedStyle(link("Docs")).fontWeight).toBe("600");
    expect(getComputedStyle(link("Guides")).fontWeight).toBe("400");
    expect(getComputedStyle(link("Docs")).color).toBe(getComputedStyle(nav).color);
    expect(getComputedStyle(link("Guides")).color).not.toBe(getComputedStyle(nav).color);
    expect(getComputedStyle(link("Docs")).textDecorationLine).toBe("none");
  });

  it("shows a small heading before the links, which names the nav for screen readers and is not read again", async () => {
    const { nav, row, root } = await render(<FamilyBar links={sites} />);
    const heading = () => nav.querySelector<HTMLElement>("[data-ouro-family-heading]");
    expect(heading()!.textContent).toBe("Ouro family");
    expect(getComputedStyle(heading()!).textTransform).toBe("uppercase");
    expect(heading()!.getAttribute("aria-hidden")).toBe("true");
    expect(nav.getAttribute("aria-label")).toBe("Ouro family");
    expect(row.firstElementChild).toBe(heading());
    await act(async () => root.render(<FamilyBar links={sites} heading="Lantern family" />));
    expect(heading()!.textContent).toBe("Lantern family");
    expect(nav.getAttribute("aria-label")).toBe("Lantern family");
    await act(async () => root.render(<FamilyBar links={sites} heading="Lantern family" label="Lantern sites" />));
    expect(nav.getAttribute("aria-label")).toBe("Lantern sites");
    await act(async () => root.render(<FamilyBar links={sites} heading={null} />));
    expect(heading()).toBeNull();
    expect(nav.getAttribute("aria-label")).toBe("Sites");
  });

  it("is a slim strip with no surface or line of its own, 32px on a phone and 28px from 640px", async () => {
    const { nav } = await render(<FamilyBar links={sites} current="docs" />);
    const style = getComputedStyle(nav);
    expect(nav.getBoundingClientRect().height).toBe(28);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) expect(style[`border${side}Width`]).toBe("0px");
    expect(style.boxShadow).toBe("none");
    await page.viewport(390, 844);
    await expect.poll(() => nav.getBoundingClientRect().height).toBe(32);
  });

  it("keeps the current site's weight under forced colours, which drop colour", async () => {
    const { link } = await render(<FamilyBar links={sites} current="docs" />);
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      expect(getComputedStyle(link("Docs")).fontWeight).toBe("600");
      expect(getComputedStyle(link("Guides")).fontWeight).toBe("400");
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("starts its heading's text, or its first link's, where the FamilyFooter's first link's does, at the padding's edge, or after its brand", async () => {
    const textStart = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.round(range.getBoundingClientRect().left);
    };
    const footerLink = (host: HTMLElement) => host.querySelector('[data-ouro="family-footer"] a')!;
    const heading = (host: HTMLElement) => host.querySelector("[data-ouro-family-heading]")!;
    const padded = await render(
      <>
        <FamilyBar links={sites} className="px-6" />
        <FamilyFooter links={sites} className="px-6" />
      </>,
    );
    expect(textStart(heading(padded.host))).toBe(textStart(footerLink(padded.host)));
    expect(textStart(heading(padded.host)) - Math.round(padded.nav.getBoundingClientRect().left)).toBe(24);
    // With no className, and with no heading, the strip and the footer keep the same padding too.
    const plain = await render(
      <>
        <FamilyBar links={sites} heading={null} />
        <FamilyFooter links={sites} />
      </>,
    );
    const first = plain.host.querySelector('[data-ouro="family-bar"] a')!;
    expect(textStart(first)).toBe(textStart(footerLink(plain.host)));
    expect(textStart(first) - Math.round(plain.nav.getBoundingClientRect().left)).toBe(16);
    // After a brand, the row keeps its gap: the heading starts clear of the brand.
    const branded = await render(<FamilyBar links={sites} brand={<span data-testid="brand">Lantern</span>} />);
    expect(heading(branded.host).getBoundingClientRect().left).toBeGreaterThanOrEqual(page.getByTestId("brand").element().getBoundingClientRect().right);
  });

  it("renders the whole bar in the server HTML", () => {
    const html = renderToString(<FamilyBar links={sites} current="blog" brand={<span>Lantern</span>} />);
    expect(html).toContain('aria-label="Ouro family"');
    expect(html).toContain(">Ouro family</span>");
    // Nothing is cut off until the row has been measured in the browser.
    expect(html).not.toContain("data-more");
    expect(html).toMatch(/aria-current="true"[^>]*>(?:<span[^>]*><\/span>)?Blog</);
    for (const site of sites) expect(html).toContain(`href="${site.href}"`);
    expect(html).toContain("<span>Lantern</span>");
  });

  it("puts the brand before the links, outside the row that scrolls, and leaves it out when there is none", async () => {
    const { nav, row } = await render(<FamilyBar links={sites} brand={<span data-testid="brand">Lantern</span>} />);
    const brand = page.getByTestId("brand").element();
    expect(nav.firstElementChild!.contains(brand)).toBe(true);
    expect(row.contains(brand)).toBe(false);
    await act(async () => roots[0]!.render(<FamilyBar links={sites} />));
    expect(nav.querySelector("[data-ouro-family-brand]")).toBeNull();
    expect(nav.firstElementChild).toBe(row);
  });

  it("scrolls the row inside itself on a narrow screen, never the page", async () => {
    await page.viewport(320, 640);
    const { row } = await render(<FamilyBar links={sites} />);
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  });

  it("draws no scroll bar on the row for a mouse either, and does not snap it", async () => {
    await page.viewport(320, 640);
    const { row } = await render(<FamilyBar links={sites} />);
    expect(matchMedia("(pointer: fine)").matches).toBe(true);
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    expect(getComputedStyle(row).scrollbarWidth).toBe("none");
    expect(row.offsetHeight - row.clientHeight).toBe(0);
    expect(getComputedStyle(row).scrollSnapType).toBe("none");
  });

  it("fades the row's end edge only while more of it is cut off there, in either direction", async () => {
    await page.viewport(320, 640);
    for (const dir of [undefined, "rtl"] as const) {
      const { row } = await render(<FamilyBar links={sites} />, dir);
      const mask = () => getComputedStyle(row).maskImage;
      await expect.poll(mask).toContain(dir === "rtl" ? "to left" : "to right");
      expect(mask()).toContain("linear-gradient");
      row.scrollLeft = (dir === "rtl" ? -1 : 1) * (row.scrollWidth - row.clientWidth);
      await expect.poll(mask).toBe("none");
      row.scrollLeft = 0;
      await expect.poll(mask).not.toBe("none");
    }
    await page.viewport(1024, 768);
    const fits = await render(<FamilyBar links={sites} />);
    expect(fits.row.scrollWidth).toBeLessThanOrEqual(fits.row.clientWidth);
    await expect.poll(() => getComputedStyle(fits.row).maskImage).toBe("none");
    // It is measured again when the strip narrows, at the same height, and when the links change: two frames first, so
    // the first measure, which a ResizeObserver delivers, is behind us.
    for (let frame = 0; frame < 2; frame++) await new Promise(requestAnimationFrame);
    (fits.host as HTMLElement).style.width = "320px";
    await expect.poll(() => getComputedStyle(fits.row).maskImage).not.toBe("none");
    await act(async () => fits.root.render(<FamilyBar links={sites.slice(0, 1)} />));
    await expect.poll(() => getComputedStyle(fits.row).maskImage).toBe("none");
    await act(async () => fits.root.render(<FamilyBar links={sites} />));
    await expect.poll(() => getComputedStyle(fits.row).maskImage).not.toBe("none");
  });

  it("brings each link the keyboard focuses clear of the row's edge, outline and all", async () => {
    await page.viewport(320, 640);
    const { host, row } = await render(<FamilyBar links={sites} />);
    const before = document.createElement("button");
    host.before(before);
    mounted.push(before);
    before.focus();
    const clear = (link: Element) => {
      const box = row.getBoundingClientRect();
      const at = link.getBoundingClientRect();
      return at.left >= box.left - 1 && at.right <= box.right + 1;
    };
    for (const site of sites) {
      await pressTab();
      expect(document.activeElement!.textContent).toBe(site.label);
      await expect.poll(() => clear(document.activeElement!)).toBe(true);
    }
    expect(row.scrollLeft).toBeCloseTo(row.scrollWidth - row.clientWidth, -1);
    const last = document.activeElement!.getBoundingClientRect();
    expect(last.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
    for (const site of sites.slice(0, -1).reverse()) {
      await pressTab({ shift: true });
      expect(document.activeElement!.textContent).toBe(site.label);
      await expect.poll(() => clear(document.activeElement!)).toBe(true);
    }
  });

  it("leaves the row still when a click focuses a link at the row's edge, so the link never moves under the pointer", async () => {
    await page.viewport(320, 640);
    const { host, row, link } = await render(<FamilyBar links={sites} />);
    host.addEventListener("click", (event) => event.preventDefault());
    const community = link("Community");
    row.scrollLeft += community.getBoundingClientRect().right - row.getBoundingClientRect().right + 8;
    const at = row.scrollLeft;
    expect(at).toBeGreaterThan(0);
    // A press at the link's place, not userEvent.click, which first scrolls the link into view by the row's padding.
    const box = community.getBoundingClientRect();
    const middle: [number, number] = [box.left + box.width / 2, box.top + box.height / 2];
    await commands.drag({ from: middle, to: middle, steps: 0, durationMs: 0 });
    // WebKit does not focus a link a click lands on.
    if (server.browser === "chromium") expect(document.activeElement).toBe(community);
    expect(row.scrollLeft).toBe(at);
  });

  it("brings the current site's link into view when it is out of view, and again when current changes", async () => {
    await page.viewport(320, 640);
    const { row, root, link } = await render(<FamilyBar links={sites} current="community" />);
    expect(row.scrollLeft).toBeGreaterThan(0);
    expect(clearOfEdge(row, link("Community"))).toBe(true);
    await act(async () => root.render(<FamilyBar links={sites} current="source" />));
    expect(clearOfEdge(row, link("Source"))).toBe(true);
  });

  it("leaves the row where it starts when the current site's link is already in view, with or without script", async () => {
    await page.viewport(320, 640);
    const { row } = await render(<FamilyBar links={sites} current="docs" />);
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth + 1);
    expect(row.scrollLeft).toBe(0);
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    host.innerHTML = renderToString(<FamilyBar links={sites} current="docs" />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.querySelector<HTMLElement>("[data-ouro-family-row]")!.scrollLeft).toBe(0);
  });

  it("starts the row with the current site's link in view from the server HTML alone, where the browser supports scroll-initial-target", async () => {
    await page.viewport(320, 640);
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    host.innerHTML = renderToString(<FamilyBar links={sites} current="community" />);
    const row = host.querySelector<HTMLElement>("[data-ouro-family-row]")!;
    const link = row.querySelector<HTMLElement>('[aria-current="true"]')!;
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    // WebKit has no scroll-initial-target yet: there the row starts at its start until it hydrates.
    if (!CSS.supports("scroll-initial-target", "nearest")) return;
    await expect.poll(() => row.scrollLeft).toBeGreaterThan(0);
    const box = row.getBoundingClientRect();
    const at = link.getBoundingClientRect();
    expect(at.left).toBeGreaterThanOrEqual(box.left - 1);
    expect(at.right).toBeLessThanOrEqual(box.right + 1);
  });

  it("keeps no scroll bar on a row that fits", async () => {
    const { row } = await render(<FamilyBar links={sites} />);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    expect(row.offsetHeight - row.clientHeight).toBe(0);
  });

  it("brings the current site's link into view by script where CSS does not place it", async () => {
    await page.viewport(320, 640);
    const style = document.createElement("style");
    style.textContent = "[data-ouro-family-start] { scroll-initial-target: none !important } [data-ouro-family-row] li { scroll-snap-align: none !important }";
    document.head.append(style);
    try {
      const { row, root, link } = await render(<FamilyBar links={sites} current="community" />);
      expect(row.scrollLeft).toBeGreaterThan(0);
      expect(clearOfEdge(row, link("Community"))).toBe(true);
      row.scrollLeft = 0;
      await act(async () => root.render(<FamilyBar links={sites} current="source" />));
      expect(clearOfEdge(row, link("Source"))).toBe(true);
    } finally {
      style.remove();
    }
  });

  it("brings the current site's link into view in a right-to-left row", async () => {
    await page.viewport(320, 640);
    const { row, link } = await render(<FamilyBar links={sites} current="community" />, "rtl");
    expect(row.scrollLeft).toBeLessThan(0);
    expect(clearOfEdge(row, link("Community"))).toBe(true);
  });

  it("leaves a row that fits, or has no current site, where it starts", async () => {
    const fits = await render(<FamilyBar links={sites} current="source" />);
    expect(fits.row.scrollWidth).toBeLessThanOrEqual(fits.row.clientWidth);
    expect(fits.row.scrollLeft).toBe(0);
    await page.viewport(320, 640);
    const none = await render(<FamilyBar links={sites} />);
    expect(none.row.scrollLeft).toBe(0);
    expect(none.nav.querySelector("[aria-current]")).toBeNull();
  });

  it("takes its accessible name as label", async () => {
    const { nav } = await render(<FamilyBar links={sites} label="Lantern sites" />);
    expect(nav.getAttribute("aria-label")).toBe("Lantern sites");
  });

  it("routes a link to the site's own path through OuroProvider's linkComponent, and the other sites as plain links", async () => {
    const Router: OuroLinkComponent = (props: ComponentProps<OuroLinkComponent>) => <a data-router="" {...props} />;
    const { link } = await render(
      <OuroProvider linkComponent={Router}>
        <FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }, ...sites.slice(2)]} current="docs" />
      </OuroProvider>,
    );
    expect(link("Docs").hasAttribute("data-router")).toBe(true);
    expect(link("Guides").hasAttribute("data-router")).toBe(false);
  });

  it("passes className and ref to the nav", async () => {
    let node: HTMLElement | null = null;
    const { nav } = await render(
      <FamilyBar
        links={sites}
        className="sticky top-0"
        ref={(element) => {
          node = element;
        }}
      />,
    );
    expect(nav.classList.contains("sticky")).toBe(true);
    expect(node).toBe(nav);
  });

  it("says when current matches no link or two links share an id, and names the props agents guess", async () => {
    const guessed = { links: [...sites, sites[1]!], current: "nope", className: "bg-red-500", items: sites, currentPath: "/docs", children: "Docs", title: "Lantern family" } as unknown as FamilyBarProps;
    await render(<FamilyBar {...guessed} />);
    await render(<FamilyBar links={[]} current="docs" />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toEqual(
      expect.arrayContaining([
        '[ouro-ui] FamilyBar: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; FamilyBar sets its own look.',
        '[ouro-ui] FamilyBar: current "nope" matches no link\'s id. Fix: <FamilyBar current="home">.',
        '[ouro-ui] FamilyBar: two links have the id "docs". Fix: links={[{ id: "docs", … }, { id: "docs-2", … }]}.',
        '[ouro-ui] FamilyBar: items is not a prop. Fix: <FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />.',
        '[ouro-ui] FamilyBar: currentPath is not a prop; current takes the id of the site being shown. Fix: <FamilyBar current="docs">.',
        '[ouro-ui] FamilyBar: children are not rendered. Fix: <FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />.',
        '[ouro-ui] FamilyBar: title is not a prop; the visible heading is heading. Fix: <FamilyBar heading="Lantern family">.',
        '[ouro-ui] FamilyBar: current "docs" matches no link\'s id. Fix: <FamilyBar current="home">.',
      ]),
    );
    expect(messages).toHaveLength(8);
  });

  it("says nothing for a family with each id once and current one of them, or none", async () => {
    await render(<FamilyBar links={sites} current="home" />);
    await render(<FamilyBar links={sites} />);
    expect(warn).not.toHaveBeenCalled();
  });
});
