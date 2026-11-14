import { describe, expect, it, vi } from "vitest";
import { registerSquirclePolyfill } from "@/registry/ouro/lib/ouro/squircle-polyfill";

const registerHyperellipse = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("hyperellipse", () => ({ registerHyperellipse }));

describe("registerSquirclePolyfill", () => {
  it("loads and registers the polyfill only when called", async () => {
    expect(registerHyperellipse).not.toHaveBeenCalled();
    await registerSquirclePolyfill();
    expect(registerHyperellipse).toHaveBeenCalledTimes(1);
  });

  it("keeps the polyfill's own colour transitions from marking corners dirty", async () => {
    await registerSquirclePolyfill();
    const seen = vi.fn();
    document.addEventListener("transitionrun", seen);
    const make = (propertyName: string) => {
      const event = new Event("transitionrun", { bubbles: true });
      Object.assign(event, { propertyName });
      document.body.dispatchEvent(event);
    };
    make("border-top-color");
    make("box-shadow");
    make("width");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
