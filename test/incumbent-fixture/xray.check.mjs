import { chromium } from "@playwright/test";

const base = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const outlines = async (path, query = "?xray") => {
  await page.goto(`${base}${path}${query}`);
  await page.locator("[data-ouro-inspector-outline]").first().waitFor({ timeout: 5000 }).catch(() => {});
  return page.locator("[data-ouro-inspector-outline]").count();
};
const moved = await outlines("/billing.html");
const incumbent = await outlines("/");
const controls = await outlines("/", "?xray&controls");
const tags = await page.locator("[data-ouro-inspector-outline] [data-ouro-part=tag]").allTextContents();
const linked = await page.locator("[data-ouro-inspector-outline] a[data-ouro-part=tag]").count();
await browser.close();
console.log(`X-ray with controls on the Mantine page: ${controls} outlines, for example ${JSON.stringify(tags.slice(0, 4))}`);
console.log(`X-ray outlines: ${moved} on the page moved to Ouro HX, ${incumbent} on the page of Mantine's components`);
if (moved < 1) throw new Error("X-ray outlined no Ouro component on the page moved to Ouro HX");
if (incumbent !== 0) throw new Error("X-ray outlined something on the page of the incumbent's components");
if (controls < 1) throw new Error("X-ray with controls outlined none of the Mantine page's own controls");
if (linked !== 0) throw new Error("X-ray linked a control that is no Ouro component to Ouro's docs");
