export { registerSquirclePolyfill };

/**
 * Draws squircle corners in engines without native `corner-shape`, which round the corner instead until this runs.
 * Call it once on the client, for example from your entry file: that is the one line an app needs to get squircles
 * in an engine without `corner-shape`, and `<OuroProvider>` does not load it, so apps that install no polyfill carry no
 * engine code. To draw an element of your own as a squircle, give it `data-corner-shape="squircle"` (or set
 * `--corner-shape: squircle` in its style or a class) beside its `border-radius`. Calling it again does nothing. The
 * engine is hyperellipse (MIT), vendored beside this file in `squircle/`. It does nothing where `corner-shape` is native.
 * It adds no `<style>` element: its stylesheets are constructed and adopted by the document, so it works under a
 * Content Security Policy that refuses inline styles (`style-src 'self'`) and beside `<OuroProvider strictCsp>`.
 * @claim "It adds no `<style>` element" registry/ouro/lib/ouro/squircle/csp.test.ts verify:testExists(registry/ouro/lib/ouro/squircle/csp.test.ts::under style-src 'self' > draws the squircle with no <style> element and nothing refused, and takes its stylesheets away when destroyed)
 *
 * @example
 * ```ts
 * import { registerSquirclePolyfill } from "@/lib/ouro/squircle-polyfill";
 * registerSquirclePolyfill();
 * ```
 * @group App setup
 */
function registerSquirclePolyfill(): Promise<void> {
  if (registered) return registered;
  // The polyfill hides border, outline and shadow colours while it draws, and each flush restarts their transitions;
  // their events would mark the corner dirty again and loop. These listeners run first and stop that.
  const ignore = (event: Event) => {
    if (/^(border-.*-color|outline-color|box-shadow)$/.test((event as TransitionEvent).propertyName)) {
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener("transitionrun", ignore, true);
  document.addEventListener("transitionend", ignore, true);
  registered = import("./squircle/register.ts").then((polyfill) => void polyfill.registerHyperellipse());
  return registered;
}

let registered: Promise<void> | undefined;
