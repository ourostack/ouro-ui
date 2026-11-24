// Checks the disclosure bar behaves as the brief says, on mockup A (the bar B uses too): node site/nav-lab/behaviour.mjs <base url>
import { chromium } from "@playwright/test";

const [base] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${base}?m=a#/`, { waitUntil: "networkidle" });
const hx = page.getByRole("button", { name: "Ouro HX" });
const ax = page.getByRole("button", { name: "Ouro AX" });
const expanded = async (button) => (await button.getAttribute("aria-expanded")) === "true";
const results = [];
const check = (name, ok) => results.push(`${ok ? "pass" : "FAIL"}: ${name}`);

await hx.click();
check("a click opens the panel at once", await expanded(hx));
check("the panel is a list of links, no menu roles", (await page.locator('[role="menu"], [role="menubar"], [role="menuitem"]').count()) === 0);
await page.keyboard.press("Escape");
check("Escape closes it", !(await expanded(hx)));
check("Escape puts focus back on its button", await hx.evaluate((el) => el === document.activeElement));

await page.keyboard.press("Enter");
check("Enter on the focused button opens it", await expanded(hx));
for (let i = 0; i < 40 && (await expanded(hx)); i++) await page.keyboard.press("Tab");
check("tabbing out of the nav closes it", !(await expanded(hx)));

await page.mouse.move(5, 500);
await page.waitForTimeout(700);
const box = await hx.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(250);
check("a pointer resting 0.25 s has not opened it", !(await expanded(hx)));
await page.waitForTimeout(400);
check("a pointer resting 0.65 s has opened it", await expanded(hx));
const next = await ax.boundingBox();
await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, { steps: 4 });
await page.waitForTimeout(80);
check("once one is open, the next opens on hover at once", await expanded(ax));
await page.mouse.move(box.x, 880, { steps: 4 });
await page.waitForTimeout(250);
check("0.25 s after leaving, it is still open", await expanded(ax));
await page.waitForTimeout(500);
check("0.75 s after leaving, it has closed", !(await expanded(ax)));

await hx.click();
await page.mouse.click(700, 800);
check("a press outside closes it", !(await expanded(hx)));

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await phone.goto(`${base}?m=a#/`, { waitUntil: "networkidle" });
const sizes = await phone.evaluate(() =>
  [...document.querySelectorAll("header button, header a, .sticky button, .sticky a")]
    .filter((el) => el.checkVisibility())
    .map((el) => [el.textContent.trim() || el.getAttribute("aria-label"), Math.round(el.getBoundingClientRect().height)]),
);
check(`every control in the phone's bar is at least 44px tall (${JSON.stringify(sizes)})`, sizes.every(([, h]) => h >= 44));
check("search shows on the phone's bar", await phone.getByRole("button", { name: "Search" }).isVisible());

console.log(results.join("\n"));
await browser.close();
if (results.some((line) => line.startsWith("FAIL"))) process.exitCode = 1;
