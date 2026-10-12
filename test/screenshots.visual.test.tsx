import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupStories, openOverlay, overlayOpeners, renderStory, setScheme, settle, storyFiles } from "./stories.tsx";

// Screenshot baselines (spec §8): light, dark and reduced motion, at 390px and
// 1280px. Runs only in the `visual` project (CI_VISUAL=1), in Chromium on
// Linux, the renderer that produced the committed baselines: the
// `visual-baselines.yml` workflow regenerates them with `--update`. Dark is
// shadcn's `.dark` class on <html>.

const subjects = [
  // Every tone and variant, in forced light and dark panels side by side.
  { name: "button-variants", Story: storyFiles.Button.TonesAndVariants },
  // Buttons on the page background, following the page's scheme.
  { name: "button-in-context", Story: storyFiles.Button.InContext },
  { name: "text", Story: storyFiles.Heading.RecipeCard },
  { name: "sheet-open", Story: storyFiles.Sheet.WithDescription, open: true },
  { name: "dialog-open", Story: storyFiles.Dialog.WithFooter, open: true },
  { name: "confirm-dialog-open", Story: storyFiles.ConfirmDialog.Destructive, open: true },
  { name: "field-states", Story: storyFiles.Field.States },
  { name: "fieldset", Story: storyFiles.Fieldset.Address },
  { name: "link", Story: storyFiles.Link.InContext },
  { name: "text-field-types", Story: storyFiles.TextField.Types },
  { name: "text-field-states", Story: storyFiles.TextField.States },
  { name: "text-field-adornments", Story: storyFiles.TextField.Adornments },
  { name: "text-area-states", Story: storyFiles.TextArea.States },
];

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
    it.each(subjects)("$name", async ({ name, Story, open }) => {
      await page.viewport(width, height);
      await commands.emulateMedia({ reducedMotion: mode.reducedMotion });
      setScheme(mode.scheme);
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
      });
    });
  });
});
