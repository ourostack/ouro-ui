import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import ThreadLayoutDemo from "./demos/thread-layout.demo";
import ThreadRailDemo from "./demos/thread-rail.demo";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let size: { width: number; height: number };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  await page.viewport(size.width, size.height);
});

async function render(node: ReactNode, scheme: "light" | "dark") {
  size = { width: innerWidth, height: innerHeight };
  await page.viewport(1440, 900);
  host = document.createElement("div");
  host.style.width = "1000px";
  host.style.height = "400px";
  host.style.background = "var(--background)";
  if (scheme === "dark") host.className = "dark";
  else host.style.setProperty("--background", "#f8f8fc");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
}

function edges(rule: string) {
  return findDesignIssues({}).filter((issue) =>
    issue.rule === rule && host!.querySelector(`[data-ouro-check-ref~="${issue.ref}"]`));
}

it.each(["light", "dark"] as const)("keeps a scrolling sidebar distinct from the surrounding surface in %s", async (scheme) => {
  await render(
    <Sidebar
      label="Topics"
      collapsible={false}
      header="Browse"
      footer="Account"
      sections={[{ items: Array.from({ length: 30 }, (_, index) => ({ label: `Topic ${index + 1}`, href: `#topic-${index + 1}` })) }]}
    />,
    scheme,
  );
  const scroller = host!.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]")!;
  expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
  scroller.scrollTop = 13;
  expect(edges("cut-off-edge")).toEqual([]);
});

for (const [name, Demo] of [["layout", ThreadLayoutDemo], ["rail", ThreadRailDemo]] as const) {
  it.each(["light", "dark"] as const)(`separates the thread ${name} demo's panes without a line in %s`, async (scheme) => {
    await render(<Demo />, scheme);
    expect(edges("pane-edge")).toEqual([]);
  });
}
