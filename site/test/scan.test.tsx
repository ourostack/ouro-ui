import axe from "axe-core";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanupPage, renderPage, scan } from "./render";

// A page scan must not start while the page still changes: on a phone the Navbar builds its menu's
// sheet once the page is idle, which adds a heading, and axe cannot place a heading added mid-scan
// (heading-order: "Unable to determine previous heading", #3282).

beforeAll(async () => {
  await import("../src/docs/call-demo");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await cleanupPage();
});

it("starts axe only once the phone menu's sheet is built, so no heading arrives mid-scan", async () => {
  // As in Safari, which has no idle callback: the Navbar then builds the sheet half a second in, long after a scan would start.
  vi.stubGlobal("requestIdleCallback", undefined);
  await renderPage("/docs/call-demo/");
  const menu = document.querySelector<HTMLElement>("[data-ouro-navbar-menu]");
  // The site's tests run at a phone's width, where the menu button shows.
  expect(menu?.getClientRects().length).toBeGreaterThan(0);
  const sheetAtScan: boolean[] = [];
  const run = axe.run.bind(axe);
  vi.spyOn(axe, "run").mockImplementation(((...args: Parameters<typeof axe.run>) => {
    sheetAtScan.push(document.querySelector('[data-ouro="sheet"]') !== null);
    return run(...args);
  }) as typeof axe.run);
  await scan();
  expect(sheetAtScan.length).toBeGreaterThan(0);
  expect(sheetAtScan).not.toContain(false);
}, 30_000);
