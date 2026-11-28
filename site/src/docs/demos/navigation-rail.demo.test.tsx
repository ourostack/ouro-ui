import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import NavigationRailDemo from "./navigation-rail.demo";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let size: { width: number; height: number };
let wasDark: boolean;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.documentElement.classList.toggle("dark", wasDark);
  await page.viewport(size.width, size.height);
});

it.each([
  [390, 844, false],
  [1440, 900, false],
  [1440, 900, true],
])("separates the rail demo's surfaces without an inner frame at %spx by %spx (dark: %s)", async (width, height, dark) => {
  size = { width: innerWidth, height: innerHeight };
  wasDark = document.documentElement.classList.contains("dark");
  await page.viewport(width, height);
  document.documentElement.classList.toggle("dark", dark);
  host = document.createElement("div");
  host.style.width = "100%";
  if (!dark) {
    host.style.setProperty("--background", "#f8f8fc");
    host.style.setProperty("--muted", "#f8f8fc");
    host.style.setProperty("--card", "#fff");
  }
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<NavigationRailDemo />));

  const outer = host.firstElementChild as HTMLElement;
  const inner = outer.children[1] as HTMLElement;
  expect(getComputedStyle(inner).backgroundColor).not.toBe(getComputedStyle(outer).backgroundColor);
  expect(findDesignIssues().filter(({ rule }) => rule === "nested-frame")).toEqual([]);
});
