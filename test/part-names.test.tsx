import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Part names (docs/guides/part-names.md): an app that styles with plain CSS, no Tailwind, reaches
// any part of a component by its `data-slot` name. scripts/part-names.test.mjs holds that every
// styled element has one; these tests hold what the guide promises an app's stylesheet can do with
// them. Repository-only: it spans several items, so no single item ships it.

const roots: Root[] = [];
const nodes: Element[] = [];
async function render(node: ReactNode, css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(style, host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

describe("part names", () => {
  it("let an app's plain CSS, outside any layer, restyle a root and a part over the component's own utilities", async () => {
    const host = await render(
      <div>
        <Badge>Beta</Badge>
        <Alert title="Saved" description="The recipe is in your cookbook." />
      </div>,
      '[data-slot="badge"] { --ouro-bg: rgb(1, 2, 3); } [data-slot="alert-title"] { color: rgb(4, 5, 6); letter-spacing: 3px; }',
    );
    // A squircle surface's fill is the badge's own background, or where the engine has no corner-shape the layer under it.
    const badge = host.querySelector<HTMLElement>('[data-slot="badge"]')!;
    const painted = CSS.supports("corner-shape: squircle") ? badge : badge.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(painted).backgroundColor).toBe("rgb(1, 2, 3)");
    const title = host.querySelector<HTMLElement>('[data-slot="alert-title"]')!;
    expect(title.textContent).toBe("Saved");
    expect(getComputedStyle(title).color).toBe("rgb(4, 5, 6)");
    expect(getComputedStyle(title).letterSpacing).toBe("3px");
  });

  it("name a component another renders as its own part after that part, so a rule for the part reaches only it", async () => {
    const host = await render(<CodeBlock code="pnpm i" title="Install" />, '[data-slot="code-block-copy"] { outline: 2px solid rgb(7, 8, 9); }');
    const copy = host.querySelector<HTMLElement>('[data-slot="code-block-copy"]')!;
    expect(copy.getAttribute("data-ouro")).toBe("copy-button");
    expect(getComputedStyle(copy).outlineColor).toBe("rgb(7, 8, 9)");
    expect(host.querySelector('[data-slot="copy-button"]')).toBeNull();
  });
});
