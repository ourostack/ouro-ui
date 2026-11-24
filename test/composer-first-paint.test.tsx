import type { ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { findLoadingIssues, listenForMeasures, type Measures } from "@/registry/ouro/check/measure";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Composer's rich format draws a plain textarea on the server and until its editor module loads client-side, so a page
// with no JavaScript still gets a working box; the editor replacing that textarea once the module is ready is the
// fallback's whole point, not a surprise ouro-check's first-paint-swap rule should flag (ourostack/ouro-ui#3308).
// Repository-only: the ouro-check measure reads the page the way ouro-check does. Runs in Chromium and WebKit.

const rich = <Composer label="Message Launch crew" format="rich" placeholder="Write a message, @ to mention" onSend={() => {}} />;

const nodes: Element[] = [];
const roots: Root[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
  delete (window as unknown as { __ouroCheckMeasures?: Measures }).__ouroCheckMeasures;
  delete (window as unknown as { __ouroCheckRef?: number }).__ouroCheckRef;
});

const frames = (count = 2) =>
  new Promise<void>((done) => {
    const step = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

/** The server HTML in the page, at once: no await, so no frame passes before it is there. */
function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  host.innerHTML = renderToString(node);
  return host;
}

async function hydrate(host: HTMLElement, node: ReactNode) {
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(host, node);
  });
  roots.push(root);
}

describe("Composer's first paint", () => {
  it("replaces the server's textarea with the rich editor once its module loads, with no input in between", async () => {
    // Warms the browser's own module cache for the editor's chunk, without touching Composer's loadRich() cache, so the
    // cold useEffect below resolves its import on the next microtask: the same fast-network, cache-warm race a returning
    // visitor hits in production, well inside ouro-check's 10-frame observation window.
    await import("@/registry/ouro/components/ouro/composer/composer-parts");
    listenForMeasures();
    const host = mount(rich);
    await frames();
    await hydrate(host, rich);
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]"), { timeout: 10_000 }).not.toBeNull();
    await frames(4);
    const drawn = (window as unknown as { __ouroCheckMeasures: Measures }).__ouroCheckMeasures.painted;
    // The check's own window saw the server's textarea drawn first.
    expect([...drawn.keys()].some((element) => element.matches("textarea"))).toBe(true);
    const issues = await findLoadingIssues({ "layout-shift": 0.1, "first-content": 2500 });
    expect(issues.filter((issue) => issue.rule === "first-paint-swap")).toEqual([]);
  });
});
