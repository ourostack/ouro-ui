import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { routes } from "../routes";

beforeAll(async () => {
  await import("./call-demo");
});

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

describe("the call window page", () => {
  it("has a route", () => {
    expect(routes.some((route) => route.path === "/docs/call-demo/")).toBe(true);
  });

  it("shows a tile for each person, and reflows when the count changes", async () => {
    await renderPage("/docs/call-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A call window" })).toBeInTheDocument();
    const tiles = () => document.querySelectorAll('[data-ouro="media-tile"]').length;
    await expect.poll(tiles).toBe(4);
    await page.getByRole("radio", { name: "6" }).click();
    await expect.poll(tiles).toBe(6);
    await page.getByRole("radio", { name: "1" }).click();
    await expect.poll(tiles).toBe(1);
  });

  it("announces a mute once, and who joined", async () => {
    const announced = watchAnnouncements();
    try {
      await renderPage("/docs/call-demo/");
      await page.getByRole("button", { name: "Mute" }).click();
      await expect.poll(() => announced.count("You are muted")).toBe(1);
      await page.getByRole("radio", { name: "5" }).click();
      await expect.poll(() => announced.count("Jonas Ek joined")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("shows the waiting state with art, and moves focus to the call when the app changes the view", async () => {
    await renderPage("/docs/call-demo/");
    await page.getByRole("button", { name: "Leave" }).click();
    await expect.element(page.getByText("You left the call")).toBeVisible();
    await expect.poll(() => document.activeElement?.getAttribute("aria-label")).toBe("Call");
    await page.getByRole("radio", { name: "Alone" }).click();
    const empty = document.querySelector<HTMLElement>('[data-ouro="moment"][data-moment="empty"]')!;
    expect(empty.querySelector("[data-moment-art]")).not.toBeNull();
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/call-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
