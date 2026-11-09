import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { FamilyLink } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { FamilyFooter, type FamilyFooterProps } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
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
    get footer() {
      return host.querySelector<HTMLElement>('[data-ouro="family-footer"]')!;
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

describe("FamilyFooter", () => {
  it("renders the family's links in order in a labelled nav, the current site marked as in the bar, and the site's extras after them", async () => {
    const { footer, link } = await render(
      <FamilyFooter links={sites} current="docs">
        <a href="/privacy">Privacy</a>
      </FamilyFooter>,
    );
    const nav = footer.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("All sites");
    expect([...nav.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual(sites.map((site) => [site.label, site.href]));
    expect([...footer.querySelectorAll("[aria-current]")]).toEqual([link("Docs")]);
    expect(link("Docs").getAttribute("aria-current")).toBe("true");
    expect(getComputedStyle(link("Docs")).color).not.toBe(getComputedStyle(link("Guides")).color);
    // A link at rest is underlined in the border colour, 1px; the current one in the primary colour, 2px, as in the bar.
    expect(getComputedStyle(link("Guides")).textDecorationLine).toBe("underline");
    expect(getComputedStyle(link("Guides")).textDecorationThickness).toBe("1px");
    expect(getComputedStyle(link("Docs")).textDecorationLine).toBe("underline");
    expect(getComputedStyle(link("Docs")).textDecorationThickness).toBe("2px");
    expect(getComputedStyle(link("Docs")).textDecorationColor).not.toBe(getComputedStyle(link("Guides")).textDecorationColor);
    const extras = footer.querySelector("[data-ouro-family-extras]")!;
    expect(nav.contains(link("Privacy"))).toBe(false);
    expect(extras.contains(link("Privacy"))).toBe(true);
    expect(nav.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leaves out the extras' row when there are none, and takes its accessible name as label", async () => {
    const { footer } = await render(<FamilyFooter links={sites} label="Lantern sites" />);
    expect(footer.querySelector("[data-ouro-family-extras]")).toBeNull();
    expect(footer.querySelector("nav")!.getAttribute("aria-label")).toBe("Lantern sites");
    expect(footer.querySelector("[aria-current]")).toBeNull();
  });

  it("renders the whole footer in the server HTML", () => {
    const html = renderToString(
      <FamilyFooter links={sites} current="blog">
        <span>Made in the open</span>
      </FamilyFooter>,
    );
    expect(html).toMatch(/aria-current="true"[^>]*>Blog</);
    for (const site of sites) expect(html).toContain(`href="${site.href}"`);
    expect(html).toContain("<span>Made in the open</span>");
  });

  it("lays its links in even columns of 44px rows on a narrow screen instead of ragged lines, and never scrolls sideways", async () => {
    await page.viewport(320, 640);
    const long = [...sites, { id: "portal", label: "Developer Portal and Forums", href: "https://portal.example.com/" }];
    const { footer } = await render(<FamilyFooter links={long} current="docs" />);
    expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    for (const a of footer.querySelectorAll("nav a")) expect(a.scrollWidth).toBeLessThanOrEqual(a.clientWidth);
    const boxes = [...footer.querySelectorAll("nav a")].map((a) => a.getBoundingClientRect());
    const columns = new Set(boxes.map((box) => Math.round(box.left)));
    expect(columns.size).toBeGreaterThan(1);
    expect(columns.size).toBeLessThan(boxes.length);
    // The current site's bar stays under its name, not across its column.
    const docs = footer.querySelector('[aria-current="true"]')!;
    expect(docs.getBoundingClientRect().width).toBeLessThan(boxes[1]!.left - boxes[0]!.left);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
  });

  it("lets the site's extras fill the rest of the row, or a row of their own, to its end edge", async () => {
    for (const [width, ownRow] of [[1024, false], [390, true]] as const) {
      await page.viewport(width, 640);
      const { footer } = await render(
        <FamilyFooter links={sites.slice(0, 3)}>
          <span className="me-auto">Made by Lantern</span>
          <a href="/privacy">Privacy</a>
        </FamilyFooter>,
      );
      const extras = footer.querySelector<HTMLElement>("[data-ouro-family-extras]")!.getBoundingClientRect();
      const inner = footer.getBoundingClientRect().right - parseFloat(getComputedStyle(footer).paddingRight);
      expect(Math.round(extras.right)).toBe(Math.round(inner));
      // The site spreads its extras across the area: its last one reaches the end edge.
      expect(Math.round(footer.querySelector('a[href="/privacy"]')!.getBoundingClientRect().right)).toBe(Math.round(inner));
      const nav = footer.querySelector("nav")!.getBoundingClientRect();
      expect(extras.top >= nav.bottom).toBe(ownRow);
      if (ownRow) expect(Math.round(extras.left)).toBe(Math.round(nav.left));
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    }
  });

  it("routes a link to the site's own path through OuroProvider's linkComponent", async () => {
    const Router: OuroLinkComponent = (props: ComponentProps<OuroLinkComponent>) => <a data-router="" {...props} />;
    const { link } = await render(
      <OuroProvider linkComponent={Router}>
        <FamilyFooter links={[{ id: "docs", label: "Docs", href: "/" }, ...sites.slice(2)]} current="docs" />
      </OuroProvider>,
    );
    expect(link("Docs").hasAttribute("data-router")).toBe(true);
    expect(link("Guides").hasAttribute("data-router")).toBe(false);
  });

  it("passes className and ref to its root", async () => {
    let node: HTMLDivElement | null = null;
    const { footer } = await render(
      <FamilyFooter
        links={sites}
        className="mt-auto"
        ref={(element) => {
          node = element;
        }}
      />,
    );
    expect(footer.classList.contains("mt-auto")).toBe(true);
    expect(node).toBe(footer);
  });

  it("says when current matches no link or two links share an id, and names the props agents guess", async () => {
    const guessed = { links: [...sites, sites[1]!], current: "nope", className: "text-red-500", items: sites, currentPath: "/docs" } as unknown as FamilyFooterProps;
    await render(<FamilyFooter {...guessed} />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toHaveLength(5);
    expect(messages).toEqual(expect.arrayContaining([
      '[ouro-ui] FamilyFooter: "text-red-500" sets appearance, and className is for layout only. Fix: remove "text-red-500"; FamilyFooter sets its own look.',
      '[ouro-ui] FamilyFooter: current "nope" matches no link\'s id. Fix: <FamilyFooter current="home">.',
      '[ouro-ui] FamilyFooter: two links have the id "docs". Fix: links={[{ id: "docs", … }, { id: "docs-2", … }]}.',
      '[ouro-ui] FamilyFooter: items is not a prop. Fix: <FamilyFooter links={[{ id: "docs", label: "Docs", href: "/" }]} />.',
      '[ouro-ui] FamilyFooter: currentPath is not a prop; current takes the id of the site being shown. Fix: <FamilyFooter current="docs">.',
    ]));
  });

  it("says nothing for a family with each id once and current one of them, or none", async () => {
    await render(<FamilyFooter links={sites} current="home" />);
    await render(<FamilyFooter links={sites} />);
    expect(warn).not.toHaveBeenCalled();
  });
});
