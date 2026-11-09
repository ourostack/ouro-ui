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
  it("keep 44px targets with 16px text, a two-letter name too, also in landscape, and the page never scrolls sideways", async () => {
    const host = await render(
      <>
        <FamilyBar links={sites} current="blog" />
        <FamilyFooter links={sites} current="blog" />
      </>,
    );
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ] as const) {
      await rotate(width, height);
      await expect.poll(() => innerWidth).toBe(width);
      const targets = [...host.querySelectorAll<HTMLElement>("a")];
      expect(targets.length).toBe(sites.length * 2);
      for (const target of targets) {
        expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(target.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
        expect(parseFloat(getComputedStyle(target).fontSize)).toBeGreaterThanOrEqual(16);
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    }
  });

  it("hides the FamilyBar row's scroll bar from a finger, which swipes it", async () => {
    const host = await render(<FamilyBar links={sites} current="blog" />);
    expect(getComputedStyle(host.querySelector("[data-ouro-family-row]")!).scrollbarWidth).toBe("none");
  });
});
