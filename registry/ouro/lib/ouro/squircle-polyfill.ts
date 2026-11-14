export { registerSquirclePolyfill };

/**
 * Draws squircle corners in engines without native `corner-shape`, which round the corner instead until this runs.
 * Call it once on the client, for example from your entry file. It is opt-in because the polyfill measures and masks
 * the corners and can slow typing and scrolling; an app that skips it keeps round corners there and adds the
 * `hyperellipse` package only when it installs this helper. It does nothing where `corner-shape` is native.
 *
 * @example
 * ```ts
 * import { registerSquirclePolyfill } from "@/lib/ouro/squircle-polyfill";
 * registerSquirclePolyfill();
 * ```
 * @group App setup
 */
function registerSquirclePolyfill(): Promise<void> {
  return import("hyperellipse").then((polyfill) => void polyfill.registerHyperellipse());
}
