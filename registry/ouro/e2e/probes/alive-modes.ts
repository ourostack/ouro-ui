import type { Page } from "@playwright/test";

export const modes = ["breathe", "delayed-breathe", "region-line"] as const;
export type Mode = (typeof modes)[number];

const breathe = (delay: string) =>
  `@keyframes alive-breathe{0%,100%{opacity:1}50%{opacity:.55}}[data-ouro="skeleton"]{animation:alive-breathe 2.4s ease-in-out ${delay} infinite}@media (prefers-reduced-motion:reduce){[data-ouro="skeleton"]{animation:none}}`;

const line =
  `@keyframes alive-fade{from{opacity:0}to{opacity:1}}@keyframes alive-run{from{translate:-100% 0}to{translate:250% 0}}` +
  `#alive-line{position:sticky;top:0;z-index:2;height:3px;overflow:hidden;background:var(--muted);animation:alive-fade .4s ease 1s both}` +
  `#alive-line::before{content:"";display:block;width:40%;height:100%;background:var(--primary,currentColor);animation:alive-run 1.4s ease-in-out infinite}` +
  `@media (prefers-reduced-motion:reduce){#alive-line::before{animation:none;width:100%;opacity:.5}}`;

/** Puts one prototype over the still story. */
export async function applyMode(page: Page, mode: Mode | "control"): Promise<void> {
  if (mode === "control") return;
  if (mode === "breathe") await page.addStyleTag({ content: breathe("0s") });
  if (mode === "delayed-breathe") await page.addStyleTag({ content: breathe("1s") });
  if (mode === "region-line") {
    await page.addStyleTag({ content: line });
    await page.evaluate(() => {
      const scroller = document.querySelector('[aria-label="Long scroller"]')!;
      const bar = document.createElement("div");
      bar.id = "alive-line";
      bar.setAttribute("aria-hidden", "true");
      scroller.prepend(bar);
    });
  }
}
