import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import LiveCaptionsDemo from "./live-captions.demo";

// The docs' live demo keeps streaming captions forever for a person watching, but an automated
// browser (the sweeps' states-sweep.ts) screenshots a sibling control on this same page twice in a
// row with no wait between the takes; a line arriving in that gap made the segmented control's
// picture differ (ourostack/ouro-ui#2917). Under navigator.webdriver the demo shows its finished
// transcript once and never ticks, so nothing on the page changes while a sweep takes its pictures.

const roots: Root[] = [];
let mounted: Element[] = [];

function render(): Element {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  return host;
}

function captionsText(host: Element): string {
  return host.querySelector('[data-ouro="live-captions"]')!.textContent ?? "";
}

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
});

describe("LiveCaptionsDemo", () => {
  it("never changes its transcript where navigator.webdriver is true, so a sweep's two takes agree", async () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const host = render();
      await act(async () => roots[0]!.render(<LiveCaptionsDemo />));
      const first = captionsText(host);
      expect(first).not.toBe("");
      await act(async () => vi.advanceTimersByTime(5000));
      expect(captionsText(host)).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps streaming new lines for a person, where navigator.webdriver is false", async () => {
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const host = render();
      await act(async () => roots[0]!.render(<LiveCaptionsDemo />));
      const first = captionsText(host);
      await act(async () => vi.advanceTimersByTime(5000));
      expect(captionsText(host)).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
