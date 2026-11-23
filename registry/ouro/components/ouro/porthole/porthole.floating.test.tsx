import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Porthole, type PortholeFixed } from "@/registry/ouro/components/ouro/porthole/porthole";
import type { PortholeArea, PortholeSnapshot } from "@/registry/ouro/lib/ouro/porthole-view";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const roots: Root[] = [];
let mounted: Element[] = [];

const area = (lastVerifiedAt: number | null): PortholeArea => ({ lastVerifiedAt, troubleSince: null });
const snapshot = (): PortholeSnapshot => ({ version: 1, items: [], areas: { chats: area(Date.now()) } });
const fixed = (): PortholeFixed => ({ snapshot: snapshot(), lastBeatAt: Date.now() });

async function render(floating: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Porthole label="Status" source={fixed()} quiet={false} floating={floating} />));
  await act(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return host.querySelector<HTMLElement>('[data-porthole-part="pill"]')!;
}

/** A theme colour, or a colour mixed from the theme, as the browser computes it. */
function computedBackground(value: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = value;
  document.body.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Porthole floating", () => {
  it("is translucent glass from the theme, with a blur and a soft shadow, over passing content", async () => {
    const pill = await render(true);
    const style = getComputedStyle(pill);
    expect(style.backgroundColor).toBe(computedBackground("color-mix(in oklab, var(--card) 75%, transparent)"));
    expect(style.backgroundColor).not.toBe(computedBackground("var(--card)"));
    expect(style.backdropFilter).toMatch(/^blur\(/);
    expect(style.boxShadow.match(/(rgba?|oklab|oklch|color)\(/g)!.length).toBeGreaterThan(1);
    expect(style.borderTopLeftRadius).not.toBe("0px");
  });

  it("is a plain opaque pill without floating", async () => {
    const pill = await render(false);
    const style = getComputedStyle(pill);
    expect(style.backgroundColor).toBe(computedBackground("var(--card)"));
    expect(style.backdropFilter).toBe("none");
    expect(style.boxShadow).toBe("none");
  });

  it("turns solid with no blur under reduced transparency", async () => {
    const pill = await render(true);
    // Test browsers cannot ask for reduced transparency, so the page's own rules for it apply to every page here.
    const reduced = document.createElement("style");
    reduced.textContent = pageCss().replace(/@media ?\(prefers-reduced-transparency: ?reduce\)/g, "@media all");
    expect(reduced.textContent).not.toBe(pageCss());
    document.head.append(reduced);
    mounted.push(reduced);
    // The pill transitions its background colour, so wait for the new rule's colour to settle.
    await expect.poll(() => getComputedStyle(pill).backgroundColor).toBe(computedBackground("var(--card)"));
    expect(getComputedStyle(pill).backdropFilter).toBe("none");
  });

  it("turns solid with a defined edge with prefers-contrast: more, at the same size", async () => {
    const pill = await render(true);
    const size = pill.getBoundingClientRect();
    await commands.emulateMedia({ contrast: "more" });
    try {
      // The pill transitions its background colour, so wait for the new rule's colour to settle.
      await expect.poll(() => getComputedStyle(pill).backgroundColor).toBe(computedBackground("var(--card)"));
      const style = getComputedStyle(pill);
      expect(style.backdropFilter).toBe("none");
      expect(style.borderTopColor).toBe(computedBackground("var(--border)"));
      const now = pill.getBoundingClientRect();
      expect([now.width, now.height]).toEqual([size.width, size.height]);
    } finally {
      await commands.emulateMedia({ contrast: "no-preference" });
    }
  });

  it("keeps a solid edge under forced colours, at the same size", async () => {
    const pill = await render(true);
    const size = pill.getBoundingClientRect();
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      const style = getComputedStyle(pill);
      expect(style.backdropFilter).toBe("none");
      expect(style.borderTopStyle).toBe("solid");
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      const after = pill.getBoundingClientRect();
      expect([after.width, after.height]).toEqual([size.width, size.height]);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });
});
