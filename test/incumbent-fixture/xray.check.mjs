import { chromium } from "@playwright/test";

const base = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const outlines = async (path) => {
  await page.goto(`${base}${path}?xray`);
  await page.locator("[data-ouro-inspector-outline]").first().waitFor({ timeout: 5000 }).catch(() => {});
  return page.locator("[data-ouro-inspector-outline]").count();
};
const moved = await outlines("/billing.html");
const incumbent = await outlines("/");
await browser.close();
console.log(`X-ray outlines: ${moved} on the page moved to Ouro HX, ${incumbent} on the page of Mantine's components`);
if (moved < 1) throw new Error("X-ray outlined no Ouro component on the page moved to Ouro HX");
if (incumbent !== 0) throw new Error("X-ray outlined something on the page of the incumbent's components");
