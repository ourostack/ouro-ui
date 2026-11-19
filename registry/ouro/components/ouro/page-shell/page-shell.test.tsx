import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { PageSection, PageShell } from "@/registry/ouro/components/ouro/page-shell/page-shell";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
});

describe("PageShell", () => {
  it("holds the content to a 72rem column with the gutter either side, centred", async () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(1600, 900);
    try {
      const host = await render(<PageShell data-testid="shell">x</PageShell>);
      const el = host.firstElementChild as HTMLElement;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const gutter = parseFloat(getComputedStyle(el).paddingLeft);
      expect(gutter).toBe(4 * root);
      expect(el.getBoundingClientRect().width).toBe(72 * root + 2 * gutter);
      expect(el.getBoundingClientRect().left).toBeGreaterThan(0);
    } finally {
      await page.viewport(size.width, size.height);
    }
  });

  it("uses a phone's gutter on a phone and fills the screen", async () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(390, 844);
    try {
      const host = await render(<PageShell>x</PageShell>);
      const el = host.firstElementChild as HTMLElement;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      expect(parseFloat(getComputedStyle(el).paddingLeft)).toBe(1.25 * root);
      expect(el.getBoundingClientRect().width).toBe(host.getBoundingClientRect().width);
    } finally {
      await page.viewport(size.width, size.height);
    }
  });

  it("widens the column to 84rem from 2000px", async () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(2200, 900);
    try {
      const host = await render(<PageShell>x</PageShell>);
      const el = host.firstElementChild as HTMLElement;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const gutter = parseFloat(getComputedStyle(el).paddingLeft);
      expect(el.getBoundingClientRect().width).toBe(84 * root + 2 * gutter);
    } finally {
      await page.viewport(size.width, size.height);
    }
  });

  it("lets the app's layout class win and warns about an appearance class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = await render(<PageShell className="mt-8 bg-red-500">x</PageShell>);
    const el = host.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-ouro")).toBe("page-shell");
    expect(getComputedStyle(el).marginTop).toBe("32px");
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("[ouro-ui] PageShell:");
  });
});

describe("PageSection", () => {
  it("is a section with a hairline above all but the first", async () => {
    const host = await render(
      <PageShell>
        <PageSection aria-label="One">a</PageSection>
        <PageSection aria-label="Two">b</PageSection>
      </PageShell>,
    );
    const [one, two] = Array.from(host.querySelectorAll("section")) as HTMLElement[];
    expect(one!.tagName).toBe("SECTION");
    expect(getComputedStyle(one!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(two!).borderTopWidth).toBe("1px");
  });

  it("spaces sections more on a wide screen than on a phone", async () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    try {
      await page.viewport(390, 844);
      const host = await render(<PageSection>a</PageSection>);
      const phone = parseFloat(getComputedStyle(host.firstElementChild!).paddingTop);
      await page.viewport(1200, 844);
      const wide = parseFloat(getComputedStyle(host.firstElementChild!).paddingTop);
      expect(wide).toBeGreaterThan(phone);
    } finally {
      await page.viewport(size.width, size.height);
    }
  });

  it("lets the app's layout class win and warns about an appearance class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = await render(<PageSection className="mt-8 bg-red-500">x</PageSection>);
    const el = host.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-ouro")).toBe("page-section");
    expect(getComputedStyle(el).marginTop).toBe("32px");
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("[ouro-ui] PageSection:");
  });
});
