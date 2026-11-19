import { expect, test } from "@playwright/test";
import { changedLooks, type Look } from "./looks";
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

test("a page that never settles names the looks that changed between its last two reads, and what changed in each", () => {
  const look = (key: string, sig: string): Look => ({ index: 0, key, sig, pictured: false, size: "", behind: "", attributes: "" });
  const before = [look("button#save", "color: red ; width: 80px"), look("switch", "on"), look("gone", "x")];
  const after = [look("button#save", "color: blue ; width: 80px"), look("switch", "on"), look("new", "y")];
  expect(changedLooks(before, after)).toBe("  button#save: color: blue (was color: red)\n  1 looks appeared and 1 went between the last two reads");
  const many = Array.from({ length: 5 }, (_, n) => look(`l${n}`, "a"));
  expect(changedLooks(many, many.map((l) => ({ ...l, sig: "b" })))).toContain("and 2 more");
  expect(changedLooks(before, before)).toBe("  the last two reads differed only in the order of the looks");
});
