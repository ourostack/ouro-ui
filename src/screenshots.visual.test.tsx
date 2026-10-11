import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupStories, openOverlay, overlayOpeners, renderStory, settle, storyFiles } from "../test/stories.tsx";

// Screenshot baselines (spec §8): light, dark and reduced motion, at 390px and
// 1280px. Runs only in the `visual` project (CI_VISUAL=1), in Chromium on
// Linux, the renderer that produced the committed baselines: the
// `visual-baselines.yml` workflow regenerates them with `--update`. Reads
// dist/styles.css: run `pnpm build` first.

const subjects = [
  // Every tone and variant, in forced light and dark panels side by side.
  { name: "button-variants", Story: storyFiles.Button.TonesAndVariants },
  // Buttons on the page surface, following the emulated color scheme.
  { name: "button-in-context", Story: storyFiles.Button.InContext },
  { name: "text", Story: storyFiles.Text.RecipeCard },
  { name: "sheet-open", Story: storyFiles.Sheet.WithDescription, open: true },
  { name: "dialog-open", Story: storyFiles.Dialog.WithFooter, open: true },
  { name: "confirm-dialog-open", Story: storyFiles.Dialog.Confirm, open: true },
];

const modes = [
  { name: "light", media: { colorScheme: "light", reducedMotion: "no-preference" } },
  { name: "dark", media: { colorScheme: "dark", reducedMotion: "no-preference" } },
  { name: "reduced-motion", media: { colorScheme: "light", reducedMotion: "reduce" } },
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
  await commands.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
});

describe.each(widths)("at $width px", ({ width, height }) => {
  describe.each(modes)("$name", (mode) => {
    it.each(subjects)("$name", async ({ name, Story, open }) => {
      await page.viewport(width, height);
      await commands.emulateMedia(mode.media);
      const host = await renderStory(Story);
      await document.fonts.ready;
      await settle();
      if (open) {
        const [opener] = overlayOpeners(name, host);
        await openOverlay(opener!);
        // Move focus off the opened overlay's first control, so the focus ring
        // (which follows the input type) never decides the image.
        (document.activeElement as HTMLElement | null)?.blur();
        await settle();
      }
      await expect(page).toMatchScreenshot(`${name}-${mode.name}-${width}`, {
        screenshotOptions: { animations: "disabled", caret: "hide" },
        // Text renders in the runner's `system-ui` font, so a weekly image update to
        // fonts or FreeType can shift a few antialiased glyph edges with no code change.
        // 0.1% of the frame (about 330 pixels at 390x844, 1,000 at 1280x800) absorbs
        // that, while a changed color, size, radius or layout moves far more. Bundling
        // a test font would remove the cause; that is a later change.
        comparatorName: "pixelmatch",
        comparatorOptions: { allowedMismatchedPixelRatio: 0.001 },
      });
    });
  });
});
