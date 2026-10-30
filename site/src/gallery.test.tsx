import { lazy, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderFixture, renderPage, rerenderFixture, scan, setScheme, settle } from "../test/render";
import { demos } from "./docs/demos";
import { LiveDemo } from "./components/live-demo";

const originalForm = demos["form"]!;
const extraNodes: HTMLElement[] = [];

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  setScheme("light");
});
afterEach(async () => {
  await cleanupPage();
  demos["form"] = originalForm;
  for (const node of extraNodes.splice(0)) node.remove();
});

// The live demos the docs pages render (LiveDemo), driven on their pages and as fixtures.
describe("live demos", () => {
  it("shows a named failure without losing the surrounding page and resets on a different example", async () => {
    const failures: unknown[] = [];
    await renderFixture(<main><h1>Live example page</h1><LiveDemo name="not-an-item" title="Missing" /></main>, {
      onCaughtError: (error) => failures.push(error),
    });
    await expect.element(page.getByText("Could not load the Missing example.", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Live example page" })).toBeVisible();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
    expect(failures[0]).toMatchObject({ message: 'Unknown live example "not-an-item"' });
    expect(page.getByRole("link").element().getAttribute("href")).toBe("/docs/");
    await rerenderFixture(<main><h1>Live example page</h1><LiveDemo name="form" title="Form" /></main>);
    await expect.element(page.getByRole("textbox", { name: "Recipe name", exact: true })).toBeVisible();
  });

  it("contains a rejected import in its named boundary without turning it into a successful or loading example", async () => {
    const failure = new Error("Form example import rejected");
    const failures: unknown[] = [];
    demos["form"] = lazy(() => Promise.reject(failure));
    await renderFixture(<main><h1>Live example page</h1><LiveDemo name="form" title="Form" /></main>, {
      onCaughtError: (error) => failures.push(error),
    });
    await expect.element(page.getByText("Could not load the Form example.", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Live example page" })).toBeVisible();
    expect(failures).toEqual([failure]);
    expect(document.querySelector("[data-site-demo-loading]")).toBeNull();
    expect(document.querySelector("[data-site-demo]")).toBeNull();
    expect(page.getByRole("link", { name: "Read the Form docs" }).element().getAttribute("href")).toBe("/docs/form/");
    await rerenderFixture(<main><h1>Live example page</h1><LiveDemo name="sheet" title="Sheet" /></main>);
    await expect.element(page.getByRole("button", { name: "Save to cookbook", exact: true })).toBeVisible();
  });

  it("returns normal Sheet dismissal focus to its inner trigger", async () => {
    await renderPage("/docs/sheet/");
    const trigger = page.getByRole("button", { name: "Save to cookbook", exact: true });
    await userEvent.click(trigger);
    await expect.element(page.getByRole("dialog", { name: "Save to cookbook", exact: true })).toBeVisible();
    const summer = page.getByRole("button", { name: "Summer", exact: true });
    await userEvent.click(summer);
    expect(summer.element().getAttribute("aria-pressed")).toBe("true");
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(trigger.element());
  });

  it("supports local list deletion and Undo", async () => {
    await renderPage("/docs/swipe-actions/");
    const actions = page.getByRole("button", { name: "Actions for Shakshuka", exact: true });
    await expect.element(actions).toBeVisible();
    actions.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement?.textContent).toBe("Pin");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => document.activeElement?.textContent).toBe("Delete");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    expect(page.getByRole("button", { name: "Actions for Shakshuka", exact: true }).query()).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Undo", exact: true }));
    await expect.element(page.getByRole("button", { name: "Actions for Shakshuka", exact: true })).toBeVisible();
  });

  it.each(["owned", "deliberately elsewhere"])("restores portal focus only when it is %s on unmount", async (location) => {
    const control = document.createElement("button");
    control.textContent = "Persistent gallery control";
    const elsewhere = document.createElement("button");
    elsewhere.textContent = "Deliberate outside focus";
    document.body.append(control, elsewhere);
    extraNodes.push(control, elsewhere);
    await renderFixture(
      <StrictMode><LiveDemo name="sheet" title="Sheet" returnFocus={{ current: control }} /></StrictMode>,
    );
    await userEvent.click(page.getByRole("button", { name: "Save to cookbook", exact: true }));
    const summer = page.getByRole("button", { name: "Summer", exact: true }).element();
    summer.focus();
    expect(document.activeElement).toBe(summer);
    if (location === "deliberately elsewhere") {
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
      await settle();
      elsewhere.focus();
      expect(document.activeElement).toBe(elsewhere);
    }
    await cleanupPage();
    await expect.poll(() => document.activeElement).toBe(location === "owned" ? control : elsewhere);
  });

  it.each(["owned", "deliberately elsewhere"])("cleans owned Undo and restores toast focus only when it is %s", async (location) => {
    const control = document.createElement("button");
    control.textContent = "Persistent gallery control";
    const elsewhere = document.createElement("button");
    elsewhere.textContent = "Deliberate outside focus";
    document.body.append(control, elsewhere);
    extraNodes.push(control, elsewhere);
    await renderFixture(
      <StrictMode><LiveDemo name="swipe-actions" title="Swipe actions" returnFocus={{ current: control }} /></StrictMode>,
    );
    await userEvent.click(page.getByRole("button", { name: "Actions for Shakshuka", exact: true }));
    await userEvent.click(page.getByRole("menuitem", { name: "Delete", exact: true }));
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect.element(undo).toBeVisible();
    undo.element().focus();
    expect(document.activeElement).toBe(undo.element());
    if (location === "deliberately elsewhere") {
      elsewhere.focus();
      expect(document.activeElement).toBe(elsewhere);
    }
    await cleanupPage();
    expect(document.querySelector('[data-ouro="toaster"]')).toBeNull();
    expect(page.getByRole("button", { name: "Undo", exact: true }).query()).toBeNull();
    await expect.poll(() => document.activeElement).toBe(location === "owned" ? control : elsewhere);
  });

  it("runs native required-field validation and the actual local Pasta rejection", async () => {
    await renderPage("/docs/form/");
    const name = page.getByRole("textbox", { name: "Recipe name", exact: true });
    await expect.element(name).toBeVisible();
    const form = name.element().closest("form")!;
    expect(form.checkValidity()).toBe(false);
    await userEvent.click(page.getByRole("combobox", { name: "Course", exact: true }));
    await userEvent.click(page.getByRole("option", { name: "Main", exact: true }));
    expect(form.checkValidity()).toBe(true);
    await userEvent.click(page.getByRole("button", { name: "Save recipe", exact: true }));
    await expect.element(page.getByText("A recipe called Pasta already exists.", { exact: true })).toBeVisible();
    expect(name.element().getAttribute("aria-invalid")).toBe("true");
  });

  it.each([390, 1280])("operates the real menu/submenu by keyboard and reads table rows and links at %i px", async (width) => {
    await page.viewport(width, 896);
    await renderPage("/docs/menu/");
    const trigger = page.getByRole("button", { name: "Actions", exact: true });
    await expect.element(trigger).toBeVisible();
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menuitem", { name: "Edit", exact: false })).toBeVisible();
    await expect.poll(() => document.activeElement?.textContent).toContain("Edit");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    await expect.element(page.getByRole("menuitem", { name: "Copy link", exact: true })).toBeVisible();
    if (width === 390) {
      await expect.poll(() => document.activeElement?.textContent).toBe("Back");
      await userEvent.keyboard("{ArrowDown}");
    }
    await expect.poll(() => document.activeElement).toBe(page.getByRole("menuitem", { name: "Copy link", exact: true }).element());
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await renderPage("/docs/table/");
    const table = page.getByRole("table", { name: "Recipes", exact: true });
    await expect.element(table).toBeVisible();
    expect(table.getByRole("row").elements()).toHaveLength(4);
    expect(table.getByRole("link", { name: "Braised short ribs", exact: false }).element().getAttribute("href")).toBe("#short-ribs");
  });
});

describe.each([390, 1280])("an open Sheet demo at %i px", (width) => {
  it.each(["light", "dark"] as const)("has no overflow or axe violations in %s", async (scheme) => {
    await page.viewport(width, 896);
    setScheme(scheme);
    await renderPage("/docs/sheet/");
    await userEvent.click(page.getByRole("button", { name: "Save to cookbook", exact: true }));
    await expect.element(page.getByRole("dialog", { name: "Save to cookbook", exact: true })).toBeVisible();
    await settle();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
