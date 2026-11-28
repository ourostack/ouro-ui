import { expect, test } from "@playwright/test";
import { openStory } from "../../registry/ouro/e2e/ouro/story";

// openStory returns once a story is completed, without waiting for Storybook's accessibility check after it, which is
// the one phase a loaded host can hold for the whole spec.

test("openStory returns while Storybook's after-each phase still runs", async ({ page }) => {
  await page.route("http://localhost:6006/iframe.html*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="storybook-root"><p>story</p></div><script>
        window.__STORYBOOK_PREVIEW__ = { currentRender: { phase: "afterEach" } };
        window.finish = () => { window.__STORYBOOK_PREVIEW__.currentRender.phase = "finished"; };
      </script>`,
    }),
  );
  await openStory(page, "any--story");
  expect(await page.evaluate(() => (window as unknown as { __STORYBOOK_PREVIEW__: { currentRender: { phase: string } } }).__STORYBOOK_PREVIEW__.currentRender.phase)).toBe("afterEach");
});

test("openStory still waits while the story renders or plays", async ({ page }) => {
  await page.route("http://localhost:6006/iframe.html*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="storybook-root"><p>story</p></div><script>
        window.__STORYBOOK_PREVIEW__ = { currentRender: { phase: "playing" } };
        window.finish = () => { window.__STORYBOOK_PREVIEW__.currentRender.phase = "completed"; };
      </script>`,
    }),
  );
  let opened = false;
  const opening = openStory(page, "any--story").then(() => (opened = true));
  await page.waitForFunction(() => "finish" in window);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(opened).toBe(false);
  await page.evaluate(() => (window as unknown as { finish: () => void }).finish());
  await opening;
});
