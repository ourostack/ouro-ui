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
const shoot = async (name, url, size, scheme, act) => {
  const context = await browser.newContext({ ...sizes[size], colorScheme: scheme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (act) await act(page);
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
// The family bar, four ways, on Compass.
const scroll = (to) => async (page) => {
  await page.mouse.wheel(0, to);
  await page.waitForTimeout(700);
};
for (const f of ["strip", "switcher", "slim", "footer"]) {
  for (const size of ["desktop", "phone"]) await shoot(`family-${f}-${size}`, `${base}?m=b&f=${f}#/`, size, "light");
}
for (const size of ["desktop", "phone"]) {
  await shoot(`family-switcher-${size}-open`, `${base}?m=b&f=switcher#/`, size, "light", async (page) => {
    await page.getByRole("button", { name: "Ouro family" }).click();
    await page.waitForTimeout(700);
  });
}
await shoot("family-slim-desktop-scrolled-down", `${base}?m=b&f=slim#/`, "desktop", "light", scroll(700));
await shoot("family-slim-desktop-scrolled-back-up", `${base}?m=b&f=slim#/`, "desktop", "light", async (page) => {
  await scroll(900)(page);
  await scroll(-200)(page);
});
for (const size of ["desktop", "phone"]) await shoot(`family-footer-${size}-bottom`, `${base}?m=b&f=footer#/`, size, "light", scroll(20000));
await shoot("family-footer-phone-menu", `${base}?m=b&f=footer#/`, "phone", "light", async (page) => {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("dialog").locator("[data-lab-panel]").evaluate((el) => el.closest("[data-ouro=sheet] *:not([data-lab-panel])") && el.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(400);
});
await browser.close();
