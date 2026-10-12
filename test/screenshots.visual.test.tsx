import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupStories, openOverlay, overlayOpeners, renderStory, setScheme, settle, stories } from "./stories.tsx";

// Screenshot baselines (spec §8): light, dark and reduced motion, at 390px and
// 1280px. Runs only in the `visual` project (CI_VISUAL=1), in Chromium on
// Linux, the renderer that produced the committed baselines: the
// `visual-baselines.yml` workflow regenerates them with `--update`. Dark is
// shadcn's `.dark` class on <html>.

// Each subject is a story whose parameters name it (`parameters: { screenshot: { name, open } }`, see
// test/stories.tsx), so a component adds its screenshots in its own story file.
const subjects = stories.flatMap(({ id, Story, parameters }) =>
  parameters.screenshot ? [{ name: parameters.screenshot.name, id, Story, open: parameters.screenshot.open ?? false }] : [],
);

it("names each screenshot subject once", () => {
  expect(subjects.length).toBeGreaterThan(0);
  expect(new Set(subjects.map((subject) => subject.name)).size).toBe(subjects.length);
});

const modes = [
  { name: "light", scheme: "light", reducedMotion: "no-preference" },
  { name: "dark", scheme: "dark", reducedMotion: "no-preference" },
  { name: "reduced-motion", scheme: "light", reducedMotion: "reduce" },
] as const;

const widths = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

let style: HTMLStyleElement;
beforeEach(() => {
  // A stable frame: no caret blink, no scrollbars, and the page fills the viewport.
  style = document.createElement("style");
  style.textContent = "html, body { margin: 0; min-height: 100vh; scrollbar-width: none; caret-color: transparent; }";
  document.head.append(style);
});
afterEach(async () => {
  await cleanupStories();
  style.remove();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe.each(widths)("at $width px", ({ width, height }) => {
  describe.each(modes)("$name", (mode) => {
    it.each(subjects)("$name", async ({ name, id, Story, open }) => {
      await page.viewport(width, height);
      await commands.emulateMedia({ reducedMotion: mode.reducedMotion });
      setScheme(mode.scheme);
      const host = await renderStory(Story);
      await document.fonts.ready;
      await settle();
      if (open) {
        const [opener] = overlayOpeners(id, host);
        await openOverlay(opener!);
        // Move focus off the opened overlay's first control, so the focus ring
        // (which follows the input type) never decides the image.
        (document.activeElement as HTMLElement | null)?.blur();
        await settle();
      }
      await expect(page).toMatchScreenshot(`${name}-${mode.name}-${width}`, {
        screenshotOptions: { animations: "disabled", caret: "hide" },
      });
    });
  });
});
