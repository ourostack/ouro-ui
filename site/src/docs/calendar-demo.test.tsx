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

  it("shows an empty week from the State switcher", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Empty week" }).click();
      await expect.element(page.getByText("Nothing on this week")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a loading state from the State switcher", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await renderPage("/docs/calendar-demo/");
      await page.getByRole("radio", { name: "Loading" }).click();
      await expect.poll(() => document.querySelector("[data-site-calendar-demo] [aria-busy=true]")).not.toBeNull();
      // Moment's `announce` prop also speaks this title to the shared live region, so a plain
      // text query can match twice; scope to the heading, as Moment's own tests do.
      await expect.element(page.getByRole("heading", { level: 3, name: "Loading your week" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens on one day on a phone and on a work week on a laptop", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await expect.element(page.getByRole("radio", { name: "Day" })).toBeChecked();
    await cleanupPage();
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await expect.element(page.getByRole("radio", { name: /Work week/ })).toBeChecked();
  });

  it("leaves room under the grid on a phone for the Undo toast", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    const root = document.querySelector<HTMLElement>("[data-site-calendar-demo]")!;
    await expect.poll(() => getComputedStyle(root).paddingBottom).toBe("96px");
  });

  it("puts the date heading on its own row above the controls on a phone", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    const heading = document.querySelector<HTMLElement>("[data-site-calendar-demo] h2")!;
    const jump = [...document.querySelectorAll<HTMLElement>("[data-site-calendar-demo] button")].find((b) => b.textContent === "Go to date")!;
    await expect.poll(() => heading.getBoundingClientRect().bottom <= jump.getBoundingClientRect().top).toBe(true);
    expect(Math.round(heading.getBoundingClientRect().width)).toBeGreaterThan(300);
  });

  it("deletes an event from its details and brings it back with Undo", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    const before = eventTitles();
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    await userEvent.click(page.getByRole("button", { name: "Delete" }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await expect.poll(eventTitles).toBe(before - 1);
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.poll(eventTitles).toBe(before);
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in the week view on a phone in %s", async (scheme) => {
    setScheme(scheme);
    await page.viewport(390, 844);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("radio", { name: /Work week/ }).click();
    await expect.element(page.getByRole("radio", { name: /Work week/ })).toBeChecked();
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);

  it("opens an event's details with focus inside them, not on Delete", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    const details = page.getByRole("dialog", { name: /Sprint planning/ });
    await expect.element(details).toBeInTheDocument();
    await expect.poll(() => (document.activeElement as HTMLElement | null)?.textContent).not.toBe("Delete");
    await expect.poll(() => document.activeElement?.closest("[role=dialog]") !== null).toBe(true);
  });

  it("moves focus into the edit dialog after Edit, and back to the event after Cancel", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    page.getByRole("button", { name: "Edit" }).element().focus();
    await userEvent.keyboard("{Enter}");
    const dialog = page.getByRole("dialog", { name: "Edit event" });
    await expect.element(dialog).toBeInTheDocument();
    await expect.poll(() => document.activeElement?.closest("[role=dialog]")?.getAttribute("aria-labelledby")).toBe(dialog.element().getAttribute("aria-labelledby"));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect.element(dialog).not.toBeInTheDocument();
  });

  it("puts focus back in the grid after Delete, so the keyboard does not start over", async () => {
    await page.viewport(1100, 900);
    await renderPage("/docs/calendar-demo/");
    await page.getByRole("button", { name: /Sprint planning/ }).first().click();
    page.getByRole("button", { name: "Delete" }).element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await expect.poll(() => document.activeElement?.closest('[data-ouro="time-grid"]') !== null).toBe(true);
  });

  it("marks Go to date as opening a dialog", async () => {
    await renderPage("/docs/calendar-demo/");
    expect(page.getByRole("button", { name: "Go to date" }).element().getAttribute("aria-haspopup")).toBe("dialog");
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/calendar-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
