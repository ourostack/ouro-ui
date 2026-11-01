// PROBE (never merge): what WebKit does with the chapters skipped off screen when a dialog opens.
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ENCOUNTER } from "../src/voyage/chapters/chapter-three-copy";

for (const rule of ["none", "content-visibility: auto; contain-intrinsic-size: auto 2400px;"]) {
  test(`alarm under ${rule}`, async ({ page, browserName }) => {
    mkdirSync("probe-out", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("nautilus/");
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    if (rule !== "none") await page.addStyleTag({ content: `section[data-chapter] { ${rule} }` });
    await page.locator("#chapter-three").scrollIntoViewIfNeeded();
    await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
    await page.waitForTimeout(500);
    const state = () =>
      page.evaluate(() => {
        const html = document.documentElement, body = document.body;
        const chapters = ["chapter-one", "chapter-two", "chapter-three"].map((id) => {
          const el = document.getElementById(id)!;
          const r = el.getBoundingClientRect();
          return `${id} top ${Math.round(r.top)} h ${Math.round(r.height)} shown ${(el as any).checkVisibility?.({ contentVisibilityAuto: true })} inner ${el.querySelector("h2")?.getBoundingClientRect().height}`;
        });
        return {
          dialog: !!document.querySelector('[role="dialog"]'),
          locked: html.hasAttribute("data-base-ui-scroll-locked"),
          htmlStyle: html.getAttribute("style"),
          bodyStyle: body.getAttribute("style"),
          htmlTop: html.scrollTop,
          bodyTop: body.scrollTop,
          scrollY: window.scrollY,
          gutter: CSS.supports("scrollbar-gutter", "stable"),
          inset: window.innerWidth - html.clientWidth,
          active: document.activeElement?.tagName + " " + (document.activeElement?.textContent ?? "").slice(0, 30),
          chapters,
        };
      });
    console.log(`${browserName} ${rule} before: ${JSON.stringify(await state())}`);
    await page.locator("[data-composition='encounter']").getByRole("button", { name: ENCOUNTER.alarm }).click();
    for (const wait of [0, 50, 200, 1000]) {
      await page.waitForTimeout(wait);
      console.log(`${browserName} ${rule} +${wait}: ${JSON.stringify(await state())}`);
    }
    await page.screenshot({ path: `probe-out/${browserName}-${rule === "none" ? "none" : "cv"}.png` });
  });
}
