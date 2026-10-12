import { commands, page } from "vitest/browser";

/**
 * Resizes the test viewport, as when a phone turns between portrait and landscape, and then
 * sets the page's zoom back to 1. In a phone context (`isMobile`), Chromium can zoom the page
 * when the viewport rotates, and rotating back does not undo it, which moves where later touch
 * input lands. Touch tests rotate with this instead of `page.viewport`; the `ouro-touch`
 * project fails any test that leaves the page zoomed.
 *
 * @example
 * await rotate(844, 390); // landscape
 * afterEach(() => rotate(390, 844));
 */
export async function rotate(width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  await commands.resetPageZoom();
}
