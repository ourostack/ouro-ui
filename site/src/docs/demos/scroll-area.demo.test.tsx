import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { DemoStage } from "../../components/phone-demo";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let size: { width: number; height: number };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  await page.viewport(size.width, size.height);
});

it.each([
  ["light", "rgb(255,250,242)", "rgb(245,245,247)", "rgb(235,235,239)"],
  ["dark", "rgb(0,0,0)", "rgb(28,28,30)", "rgb(44,44,46)"],
])("keeps the ScrollArea demo's clipped content distinct from its tinted surround in %s", async (scheme, background, muted, accent) => {
  size = { width: innerWidth, height: innerHeight };
  await page.viewport(3840, 2160);
  host = document.createElement("div");
  if (scheme === "dark") host.className = "dark";
  host.style.cssText = `--background:${background};--muted:${muted};--accent:${accent};--ouro-scroller-surface:var(--muted);width:700px;padding:24px;background:var(--background)`;
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<DemoStage name="scroll-area" title="Scroll Area" />));

  await expect.poll(() => host!.querySelector('[data-site-demo="scroll-area"][data-site-demo-ready]')).not.toBeNull();
  const scroller = host.querySelector<HTMLElement>('[data-ouro="scroll-area"] .peer')!;
  expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  expect(findDesignIssues({}).filter((issue) => issue.rule === "cut-off-edge")).toEqual([]);
});
