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
    expect(Number(getComputedStyle(link("Docs")).fontWeight)).toBeGreaterThan(Number(getComputedStyle(link("Guides")).fontWeight));
    expect(getComputedStyle(link("Docs"), "::after").borderBottomWidth).toBe("2px");
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

  it("wraps on a narrow screen instead of scrolling sideways", async () => {
    await page.viewport(320, 640);
    const { footer } = await render(<FamilyFooter links={sites} current="docs" />);
    expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
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
