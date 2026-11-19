import { chromium } from "@playwright/test";
import { URL } from "node:url";
import { readFileSync } from "node:fs";

const base = process.argv[2];
const tools = JSON.parse(readFileSync(new URL("./src/generated/mcp.json", import.meta.url), "utf8"));
const names = (Array.isArray(tools) ? tools : tools.tools).map((t) => t.name);
if (names.length !== 2) throw new Error(`the MCP door lists ${names.length} tools, not the 2 actions declared`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [path, what] of [["/billing.html", "Ouro HX's Button"], ["/", "Mantine's Button"]]) {
  await page.goto(`${base}${path}`);
  for (const action of ["list-invoices", "pay-invoice"]) {
    const found = await page.locator(`[data-ax-action="${action}"]`).count();
    // list-invoices is read-only and has no screen control; only pay-invoice is drawn.
    if (action === "pay-invoice" && found !== 1) throw new Error(`${path}: ${what} carries ${found} pay-invoice controls, not 1`);
  }
  const control = page.locator('[data-ax-action="pay-invoice"]');
  const role = await control.evaluate((el) => el.tagName);
  if (role !== "BUTTON") throw new Error(`${path}: the pay-invoice control is a ${role}, not a button`);
  await control.click();
  await page.getByRole("status").filter({ hasText: "Paid inv-1." }).waitFor({ timeout: 5000 });
  console.log(`${path}: ${what} took the action: ${await page.getByRole("status").innerText()}`);
}
await browser.close();
