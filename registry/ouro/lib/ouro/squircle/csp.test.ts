import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerHyperellipse } from "./register";

// A page whose Content Security Policy refuses inline styles (`style-src 'self'`), put in place as a
// <meta> before the polyfill runs; Chromium, WebKit and Firefox enforce it from then on. The polyfill
// must draw its squircles with no <style> element and no refusal: its stylesheets are constructed and
// adopted, and the element's own styles are set from script.

const refused: string[] = [];
const added: string[] = [];
// The test runner's own stylesheet (Vite's, marked data-vite-dev-id) is the harness, not the polyfill.
const harness = (node: unknown) => node instanceof Element && node.hasAttribute("data-vite-dev-id");

beforeAll(() => {
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "style-src 'self'";
  document.head.append(policy);
  document.addEventListener("securitypolicyviolation", (event) => {
    if (!harness(event.target)) refused.push(`${event.violatedDirective}: ${event.sample}`);
  });
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) if (node instanceof HTMLStyleElement && !harness(node)) added.push(node.outerHTML.slice(0, 120));
  }).observe(document, { childList: true, subtree: true });
});

const reported = () => new Promise((resolve) => setTimeout(resolve, 0));

let controller: ReturnType<typeof registerHyperellipse> | undefined;
afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  refused.length = 0;
  added.length = 0;
});

describe("under style-src 'self'", () => {
  it("draws the squircle with no <style> element and nothing refused, and takes its stylesheets away when destroyed", async () => {
    const before = document.adoptedStyleSheets.length;
    const box = document.body.appendChild(document.createElement("div"));
    box.style.cssText = "width:80px;height:80px;border-radius:24px;background:red";
    box.style.setProperty("--corner-shape", "squircle");
    controller = registerHyperellipse({ force: true });
    await expect.poll(() => getComputedStyle(box).clipPath).not.toBe("none");
    expect(document.adoptedStyleSheets.length).toBeGreaterThan(before);
    await reported();
    expect(added).toEqual([]);
    expect(refused).toEqual([]);
    controller.destroy();
    controller = undefined;
    expect(document.adoptedStyleSheets).toHaveLength(before);
  });

  it("bridges native corner-shape with no <style> element and nothing refused", async () => {
    const before = document.adoptedStyleSheets.length;
    controller = registerHyperellipse();
    expect(document.adoptedStyleSheets.length).toBeGreaterThan(before);
    await reported();
    expect(added).toEqual([]);
    expect(refused).toEqual([]);
  });
});
