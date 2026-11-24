// Screenshots of each nav mockup, closed and open, on a laptop and a phone: node site/nav-lab/shots.mjs <base url> <out folder>
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [base, out = ".tmp/nav-shots"] = process.argv.slice(2);
if (!base) throw new Error("Usage: node site/nav-lab/shots.mjs <base url> [out folder]");
await mkdir(out, { recursive: true });

const sizes = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch();
const shoot = async (name, url, size, scheme) => {
  const context = await browser.newContext({ ...sizes[size], colorScheme: scheme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
  if (errors.length) console.log(`${name}: ${errors.join(" | ")}`);
};
await shoot("index-phone", `${base}`, "phone", "light");
for (const id of ["a", "b", "c", "d", "e"]) {
  for (const size of ["desktop", "phone"]) {
    await shoot(`${id}-${size}-closed`, `${base}?m=${id}#/apple/ax/`, size, "light");
    await shoot(`${id}-${size}-open`, `${base}?m=${id}&open=1#/apple/ax/`, size, "light");
  }
  await shoot(`${id}-desktop-open-dark`, `${base}?m=${id}&open=1#/windows/`, "desktop", "dark");
}
await browser.close();
