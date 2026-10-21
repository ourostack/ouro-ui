import { expect, test, type Page } from "@playwright/test";
import { agentExamples } from "../src/agents/examples";
import generated from "../src/generated/agent-messages.json";
import { AGENTS, AGENTS_CONTROLS, FILED, SPECIES } from "../src/voyage/agents/copy";
import { INSTALL_COMMAND } from "../src/voyage/hero";
import { openChapter, operable } from "./chapters";

// "Built for agents too" against the production build (site-design.md §5): each control in
// AGENTS_CONTROLS has a test named "control: <id>" that operates it and asserts what it visibly
// changes (site/scripts/stage-census.test.mjs fails when one is missing), and every operable
// element in the section is one of them.

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
      const real = generated[example.id as keyof typeof generated];
      await section(page).getByRole("tab", { name: SPECIES[example.id]!.tab }).click();
      const panel = section(page).getByRole("tabpanel");
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
  });

  test("control: install copies the install line, as the hero shows it", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium's to grant");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    const block = section(page).locator("[data-chapter-control='install']");
    await expect(block).toContainText(INSTALL_COMMAND);
    await block.getByRole("button").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(INSTALL_COMMAND);
  });
});

test("every operable element in Built for agents too is one of its listed controls, in page order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const found = await operable(page, "agents");
  expect(found.loose).toEqual([]);
  expect(found.order).toEqual([...AGENTS_CONTROLS]);
});
