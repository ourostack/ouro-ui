import { expect, test } from "@playwright/test";
import { siteReady } from "./ready";

test("a page that cannot hydrate fails its ready wait with why: hydrateRoot never ran, and the scripts that failed", async ({ page }) => {
  await page.route("**/assets/*.js", (route) => route.abort("connectionfailed"));
  await page.goto("./docs/");
  const failure = await siteReady(page, { timeout: 1_000 }).then(
    () => "ready",
    (error: Error) => error.message,
  );
  expect(failure).toContain("Why the page is not ready (ourostack/ouro-ui#679):");
  expect(failure).toContain("/docs/: document complete; hydrateRoot has not run");
  expect(failure).toMatch(/failed request: \S+\/assets\/\S+\.js \(/);
});
