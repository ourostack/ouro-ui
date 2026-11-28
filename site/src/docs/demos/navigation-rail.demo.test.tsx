import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import NavigationRailDemo from "./navigation-rail.demo";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let size: { width: number; height: number };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  await page.viewport(size.width, size.height);
});

it.each(["light", "dark"] as const)("separates the navigation rail from its content without a border in %s", async (scheme) => {
  size = { width: innerWidth, height: innerHeight };
  await page.viewport(3840, 2160);
  host = document.createElement("div");
  if (scheme === "dark") host.className = "dark";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<NavigationRailDemo />));
  const rail = host.querySelector<HTMLElement>('[data-ouro="navigation-rail"]')!;
  const content = rail.nextElementSibling as HTMLElement;
  expect(parseFloat(getComputedStyle(content).borderInlineStartWidth)).toBe(0);
  expect(getComputedStyle(content).backgroundColor).not.toBe(getComputedStyle(content.parentElement!).backgroundColor);
});
