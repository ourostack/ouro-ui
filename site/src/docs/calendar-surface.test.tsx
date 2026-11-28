import { afterEach, beforeAll, expect, it } from "vitest";
import { page } from "vitest/browser";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { cleanupPage, loadPageCode, renderPage, setScheme } from "../../test/render";

let background: string;

beforeAll(async () => {
  await loadPageCode("/docs/calendar-demo/");
});

afterEach(async () => {
  await cleanupPage();
  if (background) document.documentElement.style.setProperty("--background", background);
  else document.documentElement.style.removeProperty("--background");
  setScheme("light");
  await page.viewport(390, 844);
});

it.each(["light", "dark"] as const)("keeps the calendar's clipped grid distinct from its surround in %s", async (scheme) => {
  await page.viewport(3840, 2160);
  setScheme(scheme);
  background = document.documentElement.style.getPropertyValue("--background");
  if (scheme === "light") document.documentElement.style.setProperty("--background", "#f8f8fc");
  await renderPage("/docs/calendar-demo/");
  const demo = document.querySelector<HTMLElement>("[data-site-calendar-demo]")!;
  demo.scrollIntoView({ block: "start" });
  await expect.poll(() => demo.querySelector('[data-ouro="time-grid"] [data-scroll-viewport]')).not.toBeNull();
  const viewport = demo.querySelector<HTMLElement>('[data-ouro="time-grid"] [data-scroll-viewport]')!;
  expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
  await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0);
  const issues = findDesignIssues({}).filter((issue) =>
    issue.rule === "cut-off-edge" && viewport.matches(`[data-ouro-check-ref~="${issue.ref}"]`));
  expect(issues).toEqual([]);
});
