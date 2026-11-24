import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { routes } from "../routes";

beforeAll(async () => {
  await import("./calendar-demo");
});

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

const eventTitles = () => document.querySelectorAll("[data-site-calendar-demo] [data-ouro='time-grid'] [data-event-id], [data-site-calendar-demo] [data-ouro='time-grid'] button[aria-label*=', ']").length;

describe("the calendar page", () => {
  it("has a route", () => {
    expect(routes.some((route) => route.path === "/docs/calendar-demo/")).toBe(true);
  });

  it("opens a dialog from New event, asks for a title, and puts the event on the grid", async () => {
    await renderPage("/docs/calendar-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A calendar" })).toBeInTheDocument();
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog", { name: "New event" });
    await expect.element(dialog).toBeInTheDocument();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect.element(dialog.getByText("Add a title")).toBeInTheDocument();
    await dialog.getByRole("textbox", { name: /Title/ }).fill("Garden club");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => document.body.textContent).toContain("Garden club");
  });

  it("shows an empty week and a loading state from the State switcher", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await expect.element(page.getByText("Nothing on this week")).toBeInTheDocument();
      await page.getByRole("radio", { name: "Loading" }).click();
      await expect.poll(() => document.querySelector("[data-site-calendar-demo] [aria-busy=true]")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes an event from its details and brings it back with Undo", async () => {
    await renderPage("/docs/calendar-demo/");
    const before = eventTitles();
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    await userEvent.click(page.getByRole("button", { name: "Delete" }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await expect.poll(eventTitles).toBe(before - 1);
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.poll(eventTitles).toBe(before);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/calendar-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
