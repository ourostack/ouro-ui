import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FamilyBar, type FamilyLink } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await rotate(390, 844);
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

const sites: FamilyLink[] = [
  { id: "home", label: "Lantern", href: "https://example.com/" },
  { id: "docs", label: "Docs", href: "https://docs.example.com/" },
  { id: "go", label: "Go", href: "https://go.example.com/" },
  { id: "guides", label: "Guides", href: "https://example.com/guides/" },
  { id: "blog", label: "Blog", href: "https://blog.example.com/" },
  { id: "status", label: "Status", href: "https://status.example.com/" },
  { id: "community", label: "Community", href: "https://example.com/community/" },
  { id: "source", label: "Source", href: "https://github.com/example" },
];

describe("FamilyBar and FamilyFooter on a phone", () => {
  it("keeps a FamilyBar link's 44px target at a compact --spacing, a two-letter name too, in a strip that stays 32px", async () => {
    const host = await render(<FamilyBar links={sites} current="docs" />);
    // "Go", the shortest name: its target is 44px each way, wider than the link.
    const go = [...host.querySelectorAll<HTMLElement>('[data-ouro-part="link"]')].find((link) => link.textContent === "Go")!;
    expect(go.getBoundingClientRect().width).toBeLessThan(44);
    const target = () => go.querySelector("[data-ouro-touch-target]")!.getBoundingClientRect();
    expect([target().height, target().width]).toEqual([44, 44]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([target().height, target().width]).toEqual([44, 44]);
    expect(host.querySelector('[data-ouro="family-bar"]')!.getBoundingClientRect().height).toBe(32);
  });

  it("give every link a 44px target, a two-letter name too, also in landscape, and the page never scrolls sideways", async () => {
    const host = await render(
      <>
        <FamilyBar links={sites} current="blog" />
        <FamilyFooter links={sites} current="blog" />
      </>,
    );
    // Room above the strip, so a target edge that reaches past it is still on screen.
    host.style.paddingBlock = "24px";
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    const bar = host.querySelector<HTMLElement>('[data-ouro="family-bar"]')!;
    const row = bar.querySelector<HTMLElement>("[data-ouro-family-row]")!;
    for (const [width, height, strip] of [
      [390, 844, 32],
      [844, 390, 28],
    ] as const) {
      await rotate(width, height);
      await expect.poll(() => innerWidth).toBe(width);
      expect(bar.getBoundingClientRect().height).toBe(strip);
      const links = [...bar.querySelectorAll<HTMLElement>("a")];
      expect(links.length).toBe(sites.length);
      for (const link of links) {
        row.scrollLeft = 0;
        link.scrollIntoView({ inline: "center", block: "nearest" });
        const target = link.querySelector("[data-ouro-touch-target]")!.getBoundingClientRect();
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.width).toBeGreaterThanOrEqual(44);
        // The row is tall enough that it clips none of the target: a tap at its top and bottom edges lands on the link.
        const x = target.left + target.width / 2;
        expect(link.contains(document.elementFromPoint(x, target.top + 1))).toBe(true);
        expect(link.contains(document.elementFromPoint(x, target.bottom - 1))).toBe(true);
      }
      for (const link of host.querySelectorAll<HTMLElement>('[data-ouro="family-footer"] a')) {
        expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
        expect(parseFloat(getComputedStyle(link).fontSize)).toBeGreaterThanOrEqual(16);
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    }
  });

  it("keeps the FamilyBar on a phone as one row that scrolls with no scroll bar, and rests a swipe on a whole link", async () => {
    const host = await render(<FamilyBar links={sites} current="blog" />);
    const row = host.querySelector<HTMLElement>("[data-ouro-family-row]")!;
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    const tops = new Set([...row.querySelectorAll("a")].map((a) => Math.round(a.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);
    expect(getComputedStyle(row).scrollbarWidth).toBe("none");
    expect(getComputedStyle(row).scrollSnapType).toBe("x");
    expect(getComputedStyle(row.querySelector("li")!).scrollSnapAlign).toBe("start");
  });
});
