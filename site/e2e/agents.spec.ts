import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { agentExamples } from "../src/agents/examples";
import { AGENTS, AGENTS_CONTROLS, FILED, SPECIES } from "../src/voyage/agents/copy";
import { holdClock } from "../../registry/ouro/e2e/ouro/story";
import { openChapter, operable } from "./chapters";

// "Built for agents too" against the production build (site-design.md §5): each control in
// AGENTS_CONTROLS has a test named "control: <id>" that operates it and asserts what it visibly
// changes (site/scripts/stage-census.test.mjs fails when one is missing), and every operable
// element in the section is one of them.

/** The messages site/scripts/agent-messages.mts generated, as the section shows them. */
const generated = JSON.parse(readFileSync(resolve("site/src/generated/agent-messages.json"), "utf8")) as Record<string, { error: string; source: { file: string } }>;

const open = (page: Page) => openChapter(page, "agents");
const section = (page: Page) => page.locator("#agents");

test.describe("each control in Built for agents too", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("control: mistakes shows each generated example, filed by Conseil, with the type check, the source and the console", async ({ page }) => {
    await open(page);
    for (const example of agentExamples) {
      const real = generated[example.id]!;
      const tab = section(page).getByRole("tab", { name: SPECIES[example.id]!.tab });
      await tab.click();
      // The tab's own panel (the one it leaves fades out beside it for a moment).
      const panel = page.locator(`[id="${await tab.getAttribute("aria-controls")}"]`);
      await expect(panel).toContainText(FILED(SPECIES[example.id]!.family, example.prop));
      await expect(panel.locator("[data-agents-error]")).toHaveText(real.error);
      await expect(panel.locator("[data-agents-console]")).toHaveText(example.devMessage);
      await expect(panel).toContainText(real.source.file);
    }
    // The arrow keys move between the tabs.
    await section(page).getByRole("tab", { name: SPECIES[agentExamples[0]!.id]!.tab }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(section(page).getByRole("tab", { name: SPECIES[agentExamples[1]!.id]!.tab })).toHaveAttribute("aria-selected", "true");
  });

  test("control: llms leads to llms.txt, which agents read", async ({ page }) => {
    await open(page);
    const link = section(page).getByRole("link", { name: AGENTS.llms });
    await expect(link).toHaveAttribute("href", /\/ouro-ui\/llms\.txt$/);
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toMatch(/^# Ouro HX/);
    await link.click();
    await expect(page).toHaveURL(/\/llms\.txt$/);
  });

  test("control: manifest leads to the registry on GitHub, in a new tab", async ({ page }) => {
    await open(page);
    const link = section(page).getByRole("link", { name: new RegExp(AGENTS.manifest) });
    await expect(link).toHaveAttribute("href", "https://github.com/ourostack/ouro-ui/blob/main/registry.json");
    await expect(link).toHaveAttribute("target", "_blank");
    // Clicked, it opens the registry in a new tab (served here from a recording, so the test needs no network).
    await page.context().route("https://github.com/ourostack/ouro-ui/blob/main/registry.json", (route) => route.fulfill({ contentType: "text/html", body: "<title>ouro-ui/registry.json at main</title>" }));
    const [tab] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://github.com/ourostack/ouro-ui/blob/main/registry.json");
    await expect(tab).toHaveTitle(/registry\.json/);
    await tab.close();
  });

  test("control: install copies the install line, as the hero shows it", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium's to grant");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install();
    await open(page);
    const command = (await page.locator("[data-site-install]").textContent())!.trim();
    expect(command).toMatch(/^npx shadcn@latest add ourostack\/ouro-ui\//);
    const block = section(page).locator("[data-chapter-control='install']");
    await expect(block).toContainText(command);
    const copy = block.getByRole("button", { name: "Copy" });
    // The page's clock stands still from here, so "Copied" cannot run out between the click and the check.
    await holdClock(page);
    await copy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
    // The button says so: a tick, and "Copied" as its name, then Copy again once its time is up.
    await expect(block.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(block.locator("[data-ouro='copy-button']")).toHaveAttribute("data-status", "copied");
    await page.clock.runFor(5000);
    await expect(block.getByRole("button", { name: "Copy" })).toBeVisible();
  });
});

test("every operable element in Built for agents too is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const found = await operable(page, "agents");
  expect(found.loose).toEqual([]);
  expect(found.order).toEqual([...AGENTS_CONTROLS]);
});
