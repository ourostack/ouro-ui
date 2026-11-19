import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Ouro check's nested-frame rule over a Sidebar whose item's badge is a Badge, where an adopter's check first found a
// frame in a frame (ourostack/ouroboros#1434). Ouro's own theme caps the Badge's corner at half its height, which hides
// a mismatch, so this uses shadcn's stock radius, on a screen wide enough for ouro-base to step the root type up to 125%.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  delete state.__ouroCheckRef;
  document.documentElement.style.fontSize = "";
  document.documentElement.style.removeProperty("--radius");
  await page.viewport(414, 896);
});

it("a Sidebar badge given as a Badge draws one frame, with shadcn's stock radius at a stepped-up root", async () => {
  // Wide enough that the column shows: under 40rem it gives way to a menu button.
  await page.viewport(1280, 800);
  document.documentElement.style.fontSize = "125%";
  document.documentElement.style.setProperty("--radius", "0.625rem");
  host = document.createElement("div");
  host.style.height = "400px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Sidebar label="Main" sections={[{ items: [{ label: "Agent", href: "/agent", badge: <Badge tone="warning">Idle</Badge> }] }]} />));
  expect(host.querySelector("[data-ouro-sidebar-badge]")!.getBoundingClientRect().width).toBeGreaterThan(0);
  expect(findDesignIssues().filter((issue) => issue.rule === "nested-frame")).toEqual([]);
});
