import { lazy, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { cleanupPage, describeViolations, pageScanTimeout, renderFixture, renderPage, rerenderFixture, scan, setScheme, settle } from "../test/render";
import { demos } from "./docs/demos";
import { LiveDemo } from "./components/live-demo";

const examples = ["Form", "Sheet", "Menu", "Swipe actions", "Table"];
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

describe("live catalog", () => {
  it("starts with five independently closed examples and persistent named controls and regions", async () => {
    await renderPage("/");
    for (const name of examples) {
      const opener = page.getByRole("button", { name: `Show ${name} example`, exact: true });
      await expect.element(opener).toBeVisible();
      expect(opener.element().getAttribute("aria-expanded")).toBe("false");
      const region = document.getElementById(opener.element().getAttribute("aria-controls")!);
      expect(region).not.toBeNull();
      expect(region!.getAttribute("aria-label")).toBe(`${name} example`);
      expect(region!.childElementCount).toBe(0);
    }
    expect(document.querySelector("[data-site-demo]")).toBeNull();
  });

  it("opens only the selected example, keeps focus on its control, and can hide and reopen it", async () => {
    await renderPage("/");
    const opener = page.getByRole("button", { name: "Show Form example", exact: true });
    const control = opener.element();
    await userEvent.click(opener);
    await expect.element(page.getByRole("textbox", { name: "Recipe name", exact: true })).toBeVisible();
    expect(document.activeElement).toBe(control);
    expect(document.querySelectorAll("[data-site-demo]").length).toBe(1);
    const hide = page.getByRole("button", { name: "Hide Form example", exact: true });
    await userEvent.click(hide);
    expect(document.querySelector("[data-site-demo]")).toBeNull();
    expect(document.activeElement).toBe(control);
    await userEvent.click(opener);
    await expect.element(page.getByRole("textbox", { name: "Recipe name", exact: true })).toHaveValue("Pasta");
  });

  it("does not reopen or steal focus when a hidden import resolves, and reuses it on reopen", async () => {
    let resolve!: (module: { default: () => React.JSX.Element }) => void;
    demos["form"] = lazy(() => new Promise((done) => { resolve = done; }));
    await renderPage("/");
    const control = page.getByRole("button", { name: "Show Form example", exact: true }).element();
    await userEvent.click(control);
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading Form example...");
    expect(document.activeElement).toBe(control);
    await userEvent.click(control);
    await act(() => resolve({ default: () => <button>Resolved form fixture</button> }));
    expect(document.querySelector("[data-site-demo]")).toBeNull();
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(control);
    await userEvent.click(control);
    await expect.element(page.getByRole("button", { name: "Resolved form fixture" })).toBeVisible();
    expect(document.activeElement).toBe(control);
  });

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

  it("returns normal Sheet dismissal focus to its inner trigger, not the gallery control", async () => {
    await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: "Show Sheet example", exact: true }));
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

  it("restores owned portal focus on controlled teardown without requiring a click through an inert modal", async () => {
    await renderPage("/");
    const control = page.getByRole("button", { name: "Show Sheet example", exact: true }).element();
    if (!(control instanceof HTMLButtonElement)) throw new Error("Gallery control must be a button");
    await userEvent.click(control);
    await userEvent.click(page.getByRole("button", { name: "Save to cookbook", exact: true }));
    const summer = page.getByRole("button", { name: "Summer", exact: true }).element();
    summer.focus();
    expect(document.activeElement).toBe(summer);
    await act(() => control.click());
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(control);
  });

  it("supports local list deletion and Undo, and hide/reopen retains no old action or portal", async () => {
    await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: "Show Swipe actions example", exact: true }));
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
    await userEvent.click(page.getByRole("button", { name: "Actions for Shakshuka", exact: true }));
    await userEvent.click(page.getByRole("menuitem", { name: "Delete", exact: true }));
    await expect.element(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Hide Swipe actions example", exact: true }));
    expect(document.querySelector('[data-ouro="toaster"]')).toBeNull();
    expect(page.getByRole("button", { name: "Undo", exact: true }).query()).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Show Swipe actions example", exact: true }));
    await expect.element(page.getByRole("button", { name: "Actions for Shakshuka", exact: true })).toBeVisible();
    expect(page.getByRole("button", { name: "Undo", exact: true }).query()).toBeNull();
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
    await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: "Show Form example", exact: true }));
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
    await renderPage("/");
    await userEvent.click(page.getByRole("button", { name: "Show Menu example", exact: true }));
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
    await userEvent.click(page.getByRole("button", { name: "Show Table example", exact: true }));
    await expect.element(page.getByRole("table", { name: "Recipes", exact: true })).toBeVisible();
    expect(page.getByRole("row").elements()).toHaveLength(4);
    expect(page.getByRole("link", { name: "Braised short ribs", exact: false }).element().getAttribute("href")).toBe("#short-ribs");
  });
});

describe.each([390, 1280])("expanded gallery at %i px", (width) => {
  it.each(["light", "dark"] as const)("has no overflow or axe violations in %s with simultaneous resolved examples", async (scheme) => {
    await page.viewport(width, 896);
    setScheme(scheme);
    await renderPage("/");
    for (const name of examples) {
      await userEvent.click(page.getByRole("button", { name: `Show ${name} example`, exact: true }));
    }
    await expect.poll(() => [...document.querySelectorAll("[data-site-demo]")].filter((node) => node.childElementCount > 0).length).toBe(5);
    expect(document.querySelector("[data-site-demo-loading]")).toBeNull();
    await settle();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
    await userEvent.click(page.getByRole("button", { name: "Save to cookbook", exact: true }));
    await expect.element(page.getByRole("dialog", { name: "Save to cookbook", exact: true })).toBeVisible();
    await settle();
    const modalViolations = await scan();
    expect(modalViolations, describeViolations(modalViolations)).toEqual([]);
    // Two scans of the page, closed and with the dialog open.
  }, 2 * pageScanTimeout);
});
