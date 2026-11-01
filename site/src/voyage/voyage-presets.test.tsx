import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme, settle } from "../../test/render";
import { sliced } from "../../../test/slice";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { PRESET_NAMES, THEME_KEY } from "../themes/prepaint";

// Every preset passes axe on the home page and the Nautilus's page, light and dark, at a phone's
// width and a desktop's, and nothing overflows sideways (site-design.md, slice S1). Each scan covers a
// whole page, the Nautilus's with all three chapters, so this is a sliced suite (test/slice.ts): every
// CI browser shard scans its own slice of the pages and presets. The list runs page by page, so each
// slice holds both pages.

const root = document.documentElement;

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  localStorage.removeItem(THEME_KEY);
  root.removeAttribute("data-theme");
  setScheme("light");
});
afterEach(async () => {
  toast.dismiss();
  await cleanupPage();
  localStorage.removeItem(THEME_KEY);
  root.removeAttribute("data-theme");
  setScheme("light");
});

const scans = sliced(["/", "/nautilus/"].flatMap((path) => PRESET_NAMES.map((name) => ({ name, path }))), "voyage presets");

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("every preset at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });
  describe.each(["light", "dark"] as const)("%s", (scheme) => {
    it.each(scans)("$name has zero axe violations on $path", async ({ name, path }) => {
      root.setAttribute("data-theme", name);
      setScheme(scheme);
      await renderPage(path);
      await settle();
      const violations = await scan();
      expect(violations, describeViolations(violations)).toEqual([]);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    }, pageScanTimeout);
  });
});
