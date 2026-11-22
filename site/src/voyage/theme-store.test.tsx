import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useLiveClock } from "./theme-store";

// Live is the home page's default theme, and useLiveClock's minute timer repaints its sky CSS variables for as
// long as it is on. The sweep that screenshots a page twice in a row (states-sweep.ts) ran long enough for that
// timer to fire between a retake's two takes and catch an unrelated control's picture differ on the home page
// (ourostack/ouro-ui#2966, the same pattern #2917 fixed for the live-captions demo). Under navigator.webdriver
// the timer never starts, so nothing on the page repaints on its own while a sweep takes its pictures.

function Host({ live }: { live: boolean }) {
  useLiveClock(live);
  return null;
}

const roots: Root[] = [];
let mounted: Element[] = [];

function render(live: boolean): void {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  root.render(<Host live={live} />);
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
});

describe("useLiveClock", () => {
  it("never schedules the minute tick where navigator.webdriver is true, so a sweep's two takes agree", async () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(true));
      expect(interval).not.toHaveBeenCalled();
    } finally {
      interval.mockRestore();
    }
  });

  it("schedules the minute tick for a person, where navigator.webdriver is false", async () => {
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(true));
      expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    } finally {
      interval.mockRestore();
    }
  });

  it("schedules no tick where live is false, whether or not navigator.webdriver is set", async () => {
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(false));
      expect(interval).not.toHaveBeenCalled();
    } finally {
      interval.mockRestore();
    }
  });
});
